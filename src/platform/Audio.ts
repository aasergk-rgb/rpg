/**
 * Web Audio によるプロシージャル効果音。
 * 金属音（高域・リング）と肉断ち音（低域・湿った破裂）を明確に分ける。
 */
export type Sfx =
  | 'swing'
  | 'swingHeavy'
  | 'metal'
  | 'deflect'
  | 'flesh'
  | 'sever'
  | 'armorBreak'
  | 'parry'
  | 'justEvade'
  | 'step'
  | 'hurt'
  | 'graft'
  | 'explosion'
  | 'roar'
  | 'fire'
  | 'saw'
  | 'ui'
  | 'pickup'
  | 'gate'
  | 'heal'
  | 'death';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private drone: OscillatorNode[] = [];
  volume = 0.7;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 1.5;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /** 環境音：低いドローン（巨神の鼓動） */
  startAmbience(): void {
    if (!this.ctx || !this.master || this.drone.length) return;
    const g = this.ctx.createGain();
    g.gain.value = 0.05;
    g.connect(this.master);
    for (const f of [41.2, 61.7, 82.4]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 140;
      o.connect(lp).connect(g);
      o.start();
      this.drone.push(o);
    }
  }

  private noise(dur: number, type: BiquadFilterType, freq: number, q: number, gain: number, attack = 0.002, delay = 0): void {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, delay = 0): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  play(s: Sfx): void {
    if (!this.ctx) return;
    const r = 0.9 + Math.random() * 0.2;
    switch (s) {
      case 'swing':
        this.noise(0.16, 'bandpass', 1400 * r, 1.2, 0.25, 0.04);
        break;
      case 'swingHeavy':
        this.noise(0.3, 'bandpass', 600 * r, 1, 0.4, 0.08);
        break;
      case 'metal':
        this.tone('square', 2400 * r, 1800, 0.18, 0.12);
        this.tone('triangle', 3700 * r, 3400, 0.35, 0.08);
        this.noise(0.08, 'highpass', 4000, 0.7, 0.3);
        break;
      case 'deflect':
        this.tone('square', 1900 * r, 1500, 0.12, 0.14);
        this.tone('sine', 5200 * r, 5000, 0.28, 0.06);
        this.noise(0.05, 'highpass', 5000, 0.7, 0.25);
        break;
      case 'armorBreak':
        this.noise(0.4, 'lowpass', 2200, 0.8, 0.6);
        this.tone('square', 900 * r, 200, 0.3, 0.15);
        break;
      case 'flesh':
        this.noise(0.18, 'lowpass', 700 * r, 2, 0.6, 0.003);
        this.tone('sine', 110 * r, 45, 0.18, 0.4);
        break;
      case 'sever':
        this.noise(0.35, 'lowpass', 900, 3, 0.8);
        this.tone('sine', 90, 30, 0.4, 0.6);
        this.noise(0.2, 'bandpass', 2500, 2, 0.3, 0.01, 0.05);
        break;
      case 'parry':
        this.tone('square', 1300, 1250, 0.4, 0.18);
        this.tone('sine', 2600, 2580, 0.6, 0.14);
        this.tone('sine', 3900, 3880, 0.5, 0.08);
        this.noise(0.1, 'highpass', 3000, 0.7, 0.4);
        break;
      case 'justEvade':
        this.tone('sine', 300, 1200, 0.25, 0.2);
        this.noise(0.4, 'bandpass', 800, 3, 0.2, 0.1);
        break;
      case 'step':
        this.noise(0.12, 'lowpass', 500, 1, 0.25, 0.01);
        break;
      case 'hurt':
        this.noise(0.2, 'lowpass', 500, 1.5, 0.6);
        this.tone('sawtooth', 160, 70, 0.25, 0.2);
        break;
      case 'graft':
        this.tone('sawtooth', 120, 600, 0.45, 0.14);
        this.tone('square', 900, 300, 0.2, 0.08, 0.4);
        this.noise(0.2, 'bandpass', 1800, 4, 0.3, 0.01, 0.42);
        break;
      case 'explosion':
        this.noise(1.1, 'lowpass', 900, 0.8, 1.0, 0.005);
        this.tone('sine', 80, 25, 0.9, 0.8);
        break;
      case 'roar':
        this.tone('sawtooth', 110, 55, 1.1, 0.3);
        this.tone('sawtooth', 117, 60, 1.1, 0.2);
        this.noise(1.0, 'bandpass', 400, 1, 0.5, 0.15);
        break;
      case 'fire':
        this.noise(0.25, 'bandpass', 900 * r, 0.6, 0.25, 0.03);
        break;
      case 'saw':
        this.tone('sawtooth', 180 * r, 220, 0.12, 0.12);
        this.noise(0.1, 'bandpass', 3000, 3, 0.15);
        break;
      case 'ui':
        this.tone('triangle', 660, 880, 0.08, 0.1);
        break;
      case 'pickup':
        this.tone('triangle', 520, 1040, 0.18, 0.12);
        this.tone('triangle', 780, 1560, 0.2, 0.08, 0.08);
        break;
      case 'gate':
        this.noise(1.2, 'lowpass', 400, 2, 0.5, 0.2);
        this.tone('sawtooth', 70, 50, 1.2, 0.2);
        break;
      case 'heal':
        this.tone('sine', 400, 800, 0.5, 0.12);
        this.tone('sine', 600, 1200, 0.5, 0.08, 0.1);
        break;
      case 'death':
        this.tone('sawtooth', 200, 40, 2.0, 0.3);
        this.noise(2.0, 'lowpass', 300, 1, 0.4, 0.3);
        break;
    }
  }
}

export const audio = new AudioEngine();
