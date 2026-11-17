import * as THREE from 'three';

export type Joint = 'root' | 'hips' | 'torso' | 'head' | 'shoulderL' | 'shoulderR' | 'elbowL' | 'elbowR' | 'hipL' | 'hipR' | 'kneeL' | 'kneeR';
export type Pose = Partial<Record<Joint, [number, number, number]>>;

export const JOINTS: Joint[] = ['root', 'hips', 'torso', 'head', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'hipL', 'hipR', 'kneeL', 'kneeR'];

export interface HumanoidOpts {
  scale?: number;
  bulk?: number;
  torsoMat: THREE.Material;
  limbMat: THREE.Material;
  headMat: THREE.Material;
  handMat?: THREE.Material;
  legMat?: THREE.Material;
  /** 頭の形 */
  helm?: 'hood' | 'helm' | 'skull' | 'none';
  armLen?: number;
}

/** プリミティブを組み合わせた関節付き人型モデル（手続き的アニメーション用） */
export class Rig {
  readonly j = {} as Record<Joint, THREE.Object3D>;
  /** 右手・左手の先端（武器・義手を付ける） */
  handR = new THREE.Object3D();
  handL = new THREE.Object3D();
  /** 関節を含むメッシュ一式 */
  meshes: THREE.Mesh[] = [];
  readonly root: THREE.Group;
  private base = new Map<Joint, THREE.Euler>();
  hipHeight: number;

  constructor(o: HumanoidOpts) {
    const s = o.scale ?? 1;
    const b = o.bulk ?? 1;
    const armLen = (o.armLen ?? 1) * 0.36;
    this.root = new THREE.Group();
    const mk = (name: Joint, parent: THREE.Object3D, x: number, y: number, z: number) => {
      const g = new THREE.Group();
      g.name = name;
      g.position.set(x, y, z);
      parent.add(g);
      this.j[name] = g;
      return g;
    };
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      this.meshes.push(mesh);
      return mesh;
    };
    this.j.root = this.root;
    this.hipHeight = 0.95;
    const hips = mk('hips', this.root, 0, 0.95, 0);
    add(hips, new THREE.BoxGeometry(0.42 * b, 0.22, 0.26 * b), o.torsoMat, 0, 0, 0);
    const torso = mk('torso', hips, 0, 0.1, 0);
    add(torso, new THREE.BoxGeometry(0.5 * b, 0.55, 0.3 * b), o.torsoMat, 0, 0.32, 0);
    add(torso, new THREE.BoxGeometry(0.56 * b, 0.18, 0.34 * b), o.limbMat, 0, 0.58, 0);
    const head = mk('head', torso, 0, 0.72, 0);
    const helm = o.helm ?? 'hood';
    if (helm === 'helm') {
      add(head, new THREE.CylinderGeometry(0.15, 0.17, 0.32, 8), o.headMat, 0, 0.14, 0);
      add(head, new THREE.BoxGeometry(0.2, 0.03, 0.05), new THREE.MeshBasicMaterial({ color: 0xff3a10 }), 0, 0.15, 0.16);
    } else if (helm === 'skull') {
      add(head, new THREE.SphereGeometry(0.15, 10, 8), o.headMat, 0, 0.12, 0.02);
      add(head, new THREE.BoxGeometry(0.16, 0.08, 0.12), o.headMat, 0, 0.02, 0.07);
    } else if (helm === 'hood') {
      add(head, new THREE.SphereGeometry(0.15, 10, 8), o.headMat, 0, 0.12, 0);
      add(head, new THREE.ConeGeometry(0.2, 0.36, 8), o.limbMat, 0, 0.2, -0.04).rotation.x = -0.2;
    }
    const legMat = o.legMat ?? o.limbMat;
    const handMat = o.handMat ?? o.limbMat;
    // モデルは +Z を向く。キャラクターの右手は -X 側
    for (const side of [-1, 1] as const) {
      const L = side > 0;
      const sh = mk(L ? 'shoulderL' : 'shoulderR', torso, side * 0.33 * b, 0.55, 0);
      sh.rotation.order = 'YXZ';
      add(sh, new THREE.SphereGeometry(0.11 * b, 8, 6), o.limbMat, 0, 0, 0);
      add(sh, new THREE.CylinderGeometry(0.075 * b, 0.065 * b, armLen, 6), o.limbMat, 0, -armLen / 2, 0);
      const el = mk(L ? 'elbowL' : 'elbowR', sh, 0, -armLen, 0);
      add(el, new THREE.CylinderGeometry(0.065 * b, 0.055 * b, armLen * 0.9, 6), handMat, 0, -armLen * 0.45, 0);
      const hand = L ? this.handL : this.handR;
      hand.position.set(0, -armLen * 0.95, 0);
      el.add(hand);
      const hp = mk(L ? 'hipL' : 'hipR', hips, side * 0.13 * b, -0.08, 0);
      add(hp, new THREE.CylinderGeometry(0.09 * b, 0.075 * b, 0.42, 6), legMat, 0, -0.21, 0);
      const kn = mk(L ? 'kneeL' : 'kneeR', hp, 0, -0.42, 0);
      add(kn, new THREE.CylinderGeometry(0.075 * b, 0.06 * b, 0.42, 6), legMat, 0, -0.21, 0);
      add(kn, new THREE.BoxGeometry(0.12 * b, 0.07, 0.24 * b), legMat, 0, -0.43, 0.05);
    }
    this.root.scale.setScalar(s);
    for (const k of JOINTS) this.base.set(k, this.j[k].rotation.clone());
  }

  /** 2つのポーズを補間して適用（未指定の関節は基本姿勢） */
  apply(a: Pose, b: Pose | null = null, t = 0): void {
    for (const k of JOINTS) {
      if (k === 'root') continue;
      const pa = a[k];
      const pb = b ? b[k] : undefined;
      const base = this.base.get(k)!;
      const ax = pa ? pa[0] : base.x;
      const ay = pa ? pa[1] : base.y;
      const az = pa ? pa[2] : base.z;
      if (b) {
        const bx = pb ? pb[0] : base.x;
        const by = pb ? pb[1] : base.y;
        const bz = pb ? pb[2] : base.z;
        this.j[k].rotation.set(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t);
      } else this.j[k].rotation.set(ax, ay, az);
    }
  }

  /** 歩行サイクルを加算 */
  addWalk(phase: number, amount: number): void {
    if (amount <= 0.001) return;
    const s = Math.sin(phase);
    const c = Math.cos(phase);
    this.j.hipL.rotation.x += s * 0.7 * amount;
    this.j.hipR.rotation.x -= s * 0.7 * amount;
    this.j.kneeL.rotation.x += Math.max(0, -c) * 0.9 * amount;
    this.j.kneeR.rotation.x += Math.max(0, c) * 0.9 * amount;
    this.j.shoulderL.rotation.x -= s * 0.5 * amount;
    this.j.shoulderR.rotation.x += s * 0.35 * amount;
    this.j.hips.position.y = this.hipHeight + Math.abs(c) * 0.05 * amount;
    this.j.torso.rotation.y += s * 0.08 * amount;
  }
}

/** ポーズ配列 [ (t, pose) ... ] を時間 t で評価 */
export function samplePoses(keys: [number, Pose][], t: number): [Pose, Pose, number] {
  if (t <= keys[0][0]) return [keys[0][1], keys[0][1], 0];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, p0] = keys[i];
    const [t1, p1] = keys[i + 1];
    if (t <= t1) return [p0, p1, (t - t0) / Math.max(1e-4, t1 - t0)];
  }
  const last = keys[keys.length - 1][1];
  return [last, last, 0];
}
