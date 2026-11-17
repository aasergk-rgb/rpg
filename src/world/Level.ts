import * as THREE from 'three';
import { M, mat } from '../render/Materials';

export interface Collider {
  min: THREE.Vector3;
  max: THREE.Vector3;
  active: boolean;
  mesh?: THREE.Object3D;
  tag?: string;
}

export type InteractKind = 'hearth' | 'forge' | 'chest' | 'gate' | 'thorns' | 'elevator' | 'fog' | 'trialDoor' | 'sign';

export interface Interactable {
  id: string;
  kind: InteractKind;
  pos: THREE.Vector3;
  radius: number;
  active: boolean;
  object?: THREE.Object3D;
  /** chest の中身など */
  data?: Record<string, any>;
}

let stoneTex: THREE.CanvasTexture | null = null;
function stoneTexture(): THREE.CanvasTexture {
  if (stoneTex) return stoneTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#7a7570';
  g.fillRect(0, 0, 256, 256);
  // 敷石パターン
  const rows = 4;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? 32 : 0;
    for (let x = -64; x < 256; x += 64) {
      const v = 100 + Math.floor(Math.random() * 30);
      g.fillStyle = `rgb(${v},${v - 4},${v - 8})`;
      g.fillRect(x + off + 2, r * 64 + 2, 60, 60);
    }
  }
  for (let i = 0; i < 2500; i++) {
    const v = Math.floor(Math.random() * 60) + 70;
    g.fillStyle = `rgba(${v},${v},${v},0.25)`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  g.strokeStyle = 'rgba(20,16,14,0.8)';
  g.lineWidth = 3;
  for (let r = 0; r <= rows; r++) {
    g.beginPath();
    g.moveTo(0, r * 64);
    g.lineTo(256, r * 64);
    g.stroke();
  }
  stoneTex = new THREE.CanvasTexture(c);
  stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping;
  stoneTex.colorSpace = THREE.SRGBColorSpace;
  stoneTex.anisotropy = 4;
  return stoneTex;
}

/** ワールド座標に比例したUVを持つ箱（テクスチャが伸びない） */
function boxGeo(w: number, h: number, d: number, tile = 3): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setXY(idx, (uv.getX(idx) * dims[f][0]) / tile, (uv.getY(idx) * dims[f][1]) / tile);
    }
  }
  return g;
}

/** データ駆動の立体迷宮。箱コライダーで床・壁を表現する */
export class Level {
  readonly group = new THREE.Group();
  colliders: Collider[] = [];
  interactables: Interactable[] = [];
  occluders: THREE.Object3D[] = [];
  /** 静的ライト候補（近いものだけプールライトで照らす） */
  lightSpots: { pos: THREE.Vector3; color: number; intensity: number }[] = [];
  private stoneMat: THREE.MeshStandardMaterial;
  private floorMat: THREE.MeshStandardMaterial;
  private wallDarkMat: THREE.MeshStandardMaterial;
  elevator!: Collider;
  elevatorTarget = 0;
  readonly ELEV_TOP = 0;
  readonly ELEV_BOTTOM = -12;
  braziers: THREE.Object3D[] = [];

