import * as THREE from 'three';
import { HumanoidEnemy } from './Humanoid';
import { Rig } from '../../render/Rig';
import { M, mat } from '../../render/Materials';
import { makePart } from '../Parts';
import { buildGraftMesh } from '../GraftModels';
import type { Game } from '../Game';

/** 岩殻の剛獣：右腕が巨大な「怪力の剛腕」 */
export class Brute extends HumanoidEnemy {
  readonly type = 'brute' as const;
  readonly name = '岩殻の剛獣';

  constructor(game: Game) {
    super(game);
    this.hp = this.hpMax = 330;
    this.poise = this.poiseMax = 80;
    this.stunMax = 90;
    this.speed = 2.3;
    this.radius = 0.95;
    this.height = 3.1;
    this.flinchOnHit = false;
    this.staggerTime = 1.7;
    const rig = new Rig({ torsoMat: M.bruteHide(), limbMat: M.bruteHide(), headMat: M.bone(), handMat: M.bruteHide(), helm: 'skull', bulk: 1.7, scale: 1.6, armLen: 1.2 });
    this.buildRig(rig);
    const arm = buildGraftMesh('brutearm', 1.6);
    arm.position.set(0, 0.1, 0);
    rig.j.elbowR.add(arm);
    // 背中の岩
    const rockMat = mat('rock', { color: 0x6a6058, roughness: 0.95, rim: 0xff5533, rimStrength: 0.4 });
    for (let i = 0; i < 5; i++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.15 + Math.random() * 0.12, 0), rockMat);
      r.position.set((Math.random() - 0.5) * 0.5, 0.35 + Math.random() * 0.35, -0.2);
      rig.j.torso.add(r);
    }
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), M.eye());
    eye.position.set(0.06, 0.12, 0.14);
    rig.j.head.add(eye, eye.clone().translateX(-0.12));

    this.parts = {
      body: makePart({ id: 'body', name: '胴体', hp: 9999, radius: 0.7 }),
      armR: makePart({ id: 'armR', name: '右腕（怪力の剛腕）', hp: 75, armor: 50, severable: true, graft: 'brutearm', radius: 0.55 }),
      head: makePart({ id: 'head', name: '頭部', hp: 60, weak: 2.0, radius: 0.35 }),
      legs: makePart({ id: 'legs', name: '脚部', hp: 90, radius: 0.5 }),
    };
    this.partOrder = ['body', 'armR', 'head', 'legs'];
    this.partNodes = {
      body: this.anchor(rig.j.torso, 0, 0.3, 0.1),
      armR: this.anchor(arm, 0, -0.1, 0),
      head: this.anchor(rig.j.head, 0, 0.12, 0),
      legs: this.anchor(rig.j.kneeL, 0, -0.1, 0),
    };
    this.partVisuals = { armR: [rig.j.elbowR], head: [rig.j.head], legs: [rig.j.hipL, rig.j.hipR] };
    this.idlePose = { torso: [0.35, 0, 0], head: [-0.3, 0, 0], shoulderR: [-0.3, 0, -0.3], elbowR: [-0.4, 0, 0], shoulderL: [-0.3, 0, 0.3], elbowL: [-0.4, 0, 0], hipL: [-0.3, 0, 0], hipR: [-0.3, 0, 0], kneeL: [0.5, 0, 0], kneeR: [0.5, 0, 0] };
    this.poses = {
      smash: { windup: { torso: [-0.3, 0, 0], shoulderR: [-3.0, 0, 0], elbowR: [-0.4, 0, 0] }, strike: { torso: [0.9, 0, 0], shoulderR: [-0.6, 0, 0], elbowR: [0, 0, 0], hipL: [-0.6, 0, 0], kneeL: [0.8, 0, 0] } },
      sweep: { windup: { torso: [0.3, -0.9, 0], shoulderR: [-1.4, -1.6, 0] }, strike: { torso: [0.4, 0.9, 0], shoulderR: [-1.4, 1.4, 0] } },
      backhand: { windup: { torso: [0.3, 0.8, 0], shoulderL: [-1.3, 1.5, 0] }, strike: { torso: [0.3, -0.6, 0], shoulderL: [-1.3, -1.0, 0] } },
      charge: { windup: { torso: [0.8, 0, 0], head: [-0.8, 0, 0], shoulderR: [-0.4, 0, -0.6], shoulderL: [-0.4, 0, 0.6] }, strike: { torso: [1.0, 0, 0], shoulderR: [-1.6, 0.4, 0], shoulderL: [-1.6, -0.4, 0] } },
      default: { windup: { shoulderR: [-2, 0, 0] }, strike: { shoulderR: [-0.6, 0, 0] } },
    };
    this.patterns = [
      { id: 'smash', name: '剛腕叩きつけ', anim: 'smash', windup: 0.9, active: 0.16, recovery: 0.85, damage: 50, range: 3.0, arc: 70, heavy: true, knock: 8, weight: 3, requires: ['armR'] },
      { id: 'sweep', name: '剛腕薙ぎ', anim: 'sweep', windup: 0.75, active: 0.2, recovery: 0.7, damage: 36, range: 2.8, arc: 170, knock: 6, weight: 2, requires: ['armR'] },
      { id: 'backhand', name: '裏拳', anim: 'backhand', windup: 0.5, active: 0.14, recovery: 0.5, damage: 26, range: 2.3, arc: 120, weight: 2 },
      { id: 'charge', name: '咆哮の突進', anim: 'charge', windup: 1.0, active: 0.45, recovery: 1.0, damage: 55, range: 3.4, arc: 60, lunge: 11, red: true, heavy: true, knock: 10, weight: 1.2, minRange: 3, requires: ['legs'] },
    ];
    this.finalizeModel();
  }

  protected onBreak(partId: string): void {
    super.onBreak(partId);
    if (partId === 'legs') {
      this.speed = 1.2;
      this.game.hud.toast('脚を砕いた　剛獣は突進できない');
    }
  }

  protected onSever(partId: string): void {
    super.onSever(partId);
    if (partId === 'armR') this.game.hud.toast('剛腕を断ち落とした！　接続して鉄格子をこじ開けろ');
  }
}
