/* A tiny generative soundscape. No audio files, no autoplay. */

import { clamp } from './utils.js';

export class Soundscape {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.started = false;
    this.ambient = null;
    this.noiseBuffer = null;
    this.nextChirp = 0;
    this.nextBell = 0;
    this.nextCricket = 0;
    this.lastPaint = 0;
  }

  makeNoiseBuffer() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.985 + white * 0.015;
      data[i] = last * 3.2;
    }
    return buffer;
  }

  start() {
    if (this.started) {
      this.ctx?.resume?.();
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    this.ctx = ctx;
    this.started = true;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -22;
    comp.knee.value = 18;
    comp.ratio.value = 5;
    comp.attack.value = 0.02;
    comp.release.value = 0.4;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.noiseBuffer = this.makeNoiseBuffer();
    this.startAmbience();
    const now = ctx.currentTime;
    this.nextChirp = now + 2;
    this.nextBell = now + 5;
    this.nextCricket = now + 1;
  }

  startAmbience() {
    const ctx = this.ctx;
    const bus = ctx.createGain();
    bus.gain.value = 0.34;
    bus.connect(this.master);
    this.ambient = bus;

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = 0.09;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    noise.start();

    const padGain = ctx.createGain();
    padGain.gain.value = 0.035;
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 520;
    padFilter.Q.value = 1.4;
    padGain.connect(padFilter);
    padFilter.connect(bus);

    const notes = [55, 82.41, 110, 146.83];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = i % 2 ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.5 : 0.18;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.035 + i * 0.017;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.15;
      lfo.connect(lfoGain);
      lfoGain.connect(g.gain);
      osc.connect(g);
      g.connect(padGain);
      osc.start();
      lfo.start();
    });
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.06);
    }
  }

  resume() {
    this.ctx?.resume?.();
  }

  update(dt) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    if (now > this.nextChirp) {
      this.cricket();
      this.nextChirp = now + 3 + Math.random() * 5;
    }
    if (now > this.nextBell) {
      this.bell(220 * [1, 1.5, 1.333, 1.125][Math.floor(Math.random() * 4)], 0.03);
      this.nextBell = now + 7 + Math.random() * 11;
    }
    if (now > this.nextCricket) {
      this.owl();
      this.nextCricket = now + 14 + Math.random() * 22;
    }
  }

  tone(freq, dur = 0.2, type = 'sine', gain = 0.06, slide = 0, delay = 0) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  noise(dur = 0.2, gain = 0.04, freq = 900, q = 1, type = 'bandpass', delay = 0) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, freq * 0.45), t + dur);
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  cricket() {
    const base = 2600 + Math.random() * 900;
    for (let i = 0; i < 3; i++) this.tone(base, 0.045, 'sine', 0.018, -180, i * 0.075);
  }

  owl() {
    this.tone(320, 0.5, 'sine', 0.018, -60);
    this.tone(300, 0.42, 'sine', 0.015, -50, 0.62);
  }

  bell(freq = 330, gain = 0.025) {
    this.tone(freq, 2.2, 'sine', gain);
    this.tone(freq * 2.01, 1.4, 'sine', gain * 0.32);
  }

  paint() {
    const now = performance.now();
    if (now - this.lastPaint < 55) return;
    this.lastPaint = now;
    this.noise(0.08, 0.018, 1200 + Math.random() * 500, 0.8);
  }

  select() {
    this.tone(520, 0.1, 'triangle', 0.035, 60);
  }

  sample() {
    this.tone(700, 0.12, 'sine', 0.035, 180);
    this.tone(1060, 0.2, 'sine', 0.02, 120, 0.05);
  }

  copyShape() {
    this.tone(330, 0.16, 'triangle', 0.04, 120);
    this.tone(660, 0.22, 'sine', 0.03, 180, 0.07);
    this.noise(0.2, 0.03, 600, 1.2);
  }

  morph() {
    this.noise(0.18, 0.03, 500, 1.4);
    this.tone(210, 0.24, 'sine', 0.025, 90);
  }

  dash() {
    this.noise(0.26, 0.05, 1500, 0.7);
    this.tone(240, 0.16, 'triangle', 0.02, -80);
  }

  climb() {
    this.noise(0.18, 0.025, 700, 1);
    this.tone(280, 0.12, 'triangle', 0.025, 80);
  }

  scan() {
    this.tone(880, 0.7, 'sine', 0.045, -520);
    this.tone(1320, 0.5, 'triangle', 0.018, -680, 0.03);
    this.noise(0.5, 0.02, 1600, 0.8);
  }

  ping() {
    this.tone(1480, 0.3, 'sine', 0.04, -420);
    this.tone(990, 0.5, 'sine', 0.02, -280, 0.04);
  }

  tag() {
    this.noise(0.22, 0.06, 800, 0.7);
    this.tone(180, 0.24, 'triangle', 0.05, -80);
    this.tone(440, 0.18, 'sine', 0.02, 120, 0.05);
  }

  caught() {
    this.noise(0.5, 0.08, 600, 0.6, 'lowpass');
    this.tone(150, 0.5, 'sawtooth', 0.03, -90);
    this.tone(90, 0.7, 'sine', 0.04, -30, 0.06);
  }

  spotted() {
    this.tone(520, 0.14, 'square', 0.035, -180);
    this.tone(520, 0.14, 'square', 0.03, -180, 0.17);
  }

  countdown(n) {
    this.tone(n === 0 ? 880 : 440, n === 0 ? 0.4 : 0.12, 'triangle', 0.05, n === 0 ? 120 : 0);
  }

  win() {
    [392, 494, 587, 784].forEach((f, i) => this.tone(f, 0.55, 'sine', 0.05, 0, i * 0.1));
    this.tone(196, 1.6, 'sine', 0.025);
  }

  lose() {
    [392, 349, 294, 220].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.04, 0, i * 0.15));
  }
}
