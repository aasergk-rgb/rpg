import * as THREE from 'three';
import { M, mat } from '../render/Materials';
import type { GraftId } from './Types';

/** 部位（グラフト）の3Dモデル。敵に付いている時・地面に落ちた時・義手に接続した時で共用 */
export function buildGraftMesh(id: GraftId, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  switch (id) {
    case 'shield': {
      add(new THREE.BoxGeometry(0.85, 1.25, 0.1), M.darkSteel(), 0, 0, 0);
      add(new THREE.BoxGeometry(0.95, 0.1, 0.14), M.rust(), 0, 0.6, 0);
      add(new THREE.BoxGeometry(0.95, 0.1, 0.14), M.rust(), 0, -0.6, 0);
      add(new THREE.CylinderGeometry(0.16, 0.2, 0.08, 6), M.rust(), 0, 0.05, 0.07, Math.PI / 2);
      for (const [x, y] of [[-0.33, 0.45], [0.33, 0.45], [-0.33, -0.45], [0.33, -0.45]]) add(new THREE.SphereGeometry(0.04, 6, 4), M.steel(), x, y, 0.06);
      break;
    }
    case 'jaw': {
      add(new THREE.ConeGeometry(0.28, 0.75, 8), M.houndHide(), 0, 0, 0, Math.PI / 2);
      add(new THREE.ConeGeometry(0.22, 0.6, 8), M.houndHide(), 0, -0.15, 0.02, Math.PI / 2 + 0.35);
      add(new THREE.SphereGeometry(0.16, 8, 6), M.ember(), 0, -0.04, 0.12);
      for (let i = 0; i < 6; i++) add(new THREE.ConeGeometry(0.025, 0.12, 4), M.bone(), -0.15 + i * 0.06, -0.05, 0.25 - Math.abs(i - 2.5) * 0.04, Math.PI);
      break;
    }
    case 'brutearm': {
      add(new THREE.CylinderGeometry(0.22, 0.17, 0.85, 7), M.bruteHide(), 0, 0, 0);
      add(new THREE.DodecahedronGeometry(0.3, 0), mat('rock', { color: 0x6a6058, roughness: 0.95, rim: 0xff5533, rimStrength: 0.4 }), 0.05, 0.2, 0.08);
      add(new THREE.DodecahedronGeometry(0.33, 0), M.bruteHide(), 0, -0.55, 0.04);
      add(new THREE.DodecahedronGeometry(0.2, 0), mat('rock', { color: 0x6a6058, roughness: 0.95 }), -0.12, -0.1, -0.12);
      break;
    }
    case 'sawaxe': {
      add(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), M.iron(), 0, 0, 0);
      const disc = add(new THREE.CylinderGeometry(0.48, 0.48, 0.05, 20), M.steel(), 0, -0.75, 0.25, Math.PI / 2);
      disc.name = 'saw';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const t = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 3), M.steel());
        t.position.set(Math.cos(a) * 0.52, 0, Math.sin(a) * 0.52);
        t.rotation.set(0, -a, Math.PI / 2);
        disc.add(t);
      }
      add(new THREE.CylinderGeometry(0.12, 0.12, 0.35, 8), M.rust(), 0, -0.4, 0.05);
      add(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), M.ember(), 0.1, -0.45, 0.05);
      break;
    }
  }
  g.scale.setScalar(scale);
  return g;
}

/** 義手に接続した時の取り付け姿勢 */
export function mountGraft(hand: THREE.Object3D, id: GraftId): THREE.Group {
  const m = buildGraftMesh(id, id === 'sawaxe' ? 0.85 : 0.9);
  switch (id) {
    case 'shield':
      m.position.set(0, -0.15, 0.12);
      m.rotation.set(-Math.PI / 2, 0, 0);
      break;
    case 'jaw':
      m.position.set(0, -0.3, 0);
      m.rotation.set(-Math.PI / 2, 0, 0);
      break;
    case 'brutearm':
      m.position.set(0, -0.3, 0);
      break;
    case 'sawaxe':
      m.position.set(0, -0.6, 0);
      m.rotation.set(0, 0, 0);
      break;
  }
  hand.add(m);
  return m;
}
