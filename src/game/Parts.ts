import type { DamageType, GraftId, PerkId } from './Types';

/**
 * 敵の部位。本体HPとは別に装甲（外殻）と部位耐久値を持つ。
 *  - 打撃：装甲を粉砕して肉を露出させる
 *  - 斬撃：露出した部位を切断・落下させる（装甲が残っていると弾かれる）
 *  - 刺突：装甲の隙間・弱点へ致命傷。スタン蓄積で大ダウン
 */
export interface PartState {
  id: string;
  name: string;
  armor: number;
  armorMax: number;
  hp: number;
  hpMax: number;
  /** 斬撃で切断可能か（不可なら「破壊」扱い） */
  severable: boolean;
  /** 切断時に落ちるグラフト部位 */
  graft?: GraftId;
  /** 刺突の弱点倍率 */
  weak: number;
  severed: boolean;
  broken: boolean;
  /** 被弾判定半径 */
  radius: number;
}

export function makePart(p: Partial<PartState> & Pick<PartState, 'id' | 'name'>): PartState {
  const armorMax = p.armorMax ?? p.armor ?? 0;
  const hpMax = p.hpMax ?? p.hp ?? 50;
  return {
    armor: armorMax,
    armorMax,
    hp: hpMax,
    hpMax,
    severable: false,
    weak: 1,
    severed: false,
    broken: false,
    radius: 0.5,
    ...p,
  };
}

export interface HitInput {
  damage: number;
  type: DamageType;
  partMult: number;
  armorMult: number;
  perks: Set<PerkId>;
  crit: boolean;
}

export type HitFeel = 'deflect' | 'armor' | 'armorBreak' | 'flesh' | 'sever' | 'weak';

export interface HitResult {
  bodyDamage: number;
  partDamage: number;
  armorDamage: number;
  feel: HitFeel;
  severed: boolean;
  broke: boolean;
  /** 刺突スタン蓄積量 */
  stun: number;
}

/** 部位への1ヒットを解決する（純粋関数としてテスト可能） */
export function resolveHit(part: PartState, hit: HitInput): HitResult {
  const r: HitResult = { bodyDamage: 0, partDamage: 0, armorDamage: 0, feel: 'flesh', severed: false, broke: false, stun: 0 };
  let dmg = hit.damage;
  if (hit.type === 'slash' && hit.perks.has('slash15')) dmg *= 1.15;
  if (hit.type === 'blunt' && hit.perks.has('blunt15')) dmg *= 1.15;
  if (hit.type === 'pierce' && hit.perks.has('pierce15')) dmg *= 1.15;
  if (hit.crit) dmg *= 1.5;
  let partMult = hit.partMult * (hit.perks.has('partDmg30') ? 1.3 : 1);
  const armored = part.armor > 0;

  if (hit.type === 'blunt') {
    if (armored) {
      r.armorDamage = dmg * 1.4 * hit.armorMult;
      r.bodyDamage = dmg * 0.6;
      r.feel = 'armor';
    } else {
      r.partDamage = dmg * 0.7 * partMult;
      r.bodyDamage = dmg;
      r.feel = 'flesh';
    }
    r.stun = dmg * 0.3;
  } else if (hit.type === 'slash') {
    if (armored) {
      // 硬い装甲に弾かれる
      r.armorDamage = dmg * 0.25;
      r.bodyDamage = dmg * 0.2;
      r.feel = 'deflect';
    } else {
      r.partDamage = dmg * 1.25 * partMult;
      r.bodyDamage = dmg;
      r.feel = 'flesh';
    }
  } else {
    // 刺突：装甲の隙間を通す。弱点で大ダメージ＋スタン
    const weak = part.weak;
    r.bodyDamage = dmg * (armored ? 0.75 : 1) * weak;
    r.partDamage = dmg * 0.5 * partMult * (armored ? 0.3 : 1);
    r.armorDamage = armored ? dmg * 0.4 : 0;
    r.stun = dmg * (weak > 1 ? 2.2 : 0.8);
    r.feel = weak > 1 ? 'weak' : armored ? 'armor' : 'flesh';
  }

  if (r.armorDamage > 0 && part.armor > 0) {
    part.armor = Math.max(0, part.armor - r.armorDamage);
    if (part.armor === 0) r.feel = 'armorBreak';
  }
  if (r.partDamage > 0 && !part.severed) {
    part.hp = Math.max(0, part.hp - r.partDamage);
    if (part.hp === 0) {
      if (part.severable) {
        if (hit.type === 'slash' || part.armorMax === 0) {
          part.severed = true;
          r.severed = true;
          r.feel = 'sever';
        } else {
          // 斬撃以外では切断できない（ぎりぎりで踏みとどまる）
          part.hp = 1;
        }
      } else if (!part.broken) {
        part.broken = true;
        r.broke = true;
      }
    }
  }
  return r;
}
