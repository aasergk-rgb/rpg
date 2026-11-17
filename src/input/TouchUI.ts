import type { InputState } from './InputState';

const FLICK_DIST = 26;
const FLICK_TIME = 280;
const HOLD_TIME = 250;

interface TrackedPointer {
  id: number;
  kind: 'stick' | 'attack' | 'sub' | 'camera';
  sx: number;
  sy: number;
  x: number;
  y: number;
  t0: number;
  resolved: boolean;
  swipeAcc: number;
}

/**
 * フリック派生ハイブリッドUI。
 * 画面を仮想ボタンで埋め尽くさず、右ボタンのタップ/上フリック/前フリック/長押しで技を出し分ける。
 */
export class TouchUI {
  readonly root: HTMLDivElement;
  private stickBase: HTMLDivElement;
  private stickKnob: HTMLDivElement;
  private attackBtn: HTMLDivElement;
  private subBtn: HTMLDivElement;
  private interactBtn: HTMLDivElement;
  private healBtn: HTMLDivElement;
  private lockBtn: HTMLDivElement;
  private pauseBtn: HTMLDivElement;
  private ptrs = new Map<number, TrackedPointer>();
  private holdTimers = new Map<number, number>();
  /** ロックオン中か（右側スワイプを部位切替に使う） */
  lockMode = false;
  sensitivity = 1;
  private visible = true;

  constructor(parent: HTMLElement, private input: InputState) {
    this.root = document.createElement('div');
    this.root.className = 'touch-ui';
    this.root.innerHTML = `
      <div class="stick-base"><div class="stick-knob"></div></div>
      <div class="tbtn attack" data-k="attack"><span class="main">攻</span><span class="hint">↑斬上 ←突進 長押:溜</span></div>
      <div class="tbtn sub" data-k="sub"><span class="main">避</span><span class="hint">静止:パリィ</span></div>
      <div class="tbtn interact hidden" data-k="interact"><span class="main">接続</span></div>
      <div class="tbtn small heal" data-k="heal"><span class="main">霊薬</span><span class="count"></span></div>
      <div class="tbtn small lock" data-k="lock"><span class="main">◎</span></div>
      <div class="tbtn tiny pause" data-k="pause"><span class="main">Ⅱ</span></div>
    `;
    parent.appendChild(this.root);
    this.stickBase = this.root.querySelector('.stick-base')!;
    this.stickKnob = this.root.querySelector('.stick-knob')!;
    this.attackBtn = this.root.querySelector('.attack')!;
    this.subBtn = this.root.querySelector('.sub')!;
    this.interactBtn = this.root.querySelector('.interact')!;
    this.healBtn = this.root.querySelector('.heal')!;
    this.lockBtn = this.root.querySelector('.lock')!;
    this.pauseBtn = this.root.querySelector('.pause')!;

    const opts = { passive: false } as AddEventListenerOptions;
    this.root.addEventListener('pointerdown', (e) => this.onDown(e), opts);
    window.addEventListener('pointermove', (e) => this.onMove(e), opts);
    window.addEventListener('pointerup', (e) => this.onUp(e), opts);
    window.addEventListener('pointercancel', (e) => this.onUp(e), opts);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());

