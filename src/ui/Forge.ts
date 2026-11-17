import { MATERIALS, PERKS, SKELETONS, SOCKET_LABEL } from '../game/Data';
import { computeBuild, countMaterial, craftSkeleton, isEquipped, type SaveData } from '../game/Build';
import { DAMAGE_TYPE_LABEL, type SkeletonId, type SocketSlot } from '../game/Types';
import { esc, type MenuLayer } from './Menus';

type Tab = 'weapon' | 'attach' | 'socket' | 'mats';

/** 拠点の鍛冶屋：キメラ・ウェポンクラフト／義体ソケット改造 */
export class ForgeUI {
  private tab: Tab = 'weapon';

  constructor(
    private menus: MenuLayer,
    private getSave: () => SaveData,
    private onChange: () => void,
    private sfx: () => void,
  ) {}

  open(onClose: () => void): void {
    const el = this.menus.push(this.html(), '', () => {
      this.menus.pop();
      onClose();
    });
    el.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!t) return;
      this.sfx();
      this.act(t.dataset.act!, t.dataset.arg ?? '');
      if (t.dataset.act === 'close') {
        this.menus.pop();
        onClose();
        return;
      }
      this.menus.replaceTop(this.html());
    });
  }

  private act(act: string, arg: string): void {
    const s = this.getSave();
    switch (act) {
      case 'tab':
        this.tab = arg as Tab;
        return;
      case 'equipSkel':
        if (s.ownedSkeletons.includes(arg as SkeletonId)) s.skeleton = arg as SkeletonId;
        break;
      case 'craft':
        craftSkeleton(s, arg as SkeletonId);
        break;
      case 'attach':
        s.attachment = Number(arg);
        break;
      case 'detach':
        s.attachment = null;
        break;
      case 'socket': {
        const [slot, uid] = arg.split(':');
        s.sockets[slot as SocketSlot] = Number(uid);
        break;
      }
      case 'unsocket':
        s.sockets[arg as SocketSlot] = null;
        break;
      default:
        return;
    }
    this.onChange();
  }

  private html(): string {
    const s = this.getSave();
    const b = computeBuild(s);
    const tabBtn = (t: Tab, label: string) => `<button class="mbtn small ${this.tab === t ? 'primary' : ''}" data-act="tab" data-arg="${t}">${label}</button>`;
    let body = '';
    if (this.tab === 'weapon') {
      body += `<h3>現在の武装：${esc(b.skeleton.name)}</h3><p>${esc(b.skeleton.desc)}</p>`;
      body += `<div class="items">`;
      body += [...b.combo.map((m, i) => `軽${i + 1}：${m.name}`), `上フリック：${b.up.name}`, `前フリック：${b.forward.name}`, `溜め：${b.charge.name}`]
        .map((x) => `<div class="item"><span class="ds">${esc(x)}</span></div>`)
        .join('');
      body += `</div><h3>武器骨格</h3><div class="items">`;
      for (const sk of Object.values(SKELETONS)) {
        const owned = s.ownedSkeletons.includes(sk.id);
        const types = [...new Set([...sk.combo, sk.charge].map((m) => DAMAGE_TYPE_LABEL[m.type]))].join('・');
        let btn: string;
        if (s.skeleton === sk.id) btn = `<span class="pk">装備中</span>`;
        else if (owned) btn = `<button class="mbtn small" data-act="equipSkel" data-arg="${sk.id}">装備</button>`;
        else {
          const rec = Object.entries(sk.recipe);
          const ok = rec.length > 0 && rec.every(([k, n]) => countMaterial(s, k) >= n);
          const recTxt = rec.length ? rec.map(([k, n]) => `${MATERIALS[k].name}×${n}（${countMaterial(s, k)}）`).join(' ') : '宝箱から入手';
          btn = rec.length ? `<button class="mbtn small" data-act="craft" data-arg="${sk.id}" ${ok ? '' : 'disabled'}>作成</button>` : '';
          btn = `<span class="ds">${esc(recTxt)}</span>${btn}`;
        }
        body += `<div class="item ${s.skeleton === sk.id ? 'eq' : ''}"><div><div class="nm">${esc(sk.name)}　<span class="ds">${types}</span></div><div class="ds">${esc(sk.desc)}</div></div><div>${btn}</div></div>`;
      }
      body += `</div>`;
    } else if (this.tab === 'attach') {
      const cur = s.materials.find((m) => m.uid === s.attachment);
      body += `<h3>機構パーツ合成</h3><p>武器の骨格に魔獣の部位を継ぎ接ぎすると、攻撃モーションそのものが変化する。</p>`;
      body += cur
        ? `<div class="item eq"><div><div class="nm">合成中：${esc(MATERIALS[cur.kind].name)}</div><div class="ds">${esc(MATERIALS[cur.kind].desc)}</div>${cur.perk ? `<div class="pk">特性：${PERKS[cur.perk].name}（${PERKS[cur.perk].desc}）</div>` : ''}</div><button class="mbtn small" data-act="detach">外す</button></div>`
        : `<p>合成中のパーツはない。</p>`;
      body += `<div class="items">`;
      const list = s.materials.filter((m) => MATERIALS[m.kind].attach && m.uid !== s.attachment);
      if (!list.length) body += `<p>合成可能なパーツがない。敵の部位を「残したまま」倒すと手に入りやすい。</p>`;
      for (const m of list) body += this.matRow(s, m.uid, `<button class="mbtn small" data-act="attach" data-arg="${m.uid}" ${isEquipped(s, m.uid) ? 'disabled' : ''}>合成</button>`);
      body += `</div>`;
    } else if (this.tab === 'socket') {
      body += `<h3>義体ソケット改造</h3><p>討伐した魔獣の核を定着させ、移動性能や基本アクションを拡張する。</p>`;
      for (const slot of ['arm', 'legs', 'back'] as SocketSlot[]) {
        const cur = s.materials.find((m) => m.uid === s.sockets[slot]);
        body += `<div class="item ${cur ? 'eq' : ''}"><div><div class="nm">${SOCKET_LABEL[slot]}：${cur ? esc(MATERIALS[cur.kind].name) : '空き'}</div>${cur ? `<div class="ds">${esc(MATERIALS[cur.kind].desc)}</div>` : ''}</div>${cur ? `<button class="mbtn small" data-act="unsocket" data-arg="${slot}">外す</button>` : ''}</div>`;
        const opts = s.materials.filter((m) => MATERIALS[m.kind].core?.slot === slot && !isEquipped(s, m.uid));
        for (const m of opts) body += this.matRow(s, m.uid, `<button class="mbtn small" data-act="socket" data-arg="${slot}:${m.uid}">定着</button>`);
      }
    } else {
      body += `<h3>所持素材</h3><div class="items">`;
      if (!s.materials.length) body += `<p>素材を持っていない。</p>`;
      for (const m of s.materials) body += this.matRow(s, m.uid, isEquipped(s, m.uid) ? '<span class="pk">使用中</span>' : '');
      body += `</div>`;
    }
    return `<div class="panel"><h2>鍛冶場</h2><div class="tabs">${tabBtn('weapon', '武器骨格')}${tabBtn('attach', '機構パーツ合成')}${tabBtn('socket', '義体ソケット')}${tabBtn('mats', '素材')}<button class="mbtn small" data-act="close">閉じる</button></div>${body}</div>`;
  }

  private matRow(s: SaveData, uid: number, action: string): string {
    const m = s.materials.find((x) => x.uid === uid)!;
    const d = MATERIALS[m.kind];
    return `<div class="item r${d.rarity}"><div><div class="nm">${esc(d.name)}</div><div class="ds">${esc(d.desc)}</div>${m.perk ? `<div class="pk">特性：${PERKS[m.perk].name}（${PERKS[m.perk].desc}）</div>` : ''}</div><div>${action}</div></div>`;
  }
}
