import { rand } from './utils.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.started = false;
    this.birdTimer = 3;
    this.tensionTimer = 0;
    this.tension = 0;
    this.stepSide = 0;
    this.ambientGain = null;
    this.unlocked = false;
  }

  unlock() {
    if (this.unlocked) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.65;
    this.master.connect(this.ctx.destination);
    this.noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.unlocked = true;
    this.startAmbient();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  startAmbient() {
    if (this.started || !this.ctx) return;
    this.started = true;
    const ctx = this.ctx;
    const amb = ctx.createGain();
    amb.gain.value = 0.5;
    amb.connect(this.master);
    this.ambientGain = amb;

    // wind
    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuffer;
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 520;
    windFilter.Q.value = 0.6;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.06;
    wind.connect(windFilter).connect(windGain).connect(amb);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.035;
    lfo.connect(lfoGain).connect(windGain.gain);
    wind.start();
    lfo.start();

    // warm forest pad
    const padGain = ctx.createGain();
    padGain.gain.value = 0.0;
    padGain.gain.linearRampToValueAtTime(0.03, ctx.currentTime + 4);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    padGain.connect(filter).connect(amb);
    [146.83, 220.0, 293.66, 369.99].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'triangle' : 'sine';
      o.frequency.value = f;
      o.detune.value = rand(-6, 6);
      const g = ctx.createGain();
      g.gain.value = 0.22 / (i + 1);
      o.connect(g).connect(padGain);
      o.start();
      const vib = ctx.createOscillator();
      vib.frequency.value = 0.05 + i * 0.017;
      const vibGain = ctx.createGain();
      vibGain.gain.value = 2.5;
      vib.connect(vibGain).connect(o.detune);
      vib.start();
    });
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(muted ? 0 : 0.65, this.ctx.currentTime + 0.15);
    }
  }

  tone({ freq = 440, freqEnd = null, type = 'sine', dur = 0.2, gain = 0.1, attack = 0.008, pan = 0, filter = null, filterEnd = null }) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter;
      f.frequency.setValueAtTime(1200, t);
      if (filterEnd) f.frequency.exponentialRampToValueAtTime(Math.max(60, filterEnd), t + dur);
      node.connect(f);
      node = f;
    }
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(p);
      node = p;
    }
    node.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise({ dur = 0.2, gain = 0.08, type = 'bandpass', freq = 1000, freqEnd = null, q = 1, pan = 0 }) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = src;
    node.connect(f);
    node = f;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(p);
      node = p;
    }
    node.connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  ui() { this.tone({ freq: 620, freqEnd: 880, type: 'sine', dur: 0.09, gain: 0.06 }); }
  draw() { this.noise({ dur: 0.16, gain: 0.035, type: 'bandpass', freq: 700, freqEnd: 1500, q: 1.5 }); }
  release() {
    this.tone({ freq: 210, freqEnd: 95, type: 'sawtooth', dur: 0.16, gain: 0.06, filter: 'lowpass', filterEnd: 400 });
    this.noise({ dur: 0.12, gain: 0.06, type: 'highpass', freq: 1800, q: 0.7 });
  }
  whoosh() { this.noise({ dur: 0.28, gain: 0.035, type: 'bandpass', freq: 1600, freqEnd: 280, q: 1.4 }); }
  hit() {
    this.tone({ freq: 330, freqEnd: 85, type: 'sine', dur: 0.22, gain: 0.14 });
    this.tone({ freq: 620, freqEnd: 220, type: 'triangle', dur: 0.12, gain: 0.06 });
    this.noise({ dur: 0.2, gain: 0.09, type: 'lowpass', freq: 1400, freqEnd: 300, q: 0.8 });
  }
  groundHit() {
    this.noise({ dur: 0.13, gain: 0.05, type: 'lowpass', freq: 500, freqEnd: 120, q: 0.8 });
    this.tone({ freq: 150, freqEnd: 80, type: 'sine', dur: 0.1, gain: 0.04 });
  }
  flee() {
    this.tone({ freq: 280, freqEnd: 720, type: 'sine', dur: 0.18, gain: 0.045 });
    this.tone({ freq: 420, freqEnd: 900, type: 'triangle', dur: 0.12, gain: 0.025 });
  }
  step() {
    this.stepSide = 1 - this.stepSide;
    this.noise({ dur: 0.07, gain: 0.022, type: 'lowpass', freq: 260 + this.stepSide * 40, q: 0.8, pan: this.stepSide ? 0.12 : -0.12 });
  }
  tick(urgent = false) {
    this.tone({ freq: urgent ? 880 : 660, type: 'sine', dur: 0.07, gain: urgent ? 0.06 : 0.028 });
  }
  focusOn() {
    this.tone({ freq: 300, freqEnd: 620, type: 'sine', dur: 0.22, gain: 0.05 });
    this.tone({ freq: 600, freqEnd: 1240, type: 'sine', dur: 0.3, gain: 0.02 });
  }
  focusOff() {
    this.tone({ freq: 600, freqEnd: 250, type: 'sine', dur: 0.18, gain: 0.03 });
  }
  victory() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      setTimeout(() => this.tone({ freq: f, type: 'triangle', dur: 0.5, gain: 0.07 }), i * 120);
      setTimeout(() => this.tone({ freq: f * 2, type: 'sine', dur: 0.4, gain: 0.02 }), i * 120 + 30);
    });
  }
  defeat() {
    [392, 349.23, 293.66, 220].forEach((f, i) => {
      setTimeout(() => this.tone({ freq: f, type: 'triangle', dur: 0.7, gain: 0.06 }), i * 220);
    });
  }
  bird() {
    if (!this.ctx || this.muted) return;
    const base = 1800 + Math.random() * 1000;
    const pan = rand(-0.8, 0.8);
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        this.tone({ freq: base + rand(-150, 200), freqEnd: base + rand(200, 600), type: 'sine', dur: 0.07 + Math.random() * 0.05, gain: 0.018, pan });
      }, i * (90 + Math.random() * 50));
    }
  }
  heartbeat() {
    this.tone({ freq: 58, freqEnd: 44, type: 'sine', dur: 0.18, gain: 0.07 });
    setTimeout(() => this.tone({ freq: 52, freqEnd: 40, type: 'sine', dur: 0.16, gain: 0.045 }), 140);
  }

  update(dt, tension = 0) {
    this.tension = tension;
    if (!this.ctx) return;
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = 4 + Math.random() * 7;
      this.bird();
    }
    if (tension > 0.15) {
      this.tensionTimer -= dt;
      if (this.tensionTimer <= 0) {
        this.tensionTimer = 1.6 - tension * 0.9;
        this.heartbeat();
      }
    } else {
      this.tensionTimer = Math.min(this.tensionTimer, 0.5);
    }
  }
}
