import { describe, expect, it } from 'vitest';
import { makePart, resolveHit, type HitInput } from '../../src/game/Parts';

const hit = (o: Partial<HitInput>): HitInput => ({ damage: 20, type: 'slash', partMult: 1, armorMult: 1, perks: new Set(), crit: false, ...o });

describe('部位破壊の3属性', () => {
  it('装甲が残る部位への斬撃は弾かれ、切断できない', () => {
    const p = makePart({ id: 'arm', name: '右腕', armor: 40, hp: 10, severable: true });
    const r = resolveHit(p, hit({ damage: 100 }));
    expect(r.feel).toBe('deflect');
    expect(p.severed).toBe(false);
    expect(p.hp).toBe(10);
  });

  it('打撃で装甲を粉砕すると肉が露出する', () => {
    const p = makePart({ id: 'arm', name: '右腕', armor: 30, hp: 50, severable: true });
    const r = resolveHit(p, hit({ type: 'blunt', damage: 30 }));
    expect(p.armor).toBe(0);
    expect(r.feel).toBe('armorBreak');
  });

  it('露出した部位は斬撃で切断される', () => {
    const p = makePart({ id: 'arm', name: '右腕', armor: 30, hp: 20, severable: true, graft: 'shield' });
    p.armor = 0;
    const r = resolveHit(p, hit({ damage: 30 }));
    expect(r.severed).toBe(true);
    expect(r.feel).toBe('sever');
    expect(p.severed).toBe(true);
  });

  it('装甲持ちの部位は打撃では切断されずに踏みとどまる', () => {
    const p = makePart({ id: 'arm', name: '右腕', armor: 10, hp: 5, severable: true });
    p.armor = 0;
    resolveHit(p, hit({ type: 'blunt', damage: 100 }));
    expect(p.severed).toBe(false);
    expect(p.hp).toBe(1);
  });

  it('刺突は弱点で大きなスタンを蓄積する', () => {
    const eye = makePart({ id: 'head', name: '頭', hp: 50, weak: 2.5 });
    const body = makePart({ id: 'body', name: '胴', hp: 50 });
    const a = resolveHit(eye, hit({ type: 'pierce' }));
    const b = resolveHit(body, hit({ type: 'pierce' }));
    expect(a.feel).toBe('weak');
    expect(a.stun).toBeGreaterThan(b.stun * 2);
    expect(a.bodyDamage).toBeGreaterThan(b.bodyDamage);
  });

  it('切断不可の部位は耐久ゼロで「破壊」になる', () => {
    const legs = makePart({ id: 'legs', name: '脚', hp: 10 });
    const r = resolveHit(legs, hit({ damage: 50 }));
    expect(r.broke).toBe(true);
    expect(legs.broken).toBe(true);
  });

  it('パーク「解体」で部位ダメージが増える', () => {
    const a = makePart({ id: 'a', name: 'a', hp: 500 });
    const b = makePart({ id: 'b', name: 'b', hp: 500 });
    resolveHit(a, hit({}));
    resolveHit(b, hit({ perks: new Set(['partDmg30']) }));
    expect(500 - b.hp).toBeCloseTo((500 - a.hp) * 1.3, 5);
  });
});
