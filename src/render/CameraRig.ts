import * as THREE from 'three';
import { clamp, damp, angleDiff } from '../core/MathUtil';

export type ShakeKind = 'metal' | 'flesh' | 'heavy' | 'explosion';

interface Shake {
  amp: number;
  freq: number;
  decay: number;
  t: number;
  ax: THREE.Vector3;
}

const SHAKE_PRESET: Record<ShakeKind, { amp: number; freq: number; decay: number }> = {
  // 金属：高周波で短い震え
  metal: { amp: 0.07, freq: 55, decay: 22 },
  // 肉：低周波の重いうねり
  flesh: { amp: 0.12, freq: 18, decay: 10 },
  heavy: { amp: 0.22, freq: 14, decay: 6 },
  explosion: { amp: 0.4, freq: 22, decay: 4.5 },
};

/**
 * 三人称カメラ。ロックオン時は対象とプレイヤーを同時に収める。
 * カメラとプレイヤー間の遮蔽物（壁・ボスの巨体）はリアルタイムに半透明化する。
 */
export class CameraRig {
  yaw = Math.PI; // プレイヤーの背後（+Z を向く）
  pitch = 0.32;
  distance = 6.2;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private shakes: Shake[] = [];
  private ray = new THREE.Raycaster();
  private faded = new Set<THREE.Mesh>();
  occluders: THREE.Object3D[] = [];
  /** 半透明化の対象となる敵メッシュ群 */
  dynamicOccluders: THREE.Object3D[] = [];
  fovKick = 0;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  addShake(kind: ShakeKind, scale = 1): void {
    const p = SHAKE_PRESET[kind];
    const ax = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, (Math.random() - 0.5) * 0.3).normalize();
    this.shakes.push({ amp: p.amp * scale, freq: p.freq, decay: p.decay, t: 0, ax });
    if (this.shakes.length > 6) this.shakes.shift();
  }

  rotate(dx: number, dy: number): void {
    this.yaw -= dx;
    this.pitch = clamp(this.pitch + dy, -0.25, 1.1);
  }

  snapBehind(facing: number): void {
    this.yaw = facing + Math.PI;
  }

  /** カメラから見た前方向（XZ平面） */
  forwardXZ(out: THREE.Vector3): THREE.Vector3 {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
  }

  update(dt: number, realDt: number, focus: THREE.Vector3, lockTarget: THREE.Vector3 | null): void {
    // ロックオン時：ターゲット方向の反対側へカメラを回り込ませる
    if (lockTarget) {
      const dx = lockTarget.x - focus.x;
      const dz = lockTarget.z - focus.z;
      const targetYaw = Math.atan2(-dx, -dz);
      this.yaw += angleDiff(this.yaw, targetYaw) * damp(6, realDt);
      const dist = Math.hypot(dx, dz);
      const dy = lockTarget.y - focus.y;
      const wantPitch = clamp(0.28 + Math.atan2(dy, Math.max(dist, 1)) * 0.6, 0.1, 0.8);
      this.pitch += (wantPitch - this.pitch) * damp(4, realDt);
    }
    const lookY = focus.y + 1.4;
    const want = new THREE.Vector3(
      focus.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.distance,
      lookY + Math.sin(this.pitch) * this.distance,
      focus.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.distance,
    );
    const lookAt = new THREE.Vector3(focus.x, lookY, focus.z);
    if (lockTarget) lookAt.lerp(new THREE.Vector3(lockTarget.x, Math.min(lockTarget.y, lookY + 2.5), lockTarget.z), 0.35);

    const k = damp(14, realDt);
    this.pos.lerp(want, this.pos.lengthSq() === 0 ? 1 : k);
    this.look.lerp(lookAt, this.look.lengthSq() === 0 ? 1 : damp(16, realDt));

    // シェイク波形（ヒットストップ中も実時間で揺らす）
    const off = new THREE.Vector3();
    for (const s of this.shakes) {
      s.t += realDt;
      const a = s.amp * Math.exp(-s.decay * s.t) * Math.sin(s.freq * s.t * Math.PI * 2);
      off.addScaledVector(s.ax, a);
    }
    this.shakes = this.shakes.filter((s) => s.amp * Math.exp(-s.decay * s.t) > 0.002);

    this.camera.position.copy(this.pos).add(off);
    this.camera.lookAt(this.look.clone().addScaledVector(off, 0.5));
    this.fovKick *= 1 - damp(8, realDt);
    const fov = 58 + this.fovKick;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    void dt;
    this.updateOcclusion(focus);
  }

  /** 透過カメラ制御：視線上の遮蔽物を半透明化 */
  private updateOcclusion(focus: THREE.Vector3): void {
    const head = new THREE.Vector3(focus.x, focus.y + 1.2, focus.z);
    const dir = head.clone().sub(this.camera.position);
    const len = dir.length();
    dir.normalize();
    this.ray.set(this.camera.position, dir);
    this.ray.far = len - 0.4;
    const hits = this.ray.intersectObjects([...this.occluders, ...this.dynamicOccluders], true);
    const now = new Set<THREE.Mesh>();
    for (const h of hits) {
      const mesh = h.object as THREE.Mesh;
      if (!mesh.isMesh || mesh.userData.noFade) continue;
      now.add(mesh);
    }
    for (const mesh of now) {
      if (!this.faded.has(mesh)) {
        const orig = mesh.material as THREE.MeshStandardMaterial;
        if (!mesh.userData.fadeMat) {
          const fm = orig.clone();
          fm.onBeforeCompile = orig.onBeforeCompile;
          fm.customProgramCacheKey = orig.customProgramCacheKey;
          fm.transparent = true;
          fm.opacity = 0.22;
          fm.depthWrite = false;
          mesh.userData.fadeMat = fm;
          mesh.userData.origMat = orig;
        }
        mesh.material = mesh.userData.fadeMat;
        this.faded.add(mesh);
      }
    }
    for (const mesh of this.faded) {
      if (!now.has(mesh)) {
        mesh.material = mesh.userData.origMat;
        this.faded.delete(mesh);
      }
    }
  }
}
