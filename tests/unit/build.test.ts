import { describe, expect, it } from 'vitest';
import { addMaterial, computeBuild, craftSkeleton, newSave, parseSave, serializeSave } from '../../src/game/Build';

describe('セーブデータ', () => {
  it('シリアライズ→復元で同じ内容になる', () => {
    const s = newSave();
    addMaterial(s, 'ghoul_bone', null);
    addMaterial(s, 'saw_engine', 'partDmg30');
    s.flags.bossDefeated = true;
    s.unlocked = true;
    const r = parseSave(serializeSave(s));
    expect(r).toEqual(s);
  });

  it('壊れたJSONや未知の値は安全に既定値へ戻す', () => {
    expect(parseSave('{broken')).toEqual(newSave());
    const r = parseSave(JSON.stringify({ version: 1, skeleton: 'laser', ownedSkeletons: ['laser'], materials: [{ uid: 1, kind: 'nope', perk: null }], attachment: 1 }));
    expect(r.skeleton).toBe('sword');
    expect(r.ownedSkeletons).toEqual(['sword']);
    expect(r.materials).toEqual([]);
    expect(r.attachment).toBeNull();
  });
});

describe('キメラ鍛冶', () => {
  it('素材が足りれば骨格を作成し、素材を消費する', () => {
    const s = newSave();
    expect(craftSkeleton(s, 'greatsword')).toBe(false);
    for (let i = 0; i < 3; i++) addMaterial(s, 'ghoul_bone', null);
    addMaterial(s, 'knight_plate', null);
    addMaterial(s, 'knight_plate', null);
    expect(craftSkeleton(s, 'greatsword')).toBe(true);
    expect(s.ownedSkeletons).toContain('greatsword');
    expect(s.materials.length).toBe(0);
  });

  it('蒸気回転機関を合成すると溜め攻撃が回転斬りに変化する（モーション継承）', () => {
    const s = newSave();
    s.skeleton = 'sword';
    const before = computeBuild(s).charge;
    const it = addMaterial(s, 'saw_engine', null);
    s.attachment = it.uid;
    const after = computeBuild(s).charge;
    expect(before.anim).toBe('overhead');
    expect(after.anim).toBe('spin');
    expect(after.hits).toBeGreaterThan(1);
  });

  it('剛獣の腱で長槍の強攻撃がムチのような中距離薙ぎになる', () => {
    const s = newSave();
    s.ownedSkeletons.push('spear');
    s.skeleton = 'spear';
    const base = computeBuild(s).charge;
    s.attachment = addMaterial(s, 'brute_tendon', null).uid;
    const b = computeBuild(s);
    expect(b.charge.anim).toBe('whip');
    expect(b.charge.reach).toBeGreaterThan(base.reach);
  });

  it('義体ソケットは対応する部位にのみ効果を発揮する', () => {
    const s = newSave();
    const core = addMaterial(s, 'core_hound', 'staminaRegen');
    s.sockets.back = core.uid;
    expect(computeBuild(s).cores.has('doubleJump')).toBe(false);
    s.sockets.back = null;
    s.sockets.legs = core.uid;
    const b = computeBuild(s);
    expect(b.cores.has('doubleJump')).toBe(true);
    expect(b.perks.has('staminaRegen')).toBe(true);
  });
});
