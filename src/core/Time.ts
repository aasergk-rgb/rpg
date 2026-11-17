/**
 * ゲーム内時間管理。ヒットストップ（完全停止）とスローモーション（時間倍率）を扱う。
 * 固定タイムステップでシミュレーションを進め、描画は毎フレーム行う。
 */
export class GameTime {
  /** 実時間（秒） */
  realTime = 0;
  /** ゲーム時間（ヒットストップ・スローを反映） */
  gameTime = 0;
  /** 残りヒットストップ（実時間秒） */
  private hitstop = 0;
  /** スローモーション残り（実時間秒）と倍率 */
  private slowRemain = 0;
  private slowScale = 1;
  paused = false;

  addHitstop(seconds: number): void {
    this.hitstop = Math.max(this.hitstop, seconds);
  }

  slowMo(seconds: number, scale: number): void {
    this.slowRemain = Math.max(this.slowRemain, seconds);
    this.slowScale = scale;
  }

  get isHitstop(): boolean {
    return this.hitstop > 0;
  }

  get isSlow(): boolean {
    return this.slowRemain > 0;
  }

  /** 実時間 dt を受け取り、ゲーム側に渡すスケール済み dt を返す */
  step(realDt: number): number {
    this.realTime += realDt;
    if (this.paused) return 0;
    if (this.hitstop > 0) {
      this.hitstop -= realDt;
      return 0;
    }
    let scale = 1;
    if (this.slowRemain > 0) {
      this.slowRemain -= realDt;
      scale = this.slowScale;
    }
    const dt = realDt * scale;
    this.gameTime += dt;
    return dt;
  }
}
