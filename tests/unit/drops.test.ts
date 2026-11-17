import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/Rng';
import { rollDrops } from '../../src/game/Drops';
import { makePart } from '../../src/game/Parts';

const galahad = (armSevered: boolean, headBroken: boolean) => ({
  body: makePart({ id: 'body', name: '胸', hp: 9999 }),
  armR: { ...makePart({ id: 'armR', name: '腕', hp: 100, severable: true }), severed: armSevered },
  head: { ...makePart({ id: 'head', name: '兜', hp: 100 }), broken: headBroken },
  legs: makePart({ id: 'legs', name: '脚', hp: 100 }),
});

describe('部位破壊報酬の分岐', () => {
  it('ボスの右腕を残して倒すと蒸気回転機関が手に入る', () => {
    const d = rollDrops({ type: 'galahad', parts: galahad(false, false), firstKill: true }, new Rng(1)).map((x) => x.kind);
    expect(d).toContain('saw_engine');
    expect(d).not.toContain('galahad_helm');
  });

  it('右腕を奪って倒すと蒸気回転機関は落ちず、頭部破壊で兜片が落ちる', () => {
    const d = rollDrops({ type: 'galahad', parts: galahad(true, true), firstKill: true }, new Rng(1)).map((x) => x.kind);
    expect(d).not.toContain('saw_engine');
    expect(d).toContain('galahad_helm');
    expect(d).toContain('core_galahad');
  });

  it('レア度3の素材には必ず特性が付く', () => {
    const d = rollDrops({ type: 'galahad', parts: galahad(false, true), firstKill: true }, new Rng(7));
    for (const x of d.filter((x) => ['saw_engine', 'core_galahad', 'galahad_helm'].includes(x.kind))) expect(x.perk).not.toBeNull();
  });
});
