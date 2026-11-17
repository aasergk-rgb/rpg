import * as THREE from 'three';
import { angleDiff, damp, turnTowards } from '../core/MathUtil';
import { rng } from '../core/Rng';
import { pulseMaterial } from '../render/Materials';
import { resolveHit, type HitInput, type HitResult, type PartState } from './Parts';
import type { Game } from './Game';

export type EnemyType = 'ghoul' | 'knight' | 'brute' | 'hound' | 'galahad';
export type EnemyStateName = 'idle' | 'chase' | 'attack' | 'stagger' | 'down' | 'flinch' | 'dead' | 'roar' | 'recover';

export interface EnemyAttack {
  id: string;
  name: string;
  anim: string;
  windup: number;
  active: number;
  recovery: number;
  damage: number;
  range: number;
  arc: number;
  weight: number;
  /** パリィ不能の赤い咆哮攻撃 */
  red?: boolean;
  lunge?: number;
  hits?: number;
  requires?: string[];
  minRange?: number;
  track?: number;
  knock?: number;
  heavy?: boolean;
  fire?: boolean;
  /** 低い攻撃（ジャンプで回避可） */
  low?: boolean;
  /** 攻撃後に連携する技 */
  chain?: string;
}

/** 敵の基底クラス。部位・状態遷移・AI・被弾処理を共通化する */
export abstract class Enemy {
  abstract readonly type: EnemyType;
  abstract readonly name: string;
  readonly group = new THREE.Group();
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  facing = 0;
  radius = 0.6;
  height = 2;
  hp = 100;
  hpMax = 100;
  poise = 30;
  poiseMax = 30;
  stun = 0;
  stunMax = 60;
  speed = 3;
  aggroRange = 13;
  boss = false;
  state: EnemyStateName = 'idle';
  stateT = 0;
  attack: EnemyAttack | null = null;
  attackCooldown = 0.8;
  hitPulse = -1;
  hitThisPulse = false;
  patterns: EnemyAttack[] = [];
  parts: Record<string, PartState> = {};
  /** 部位の当たり判定アンカー */
  partNodes: Record<string, THREE.Object3D> = {};
  /** 部位メッシュ（脈動・切断時の非表示） */
  partVisuals: Record<string, THREE.Object3D[]> = {};
  /** 部位表示順（ロックオン切替順） */
  partOrder: string[] = [];
  bodyPart = 'body';
  spawnId = '';
  home = new THREE.Vector3();
  deadT = 0;
  removed = false;
  /** パリィ直後の致命の隙 */
  riposte = 0;
  burn = 0;
  private burnTick = 0;
  protected walkPhase = 0;
  protected moveAmt = 0;
  protected pulseMats: THREE.MeshStandardMaterial[] = [];
  /** 他の敵と押し合うか */
  solid = true;
  staggerTime = 1.5;
  downTime = 2.6;
  /** ひるみやすさ（雑魚は毎ヒットひるむ） */
  flinchOnHit = true;
  hitFlash = 0;
  /** 赤攻撃予兆用 */
  redGlow = 0;

  constructor(protected game: Game) {}

