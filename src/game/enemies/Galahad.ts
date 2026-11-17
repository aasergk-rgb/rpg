import * as THREE from 'three';
import { HumanoidEnemy } from './Humanoid';
import { Rig } from '../../render/Rig';
import { M, mat } from '../../render/Materials';
import { makePart } from '../Parts';
import { buildGraftMesh } from '../GraftModels';
import type { Game } from '../Game';
import type { EnemyAttack } from '../Enemy';

type GAttack = EnemyAttack & { phase?: 1 | 2 };

/**
 * 処刑騎士ガラハッド（序盤の壁ボス）
 * 巨大な蒸気回転斧を持つ重装騎士。大振りの縦斬りをパリィすると右腕の装甲が剥がれ、
 * 斬り落とせばボスの最強武器を奪える。右腕を失うと左手の短剣による連撃モードへ移行する。
 */
export class Galahad extends HumanoidEnemy {
  readonly type = 'galahad' as const;
  readonly name = '処刑騎士ガラハッド';
  private saw: THREE.Group;
  private dagger: THREE.Group;
  phase: 1 | 2 = 1;
  private lastAttackId = '';

  constructor(game: Game) {
    super(game);
    this.boss = true;
    this.hp = this.hpMax = 1600;
    this.poise = this.poiseMax = 130;
    this.stunMax = 160;
    this.speed = 2.7;
    this.radius = 1.25;
    this.height = 4.2;
    this.aggroRange = 22;
    this.flinchOnHit = false;
    this.staggerTime = 1.8;
    this.downTime = 3.2;
    const armor = mat('galArmor', { color: 0x3a3634, roughness: 0.3, metalness: 1, rim: 0xff4422, rimStrength: 0.7 });
    const rig = new Rig({ torsoMat: armor, limbMat: armor, headMat: armor, handMat: M.iron(), legMat: armor, helm: 'helm', bulk: 1.45, scale: 2.1 });
    this.buildRig(rig);
    // 肩当て・腰布
    for (const side of [-1, 1]) {
      const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), armor);
      pauldron.position.set(side * 0.47, 0.6, 0);
      pauldron.scale.set(1.2, 0.8, 1.1);
      rig.j.torso.add(pauldron);
    }
    const tabard = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.7), mat('tabard', { color: 0x4a0a0a, roughness: 0.9, side: THREE.DoubleSide }));
    tabard.position.set(0, -0.35, 0.17);
    rig.j.hips.add(tabard);
    // 処刑人の頭巾
    const hoodCone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.45, 6), mat('tabard', { color: 0x4a0a0a, roughness: 0.9, side: THREE.DoubleSide }));
    hoodCone.position.set(0, 0.42, -0.02);
    rig.j.head.add(hoodCone);
    // 蒸気回転斧
    this.saw = buildGraftMesh('sawaxe', 1.5);
    this.saw.position.set(0, -0.1, 0.1);
    this.saw.rotation.x = Math.PI * 0.95;
    rig.handR.add(this.saw);
    // 腰の短剣（第二形態で抜く）
    this.dagger = new THREE.Group();
    const db = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.55, 0.02), M.steel());
    db.position.y = 0.35;
    this.dagger.add(db);
    this.dagger.position.set(0.25, -0.05, 0.1);
    this.dagger.rotation.z = 0.5;
    rig.j.hips.add(this.dagger);

    this.parts = {
      body: makePart({ id: 'body', name: '胸甲', hp: 9999, armor: 70, radius: 0.9 }),
      armR: makePart({ id: 'armR', name: '右腕（蒸気回転斧）', hp: 140, armor: 90, severable: true, graft: 'sawaxe', radius: 0.7 }),
      head: makePart({ id: 'head', name: '兜', hp: 80, armor: 45, weak: 2.5, radius: 0.45 }),
      legs: makePart({ id: 'legs', name: '脚甲', hp: 140, armor: 40, radius: 0.6 }),
    };
    this.partOrder = ['body', 'armR', 'head', 'legs'];
    this.partNodes = {
      body: this.anchor(rig.j.torso, 0, 0.3, 0.1),
      armR: this.anchor(rig.j.elbowR, 0, -0.15, 0),
      head: this.anchor(rig.j.head, 0, 0.14, 0),
      legs: this.anchor(rig.j.kneeL, 0, -0.1, 0),
    };
    this.partVisuals = { armR: [rig.j.elbowR], head: [rig.j.head], legs: [rig.j.hipL, rig.j.hipR], body: [rig.j.torso.children[0], rig.j.torso.children[1]] };
    this.idlePose = { shoulderR: [-0.5, 0, -0.2], elbowR: [-0.5, 0, 0], shoulderL: [-0.3, 0, 0.2], elbowL: [-0.5, 0, 0], torso: [0.12, 0, 0] };
    this.poses = {
      vertical: { windup: { shoulderR: [-3.1, -0.1, 0], elbowR: [-0.6, 0, 0], torso: [-0.3, 0.2, 0], shoulderL: [-2.6, 0.3, 0] }, strike: { shoulderR: [-0.5, 0, 0], elbowR: [0, 0, 0], torso: [0.6, 0, 0], shoulderL: [-0.4, 0.2, 0], hipL: [-0.5, 0, 0], kneeL: [0.6, 0, 0] } },
      sweep: { windup: { shoulderR: [-1.5, -1.8, 0], elbowR: [-0.2, 0, 0], torso: [0.1, -0.9, 0] }, strike: { shoulderR: [-1.4, 1.5, 0], elbowR: [0, 0, 0], torso: [0.2, 0.9, 0] } },
      grind: { windup: { shoulderR: [-1.4, 0, 0], elbowR: [-1.0, 0, 0], torso: [0.2, -0.3, 0] }, strike: { shoulderR: [-1.5, 0.15, 0], elbowR: [-0.1, 0, 0], torso: [0.35, 0, 0] } },
      rush: { windup: { shoulderR: [-1.5, -1.2, 0], elbowR: [-0.2, 0, 0], torso: [0.3, -0.6, 0], hipL: [-0.9, 0, 0], kneeL: [1.0, 0, 0] }, strike: { shoulderR: [-1.5, -1.2, 0], elbowR: [-0.2, 0, 0], torso: [0.4, -0.6, 0] }, spin: true },
      stomp: { windup: { hipR: [-1.4, 0, 0], kneeR: [1.2, 0, 0], torso: [-0.2, 0, 0], shoulderL: [-0.6, 0, 0.6], shoulderR: [-0.6, 0, -0.6] }, strike: { hipR: [-0.2, 0, 0], kneeR: [0.2, 0, 0], torso: [0.4, 0, 0] } },
      dagger1: { windup: { shoulderL: [-1.4, 1.2, 0], elbowL: [-0.8, 0, 0], torso: [0, 0.5, 0] }, strike: { shoulderL: [-1.4, -1.0, 0], elbowL: [0, 0, 0], torso: [0.2, -0.6, 0] } },
      dagger2: { windup: { shoulderL: [-1.3, -1.0, 0], elbowL: [-0.5, 0, 0], torso: [0, -0.5, 0] }, strike: { shoulderL: [-1.4, 1.1, 0], elbowL: [0, 0, 0], torso: [0.2, 0.6, 0] } },
      stab: { windup: { shoulderL: [-1.0, 0.3, 0], elbowL: [-2.0, 0, 0], torso: [0, 0.6, 0] }, strike: { shoulderL: [-1.6, 0, 0], elbowL: [0, 0, 0], torso: [0.4, -0.4, 0] } },
      grab: { windup: { shoulderL: [-2.2, 0.8, 0], shoulderR: [-1.2, -0.6, 0], torso: [-0.3, 0, 0] }, strike: { shoulderL: [-1.5, 0, 0], torso: [0.6, 0, 0], shoulderR: [-1.4, 0, 0] } },
      default: { windup: { shoulderR: [-2, 0, 0] }, strike: { shoulderR: [-0.6, 0, 0] } },
    };
    const P: GAttack[] = [
      { id: 'vertical', name: '処刑の縦斬り', anim: 'vertical', windup: 1.05, active: 0.18, recovery: 1.0, damage: 62, range: 4.2, arc: 50, heavy: true, knock: 9, weight: 3, requires: ['armR'], phase: 1, track: 2.2 },
      { id: 'sweep', name: '回転斧の大薙ぎ', anim: 'sweep', windup: 0.85, active: 0.22, recovery: 0.8, damage: 46, range: 4.4, arc: 170, knock: 7, weight: 2.5, requires: ['armR'], phase: 1 },
      { id: 'grind', name: '鋸挽き', anim: 'grind', windup: 0.7, active: 0.9, recovery: 0.7, damage: 10, hits: 7, range: 3.4, arc: 60, weight: 2, requires: ['armR'], phase: 1, track: 1.5 },
      { id: 'rush', name: '処刑突進', anim: 'rush', windup: 1.15, active: 0.6, recovery: 1.1, damage: 22, hits: 3, range: 4.0, arc: 360, lunge: 12, red: true, heavy: true, knock: 9, weight: 1.6, requires: ['armR', 'legs'], phase: 1, minRange: 3 },
      { id: 'stomp', name: '踏みつけ', anim: 'stomp', windup: 0.65, active: 0.14, recovery: 0.6, damage: 30, range: 2.6, arc: 360, knock: 10, low: true, weight: 1.2 },
      { id: 'd1', name: '短剣・一閃', anim: 'dagger1', windup: 0.38, active: 0.12, recovery: 0.25, damage: 22, range: 2.6, arc: 110, weight: 3, phase: 2, chain: 'd2', track: 6 },
      { id: 'd2', name: '短剣・返し', anim: 'dagger2', windup: 0.28, active: 0.12, recovery: 0.25, damage: 22, range: 2.6, arc: 110, weight: 0, phase: 2, chain: 'd3', track: 6 },
      { id: 'd3', name: '短剣・刺殺', anim: 'stab', windup: 0.45, active: 0.16, recovery: 0.7, damage: 30, range: 3.0, arc: 40, lunge: 6, weight: 0, phase: 2, track: 4 },
      { id: 'stab', name: '踏み込み刺突', anim: 'stab', windup: 0.5, active: 0.2, recovery: 0.7, damage: 32, range: 4.5, arc: 40, lunge: 12, weight: 2, phase: 2, minRange: 2.5 },
      { id: 'grab', name: '咆哮の掴み', anim: 'grab', windup: 0.95, active: 0.3, recovery: 1.0, damage: 58, range: 3.6, arc: 60, lunge: 9, red: true, heavy: true, knock: 10, weight: 1.4, phase: 2 },
    ];
    this.patterns = P;
    this.finalizeModel();
  }

  protected available(a: EnemyAttack): boolean {
    const ga = a as GAttack;
    if (ga.phase && ga.phase !== this.phase) return false;
    return super.available(a);
  }

  startAttack(a: EnemyAttack): void {
    super.startAttack(a);
    this.lastAttackId = a.id;
  }

  /** 縦斬りをパリィすると右腕の装甲が剥がれる */
  onParried(): void {
    const wasVertical = this.lastAttackId === 'vertical' || this.lastAttackId === 'sweep';
    super.onParried();
    const arm = this.parts.armR;
    if (wasVertical && !arm.severed && arm.armor > 0) {
      arm.armor = Math.max(0, arm.armor - arm.armorMax * 0.6);
      this.game.hud.toast(arm.armor <= 0 ? '右腕の装甲が剥がれた！　関節を斬り落とせ' : '右腕の装甲に亀裂が走った');
      this.game.fx.sparks(this.partWorldPos('armR'), 40);
    }
  }

  protected onSever(partId: string): void {
    super.onSever(partId);
    if (partId === 'armR') {
      this.phase = 2;
      this.speed = 3.8;
      this.poiseMax = 90;
      this.staggerTime = 1.4;
      // 左手に短剣を持ち替える
      this.dagger.parent?.remove(this.dagger);
      this.dagger.position.set(0, -0.05, 0.05);
      this.dagger.rotation.set(Math.PI * 0.95, 0, 0);
      this.rig.handL.add(this.dagger);
      this.idlePose = { shoulderL: [-0.9, 0.3, 0], elbowL: [-1.0, 0, 0], shoulderR: [-0.2, 0, -0.3], torso: [0.25, 0, 0], hipL: [-0.3, 0, 0], kneeL: [0.4, 0, 0], kneeR: [0.3, 0, 0] };
      this.game.hud.banner('処刑騎士は短剣を抜いた', '素早い連撃モードへ移行');
      this.game.sfx('roar');
    }
  }

  protected onBreak(partId: string): void {
    super.onBreak(partId);
    if (partId === 'legs') {
      this.speed *= 0.65;
      this.game.hud.toast('脚甲を砕いた　処刑突進を封じた');
    }
  }

  protected turnRate(): number {
    return this.phase === 2 ? 5 : 2.6;
  }

  protected onAttackPulse(a: EnemyAttack, pulse: number): void {
    if (a.id === 'grind' || a.id === 'rush') this.game.sfx('saw');
    if (a.id === 'stomp' && pulse === 0) {
      this.game.fx.ring(this.pos, 0xffa060, 5, 0.4);
      this.game.cam.addShake('heavy', 0.6);
    }
    if (a.id === 'vertical' && pulse === 0) {
      const p = this.pos.clone().add(new THREE.Vector3(Math.sin(this.facing) * 3.5, 0.1, Math.cos(this.facing) * 3.5));
      this.game.fx.sparks(p, 30);
      this.game.cam.addShake('heavy', 0.8);
    }
  }

  animate(dt: number, time: number): void {
    super.animate(dt, time);
    // 回転ノコギリ
    const disc = this.saw.getObjectByName('saw');
    if (disc) {
      const fast = this.state === 'attack' && (this.attack?.id === 'grind' || this.attack?.id === 'rush');
      disc.rotation.y += dt * (fast ? 40 : 6);
    }
    if (Math.random() < 0.3 && this.partAvailable('armR')) this.game.fx.steam(this.saw.getWorldPosition(new THREE.Vector3()), 1);
  }
}
