/**
 * 全入力デバイス（タッチ・ゲームパッド・キーボード）を共通のアクションに正規化した状態。
 * 1フレーム限りのトリガー（pressed系）は consume されるまで保持する。
 */
export type Trigger =
  | 'light' // 右ボタン タップ
  | 'flickUp' // 右ボタン 上フリック
  | 'flickForward' // 右ボタン 前フリック
  | 'chargeStart' // 右ボタン 長押し開始
  | 'chargeRelease' // 右ボタン 長押し解放
  | 'sub' // 左サブ タップ（ステップ / パリィ）
  | 'purgeStart' // 左サブ 長押し開始
  | 'purgeRelease'
  | 'interact'
  | 'lock'
  | 'partNext'
  | 'partPrev'
  | 'heal'
  | 'pause';

export class InputState {
  /** 移動ベクトル（スクリーン基準 x:右 y:上, 長さ0..1） */
  moveX = 0;
  moveY = 0;
  /** カメラ回転量（ラジアン、フレーム毎に消費） */
  camDX = 0;
  camDY = 0;
  chargeHeld = false;
  purgeHeld = false;
  private triggers = new Map<Trigger, number>();
  /** 最後に使われたデバイス（UI表示切替用） */
  lastDevice: 'touch' | 'pad' | 'key' = 'touch';

  fire(t: Trigger): void {
    this.triggers.set(t, performance.now());
  }

  /** トリガーを消費。バッファ時間内なら true（先行入力） */
  consume(t: Trigger, bufferMs = 220): boolean {
    const at = this.triggers.get(t);
    if (at === undefined) return false;
    this.triggers.delete(t);
    return performance.now() - at <= bufferMs;
  }

  peek(t: Trigger, bufferMs = 220): boolean {
    const at = this.triggers.get(t);
    return at !== undefined && performance.now() - at <= bufferMs;
  }

  clearTriggers(): void {
    this.triggers.clear();
  }

  takeCamera(): [number, number] {
    const r: [number, number] = [this.camDX, this.camDY];
    this.camDX = 0;
    this.camDY = 0;
    return r;
  }

  get moveMag(): number {
    return Math.min(1, Math.hypot(this.moveX, this.moveY));
  }
}
