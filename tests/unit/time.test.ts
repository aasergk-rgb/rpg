import { describe, expect, it } from 'vitest';
import { GameTime } from '../../src/core/Time';

describe('ヒットストップとスローモーション', () => {
  it('ヒットストップ中はゲーム時間が止まる', () => {
    const t = new GameTime();
    t.addHitstop(0.09);
    expect(t.step(0.05)).toBe(0);
    expect(t.step(0.05)).toBe(0);
    expect(t.step(0.05)).toBeCloseTo(0.05);
  });

  it('スロー中は時間倍率がかかる', () => {
    const t = new GameTime();
    t.slowMo(0.2, 0.25);
    expect(t.step(0.1)).toBeCloseTo(0.025);
    t.step(0.1);
    expect(t.step(0.1)).toBeCloseTo(0.1);
  });

  it('ポーズ中は進まない', () => {
    const t = new GameTime();
    t.paused = true;
    expect(t.step(1)).toBe(0);
  });
});
