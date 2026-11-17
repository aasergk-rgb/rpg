import type { InputState, Trigger } from './InputState';

/**
 * MFi / Bluetooth コントローラー（Standard Gamepad マッピング）
 *  左スティック 移動 / 右スティック カメラ
 *  X(2) 軽攻撃 / LB(4) 斬り上げ(上フリック) / RB(5) 突進斬り(前フリック) / RT(7) 長押し溜め
 *  A(0) ステップ・パリィ / LT(6) 長押しパージ / B(1) 接続・調べる / Y(3) 回復
 *  R3(11) ロックオン / 十字キー左右 部位切替 / Start(9) ポーズ
 */
export class GamepadInput {
  private prev: boolean[] = [];
  connected = false;
  sensitivity = 1;

  constructor(private input: InputState) {
    window.addEventListener('gamepadconnected', () => (this.connected = true));
    window.addEventListener('gamepaddisconnected', () => (this.connected = false));
  }

  update(dt: number): void {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = Array.from(pads).find((p) => p && p.connected);
    if (!pad) return;
    this.connected = true;
    const i = this.input;
    const b = pad.buttons.map((x) => x.pressed || x.value > 0.5);
    const edge = (n: number) => b[n] && !this.prev[n];
    const release = (n: number) => !b[n] && this.prev[n];
    const map: [number, Trigger][] = [
      [2, 'light'],
      [4, 'flickUp'],
      [5, 'flickForward'],
      [0, 'sub'],
      [1, 'interact'],
      [3, 'heal'],
      [11, 'lock'],
      [10, 'lock'],
      [15, 'partNext'],
      [14, 'partPrev'],
      [9, 'pause'],
    ];
    let any = false;
    for (const [n, t] of map)
      if (edge(n)) {
        i.fire(t);
        any = true;
      }
    if (edge(7)) {
      i.chargeHeld = true;
      i.fire('chargeStart');
      any = true;
    }
    if (release(7)) {
      i.chargeHeld = false;
      i.fire('chargeRelease');
    }
    if (edge(6)) {
      i.purgeHeld = true;
      i.fire('purgeStart');
      any = true;
    }
    if (release(6)) {
      i.purgeHeld = false;
      i.fire('purgeRelease');
    }
    this.prev = b;

    const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
    const lx = dz(pad.axes[0] ?? 0);
    const ly = dz(pad.axes[1] ?? 0);
    const rx = dz(pad.axes[2] ?? 0);
    const ry = dz(pad.axes[3] ?? 0);
    if (lx || ly) {
      i.moveX = lx;
      i.moveY = -ly;
      any = true;
    } else if (i.lastDevice === 'pad') {
      i.moveX = 0;
      i.moveY = 0;
    }
    if (rx || ry) {
      i.camDX += rx * 2.8 * dt * this.sensitivity;
      i.camDY += -ry * 1.8 * dt * this.sensitivity;
      any = true;
    }
    if (any) i.lastDevice = 'pad';
  }
}
