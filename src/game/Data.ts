import type { GraftId, MoveDef, PerkId, SkeletonId, SocketSlot } from './Types';

// ---------------------------------------------------------------------------
// 武器骨格（ベース5種）
// ---------------------------------------------------------------------------

export interface SkeletonDef {
  id: SkeletonId;
  name: string;
  desc: string;
  combo: MoveDef[];
  up: MoveDef;
  forward: MoveDef;
  charge: MoveDef;
  /** 溜め完了までの秒数 */
  chargeTime: number;
  /** 見た目パラメータ */
  look: { bladeLen: number; bladeWidth: number; head?: 'hammer' | 'spear'; twin?: boolean };
  /** 鍛冶での作成コスト（素材kind→個数） */
  recipe: Record<string, number>;
}

const m = (d: Partial<MoveDef> & Pick<MoveDef, 'id' | 'name' | 'anim' | 'damage' | 'type'>): MoveDef => ({
  startup: 0.12,
  active: 0.1,
  recovery: 0.25,
  reach: 2.2,
  arc: 110,
  stamina: 10,
  poise: 10,
  cancelAt: 0.4,
  ...d,
});

export const SKELETONS: Record<SkeletonId, SkeletonDef> = {
  sword: {
    id: 'sword',
    name: '灰鋼の直剣',
    desc: 'バランス型。斬撃主体で3段目に刺突を含む。',
    combo: [
      m({ id: 's1', name: '袈裟斬り', anim: 'slashR', damage: 22, type: 'slash', lunge: 2.5 }),
      m({ id: 's2', name: '返し斬り', anim: 'slashL', damage: 22, type: 'slash', lunge: 2.5 }),
      m({ id: 's3', name: '刺し込み', anim: 'thrust', damage: 26, type: 'pierce', reach: 2.6, arc: 50, lunge: 4 }),
      m({ id: 's4', name: '断ち落とし', anim: 'overhead', damage: 38, type: 'slash', startup: 0.18, recovery: 0.4, poise: 25, partMult: 1.3 }),
    ],
    up: m({ id: 'su', name: '斬り上げ', anim: 'rising', damage: 26, type: 'slash', lift: 6.5, poise: 18, stamina: 14 }),
    forward: m({ id: 'sf', name: '踏み込み突進斬り', anim: 'thrust', damage: 30, type: 'slash', lunge: 13, startup: 0.1, active: 0.18, reach: 2.4, arc: 70, stamina: 16 }),
    charge: m({ id: 'sc', name: '溜め断頭斬り', anim: 'overhead', damage: 70, type: 'slash', startup: 0.08, active: 0.12, recovery: 0.45, partMult: 2.0, poise: 45, stamina: 22, stopMult: 1.6 }),
    chargeTime: 0.75,
    look: { bladeLen: 1.15, bladeWidth: 0.09 },
    recipe: {},
  },
  greatsword: {
    id: 'greatsword',
    name: '断罪の大剣',
    desc: '重斬撃。刃で斬り、腹で叩く。溜めは刃側の大切断。',
    combo: [
      m({ id: 'g1', name: '大薙ぎ', anim: 'slashR', damage: 40, type: 'slash', startup: 0.22, recovery: 0.4, reach: 2.8, arc: 150, poise: 25, stamina: 18 }),
      m({ id: 'g2', name: '腹打ち', anim: 'slashL', damage: 38, type: 'blunt', startup: 0.22, recovery: 0.4, reach: 2.8, arc: 140, poise: 30, stamina: 18, armorMult: 1.4 }),
      m({ id: 'g3', name: '大上段', anim: 'overhead', damage: 58, type: 'slash', startup: 0.3, recovery: 0.55, reach: 2.9, arc: 60, poise: 40, stamina: 22, partMult: 1.3 }),
    ],
    up: m({ id: 'gu', name: '豪斬り上げ', anim: 'rising', damage: 42, type: 'slash', lift: 5.5, startup: 0.2, poise: 30, stamina: 20 }),
    forward: m({ id: 'gf', name: '肩入れ突進', anim: 'thrust', damage: 44, type: 'blunt', lunge: 11, startup: 0.14, active: 0.2, reach: 2.6, arc: 80, stamina: 22, superArmor: true, armorMult: 1.5 }),
    charge: m({ id: 'gc', name: '巨神断ち', anim: 'overhead', damage: 110, type: 'slash', startup: 0.1, active: 0.14, recovery: 0.6, reach: 3.1, arc: 70, partMult: 2.2, poise: 70, stamina: 30, superArmor: true, stopMult: 1.8 }),
    chargeTime: 1.0,
    look: { bladeLen: 1.75, bladeWidth: 0.17 },
    recipe: { knight_plate: 2, ghoul_bone: 3 },
  },
  hammer: {
    id: 'hammer',
    name: '粉骨の戦鎚',
    desc: '装甲破壊のスペシャリスト。外殻を砕いて肉を露出させる。',
    combo: [
      m({ id: 'h1', name: '振り下ろし', anim: 'smash', damage: 36, type: 'blunt', startup: 0.24, recovery: 0.42, reach: 2.4, arc: 70, poise: 35, stamina: 18, armorMult: 1.8 }),
      m({ id: 'h2', name: '横殴り', anim: 'slashR', damage: 36, type: 'blunt', startup: 0.22, recovery: 0.42, reach: 2.4, arc: 130, poise: 30, stamina: 18, armorMult: 1.8 }),
      m({ id: 'h3', name: '地割り', anim: 'smash', damage: 60, type: 'blunt', startup: 0.34, recovery: 0.6, reach: 2.6, arc: 120, poise: 55, stamina: 24, armorMult: 2.2 }),
    ],
    up: m({ id: 'hu', name: '跳ね上げ', anim: 'rising', damage: 40, type: 'blunt', lift: 5, startup: 0.2, poise: 40, stamina: 20, armorMult: 1.6 }),
    forward: m({ id: 'hf', name: '鉄塊突撃', anim: 'smash', damage: 48, type: 'blunt', lunge: 10, startup: 0.16, active: 0.16, reach: 2.4, arc: 80, poise: 45, stamina: 22, armorMult: 2.0 }),
    charge: m({ id: 'hc', name: '天墜', anim: 'smash', damage: 105, type: 'blunt', startup: 0.1, active: 0.12, recovery: 0.65, reach: 3.2, arc: 360, poise: 90, stamina: 32, armorMult: 3.0, superArmor: true, stopMult: 2.0 }),
    chargeTime: 1.0,
    look: { bladeLen: 1.1, bladeWidth: 0.06, head: 'hammer' },
    recipe: { brute_knuckle: 1, knight_plate: 2 },
  },
  twin: {
    id: 'twin',
    name: '双牙の双刃',
    desc: '手数と出血。軽い斬撃を絶え間なく重ねる。',
    combo: [
      m({ id: 't1', name: '連牙・一', anim: 'slashR', damage: 13, type: 'slash', startup: 0.07, recovery: 0.16, stamina: 6, poise: 5, lunge: 3 }),
      m({ id: 't2', name: '連牙・二', anim: 'slashL', damage: 13, type: 'slash', startup: 0.07, recovery: 0.16, stamina: 6, poise: 5, lunge: 3 }),
      m({ id: 't3', name: '連牙・三', anim: 'spin', damage: 10, type: 'slash', startup: 0.08, active: 0.24, hits: 3, recovery: 0.2, arc: 360, stamina: 10, poise: 8 }),
      m({ id: 't4', name: '喉裂き', anim: 'thrust', damage: 24, type: 'pierce', startup: 0.1, recovery: 0.3, arc: 50, stamina: 10, poise: 12, lunge: 6 }),
    ],
    up: m({ id: 'tu', name: '燕返し', anim: 'rising', damage: 12, type: 'slash', hits: 2, active: 0.16, lift: 7.5, stamina: 12 }),
    forward: m({ id: 'tf', name: '影縫い', anim: 'thrust', damage: 22, type: 'pierce', lunge: 16, startup: 0.06, active: 0.16, arc: 60, stamina: 12 }),
    charge: m({ id: 'tc', name: '嵐牙', anim: 'spin', damage: 14, type: 'slash', hits: 7, startup: 0.06, active: 0.5, recovery: 0.35, arc: 360, partMult: 1.5, stamina: 26, poise: 30 }),
    chargeTime: 0.6,
    look: { bladeLen: 0.7, bladeWidth: 0.07, twin: true },
    recipe: { hound_fang: 2, ghoul_bone: 2 },
  },
  spear: {
    id: 'spear',
    name: '穿孔の長槍',
    desc: 'リーチと刺突。眼球や装甲の隙間を貫き大ダウンを奪う。',
    combo: [
      m({ id: 'p1', name: '穿ち', anim: 'thrust', damage: 22, type: 'pierce', reach: 3.4, arc: 40, startup: 0.12, lunge: 2 }),
      m({ id: 'p2', name: '二連穿ち', anim: 'thrust', damage: 14, type: 'pierce', reach: 3.4, arc: 40, hits: 2, active: 0.16 }),
      m({ id: 'p3', name: '薙ぎ払い', anim: 'slashR', damage: 26, type: 'slash', reach: 3.2, arc: 150, startup: 0.18, recovery: 0.32, poise: 20 }),
      m({ id: 'p4', name: '貫徹', anim: 'thrust', damage: 40, type: 'pierce', reach: 3.8, arc: 30, startup: 0.2, recovery: 0.42, poise: 30, lunge: 5 }),
    ],
    up: m({ id: 'pu', name: '跳ね突き', anim: 'rising', damage: 26, type: 'pierce', reach: 3.4, lift: 6, arc: 60, stamina: 14 }),
    forward: m({ id: 'pf', name: '突撃槍', anim: 'thrust', damage: 34, type: 'pierce', reach: 3.6, lunge: 14, active: 0.2, arc: 40, stamina: 16, poise: 25 }),
    charge: m({ id: 'pc', name: '天穿', anim: 'thrust', damage: 85, type: 'pierce', reach: 4.2, arc: 30, startup: 0.08, recovery: 0.45, partMult: 1.8, poise: 60, stamina: 24, lunge: 6, stopMult: 1.6 }),
    chargeTime: 0.85,
    look: { bladeLen: 2.1, bladeWidth: 0.05, head: 'spear' },
    recipe: { knight_plate: 1, hound_fang: 1, ghoul_bone: 2 },
  },
};

