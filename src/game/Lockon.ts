import * as THREE from 'three';
import type { Enemy } from './Enemy';
import type { Game } from './Game';

/** ロックオンと部位ターゲット切替（本体 → 右腕 → 頭部 → 脚部） */
export class Lockon {
  target: Enemy | null = null;
  partId: string | null = null;

  constructor(private game: Game) {}

  toggle(): void {
    if (this.target) {
      this.clear();
      return;
    }
    const cam = this.game.cam.camera;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    let best: Enemy | null = null;
    let bestScore = Infinity;
    for (const e of this.game.enemies) {
      if (!e.alive) continue;
      const d = e.pos.clone().sub(this.game.player.pos);
      const dist = d.length();
      if (dist > (e.boss ? 30 : 18)) continue;
      if (Math.abs(d.y) > 5) continue;
      d.y = 0;
      d.normalize();
      const ang = Math.acos(Math.max(-1, Math.min(1, d.dot(fwd))));
      const score = dist * 0.3 + ang * 6 - (e.boss ? 4 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    if (best) {
      this.target = best;
      this.partId = best.bodyPart;
      this.game.sfx('ui');
    } else {
      // 対象がいなければカメラを背後へリセット
      this.game.cam.snapBehind(this.game.player.facing);
    }
  }

  cycle(dir: 1 | -1): void {
    if (!this.target) return;
    const list = this.target.partList;
    if (!list.length) return;
    const i = Math.max(0, list.indexOf(this.partId ?? ''));
    this.partId = list[(i + dir + list.length) % list.length];
    this.game.sfx('ui');
    this.game.haptic('light');
  }

  clear(): void {
    this.target = null;
    this.partId = null;
  }

  update(): void {
    const t = this.target;
    if (!t) return;
    if (!t.alive || t.removed || t.pos.distanceTo(this.game.player.pos) > 34) {
      this.clear();
      return;
    }
    if (this.partId && !t.partAvailable(this.partId)) this.partId = t.bodyPart;
  }

  point(out = new THREE.Vector3()): THREE.Vector3 | null {
    if (!this.target) return null;
    return this.target.partWorldPos(this.partId ?? this.target.bodyPart, out);
  }
}
