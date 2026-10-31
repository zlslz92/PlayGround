/* Match logic: one grove, two teams, a paintbrush and a lantern. */

import {
  TAU,
  angleDelta,
  angleTo,
  clamp,
  colorScore,
  dist,
  formatScore,
  lerp,
  lerpAngle,
  mixHex,
  smoothstep,
} from './utils.js';
import {
  COLORS,
  OBSTACLES,
  PATROL,
  PROPS,
  SHAPES,
  WORLD,
  ZONES,
  clampToWorld,
  climbableNear,
  collideObstacles,
  groundTarget,
  lineOfSight,
  nearestProp,
  nearestPropOfShape,
  scannableNear,
  zoneAt,
} from './world.js';
import {
  createPaintLayer,
  fillPaint,
  makeAIPaint,
  matchScores,
  paintStamp,
  paintStats,
  drawTargetSwatch,
} from './paint.js';

const MATCH_TIME = 100;
const COUNTDOWN = 0.55;
const AI_NAMES = ['Moss', 'Pip', 'Taro', 'Bramble', 'Fenn'];
const BEST_KEYS = { hider: 'slimeSeek.best.hider', seeker: 'slimeSeek.best.seeker' };
const SHAPE_BY_ID = Object.fromEntries(SHAPES.map((s) => [s.id, s]));

function loadBest(role) {
  try {
    return Number(localStorage.getItem(BEST_KEYS[role]) || 0);
  } catch {
    return 0;
  }
}

function saveBest(role, score) {
  try {
    if (score > loadBest(role)) localStorage.setItem(BEST_KEYS[role], String(score));
  } catch {
    /* private mode, no problem */
  }
}

function randomPointInZone(zone, scale = 0.54) {
  const a = Math.random() * TAU;
  const d = Math.sqrt(Math.random()) * zone.r * scale;
  return { x: zone.x + Math.cos(a) * d, y: zone.y + Math.sin(a) * d };
}

function clampAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function makeSeeker({ isPlayer = false, x = 1000, y = 650, angle = -Math.PI / 2 } = {}) {
  return {
    isPlayer,
    x,
    y,
    angle,
    aimAngle: angle,
    speed: isPlayer ? 208 : 94,
    coneRange: isPlayer ? 525 : 455,
    coneHalf: isPlayer ? 0.57 : 0.54,
    state: 'patrol',
    waypoint: 0,
    wait: 0,
    chase: null,
    chaseLost: 0,
    lastSeen: null,
    recover: 0,
    scanCooldown: 0,
    alert: 0,
    bob: Math.random() * TAU,
    radius: 26,
    dashCd: 0,
    step: 0,
    grace: isPlayer ? 0 : 3.4,
  };
}

function makeHider({ isPlayer = false, name = 'Moss', x = 1000, y = 700, shape = 'blob', zone = null } = {}) {
  const target = zone ? groundTarget(zone.x, zone.y) : groundTarget(x, y);
  const paint = isPlayer
    ? createPaintLayer(target.color, Math.floor(Math.random() * 9999))
    : makeAIPaint(target.color, mixHex(target.color, '#ffffff', 0.22), 0.4 + Math.random() * 0.4, Math.floor(Math.random() * 9999));
  return {
    isPlayer,
    name,
    team: 'slime',
    x,
    y,
    vx: 0,
    vy: 0,
    shape,
    mode: 'move',
    paint,
    paintStats: paintStats(paint),
    phase: Math.random() * TAU,
    blink: 0,
    blinkTimer: 2 + Math.random() * 4,
    lookX: 0,
    lookY: 0,
    camo: 0,
    stillTime: 0,
    suspicion: 0,
    seen: 0,
    caught: false,
    caughtAt: 0,
    reveal: 0,
    morphScale: 1,
    morphTarget: 1,
    dashCd: 0,
    dashTime: 0,
    step: 0,
    climb: null,
    prevShape: null,
    unlocked: new Set(SHAPES.filter((s) => s.start).map((s) => s.id)),
    goal: null,
    hiding: false,
    think: 1 + Math.random() * 2,
    nervous: false,
    score: 0,
    zone: zone ?? zoneAt(x, y),
    touchTimer: 0,
    sampleCd: 0,
    caughtBy: null,
  };
}

