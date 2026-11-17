import { MATERIALS, SKELETONS, type AttachEffect, type CoreEffect, type SkeletonDef } from './Data';
import type { MaterialItem, MoveDef, PerkId, SkeletonId, SocketSlot } from './Types';

/** 永続化されるセーブデータ */
export interface SaveData {
  version: 1;
  skeleton: SkeletonId;
  ownedSkeletons: SkeletonId[];
  /** 武器に合成中の素材uid */
  attachment: number | null;
  sockets: Record<SocketSlot, number | null>;
  materials: MaterialItem[];
  nextUid: number;
  flags: Record<string, boolean>;
  flasksMax: number;
  /** 本編アンロック済みか（デモ：フラグのみ） */
  unlocked: boolean;
  playTime: number;
  kills: number;
}

export function newSave(): SaveData {
  return {
    version: 1,
    skeleton: 'sword',
    ownedSkeletons: ['sword'],
    attachment: null,
    sockets: { arm: null, legs: null, back: null },
    materials: [],
    nextUid: 1,
    flags: {},
    flasksMax: 3,
    unlocked: false,
    playTime: 0,
    kills: 0,
  };
}

/** 外部から読み込んだ JSON を検証・補完して SaveData にする */
export function parseSave(json: string | null): SaveData {
  const base = newSave();
  if (!json) return base;
  try {
    const raw = JSON.parse(json) as Partial<SaveData>;
    if (!raw || raw.version !== 1) return base;
    const out: SaveData = { ...base, ...raw, sockets: { ...base.sockets, ...(raw.sockets ?? {}) }, flags: { ...(raw.flags ?? {}) } };
    out.materials = Array.isArray(raw.materials)
      ? raw.materials.filter((x) => x && typeof x.uid === 'number' && typeof x.kind === 'string' && x.kind in MATERIALS)
      : [];
    out.ownedSkeletons = (Array.isArray(raw.ownedSkeletons) ? raw.ownedSkeletons : ['sword']).filter((s): s is SkeletonId => typeof s === 'string' && s in SKELETONS);
    if (!out.ownedSkeletons.includes('sword')) out.ownedSkeletons.unshift('sword');
    if (!(out.skeleton in SKELETONS) || !out.ownedSkeletons.includes(out.skeleton)) out.skeleton = 'sword';
    const uids = new Set(out.materials.map((x) => x.uid));
    if (out.attachment !== null && !uids.has(out.attachment)) out.attachment = null;
    for (const k of Object.keys(out.sockets) as SocketSlot[]) {
      if (out.sockets[k] !== null && !uids.has(out.sockets[k]!)) out.sockets[k] = null;
    }
    out.nextUid = Math.max(out.nextUid, ...out.materials.map((x) => x.uid + 1), 1);
    return out;
  } catch {
    return base;
  }
}

export function serializeSave(s: SaveData): string {
  return JSON.stringify(s);
}

export function addMaterial(s: SaveData, kind: string, perk: PerkId | null): MaterialItem {
  const item: MaterialItem = { uid: s.nextUid++, kind, perk };
  s.materials.push(item);
  return item;
}

export function countMaterial(s: SaveData, kind: string): number {
  return s.materials.filter((x) => x.kind === kind && !isEquipped(s, x.uid)).length;
}

export function isEquipped(s: SaveData, uid: number): boolean {
  return s.attachment === uid || Object.values(s.sockets).includes(uid);
}

/** 鍛冶：骨格作成。成功したら true */
export function craftSkeleton(s: SaveData, id: SkeletonId): boolean {
  if (s.ownedSkeletons.includes(id)) return false;
  const recipe = SKELETONS[id].recipe;
  for (const [kind, n] of Object.entries(recipe)) if (countMaterial(s, kind) < n) return false;
  for (const [kind, n] of Object.entries(recipe)) {
    let left = n;
    s.materials = s.materials.filter((x) => {
      if (left > 0 && x.kind === kind && !isEquipped(s, x.uid)) {
        left--;
        return false;
      }
      return true;
    });
  }
  s.ownedSkeletons.push(id);
  return true;
}

export interface BuildStats {
  skeleton: SkeletonDef;
  combo: MoveDef[];
  up: MoveDef;
  forward: MoveDef;
  charge: MoveDef;
  attach: AttachEffect | null;
  cores: Set<CoreEffect>;
  perks: Set<PerkId>;
}

function findItem(s: SaveData, uid: number | null): MaterialItem | undefined {
  return uid === null ? undefined : s.materials.find((x) => x.uid === uid);
}

/** セーブ内容から実際の性能（モーション継承を含む）を算出する */
export function computeBuild(s: SaveData): BuildStats {
  const skel = SKELETONS[s.skeleton];
  const perks = new Set<PerkId>();
  const cores = new Set<CoreEffect>();
  const att = findItem(s, s.attachment);
  const attach = att ? MATERIALS[att.kind].attach ?? null : null;
  if (att?.perk) perks.add(att.perk);
  for (const slot of ['arm', 'legs', 'back'] as SocketSlot[]) {
    const it = findItem(s, s.sockets[slot]);
    if (!it) continue;
    const c = MATERIALS[it.kind].core;
    if (c && c.slot === slot) cores.add(c.effect);
    if (it.perk) perks.add(it.perk);
  }

  let combo = skel.combo.map((x) => ({ ...x }));
  let up = { ...skel.up };
  let forward = { ...skel.forward };
  let charge = { ...skel.charge };

  // キメラ・ウェポンクラフト：機構パーツ合成で溜め攻撃のモーションそのものが変化する
  switch (attach) {
    case 'steamSpin':
      charge = {
        ...charge,
        name: '蒸気噴射・超高速回転斬り',
        anim: 'spin',
        arc: 360,
        hits: 6,
        active: 0.55,
        damage: Math.round(charge.damage * 0.3),
        superArmor: true,
        lunge: 3,
      };
      break;
    case 'whipTendon':
      charge = { ...charge, name: '腱しなり・鞭薙ぎ', anim: 'whip', reach: charge.reach + 3, arc: 170, type: 'slash', hits: 2, active: 0.22, damage: Math.round(charge.damage * 0.6) };
      combo[combo.length - 1] = { ...combo[combo.length - 1], reach: combo[combo.length - 1].reach + 1.2 };
      break;
    case 'fireEdge':
      combo = combo.map((x) => ({ ...x, fire: true }));
      up = { ...up, fire: true };
      forward = { ...forward, fire: true };
      charge = { ...charge, name: charge.name + '・火炎波', fire: true };
      break;
    case 'rivetShock':
      perks.add('parryShock');
      break;
  }
  if (cores.has('steamBoost')) forward = { ...forward, lunge: (forward.lunge ?? 0) * 1.4 };
  return { skeleton: skel, combo, up, forward, charge, attach, cores, perks };
}
