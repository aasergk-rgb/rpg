import * as THREE from 'three';
import { HumanoidEnemy } from './Humanoid';
import { Rig } from '../../render/Rig';
import { M } from '../../render/Materials';
import { makePart } from '../Parts';
import { buildGraftMesh } from '../GraftModels';
import { angleDiff } from '../../core/MathUtil';
import type { Game } from '../Game';

/** 狂った鎧騎士：大盾で正面の攻撃を受け止める */
export class Knight extends HumanoidEnemy {
  readonly type = 'knight' as const;
  readonly name = '狂える鎧騎士';

  constructor(game: Game) {
    super(game);
    this.hp = this.hpMax = 190;
    this.poise = this.poiseMax = 50;
    this.stunMax = 70;
    this.speed = 2.6;
    this.radius = 0.55;
    this.height = 2.1;
    this.flinchOnHit = false;
    const rig = new Rig({ torsoMat: M.darkSteel(), limbMat: M.darkSteel(), headMat: M.darkSteel(), handMat: M.iron(), legMat: M.iron(), helm: 'helm', bulk: 1.2, scale: 1.1 });
    this.buildRig(rig);
    // 剣
    const sword = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.03), M.steel());
    blade.position.y = 0.65;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.06), M.rust());
    guard.position.y = 0.1;
    sword.add(blade, guard);
    sword.rotation.x = Math.PI;
    rig.handR.add(sword);
    // 大盾（グラフト可能部位）
    const shield = buildGraftMesh('shield', 1);
    shield.position.set(0.05, -0.1, 0.2);
    shield.rotation.set(-Math.PI / 2 + 0.2, 0, 0);
    rig.handL.add(shield);
    // 外套の房
    const plume = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.4, 5), M.flesh());
    plume.position.set(0, 0.38, -0.05);
    plume.rotation.x = -0.6;
    rig.j.head.add(plume);

    this.parts = {
      body: makePart({ id: 'body', name: '胴鎧', hp: 9999, armor: 35, radius: 0.5 }),
      shield: makePart({ id: 'shield', name: '左腕（大盾）', hp: 45, armor: 45, severable: true, graft: 'shield', radius: 0.55 }),
      head: makePart({ id: 'head', name: '兜（覗き穴）', hp: 35, armor: 25, weak: 2.4, radius: 0.25 }),
    };
    this.partOrder = ['body', 'shield', 'head'];
    this.partNodes = {
      body: this.anchor(rig.j.torso, 0, 0.3, 0),
      shield: this.anchor(shield, 0, 0, 0),
      head: this.anchor(rig.j.head, 0, 0.14, 0.05),
    };
    this.partVisuals = { shield: [shield], head: [rig.j.head], body: [rig.j.torso.children[0], rig.j.torso.children[1]] };
    this.idlePose = { shoulderL: [-1.1, -0.5, 0], elbowL: [-1.2, 0, 0], shoulderR: [-0.3, 0, -0.2], elbowR: [-0.6, 0, 0], torso: [0.1, 0, 0] };
    this.poses = {
      slash: { windup: { shoulderR: [-2.6, -0.9, 0], elbowR: [-0.6, 0, 0], torso: [0, 0.5, 0], shoulderL: [-1.1, -0.5, 0], elbowL: [-1.2, 0, 0] }, strike: { shoulderR: [-1.0, 1.0, 0], elbowR: [0, 0, 0], torso: [0.3, -0.5, 0], shoulderL: [-1.1, -0.5, 0], elbowL: [-1.2, 0, 0] } },
      thrust: { windup: { shoulderR: [-1.0, -0.3, 0], elbowR: [-2.0, 0, 0], torso: [0, 0.6, 0], shoulderL: [-1.1, -0.5, 0] }, strike: { shoulderR: [-1.6, 0, 0], elbowR: [0, 0, 0], torso: [0.3, -0.3, 0], shoulderL: [-1.1, -0.5, 0] } },
      bash: { windup: { shoulderL: [-0.8, -0.9, 0], elbowL: [-1.6, 0, 0], torso: [0, -0.5, 0] }, strike: { shoulderL: [-1.6, 0.1, 0], elbowL: [-0.3, 0, 0], torso: [0.3, 0.4, 0] } },
      charge: { windup: { shoulderR: [-1.0, -0.6, 0], elbowR: [-1.8, 0, 0], torso: [0.4, 0.5, 0], hipL: [-0.8, 0, 0], kneeL: [1.0, 0, 0], shoulderL: [-1.3, -0.4, 0] }, strike: { shoulderR: [-1.6, 0, 0], elbowR: [0, 0, 0], torso: [0.5, -0.2, 0], shoulderL: [-1.3, -0.4, 0] } },
      default: { windup: { shoulderR: [-2, 0, 0] }, strike: { shoulderR: [-0.6, 0, 0] } },
    };
    this.patterns = [
      { id: 'slash', name: '袈裟斬り', anim: 'slash', windup: 0.6, active: 0.16, recovery: 0.6, damage: 30, range: 2.3, arc: 120, weight: 3, track: 3.5 },
      { id: 'thrust', name: '刺突', anim: 'thrust', windup: 0.65, active: 0.18, recovery: 0.6, damage: 32, range: 3.0, arc: 40, lunge: 4, weight: 2 },
      { id: 'bash', name: '盾打ち', anim: 'bash', windup: 0.45, active: 0.14, recovery: 0.5, damage: 20, range: 1.7, arc: 90, knock: 6, weight: 2, requires: ['shield'] },
      { id: 'charge', name: '咆哮突撃', anim: 'charge', windup: 0.95, active: 0.32, recovery: 0.9, damage: 42, range: 3.8, arc: 50, lunge: 10, red: true, heavy: true, knock: 8, weight: 1, minRange: 2 },
    ];
    this.finalizeModel();
  }

  /** 盾が健在なら正面からの攻撃は盾が受ける */
  protected redirectPart(partId: string, from: THREE.Vector3): string {
    if (partId === 'shield' || !this.partAvailable('shield') || this.state === 'stagger' || this.state === 'down' || this.state === 'attack') return partId;
    const ang = Math.abs(angleDiff(this.facing, Math.atan2(from.x - this.pos.x, from.z - this.pos.z)));
    return ang < 1.2 ? 'shield' : partId;
  }

  protected onSever(partId: string): void {
    super.onSever(partId);
    if (partId === 'shield') {
      this.idlePose = { ...this.idlePose, shoulderL: [-0.2, 0, 0.3], elbowL: [-0.3, 0, 0] };
      this.speed = 3.1;
      this.game.hud.toast('大盾を失った鎧騎士が猛攻に転じる');
    }
  }

  protected cooldownAfter(): number {
    return this.partAvailable('shield') ? super.cooldownAfter() : super.cooldownAfter() * 0.5;
  }
}