// ---------------------------------------------------------------------------
// ライブ・グラフト（現地即時接続）
// ---------------------------------------------------------------------------

export interface GraftDef {
  id: GraftId;
  name: string;
  desc: string;
  energy: number;
  /** 軽攻撃3段目からの派生 */
  link: MoveDef;
  up: MoveDef;
  forward: MoveDef;
  special: MoveDef;
  /** フィールドギミック解除能力 */
  field?: 'gate' | 'burn';
  color: number;
}

export const GRAFTS: Record<GraftId, GraftDef> = {
  shield: {
    id: 'shield',
    name: '鎧騎士の大盾',
    desc: '長押しで鉄壁のガード。離すとシールドバッシュ。',
    energy: 100,
    color: 0x9aa4b8,
    link: m({ id: 'gs_link', name: '盾殴り', anim: 'graftPunch', damage: 34, type: 'blunt', poise: 45, armorMult: 1.6, energy: 10, stamina: 12 }),
    up: m({ id: 'gs_up', name: '盾かち上げ', anim: 'graftPunch', damage: 30, type: 'blunt', lift: 5, poise: 40, energy: 10, stamina: 12 }),
    forward: m({ id: 'gs_fwd', name: '鉄壁突進', anim: 'graftGuard', damage: 46, type: 'blunt', lunge: 12, active: 0.22, superArmor: true, guard: 0.85, poise: 60, armorMult: 2, energy: 18, stamina: 16 }),
    special: m({ id: 'gs_sp', name: '不動の構え→盾撃', anim: 'graftGuard', damage: 60, type: 'blunt', startup: 0.05, active: 0.12, recovery: 0.35, guard: 0.9, sustain: 3, poise: 70, armorMult: 2.2, energy: 20, stamina: 10 }),
  },
  jaw: {
    id: 'jaw',
    name: '火喰い猟犬の顎',
    desc: '左腕から火炎を放射。茨や氷を焼き払う。',
    energy: 100,
    color: 0xff6a1a,
    field: 'burn',
    link: m({ id: 'gj_link', name: '焦熱噛み', anim: 'graftPunch', damage: 30, type: 'slash', fire: true, energy: 10, stamina: 10 }),
    up: m({ id: 'gj_up', name: '昇り火柱', anim: 'graftBeam', damage: 14, type: 'slash', fire: true, hits: 4, active: 0.4, reach: 3.5, arc: 70, lift: 4, energy: 15, stamina: 10 }),
    forward: m({ id: 'gj_fwd', name: '焔駆け', anim: 'graftBeam', damage: 12, type: 'slash', fire: true, hits: 5, active: 0.4, lunge: 9, reach: 3, arc: 70, energy: 16, stamina: 14 }),
    special: m({ id: 'gj_sp', name: '火炎放射', anim: 'graftBeam', damage: 9, type: 'slash', fire: true, hits: 14, startup: 0.15, active: 1.4, recovery: 0.3, reach: 6, arc: 50, sustain: 2.2, energy: 30, stamina: 8, partMult: 1.2 }),
  },
  brutearm: {
    id: 'brutearm',
    name: '怪力の剛腕',
    desc: '圧倒的な打撃。錆びた鉄格子もこじ開ける。',
    energy: 100,
    color: 0xc2a07a,
    field: 'gate',
    link: m({ id: 'gb_link', name: '鉄拳', anim: 'graftPunch', damage: 48, type: 'blunt', armorMult: 2.4, poise: 55, startup: 0.16, energy: 12, stamina: 14 }),
    up: m({ id: 'gb_up', name: '剛昇拳', anim: 'graftPunch', damage: 42, type: 'blunt', lift: 6, armorMult: 2, poise: 50, energy: 12, stamina: 14 }),
    forward: m({ id: 'gb_fwd', name: '剛腕タックル', anim: 'graftPunch', damage: 52, type: 'blunt', lunge: 12, active: 0.2, superArmor: true, armorMult: 2.4, poise: 70, energy: 18, stamina: 18 }),
    special: m({ id: 'gb_sp', name: '大地砕き', anim: 'smash', damage: 95, type: 'blunt', startup: 0.3, reach: 3.6, arc: 360, armorMult: 3, poise: 100, superArmor: true, energy: 30, stamina: 20, stopMult: 2 }),
  },
  sawaxe: {
    id: 'sawaxe',
    name: '処刑騎士の蒸気回転斧',
    desc: 'ボスの最強武器。多段ヒットの回転ノコギリで削り切る。',
    energy: 100,
    color: 0xd04020,
    link: m({ id: 'ga_link', name: '回転鋸裂き', anim: 'graftPunch', damage: 12, type: 'slash', hits: 4, active: 0.3, energy: 10, stamina: 10, partMult: 1.4 }),
    up: m({ id: 'ga_up', name: '鋸昇り', anim: 'rising', damage: 12, type: 'slash', hits: 4, active: 0.3, lift: 6, energy: 12, stamina: 12 }),
    forward: m({ id: 'ga_fwd', name: '回転ノコギリ突進', anim: 'graftPunch', damage: 14, type: 'slash', hits: 6, active: 0.45, lunge: 11, superArmor: true, energy: 18, stamina: 16, partMult: 1.5 }),
    special: m({ id: 'ga_sp', name: '蒸気大旋風', anim: 'spin', damage: 16, type: 'slash', hits: 10, startup: 0.15, active: 1.0, reach: 3.4, arc: 360, superArmor: true, energy: 30, stamina: 20, partMult: 1.6 }),
  },
};

