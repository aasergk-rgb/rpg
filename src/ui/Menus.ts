/** 汎用メニュー画面（タッチ・マウス・ゲームパッドで操作） */
export class MenuLayer {
  private stack: HTMLDivElement[] = [];
  private focusIdx = 0;
  private prevPad: boolean[] = [];
  private axisLatch = 0;

  constructor(private parent: HTMLElement) {}

  get open(): boolean {
    return this.stack.length > 0;
  }

  get top(): HTMLDivElement | null {
    return this.stack[this.stack.length - 1] ?? null;
  }

  push(html: string, cls = '', onBack?: () => void): HTMLDivElement {
    const el = document.createElement('div');
    el.className = `screen ${cls}`;
    el.innerHTML = html;
    (el as any)._onBack = onBack;
    this.parent.appendChild(el);
    this.stack.push(el);
    this.focusIdx = 0;
    this.refreshFocus();
    // 入力が背面へ抜けないように
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    return el;
  }

  pop(): void {
    const el = this.stack.pop();
    el?.remove();
    this.focusIdx = 0;
    this.refreshFocus();
  }

  clear(): void {
    while (this.stack.length) this.pop();
  }

  back(): void {
    const el = this.top;
    if (!el) return;
    const fn = (el as any)._onBack as (() => void) | undefined;
    if (fn) fn();
  }

  /** 画面を描き直す（フォーカス位置は維持） */
  replaceTop(html: string): void {
    const el = this.top;
    if (!el) return;
    const keep = this.focusIdx;
    const scroll = el.querySelector('.panel')?.scrollTop ?? 0;
    el.innerHTML = html;
    const p = el.querySelector('.panel');
    if (p) p.scrollTop = scroll;
    this.focusIdx = keep;
    this.refreshFocus();
  }

  private buttons(): HTMLElement[] {
    return this.top ? Array.from(this.top.querySelectorAll<HTMLElement>('.mbtn:not(:disabled)')) : [];
  }

  private refreshFocus(): void {
    const b = this.buttons();
    b.forEach((x) => x.classList.remove('focus'));
    if (!b.length) return;
    this.focusIdx = Math.max(0, Math.min(this.focusIdx, b.length - 1));
    b[this.focusIdx].classList.add('focus');
    b[this.focusIdx].scrollIntoView?.({ block: 'nearest' });
  }

  /** キーボード・ゲームパッドのメニュー操作 */
  handleKey(code: string): boolean {
    if (!this.open) return false;
    const b = this.buttons();
    if (code === 'ArrowDown' || code === 'KeyS') this.focusIdx = (this.focusIdx + 1) % Math.max(1, b.length);
    else if (code === 'ArrowUp' || code === 'KeyW') this.focusIdx = (this.focusIdx - 1 + b.length) % Math.max(1, b.length);
    else if (code === 'Enter' || code === 'Space' || code === 'KeyJ') b[this.focusIdx]?.click();
    else if (code === 'Escape' || code === 'Backspace') this.back();
    else return false;
    this.refreshFocus();
    return true;
  }

  pollPad(): void {
    if (!this.open || !navigator.getGamepads) return;
    const pad = Array.from(navigator.getGamepads()).find((p) => p && p.connected);
    if (!pad) return;
    const b = pad.buttons.map((x) => x.pressed);
    const edge = (n: number) => b[n] && !this.prevPad[n];
    const ay = pad.axes[1] ?? 0;
    if (edge(13) || (ay > 0.6 && this.axisLatch === 0)) this.handleKey('ArrowDown');
    if (edge(12) || (ay < -0.6 && this.axisLatch === 0)) this.handleKey('ArrowUp');
    this.axisLatch = Math.abs(ay) > 0.6 ? 1 : 0;
    if (edge(0)) this.handleKey('Enter');
    if (edge(1) || edge(9)) this.handleKey('Escape');
    this.prevPad = b;
  }
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
