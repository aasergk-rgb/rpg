import * as THREE from 'three';
import type { Enemy } from '../game/Enemy';
import type { Game } from '../game/Game';

/** 戦闘HUD（DOMオーバーレイ） */
export class Hud {
  readonly root: HTMLDivElement;
  private hpFill: HTMLDivElement;
  private hpLag: HTMLDivElement;
  private stFill: HTMLDivElement;
  private graftBox: HTMLDivElement;
  private graftName: HTMLDivElement;
  private graftFill: HTMLDivElement;
  private boss: HTMLDivElement;
  private bossName: HTMLDivElement;
  private bossFill: HTMLDivElement;
  private bossLag: HTMLDivElement;
  private bossParts: HTMLDivElement;
  private lock: HTMLDivElement;
  private lockLabel: HTMLDivElement;
  private enemyBar: HTMLDivElement;
  private toasts: HTMLDivElement;
  private bannerEl: HTMLDivElement;
  private popEl: HTMLDivElement;
  private vignette: HTMLDivElement;
  private redWarn: HTMLDivElement;
  private zoneEl: HTMLDivElement;
  private prompt: HTMLDivElement;
  private fpsEl: HTMLDivElement;
  private lootLog: HTMLDivElement;
  private chargeRing: HTMLDivElement;
  private hpLagV = 1;
  private bossLagV = 1;
  private bossTarget: Enemy | null = null;
  showFps = false;

