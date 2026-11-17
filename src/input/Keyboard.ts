import type { InputState } from './InputState';

/**
 * PC デバッグ用キーボード操作
 *  WASD 移動 / 矢印キー カメラ / J 軽攻撃 / I 上フリック / L 前フリック / K 長押し溜め
 *  Space ステップ・パリィ（長押しでパージ）/ E 接続・調べる / Q ロックオン / Z,C 部位切替 / R 回復 / Esc ポーズ
 */
export class Keyboard {
  private down = new Set<string>();
  private spaceAt = 0;
  private purgeFired = false;

  constructor(private input: InputState) {
    window.addEventListener('keydown', (e) => this.onDown(e));
    window.addEventListener('keyup', (e) => this.onUp(e));
    window.addEventListener('blur', () => this.down.clear());
  }

  private onDown(e: KeyboardEvent): void {
    if (e.repeat) return;
    const k = e.code;
    this.down.add(k);
    this.input.lastDevice = 'key';
    const i = this.input;
    switch (k) {
      case 'KeyJ':
        i.fire('light');
        break;
      case 'KeyI':
        i.fire('flickUp');
        break;
      case 'KeyL':
        i.fire('flickForward');
        break;
      case 'KeyK':
        i.chargeHeld = true;
        i.fire('chargeStart');
        break;
      case 'Space':
        this.spaceAt = performance.now();
        this.purgeFired = false;
        e.preventDefault();
        break;
      case 'KeyE':
        i.fire('interact');
        break;
      case 'KeyQ':
        i.fire('lock');
        break;
      case 'KeyC':
        i.fire('partNext');
        break;
      case 'KeyZ':
        i.fire('partPrev');
        break;
      case 'KeyR':
        i.fire('heal');
        break;
      case 'Escape':
      case 'KeyP':
        i.fire('pause');
        break;
    }
  }

  private onUp(e: KeyboardEvent): void {
    this.down.delete(e.code);
    const i = this.input;
    if (e.code === 'KeyK') {
      i.chargeHeld = false;
      i.fire('chargeRelease');
    }
    if (e.code === 'Space') {
      if (this.purgeFired) {
        i.purgeHeld = false;
        i.fire('purgeRelease');
      } else i.fire('sub');
    }
  }

  update(dt: number): void {
    const i = this.input;
    if (this.down.has('Space') && !this.purgeFired && performance.now() - this.spaceAt > 380) {
      this.purgeFired = true;
      i.purgeHeld = true;
      i.fire('purgeStart');
    }
    const x = (this.down.has('KeyD') ? 1 : 0) - (this.down.has('KeyA') ? 1 : 0);
    const y = (this.down.has('KeyW') ? 1 : 0) - (this.down.has('KeyS') ? 1 : 0);
    if (x || y) {
      const l = Math.hypot(x, y);
      i.moveX = x / l;
      i.moveY = y / l;
      i.lastDevice = 'key';
    } else if (i.lastDevice === 'key') {
      i.moveX = 0;
      i.moveY = 0;
    }
    const cx = (this.down.has('ArrowRight') ? 1 : 0) - (this.down.has('ArrowLeft') ? 1 : 0);
    const cy = (this.down.has('ArrowUp') ? 1 : 0) - (this.down.has('ArrowDown') ? 1 : 0);
    i.camDX += cx * 2.4 * dt;
    i.camDY += cy * 1.4 * dt;
  }
}
