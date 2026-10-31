/* The field notebook: DOM screens, HUD, brush controls and touch input. */

import { COLORS, SHAPES, groundTarget } from './world.js';
import { drawTargetSwatch } from './paint.js';
import { clamp, formatScore } from './utils.js';

const $ = (id) => document.getElementById(id);

function timeString(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const SHAPE_LABELS = { mushroom: 'Cap', crystal: 'Shard' };

const SHAPE_ICONS = {
  blob: 'M12 20c-6 0-9-4-9-9 0-4 3-8 7-8 3 0 4 2 7 2 4 0 6 3 6 7 0 5-5 8-11 8Z',
  pool: 'M4 15c2-4 7-6 12-5 4 1 6 3 5 5-1 3-6 4-11 3-4 0-7-1-6-3Z',
  mound: 'M12 4c5 0 8 5 9 10 1 5-3 8-9 8s-10-3-9-8c1-5 4-10 9-10Z',
  fern: 'M10 21c-5-2-7-7-4-11 1-2 4-3 6-2 1-4 7-5 9-1 2 3 1 6-1 8 4 1 4 5 1 7-3 2-8 1-11-1Z',
  rock: 'M5 17 3 9l5-6 8 1 5 6-3 8-7 2-6-3Z',
  mushroom: 'M4 12c0-5 4-9 8-9s8 4 8 9H4Zm5 1h6l1 8H8l1-8Z',
  crystal: 'M12 2 19 9l-3 12H8L5 9l7-7Z',
  wall: 'M4 8c2-3 5-4 8-3 3-1 6 0 8 3 1 3-1 6-4 7-3 1-7 1-10-1-3-1-3-4-2-6Z',
};

export class UI {
  constructor(game, sound) {
    this.game = game;
    this.sound = sound;
    this.guideOpen = false;
    this.drawing = false;
    this.joyActive = false;
    this.joyId = null;
    this.paintTick = 0;
    this.lastTargetKey = '';
    this.paintDirty = true;
    this.toastUntil = 0;
    this.lastHint = '';
    this.lastTeamSig = '';
    this.cache();
    this.buildPalette();
    this.buildShapes();
    this.bind();
    game.onScreen = () => this.applyScreen();
    game.onMessage = (text) => this.showToast(text);
    this.applyScreen();
    this.update(0);
  }

  cache() {
    this.title = $('title-screen');
    this.guide = $('guide');
    this.hud = $('hud');
    this.pauseScreen = $('pause-screen');
    this.resultsScreen = $('results-screen');
    this.lower = $('lower-controls');
    this.hiderPanel = $('hider-panel');
    this.seekerPanel = $('seeker-panel');
    this.tray = $('disguise-tray');
    this.clock = $('clock');
    this.clockWrap = document.querySelector('.clock-wrap');
    this.clockLabel = $('clock-label');
    this.roleLabel = $('role-label');
    this.objective = $('objective');
    this.teamDot = $('team-dot');
    this.teamDots = $('team-dots');
    this.camoValue = $('camo-value');
    this.camoFill = $('camo-fill');
    this.targetName = $('target-name');
    this.shapeName = $('shape-name');
    this.shapeBar = $('shape-bar');
    this.palette = $('palette');
    this.paintCanvas = $('paint-canvas');
    this.paintCtx = this.paintCanvas.getContext('2d');
    this.groundSwatch = $('ground-swatch');
    this.groundCtx = this.groundSwatch.getContext('2d');
    this.sampleBtn = $('sample-btn');
    this.actionBtn = $('action-btn');
    this.actionLabel = $('action-label');
    this.climbBtn = $('climb-btn');
    this.modeBtn = $('mode-btn');
    this.modeLabel = $('mode-label');
    this.modeIcon = $('mode-icon');
    this.hint = $('hint');
    this.toast = $('toast');
    this.countdown = $('countdown');
    this.scanBtn = $('scan-btn');
    this.tagBtn = $('tag-btn');
    this.tagCount = $('tag-count');
    this.tagPips = $('tag-pips');
    this.scanCooldown = $('scan-cooldown');
    this.paintStatus = $('paint-status');
    this.joystick = $('joystick');
    this.joystickKnob = $('joystick-knob');
    this.pauseBtn = $('pause-btn');
    this.muteBtn = $('mute-btn');
    this.resultsKicker = $('results-kicker');
    this.resultsTitle = $('results-title');
    this.resultsText = $('results-text');
    this.resultsScore = $('results-score');
    this.resultsDetail = $('results-detail');
    this.resultsDetailLabel = $('results-detail-label');
    this.resultsBest = $('results-best');
    this.resultsRecord = $('results-record');
    this.bestLine = $('best-line');
  }

  buildPalette() {
    this.palette.innerHTML = '';
    for (const color of COLORS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.style.background = color.hex;
      button.title = color.name;
      button.dataset.color = color.hex;
      button.setAttribute('aria-label', `${color.name} paint`);
      button.addEventListener('click', () => {
        this.game.selectColor(color.hex);
        this.paintDirty = true;
        this.updatePalette();
      });
      this.palette.appendChild(button);
    }
  }

  buildShapes() {
    this.shapeBar.innerHTML = '';
    for (const shape of SHAPES.filter((s) => !s.hidden)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'shape-chip';
      button.dataset.shape = shape.id;
      button.title = `${shape.name} — ${shape.hint}`;
      button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${SHAPE_ICONS[shape.id] ?? SHAPE_ICONS.blob}"/></svg><span>${SHAPE_LABELS[shape.id] ?? shape.name}</span>`;
      button.addEventListener('click', () => this.game.selectShape(shape.id));
      this.shapeBar.appendChild(button);
    }
  }

  bind() {
    // Title / role choice.
    document.querySelectorAll('.role-card').forEach((card) => {
      card.addEventListener('click', () => {
        this.game.setRole(card.dataset.role);
        this.updateRoleCards();
        this.sound.resume();
      });
    });
    $('play-btn').addEventListener('click', () => {
      this.sound.start();
      this.sound.resume();
      this.game.startMatch(this.game.role);
    });
    $('guide-btn').addEventListener('click', () => this.openGuide());
    $('guide-close').addEventListener('click', () => this.closeGuide());

    // HUD.
    this.pauseBtn.addEventListener('click', () => this.game.togglePause());
    this.muteBtn.addEventListener('click', () => this.game.toggleMute());
    $('resume-btn').addEventListener('click', () => this.game.resume());
    $('pause-restart-btn').addEventListener('click', () => this.game.restart());
    $('quit-btn').addEventListener('click', () => this.game.quitToTitle());
    $('again-btn').addEventListener('click', () => this.game.restart());
    $('switch-btn').addEventListener('click', () => {
      const other = this.game.role === 'hider' ? 'seeker' : 'hider';
      this.game.setRole(other);
      this.game.startMatch(other);
    });
    $('results-quit-btn').addEventListener('click', () => this.game.quitToTitle());

    // Hider actions.
    this.modeBtn.addEventListener('click', () => this.game.toggleMode());
    this.actionBtn.addEventListener('click', () => this.game.primaryAction());
    this.climbBtn.addEventListener('click', () => this.game.specialAction());
    this.sampleBtn.addEventListener('click', () => this.game.sampleGround());
    this.scanBtn.addEventListener('click', () => this.game.scanLantern());
    this.tagBtn.addEventListener('click', () => this.game.tryTag());

    // Painting the little slime portrait.
    const paint = (e) => {
      const rect = this.paintCanvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 96;
      const y = ((e.clientY - rect.top) / rect.height) * 96;
      this.game.paintAt(clamp(x, 0, 96), clamp(y, 0, 96), e.pointerType === 'touch' ? 12 : 9);
      this.paintDirty = true;
    };
    this.paintCanvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.drawing = true;
      this.paintCanvas.setPointerCapture?.(e.pointerId);
      paint(e);
    });
    this.paintCanvas.addEventListener('pointermove', (e) => {
      if (!this.drawing) return;
      e.preventDefault();
      paint(e);
    });
    const endPaint = () => {
      this.drawing = false;
    };
    this.paintCanvas.addEventListener('pointerup', endPaint);
    this.paintCanvas.addEventListener('pointercancel', endPaint);
    this.paintCanvas.addEventListener('lostpointercapture', endPaint);

    // Joystick.
    const moveJoy = (e) => {
      if (!this.joyActive || e.pointerId !== this.joyId) return;
      e.preventDefault();
      const rect = this.joystick.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const max = rect.width * 0.33;
      const d = Math.hypot(dx, dy);
      if (d > max) {
        dx = (dx / d) * max;
        dy = (dy / d) * max;
      }
      this.joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.game.setInput(dx / max, dy / max, true);
    };
    const releaseJoy = (e) => {
      if (this.joyId !== null && e.pointerId !== this.joyId) return;
      this.joyActive = false;
      this.joyId = null;
      this.joystickKnob.style.transform = 'translate(0, 0)';
      this.game.setInput(0, 0, false);
    };
    this.joystick.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.joyActive = true;
      this.joyId = e.pointerId;
      this.joystick.setPointerCapture?.(e.pointerId);
      moveJoy(e);
    });
    this.joystick.addEventListener('pointermove', moveJoy);
    this.joystick.addEventListener('pointerup', releaseJoy);
    this.joystick.addEventListener('pointercancel', releaseJoy);
    this.joystick.addEventListener('lostpointercapture', releaseJoy);

    window.addEventListener('pointerdown', () => this.sound.resume(), { passive: true });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.guideOpen) {
        e.preventDefault();
        this.closeGuide();
      }
      if (e.key === 'Enter' && this.game.screen === 'title') {
        $('play-btn').click();
      }
    });
  }

  openGuide() {
    this.guideOpen = true;
    this.guide.classList.remove('is-hidden');
    this.sound.resume();
  }

  closeGuide() {
    this.guideOpen = false;
    this.guide.classList.add('is-hidden');
  }

  updateRoleCards() {
    document.querySelectorAll('.role-card').forEach((card) => {
      const selected = card.dataset.role === this.game.role;
      card.classList.toggle('selected', selected);
      card.setAttribute('aria-pressed', String(selected));
    });
    document.body.dataset.role = this.game.role;
    this.bestLine.textContent = `BEST · ${formatScore(this.game.best[this.game.role])}`;
  }

  applyScreen() {
    const g = this.game;
    document.body.dataset.role = g.role;
    this.updateRoleCards();
    const playing = g.screen === 'playing';
    const paused = g.screen === 'paused';
    const results = g.screen === 'results';
    const title = g.screen === 'title';

    this.title.classList.toggle('is-hidden', !title && !this.guideOpen);
    this.hud.classList.toggle('is-hidden', !(playing || paused));
    this.lower.classList.toggle('is-hidden', !playing);
    this.hiderPanel.classList.toggle('is-hidden', !(playing && g.role === 'hider'));
    this.seekerPanel.classList.toggle('is-hidden', !(playing && g.role === 'seeker'));
    this.pauseScreen.classList.toggle('is-hidden', !paused);
    this.resultsScreen.classList.toggle('is-hidden', !results);
    this.countdown.classList.toggle('is-hidden', !(playing && g.phase === 'countdown'));
    this.tray.classList.toggle('folded', g.mode !== 'disguise');
    this.modeBtn.classList.toggle('disguise', g.mode === 'disguise');
    this.modeLabel.textContent = g.mode === 'disguise' ? 'Move' : 'Disguise';
    this.modeIcon.textContent = g.mode === 'disguise' ? '◑' : '◐';
    this.modeBtn.setAttribute('aria-pressed', String(g.mode === 'disguise'));
    this.muteBtn.classList.toggle('muted', g.muted);
    this.muteBtn.setAttribute('aria-label', g.muted ? 'Unmute sound' : 'Mute sound');
    this.paintDirty = true;

    if (g.role === 'hider') {
      this.roleLabel.textContent = 'SLIME TEAM';
      this.objective.textContent = 'Stay hidden until moonhigh. Paint, pose, and keep still.';
      this.clockLabel.textContent = 'MOONHIGH IN';
    } else {
      this.roleLabel.textContent = 'WARDEN';
      this.objective.textContent = 'Sweep the lantern. Pulse for heartbeats. Tag all five slimes.';
      this.clockLabel.textContent = 'TIME REMAINING';
    }

    if (results) {
      this.resultsScreen.classList.toggle('loss', g.outcome !== 'win');
      this.resultsKicker.textContent = g.outcome === 'win' ? 'MOONHIGH · SURVIVED' : 'CAUGHT IN THE BEAM';
      this.resultsTitle.textContent = g.outcomeTitle;
      this.resultsText.textContent = g.outcomeText;
      this.resultsScore.textContent = formatScore(g.score);
      this.resultsDetailLabel.textContent = g.role === 'hider' ? 'TEAMMATES LOST' : 'SLIMES TAGGED';
      this.resultsDetail.textContent = g.role === 'hider' ? String(g.teamCaught) : String(g.tags);
      this.resultsBest.textContent = formatScore(g.best[g.role]);
      this.resultsRecord.classList.toggle('is-hidden', !g.outcomeBest);
    }
    this.updateCountdown();
    this.updateTeamDots();
    this.lastTeamSig = '';
    this.update(0);
  }

  showToast(text) {
    if (!text) return;
    this.toast.textContent = text;
    this.toast.classList.add('show');
    this.toastUntil = performance.now() + 2900;
  }

  update(dt) {
    const g = this.game;
    if (g.screen !== 'playing') {
      if (this.toastUntil && performance.now() > this.toastUntil) {
        this.toast.classList.remove('show');
        this.toastUntil = 0;
      }
      return;
    }
    const hud = g.hud;
    this.clock.textContent = timeString(hud.timeLeft);
    this.clockWrap.classList.toggle('urgent', hud.timeLeft < 16);
    this.updateCountdown();
    this.updateTeamDots();

    if (g.role === 'hider') {
      const pct = Math.round(hud.camo * 100);
      const color = hud.camo > 0.86 ? '#bdf28a' : hud.camo > 0.62 ? '#ecc47d' : '#ea9a79';
      this.camoValue.innerHTML = `${pct}<small>%</small>`;
      this.camoValue.style.color = color;
      this.camoFill.style.transform = `scaleX(${Math.max(0.01, hud.camo)})`;
      this.targetName.textContent = hud.target?.name ?? 'Open glade';
      this.shapeName.textContent = hud.shapeName;
      this.updateShapes(hud);
      this.updatePalette();
      this.actionLabel.textContent = hud.nearShape ? `Copy ${hud.nearShape}` : 'Copy shape';
      this.climbBtn.querySelector('span:nth-child(2)').textContent = hud.climb ? 'Drop' : 'Climb';
      this.sampleBtn.disabled = !!hud.climb;
      this.sampleBtn.style.opacity = hud.climb ? '0.45' : '';
      this.updatePaint(hud, dt);
      if (this.lastHint !== hud.hint) {
        this.lastHint = hud.hint;
        this.hint.textContent = hud.hint;
      }
    } else {
      this.tagCount.textContent = `${hud.tags} / ${hud.total}`;
      this.updateTagPips(hud);
      const cd = Math.max(0, hud.scanCd);
      this.scanCooldown.style.transform = `scaleX(${clamp(cd / 5.2, 0, 1)})`;
      this.scanBtn.style.opacity = cd > 0 ? '0.6' : '';
      this.hint.textContent = hud.hint;
    }

    if (this.toastUntil && performance.now() > this.toastUntil) {
      this.toast.classList.remove('show');
      this.toastUntil = 0;
    }
  }

  updateCountdown() {
    const g = this.game;
    if (g.phase !== 'countdown' || g.screen !== 'playing') {
      this.countdown.classList.add('is-hidden');
      return;
    }
    const n = Math.ceil(g.countdown);
    this.countdown.classList.remove('is-hidden');
    this.countdown.innerHTML = `${Math.max(0, n)}<small>${n > 0 ? 'FIND YOUR PLACE' : 'GO'}</small>`;
  }

  updateShapes(hud) {
    const unlocked = new Set(hud.unlocked);
    this.shapeBar.querySelectorAll('.shape-chip').forEach((chip) => {
      const id = chip.dataset.shape;
      chip.classList.toggle('active', id === hud.shape);
      chip.classList.toggle('locked', !unlocked.has(id));
      chip.setAttribute('aria-pressed', String(id === hud.shape));
    });
  }

  updatePalette() {
    this.palette.querySelectorAll('button').forEach((button) => {
      button.classList.toggle('active', button.dataset.color === this.game.paintColor);
    });
  }

  updatePaint(hud, dt) {
    this.paintTick += dt;
    if (this.paintTick > 0.1 || this.paintDirty) {
      this.paintTick = 0;
      this.paintDirty = false;
      const h = this.game.playerHider;
      if (h) {
        this.paintCtx.clearRect(0, 0, 96, 96);
        this.paintCtx.fillStyle = '#13251b';
        this.paintCtx.fillRect(0, 0, 96, 96);
        this.paintCtx.drawImage(h.paint.canvas, 0, 0, 96, 96);
      }
      const target = hud.target ?? groundTarget(this.game.playerHider?.x ?? 1000, this.game.playerHider?.y ?? 690);
      const key = `${target.name}-${target.color}-${target.std}`;
      if (key !== this.lastTargetKey) {
        this.lastTargetKey = key;
        drawTargetSwatch(this.groundSwatch, target, 9);
        this.paintStatus.textContent = target.name;
      }
    }
  }

  updateTeamDots() {
    const g = this.game;
    const sig = g.hiders.map((h) => (h.caught ? 'x' : 'o')).join('');
    if (sig === this.lastTeamSig) return;
    this.lastTeamSig = sig;
    this.teamDots.innerHTML = g.hiders.map((h) => `<i class="${h.caught ? 'caught' : ''}"></i>`).join('');
  }

  updateTagPips(hud) {
    this.tagPips.innerHTML = '';
    for (let i = 0; i < hud.total; i++) {
      const pip = document.createElement('i');
      if (i < hud.tags) pip.classList.add('on');
      this.tagPips.appendChild(pip);
    }
  }
}