export class Game {
  constructor(canvas, sound) {
    this.canvas = canvas;
    this.sound = sound;
    this.renderer = null;
    this.screen = 'title';
    this.role = 'hider';
    this.phase = 'idle';
    this.matchTime = MATCH_TIME;
    this.countdown = COUNTDOWN;
    this.lastCountdownBeat = 5;
    this.paused = false;
    this.muted = false;
    this.time = 0;
    this.hiders = [];
    this.seeker = makeSeeker();
    this.playerHider = null;
    this.particles = [];
    this.pings = [];
    this.scanWave = null;
    this.climbHint = null;
    this.nearScan = null;
    this.mode = 'move';
    this.paintColor = COLORS[0].hex;
    this.score = 0;
    this.tags = 0;
    this.teamCaught = 0;
    this.outcome = null;
    this.outcomeTitle = '';
    this.outcomeText = '';
    this.best = { hider: loadBest('hider'), seeker: loadBest('seeker') };
    this.input = { x: 0, y: 0, active: false };
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, active: false };
    this.pointerWorld = { x: 1000, y: 650 };
    this.onScreen = () => {};
    this.onMessage = () => {};
    this.toastTimer = 0;
    this.scanCd = 0;
    this.tagCd = 0;
    this.globalScanCd = 0;
    this.autoPaintTimer = 0;
    this.hint = '';
    this.camShake = 0;
    this.countdownTone = -1;
    this.bindInput();
    this.buildTitleScene();
  }

  setRenderer(renderer) {
    this.renderer = renderer;
    renderer.shake = 0;
  }

  bindInput() {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      const key = e.key.toLowerCase();
      if (e.repeat) {
        this.keys.add(key);
        return;
      }
      this.keys.add(key);
      if (key === 'escape' || key === 'p') {
        if (this.screen === 'playing') this.togglePause();
        else if (this.screen === 'paused') this.togglePause();
        return;
      }
      if (this.screen !== 'playing' || this.paused) return;
      if (key === 'q') this.toggleMode();
      if (key === 'e') this.primaryAction();
      if (key === 'f') this.secondaryAction();
      if (key === ' ' || key === 'spacebar') this.specialAction();
      if (key >= '1' && key <= '8') this.selectColor(COLORS[Number(key) - 1].hex);
      if (key === 'tab') {
        e.preventDefault();
        this.toggleMode();
      }
      if (key === 'm') this.toggleMute();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.input.active = false;
    });
    this.canvas.addEventListener('pointermove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (!this.renderer) return;
      const w = this.renderer.w;
      const h = this.renderer.h;
      this.pointerWorld.x = (x - w / 2) / this.renderer.cam.zoom + this.renderer.cam.x;
      this.pointerWorld.y = (y - h / 2) / this.renderer.cam.zoom + this.renderer.cam.y;
      this.mouse.x = x;
      this.mouse.y = y;
      if (e.pointerType === 'mouse') this.mouse.active = true;
    });
    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.screen !== 'playing' || this.paused) return;
      if (this.role === 'seeker' && e.pointerType === 'mouse') {
        this.tryTag();
      }
    });
  }

  updatePointerAim() {
    if (!this.renderer) return;
    const s = this.seeker;
    s.aimAngle = angleTo(s.x, s.y, this.pointerWorld.x, this.pointerWorld.y);
    s.angle = lerpAngle(s.angle, s.aimAngle, 0.2);
  }

  /* ------------------------------------------------------------------ */
  /* Screens and setup                                                   */
  /* ------------------------------------------------------------------ */

  setRole(role) {
    if (!['hider', 'seeker'].includes(role)) return;
    this.role = role;
    this.onScreen?.();
  }

  buildTitleScene() {
    this.hiders = [];
    ZONES.slice(0, 4).forEach((zone, i) => {
      const p = randomPointInZone(zone, 0.55);
      const h = makeHider({ name: AI_NAMES[i], x: p.x, y: p.y, shape: zone.shape, zone });
      h.mode = 'disguise';
      h.camo = 0.8;
      h.stillTime = 4;
      h.hiding = true;
      h.paint = makeAIPaint(zone.color, zone.accent, 0.6, i + 4);
      h.paintStats = paintStats(h.paint);
      this.hiders.push(h);
    });
    this.seeker = makeSeeker({ x: 1000, y: 690, angle: -1.2 });
    this.playerHider = null;
    this.screen = 'title';
    this.phase = 'idle';
    this.onScreen?.();
  }

  startMatch(role = this.role) {
    this.role = role;
    this.screen = 'playing';
    this.paused = false;
    this.phase = 'countdown';
    this.countdown = COUNTDOWN;
    this.lastCountdownBeat = 5;
    this.matchTime = MATCH_TIME;
    this.time = 0;
    this.score = 0;
    this.tags = 0;
    this.teamCaught = 0;
    this.outcome = null;
    this.outcomeTitle = '';
    this.outcomeText = '';
    this.particles = [];
    this.pings = [];
    this.scanWave = null;
    this.scanCd = 0;
    this.tagCd = 0;
    this.globalScanCd = 0;
    this.camShake = 0;
    this.mode = 'move';
    this.paintColor = COLORS[0].hex;
    this.hint = '';
    this.hiders = [];
    this.climbHint = null;
    this.nearScan = null;
    PROPS.forEach((p) => (p.scanned = false));

    if (role === 'hider') {
      this.playerHider = makeHider({
        isPlayer: true,
        name: 'You',
        x: 1000,
        y: 690,
        shape: 'blob',
      });
      this.playerHider.paint = createPaintLayer('#203b2b', 7);
      this.playerHider.paintStats = paintStats(this.playerHider.paint);
      this.hiders.push(this.playerHider);
      const zones = [ZONES[1], ZONES[2], ZONES[3], ZONES[4], ZONES[5]];
      zones.forEach((zone, i) => {
        const p = randomPointInZone(zone, 0.5);
        const h = makeHider({ name: AI_NAMES[i + 1] ?? AI_NAMES[i], x: p.x, y: p.y, shape: 'blob', zone });
        h.think = 1.2 + i * 0.7;
        this.hiders.push(h);
      });
      this.seeker = makeSeeker({ x: 1390, y: 905, angle: 2.2 });
      this.seeker.waypoint = 4;
    } else {
      this.playerHider = null;
      const zones = [ZONES[0], ZONES[1], ZONES[2], ZONES[3], ZONES[5]];
      zones.forEach((zone, i) => {
        const p = randomPointInZone(zone, 0.52);
        const h = makeHider({ name: AI_NAMES[i], x: p.x, y: p.y, shape: zone.shape, zone });
        h.sortie = 4 + i * 2.4;
        h.think = 2 + i * 0.6;
        h.hiding = true;
        h.stillTime = 2;
        h.camo = 0.55;
        this.hiders.push(h);
      });
      this.seeker = makeSeeker({ isPlayer: true, x: 1000, y: 690, angle: -Math.PI / 2 });
    }
    this.renderer?.snapCamera(
      role === 'hider' ? 1000 : 1000,
      role === 'hider' ? 690 : 690,
      (this.renderer?.baseZoom ?? 1) * 1.04,
    );
    this.onScreen?.();
  }

  restart() {
    this.startMatch(this.role);
  }

  quitToTitle() {
    this.paused = false;
    this.buildTitleScene();
  }

  togglePause() {
    if (this.screen === 'playing') {
      this.paused = true;
      this.screen = 'paused';
      this.keys.clear();
      this.input.active = false;
      this.sound?.select();
    } else if (this.screen === 'paused') {
      this.paused = false;
      this.screen = 'playing';
      this.sound?.select();
    }
    this.onScreen?.();
  }

  resume() {
    if (this.screen === 'paused') {
      this.paused = false;
      this.screen = 'playing';
      this.keys.clear();
      this.onScreen?.();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    this.sound?.setMuted(this.muted);
    this.onScreen?.();
  }

  finish(outcome) {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    this.outcome = outcome;
    if (outcome === 'win') {
      this.sound?.win();
      this.outcomeTitle = this.role === 'hider' ? 'The grove kept you' : 'Every slime found';
      this.outcomeText =
        this.role === 'hider'
          ? 'The moon passed overhead and the warden never saw a thing.'
          : 'You followed every glint and emptied the grove before moonhigh.';
      this.score += Math.round(this.matchTime * (this.role === 'hider' ? 12 : 24));
      this.score += this.role === 'seeker' ? this.tags * 650 : 0;
    } else {
      this.sound?.lose();
      this.outcomeTitle = this.role === 'hider' ? 'The lantern found you' : 'The grove kept its secrets';
      this.outcomeText =
        this.role === 'hider'
          ? 'Warm light, a long shadow, and a very rude finger pointed your way.'
          : 'Moonhigh arrived with slimes still giggling somewhere in the moss.';
    }
    const key = this.role;
    const isBest = this.score > this.best[key];
    if (isBest) {
      this.best[key] = this.score;
      saveBest(key, this.score);
    }
    this.outcomeBest = isBest;
    this.camShake = outcome === 'win' ? 0.5 : 1;
    if (this.renderer) this.renderer.shake = this.camShake;
    this.screen = 'results';
    this.onScreen?.();
  }

  /* ------------------------------------------------------------------ */
  /* Main loop                                                           */
  /* ------------------------------------------------------------------ */

  update(dt) {
    this.time += dt;
    if (this.screen === 'playing' && !this.paused) {
      this.updatePlaying(dt);
    }
    this.updateParticles(dt);
    this.updatePings(dt);
    this.toastTimer = Math.max(0, this.toastTimer - dt);
  }

  updatePlaying(dt) {
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      const beat = Math.ceil(this.countdown);
      if (beat !== this.lastCountdownBeat && beat >= 0) {
        this.lastCountdownBeat = beat;
        this.sound?.countdown(beat);
      }
      if (this.countdown <= 0) {
        this.phase = 'active';
        this.countdown = 0;
        this.sound?.countdown(0);
        this.spawnText(this.role === 'hider' ? this.playerHider.x : this.seeker.x, (this.role === 'hider' ? this.playerHider.y : this.seeker.y) - 70, 'MOON HIGH', '#dff4b9', 19);
        this.addParticle({
          type: 'ring',
          x: this.role === 'hider' ? this.playerHider.x : this.seeker.x,
          y: this.role === 'hider' ? this.playerHider.y - 28 : this.seeker.y - 40,
          color: '#dff4b9',
          size: 100,
          start: 10,
          life: 1.1,
          maxLife: 1.1,
          width: 2.4,
        });
      }
    } else if (this.phase === 'active') {
      this.matchTime = Math.max(0, this.matchTime - dt);
      if (this.role === 'hider' && this.playerHider && !this.playerHider.caught) {
        this.score += dt * (3 + this.playerHider.camo * 18);
      }
      if (this.matchTime <= 0) {
        this.finish(this.role === 'hider' ? 'win' : 'lose');
        return;
      }
    }

    if (this.phase === 'countdown') {
      this.updateHints();
      return;
    }

    this.scanCd = Math.max(0, this.scanCd - dt);
    this.tagCd = Math.max(0, this.tagCd - dt);
    this.globalScanCd = Math.max(0, this.globalScanCd - dt);
    this.updateInputVector();

    if (this.role === 'hider') {
      this.updatePlayerHider(dt);
      for (const h of this.hiders) {
        if (!h.isPlayer) this.updateAIHider(h, dt);
      }
      this.updateSeekerAI(dt);
    } else {
      this.updatePlayerSeeker(dt);
      for (const h of this.hiders) this.updateAIHider(h, dt, true);
      this.updateTagState(dt);
    }

    for (const h of this.hiders) {
      h.blinkTimer -= dt;
      if (h.blinkTimer <= 0) {
        h.blink = Math.min(1, (h.blink ?? 0) + dt * 8);
        if (h.blink >= 1) {
          h.blink = 0;
          h.blinkTimer = 2 + Math.random() * 4.5;
        }
      }
      h.reveal = Math.max(0, h.reveal - dt);
      h.morphScale = lerp(h.morphScale ?? 1, 1, 1 - Math.exp(-dt * 8));
      h.morphTarget = 1;
    }
    this.updateHints();
  }

  updateInputVector() {
    let x = 0;
    let y = 0;
    const k = this.keys;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    if (k.has('w') || k.has('arrowup')) y -= 1;
    if (k.has('s') || k.has('arrowdown')) y += 1;
    if (this.input.active) {
      x += this.input.x;
      y += this.input.y;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.inputVector = { x, y, len: Math.min(1, len) };
  }

  updateHints() {
    const p = this.playerHider;
    if (this.role === 'hider' && p && !p.caught) {
      this.nearScan = p.climb ? null : scannableNear(p.x, p.y, 112);
      this.climbHint = p.climb ? null : climbableNear(p.x, p.y, 74);
      if (p.climb) this.hint = 'Press Space to let go · you blend into the stone';
      else if (this.nearScan) this.hint = `E · copy the ${this.nearScan.name}'s ${this.nearScan.shape} shape`;
      else if (this.climbHint) this.hint = 'Space · cling to the stone';
      else if (this.mode === 'disguise') this.hint = p.camo > 0.8 ? 'Perfectly still. Perfectly ordinary.' : 'Hold still — paint the ground, match a shape.';
      else this.hint = 'Q · disguise mode · touch a landmark to take its shape';
    } else if (this.role === 'seeker') {
      this.hint = this.scanCd <= 0 ? 'E · lantern pulse reveals nearby slimes · Space · tag' : 'The lantern is recharging…';
    }
  }

  /* ------------------------------------------------------------------ */
  /* Player hider                                                        */
  /* ------------------------------------------------------------------ */

  updatePlayerHider(dt) {
    const h = this.playerHider;
    if (!h || h.caught) return;
    const input = this.inputVector;
    h.dashCd = Math.max(0, h.dashCd - dt);
    h.dashTime = Math.max(0, h.dashTime - dt);
    h.sampleCd = Math.max(0, h.sampleCd - dt);
    h.touchTimer = Math.max(0, h.touchTimer - dt);

    if (h.climb) {
      this.updateClimb(h, dt);
      this.evaluateCamo(h, dt);
      h.lookX = lerp(h.lookX, 0, 1 - Math.exp(-dt * 6));
      h.lookY = lerp(h.lookY, 0, 1 - Math.exp(-dt * 6));
      return;
    }

    if (this.mode === 'disguise' && input.len > 0.25) {
      this.setMode('move', true);
    }
    if (this.mode === 'move') {
      const shape = SHAPE_BY_ID[h.shape] ?? SHAPE_BY_ID.blob;
      let speed = 168 * (shape.speed || 1);
      if (this.keys.has('shift') && h.dashCd <= 0 && input.len > 0.2) {
        h.dashCd = 2.6;
        h.dashTime = 0.22;
        this.sound?.dash();
        this.burst(h.x, h.y, '#8fd7a8', 8, 1.4);
      }
      if (h.dashTime > 0) speed *= 2.25;
      const nx = h.x + input.x * speed * dt;
      const ny = h.y + input.y * speed * dt;
      const moved = collideObstacles(nx, ny, 19);
      const world = clampToWorld(moved.x, moved.y, 22);
      h.vx = (world.x - h.x) / Math.max(dt, 0.001);
      h.vy = (world.y - h.y) / Math.max(dt, 0.001);
      h.x = world.x;
      h.y = world.y;
      const sp = Math.hypot(h.vx, h.vy);
      h.speed = sp;
      h.step += sp * dt * 0.025;
      h.mode = 'move';
      h.stillTime = 0;
      h.camo = Math.max(0, h.camo - dt * 0.75);
      if (sp > 8) {
        h.lookX = lerp(h.lookX, input.x, 1 - Math.exp(-dt * 9));
        h.lookY = lerp(h.lookY, input.y, 1 - Math.exp(-dt * 9));
        if (h.dashTime > 0 && Math.random() < dt * 25) this.burst(h.x, h.y + 2, '#cbeab6', 1, 0.6);
      }
      // Walking through a landmark copies its shape, like a curious slime.
      if (h.touchTimer <= 0) {
        const prop = nearestProp(h.x, h.y, 58);
        if (prop && prop.shape !== h.shape) {
          this.copyProp(prop, true);
          h.touchTimer = 0.8;
        }
      }
    } else {
      h.vx = 0;
      h.vy = 0;
      h.stillTime += dt;
      h.mode = 'disguise';
      h.lookX = lerp(h.lookX, 0, 1 - Math.exp(-dt * 4));
      h.lookY = lerp(h.lookY, 0, 1 - Math.exp(-dt * 4));
    }

    // Face whichever direction the lantern is, very subtly.
    const seekerAngle = angleTo(h.x, h.y, this.seeker.x, this.seeker.y);
    if (this.mode === 'disguise') {
      h.lookX = lerp(h.lookX, Math.cos(seekerAngle) * 0.3, 1 - Math.exp(-dt * 1.4));
      h.lookY = lerp(h.lookY, Math.sin(seekerAngle) * 0.3, 1 - Math.exp(-dt * 1.4));
    }
    this.evaluateCamo(h, dt);
    if (this.mode === 'disguise' && h.camo > 0.82 && Math.random() < dt * 0.9) {
      this.addParticle({
        type: 'glow',
        x: h.x + (Math.random() - 0.5) * 64,
        y: h.y - Math.random() * 54,
        color: '#dff4b9',
        size: 5 + Math.random() * 5,
        alpha: 0.2,
        life: 1.4 + Math.random(),
        maxLife: 2.4,
      });
    }
    // Auto-copy when disguised and a landmark is within touch range.
    if (this.mode === 'disguise' && h.touchTimer <= 0) {
      const prop = nearestProp(h.x, h.y, 66);
      if (prop && prop.shape !== h.shape) {
        this.copyProp(prop, true);
        h.touchTimer = 1.1;
      }
    }
  }

  updateClimb(h, dt) {
    const c = h.climb;
    const input = this.inputVector;
    c.height = clamp(c.height - input.y * dt * 0.55, 0.05, 1);
    h.speed = Math.abs(input.y) * 80;
    h.stillTime += dt;
    h.mode = 'disguise';
    h.lookX = lerp(h.lookX, 0, 1 - Math.exp(-dt * 5));
    h.lookY = lerp(h.lookY, 0, 1 - Math.exp(-dt * 5));
    if (c.height >= 0.98 && Math.random() < dt * 1.2) {
      this.burst(h.x, h.y - c.height * (c.obstacle.height ?? 60) * 0.52, '#aeb9a6', 1, 0.7);
    }
    h.camo = Math.max(h.camo, 0.35);
  }

  tryClimb() {
    const h = this.playerHider;
    if (!h || h.caught || this.screen !== 'playing') return;
    if (h.climb) {
      h.x += 8;
      h.y += 8;
      h.climb = null;
      if (h.prevShape) this.changeShape(h.prevShape, false);
      h.mode = 'move';
      h.prevShape = null;
      this.sound?.climb();
      this.toast('Dropped from the stone');
      return;
    }
    const o = climbableNear(h.x, h.y, 90);
    if (!o) {
      this.toast('Stand beside a stone to climb');
      return;
    }
    const a = angleTo(o.x, o.y, h.x, h.y);
    h.prevShape = h.shape;
    h.climb = { obstacle: o, angle: a, height: 0.08 };
    h.x = o.x + Math.cos(a) * (o.r + 7);
    h.y = o.y + Math.sin(a) * (o.r + 7);
    h.mode = 'disguise';
    this.mode = 'disguise';
    this.changeShape('wall', false);
    this.sound?.climb();
    this.burst(h.x, h.y, '#9aa08f', 8, 1);
    this.toast('Clinging to stone · move up or down');
    this.onScreen?.();
  }

  setMode(mode, auto = false) {
    if (this.role !== 'hider' || !this.playerHider || this.playerHider.caught) return;
    if (this.playerHider.climb) return;
    if (!auto && mode === 'disguise' && this.mode === 'disguise') {
      this.toast('Already disguised');
      return;
    }
    this.mode = mode;
    this.playerHider.mode = mode;
    if (mode === 'move') {
      this.playerHider.stillTime = 0;
    } else {
      this.sound?.morph();
      this.burst(this.playerHider.x, this.playerHider.y - 10, '#c9e8a7', 5, 0.8);
    }
    if (!auto) this.sound?.select();
    this.onScreen?.();
  }

  toggleMode() {
    if (this.role !== 'hider') return;
    this.setMode(this.mode === 'move' ? 'disguise' : 'move');
  }

  selectColor(hex) {
    if (!COLORS.some((c) => c.hex === hex)) return;
    this.paintColor = hex;
    this.sound?.select();
    if (this.role === 'hider') {
      const h = this.playerHider;
      if (h && !h.caught && this.mode === 'disguise') {
        // A palette tap also touches up the centre of the slime.
        paintStamp(h.paint, 48, 48, hex, 18, Math.random());
        this.refreshPaint(h);
        this.sound?.paint();
        this.burst(h.x, h.y - 24, hex, 3, 0.8);
      }
    }
    this.onScreen?.();
  }

  paintAt(nx, ny, radius = 9) {
    const h = this.playerHider;
    if (!h || h.caught || this.screen !== 'playing') return;
    paintStamp(h.paint, nx, ny, this.paintColor, radius, Math.random());
    this.refreshPaint(h);
    this.sound?.paint();
    if (Math.random() < 0.4) this.burst(h.x + (nx / 96 - 0.5) * 48, h.y - (ny / 96) * 52, this.paintColor, 1, 0.6);
  }

  fillGround() {
    const h = this.playerHider;
    if (!h || h.caught) return;
    const target = groundTarget(h.x, h.y, h.climb?.obstacle);
    fillPaint(h.paint, target.color, true);
    const accent = target.zone?.accent ?? mixHex(target.color, '#ffffff', 0.2);
    for (let i = 0; i < 24; i++) {
      paintStamp(
        h.paint,
        Math.random() * 96,
        Math.random() * 96,
        i % 3 === 0 ? accent : mixHex(target.color, '#ffffff', Math.random() * 0.2),
        4 + Math.random() * 8,
        Math.random(),
      );
    }
    this.refreshPaint(h);
    h.sampleCd = 2.4;
    this.sound?.sample();
    this.burst(h.x, h.y - 22, target.color, 10, 1.2);
    this.toast(`Sampled ${target.name}`);
    this.onScreen?.();
  }

  sampleGround() {
    const h = this.playerHider;
    if (!h || h.caught) return;
    if (h.sampleCd > 0) {
      this.toast('Let the brush rest a moment');
      return;
    }
    this.fillGround();
    if (this.mode === 'move') this.setMode('disguise', true);
  }

  copyProp(prop, silent = false) {
    const h = this.playerHider;
    if (!h || h.caught) return;
    if (!prop || !prop.shape) return;
    prop.scanned = true;
    h.unlocked.add(prop.shape);
    this.changeShape(prop.shape, false);
    h.suspicion = Math.max(0, h.suspicion - 0.2);
    this.sound?.copyShape();
    if (!silent) this.toast(`Copied the ${prop.type ?? prop.name}: ${prop.shape}`);
    const target = groundTarget(h.x, h.y);
    this.burst(h.x, h.y - 24, target.zone?.accent ?? '#dff4b9', 8, 1);
  }

  copyNearbyShape() {
    const h = this.playerHider;
    if (!h || h.caught) return;
    const near = scannableNear(h.x, h.y, 118);
    if (near) {
      this.copyProp(near.prop, false);
    } else {
      this.toast('Nothing close enough to imitate');
    }
  }

  changeShape(shape, announce = true) {
    const h = this.playerHider;
    if (!h) return;
    if (!SHAPE_BY_ID[shape]) return;
    if (!h.unlocked.has(shape) && shape !== 'wall') {
      this.toast('Touch that landmark first to learn its shape');
      return;
    }
    h.shape = shape;
    h.morphScale = 1.22;
    if (announce) {
      this.sound?.morph();
      this.burst(h.x, h.y - 22, '#c9e8a7', 6, 0.8);
    }
    this.onScreen?.();
  }

  selectShape(shape) {
    if (this.role !== 'hider') return;
    this.changeShape(shape);
  }

  evaluateCamo(h, dt) {
    const target = groundTarget(h.x, h.y, h.climb?.obstacle);
    const scores = matchScores(h.paintStats, target);
    const required = h.climb ? 'wall' : target.shape;
    let shapeScore = required ? (h.shape === required ? 1 : 0.05) : 0.45;
    if (required === 'wall' && h.shape === 'wall') shapeScore = 1;
    if (h.climb) shapeScore = 1;
    const still = clamp(h.stillTime / (h.climb ? 0.8 : 1.65), 0, 1);
    const moving = h.mode === 'move';
    let camo = scores.color * 0.48 + scores.texture * 0.12 + shapeScore * 0.3 + still * 0.1;
    if (moving) camo *= 0.62;
    if (h.dashTime > 0) camo *= 0.45;
    // Open glade has no matching shape, but dark paint still helps.
    if (!target.shape) camo = Math.max(camo, scores.color * 0.5 + scores.texture * 0.08 + still * 0.08);
    h.camo = clamp(lerp(h.camo, camo, 1 - Math.exp(-dt * 6)), 0, 0.99);
    h.stillTime = moving ? 0 : h.stillTime;
    h.camoTarget = target.name;
    h.shapeMatch = shapeScore;
    return h.camo;
  }

  refreshPaint(h) {
    h.paintStats = paintStats(h.paint);
    if (this.screen === 'playing') this.onScreen?.();
  }

  /* ------------------------------------------------------------------ */
  /* Slime neighbours                                                    */
  /* ------------------------------------------------------------------ */

  updateAIHider(h, dt) {
    if (h.caught) return;
    h.think -= dt;
    h.dashCd = Math.max(0, h.dashCd - dt);
    h.dashTime = Math.max(0, h.dashTime - dt);
    h.reveal = Math.max(0, h.reveal - dt);
    const searcher = this.seeker;
    const dSeeker = dist(h.x, h.y, searcher.x, searcher.y);
    const visible = dSeeker < 500 && lineOfSight(h.x, h.y, searcher.x, searcher.y);
    h.nervous = visible && dSeeker < 340;

    if (h.hiding) {
      h.mode = 'disguise';
      h.stillTime += dt;
      this.evaluateCamo(h, dt);
      // The warden is close and the paint isn't convincing: bolt.
      if ((dSeeker < 118 && h.camo < 0.68) || (visible && dSeeker < 92)) {
        this.fleeAI(h, searcher);
      } else if (h.think <= 0) {
        const confidence = h.camo;
        if (dSeeker > 340 && Math.random() < 0.34 - confidence * 0.2) {
          this.chooseHideSpot(h);
        } else {
          h.think = 2.5 + Math.random() * 5;
          h.stillTime += 0.8;
        }
      }
      return;
    }

    if (!h.goal) {
      this.chooseHideSpot(h);
      if (!h.goal) return;
    }
    const dGoal = dist(h.x, h.y, h.goal.x, h.goal.y);
    if (dGoal < 22) {
      this.settleAI(h);
      return;
    }
    const danger = visible && dSeeker < 200 && h.camo < 0.55;
    const speed = 118 + (h.dashTime > 0 ? 110 : 0) + (danger ? 45 : 0);
    const a = angleTo(h.x, h.y, h.goal.x, h.goal.y);
    const steer = this.steerAround(h.x, h.y, a, 30);
    const nx = h.x + Math.cos(steer) * speed * dt;
    const ny = h.y + Math.sin(steer) * speed * dt;
    const moved = collideObstacles(nx, ny, 17);
    const world = clampToWorld(moved.x, moved.y, 22);
    h.speed = dist(h.x, h.y, world.x, world.y) / Math.max(dt, 0.001);
    h.x = world.x;
    h.y = world.y;
    h.mode = 'move';
    h.stillTime = 0;
    h.camo = Math.max(0, h.camo - dt * 0.45);
    h.lookX = Math.cos(steer);
    h.lookY = Math.sin(steer);
    h.step += h.speed * dt * 0.025;
    if (h.speed < 12 && dGoal > 60) {
      h.stuck = (h.stuck ?? 0) + dt;
      if (h.stuck > 1.1) {
        h.stuck = 0;
        this.chooseHideSpot(h);
      }
    }
    this.evaluateCamo(h, dt);
    if (dSeeker < 90 && !h.hiding) {
      h.dashTime = 0.3;
      h.dashCd = 2;
    }
  }

  chooseHideSpot(h) {
    const used = this.hiders.filter((o) => o !== h && o.goal).map((o) => o.goal.zone?.id);
    const candidates = ZONES.filter((z) => !used.includes(z.id) && dist(z.x, z.y, this.seeker.x, this.seeker.y) > 240);
    const pool = candidates.length ? candidates : ZONES;
    let zone = pool[Math.floor(Math.random() * pool.length)];
    // Slimes prefer a zone that isn't directly under the lantern.
    for (let i = 0; i < 5; i++) {
      const z = pool[Math.floor(Math.random() * pool.length)];
      if (dist(z.x, z.y, this.seeker.x, this.seeker.y) > dist(zone.x, zone.y, this.seeker.x, this.seeker.y)) zone = z;
    }
    for (let tries = 0; tries < 24; tries++) {
      const p = randomPointInZone(zone, 0.66);
      if (OBSTACLES.some((o) => dist(p.x, p.y, o.x, o.y) < o.r + 30)) continue;
      h.goal = { ...p, zone };
      h.hiding = false;
      h.think = 5 + Math.random() * 6;
      return;
    }
    h.goal = { x: zone.x, y: zone.y, zone };
    h.hiding = false;
    h.think = 5 + Math.random() * 6;
  }

  fleeAI(h, from) {
    const away = angleTo(from.x, from.y, h.x, h.y) + (Math.random() - 0.5) * 1.3;
    const d = 210 + Math.random() * 260;
    const p = clampToWorld(h.x + Math.cos(away) * d, h.y + Math.sin(away) * d, 40);
    h.goal = { ...p, zone: zoneAt(p.x, p.y) };
    h.hiding = false;
    h.think = 3.5;
    h.stillTime = 0;
    h.dashTime = 0.32;
    h.dashCd = 2.8;
    this.burst(h.x, h.y - 8, '#93c88b', 5, 0.8);
  }

  settleAI(h) {
    const zone = h.goal?.zone ?? zoneAt(h.x, h.y) ?? ZONES[0];
    const target = groundTarget(h.x, h.y);
    h.hiding = true;
    h.mode = 'disguise';
    h.goal = null;
    h.think = 7 + Math.random() * 11;
    h.shape = zone.shape;
    h.morphScale = 1.2;
    h.stillTime = 1.2;
    h.paint = makeAIPaint(
      mixHex(target.color, zone.color, 0.18),
      mixHex(zone.accent, '#ffffff', 0.12),
      0.36 + Math.random() * 0.52,
      Math.floor(Math.random() * 9999),
    );
    h.paintStats = paintStats(h.paint);
    h.zone = zone;
    h.camo = this.evaluateCamo(h, 0.35);
    h.lookX = 0;
    h.lookY = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Seekers                                                             */
  /* ------------------------------------------------------------------ */

  canSeeHider(h, s = this.seeker) {
    if (h.caught) return 0;
    const d = dist(s.x, s.y, h.x, h.y);
    if (d > s.coneRange) return 0;
    if (!lineOfSight(s.x, s.y, h.x, h.y)) return 0;
    const a = angleTo(s.x, s.y, h.x, h.y);
    const diff = Math.abs(angleDelta(s.aimAngle, a));
    const closeGrace = d < 88 ? 0.75 : 0.04;
    if (diff > s.coneHalf + closeGrace) return 0;
    const moving = clamp((h.speed ?? 0) / 140, 0, 1);
    let score = (1 - h.camo * 0.93) * (0.52 + moving * 0.8) * (1 - 0.48 * (d / s.coneRange));
    score *= 1 - diff / (s.coneHalf + closeGrace + 0.4) * 0.24;
    if (d < 54) score = Math.max(score, 0.72);
    return clamp(score, 0, 1);
  }

  updateSeekerAI(dt) {
    const s = this.seeker;
    s.grace = Math.max(0, (s.grace ?? 0) - dt);
    s.scanCooldown = Math.max(0, s.scanCooldown - dt);
    let best = null;
    let bestScore = 0;
    for (const h of this.hiders) {
      if (h.isPlayer) continue;
      const score = s.grace > 0 ? 0 : this.canSeeHider(h, s);
      h.suspicion = clamp(h.suspicion + dt * (score > 0.2 ? score * 0.78 : -0.55), 0, 1.2);
      if (score > bestScore) {
        bestScore = score;
        best = h;
      }
    }
    const p = this.playerHider;
    if (p && !p.caught) {
      const score = s.grace > 0 ? 0 : this.canSeeHider(p, s);
      p.suspicion = clamp(p.suspicion + dt * (score > 0.2 ? score * 0.82 : -0.48), 0, 1.2);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (best && best.suspicion > 0.64 && bestScore > 0.18) {
      if (!s.chase) this.sound?.spotted();
      s.chase = best;
      s.state = 'chase';
      s.chaseLost = 0;
      s.lastSeen = { x: best.x, y: best.y };
      best.nervous = true;
    } else if (s.chase && !s.chase.caught && s.chaseLost < 2.8) {
      s.state = 'chase';
      s.chaseLost += dt;
      if (lineOfSight(s.x, s.y, s.chase.x, s.chase.y)) {
        s.lastSeen = { x: s.chase.x, y: s.chase.y };
      }
    } else if (s.state === 'chase') {
      s.state = 'search';
      s.recover = 2.2;
      s.chase = null;
    }

    if (s.state === 'search') {
      s.recover -= dt;
      if (s.recover <= 0) {
        s.state = 'patrol';
        s.lastSeen = null;
      }
    }

    if (s.state === 'chase' && s.chase) {
      const target = s.chase;
      const a = angleTo(s.x, s.y, target.x, target.y);
      s.aimAngle = lerpAngle(s.aimAngle, a, 1 - Math.exp(-dt * 5));
      s.angle = lerpAngle(s.angle, a, 1 - Math.exp(-dt * 7));
      this.moveSeeker(s, target.x, target.y, 154, dt);
      if (dist(s.x, s.y, target.x, target.y) < 42 && lineOfSight(s.x, s.y, target.x, target.y)) {
        this.catchHider(target, 'warden');
      }
      if (s.chaseLost > 3.4) {
        s.state = 'search';
        s.recover = 2.4;
        s.chase = null;
      }
    } else if (s.state === 'search' && s.lastSeen) {
      const a = angleTo(s.x, s.y, s.lastSeen.x, s.lastSeen.y);
      s.angle = lerpAngle(s.angle, a, 1 - Math.exp(-dt * 4));
      s.aimAngle = lerpAngle(s.aimAngle, a + Math.sin(this.time * 5) * 0.4, 1 - Math.exp(-dt * 3));
      this.moveSeeker(s, s.lastSeen.x, s.lastSeen.y, 116, dt);
      if (dist(s.x, s.y, s.lastSeen.x, s.lastSeen.y) < 30) s.recover = Math.min(s.recover, 0.8);
    } else {
      s.state = 'patrol';
      s.chase = null;
      const wp = PATROL[s.waypoint % PATROL.length];
      const d = dist(s.x, s.y, wp.x, wp.y);
      if (d < 26) {
        s.wait += dt;
        if (s.wait > 0.8) {
          s.waypoint = (s.waypoint + 1) % PATROL.length;
          s.wait = 0;
        }
      } else {
        s.wait = 0;
        const a = angleTo(s.x, s.y, wp.x, wp.y);
        s.angle = lerpAngle(s.angle, a, 1 - Math.exp(-dt * 3));
        s.aimAngle = lerpAngle(s.aimAngle, a + Math.sin(this.time * 0.7 + s.bob) * 0.58, 1 - Math.exp(-dt * 2.2));
        this.moveSeeker(s, wp.x, wp.y, 88, dt);
      }
      if (s.scanCooldown <= 0 && Math.random() < dt * 0.24) {
        s.scanCooldown = 10 + Math.random() * 6;
        s.aimAngle += Math.sin(this.time * 2) * 0.5;
        this.sound?.ping();
        this.addParticle({
          type: 'ring',
          x: s.x,
          y: s.y - 42,
          color: '#ffd9a0',
          size: 150,
          start: 8,
          life: 1,
          maxLife: 1,
          width: 1.2,
        });
      }
    }

    // Very close hiders are found even if they are not the current target.
    for (const h of this.hiders) {
      if (h.caught) continue;
      if (dist(s.x, s.y, h.x, h.y) < 24 && lineOfSight(s.x, s.y, h.x, h.y)) {
        this.catchHider(h, 'warden');
      }
    }
  }

  moveSeeker(s, tx, ty, speed, dt) {
    const a = this.steerAround(s.x, s.y, angleTo(s.x, s.y, tx, ty), s.radius);
    const nx = s.x + Math.cos(a) * speed * dt;
    const ny = s.y + Math.sin(a) * speed * dt;
    const moved = collideObstacles(nx, ny, s.radius);
    const world = clampToWorld(moved.x, moved.y, 30);
    s.x = world.x;
    s.y = world.y;
    s.step += speed * dt * 0.03;
  }

  steerAround(x, y, angle, radius) {
    // Look a short way ahead; if a boulder is there, slide around its rim.
    const ahead = 46 + radius;
    const ax = x + Math.cos(angle) * ahead;
    const ay = y + Math.sin(angle) * ahead;
    let steer = angle;
    for (const o of OBSTACLES) {
      const d = dist(ax, ay, o.x, o.y);
      if (d < o.r + radius) {
        const side = Math.sign(angleDelta(angleTo(x, y, o.x, o.y), angle)) || 1;
        steer += side * 0.82;
        break;
      }
    }
    return steer;
  }

  updatePlayerSeeker(dt) {
    const s = this.seeker;
    const input = this.inputVector;
    if (this.mouse.active) {
      this.updatePointerAim();
    } else if (input.len > 0.12) {
      s.aimAngle = angleTo(0, 0, input.x, input.y);
      s.angle = lerpAngle(s.angle, s.aimAngle, 1 - Math.exp(-dt * 12));
    }
    const speed = 205 * (this.keys.has('shift') ? 1.32 : 1);
    if (input.len > 0.03) {
      const nx = s.x + input.x * speed * dt;
      const ny = s.y + input.y * speed * dt;
      const moved = collideObstacles(nx, ny, s.radius);
      const world = clampToWorld(moved.x, moved.y, 30);
      s.x = world.x;
      s.y = world.y;
      s.step += speed * dt * 0.03;
      if (Math.random() < dt * 10) {
        this.addParticle({
          type: 'dot',
          x: s.x + (Math.random() - 0.5) * 14,
          y: s.y + 2,
          vx: (Math.random() - 0.5) * 8,
          vy: -5,
          color: 'rgba(143, 132, 104, 0.4)',
          size: 2 + Math.random() * 2,
          life: 0.55,
          maxLife: 0.55,
        });
      }
    }
    s.aimAngle = lerpAngle(s.aimAngle, s.angle, 1 - Math.exp(-dt * 16));
    // Anything in the lantern beam gains a faint suspect ring.
    for (const h of this.hiders) {
      if (h.caught) continue;
      const d = dist(s.x, s.y, h.x, h.y);
      if (d > 200) continue;
      const diff = Math.abs(angleDelta(s.aimAngle, angleTo(s.x, s.y, h.x, h.y)));
      if (diff < s.coneHalf + 0.1 && lineOfSight(s.x, s.y, h.x, h.y)) {
        h.reveal = Math.max(h.reveal, 0.32);
      }
    }
  }

  scanLantern() {
    if (this.role !== 'seeker' || this.screen !== 'playing') return;
    if (this.scanCd > 0) {
      this.toast(`Lantern recharging · ${Math.ceil(this.scanCd)}s`);
      return;
    }
    const s = this.seeker;
    this.scanCd = 5.2;
    this.sound?.scan();
    this.scanWave = { x: s.x, y: s.y, radius: 440, life: 0.9, maxLife: 0.9 };
    let found = 0;
    for (const h of this.hiders) {
      if (h.caught) continue;
      const d = dist(s.x, s.y, h.x, h.y);
      if (d < 400 && lineOfSight(s.x, s.y, h.x, h.y)) {
        h.reveal = 2.7;
        found++;
        this.pings.push({
          x: h.x,
          y: h.y - 26,
          label: h.shape === 'blob' ? 'slime?' : h.shape,
          life: 2.2,
          maxLife: 2.2,
          id: Math.random() * 10,
        });
      }
    }
    this.toast(found ? `${found} heartbeat${found > 1 ? 's' : ''} in the grove` : 'Only moss and old stone');
    this.onScreen?.();
  }

  tryTag() {
    if (this.role !== 'seeker' || this.screen !== 'playing') return;
    if (this.tagCd > 0) return;
    this.tagCd = 0.5;
    const s = this.seeker;
    let best = null;
    let bestD = 62;
    for (const h of this.hiders) {
      if (h.caught) continue;
      const d = dist(s.x, s.y, h.x, h.y);
      if (d < bestD && lineOfSight(s.x, s.y, h.x, h.y)) {
        bestD = d;
        best = h;
      }
    }
    if (!best) {
      this.sound?.noise?.(0.16, 0.025, 520, 1);
      this.burst(s.x + Math.cos(s.aimAngle) * 38, s.y - 20 + Math.sin(s.aimAngle) * 20, '#f1cf91', 3, 0.8);
      return;
    }
    this.catchHider(best, 'tagged');
  }

  catchHider(h, by) {
    if (!h || h.caught) return;
    h.caught = true;
    h.caughtAt = this.time;
    h.camo = 0;
    h.reveal = 0;
    h.caughtBy = by;
    this.camShake = 0.7;
    if (this.renderer) this.renderer.shake = 0.7;
    this.burst(h.x, h.y - 24, '#f1c47d', 22, 1.8);
    this.spawnText(h.x, h.y - 64, h.isPlayer ? 'FOUND!' : 'TAGGED', '#ffd79a', 17);
    if (h.isPlayer) {
      this.sound?.caught();
      this.score = Math.round(this.score);
      this.finish('lose');
      return;
    }
    this.teamCaught += 1;
    if (this.role === 'seeker') {
      this.tags += 1;
      this.score += 650;
      this.sound?.tag();
      this.toast(`${h.name} tagged · ${this.tags}/${this.hiders.length}`);
      if (this.tags >= this.hiders.length) {
        this.finish('win');
      }
    } else {
      this.sound?.tag();
      this.toast(`${h.name} was caught. Stay low.`);
    }
    this.onScreen?.();
  }

  updateTagState(dt) {
    // Keep the tag counter honest if a hider was somehow removed.
    this.tags = this.hiders.filter((h) => h.caught).length;
    if (this.tags >= this.hiders.length && this.hiders.length > 0) {
      this.finish('win');
    }
    if (this.scanWave) {
      this.scanWave.life -= dt;
      if (this.scanWave.life <= 0) this.scanWave = null;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Actions and small effects                                           */
  /* ------------------------------------------------------------------ */

  primaryAction() {
    if (this.role === 'seeker') this.scanLantern();
    else this.copyNearbyShape();
  }

  secondaryAction() {
    if (this.role === 'seeker') this.scanLantern();
    else this.sampleGround();
  }

  specialAction() {
    if (this.role === 'seeker') this.tryTag();
    else this.tryClimb();
  }

  setInput(x, y, active) {
    const len = Math.hypot(x, y);
    this.input.active = active && len > 0.08;
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.input.x = x;
    this.input.y = y;
  }

  addParticle(p) {
    this.particles.push({
      vx: 0,
      vy: 0,
      rot: 0,
      alpha: 0.7,
      ...p,
      maxLife: p.maxLife ?? p.life ?? 1,
      life: p.life ?? 1,
    });
    if (this.particles.length > 260) this.particles.splice(0, this.particles.length - 260);
  }

  burst(x, y, color, count = 8, scale = 1) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const speed = (20 + Math.random() * 80) * scale;
      this.addParticle({
        type: 'dot',
        x: x + Math.cos(a) * 8,
        y: y + Math.sin(a) * 7,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 14,
        color,
        size: (1.2 + Math.random() * 2.4) * scale,
        life: 0.4 + Math.random() * 0.55,
      });
    }
    this.addParticle({
      type: 'glow',
      x,
      y,
      color,
      size: 20 * scale,
      alpha: 0.24,
      life: 0.7,
      maxLife: 0.7,
    });
  }

  spawnText(x, y, text, color, size = 12) {
    this.addParticle({
      type: 'text',
      x,
      y,
      text,
      color,
      size,
      life: 1.8,
      maxLife: 1.8,
    });
  }

  toast(text) {
    this.toastTimer = 3.4;
    this.hintOverride = text;
    this.onMessage?.(text);
  }

  updateParticles(dt) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += (p.vx ?? 0) * dt;
      p.y += (p.vy ?? 0) * dt;
      if (p.type === 'dot') {
        p.vx *= Math.exp(-dt * 3);
        p.vy = (p.vy ?? 0) * Math.exp(-dt * 2.2) + 22 * dt;
      }
      p.rot += dt * 0.4;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.renderer) {
      this.renderer.shake = Math.max(0, this.camShake);
      this.camShake *= Math.exp(-dt * 3.8);
    }
  }

  updatePings(dt) {
    for (const p of this.pings) p.life -= dt;
    this.pings = this.pings.filter((p) => p.life > 0);
  }

  get playerSeeker() {
    return this.role === 'seeker' ? this.seeker : null;
  }

  get aliveHiders() {
    return this.hiders.filter((h) => !h.caught);
  }

  get hud() {
    const h = this.playerHider;
    return {
      role: this.role,
      mode: this.mode,
      camo: h?.camo ?? 0,
      shape: h?.shape ?? 'blob',
      shapeName: SHAPE_BY_ID[h?.shape]?.name ?? 'Blob',
      color: this.paintColor,
      timeLeft: this.matchTime,
      countdown: this.countdown,
      phase: this.phase,
      score: formatScore(this.score),
      tags: this.tags,
      total: this.hiders.length,
      teamCaught: this.teamCaught,
      alive: this.hiders.filter((x) => !x.caught).length,
      target: h ? groundTarget(h.x, h.y, h.climb?.obstacle) : null,
      scanCd: this.scanCd,
      climb: h?.climb ?? null,
      unlocked: h ? [...h.unlocked] : [],
      best: this.best[this.role],
      outcome: this.outcome,
      outcomeTitle: this.outcomeTitle,
      outcomeText: this.outcomeText,
      outcomeBest: this.outcomeBest,
      paused: this.paused,
      muted: this.muted,
      hint: this.toastTimer > 0 ? this.hintOverride : this.hint,
      dashCd: h?.dashCd ?? 0,
      canClimb: !!this.climbHint || !!h?.climb,
      nearShape: this.nearScan?.shape ?? null,
    };
  }
}
