import { clamp } from './utils.js';

const FOCUS_CIRC = 333;

export class UI {
  constructor(callbacks = {}) {
    this.cb = callbacks;
    this.el = {
      hud: document.getElementById('hud'),
      title: document.getElementById('screen-title'),
      pause: document.getElementById('screen-pause'),
      result: document.getElementById('screen-result'),
      boot: document.getElementById('boot'),
      start: document.getElementById('btn-start'),
      pauseBtn: document.getElementById('btn-pause'),
      resumeBtn: document.getElementById('btn-resume'),
      quitBtn: document.getElementById('btn-quit'),
      againBtn: document.getElementById('btn-again'),
      titleBtn: document.getElementById('btn-title'),
      soundBtn: document.getElementById('btn-sound'),
      focusBtn: document.getElementById('focus-btn'),
      focusRing: document.getElementById('focus-ring'),
      caught: document.getElementById('caught-count'),
      total: document.getElementById('total-count'),
      score: document.getElementById('score'),
      timer: document.getElementById('timer'),
      timerFill: document.getElementById('timer-fill'),
      pips: document.getElementById('pips'),
      detect: document.getElementById('detect'),
      detectBars: [...document.querySelectorAll('#detect-bars i')],
      detectLabel: document.getElementById('detect-label'),
      combo: document.getElementById('combo-badge'),
      comboValue: document.getElementById('combo-value'),
      reticle: document.getElementById('reticle'),
      hitMarker: document.getElementById('hit-marker'),
      toast: document.getElementById('toast'),
      floaters: document.getElementById('floaters'),
      joystick: document.getElementById('joystick'),
      mobileHint: document.getElementById('mobile-hint'),
      dusk: document.getElementById('dusk-overlay'),
      resultSeal: document.getElementById('result-seal'),
      resultEyebrow: document.getElementById('result-eyebrow'),
      resultTitle: document.getElementById('result-title'),
      resultDesc: document.getElementById('result-desc'),
      resultScore: document.getElementById('result-score'),
      resultCaught: document.getElementById('result-caught'),
      resultTime: document.getElementById('result-time'),
      resultCombo: document.getElementById('result-combo'),
    };
    this.cache = {};
    this.toastTimer = null;
    this.mobile = window.matchMedia('(pointer: coarse)').matches || innerWidth < 860;
    document.body.classList.toggle('is-mobile', this.mobile);
    this.bind();
  }

