import * as THREE from 'three';
import { GameTime } from '../core/Time';
import { angleDiff, damp } from '../core/MathUtil';
import { rng } from '../core/Rng';
import { writeSave, type Settings } from '../core/Save';
import { InputState } from '../input/InputState';
import { Keyboard } from '../input/Keyboard';
import { GamepadInput } from '../input/Gamepad';
import { TouchUI } from '../input/TouchUI';
import { CameraRig, type ShakeKind } from '../render/CameraRig';
import { Fx } from '../render/Fx';
import type { GameRenderer } from '../render/Renderer';
import { M } from '../render/Materials';
import { audio, type Sfx } from '../platform/Audio';
import { haptic, setHapticsEnabled, type HapticKind } from '../platform/Haptics';
import { buildWorld, type SpawnDef, type WorldDef } from '../world/LevelData';
import type { Interactable, Level } from '../world/Level';
import { Hud } from '../ui/Hud';
import { MenuLayer } from '../ui/Menus';
import { ForgeUI } from '../ui/Forge';
import { addMaterial, computeBuild, type BuildStats, type SaveData } from './Build';
import { GRAFTS, MATERIALS, PERKS, SKELETONS } from './Data';
import { rollDrops } from './Drops';
import { Enemy, type EnemyAttack } from './Enemy';
import { Ghoul } from './enemies/Ghoul';
import { Knight } from './enemies/Knight';
import { Brute } from './enemies/Brute';
import { Hound } from './enemies/Hound';
import { Galahad } from './enemies/Galahad';
import { Lockon } from './Lockon';
import { GraftPickup, LootOrb, Projectile } from './Pickups';
import { Player, type ActiveGraft } from './Player';
import type { HitFeel, PartState } from './Parts';
import type { MoveDef, SkeletonId } from './Types';

export interface GameHooks {
  onPause: () => void;
  onHearth: () => void;
  onTrialDoor: () => void;
  onSign: (text: string) => void;
}

export class Game {
  readonly scene: THREE.Scene;
  readonly time = new GameTime();
  readonly input = new InputState();
  readonly keyboard: Keyboard;
  readonly gamepad: GamepadInput;
  readonly touch: TouchUI;
  readonly cam: CameraRig;
  readonly fx: Fx;
  readonly hud: Hud;
  readonly menus: MenuLayer;
  readonly forge: ForgeUI;
  readonly lock: Lockon;
  world!: WorldDef;
  level!: Level;
  player!: Player;
  enemies: Enemy[] = [];
  pickups: GraftPickup[] = [];
  loot: LootOrb[] = [];
  projectiles: Projectile[] = [];
  build!: BuildStats;
  forceCrit = false;
  running = false;
  private lightPool: THREE.PointLight[] = [];
  private lightTimer = 0;
  private currentZone = '';
  private bossActive: Enemy | null = null;
  private deathTimer = -1;
  private saveTimer = -1;
  private nearInteract: { label: string; run: () => void } | null = null;
  private gateAnim = 0;
  private thornAnim = 0;
  private chestMeshes = new Map<string, THREE.Group>();
  hooks!: GameHooks;
  private fade: HTMLDivElement;