  constructor() {
    const tex = stoneTexture();
    this.stoneMat = mat('lvlStone', { color: 0x6a6460, roughness: 0.92, map: tex });
    this.floorMat = mat('lvlFloor', { color: 0x58534e, roughness: 0.85, map: tex });
    this.wallDarkMat = mat('lvlWallDark', { color: 0x3e3a38, roughness: 0.95, map: tex });
  }

  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, material: THREE.Material, opts: { occluder?: boolean; tag?: string; collide?: boolean; shadow?: boolean } = {}): Collider {
    const w = x1 - x0;
    const h = y1 - y0;
    const d = z1 - z0;
    const mesh = new THREE.Mesh(boxGeo(w, h, d), material);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    mesh.receiveShadow = true;
    mesh.castShadow = opts.shadow ?? h > 0.6;
    this.group.add(mesh);
    if (opts.occluder) this.occluders.push(mesh);
    const c: Collider = { min: new THREE.Vector3(x0, y0, z0), max: new THREE.Vector3(x1, y1, z1), active: true, mesh, tag: opts.tag };
    if (opts.collide !== false) this.colliders.push(c);
    return c;
  }

  floor(x0: number, z0: number, x1: number, z1: number, y = 0): Collider {
    return this.box(x0, y - 1, z0, x1, y, z1, this.floorMat, { shadow: false });
  }

  wall(x0: number, z0: number, x1: number, z1: number, y0: number, h: number, dark = false): Collider {
    return this.box(x0, y0, z0, x1, y0 + h, z1, dark ? this.wallDarkMat : this.stoneMat, { occluder: true });
  }

  pillar(x: number, z: number, y0: number, h: number, r = 0.6): void {
    this.box(x - r, y0, z - r, x + r, y0 + h, z + r, this.stoneMat, { occluder: true });
    // 柱頭
    this.box(x - r - 0.15, y0 + h - 0.4, z - r - 0.15, x + r + 0.15, y0 + h, z + r + 0.15, this.wallDarkMat, { collide: false, occluder: true });
    this.box(x - r - 0.15, y0, z - r - 0.15, x + r + 0.15, y0 + 0.4, z + r + 0.15, this.wallDarkMat, { collide: false });
  }

  brazier(x: number, y: number, z: number, intensity = 14): void {
    const g = new THREE.Group();
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.25, 0.35, 10), M.iron());
    bowl.position.y = 1.1;
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 1.0, 6), M.iron());
    stand.position.y = 0.5;
    const coal = new THREE.Mesh(new THREE.SphereGeometry(0.33, 8, 6), M.ember());
    coal.position.y = 1.25;
    coal.scale.y = 0.5;
    g.add(bowl, stand, coal);
    g.position.set(x, y, z);
    g.traverse((o) => ((o as THREE.Mesh).castShadow = false));
    this.group.add(g);
    this.braziers.push(g);
    this.lightSpots.push({ pos: new THREE.Vector3(x, y + 1.8, z), color: 0xff8a3a, intensity });
  }

  addInteract(i: Interactable): Interactable {
    this.interactables.push(i);
    return i;
  }

  /** 足元の床の高さ（stepUp 以内で一番高い面） */
  groundAt(x: number, z: number, y: number, radius = 0.25, stepUp = 0.5): number {
    let best = -Infinity;
    for (const c of this.colliders) {
      if (!c.active) continue;
      if (x + radius < c.min.x || x - radius > c.max.x || z + radius < c.min.z || z - radius > c.max.z) continue;
      // 中心が箱上にあるか、少なくとも半径の半分以上載っているか
      if (x < c.min.x - radius * 0.3 || x > c.max.x + radius * 0.3 || z < c.min.z - radius * 0.3 || z > c.max.z + radius * 0.3) continue;
      const top = c.max.y;
      if (top <= y + stepUp && top > best) best = top;
    }
    return best;
  }

  /** 円柱（半径 r、足元 y、高さ h）を壁から押し出す */
  resolve(pos: THREE.Vector3, r: number, h: number, stepUp = 0.5): boolean {
    let hit = false;
    for (let iter = 0; iter < 2; iter++) {
      for (const c of this.colliders) {
        if (!c.active) continue;
        if (c.max.y <= pos.y + stepUp || c.min.y >= pos.y + h) continue;
        const cx = Math.max(c.min.x, Math.min(pos.x, c.max.x));
        const cz = Math.max(c.min.z, Math.min(pos.z, c.max.z));
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        hit = true;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * r;
          pos.z = cz + (dz / d) * r;
        } else {
          // 中心が箱内部：最短軸で押し出す
          const pen = [pos.x - c.min.x + r, c.max.x - pos.x + r, pos.z - c.min.z + r, c.max.z - pos.z + r];
          const k = pen.indexOf(Math.min(...pen));
          if (k === 0) pos.x = c.min.x - r;
          else if (k === 1) pos.x = c.max.x + r;
          else if (k === 2) pos.z = c.min.z - r;
          else pos.z = c.max.z + r;
        }
      }
    }
    return hit;
  }

  /** 2点間の視線が壁で遮られているか（XZ近似） */
  lineBlocked(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const steps = Math.ceil(a.distanceTo(b) / 0.5);
    const p = new THREE.Vector3();
    for (let i = 1; i < steps; i++) {
      p.lerpVectors(a, b, i / steps);
      for (const c of this.colliders) {
        if (!c.active) continue;
        if (p.x > c.min.x && p.x < c.max.x && p.z > c.min.z && p.z < c.max.z && p.y + 1 > c.min.y && p.y + 1 < c.max.y) return true;
      }
    }
    return false;
  }

  updateElevator(dt: number): number {
    const e = this.elevator;
    const top = e.max.y;
    const target = this.elevatorTarget;
    if (Math.abs(top - target) < 1e-3) return 0;
    const speed = 4;
    const dy = Math.sign(target - top) * Math.min(Math.abs(target - top), speed * dt);
    e.min.y += dy;
    e.max.y += dy;
    if (e.mesh) e.mesh.position.y += dy;
    return dy;
  }
}
