import * as THREE from 'three';
import { Rig, type Pose } from '../render/Rig';
import { M } from '../render/Materials';
import { Trail } from '../render/Trail';
import { angleDiff, clamp, damp, turnTowards } from '../core/MathUtil';
import { GRAFTS, type GraftDef, type SkeletonDef } from './Data';
import { mountGraft } from './GraftModels';
import { DEAD_POSE, GRAFT_POSE, HEAL_POSE, HURT_POSE, NEUTRAL, PARRY_POSE, PURGE_POSE, STEP_POSE, SWINGS, THROW_POSE } from './PlayerAnim';
import type { GraftId, MoveDef } from './Types';
import type { Game } from './Game';

export type PlayerState = 'move' | 'attack' | 'charge' | 'step' | 'parry' | 'hurt' | 'heal' | 'grafting' | 'purgeAim' | 'throw' | 'dead' | 'recoil';
type MoveKind = 'combo' | 'up' | 'forward' | 'charge' | 'graft' | 'graftSpecial';

export interface ActiveGraft {
  def: GraftDef;
  energy: number;
  max: number;
  mesh: THREE.Group;
}

const GRAVITY = -22;
const RUN_SPEED = 5.4;
const STEP_TIME = 0.36;
const STEP_SPEED = 12.5;
const PARRY_TIME = 0.42;
const PARRY_WINDOW = 0.2;

export class Player {
  readonly radius = 0.4;
  readonly height = 1.8;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  facing = 0;
  grounded = true;
  airJumps = 0;
  airSteps = 0;

  hpMax = 220;
  hp = 220;
  staminaMax = 100;
  stamina = 100;
  private staminaDelay = 0;
  flasks = 3;

  state: PlayerState = 'move';
  stateT = 0;
  move: MoveDef | null = null;
  moveKind: MoveKind = 'combo';
  comboIdx = 0;
  private comboResetT = 0;
  hitPulse = -1;
  hitEnemies = new Set<unknown>();
  chargeT = 0;
  private sustainT = 0;
  private holdRelease = false;
  graft: ActiveGraft | null = null;
  private pendingGraft: { id: GraftId; pickup: { pos: THREE.Vector3 }; onDone: () => void } | null = null;
  justEvadeT = 0;
  stepStart = -10;
  justEvadeUsed = false;
  private stepDir = new THREE.Vector3();
  invuln = 0;
  hurtT = 0;
  private walkPhase = 0;
  private walkAmt = 0;
  /** 接続時の左腕パルス */
  private lastSpeed = 0;

  readonly rig: Rig;
  readonly group = new THREE.Group();
  private grip = new THREE.Group();
  private weapon = new THREE.Group();
  private weaponTip = new THREE.Object3D();
  private weaponBase = new THREE.Object3D();
  private weapon2: THREE.Group | null = null;
  private socketGlow: THREE.Mesh;
  trail: Trail;
  private gripAngle = Math.PI;