// ---------------------------------------------------------------------------
// 素材・パーク・ソケット
// ---------------------------------------------------------------------------

export type AttachEffect = 'steamSpin' | 'fireEdge' | 'whipTendon' | 'rivetShock';
export type CoreEffect = 'doubleJump' | 'superArmor' | 'steamBoost' | 'aegis';

export interface MaterialDef {
  name: string;
  desc: string;
  /** 武器への機構パーツ合成が可能か */
  attach?: AttachEffect;
  /** 義体ソケットに定着可能か */
  core?: { slot: SocketSlot; effect: CoreEffect };
  rarity: 1 | 2 | 3;
}

export const MATERIALS: Record<string, MaterialDef> = {
  ghoul_bone: { name: '屍骨片', desc: '瘴気に侵された骨。鍛冶の基礎素材。', rarity: 1 },
  knight_plate: { name: '鎧鉄片', desc: '狂った鎧騎士の装甲板。', rarity: 1 },
  hound_fang: { name: '猟犬の牙', desc: '熱を帯びた鋭い牙。', rarity: 1 },
  brute_knuckle: { name: '剛獣の拳骨', desc: '岩のように硬い拳の骨。', rarity: 1 },
  rivet_shield: { name: '盾鋲の機構', desc: '【合成】パリィ成功時に衝撃波が発生する。', attach: 'rivetShock', rarity: 2 },
  hound_flamesac: { name: '猟犬の火袋', desc: '【合成】攻撃に炎が宿り、溜め攻撃で火炎波を放つ。', attach: 'fireEdge', rarity: 2 },
  brute_tendon: { name: '剛獣の腱', desc: '【合成】強攻撃で武器がムチのようにしなり、中距離を薙ぎ払う。', attach: 'whipTendon', rarity: 2 },
  saw_engine: { name: '蒸気回転機関', desc: '【合成】溜め攻撃が超高速の回転斬りに変化する。', attach: 'steamSpin', rarity: 3 },
  core_hound: { name: '猟犬の跳腱核', desc: '【脚部】二段ジャンプと空中ステップを解放。', core: { slot: 'legs', effect: 'doubleJump' }, rarity: 2 },
  core_brute: { name: '剛獣の蹄核', desc: '【脚部】攻撃中に吹き飛ばされなくなる（スーパーアーマー）。', core: { slot: 'legs', effect: 'superArmor' }, rarity: 2 },
  core_knight: { name: '鎧騎士の心核', desc: '【左腕】パリィ受付時間+60%、被ダメージ-15%。', core: { slot: 'arm', effect: 'aegis' }, rarity: 2 },
  core_galahad: { name: '処刑騎士の蒸気炉', desc: '【背部】突進距離とスタミナ回復が大幅上昇。', core: { slot: 'back', effect: 'steamBoost' }, rarity: 3 },
  galahad_helm: { name: '処刑騎士の兜片', desc: '頭部を破壊して倒した証。高位の鍛冶素材。', rarity: 3 },
};

export interface PerkDef {
  name: string;
  desc: string;
}

export const PERKS: Record<PerkId, PerkDef> = {
  parryShock: { name: '反響', desc: 'パリィ成功時に衝撃波発生' },
  partDmg30: { name: '解体', desc: '部位耐久値へのダメージ+30%' },
  backCrit: { name: '背討ち', desc: '背面攻撃時に確定クリティカル' },
  slash15: { name: '鋭刃', desc: '斬撃ダメージ+15%' },
  blunt15: { name: '重撃', desc: '打撃ダメージ+15%' },
  pierce15: { name: '穿通', desc: '刺突ダメージ+15%' },
  graftEnergy25: { name: '神経強化', desc: 'グラフト耐久エネルギー+25%' },
  staminaRegen: { name: '不撓', desc: 'スタミナ回復速度+25%' },
  lifesteal: { name: '血喰い', desc: '部位切断時にHP回復' },
};

export const PERK_IDS = Object.keys(PERKS) as PerkId[];

export const SOCKET_LABEL: Record<SocketSlot, string> = {
  arm: '左腕',
  legs: '脚部',
  back: '背部',
};