    const simple = (el: HTMLElement, fn: () => void) =>
      el.addEventListener(
        'pointerdown',
        (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.input.lastDevice = 'touch';
          el.classList.add('pressed');
          setTimeout(() => el.classList.remove('pressed'), 120);
          fn();
        },
        opts,
      );
    simple(this.interactBtn, () => input.fire('interact'));
    simple(this.healBtn, () => input.fire('heal'));
    simple(this.lockBtn, () => input.fire('lock'));
    simple(this.pauseBtn, () => input.fire('pause'));
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.root.style.display = v ? '' : 'none';
    if (!v) this.resetAll();
  }

  private resetAll(): void {
    this.ptrs.clear();
    this.input.moveX = 0;
    this.input.moveY = 0;
    this.input.chargeHeld = false;
    this.input.purgeHeld = false;
    this.stickBase.classList.remove('active');
  }

  setGraftMode(name: string | null): void {
    const a = this.attackBtn.querySelector('.hint')!;
    const s = this.subBtn.querySelector('.hint')!;
    this.attackBtn.classList.toggle('graft', !!name);
    this.subBtn.classList.toggle('graft', !!name);
    a.textContent = name ? '↑対空 ←貫通突進 長押:必殺' : '↑斬上 ←突進 長押:溜';
    s.textContent = name ? '長押:パージ投擲' : '静止:パリィ';
  }

  setInteract(label: string | null): void {
    this.interactBtn.classList.toggle('hidden', !label);
    if (label) this.interactBtn.querySelector('.main')!.textContent = label;
  }

  setHeal(count: number): void {
    this.healBtn.querySelector('.count')!.textContent = String(count);
    this.healBtn.classList.toggle('empty', count <= 0);
  }

  setLock(on: boolean): void {
    this.lockMode = on;
    this.lockBtn.classList.toggle('on', on);
  }

  setCharge(k: number): void {
    this.attackBtn.style.setProperty('--charge', String(k));
    this.attackBtn.classList.toggle('charged', k >= 1);
  }

  private hitBtn(el: HTMLElement, x: number, y: number, pad = 10): boolean {
    const r = el.getBoundingClientRect();
    return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
  }

  private onDown(e: PointerEvent): void {
    if (!this.visible) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    this.input.lastDevice = 'touch';
    const x = e.clientX;
    const y = e.clientY;
    let kind: TrackedPointer['kind'];
    if (this.hitBtn(this.attackBtn, x, y, 14)) kind = 'attack';
    else if (this.hitBtn(this.subBtn, x, y, 10)) kind = 'sub';
    else if (x < window.innerWidth * 0.42 && y > window.innerHeight * 0.25) kind = 'stick';
    else kind = 'camera';
    const p: TrackedPointer = { id: e.pointerId, kind, sx: x, sy: y, x, y, t0: performance.now(), resolved: false, swipeAcc: 0 };
    this.ptrs.set(e.pointerId, p);
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* noop */
    }

    if (kind === 'stick') {
      this.stickBase.style.left = `${x}px`;
      this.stickBase.style.top = `${y}px`;
      this.stickBase.classList.add('active');
      this.stickKnob.style.transform = 'translate(-50%,-50%)';
    } else if (kind === 'attack') {
      this.attackBtn.classList.add('pressed');
      const timer = window.setTimeout(() => {
        const cur = this.ptrs.get(e.pointerId);
        if (cur && !cur.resolved) {
          cur.resolved = true;
          this.input.chargeHeld = true;
          this.input.fire('chargeStart');
          this.attackBtn.classList.add('holding');
        }
      }, HOLD_TIME);
      this.holdTimers.set(e.pointerId, timer);
    } else if (kind === 'sub') {
      this.subBtn.classList.add('pressed');
      const timer = window.setTimeout(() => {
        const cur = this.ptrs.get(e.pointerId);
        if (cur && !cur.resolved) {
          cur.resolved = true;
          this.input.purgeHeld = true;
          this.input.fire('purgeStart');
          this.subBtn.classList.add('holding');
        }
      }, 320);
      this.holdTimers.set(e.pointerId, timer);
    }
  }

  private onMove(e: PointerEvent): void {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    const dxFrame = e.clientX - p.x;
    const dyFrame = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    const dx = p.x - p.sx;
    const dy = p.y - p.sy;
    if (p.kind === 'stick') {
      const R = 60;
      const len = Math.hypot(dx, dy);
      const k = len > R ? R / len : 1;
      this.stickKnob.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
      const mag = Math.min(1, len / R);
      const dead = 0.12;
      const m = mag < dead ? 0 : (mag - dead) / (1 - dead);
      this.input.moveX = len > 0 ? (dx / len) * m : 0;
      this.input.moveY = len > 0 ? (-dy / len) * m : 0;
      // スティックを大きく外れたら基点を引き寄せる（フローティング）
      if (len > R * 1.6) {
        p.sx = p.x - (dx / len) * R * 1.6;
        p.sy = p.y - (dy / len) * R * 1.6;
        this.stickBase.style.left = `${p.sx}px`;
        this.stickBase.style.top = `${p.sy}px`;
      }
    } else if (p.kind === 'attack') {
      if (!p.resolved && performance.now() - p.t0 < FLICK_TIME && Math.hypot(dx, dy) > FLICK_DIST) {
        p.resolved = true;
        clearTimeout(this.holdTimers.get(p.id));
        if (dy < -Math.abs(dx) * 0.7) {
          this.input.fire('flickUp');
          this.flashBtn('flick-up');
        } else {
          this.input.fire('flickForward');
          this.flashBtn('flick-fwd');
        }
      }
    } else if (p.kind === 'camera') {
      if (this.lockMode) {
        // スワイプ式・部位ターゲット切り替え
        p.swipeAcc += Math.abs(dxFrame) > Math.abs(dyFrame) ? dxFrame : -dyFrame;
        const step = 46;
        while (p.swipeAcc > step) {
          this.input.fire('partNext');
          p.swipeAcc -= step;
        }
        while (p.swipeAcc < -step) {
          this.input.fire('partPrev');
          p.swipeAcc += step;
        }
      } else {
        const s = 0.006 * this.sensitivity;
        this.input.camDX += dxFrame * s;
        this.input.camDY += dyFrame * s * 0.7;
      }
    }
  }

  private flashBtn(cls: string): void {
    this.attackBtn.classList.add(cls);
    setTimeout(() => this.attackBtn.classList.remove(cls), 180);
  }

  private onUp(e: PointerEvent): void {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    this.ptrs.delete(e.pointerId);
    clearTimeout(this.holdTimers.get(p.id));
    this.holdTimers.delete(p.id);
    if (p.kind === 'stick') {
      this.input.moveX = 0;
      this.input.moveY = 0;
      this.stickBase.classList.remove('active');
    } else if (p.kind === 'attack') {
      this.attackBtn.classList.remove('pressed', 'holding');
      if (this.input.chargeHeld) {
        this.input.chargeHeld = false;
        this.input.fire('chargeRelease');
      } else if (!p.resolved) this.input.fire('light');
    } else if (p.kind === 'sub') {
      this.subBtn.classList.remove('pressed', 'holding');
      if (this.input.purgeHeld) {
        this.input.purgeHeld = false;
        this.input.fire('purgeRelease');
      } else if (!p.resolved) this.input.fire('sub');
    } else if (p.kind === 'camera' && !this.lockMode) {
      // ロックオンしていない時の素早いタップ（ダブルタップ不要）は何もしない
    }
  }
}