  constructor(private game: Game) {
    this.rig = new Rig({
      torsoMat: M.playerLeather(),
      limbMat: M.playerCloth(),
      headMat: M.playerSkin(),
      handMat: M.playerLeather(),
      helm: 'hood',
    });
    // 外套
    const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.1, 1, 4), M.playerCloth());
    (cape.material as THREE.Material).side = THREE.DoubleSide;
    cape.position.set(0, 0.0, -0.18);
    cape.rotation.x = 0.12;
    cape.castShadow = true;
    this.rig.j.torso.add(cape);
    // 左腕：接続義手（グラフト・ソケット）
    const elL = this.rig.j.elbowL;
    elL.children.filter((c) => (c as THREE.Mesh).isMesh).forEach((c) => ((c as THREE.Mesh).material = M.graftMetal()));
    const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.075, 0.12, 8), M.graftMetal());
    socket.position.y = -0.33;
    elL.add(socket);
    this.socketGlow = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.018, 6, 16), new THREE.MeshBasicMaterial({ color: 0x66e0ff }));
    this.socketGlow.rotation.x = Math.PI / 2;
    this.socketGlow.position.y = -0.38;
    elL.add(this.socketGlow);

    this.rig.handR.add(this.grip);
    this.grip.add(this.weapon);
    this.group.add(this.rig.root);
    game.scene.add(this.group);
    this.trail = new Trail(game.scene, 0xaaccff);
  }

  /** 骨格に応じて武器モデルを組み直す */
  buildWeapon(skel: SkeletonDef, fire: boolean): void {
    this.weapon.clear();
    if (this.weapon2) {
      this.weapon2.parent?.remove(this.weapon2);
      this.weapon2 = null;
    }
    const build = (target: THREE.Group, len: number) => {
      const { bladeWidth, head } = skel.look;
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.28, 6), M.wood());
      handle.position.y = 0.06;
      target.add(handle);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 0.06), M.darkSteel());
      guard.position.y = 0.2;
      if (!head) target.add(guard);
      const bladeMat = fire ? M.ember() : M.steel();
      if (head === 'hammer') {
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 6), M.wood());
        shaft.position.y = 0.2 + len / 2;
        const hd = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.26), M.darkSteel());
        hd.position.y = 0.2 + len;
        target.add(shaft, hd);
      } else if (head === 'spear') {
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 6), M.wood());
        shaft.position.y = 0.2 + len / 2 - 0.4;
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.45, 4), bladeMat);
        tip.position.y = 0.2 + len - 0.2;
        target.add(shaft, tip);
      } else {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(bladeWidth, len, 0.025), bladeMat);
        blade.position.y = 0.22 + len / 2;
        const point = new THREE.Mesh(new THREE.ConeGeometry(bladeWidth * 0.7, 0.16, 4), bladeMat);
        point.position.y = 0.22 + len + 0.08;
        point.scale.z = 0.3;
        target.add(blade, point);
      }
      target.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    };
    build(this.weapon, skel.look.bladeLen);
    this.weaponBase.position.set(0, 0.25, 0);
    this.weaponTip.position.set(0, 0.22 + skel.look.bladeLen + 0.1, 0);
    this.weapon.add(this.weaponBase, this.weaponTip);
    if (skel.look.twin && !this.graft) {
      this.weapon2 = new THREE.Group();
      build(this.weapon2, skel.look.bladeLen);
      this.weapon2.rotation.x = Math.PI * 0.95;
      this.rig.handL.add(this.weapon2);
    }
    this.trail.setColor(fire ? 0xff7a30 : 0xaaccff);
  }

  get isAlive(): boolean {
    return this.state !== 'dead';
  }

  /** 攻撃のアクティブ判定中か */
  get inActive(): boolean {
    if (this.state !== 'attack' || !this.move) return false;
    const t = this.stateT;
    return t >= this.move.startup && t < this.move.startup + this.activeLen();
  }

  private activeLen(): number {
    if (!this.move) return 0;
    if (this.move.sustain && !this.isGuardHold()) return this.move.active + this.sustainT;
    return this.move.active;
  }

  private isGuardHold(): boolean {
    return !!(this.move?.guard && this.move?.sustain);
  }

  get parryActive(): boolean {
    const w = PARRY_WINDOW * (this.game.build.cores.has('aegis') ? 1.6 : 1);
    return this.state === 'parry' && this.stateT <= w;
  }

  get iframes(): boolean {
    return (this.state === 'step' && this.stateT > 0.02 && this.stateT < 0.3) || this.invuln > 0 || this.state === 'grafting';
  }

  get guardFactor(): number {
    if (this.state === 'attack' && this.move?.guard) return this.move.guard;
    return 0;
  }

  get superArmor(): boolean {
    if (this.state === 'attack' || this.state === 'charge') {
      if (this.move?.superArmor) return true;
      if (this.game.build.cores.has('superArmor')) return true;
    }
    return false;
  }

  spawn(p: THREE.Vector3, facing: number): void {
    this.pos.copy(p);
    this.vel.set(0, 0, 0);
    this.facing = facing;
    this.hp = this.hpMax;
    this.stamina = this.staminaMax;
    this.state = 'move';
    this.stateT = 0;
    this.move = null;
    this.dropGraft(false);
    this.group.visible = true;
  }

  private setState(s: PlayerState): void {
    this.state = s;
    this.stateT = 0;
    this.hitPulse = -1;
    this.hitEnemies.clear();
    if (s !== 'attack') this.trail.stop();
  }

  private useStamina(n: number): boolean {
    if (this.stamina <= 0) return false;
    this.stamina = Math.max(0, this.stamina - n);
    this.staminaDelay = 0.55;
    return true;
  }

  private desiredDir(out: THREE.Vector3): number {
    const i = this.game.input;
    const fwd = this.game.cam.forwardXZ(new THREE.Vector3());
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    out.set(0, 0, 0).addScaledVector(fwd, i.moveY).addScaledVector(right, i.moveX);
    const mag = Math.min(1, out.length());
    if (mag > 0.001) out.normalize();
    return mag;
  }

  /** 自動照準：ロック対象 → スティック方向 → 近くの敵 */
  private aimFacing(snap: boolean): void {
    const lockP = this.game.lockPoint();
    let target: number | null = null;
    if (lockP) target = Math.atan2(lockP.x - this.pos.x, lockP.z - this.pos.z);
    else {
      const d = new THREE.Vector3();
      if (this.desiredDir(d) > 0.2) target = Math.atan2(d.x, d.z);
      else {
        const e = this.game.nearestEnemy(this.pos, 4.5);
        if (e) target = Math.atan2(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
      }
    }
    if (target !== null) this.facing = snap ? target : turnTowards(this.facing, target, 0.35);
  }

  startMove(move: MoveDef, kind: MoveKind): boolean {
    const cost = move.stamina;
    if (this.stamina <= 0 && cost > 0) return false;
    if (move.energy && this.graft) {
      this.graft.energy = Math.max(0, this.graft.energy - move.energy);
    }
    this.useStamina(cost);
    this.move = move;
    this.moveKind = kind;
    this.sustainT = 0;
    this.holdRelease = false;
    this.setState('attack');
    this.aimFacing(true);
    if (move.lift) {
      this.vel.y = move.lift;
      this.grounded = false;
    }
    const sw = SWINGS[move.anim];
    this.gripAngle = sw.grip;
    this.game.sfx(move.damage > 45 || move.anim === 'smash' ? 'swingHeavy' : 'swing');
    if (kind === 'charge' || kind === 'graftSpecial') this.game.cam.fovKick = 6;
    return true;
  }

  private tryCombo(): boolean {
    const b = this.game.build;
    // グラフト中：軽攻撃3段目から部位連携攻撃へ派生
    if (this.graft && this.comboIdx === 3) {
      const ok = this.startMove(this.graft.def.link, 'graft');
      this.comboIdx = 0;
      return ok;
    }
    const idx = this.comboIdx % b.combo.length;
    const ok = this.startMove(b.combo[idx], 'combo');
    if (ok) {
      this.comboIdx = idx + 1;
      if (this.comboIdx >= b.combo.length && !this.graft) this.comboIdx = 0;
      else if (this.graft && this.comboIdx > 3) this.comboIdx = 0;
    }
    return ok;
  }

  private tryChargeRelease(): boolean {
    const b = this.game.build;
    if (this.justEvadeT > 0 || this.chargeT >= b.skeleton.chargeTime) {
      const crit = this.justEvadeT > 0;
      this.justEvadeT = 0;
      const ok = this.startMove(crit ? { ...b.charge, damage: Math.round(b.charge.damage * 1.25), partMult: (b.charge.partMult ?? 1) * 1.5 } : b.charge, 'charge');
      if (ok && crit) this.game.forceCrit = true;
      if (ok && b.attach === 'fireEdge') this.game.spawnFireWave(this.pos, this.facing);
      return ok;
    }
    return this.tryCombo();
  }

  /** 行動可能状態での入力処理（先行入力を含む） */
  private handleActions(canCancel: boolean): boolean {
    const i = this.game.input;
    const b = this.game.build;
    if (!canCancel) return false;

    if (i.consume('heal') && this.flasks > 0 && this.grounded) {
      this.flasks--;
      this.setState('heal');
      return true;
    }
    if (i.consume('purgeStart')) {
      if (this.graft) {
        this.setState('purgeAim');
        return true;
      }
      i.fire('sub');
    }
    if (i.consume('sub')) {
      const d = new THREE.Vector3();
      const mag = this.desiredDir(d);
      if (!this.grounded) {
        if (this.game.build.cores.has('doubleJump') && this.airSteps > 0) {
          this.airSteps--;
          return this.startStep(mag > 0.2 ? d : new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing)));
        }
        return false;
      }
      if (mag < 0.25) {
        // 刃合わせ（パリィ）の構え
        this.setState('parry');
        this.aimFacing(true);
        this.game.sfx('swing');
        return true;
      }
      return this.startStep(d);
    }
    if (i.consume('chargeStart')) {
      if (this.graft) return this.startMove(this.graft.def.special, 'graftSpecial');
      this.chargeT = 0;
      this.setState('charge');
      return true;
    }
    if (i.consume('flickUp')) {
      if (!this.grounded) {
        if (this.game.build.cores.has('doubleJump') && this.airJumps > 0) this.airJumps--;
        else return false;
      }
      return this.startMove(this.graft ? this.graft.def.up : b.up, 'up');
    }
    if (i.consume('flickForward')) return this.startMove(this.graft ? this.graft.def.forward : b.forward, 'forward');
    if (i.consume('light')) {
      if (this.justEvadeT > 0) {
        // ジャスト回避後：狙った部位へ確定の強攻撃
        this.chargeT = 99;
        return this.tryChargeRelease();
      }
      return this.tryCombo();
    }
    if (i.consume('interact')) {
      if (this.game.tryInteract()) return true;
    }
    return false;
  }

  private startStep(dir: THREE.Vector3): boolean {
    if (!this.useStamina(16)) return false;
    this.stepDir.copy(dir).setY(0).normalize();
    this.facing = Math.atan2(dir.x, dir.z);
    this.setState('step');
    this.stepStart = this.game.time.gameTime;
    this.justEvadeUsed = false;
    this.game.sfx('step');
    return true;
  }

  /** 部位接続（0.5秒のドッキング） */
  beginGraft(id: GraftId, from: { pos: THREE.Vector3 }, onDone: () => void): void {
    this.dropGraft(false);
    this.pendingGraft = { id, pickup: from, onDone };
    this.facing = Math.atan2(from.pos.x - this.pos.x, from.pos.z - this.pos.z);
    this.setState('grafting');
    this.game.fx.cable(
      () => this.rig.handL.getWorldPosition(new THREE.Vector3()),
      () => from.pos.clone(),
      0.5,
    );
    this.game.sfx('graft');
  }

  private finishGraft(): void {
    if (!this.pendingGraft) return;
    const { id, onDone } = this.pendingGraft;
    this.pendingGraft = null;
    const def = GRAFTS[id];
    const max = def.energy * (this.game.build.perks.has('graftEnergy25') ? 1.25 : 1);
    const mesh = mountGraft(this.rig.handL, id);
    this.graft = { def, energy: max, max, mesh };
    if (this.weapon2) this.weapon2.visible = false;
    onDone();
    this.game.onGraftChanged();
    this.game.haptic('heavy');
    this.game.cam.addShake('heavy', 0.6);
    this.game.fx.severBurst(this.rig.handL.getWorldPosition(new THREE.Vector3()));
  }

  dropGraft(crumble: boolean): void {
    if (!this.graft) return;
    const wp = this.graft.mesh.getWorldPosition(new THREE.Vector3());
    this.graft.mesh.parent?.remove(this.graft.mesh);
    this.graft = null;
    if (this.weapon2) this.weapon2.visible = true;
    if (crumble) {
      this.game.fx.blood(wp, new THREE.Vector3(0, 1, 0), 16);
      this.game.fx.steam(wp, 8);
      this.game.hud.toast('接続部位が崩壊した');
    }
    this.game.onGraftChanged();
  }

  takeDamage(dmg: number, from: THREE.Vector3, knock: number, heavy: boolean): void {
    if (this.state === 'dead') return;
    let d = dmg;
    if (this.game.build.cores.has('aegis')) d *= 0.85;
    this.hp = Math.max(0, this.hp - d);
    this.game.sfx('hurt');
    this.game.haptic(heavy ? 'heavy' : 'flesh');
    this.game.cam.addShake(heavy ? 'heavy' : 'flesh', 1);
    this.game.fx.blood(this.pos.clone().setY(this.pos.y + 1.2), this.pos.clone().sub(from).setY(0).normalize(), 14);
    this.game.hud.damageFlash();
    if (this.hp <= 0) {
      this.setState('dead');
      this.game.onPlayerDeath();
      return;
    }
    if (this.superArmor && !heavy) return;
    this.setState('hurt');
    this.hurtT = heavy ? 0.7 : 0.4;
    const dir = this.pos.clone().sub(from).setY(0);
    if (dir.lengthSq() < 1e-4) dir.set(Math.sin(this.facing + Math.PI), 0, Math.cos(this.facing + Math.PI));
    dir.normalize();
    this.vel.x = dir.x * knock;
    this.vel.z = dir.z * knock;
    if (heavy) {
      this.vel.y = 4;
      this.grounded = false;
    }
    this.facing = Math.atan2(-dir.x, -dir.z);
  }

  /** 攻撃が装甲に弾かれた時の仰け反り */
  recoil(): void {
    if (this.state !== 'attack' || (this.move?.hits ?? 1) > 1 || this.move?.superArmor) return;
    this.setState('recoil');
  }

  update(dt: number): void {
    if (dt <= 0) return;
    const i = this.game.input;
    const b = this.game.build;
    this.stateT += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.justEvadeT = Math.max(0, this.justEvadeT - dt);
    this.comboResetT += dt;

    // スタミナ回復
    this.staminaDelay -= dt;
    if (this.staminaDelay <= 0 && this.state !== 'attack' && this.state !== 'step') {
      let regen = 42;
      if (b.perks.has('staminaRegen')) regen *= 1.25;
      if (b.cores.has('steamBoost')) regen *= 1.35;
      this.stamina = Math.min(this.staminaMax, this.stamina + regen * dt);
    }

    const dir = new THREE.Vector3();
    const mag = this.desiredDir(dir);
    let speedTarget = 0;
    let moveDir = dir;
    let allowTurn = true;

    switch (this.state) {
      case 'move': {
        if (this.comboResetT > 0.7) this.comboIdx = 0;
        if (this.handleActions(true)) break;
        speedTarget = RUN_SPEED * mag;
        const lockP = this.game.lockPoint();
        if (lockP) {
          const t = Math.atan2(lockP.x - this.pos.x, lockP.z - this.pos.z);
          this.facing = turnTowards(this.facing, t, 12 * dt);
          speedTarget *= 0.85;
          allowTurn = false;
        }
        break;
      }
      case 'charge': {
        this.chargeT += dt;
        this.aimFacing(false);
        speedTarget = 1.0 * mag;
        allowTurn = false;
        const ct = b.skeleton.chargeTime;
        if (this.chargeT >= ct && this.chargeT - dt < ct) {
          this.game.sfx('ui');
          this.game.haptic('light');
          this.game.fx.flash(this.rig.handR.getWorldPosition(new THREE.Vector3()), 0x88ccff, 6, 0.2);
        }
        if (i.consume('chargeRelease') || !i.chargeHeld) {
          this.tryChargeRelease();
        } else if (i.peek('sub')) {
          // 溜めをキャンセルして回避
          this.setState('move');
          this.handleActions(true);
        }
        break;
      }
      case 'attack': {
        const mv = this.move!;
        // 長押し継続技（火炎放射・盾構えなど）
        if (mv.sustain) {
          const held = i.chargeHeld;
          if (this.isGuardHold()) {
            if (held && !this.holdRelease && this.stateT >= mv.startup * 0.9 && this.sustainT < mv.sustain) {
              this.stateT = mv.startup * 0.9;
              this.sustainT += dt;
            } else this.holdRelease = true;
          } else if (this.stateT >= mv.startup + mv.active * 0.5 && held && this.sustainT < mv.sustain && (!this.graft || this.graft.energy > 0)) {
            this.sustainT += dt;
            if (this.graft) this.graft.energy = Math.max(0, this.graft.energy - dt * 12);
          }
        }
        const act = this.activeLen();
        const total = mv.startup + act + mv.recovery;
        const t = this.stateT;
        if (t < mv.startup + act && mv.lunge) {
          let k = 1 - t / (mv.startup + act);
          const lockP = this.game.lockPoint() ?? this.game.nearestEnemy(this.pos, 3)?.pos;
          if (lockP && Math.hypot(lockP.x - this.pos.x, lockP.z - this.pos.z) < mv.reach * 0.55) k *= 0.15;
          speedTarget = mv.lunge * (0.4 + k);
          moveDir = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
        }
        if (t < mv.startup) {
          // 予備動作中はロック対象へ追尾
          const lp = this.game.lockPoint();
          if (lp) this.facing = turnTowards(this.facing, Math.atan2(lp.x - this.pos.x, lp.z - this.pos.z), 10 * dt);
          else if (mag > 0.3) this.facing = turnTowards(this.facing, Math.atan2(dir.x, dir.z), 8 * dt);
        }
        allowTurn = false;
        // 多段ヒット判定
        if (t >= mv.startup && t < mv.startup + act) {
          const hits = mv.hits ?? 1;
          const interval = mv.sustain && !this.isGuardHold() ? mv.active / hits : act / hits;
          const pulse = Math.floor((t - mv.startup) / interval);
          if (pulse !== this.hitPulse) {
            this.hitPulse = pulse;
            this.hitEnemies.clear();
            if (mv.anim === 'spin' || (mv.hits ?? 1) > 2) this.game.sfx(this.graft?.def.id === 'sawaxe' ? 'saw' : 'swing');
            if (mv.fire) this.game.sfx('fire');
          }
          this.game.performPlayerHits(this, mv);
          if (mv.fire && (mv.anim === 'graftBeam' || this.moveKind === 'graft' || this.moveKind === 'graftSpecial')) {
            const hand = this.rig.handL.getWorldPosition(new THREE.Vector3());
            const f = new THREE.Vector3(Math.sin(this.facing), mv.lift ? 0.8 : -0.05, Math.cos(this.facing)).normalize();
            this.game.fx.fire(hand, f, 5, 0.18, mv.reach * 2.2);
            this.game.burnCheck(hand, f, mv.reach);
          }
          if (this.graft?.def.id === 'sawaxe') {
            const saw = this.graft.mesh.getObjectByName('saw');
            if (saw) saw.rotation.y += dt * 40;
            if (Math.random() < 0.5) this.game.fx.sparks(this.rig.handL.getWorldPosition(new THREE.Vector3()), 2);
          }
        }
        const cancel = t >= mv.startup + act + mv.recovery * (mv.cancelAt ?? 0.4);
        if (t >= total) {
          this.comboResetT = 0;
          this.afterMove();
          if (this.state === 'attack') this.setState('move');
          this.handleActions(true);
        } else if (cancel) {
          if (this.handleActions(true)) this.comboResetT = 0;
        }
        break;
      }
      case 'recoil':
        if (this.stateT > 0.28) this.setState('move');
        speedTarget = 0;
        break;
      case 'step': {
        const k = this.stateT / STEP_TIME;
        const boost = b.cores.has('steamBoost') ? 1.15 : 1;
        speedTarget = STEP_SPEED * boost * Math.max(0.15, 1 - k * k);
        moveDir = this.stepDir;
        allowTurn = false;
        if (this.stateT >= STEP_TIME) this.setState('move');
        else if (this.stateT > STEP_TIME * 0.6 && this.handleActions(true)) {
          /* キャンセル */
        }
        break;
      }
      case 'parry':
        allowTurn = false;
        if (this.stateT >= PARRY_TIME) this.setState('move');
        else if (this.stateT > PARRY_WINDOW + 0.05) this.handleActions(true);
        break;
      case 'hurt':
        allowTurn = false;
        if (this.stateT >= this.hurtT && this.grounded) this.setState('move');
        break;
      case 'heal':
        speedTarget = 1.2 * mag;
        if (this.stateT > 0.5 && this.stateT - dt <= 0.5) {
          this.hp = Math.min(this.hpMax, this.hp + this.hpMax * 0.45);
          this.game.sfx('heal');
          this.game.fx.ring(this.pos, 0xffa040, 2, 0.6);
          for (let n = 0; n < 20; n++) this.game.fx.pulseMote(this.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 2, (Math.random() - 0.5) * 1.2)), 0xffa040);
        }
        if (this.stateT >= 1.0) this.setState('move');
        break;
      case 'grafting':
        allowTurn = false;
        if (this.stateT >= 0.5) {
          this.finishGraft();
          this.setState('move');
        }
        break;
      case 'purgeAim':
        this.aimFacing(false);
        allowTurn = false;
        speedTarget = 1.5 * mag;
        if (this.graft) {
          // 暴走：赤く脈動
          if (Math.random() < 0.6) this.game.fx.sparks(this.rig.handL.getWorldPosition(new THREE.Vector3()), 1, 0xff4020);
        }
        if (i.consume('purgeRelease') || !i.purgeHeld) {
          if (this.graft && this.stateT > 0.15) {
            const g = this.graft;
            const from = this.rig.handL.getWorldPosition(new THREE.Vector3());
            this.graft.mesh.parent?.remove(this.graft.mesh);
            this.graft = null;
            if (this.weapon2) this.weapon2.visible = true;
            this.game.throwPurge(from, this.facing, g);
            this.game.onGraftChanged();
            this.setState('throw');
          } else this.setState('move');
        }
        break;
      case 'throw':
        if (this.stateT > 0.4) this.setState('move');
        break;
      case 'dead':
        allowTurn = false;
        break;
    }

    // グラフトの耐久エネルギー切れ
    if (this.graft && this.graft.energy <= 0 && this.state !== 'attack') this.dropGraft(true);

    // 移動・物理
    const lvl = this.game.level;
    if (allowTurn && mag > 0.1 && (this.state === 'move' || this.state === 'heal')) {
      this.facing = turnTowards(this.facing, Math.atan2(dir.x, dir.z), 14 * dt);
    }
    const hv = new THREE.Vector3(this.vel.x, 0, this.vel.z);
    const want = moveDir.clone().setY(0);
    if (want.lengthSq() > 0) want.normalize();
    want.multiplyScalar(speedTarget);
    if (this.state === 'hurt') {
      hv.multiplyScalar(1 - damp(5, dt));
    } else {
      const accel = this.state === 'move' ? (speedTarget > hv.length() ? 16 : 20) : 30;
      hv.lerp(want, damp(accel, dt));
    }
    if (!this.grounded && this.state === 'move') hv.lerp(want, damp(3, dt));
    this.vel.x = hv.x;
    this.vel.z = hv.z;
    this.lastSpeed = hv.length();

    this.vel.y += GRAVITY * dt;
    // 空中攻撃中は落下を緩める
    if (this.state === 'attack' && !this.grounded && this.inActive) this.vel.y = Math.max(this.vel.y, -2);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    lvl.resolve(this.pos, this.radius, this.height);
    this.game.pushOutOfEnemies(this.pos, this.radius);
    this.pos.y += this.vel.y * dt;
    const ground = lvl.groundAt(this.pos.x, this.pos.z, this.pos.y + Math.max(0, -this.vel.y * dt), this.radius);
    if (this.pos.y <= ground && this.vel.y <= 0) {
      if (!this.grounded && this.vel.y < -12) {
        this.game.cam.addShake('flesh', 0.5);
        this.game.sfx('step');
      }
      this.pos.y = ground;
      this.vel.y = 0;
      this.grounded = true;
      this.airJumps = b.cores.has('doubleJump') ? 1 : 0;
      this.airSteps = b.cores.has('doubleJump') ? 1 : 0;
    } else if (this.pos.y > ground + 0.05) {
      this.grounded = false;
    }
    if (this.pos.y < -60 && this.state !== 'dead') {
      this.hp = 0;
      this.setState('dead');
      this.game.onPlayerDeath();
    }
  }

  private afterMove(): void {
    this.move = null;
  }

  /** 見た目の更新（実時間でも呼ばれる） */
  animate(dt: number): void {
    this.group.position.copy(this.pos);
    this.rig.root.rotation.y = this.facing;
    const r = this.rig;
    const speed = this.lastSpeed;
    this.walkAmt += ((this.state === 'move' || this.state === 'heal' || this.state === 'charge' || this.state === 'purgeAim') && this.grounded ? Math.min(1, speed / RUN_SPEED) : 0) - this.walkAmt;
    this.walkPhase += dt * (4 + speed * 1.6);
    let spin = 0;
    switch (this.state) {
      case 'attack': {
        const mv = this.move!;
        const sw = SWINGS[mv.anim];
        const act = this.activeLen();
        const t = this.stateT;
        if (t < mv.startup) r.apply(NEUTRAL, sw.windup, Math.min(1, t / Math.max(0.01, mv.startup * 0.8)));
        else if (t < mv.startup + act) {
          const k = (t - mv.startup) / Math.max(0.01, act);
          if (sw.spin) {
            r.apply(sw.strike);
            spin = k * Math.PI * 2 * Math.max(1, Math.round((mv.hits ?? 2) / 3));
          } else if (mv.sustain && !this.isGuardHold()) r.apply(sw.strike);
          else r.apply(sw.windup, sw.strike, Math.min(1, k * 1.6));
        } else {
          const k = (t - mv.startup - act) / Math.max(0.01, mv.recovery);
          r.apply(sw.strike, NEUTRAL, Math.min(1, k * k));
        }
        // 剣閃トレイル
        if (t >= mv.startup - 0.03 && t < mv.startup + act + 0.06 && !mv.anim.startsWith('graft')) {
          this.trail.push(this.weaponBase.getWorldPosition(new THREE.Vector3()), this.weaponTip.getWorldPosition(new THREE.Vector3()));
        } else this.trail.stop();
        break;
      }
      case 'charge': {
        const sw = SWINGS[this.game.build.charge.anim];
        r.apply(NEUTRAL, sw.windup, Math.min(1, this.chargeT * 4));
        r.j.torso.rotation.z += Math.sin(this.chargeT * 60) * 0.01 * Math.min(1, this.chargeT);
        r.addWalk(this.walkPhase, this.walkAmt * 0.5);
        break;
      }
      case 'step':
        r.apply(NEUTRAL, STEP_POSE, Math.sin(Math.min(1, this.stateT / STEP_TIME) * Math.PI));
        break;
      case 'parry':
        r.apply(NEUTRAL, PARRY_POSE, Math.min(1, this.stateT * 14));
        this.gripAngle = Math.PI * 0.6;
        break;
      case 'recoil':
        r.apply(HURT_POSE, NEUTRAL, Math.min(1, this.stateT / 0.28));
        break;
      case 'hurt':
        r.apply(HURT_POSE, NEUTRAL, Math.min(1, this.stateT / this.hurtT));
        break;
      case 'heal':
        r.apply(NEUTRAL, HEAL_POSE, Math.sin(Math.min(1, this.stateT) * Math.PI));
        r.addWalk(this.walkPhase, this.walkAmt * 0.4);
        break;
      case 'grafting':
        r.apply(NEUTRAL, GRAFT_POSE, Math.min(1, this.stateT * 8));
        break;
      case 'purgeAim':
        r.apply(NEUTRAL, PURGE_POSE, Math.min(1, this.stateT * 6));
        break;
      case 'throw':
        r.apply(PURGE_POSE, THROW_POSE, Math.min(1, this.stateT * 10));
        break;
      case 'dead':
        r.apply(NEUTRAL, DEAD_POSE, Math.min(1, this.stateT * 2.5));
        break;
      default: {
        r.apply(NEUTRAL);
        r.addWalk(this.walkPhase, this.walkAmt);
        if (!this.grounded) r.apply(NEUTRAL, STEP_POSE, 0.35);
        const breathe = Math.sin(this.game.time.realTime * 2.2) * 0.03;
        r.j.torso.rotation.x += breathe;
      }
    }
    if (this.state !== 'attack' && this.state !== 'parry') this.gripAngle += (Math.PI * 0.62 - this.gripAngle) * damp(10, dt);
    this.grip.rotation.x = this.gripAngle;
    r.j.root.rotation.y = this.facing + spin;
    r.j.hips.position.y = r.hipHeight + (this.state === 'dead' ? -0.6 * Math.min(1, this.stateT * 2) : 0);
    if (this.state !== 'move') r.j.hips.position.y = Math.max(r.j.hips.position.y, this.state === 'dead' ? 0.3 : r.hipHeight - 0.05);

    // ソケットの発光（接続中は耐久に応じて）
    const sm = this.socketGlow.material as THREE.MeshBasicMaterial;
    if (this.graft) sm.color.setHSL(0.55 - (1 - this.graft.energy / this.graft.max) * 0.55, 1, 0.55);
    else sm.color.set(0x2a6070);
    this.trail.update(dt);
    void angleDiff;
    void clamp;
  }

  /** 攻撃の打点（ワールド座標） */
  strikePoint(mv: MoveDef, out: THREE.Vector3, dist: number): THREE.Vector3 {
    const f = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
    const h = mv.anim === 'rising' || mv.lift ? 1.9 : mv.anim === 'smash' ? 0.8 : mv.anim === 'overhead' ? 1.5 : 1.25;
    return out.copy(this.pos).addScaledVector(f, Math.min(dist, mv.reach * 0.8)).setY(this.pos.y + h);
  }

  get isGuarding(): boolean {
    return this.state === 'attack' && !!this.move?.guard && this.stateT < (this.move.startup + this.activeLen());
  }

  chargeProgress(): number {
    if (this.state !== 'charge') return 0;
    return clamp(this.chargeT / this.game.build.skeleton.chargeTime, 0, 1);
  }

  poseCheck(): Pose {
    return NEUTRAL;
  }
}
