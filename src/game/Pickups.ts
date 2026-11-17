import * as THREE from 'three';
import { buildGraftMesh } from './GraftModels';
import type { GraftId } from './Types';

/** 切断されて戦場に転がる部位 */
export class GraftPickup {
  readonly mesh: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  grounded = false;
  life = 45;
  taken = false;
  private glow: THREE.Mesh;
  spin = new THREE.Vector3();

  constructor(readonly id: GraftId, pos: THREE.Vector3, vel: THREE.Vector3, scene: THREE.Scene) {
    this.mesh = buildGraftMesh(id, id === 'sawaxe' ? 1.1 : 1);
    this.pos = pos.clone();
    this.vel = vel.clone();
    this.glow = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.65, 24), new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.glow.rotation.x = -Math.PI / 2;
    this.spin.set(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4);
    scene.add(this.mesh, this.glow);
  }

  update(dt: number, ground: (x: number, z: number, y: number) => number, time: number): void {
    this.life -= dt;
    if (!this.grounded) {
      this.vel.y -= 20 * dt;
      this.pos.addScaledVector(this.vel, dt);
      this.mesh.rotation.x += this.spin.x * dt;
      this.mesh.rotation.y += this.spin.y * dt;
      this.mesh.rotation.z += this.spin.z * dt;
      const g = ground(this.pos.x, this.pos.z, this.pos.y + 0.3);
      if (this.pos.y <= g + 0.3 && this.vel.y < 0) {
        this.pos.y = g + 0.3;
        if (Math.abs(this.vel.y) > 3) {
          this.vel.y *= -0.3;
          this.vel.x *= 0.5;
          this.vel.z *= 0.5;
        } else {
          this.grounded = true;
          this.mesh.rotation.set(Math.PI / 2, this.mesh.rotation.y, 0);
        }
      }
    }
    this.mesh.position.copy(this.pos);
    this.glow.position.copy(this.pos).setY(this.pos.y - 0.27);
    const s = 1 + Math.sin(time * 5) * 0.15;
    this.glow.scale.setScalar(s);
    (this.glow.material as THREE.MeshBasicMaterial).opacity = this.life < 8 ? (Math.sin(time * 12) > 0 ? 0.7 : 0.1) : 0.7;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh, this.glow);
  }
}

/** 素材のドロップ（近づくと自動回収される光球） */
export class LootOrb {
  readonly mesh: THREE.Mesh;
  vel: THREE.Vector3;
  t = 0;
  taken = false;
  constructor(readonly kind: string, readonly perk: string | null, public pos: THREE.Vector3, scene: THREE.Scene, rarity: number) {
    const color = rarity >= 3 ? 0xffc040 : rarity === 2 ? 0x66ccff : 0xd0d0c0;
    this.mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color }));
    this.vel = new THREE.Vector3((Math.random() - 0.5) * 4, 5 + Math.random() * 2, (Math.random() - 0.5) * 4);
    scene.add(this.mesh);
  }

  update(dt: number, ground: number, target: THREE.Vector3): boolean {
    this.t += dt;
    if (this.t > 0.9) {
      const d = target.clone().setY(target.y + 1).sub(this.pos);
      const len = d.length();
      if (len < 0.5) return true;
      this.pos.addScaledVector(d.normalize(), Math.min(len, dt * (6 + this.t * 10)));
    } else {
      this.vel.y -= 18 * dt;
      this.pos.addScaledVector(this.vel, dt);
      if (this.pos.y < ground + 0.3) {
        this.pos.y = ground + 0.3;
        this.vel.multiplyScalar(0.4);
        this.vel.y = Math.abs(this.vel.y);
      }
    }
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y += dt * 4;
    return false;
  }
}

/** オーバーロード・パージ（暴走させた部位を爆弾として投げる）・火炎波 */
export class Projectile {
  alive = true;
  t = 0;
  constructor(
    public pos: THREE.Vector3,
    public vel: THREE.Vector3,
    readonly mesh: THREE.Object3D,
    readonly kind: 'purge' | 'firewave',
    readonly power: number,
    readonly gravity: number,
    readonly maxT: number,
  ) {}
}
