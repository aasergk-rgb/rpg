import * as THREE from 'three';
import { HumanoidEnemy } from './Humanoid';
import { Rig } from '../../render/Rig';
import { M } from '../../render/Materials';
import { makePart } from '../Parts';
import type { Game } from '../Game';

/** 瘴気に侵された屍兵（雑魚） */
export class Ghoul extends HumanoidEnemy {
  readonly type = 'ghoul' as const;
  readonly name = '瘴気の屍兵';

  constructor(game: Game) {
    super(game);
    this.hp = this.hpMax = 95;
    this.poise = this.poiseMax = 18;
    this.stunMax = 40;
    this.speed = 3.3;
    this.radius = 0.45;
    this.height = 1.8;
    const rig = new Rig({ torsoMat: M.ghoulSkin(), limbMat: M.ghoulSkin(), headMat: M.bone(), handMat: M.bone(), helm: 'skull', bulk: 0.85, armLen: 1.25 });
    this.buildRig(rig);
    // 鉤爪
    for (let i = 0; i < 3; i++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.25, 4), M.bone());
      claw.position.set(-0.05 + i * 0.05, -0.12, 0.03);
      claw.rotation.x = Math.PI;
      rig.handR.add(claw);
    }
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), M.eye());
    eye.position.set(0.05, 0.13, 0.13);
    rig.j.head.add(eye, eye.clone().translateX(-0.1));

    this.parts = {
      body: makePart({ id: 'body', name: '胴体', hp: 9999, radius: 0.45 }),
      head: makePart({ id: 'head', name: '頭部', hp: 25, weak: 2.2, radius: 0.25 }),
      armR: makePart({ id: 'armR', name: '右腕（鉤爪）', hp: 35, severable: true, radius: 0.3 }),
    };
    this.partOrder = ['body', 'armR', 'head'];
    this.partNodes = {
      body: this.anchor(rig.j.torso, 0, 0.3, 0),
      head: this.anchor(rig.j.head, 0, 0.12, 0),
      armR: this.anchor(rig.j.elbowR, 0, -0.1, 0),
    };
    this.partVisuals = { armR: [rig.j.shoulderR], head: [rig.j.head] };
    this.idlePose = { torso: [0.45, 0, 0], head: [-0.3, 0, 0], shoulderR: [-0.4, 0, -0.2], shoulderL: [-0.4, 0, 0.2], elbowR: [-0.5, 0, 0], elbowL: [-0.5, 0, 0], hipL: [-0.2, 0, 0], hipR: [-0.2, 0, 0], kneeL: [0.3, 0, 0], kneeR: [0.3, 0, 0] };
    this.poses = {
      claw: { windup: { torso: [0.2, 0.6, 0], shoulderR: [-2.4, -0.8, 0], elbowR: [-1.0, 0, 0] }, strike: { torso: [0.6, -0.5, 0], shoulderR: [-0.9, 0.8, 0], elbowR: [0, 0, 0] } },
      bite: { windup: { torso: [-0.2, 0, 0], head: [-0.6, 0, 0], hipL: [-0.6, 0, 0], kneeL: [1.0, 0, 0] }, strike: { torso: [0.9, 0, 0], head: [-0.2, 0, 0], shoulderR: [-1.2, 0, 0], shoulderL: [-1.2, 0, 0] } },
      default: { windup: { shoulderR: [-2, 0, 0] }, strike: { shoulderR: [-0.6, 0, 0] } },
    };
    this.patterns = [
      { id: 'claw', name: '鉤爪', anim: 'claw', windup: 0.55, active: 0.14, recovery: 0.55, damage: 22, range: 1.7, arc: 110, weight: 3, requires: ['armR'], track: 5 },
      { id: 'claw2', name: '連爪', anim: 'claw', windup: 0.45, active: 0.14, recovery: 0.35, damage: 18, range: 1.7, arc: 110, weight: 1.5, requires: ['armR'], chain: 'claw', track: 5 },
      { id: 'bite', name: '飛びかかり噛み', anim: 'bite', windup: 0.65, active: 0.22, recovery: 0.7, damage: 26, range: 2.6, arc: 50, lunge: 7, weight: 2, minRange: 1 },
    ];
    this.finalizeModel();
  }

  protected onSever(partId: string): void {
    super.onSever(partId);
    if (partId === 'armR') this.speed *= 1.15;
  }
}