  constructor(parent: HTMLElement, private game: Game) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="vitals">
        <div class="bar hp"><div class="lag"></div><div class="fill"></div></div>
        <div class="bar st"><div class="fill"></div></div>
        <div class="graft hidden"><div class="gname"></div><div class="bar en"><div class="fill"></div></div></div>
      </div>
      <div class="boss hidden"><div class="bname"></div><div class="bar bhp"><div class="lag"></div><div class="fill"></div></div><div class="bparts"></div></div>
      <div class="lockmark hidden"><div class="ring"></div><div class="label"></div><div class="ebar"><div class="fill"></div></div></div>
      <div class="charge-ring hidden"></div>
      <div class="toasts"></div>
      <div class="banner hidden"><div class="t1"></div><div class="t2"></div></div>
      <div class="pop"></div>
      <div class="vignette"></div>
      <div class="redwarn"></div>
      <div class="zone"></div>
      <div class="prompt hidden"></div>
      <div class="fps hidden"></div>
      <div class="lootlog"></div>
    `;
    parent.appendChild(this.root);
    const q = <T extends HTMLElement>(s: string) => this.root.querySelector(s) as T;
    this.hpFill = q('.hp .fill');
    this.hpLag = q('.hp .lag');
    this.stFill = q('.st .fill');
    this.graftBox = q('.graft');
    this.graftName = q('.gname');
    this.graftFill = q('.en .fill');
    this.boss = q('.boss');
    this.bossName = q('.bname');
    this.bossFill = q('.bhp .fill');
    this.bossLag = q('.bhp .lag');
    this.bossParts = q('.bparts');
    this.lock = q('.lockmark');
    this.lockLabel = q('.lockmark .label');
    this.enemyBar = q('.lockmark .ebar .fill');
    this.toasts = q('.toasts');
    this.bannerEl = q('.banner');
    this.popEl = q('.pop');
    this.vignette = q('.vignette');
    this.redWarn = q('.redwarn');
    this.zoneEl = q('.zone');
    this.prompt = q('.prompt');
    this.fpsEl = q('.fps');
    this.lootLog = q('.lootlog');
    this.chargeRing = q('.charge-ring');
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }

  toast(msg: string): void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 4) this.toasts.firstChild?.remove();
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3200);
  }

  loot(msg: string, rarity: number): void {
    const el = document.createElement('div');
    el.className = `loot r${rarity}`;
    el.textContent = msg;
    this.lootLog.appendChild(el);
    while (this.lootLog.children.length > 5) this.lootLog.firstChild?.remove();
    setTimeout(() => el.classList.add('out'), 3500);
    setTimeout(() => el.remove(), 4200);
  }

  banner(t1: string, t2 = '', cls = ''): void {
    this.bannerEl.className = `banner ${cls}`;
    (this.bannerEl.querySelector('.t1') as HTMLElement).textContent = t1;
    (this.bannerEl.querySelector('.t2') as HTMLElement).textContent = t2;
    this.bannerEl.classList.remove('hidden');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
    clearTimeout((this.bannerEl as any)._t);
    (this.bannerEl as any)._t = setTimeout(() => this.bannerEl.classList.remove('show'), 2600);
  }

  /** 「刃合わせ」「見切り」等の瞬間表示 */
  pop(text: string, cls: string): void {
    const el = document.createElement('div');
    el.className = `popt ${cls}`;
    el.textContent = text;
    this.popEl.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  damageFlash(): void {
    this.vignette.classList.remove('hit');
    void this.vignette.offsetWidth;
    this.vignette.classList.add('hit');
  }

  redWarning(): void {
    this.redWarn.classList.remove('on');
    void this.redWarn.offsetWidth;
    this.redWarn.classList.add('on');
  }

  zone(name: string): void {
    this.zoneEl.textContent = name;
    this.zoneEl.classList.remove('show');
    void this.zoneEl.offsetWidth;
    this.zoneEl.classList.add('show');
  }

  setPrompt(text: string | null): void {
    this.prompt.classList.toggle('hidden', !text);
    if (text) this.prompt.textContent = text;
  }

  setBoss(e: Enemy | null): void {
    this.bossTarget = e;
    this.boss.classList.toggle('hidden', !e);
    if (e) {
      this.bossName.textContent = e.name;
      this.bossLagV = e.hp / e.hpMax;
    }
  }

  update(dt: number): void {
    const p = this.game.player;
    const hpK = p.hp / p.hpMax;
    this.hpFill.style.width = `${hpK * 100}%`;
    this.hpLagV = this.hpLagV > hpK ? Math.max(hpK, this.hpLagV - dt * 0.4) : hpK;
    this.hpLag.style.width = `${this.hpLagV * 100}%`;
    this.stFill.style.width = `${(p.stamina / p.staminaMax) * 100}%`;
    if (p.graft) {
      this.graftBox.classList.remove('hidden');
      this.graftName.textContent = `接続中：${p.graft.def.name}`;
      this.graftFill.style.width = `${(p.graft.energy / p.graft.max) * 100}%`;
    } else this.graftBox.classList.add('hidden');

    const b = this.bossTarget;
    if (b) {
      const k = b.hp / b.hpMax;
      this.bossFill.style.width = `${k * 100}%`;
      this.bossLagV = this.bossLagV > k ? Math.max(k, this.bossLagV - dt * 0.25) : k;
      this.bossLag.style.width = `${this.bossLagV * 100}%`;
      this.bossParts.innerHTML = b.partOrder
        .filter((id) => id !== b.bodyPart)
        .map((id) => {
          const pt = b.parts[id];
          const ar = pt.armorMax > 0 ? (pt.armor / pt.armorMax) * 100 : 0;
          const hp = (pt.hp / pt.hpMax) * 100;
          const st = pt.severed ? 'severed' : pt.broken ? 'broken' : '';
          const sel = this.game.lock.target === b && this.game.lock.partId === id ? 'sel' : '';
          return `<div class="bp ${st} ${sel}"><span>${pt.name}</span><div class="pb"><div class="ar" style="width:${ar}%"></div><div class="ph" style="width:${hp}%"></div></div></div>`;
        })
        .join('');
    }

    // ロックオンマーカー
    const lp = this.game.lock.point();
    const t = this.game.lock.target;
    if (lp && t) {
      const v = lp.clone().project(this.game.cam.camera);
      if (v.z < 1) {
        this.lock.classList.remove('hidden');
        const x = (v.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
        this.lock.style.transform = `translate(${x}px, ${y}px)`;
        const part = t.parts[this.game.lock.partId ?? t.bodyPart];
        const armorTxt = part.armor > 0 ? '装甲' : part.severable ? '切断可' : part.weak > 1 ? '弱点' : '';
        this.lockLabel.textContent = `${part.name}${armorTxt ? '・' + armorTxt : ''}`;
        this.lock.classList.toggle('armored', part.armor > 0);
        this.lock.classList.toggle('exposed', part.armor <= 0 && part.severable);
        (this.enemyBar.parentElement as HTMLElement).style.display = t.boss ? 'none' : '';
        this.enemyBar.style.width = `${(t.hp / t.hpMax) * 100}%`;
      } else this.lock.classList.add('hidden');
    } else this.lock.classList.add('hidden');

    // 溜めリング
    const ck = p.chargeProgress();
    if (ck > 0) {
      const hp = p.pos.clone().setY(p.pos.y + 2.2).project(this.game.cam.camera);
      this.chargeRing.classList.remove('hidden');
      this.chargeRing.style.transform = `translate(${(hp.x * 0.5 + 0.5) * window.innerWidth}px, ${(-hp.y * 0.5 + 0.5) * window.innerHeight}px)`;
      this.chargeRing.style.setProperty('--k', String(ck));
      this.chargeRing.classList.toggle('full', ck >= 1);
    } else this.chargeRing.classList.add('hidden');

    this.fpsEl.classList.toggle('hidden', !this.showFps);
    if (this.showFps) this.fpsEl.textContent = `${this.game.renderer.fps.toFixed(0)} fps`;
    void THREE;
  }
}