  /** モデル構築後に呼ぶ：部位メッシュに脈動マテリアルを適用 */
  protected finalizeModel(): void {
    for (const [id, objs] of Object.entries(this.partVisuals)) {
      const part = this.parts[id];
      if (!part || (!part.severable && part.armorMax === 0 && part.weak <= 1)) continue;
      for (const o of objs)
        o.traverse((m) => {
          const mesh = m as THREE.Mesh;
          if (!mesh.isMesh) return;
          const base = mesh.material as THREE.MeshStandardMaterial;
          if (!base.isMeshStandardMaterial) return;
          const pm = pulseMaterial(base, part.severable ? 0x66ccff : 0x8899cc);
          pm.userData.part = id;
          mesh.material = pm;
          this.pulseMats.push(pm);
        });
    }
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.userData.enemy = this;
      }
    });
    this.game.scene.add(this.group);
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }

  get partList(): string[] {
    return this.partOrder.filter((p) => !this.parts[p].severed);
  }

  partWorldPos(id: string, out = new THREE.Vector3()): THREE.Vector3 {
    const n = this.partNodes[id];
    if (!n) return out.copy(this.pos).setY(this.pos.y + this.height * 0.5);
    return n.getWorldPosition(out);
  }

  get center(): THREE.Vector3 {
    return this.partWorldPos(this.bodyPart);
  }

  partAvailable(id: string): boolean {
    const p = this.parts[id];
    return !!p && !p.severed;
  }

  protected setState(s: EnemyStateName): void {
    this.state = s;
    this.stateT = 0;
    this.hitPulse = -1;
  }

  /** 正面への被弾をリダイレクト（盾など）。既定は無し */
  protected redirectPart(partId: string, _from: THREE.Vector3): string {
    return partId;
  }

  takeHit(partId: string, hit: HitInput, from: THREE.Vector3, poiseDmg: number): HitResult & { part: string } {
    partId = this.redirectPart(partId, from);
    const part = this.parts[partId] ?? this.parts[this.bodyPart];
    if (this.riposte > 0) hit = { ...hit, crit: true };
    const r = resolveHit(part, hit);
    let body = r.bodyDamage;
    if (this.state === 'down') body *= 1.35;
    this.hp = Math.max(0, this.hp - body);
    this.hitFlash = 1;
    if (hit.type === 'pierce' || r.feel === 'weak') this.stun += r.stun;
    this.poise -= poiseDmg * (r.feel === 'deflect' ? 0.3 : 1);
    if (r.severed) this.onSever(part.id);
    if (r.broke) this.onBreak(part.id);
    if (r.feel === 'armorBreak') this.onArmorBreak(part.id);

    if (this.hp <= 0) {
      this.die();
      return { ...r, part: part.id };
    }
    if (this.state !== 'down' && this.stun >= this.stunMax) {
      this.stun = 0;
      this.poise = this.poiseMax;
      this.setState('down');
      this.game.hud.toast(`${this.name}　大ダウン！`);
      this.game.sfx('armorBreak');
    } else if (this.state !== 'down' && this.state !== 'stagger' && (this.poise <= 0 || r.severed)) {
      this.poise = this.poiseMax;
      this.setState('stagger');
      this.attack = null;
    } else if (this.flinchOnHit && this.state !== 'down' && this.state !== 'stagger' && this.state !== 'attack' && r.feel !== 'deflect') {
      this.setState('flinch');
    }
    if (this.state === 'idle') this.setState('chase');
    return { ...r, part: part.id };
  }

  onParried(): void {
    this.attack = null;
    this.poise = this.poiseMax;
    this.riposte = this.staggerTime;
    this.setState('stagger');
  }

  protected onSever(partId: string): void {
    for (const o of this.partVisuals[partId] ?? []) o.visible = false;
    const p = this.parts[partId];
    const pos = this.partWorldPos(partId);
    this.game.fx.severBurst(pos);
    this.game.onPartSevered(this, p, pos);
  }

  protected onBreak(partId: string): void {
    this.game.hud.toast(`${this.parts[partId].name}　破壊`);
  }

  protected onArmorBreak(partId: string): void {
    this.game.hud.toast(`${this.parts[partId].name}の装甲を粉砕　肉が露出した`);
  }

  die(): void {
    if (this.state === 'dead') return;
    this.setState('dead');
    this.attack = null;
    this.game.onEnemyKilled(this);
  }

  protected available(a: EnemyAttack): boolean {
    return !a.requires || a.requires.every((r) => this.partAvailable(r));
  }

  protected chooseAttack(dist: number): EnemyAttack | null {
    const opts = this.patterns.filter((a) => this.available(a) && dist <= a.range + 0.6 && dist >= (a.minRange ?? 0));
    if (!opts.length) return null;
    return rng.weighted(opts.map((a) => ({ item: a, w: a.weight })));
  }

  /** 最大射程（接近の判断に使う） */
  protected engageRange(): number {
    const ok = this.patterns.filter((a) => this.available(a));
    if (!ok.length) return 1.5;
    return Math.min(...ok.map((a) => a.range)) * 0.9;
  }

  startAttack(a: EnemyAttack): void {
    this.attack = a;
    this.setState('attack');
    this.hitThisPulse = false;
    if (a.red) this.game.onRedAttack(this);
  }

  update(dt: number): void {
    if (dt <= 0) return;
    this.stateT += dt;
    this.riposte = Math.max(0, this.riposte - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 6);
    this.redGlow = Math.max(0, this.redGlow - dt * 1.5);
    this.stun = Math.max(0, this.stun - dt * 4);
    if (this.burn > 0) {
      this.burn -= dt;
      this.burnTick -= dt;
      if (this.burnTick <= 0) {
        this.burnTick = 0.5;
        this.hp = Math.max(0, this.hp - 4);
        if (this.hp <= 0) this.die();
      }
      if (Math.random() < 0.4) this.game.fx.fire(this.center, new THREE.Vector3(0, 1, 0), 1, 0.4, 1.5);
    }
    if (this.state === 'dead') {
      this.deadT += dt;
      return;
    }
    const player = this.game.player;
    const toP = player.pos.clone().sub(this.pos);
    toP.y = 0;
    const dist = Math.max(0, toP.length() - player.radius - this.radius * 0.5);
    const angTo = Math.atan2(toP.x, toP.z);
    let speed = 0;
    let moveDir = new THREE.Vector3();

    switch (this.state) {
      case 'idle':
        if (player.isAlive && dist < this.aggroRange && Math.abs(player.pos.y - this.pos.y) < 4 && !this.game.level.lineBlocked(this.pos, player.pos)) {
          this.setState(this.boss ? 'roar' : 'chase');
        }
        break;
      case 'roar':
        if (this.stateT > 1.6) this.setState('chase');
        break;
      case 'chase': {
        if (!player.isAlive) {
          this.setState('idle');
          break;
        }
        if (!this.boss && this.pos.distanceTo(this.home) > 28) {
          // 縄張りから離れすぎたら戻る
          moveDir = this.home.clone().sub(this.pos).setY(0).normalize();
          this.facing = turnTowards(this.facing, Math.atan2(moveDir.x, moveDir.z), 6 * dt);
          speed = this.speed;
          if (this.pos.distanceTo(this.home) < 2) this.setState('idle');
          break;
        }
        this.attackCooldown -= dt;
        this.facing = turnTowards(this.facing, angTo, this.turnRate() * dt);
        const eng = this.engageRange();
        if (this.attackCooldown <= 0 && Math.abs(angleDiff(this.facing, angTo)) < 0.6) {
          const a = this.chooseAttack(dist);
          if (a) {
            this.startAttack(a);
            break;
          }
        }
        if (dist > eng) {
          speed = this.speed;
          moveDir = toP.clone().normalize();
        } else if (dist < eng * 0.4) {
          speed = -this.speed * 0.4;
          moveDir = toP.clone().normalize();
        } else {
          // 間合いを測りながら横歩き
          const side = Math.sin(this.game.time.gameTime * 0.7 + this.pos.x) > 0 ? 1 : -1;
          moveDir = new THREE.Vector3(toP.z, 0, -toP.x).normalize().multiplyScalar(side);
          speed = this.speed * 0.35;
        }
        break;
      }
      case 'attack': {
        const a = this.attack!;
        const t = this.stateT;
        if (t < a.windup) {
          this.facing = turnTowards(this.facing, angTo, (a.track ?? 3) * dt);
        }
        if (a.lunge && t >= a.windup * 0.7 && t < a.windup + a.active) {
          const far = dist > 0.5;
          speed = far ? a.lunge : 0;
          moveDir = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
        }
        if (t >= a.windup && t < a.windup + a.active) {
          const hits = a.hits ?? 1;
          const pulse = Math.floor(((t - a.windup) / a.active) * hits);
          if (pulse !== this.hitPulse) {
            this.hitPulse = pulse;
            this.hitThisPulse = false;
            this.onAttackPulse(a, pulse);
          }
          if (!this.hitThisPulse && this.checkHitPlayer(a)) {
            this.hitThisPulse = true;
            this.game.enemyHitsPlayer(this, a);
          }
        }
        if (t >= a.windup + a.active + a.recovery) {
          const chain = a.chain ? this.patterns.find((p) => p.id === a.chain) : null;
          if (chain && this.available(chain) && dist < chain.range + 1) this.startAttack(chain);
          else {
            this.attack = null;
            this.attackCooldown = this.cooldownAfter();
            this.setState('chase');
          }
        }
        break;
      }
      case 'flinch':
        if (this.stateT > 0.32) this.setState('chase');
        break;
      case 'stagger':
        if (this.stateT > this.staggerTime) this.setState('chase');
        break;
      case 'down':
        if (this.stateT > this.downTime) this.setState('recover');
        break;
      case 'recover':
        if (this.stateT > 0.6) this.setState('chase');
        break;
    }

    const want = moveDir.multiplyScalar(speed);
    this.vel.x += (want.x - this.vel.x) * damp(10, dt);
    this.vel.z += (want.z - this.vel.z) * damp(10, dt);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.game.level.resolve(this.pos, this.radius, this.height, 0.5);
    const g = this.game.level.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.3, this.radius * 0.5);
    if (g > -Infinity) this.pos.y += (g - this.pos.y) * damp(20, dt);
    this.moveAmt = Math.hypot(this.vel.x, this.vel.z) / Math.max(1, this.speed);
    this.walkPhase += dt * (3 + Math.hypot(this.vel.x, this.vel.z) * 1.6);
  }

  protected turnRate(): number {
    return 4;
  }

  protected cooldownAfter(): number {
    return this.boss ? rng.range(0.15, 0.6) : rng.range(0.5, 1.5);
  }

  protected onAttackPulse(_a: EnemyAttack, _pulse: number): void {}

  protected checkHitPlayer(a: EnemyAttack): boolean {
    const p = this.game.player;
    if (!p.isAlive) return false;
    const d = p.pos.clone().sub(this.pos);
    const dy = d.y;
    d.y = 0;
    const dist = d.length() - p.radius - this.radius * 0.3;
    if (dist > a.range) return false;
    if (dy > this.height + 0.3 || dy < -1.5) return false;
    if (a.low && dy > 0.7) return false;
    const ang = Math.abs(angleDiff(this.facing, Math.atan2(d.x, d.z)));
    return ang <= ((a.arc / 2) * Math.PI) / 180 || dist < 0.3;
  }

  /** 部位の脈動・被弾フラッシュ */
  protected updateVisualFx(time: number): void {
    const pulse = 0.5 + 0.5 * Math.sin(time * 4 + this.pos.x);
    const lock = this.game.lock;
    for (const m of this.pulseMats) {
      const id = m.userData.part as string;
      const part = this.parts[id];
      const targeted = lock.target === this && lock.partId === id;
      const base = part.armor > 0 ? 0.15 : 0.45;
      m.emissiveIntensity = base * pulse + (targeted ? 0.2 + pulse * 0.25 : 0) + this.hitFlash * 1.2;
      if (part.armor <= 0 && part.armorMax > 0) m.emissive.setHex(0xff3030);
    }
  }

  abstract animate(dt: number, time: number): void;

  dispose(): void {
    this.game.scene.remove(this.group);
    this.removed = true;
  }
}
