import { rng, type Rng } from '../core/Rng';
import { MATERIALS, PERK_IDS } from './Data';
import type { PartState } from './Parts';
import type { PerkId } from './Types';

export interface DropRoll {
  kind: string;
  perk: PerkId | null;
}

export interface DropContext {
  type: string;
  parts: Record<string, PartState>;
  /** その種類を初めて倒したか */
  firstKill: boolean;
}

function perkFor(kind: string, r: Rng): PerkId | null {
  const rar = MATERIALS[kind].rarity;
  const p = rar === 1 ? 0.15 : rar === 2 ? 0.6 : 1;
  return r.chance(p) ? r.pick(PERK_IDS) : null;
}

/**
 * 部位破壊報酬の分岐：
 *  「頭部を壊して倒したか」「無傷で残した部位があるか」でレア素材が変化する
 */
export function rollDrops(ctx: DropContext, r: Rng = rng): DropRoll[] {
  const out: string[] = [];
  const intact = (id: string) => !!ctx.parts[id] && !ctx.parts[id].severed && !ctx.parts[id].broken;
  const broken = (id: string) => !!ctx.parts[id] && (ctx.parts[id].broken || ctx.parts[id].severed);
  switch (ctx.type) {
    case 'ghoul':
      out.push('ghoul_bone');
      if (r.chance(0.35)) out.push('ghoul_bone');
      break;
    case 'knight':
      out.push('knight_plate');
      if (r.chance(0.4)) out.push('knight_plate');
      if (intact('shield') && r.chance(0.65)) out.push('rivet_shield');
      if (broken('head') && (ctx.firstKill || r.chance(0.45))) out.push('core_knight');
      break;
    case 'brute':
      out.push('brute_knuckle');
      if (intact('armR') && r.chance(0.75)) out.push('brute_tendon');
      if (ctx.firstKill || (broken('legs') && r.chance(0.6)) || r.chance(0.15)) out.push('core_brute');
      break;
    case 'hound':
      out.push('hound_fang');
      if (r.chance(0.4)) out.push('hound_fang');
      if (intact('jaw') && r.chance(0.75)) out.push('hound_flamesac');
      if (ctx.firstKill || r.chance(0.3)) out.push('core_hound');
      break;
    case 'galahad':
      out.push('core_galahad', 'knight_plate', 'knight_plate');
      if (broken('head')) out.push('galahad_helm');
      // 最強の右腕を壊さずに倒した時のみ
      if (intact('armR')) out.push('saw_engine');
      break;
  }
  return out.map((kind) => ({ kind, perk: perkFor(kind, r) }));
}