  constructor(
    readonly renderer: GameRenderer,
    readonly uiRoot: HTMLElement,
    public save: SaveData,
    public settings: Settings,
  ) {
    this.scene = renderer.scene;
    this.cam = new CameraRig(renderer.camera);
    this.fx = new Fx(this.scene);
    this.keyboard = new Keyboard(this.input);
    this.gamepad = new GamepadInput(this.input);
    this.touch = new TouchUI(uiRoot, this.input);
    this.hud = new Hud(uiRoot, this);
    this.menus = new MenuLayer(uiRoot);
    this.forge = new ForgeUI(
      this.menus,
      () => this.save,
      () => {
        this.applyBuild();
        this.queueSave(0.1);
      },
      () => this.sfx('ui'),
    );
    this.lock = new Lockon(this);
    this.fade = document.createElement('div');
    this.fade.className = 'fade';
    uiRoot.appendChild(this.fade);
    this.applySettings(settings);

    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xff8a3a, 0, 16, 1.6);
      this.scene.add(l);
      this.lightPool.push(l);
    }
    window.addEventListener('keydown', (e) => {
      if (this.menus.open && this.menus.handleKey(e.code)) e.preventDefault();
    });
  }

  applySettings(s: Settings): void {
    this.settings = s;
    audio.setVolume(s.volume);
    setHapticsEnabled(s.haptics);
    this.touch.sensitivity = s.camSensitivity;
    this.gamepad.sensitivity = s.camSensitivity;
    this.hud.showFps = s.showFps;
  }

  // =========================================================================
  // 初期化・リスポーン
  // =========================================================================

  start(): void {
    this.world = buildWorld();
    this.level = this.world.level;
    this.scene.add(this.level.group);
    this.cam.occluders = this.level.occluders;
    this.player = new Player(this);
    this.applyBuild();
    this.setupInteractables();
    this.applyWorldFlags();
    this.player.flasks = this.save.flasksMax;
    this.player.spawn(this.world.playerStart, Math.PI * 0);
    this.player.facing = 0;
    this.cam.snapBehind(0);
    this.respawnEnemies();
    this.running = true;
    this.hud.zone('炉心の廃教会');
    this.currentZone = '炉心の廃教会';
    this.touch.setHeal(this.player.flasks);
    audio.startAmbience();
  }

  applyBuild(): void {
    this.build = computeBuild(this.save);
    this.player.buildWeapon(this.build.skeleton, this.build.attach === 'fireEdge');
  }

  private setupInteractables(): void {
    for (const it of this.level.interactables) {
      if (it.kind !== 'chest') continue;
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.55, 0.65), M.wood());
      base.position.y = 0.28;
      const lid = new THREE.Group();
      const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.16, 0.65), M.wood());
      lidMesh.position.set(0, 0.08, 0.325);
      lid.add(lidMesh);
      lid.position.set(0, 0.55, -0.325);
      lid.name = 'lid';
      const band = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.08, 0.69), M.iron());
      band.position.y = 0.5;
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc040 }));
      glow.position.y = 0.6;
      glow.name = 'glow';
      g.add(base, lid, band, glow);
      g.position.copy(it.pos);
      g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
      this.scene.add(g);
      this.chestMeshes.set(it.id, g);
    }
  }

  private applyWorldFlags(): void {
    const f = this.save.flags;
    for (const it of this.level.interactables) {
      if (it.kind === 'chest' && f[`chest_${it.id}`]) this.markChestOpen(it);
      if (it.kind === 'gate' && f.gateOpen) {
        it.active = false;
        it.data!.collider.active = false;
        it.object!.position.y = 4.8;
      }
      if (it.kind === 'thorns' && f.thornsBurned) {
        it.active = false;
        it.data!.collider.active = false;
        it.object!.visible = false;
      }
      if (it.kind === 'fog' && f.bossDefeated) this.removeFog(it);
      if (it.kind === 'trialDoor' && this.save.unlocked) this.openTrialDoor(it, true);
    }
  }

  private markChestOpen(it: Interactable): void {
    it.active = false;
    const g = this.chestMeshes.get(it.id);
    if (g) {
      g.getObjectByName('lid')!.rotation.x = -1.9;
      g.getObjectByName('glow')!.visible = false;
    }
  }

  private removeFog(it: Interactable): void {
    it.active = false;
    it.data!.collider.active = false;
    this.world.fogWall.visible = false;
  }

  openTrialDoor(it?: Interactable, instant = false): void {
    const door = it ?? this.level.interactables.find((x) => x.kind === 'trialDoor');
    if (!door) return;
    door.active = false;
    door.data!.collider.active = false;
    if (instant) door.object!.position.y = -16;
    else {
      const o = door.object!;
      const start = performance.now();
      const anim = () => {
        const k = Math.min(1, (performance.now() - start) / 2500);
        o.position.y = -8 - k * 8;
        if (k < 1) requestAnimationFrame(anim);
      };
      anim();
      this.sfx('gate');
      this.cam.addShake('heavy', 0.6);
    }
  }

  spawnEnemy(def: SpawnDef): Enemy {
    let e: Enemy;
    switch (def.type) {
      case 'ghoul':
        e = new Ghoul(this);
        break;
      case 'knight':
        e = new Knight(this);
        break;
      case 'brute':
        e = new Brute(this);
        break;
      case 'hound':
        e = new Hound(this);
        break;
      case 'galahad':
        e = new Galahad(this);
        break;
    }
    e.pos.set(...def.pos);
    e.home.copy(e.pos);
    e.facing = def.facing ?? rng.range(0, Math.PI * 2);
    e.spawnId = def.id;
    this.enemies.push(e);
    this.cam.dynamicOccluders.push(e.group);
    return e;
  }

  respawnEnemies(): void {
    for (const e of this.enemies) e.dispose();
    this.enemies = [];
    this.cam.dynamicOccluders = [];
    for (const p of this.pickups) p.dispose(this.scene);
    this.pickups = [];
    for (const s of this.world.spawns) {
      if (s.type === 'galahad' && this.save.flags.bossDefeated) continue;
      this.spawnEnemy(s);
    }
    this.lock.clear();
    this.bossActive = null;
    this.hud.setBoss(null);
  }

  // =========================================================================
  // メインループ
  // =========================================================================

  update(realDt: number): void {
    realDt = Math.min(realDt, 0.05);
    this.keyboard.update(realDt);
    this.gamepad.update(realDt);
    this.menus.pollPad();
    const menuOpen = this.menus.open;
    this.touch.setVisible(!menuOpen && this.running && this.input.lastDevice === 'touch');
    if (!this.running) return;

    if (!menuOpen) {
      if (this.input.consume('pause')) {
        this.hooks.onPause();
        return;
      }
      if (this.input.consume('lock')) this.lock.toggle();
      if (this.input.consume('partNext')) this.lock.cycle(1);
      if (this.input.consume('partPrev')) this.lock.cycle(-1);
      const [cx, cy] = this.input.takeCamera();
      if (!this.lock.target) this.cam.rotate(cx, cy);
    } else {
      this.input.clearTriggers();
      this.input.takeCamera();
    }

    this.time.paused = menuOpen;
    const dt = this.time.step(realDt);
    if (dt > 0) {
      let rem = dt;
      while (rem > 1e-5) {
        const step = Math.min(rem, 1 / 60);
        this.simulate(step);
        rem -= step;
      }
    }
    this.lock.update();
    if (!this.player.inActive && this.player.state !== 'attack') this.forceCrit = false;

    // 描画系（ヒットストップ中は dt=0 でポーズが止まる）
    this.player.animate(dt);
    for (const e of this.enemies) e.animate(dt, this.time.gameTime);
    const focus = this.player.pos;
    this.cam.update(dt, realDt, focus, this.lock.point());
    this.fx.update(dt, realDt);
    this.renderer.followShadow(focus);
    this.updateLights(realDt);
    this.updateAmbient(dt);
    this.updateInteractPrompt();
    this.hud.update(realDt);
    this.touch.setGraftMode(this.player.graft?.def.name ?? null);
    this.touch.setLock(!!this.lock.target);
    this.touch.setHeal(this.player.flasks);
    this.touch.setCharge(this.player.chargeProgress());

    if (this.deathTimer >= 0) {
      this.deathTimer += realDt;
      if (this.deathTimer > 2.6) this.fade.classList.add('on');
      if (this.deathTimer > 3.6) {
        this.deathTimer = -1;
        this.respawnAtHearth(false);
        this.fade.classList.remove('on');
      }
    }
    if (this.saveTimer >= 0) {
      this.saveTimer -= realDt;
      if (this.saveTimer < 0) void this.persist();
    }
    this.save.playTime += realDt;
  }

  private simulate(dt: number): void {
    const elevTopBefore = this.level.elevator.max.y;
    const dy = this.level.updateElevator(dt);
    if (dy !== 0) {
      const e = this.level.elevator;
      const p = this.player.pos;
      if (p.x > e.min.x - 0.2 && p.x < e.max.x + 0.2 && p.z > e.min.z - 0.2 && p.z < e.max.z + 0.2 && Math.abs(p.y - elevTopBefore) < 0.3) p.y = e.max.y;
    }
    this.player.update(dt);
    for (const e of this.enemies) e.update(dt);
    this.separateEnemies();
    for (const e of this.enemies) if (e.state === 'dead' && e.deadT > 4.5 && !e.removed) e.dispose();
    this.enemies = this.enemies.filter((e) => !e.removed);

    // 部位の落下物
    const ground = (x: number, z: number, y: number) => this.level.groundAt(x, z, y, 0.1);
    for (const p of this.pickups) p.update(dt, ground, this.time.gameTime);
    this.pickups = this.pickups.filter((p) => {
      if (p.taken || p.life <= 0) {
        if (!p.taken) p.dispose(this.scene);
        return false;
      }
      return true;
    });
    for (const o of this.loot) {
      const g = this.level.groundAt(o.pos.x, o.pos.z, o.pos.y + 0.5, 0.1);
      if (o.update(dt, g === -Infinity ? o.pos.y - 5 : g, this.player.pos)) {
        o.taken = true;
        this.scene.remove(o.mesh);
        this.sfx('pickup');
      }
    }
    this.loot = this.loot.filter((o) => !o.taken);
    this.updateProjectiles(dt);
    this.updateZone();
    this.animateWorld(dt);
  }

  private separateEnemies(): void {
    const es = this.enemies.filter((e) => e.alive && e.solid);
    for (let i = 0; i < es.length; i++)
      for (let j = i + 1; j < es.length; j++) {
        const a = es[i];
        const b = es[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        const min = a.radius + b.radius;
        if (d < min && d > 1e-4) {
          const push = (min - d) / 2;
          a.pos.x -= (dx / d) * push;
          a.pos.z -= (dz / d) * push;
          b.pos.x += (dx / d) * push;
          b.pos.z += (dz / d) * push;
        }
      }
  }

  pushOutOfEnemies(pos: THREE.Vector3, r: number): void {
    for (const e of this.enemies) {
      if (!e.alive || !e.solid) continue;
      if (pos.y > e.pos.y + e.height * 0.8 || pos.y + 1.8 < e.pos.y) continue;
      const dx = pos.x - e.pos.x;
      const dz = pos.z - e.pos.z;
      const d = Math.hypot(dx, dz);
      const min = r + e.radius * 0.85;
      if (d < min && d > 1e-4) {
        pos.x = e.pos.x + (dx / d) * min;
        pos.z = e.pos.z + (dz / d) * min;
      }
    }
  }

  nearestEnemy(pos: THREE.Vector3, maxDist: number): Enemy | null {
    let best: Enemy | null = null;
    let bd = maxDist;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) - e.radius;
      if (d < bd && Math.abs(e.pos.y - pos.y) < 3) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  lockPoint(): THREE.Vector3 | null {
    return this.lock.point();
  }

  // =========================================================================
  // 戦闘解決
  // =========================================================================

  /** プレイヤー攻撃の当たり判定と部位選択 */
  performPlayerHits(player: Player, mv: MoveDef): void {
    for (const e of this.enemies) {
      if (!e.alive || player.hitEnemies.has(e)) continue;
      const d = new THREE.Vector3(e.pos.x - player.pos.x, 0, e.pos.z - player.pos.z);
      const dist = d.length() - e.radius;
      if (dist > mv.reach) continue;
      if (player.pos.y + 2.6 < e.pos.y || player.pos.y > e.pos.y + e.height + 0.5) continue;
      if (mv.arc < 360 && dist > 0.35) {
        const ang = Math.abs(angleDiff(player.facing, Math.atan2(d.x, d.z)));
        // 大型の敵ほど判定を広く取る
        const slack = Math.atan2(e.radius, Math.max(0.5, d.length()));
        if (ang > (mv.arc * Math.PI) / 360 + slack) continue;
      }
      player.hitEnemies.add(e);
      const partId = this.selectPart(player, mv, e, d.length());
      this.applyPlayerHit(player, mv, e, partId);
    }
  }

  private selectPart(player: Player, mv: MoveDef, e: Enemy, dist: number): string {
    const sp = player.strikePoint(mv, new THREE.Vector3(), dist);
    const tmp = new THREE.Vector3();
    const lockPart = this.lock.target === e ? this.lock.partId : null;
    if (lockPart && e.partAvailable(lockPart)) {
      const pr = e.parts[lockPart];
      if (e.partWorldPos(lockPart, tmp).distanceTo(sp) <= pr.radius + 2.0) return lockPart;
    }
    let best = e.bodyPart;
    let bd = Infinity;
    for (const id of e.partList) {
      const pr = e.parts[id];
      const dd = e.partWorldPos(id, tmp).distanceTo(sp) - pr.radius;
      if (dd < 1.3 && dd < bd) {
        bd = dd;
        best = id;
      }
    }
    return best;
  }

  private applyPlayerHit(player: Player, mv: MoveDef, e: Enemy, partId: string): void {
    const perks = this.build.perks;
    const fromEnemy = new THREE.Vector3(player.pos.x - e.pos.x, 0, player.pos.z - e.pos.z);
    const back = Math.abs(angleDiff(e.facing, Math.atan2(fromEnemy.x, fromEnemy.z))) > 2.1;
    const crit = this.forceCrit || (back && perks.has('backCrit'));
    let damage = mv.damage * (back ? 1.15 : 1);
    if (this.player.graft && player.moveKind !== 'graft' && player.moveKind !== 'graftSpecial') damage *= 1.0;
    const res = e.takeHit(
      partId,
      { damage, type: mv.type, partMult: mv.partMult ?? 1, armorMult: mv.armorMult ?? 1, perks, crit },
      player.pos,
      mv.poise ?? 10,
    );
    if (mv.fire) e.burn = 3;
    const pos = e.partWorldPos(res.part);
    const dir = new THREE.Vector3(Math.sin(player.facing), 0.3, Math.cos(player.facing)).normalize();
    const multi = (mv.hits ?? 1) > 2;
    this.impact(res.feel, pos, dir, (mv.stopMult ?? 1) * (multi ? 0.4 : 1));
    if (crit && !multi) this.hud.pop('致命の一撃', 'crit');
    if (res.feel === 'deflect') player.recoil();
    if (this.bossActive === null && e.boss) this.startBoss(e);
  }

  /** 打撃感：手応えに応じたヒットストップ・カメラ波形・ハプティクス・音・粒子 */
  impact(feel: HitFeel, pos: THREE.Vector3, dir: THREE.Vector3, stopMult = 1): void {
    const T: Record<HitFeel, { stop: number; shake: ShakeKind; shakeK: number; hap: HapticKind; sfx: Sfx }> = {
      deflect: { stop: 0.03, shake: 'metal', shakeK: 0.9, hap: 'metal', sfx: 'deflect' },
      armor: { stop: 0.045, shake: 'metal', shakeK: 1, hap: 'metal', sfx: 'metal' },
      armorBreak: { stop: 0.08, shake: 'heavy', shakeK: 0.9, hap: 'heavy', sfx: 'armorBreak' },
      flesh: { stop: 0.06, shake: 'flesh', shakeK: 1, hap: 'flesh', sfx: 'flesh' },
      weak: { stop: 0.075, shake: 'flesh', shakeK: 1.3, hap: 'heavy', sfx: 'flesh' },
      sever: { stop: 0.09, shake: 'heavy', shakeK: 1.2, hap: 'heavy', sfx: 'sever' },
    };
    const t = T[feel];
    this.time.addHitstop(Math.min(0.16, t.stop * stopMult));
    this.cam.addShake(t.shake, t.shakeK * Math.min(1.6, Math.max(0.5, stopMult)));
    this.haptic(t.hap);
    this.sfx(t.sfx);
    switch (feel) {
      case 'deflect':
      case 'armor':
        this.fx.sparks(pos, feel === 'deflect' ? 12 : 20);
        break;
      case 'armorBreak':
        this.fx.sparks(pos, 50, 0xffe0a0);
        this.fx.blood(pos, dir, 10);
        break;
      case 'flesh':
      case 'weak':
        this.fx.blood(pos, dir, feel === 'weak' ? 30 : 18);
        if (feel === 'weak') this.fx.flash(pos, 0xff4040, 6, 0.1);
        break;
      case 'sever':
        this.fx.blood(pos, dir, 40);
        this.time.slowMo(0.3, 0.35);
        this.hud.pop('部位切断', 'sever');
        break;
    }
  }

  /** 敵の攻撃がプレイヤーに当たった時：パリィ／ジャスト回避／ガード／被弾 */
  enemyHitsPlayer(e: Enemy, a: EnemyAttack): void {
    const p = this.player;
    if (!p.isAlive) return;
    if (p.parryActive && !a.red) {
      e.onParried();
      const wp = p.rig.handR.getWorldPosition(new THREE.Vector3());
      this.fx.sparks(wp, 45, 0xffe0a0);
      this.fx.flash(wp, 0xffd090, 18, 0.18);
      this.time.addHitstop(0.11);
      this.time.slowMo(0.35, 0.3);
      this.sfx('parry');
      this.haptic('parry');
      this.cam.addShake('metal', 1.8);
      this.hud.pop('刃合わせ', 'parry');
      p.invuln = 0.35;
      if (this.build.perks.has('parryShock')) {
        this.fx.ring(p.pos, 0xffe0a0, 5, 0.35);
        for (const o of this.enemies) {
          if (!o.alive || o.pos.distanceTo(p.pos) > 4.5) continue;
          o.takeHit(o.bodyPart, { damage: 30, type: 'blunt', partMult: 1, armorMult: 1.5, perks: this.build.perks, crit: false }, p.pos, 30);
        }
      }
      return;
    }
    if (p.iframes) {
      if (p.state === 'step' && !p.justEvadeUsed && this.time.gameTime - p.stepStart < 0.32) {
        // ジャスト回避：スローモーション＋確定強攻撃
        p.justEvadeUsed = true;
        p.justEvadeT = 1.4;
        this.time.slowMo(0.4, 0.22);
        this.sfx('justEvade');
        this.haptic('light');
        this.fx.ring(p.pos, 0x66e0ff, 3, 0.4);
        this.hud.pop('見切り', 'evade');
        this.cam.fovKick = -5;
      }
      return;
    }
    const guard = p.guardFactor;
    if (guard > 0 && p.graft) {
      const dmg = a.damage * (1 - guard);
      p.hp = Math.max(1, p.hp - dmg);
      p.graft.energy = Math.max(0, p.graft.energy - a.damage * 0.35);
      const wp = p.rig.handL.getWorldPosition(new THREE.Vector3());
      this.fx.sparks(wp, 25);
      this.sfx('metal');
      this.haptic('metal');
      this.cam.addShake('metal', 1.2);
      this.time.addHitstop(0.05);
      return;
    }
    p.takeDamage(a.damage, e.pos, a.knock ?? 4, !!a.heavy);
  }

  onRedAttack(e: Enemy): void {
    e.redGlow = 1;
    this.hud.redWarning();
    this.sfx('roar');
    this.haptic('light');
    this.fx.flash(e.center, 0xff2010, 14, 0.6);
    for (let i = 0; i < 16; i++) this.fx.pulseMote(e.center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2)), 0xff2010);
  }

  onPartSevered(e: Enemy, part: PartState, pos: THREE.Vector3): void {
    if (part.graft) {
      const out = pos.clone().sub(e.pos).setY(0);
      if (out.lengthSq() < 1e-4) out.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      out.normalize().multiplyScalar(3);
      out.y = 6;
      this.pickups.push(new GraftPickup(part.graft, pos, out, this.scene));
      this.hud.toast(`${part.name}を斬り落とした　駆け寄って接続しろ`);
    }
    if (this.build.perks.has('lifesteal')) this.player.hp = Math.min(this.player.hpMax, this.player.hp + 30);
  }

  onEnemyKilled(e: Enemy): void {
    this.save.kills++;
    const firstKill = !this.save.flags[`kill_${e.type}`];
    this.save.flags[`kill_${e.type}`] = true;
    const drops = rollDrops({ type: e.type, parts: e.parts, firstKill });
    const c = e.center;
    for (const d of drops) {
      addMaterial(this.save, d.kind, d.perk);
      const def = MATERIALS[d.kind];
      this.loot.push(new LootOrb(d.kind, d.perk, c.clone(), this.scene, def.rarity));
      this.hud.loot(`${def.name}${d.perk ? `〈${PERKS[d.perk].name}〉` : ''}`, def.rarity);
    }
    this.sfx('death');
    this.fx.severBurst(c);
    if (this.lock.target === e) this.lock.clear();
    if (e.boss) {
      this.save.flags.bossDefeated = true;
      this.bossActive = null;
      this.hud.setBoss(null);
      this.hud.banner(`${e.name}　討伐`, '巨神の心臓への道が開かれた', 'victory');
      this.time.slowMo(1.2, 0.25);
      const fog = this.level.interactables.find((x) => x.kind === 'fog');
      if (fog) this.removeFog(fog);
      this.queueSave(1);
    } else this.queueSave(2);
  }

  startBoss(e: Enemy): void {
    this.bossActive = e;
    this.hud.setBoss(e);
  }

  onPlayerDeath(): void {
    this.hud.banner('灰に還った', '炉心へ引き戻される…', 'death');
    this.lock.clear();
    this.deathTimer = 0;
    this.time.slowMo(1.5, 0.35);
  }

  respawnAtHearth(rest: boolean): void {
    const hp = this.world.hearthPos.clone().add(new THREE.Vector3(0, -0.35, 7));
    this.player.spawn(hp, 0);
    this.player.flasks = this.save.flasksMax;
    this.cam.snapBehind(0);
    this.respawnEnemies();
    for (const o of this.loot) this.scene.remove(o.mesh);
    this.loot = [];
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    this.projectiles = [];
    if (!rest) this.hud.zone('炉心の廃教会');
    this.queueSave(0.2);
  }

  // =========================================================================
  // グラフト・パージ・飛び道具
  // =========================================================================

  onGraftChanged(): void {
    this.touch.setGraftMode(this.player.graft?.def.name ?? null);
  }

  throwPurge(from: THREE.Vector3, facing: number, g: ActiveGraft): void {
    const target = this.lock.point() ?? this.nearestEnemy(this.player.pos, 10)?.center ?? this.player.pos.clone().add(new THREE.Vector3(Math.sin(facing) * 9, 1, Math.cos(facing) * 9));
    const T = Math.max(0.35, Math.min(0.8, from.distanceTo(target) / 16));
    const grav = -20;
    const v = target.clone().sub(from).divideScalar(T);
    v.y -= 0.5 * grav * T;
    const mesh = g.mesh;
    mesh.position.copy(from);
    mesh.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = M.ember();
    });
    this.scene.add(mesh);
    const power = 70 + g.energy * 1.4;
    this.projectiles.push(new Projectile(from.clone(), v, mesh, 'purge', power, grav, 2.5));
    this.sfx('swingHeavy');
    this.hud.pop('オーバーロード・パージ', 'crit');
  }

  spawnFireWave(pos: THREE.Vector3, facing: number): void {
    const f = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
    const m = new THREE.Object3D();
    const p = new Projectile(pos.clone().setY(pos.y + 0.8).addScaledVector(f, 1), f.multiplyScalar(15), m, 'firewave', 34, 0, 0.7);
    (p as any).hitSet = new Set<Enemy>();
    this.projectiles.push(p);
  }

  private updateProjectiles(dt: number): void {
    for (const pr of this.projectiles) {
      pr.t += dt;
      pr.vel.y += pr.gravity * dt;
      pr.pos.addScaledVector(pr.vel, dt);
      pr.mesh.position.copy(pr.pos);
      pr.mesh.rotation.x += dt * 12;
      pr.mesh.rotation.z += dt * 7;
      if (pr.kind === 'purge') {
        this.fx.fire(pr.pos, pr.vel.clone().normalize().negate(), 2, 0.3, 3);
        let hit = pr.t > pr.maxT;
        const g = this.level.groundAt(pr.pos.x, pr.pos.z, pr.pos.y + 0.2, 0.1);
        if (pr.pos.y <= g + 0.1) hit = true;
        for (const e of this.enemies) if (e.alive && e.center.distanceTo(pr.pos) < e.radius + 0.9) hit = true;
        if (this.level.resolve(pr.pos.clone(), 0.2, 0.4, 0)) hit = true;
        if (hit) {
          this.explode(pr.pos, pr.power);
          pr.alive = false;
          this.scene.remove(pr.mesh);
        }
      } else {
        this.fx.fire(pr.pos, new THREE.Vector3(0, 1, 0), 6, 0.6, 2.5);
        const set = (pr as any).hitSet as Set<Enemy>;
        for (const e of this.enemies) {
          if (!e.alive || set.has(e) || e.pos.distanceTo(pr.pos) > e.radius + 1.6) continue;
          set.add(e);
          const r = e.takeHit(e.bodyPart, { damage: pr.power, type: 'slash', partMult: 1, armorMult: 1, perks: this.build.perks, crit: false }, this.player.pos, 15);
          e.burn = 4;
          this.impact(r.feel, e.center, pr.vel.clone().normalize(), 0.6);
        }
        this.burnCheck(pr.pos, pr.vel.clone().normalize(), 2);
        if (pr.t > pr.maxT) pr.alive = false;
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.alive);
  }

  /** パージ爆発：範囲内の敵の最寄り部位へ超威力の打撃＋斬撃 */
  private explode(pos: THREE.Vector3, power: number): void {
    const R = 3.8;
    this.fx.explosion(pos, R);
    this.sfx('explosion');
    this.cam.addShake('explosion', 1);
    this.haptic('heavy');
    this.time.addHitstop(0.1);
    const tmp = new THREE.Vector3();
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.center.distanceTo(pos) > R + e.radius + 1) continue;
      let best = e.bodyPart;
      let bd = Infinity;
      for (const id of e.partList) {
        const d = e.partWorldPos(id, tmp).distanceTo(pos);
        if (d < bd) {
          bd = d;
          best = id;
        }
      }
      const perks = this.build.perks;
      const r1 = e.takeHit(best, { damage: power, type: 'blunt', partMult: 1.5, armorMult: 3, perks, crit: false }, pos, 90);
      if (e.alive && e.parts[best] && !e.parts[best].severed && e.parts[best].armor <= 0) {
        e.takeHit(best, { damage: power * 0.5, type: 'slash', partMult: 1.5, armorMult: 1, perks, crit: false }, pos, 0);
      }
      if (r1.feel === 'armorBreak') this.hud.toast(`爆発が${e.parts[best]?.name ?? '装甲'}を吹き飛ばした`);
      if (e.boss && !this.bossActive) this.startBoss(e);
    }
    this.burnCheck(pos, new THREE.Vector3(0, 1, 0), R);
  }

  /** 火属性攻撃が茨に届いたら焼き払う */
  burnCheck(origin: THREE.Vector3, dir: THREE.Vector3, reach: number): void {
    const th = this.level.interactables.find((x) => x.kind === 'thorns' && x.active);
    if (!th) return;
    const to = th.pos.clone().sub(origin);
    const d = to.length();
    if (d > reach + 2.5) return;
    to.y = 0;
    dir = dir.clone().setY(0);
    if (dir.lengthSq() > 0.01 && d > 2 && to.normalize().dot(dir.normalize()) < 0.4) return;
    this.burnThorns(th);
  }

  private burnThorns(th: Interactable): void {
    th.active = false;
    th.data!.collider.active = false;
    this.save.flags.thornsBurned = true;
    this.thornAnim = 1.6;
    this.hud.toast('毒の茨を焼き払った');
    this.sfx('fire');
    this.queueSave(0.5);
  }

  private openGate(it: Interactable): void {
    it.active = false;
    this.save.flags.gateOpen = true;
    this.gateAnim = 1.8;
    this.sfx('gate');
    this.cam.addShake('heavy', 0.8);
    this.haptic('heavy');
    if (this.player.graft) this.player.graft.energy = Math.max(0, this.player.graft.energy - 35);
    this.hud.toast('剛腕で鉄格子をこじ開けた');
    this.queueSave(0.5);
  }

  private animateWorld(dt: number): void {
    if (this.gateAnim > 0) {
      this.gateAnim -= dt;
      const g = this.level.interactables.find((x) => x.kind === 'gate')!;
      g.object!.position.y = Math.min(4.8, g.object!.position.y + dt * 2.8);
      if (Math.random() < 0.5) this.fx.sparks(g.pos.clone().setY(0.3), 2);
      if (this.gateAnim <= 0) g.data!.collider.active = false;
    }
    if (this.thornAnim > 0) {
      this.thornAnim -= dt;
      const th = this.level.interactables.find((x) => x.kind === 'thorns')!;
      const k = Math.max(0, this.thornAnim / 1.6);
      th.object!.scale.set(1, k, 1);
      for (let i = 0; i < 4; i++) this.fx.fire(th.pos.clone().add(new THREE.Vector3(-1, Math.random() * 3 * k, (Math.random() - 0.5) * 4)), new THREE.Vector3(0, 1, 0), 1, 0.5, 3);
      if (this.thornAnim <= 0) th.object!.visible = false;
    }
    const hearth = this.level.interactables.find((x) => x.kind === 'hearth')?.object;
    const heart = hearth?.getObjectByName('heart');
    if (heart) {
      const beat = Math.pow(Math.max(0, Math.sin(this.time.gameTime * 3.2)), 8);
      heart.scale.setScalar(1 + beat * 0.15);
      heart.rotation.y += dt * 0.5;
    }
    for (const g of this.chestMeshes.values()) {
      const glow = g.getObjectByName('glow');
      if (glow?.visible) glow.scale.setScalar(1 + Math.sin(this.time.gameTime * 4) * 0.2);
    }
    this.world.fogWall.material = this.world.fogWall.material as THREE.Material;
    ((this.world.fogWall.material as THREE.MeshBasicMaterial).opacity = 0.28 + Math.sin(this.time.gameTime * 2) * 0.08);
  }

  // =========================================================================
  // インタラクト
  // =========================================================================

  private findInteract(): { label: string; run: () => void } | null {
    const p = this.player;
    if (!p.isAlive || (p.state !== 'move' && p.state !== 'attack')) return null;
    // 落ちている部位（最優先）
    let bestPick: GraftPickup | null = null;
    let bd = 2.2;
    for (const pk of this.pickups) {
      const d = Math.hypot(pk.pos.x - p.pos.x, pk.pos.z - p.pos.z);
      if (d < bd && Math.abs(pk.pos.y - p.pos.y) < 2) {
        bd = d;
        bestPick = pk;
      }
    }
    if (bestPick) {
      const pk = bestPick;
      return {
        label: '接続',
        run: () => {
          p.beginGraft(pk.id, pk, () => {
            pk.taken = true;
            pk.dispose(this.scene);
            this.hud.toast(`${GRAFTS[pk.id].name}を接続した`);
          });
        },
      };
    }
    // 昇降機（上下どちらでも）
    const e = this.level.elevator;
    const dxz = Math.hypot(p.pos.x, p.pos.z - 59.5);
    if (dxz < 3.4 && (Math.abs(p.pos.y - this.level.ELEV_TOP) < 1 || Math.abs(p.pos.y - this.level.ELEV_BOTTOM) < 1)) {
      const onPlat = p.pos.x > e.min.x && p.pos.x < e.max.x && p.pos.z > e.min.z && p.pos.z < e.max.z && Math.abs(p.pos.y - e.max.y) < 0.3;
      const moving = Math.abs(e.max.y - this.level.elevatorTarget) > 0.01;
      if (!moving) {
        const atTop = Math.abs(e.max.y - this.level.ELEV_TOP) < 0.01;
        const playerTop = Math.abs(p.pos.y - this.level.ELEV_TOP) < 1;
        if (onPlat) return { label: atTop ? '降下' : '上昇', run: () => this.moveElevator(atTop ? this.level.ELEV_BOTTOM : this.level.ELEV_TOP) };
        if (atTop !== playerTop) return { label: '呼ぶ', run: () => this.moveElevator(playerTop ? this.level.ELEV_TOP : this.level.ELEV_BOTTOM) };
      }
    }
    for (const it of this.level.interactables) {
      if (!it.active || it.kind === 'elevator') continue;
      const d = Math.hypot(it.pos.x - p.pos.x, it.pos.z - p.pos.z);
      if (d > it.radius || Math.abs(it.pos.y - p.pos.y) > 2.2) continue;
      switch (it.kind) {
        case 'hearth':
          return { label: '休息', run: () => this.rest() };
        case 'forge':
          return { label: '鍛冶', run: () => this.openForge() };
        case 'chest':
          return { label: '開ける', run: () => this.openChest(it) };
        case 'gate':
          return p.graft?.def.field === 'gate'
            ? { label: 'こじ開ける', run: () => this.openGate(it) }
            : { label: '調べる', run: () => this.hud.toast('錆びついた巨大な鉄格子。怪力でなければ動かない') };
        case 'thorns':
          return p.graft?.def.field === 'burn'
            ? { label: '焼き払う', run: () => this.burnThorns(it) }
            : { label: '調べる', run: () => this.hud.toast('毒の茨が道を塞いでいる。焼き払う炎が必要だ') };
        case 'fog':
          return { label: '霧を抜ける', run: () => this.enterFog() };
        case 'trialDoor':
          return { label: '調べる', run: () => this.hooks.onTrialDoor() };
        case 'sign':
          return { label: '調べる', run: () => this.hooks.onSign(it.data!.text) };
      }
    }
    return null;
  }

  private updateInteractPrompt(): void {
    this.nearInteract = this.findInteract();
    const label = this.nearInteract?.label ?? null;
    this.touch.setInteract(label);
    const dev = this.input.lastDevice;
    this.hud.setPrompt(label && dev !== 'touch' ? `${dev === 'pad' ? 'Ⓑ' : 'E'}　${label}` : null);
  }

  tryInteract(): boolean {
    const it = this.findInteract();
    if (!it) return false;
    this.sfx('ui');
    it.run();
    return true;
  }

  private moveElevator(target: number): void {
    this.level.elevatorTarget = target;
    this.sfx('gate');
    this.cam.addShake('metal', 0.4);
  }

  private enterFog(): void {
    const p = this.player;
    p.pos.z = 84;
    p.facing = 0;
    this.cam.snapBehind(0);
    const boss = this.enemies.find((e) => e.boss && e.alive);
    if (boss) {
      this.startBoss(boss);
      this.hud.banner(boss.name, '巨大な蒸気回転斧を持つ処刑人');
    }
  }

  private openChest(it: Interactable): void {
    const reward = String(it.data?.reward ?? '');
    this.save.flags[`chest_${it.id}`] = true;
    this.markChestOpen(it);
    this.sfx('pickup');
    if (reward.startsWith('skeleton:')) {
      const id = reward.split(':')[1] as SkeletonId;
      if (!this.save.ownedSkeletons.includes(id)) this.save.ownedSkeletons.push(id);
      this.hud.banner(`${SKELETONS[id].name}を手に入れた`, '鍛冶場で骨格を付け替えられる');
    } else if (reward === 'flask') {
      this.save.flasksMax++;
      this.player.flasks++;
      this.hud.banner('炉心の灰を手に入れた', '霊薬の最大数が増えた');
    }
    this.queueSave(0.3);
  }

  rest(): void {
    this.player.hp = this.player.hpMax;
    this.player.flasks = this.save.flasksMax;
    this.player.dropGraft(false);
    this.respawnEnemies();
    this.fx.ring(this.player.pos, 0xffa040, 4, 0.8);
    this.sfx('heal');
    void this.persist();
    this.hooks.onHearth();
  }

  openForge(): void {
    this.forge.open(() => this.queueSave(0.1));
  }

  rematchBoss(): void {
    this.save.flags.bossDefeated = false;
    const fogIt = this.level.interactables.find((x) => x.kind === 'fog');
    if (fogIt) {
      fogIt.active = true;
      fogIt.data!.collider.active = true;
      this.world.fogWall.visible = true;
    }
    this.respawnEnemies();
    this.hud.toast('処刑騎士の記憶が処刑場に蘇った');
  }

  // =========================================================================
  // 環境
  // =========================================================================

  private updateZone(): void {
    const p = this.player.pos;
    for (const z of this.world.zones) {
      if (p.x >= z.min[0] && p.x <= z.max[0] && p.z >= z.min[1] && p.z <= z.max[1] && p.y >= z.yMin && p.y <= z.yMax) {
        if (z.name !== this.currentZone) {
          this.currentZone = z.name;
          this.hud.zone(z.name);
          this.queueSave(1);
        }
        return;
      }
    }
  }

  private updateLights(dt: number): void {
    this.lightTimer -= dt;
    if (this.lightTimer <= 0) {
      this.lightTimer = 0.4;
      const p = this.player.pos;
      const spots = [...this.level.lightSpots].sort((a, b) => a.pos.distanceToSquared(p) - b.pos.distanceToSquared(p)).slice(0, this.lightPool.length);
      this.lightPool.forEach((l, i) => {
        const s = spots[i];
        if (!s) {
          l.intensity = 0;
          return;
        }
        l.position.copy(s.pos);
        l.color.setHex(s.color);
        l.userData.base = s.intensity;
      });
    }
    const t = this.time.realTime;
    this.lightPool.forEach((l, i) => {
      const base = (l.userData.base as number) ?? 0;
      l.intensity = base * (0.85 + Math.sin(t * 9 + i * 1.7) * 0.08 + Math.sin(t * 23 + i) * 0.05);
    });
    void damp;
  }

  private updateAmbient(dt: number): void {
    if (dt <= 0) return;
    // 舞い散る灰と火の粉
    if (Math.random() < 0.5) {
      const p = this.player.pos;
      const pos = new THREE.Vector3(p.x + (Math.random() - 0.5) * 18, p.y + Math.random() * 7, p.z + (Math.random() - 0.5) * 18);
      const ember = Math.random() < 0.25;
      this.fx.spawn(pos, new THREE.Vector3((Math.random() - 0.5) * 0.4, ember ? 0.6 : -0.3, (Math.random() - 0.5) * 0.4), ember ? 0xff7a30 : 0x6a6460, ember ? 0.06 : 0.05, 4, 0, 0.1);
    }
    for (const b of this.level.braziers) {
      if (b.position.distanceToSquared(this.player.pos) < 400 && Math.random() < 0.3) {
        this.fx.fire(b.position.clone().setY(b.position.y + 1.35), new THREE.Vector3(0, 1, 0), 1, 0.35, 1.6);
      }
    }
    for (const e of this.enemies) {
      if (!e.alive) continue;
      // 破壊可能部位の魔力の脈動
      if (Math.random() < 0.08) {
        const list = e.partList.filter((id) => e.parts[id].severable);
        if (list.length) this.fx.pulseMote(e.partWorldPos(rng.pick(list)), 0x66ccff);
      }
    }
  }

  // =========================================================================
  // ユーティリティ
  // =========================================================================

  sfx(s: Sfx): void {
    audio.play(s);
  }

  haptic(k: HapticKind): void {
    haptic(k);
  }

  queueSave(delay: number): void {
    if (this.saveTimer < 0 || this.saveTimer > delay) this.saveTimer = delay;
  }

  async persist(): Promise<void> {
    this.saveTimer = -1;
    await writeSave(this.save);
  }
}
