import * as THREE from 'three';
import { Enemy } from '../Enemy';
import { Rig, type Pose } from '../../render/Rig';

export interface AttackPose {
  windup: Pose;
  strike: Pose;
  spin?: boolean;
}

const STAGGER: Pose = { torso: [-0.5, 0, 0.2], head: [-0.4, 0, 0], shoulderR: [0.3, 0, -0.9], shoulderL: [0.3, 0, 0.9], hipL: [0.3, 0, 0], kneeR: [0.6, 0, 0] };
const DOWN: Pose = { torso: [1.1, 0, 0], head: [0.4, 0, 0], shoulderR: [-0.5, 0, -0.4], shoulderL: [-0.5, 0, 0.4], hipL: [-1.6, 0, 0], kneeL: [2.0, 0, 0], hipR: [-1.4, 0, 0], kneeR: [2.2, 0, 0] };
const DEAD: Pose = { torso: [1.3, 0, 0.3], head: [0.6, 0.3, 0], shoulderR: [0.4, 0, -0.6], shoulderL: [0.4, 0, 0.6], hipL: [-1.6, 0, 0], kneeL: [2.2, 0, 0], hipR: [-1.4, 0, 0], kneeR: [2.2, 0, 0] };
const ROAR: Pose = { torso: [-0.5, 0, 0], head: [-0.6, 0, 0], shoulderR: [-1.2, -1.2, 0.4], shoulderL: [-1.2, 1.2, -0.4], elbowR: [-0.8, 0, 0], elbowL: [-0.8, 0, 0] };

/** 人型の敵：Rig による手続き的アニメーション */
export abstract class HumanoidEnemy extends Enemy {
  rig!: Rig;
  protected idlePose: Pose = {};
  protected poses: Record<string, AttackPose> = {};
  protected scale = 1;

  animate(dt: number, time: number): void {
    const r = this.rig;
    this.group.position.copy(this.pos);
    let spin = 0;
    let hipDrop = 0;
    switch (this.state) {
      case 'attack': {
        const a = this.attack!;
        const p = this.poses[a.anim] ?? this.poses.default;
        const t = this.stateT;
        if (t < a.windup) {
          const k = Math.min(1, t / (a.windup * 0.85));
          r.apply(this.idlePose, p.windup, k * k * (3 - 2 * k));
          // 予備動作の震え
          if (t > a.windup * 0.6) r.j.torso.rotation.z += Math.sin(time * 50) * 0.015;
        } else if (t < a.windup + a.active) {
          const k = (t - a.windup) / a.active;
          if (p.spin) {
            r.apply(p.strike);
            spin = k * Math.PI * 2;
          } else r.apply(p.windup, p.strike, Math.min(1, k * 2.2));
        } else {
          const k = (t - a.windup - a.active) / a.recovery;
          r.apply(p.strike, this.idlePose, Math.min(1, k * 1.3));
        }
        break;
      }
      case 'stagger':
        r.apply(this.idlePose, STAGGER, Math.sin(Math.min(1, this.stateT / this.staggerTime) * Math.PI) * 0.9 + 0.1);
        break;
      case 'flinch':
        r.apply(this.idlePose, STAGGER, Math.sin(Math.min(1, this.stateT / 0.32) * Math.PI) * 0.5);
        break;
      case 'down':
        r.apply(this.idlePose, DOWN, Math.min(1, this.stateT * 4));
        hipDrop = Math.min(1, this.stateT * 4);
        break;
      case 'recover':
        r.apply(DOWN, this.idlePose, Math.min(1, this.stateT / 0.6));
        hipDrop = 1 - Math.min(1, this.stateT / 0.6);
        break;
      case 'roar':
        r.apply(this.idlePose, ROAR, Math.min(1, this.stateT * 3) * (this.stateT > 1.3 ? 1 - (this.stateT - 1.3) / 0.3 : 1));
        break;
      case 'dead':
        r.apply(this.idlePose, DEAD, Math.min(1, this.deadT * 2.5));
        hipDrop = Math.min(1, this.deadT * 2.5);
        break;
      default:
        r.apply(this.idlePose);
        r.addWalk(this.walkPhase, Math.min(1, this.moveAmt));
        r.j.torso.rotation.x += Math.sin(time * 2 + this.pos.z) * 0.03;
    }
    r.j.hips.position.y = r.hipHeight - hipDrop * 0.65;
    r.root.rotation.y = this.facing + spin;
    if (this.state === 'dead' && this.deadT > 2.2) this.group.position.y -= (this.deadT - 2.2) * 0.8;
    this.updateVisualFx(time);
    void dt;
  }

  protected buildRig(r: Rig): void {
    this.rig = r;
    this.group.add(r.root);
  }

  protected anchor(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Object3D {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  }
}
