/** 3属性の破壊メカニクス */
export type DamageType = 'blunt' | 'slash' | 'pierce';

export const DAMAGE_TYPE_LABEL: Record<DamageType, string> = {
  blunt: '打撃',
  slash: '斬撃',
  pierce: '刺突',
};

/** プレイヤーのスイングアニメーション種別（手続き的アニメーション用） */
export type SwingAnim =
  | 'slashR' // 右から左への横斬り
  | 'slashL' // 左から右
  | 'overhead' // 縦斬り
  | 'thrust' // 突き
  | 'rising' // 斬り上げ
  | 'spin' // 回転斬り
  | 'smash' // 叩きつけ
  | 'whip' // ムチ薙ぎ
  | 'graftPunch' // 左腕（義手）による攻撃
  | 'graftBeam' // 左腕から照射
  | 'graftGuard'; // 左腕で防御

export interface MoveDef {
  id: string;
  name: string;
  anim: SwingAnim;
  /** 予備動作（秒） */
  startup: number;
  /** 攻撃判定持続（秒） */
  active: number;
  /** 硬直（秒） */
  recovery: number;
  damage: number;
  type: DamageType;
  /** 届く距離（m） */
  reach: number;
  /** 判定の扇角度（度） */
  arc: number;
  /** 前進速度（m/s, startup〜active中） */
  lunge?: number;
  /** 上昇初速（斬り上げ・対空用） */
  lift?: number;
  stamina: number;
  /** 多段ヒット数（active中に均等割り） */
  hits?: number;
  /** 部位ダメージ倍率 */
  partMult?: number;
  /** 敵の体勢崩し値 */
  poise?: number;
  /** 打撃の装甲破壊倍率 */
  armorMult?: number;
  /** recovery の何割経過後に次の入力を受け付けるか */
  cancelAt?: number;
  /** 火属性（燃焼・茨焼却） */
  fire?: boolean;
  /** この技を使うときのグラフト耐久消費 */
  energy?: number;
  /** 技中スーパーアーマー */
  superArmor?: boolean;
  /** 技中の被ダメージ軽減（ガード） */
  guard?: number;
  /** 長押し継続技（離すまで active を延長、最大秒） */
  sustain?: number;
  /** ヒットストップ倍率 */
  stopMult?: number;
}

export type SkeletonId = 'sword' | 'greatsword' | 'hammer' | 'twin' | 'spear';

export type GraftId = 'shield' | 'jaw' | 'brutearm' | 'sawaxe';

export type SocketSlot = 'arm' | 'legs' | 'back';

/** 部位素材に付与されるランダム特性 */
export type PerkId =
  | 'parryShock'
  | 'partDmg30'
  | 'backCrit'
  | 'slash15'
  | 'blunt15'
  | 'pierce15'
  | 'graftEnergy25'
  | 'staminaRegen'
  | 'lifesteal';

export interface MaterialItem {
  uid: number;
  /** 素材の種別ID（Data.ts の MATERIALS のキー） */
  kind: string;
  perk: PerkId | null;
}