  bind() {
    this.el.start.addEventListener('click', () => this.cb.start?.());
    this.el.pauseBtn.addEventListener('click', () => this.cb.pause?.());
    this.el.resumeBtn.addEventListener('click', () => this.cb.resume?.());
    this.el.quitBtn.addEventListener('click', () => this.cb.quit?.());
    this.el.againBtn.addEventListener('click', () => this.cb.restart?.());
    this.el.titleBtn.addEventListener('click', () => this.cb.quit?.());
    this.el.soundBtn.addEventListener('click', () => this.cb.toggleMute?.());
    this.el.focusBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { this.el.focusBtn.setPointerCapture(e.pointerId); } catch { /* synthetic or stale pointer */ }
      this.cb.focusStart?.();
    });
    const end = (e) => {
      e.preventDefault();
      this.cb.focusEnd?.();
    };
    this.el.focusBtn.addEventListener('pointerup', end);
    this.el.focusBtn.addEventListener('pointercancel', end);
    this.el.focusBtn.addEventListener('lostpointercapture', () => this.cb.focusEnd?.());
    window.addEventListener('resize', () => {
      const mobile = window.matchMedia('(pointer: coarse)').matches || innerWidth < 860;
      if (mobile !== this.mobile) {
        this.mobile = mobile;
        document.body.classList.toggle('is-mobile', mobile);
        this.el.joystick.classList.toggle('hidden', !(mobile && document.body.classList.contains('is-playing')));
      }
    });
  }

  bootDone() {
    this.el.boot.classList.add('done');
  }

  showTitle() {
    this.el.title.classList.remove('hidden');
    this.el.pause.classList.add('hidden');
    this.el.result.classList.add('hidden');
    this.el.hud.classList.add('hidden');
    this.el.reticle.classList.add('hidden');
    this.el.joystick.classList.add('hidden');
    this.el.combo.classList.add('hidden');
    this.el.hitMarker.classList.remove('pop');
    this.el.toast.classList.remove('show');
    document.body.classList.remove('is-playing', 'focus-on');
    this.setDusk(0);
  }

  startGame(total, duration) {
    this.totalDuration = duration;
    this.el.title.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.el.result.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
    this.el.joystick.classList.toggle('hidden', !this.mobile);
    this.el.total.textContent = String(total);
    this.el.caught.textContent = '0';
    this.el.pips.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const pip = document.createElement('i');
      this.el.pips.appendChild(pip);
    }
    this.cache = {};
    document.body.classList.add('is-playing');
    document.body.classList.remove('focus-on');
    if (this.el.mobileHint) this.el.mobileHint.style.opacity = '';
    this.el.reticle.classList.remove('hidden');
  }

  pauseGame() {
    this.el.pause.classList.remove('hidden');
    document.body.classList.remove('is-playing');
  }
  resumeGame() {
    this.el.pause.classList.add('hidden');
    document.body.classList.add('is-playing');
    this.el.reticle.classList.remove('hidden');
  }
  quitToTitle() {
    this.showTitle();
  }

  hideMobileHint() {
    if (this.el.mobileHint) this.el.mobileHint.style.opacity = '0';
  }

  updateHud(data) {
    const { timeLeft, totalTime, caught, total, score, focusEnergy, focusActive, detect, combo } = data;
    const secs = Math.max(0, Math.ceil(timeLeft));
    const timeText = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    if (this.cache.time !== timeText) {
      this.cache.time = timeText;
      this.el.timer.textContent = timeText;
      this.el.timer.classList.toggle('urgent', secs <= 20);
    }
    const pct = clamp(timeLeft / totalTime, 0, 1) * 100;
    if (Math.abs((this.cache.pct ?? -1) - pct) > 0.15) {
      this.cache.pct = pct;
      this.el.timerFill.style.width = `${pct}%`;
    }
    if (this.cache.caught !== caught) {
      this.cache.caught = caught;
      this.el.caught.textContent = String(caught);
      [...this.el.pips.children].forEach((el, i) => el.classList.toggle('on', i < caught));
    }
    if (this.cache.score !== score) {
      this.cache.score = score;
      this.el.score.textContent = score.toLocaleString('en-US');
    }
    const focusPct = clamp(focusEnergy, 0, 1);
    if (Math.abs((this.cache.focus ?? -1) - focusPct) > 0.01) {
      this.cache.focus = focusPct;
      this.el.focusRing.style.strokeDashoffset = String(FOCUS_CIRC * (1 - focusPct));
      this.el.focusRing.style.stroke = focusPct < 0.18 ? '#c47a54' : '';
    }
    if (this.cache.focusActive !== focusActive) {
      this.cache.focusActive = focusActive;
      document.body.classList.toggle('focus-on', focusActive);
    }
    const level = clamp(detect, 0, 1);
    const bars = Math.round(level * 6);
    if (this.cache.detectBars !== bars) {
      this.cache.detectBars = bars;
      this.el.detectBars.forEach((el, i) => el.classList.toggle('on', i < bars));
      this.el.detect.classList.toggle('hot', level > 0.55);
      const labels = ['조용함', '희미함', '가까움', '가까움', '아주 가까움', '아주 가까움', '바로 옆'];
      const label = labels[Math.min(6, Math.floor(level * 6 + 0.001))];
      this.el.detectLabel.textContent = label;
    }
    const showCombo = combo >= 2;
    if (this.cache.comboShow !== showCombo) {
      this.cache.comboShow = showCombo;
      this.el.combo.classList.toggle('hidden', !showCombo);
    }
    if (combo >= 2 && this.cache.comboValue !== combo) {
      this.cache.comboValue = combo;
      this.el.comboValue.textContent = String(combo);
      this.el.combo.classList.remove('show');
      void this.el.combo.offsetWidth;
      this.el.combo.classList.add('show');
    }
  }

  setDusk(progress) {
    const op = progress > 0.55 ? clamp((progress - 0.55) / 0.45, 0, 1) * 0.55 : 0;
    this.el.dusk.style.opacity = String(op);
  }

  toast(text, type = '', ms = 2300) {
    const el = this.el.toast;
    el.textContent = text;
    el.className = '';
    if (type) el.classList.add(type);
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  floatText(x, y, text, cls = '') {
    const div = document.createElement('div');
    div.className = `floater ${cls}`;
    div.textContent = text;
    div.style.left = `${x}px`;
    div.style.top = `${y}px`;
    this.el.floaters.appendChild(div);
    setTimeout(() => div.remove(), 1300);
    if (this.el.floaters.children.length > 16) {
      this.el.floaters.firstElementChild?.remove();
    }
  }

  flashHit(x, y, gold = true) {
    const m = this.el.hitMarker;
    m.style.left = `${x}px`;
    m.style.top = `${y}px`;
    m.classList.remove('pop');
    m.style.filter = gold ? '' : 'hue-rotate(-30deg) saturate(.6)';
    void m.offsetWidth;
    m.classList.add('pop');
    this.el.reticle.classList.remove('hit');
    void this.el.reticle.offsetWidth;
    this.el.reticle.classList.add('hit');
    setTimeout(() => this.el.reticle.classList.remove('hit'), 340);
  }

  kickReticle() {
    this.el.reticle.classList.remove('shoot');
    void this.el.reticle.offsetWidth;
    this.el.reticle.classList.add('shoot');
    setTimeout(() => this.el.reticle.classList.remove('shoot'), 300);
  }

  reticle(x, y, visible = true) {
    const el = this.el.reticle;
    if (x != null) el.style.left = `${x}px`;
    if (y != null) el.style.top = `${y}px`;
    el.classList.toggle('hidden', !visible);
  }

  setMuted(muted) {
    this.el.soundBtn.classList.toggle('muted', muted);
    this.el.soundBtn.setAttribute('aria-label', muted ? '소리 켜기' : '소리 끄기');
  }

  showResult({ win, rank, score, caught, total, timeLeft, bestCombo }) {
    const r = this.el;
    r.result.classList.remove('hidden');
    r.resultSeal.className = `result-seal rank-${rank}`;
    r.resultSeal.textContent = rank;
    r.resultEyebrow.textContent = win ? '사냥 완료 · DEWLEAF RECORD' : '사냥 종료 · DUSK';
    r.resultTitle.textContent = win ? '모두 잡았다!' : '해가 저물었습니다';
    r.resultDesc.textContent = win
      ? '이슬잎 마을에 다시 조용한 평화가 찾아왔습니다. 리라의 활시위가 가볍게 풀립니다.'
      : '슬라임들이 밤의 색으로 몸을 감췄습니다. 내일 다시 숨바꼭질을 시작해 보세요.';
    r.resultScore.textContent = score.toLocaleString('en-US');
    r.resultCaught.textContent = `${caught} / ${total}`;
    const s = Math.max(0, Math.ceil(timeLeft));
    r.resultTime.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    r.resultCombo.textContent = `×${Math.max(1, bestCombo)}`;
    r.againBtn.textContent = win ? '다시 사냥하기' : '다시 도전하기';
    this.el.hud.classList.add('hidden');
    this.el.joystick.classList.add('hidden');
    this.el.reticle.classList.add('hidden');
    document.body.classList.remove('is-playing', 'focus-on');
  }

  hideResult() {
    this.el.result.classList.add('hidden');
  }
}
