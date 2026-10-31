import * as THREE from 'three';
import { createWorld } from './world.js';
import { createElf } from './elf.js';
import { SlimeField } from './slimes.js';
import { ArrowSystem, trajectoryPoints } from './arrows.js';
import { createEffects } from './particles.js';
import { AudioEngine } from './audio.js';
import { UI } from './ui.js';
import { clamp, damp, dampAngle, rand } from './utils.js';

const TOTAL_SLIMES = 8;
const ROUND_TIME = 165;
const FOCUS_MAX = 1;

// ---------------------------------------------------------------------------
// renderer / scene
// ---------------------------------------------------------------------------
const canvas = document.getElementById('scene');
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  alpha: false,
});
let pixelRatio = Math.min(window.devicePixelRatio || 1, 1.6);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.1, 180);
camera.position.set(5, 4.5, 16);

await document.fonts.ready;

const world = createWorld(scene, renderer);
const effects = createEffects(scene);
const audio = new AudioEngine();
audio.setMuted(localStorage.getItem('dewleaf-muted') === '1');

const elf = createElf();
scene.add(elf.root);
elf.root.position.copy(world.spawn);

const field = new SlimeField(scene, world.hideSpots, TOTAL_SLIMES, {
  onFlee: (slime) => handleFlee(slime),
});

const arrows = new ArrowSystem(scene, field, {
  onHit: (slime, point) => {
    const wasState = slime.state;
    if (field.catchSlime(slime)) handleCatch(slime, point, wasState);
  },
  onGround: (point) => {
    effects.groundPuff(point);
    audio.groundHit();
    const before = field.slimes.filter((s) => s.state === 'hidden' || s.state === 'peek').length;
    field.alertNear(point, 1.45);
    const after = field.slimes.filter((s) => s.state === 'hidden' || s.state === 'peek').length;
    if (after < before) {
      // onFlee handles the message
    }
  },
});

// aim helpers
const previewCount = 18;
const previewGeo = new THREE.BufferGeometry();
previewGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(previewCount * 3), 3));
const previewMat = new THREE.PointsMaterial({
  color: 0xffe7a1, size: 0.14, sizeAttenuation: true, transparent: true,
  opacity: 0.72, depthWrite: false, blending: THREE.AdditiveBlending,
});
const preview = new THREE.Points(previewGeo, previewMat);
preview.frustumCulled = false;
scene.add(preview);

const aimRing = new THREE.Mesh(
  new THREE.RingGeometry(0.3, 0.4, 36),
  new THREE.MeshBasicMaterial({ color: 0xffe5a2, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide })
);
aimRing.rotation.x = -Math.PI / 2;
aimRing.visible = false;
scene.add(aimRing);

const ringDot = new THREE.Mesh(
  new THREE.CircleGeometry(0.06, 12),
  new THREE.MeshBasicMaterial({ color: 0xfff3cb, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide })
);
aimRing.add(ringDot);

// ---------------------------------------------------------------------------
// game state
// ---------------------------------------------------------------------------
const game = {
  state: 'title',
  timeLeft: ROUND_TIME,
  totalTime: ROUND_TIME,
  score: 0,
  caught: 0,
  combo: 0,
  comboTimer: 0,
  bestCombo: 0,
  shots: 0,
  hits: 0,
  focus: FOCUS_MAX,
  focusActive: false,
  focusLocked: false,
  focusRegenDelay: 0,
  drawing: false,
  drawT: 0,
  cooldown: 0,
  aimHold: 0,
  ending: 0,
  win: false,
  session: 0,
  tutorialShown: false,
  lastTick: -1,
  lastFleeToast: -10,
  lastCatchTime: -10,
  startTime: 0,
  finalTime: 0,
};

const keys = new Set();
const player = {
  pos: world.spawn.clone(),
  vel: new THREE.Vector3(),
  walkDistance: 0,
  stepTimer: 0,
};
const touch = {
  active: false,
  id: null,
  aiming: false,
  x: null,
  y: null,
};
const pointer = {
  x: window.innerWidth / 2,
  y: window.innerHeight / 2,
  nx: 0,
  ny: 0,
  active: window.matchMedia('(pointer: fine)').matches,
  type: 'mouse',
};
let focusHeld = false;
let touchFocus = false;
let aimPoint = new THREE.Vector3(world.spawn.x, 0, world.spawn.z - 10);
let aimValid = false;
let lastAimInput = 0;
let shake = 0;
let clock = 0;
let introTimers = [];

const camState = {
  pos: new THREE.Vector3(5, 4.5, 16),
  look: new THREE.Vector3(0, 1.3, 10),
};
const titleCamera = {
  angle: 0.55,
};

function screenSize() {
  return { w: renderer.domElement.clientWidth || window.innerWidth, h: renderer.domElement.clientHeight || window.innerHeight };
}

function projectToScreen(pos, out = {}) {
  const v = pos.clone().project(camera);
  const { w, h } = screenSize();
  out.x = (v.x * 0.5 + 0.5) * w;
  out.y = (-v.y * 0.5 + 0.5) * h;
  out.visible = v.z < 1 && v.z > -1 && out.x > -40 && out.x < w + 40 && out.y > -40 && out.y < h + 40;
  return out;
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
const ui = new UI({
  start: () => startGame(),
  pause: () => pauseGame(),
  resume: () => resumeGame(),
  quit: () => quitToTitle(),
  restart: () => startGame(),
  toggleMute: () => toggleMute(),
  focusStart: () => { touchFocus = true; },
  focusEnd: () => { touchFocus = false; },
});
ui.setMuted(audio.muted);

// ---------------------------------------------------------------------------
// input
// ---------------------------------------------------------------------------
function updatePointerFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = e.clientX - rect.left;
  pointer.y = e.clientY - rect.top;
  pointer.nx = (pointer.x / rect.width) * 2 - 1;
  pointer.ny = -(pointer.y / rect.height) * 2 + 1;
  pointer.active = true;
  pointer.type = e.pointerType || 'mouse';
  lastAimInput = clock;
  if (game.state === 'playing') game.aimHold = 2.1;
}

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') {
    if (touch.active && e.pointerId === touch.id) {
      updatePointerFromEvent(e);
      touch.x = pointer.x; touch.y = pointer.y;
      e.preventDefault();
    }
    return;
  }
  updatePointerFromEvent(e);
});

canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  updatePointerFromEvent(e);
  if (game.state !== 'playing') return;
  if (e.pointerType === 'touch') {
    if (touch.id != null && touch.id !== e.pointerId) return;
    touch.id = e.pointerId;
    touch.active = true;
    touch.aiming = true;
    touch.x = pointer.x;
    touch.y = pointer.y;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic or stale pointer */ }
    ui.reticle(touch.x, touch.y, true);
    e.preventDefault();
    return;
  }
  if (e.button === 0) requestShot();
});

canvas.addEventListener('pointerup', (e) => {
  if (e.pointerType !== 'touch') return;
  if (!touch.active || e.pointerId !== touch.id) return;
  updatePointerFromEvent(e);
  touch.aiming = false;
  game.touchAimHold = 0.45;
  if (game.state === 'playing') requestShot();
  ui.reticle(touch.x, touch.y, false);
  touch.active = false;
  touch.id = null;
  e.preventDefault();
});

canvas.addEventListener('pointercancel', (e) => {
  if (e.pointerId === touch.id) {
    touch.active = false;
    touch.aiming = false;
    touch.id = null;
    ui.reticle(pointer.x, pointer.y, false);
  }
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('blur', () => { keys.clear(); focusHeld = false; touchFocus = false; });

// joystick
const joyEl = document.getElementById('joystick');
const joyKnob = document.getElementById('joy-knob');
const joyState = { id: null, x: 0, y: 0 };
function joyMove(e) {
  if (joyState.id !== e.pointerId) return;
  const base = joyEl.querySelector('.joy-base');
  const rect = base.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let dx = e.clientX - cx;
  let dy = e.clientY - cy;
  const max = rect.width * 0.32;
  const len = Math.hypot(dx, dy);
  if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
  joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  joyState.x = dx / max;
  joyState.y = dy / max;
}
joyEl.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  joyState.id = e.pointerId;
  try { joyEl.setPointerCapture(e.pointerId); } catch { /* synthetic or stale pointer */ }
  joyMove(e);
});
joyEl.addEventListener('pointermove', (e) => {
  if (joyState.id === e.pointerId) {
    e.preventDefault();
    joyMove(e);
  }
});
function joyEnd(e) {
  if (joyState.id !== e.pointerId) return;
  joyState.id = null;
  joyState.x = 0; joyState.y = 0;
  joyKnob.style.transform = '';
}
joyEl.addEventListener('pointerup', joyEnd);
joyEl.addEventListener('pointercancel', joyEnd);
joyEl.addEventListener('lostpointercapture', joyEnd);

window.addEventListener('keydown', (e) => {
  unlockAudio();
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'Escape') {
    if (game.state === 'playing') pauseGame();
    else if (game.state === 'paused') resumeGame();
  }
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'Space' && game.state === 'playing') requestShot();
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') focusHeld = true;
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') focusHeld = false;
});

window.addEventListener('resize', () => {
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'playing') pauseGame();
});

let audioUnlocked = false;
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  audio.unlock();
}

// ---------------------------------------------------------------------------
// camera
// ---------------------------------------------------------------------------
function baseCameraRig() {
  const aspect = window.innerWidth / window.innerHeight;
  if (aspect < 0.78) {
    return { offset: new THREE.Vector3(0, 8.3, 8.0), fov: 57, lookY: 1.0 };
  }
  if (aspect < 1.15) {
    return { offset: new THREE.Vector3(0, 6.8, 8.0), fov: 52, lookY: 1.1 };
  }
  return { offset: new THREE.Vector3(0, 5.7, 7.4), fov: 45, lookY: 1.2 };
}

function updateCamera(dt) {
  if (game.state === 'title') {
    titleCamera.angle += dt * 0.045;
    const a = titleCamera.angle;
    const radius = 7.4;
    const desired = new THREE.Vector3(
      elf.root.position.x + Math.sin(a) * radius,
      4.15 + Math.sin(clock * 0.18) * 0.12,
      elf.root.position.z + Math.cos(a) * radius
    );
    const look = new THREE.Vector3(elf.root.position.x - 2.55, 1.35, elf.root.position.z - 0.6);
    camState.pos.lerp(desired, 1 - Math.exp(-2.2 * dt));
    camState.look.lerp(look, 1 - Math.exp(-2.2 * dt));
    camera.position.copy(camState.pos);
    if (shake > 0.002) {
      camera.position.x += rand(-shake, shake);
      camera.position.y += rand(-shake, shake) * 0.5;
    }
    camera.lookAt(camState.look);
    camera.fov = damp(camera.fov, 39, 3, dt);
    camera.updateProjectionMatrix();
    return;
  }

  const rig = baseCameraRig();
  const focus = game.focusActive ? 1 : 0;
  const zoom = game.state === 'ending' ? 0.84 : 1;
  const desired = new THREE.Vector3(
    player.pos.x,
    rig.offset.y * zoom,
    player.pos.z + rig.offset.z * zoom
  );
  // keep the huntress slightly ahead of centre when moving
  desired.x += player.vel.x * 0.11;
  desired.z += player.vel.z * 0.11;
  const look = new THREE.Vector3(
    player.pos.x + player.vel.x * 0.16,
    rig.lookY - focus * 0.12,
    player.pos.z + player.vel.z * 0.16 - 0.15
  );
  const follow = game.state === 'ending' ? 2.4 : 6.2;
  camState.pos.lerp(desired, 1 - Math.exp(-follow * dt));
  camState.look.lerp(look, 1 - Math.exp(-follow * 1.2 * dt));
  camera.position.copy(camState.pos);
  if (shake > 0.002) {
    camera.position.x += rand(-shake, shake);
    camera.position.y += rand(-shake, shake) * 0.6;
    camera.position.z += rand(-shake, shake) * 0.4;
  }
  camera.lookAt(camState.look);
  const targetFov = rig.fov - focus * 3.2 + (game.state === 'ending' ? -3 : 0);
  camera.fov = damp(camera.fov, targetFov, 4, dt);
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------------------
// aim
// ---------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const tmpSphere = new THREE.Sphere();
const tmpVec = new THREE.Vector3();

function computeAim() {
  aimValid = false;
  const mobileAim = (touch.active && touch.aiming) || game.touchAimHold > 0;
  if (!(pointer.active && !window.matchMedia('(pointer: coarse)').matches) && !mobileAim) {
    // no pointer: aim in the direction the huntress is facing / moving
    let dir = new THREE.Vector3(0, 0, -1);
    if (player.vel.lengthSq() > 0.1) dir.set(player.vel.x, 0, player.vel.z).normalize();
    aimPoint.copy(player.pos).addScaledVector(dir, 11);
    aimPoint.y = 0.02;
    return;
  }
  pointer.nx = (pointer.x / window.innerWidth) * 2 - 1;
  pointer.ny = -(pointer.y / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera({ x: pointer.nx, y: pointer.ny }, camera);
  const ray = raycaster.ray;

  // click a slime body directly = aim at it, even if it sits above the ground
  let bestSlime = null;
  let bestDist = Infinity;
  for (const s of field.slimes) {
    if (s.state === 'caught') continue;
    tmpSphere.center.copy(s.group.position);
    tmpSphere.center.y += 0.36 * s.size;
    tmpSphere.radius = 0.58 * s.size;
    const hit = ray.intersectSphere(tmpSphere, tmpVec);
    if (hit) {
      const d = hit.distanceTo(ray.origin);
      if (d < bestDist) { bestDist = d; bestSlime = s; }
    }
  }
  if (bestSlime) {
    aimPoint.set(bestSlime.group.position.x, bestSlime.group.position.y + 0.3 * bestSlime.size, bestSlime.group.position.z);
    aimValid = true;
    return;
  }

  // otherwise aim at the ground
  if (ray.direction.y < -0.008) {
    const t = (0.02 - ray.origin.y) / ray.direction.y;
    if (t > 0 && t < 120) {
      aimPoint.copy(ray.origin).addScaledVector(ray.direction, t);
      aimValid = true;
    }
  }
  if (!aimValid) {
    const flat = new THREE.Vector3(ray.direction.x, 0, ray.direction.z).normalize();
    aimPoint.copy(player.pos).addScaledVector(flat, 12);
    aimPoint.y = 0.02;
    aimValid = true;
  }
  // limit practical range
  const dx = aimPoint.x - player.pos.x, dz = aimPoint.z - player.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 31) {
    aimPoint.x = player.pos.x + (dx / dist) * 31;
    aimPoint.z = player.pos.z + (dz / dist) * 31;
  } else if (dist < 1.1) {
    const dir = new THREE.Vector3(aimPoint.x - player.pos.x, 0, aimPoint.z - player.pos.z);
    if (dir.lengthSq() < 0.0001) dir.set(0, 0, -1);
    dir.normalize();
    aimPoint.x = player.pos.x + dir.x * 1.1;
    aimPoint.z = player.pos.z + dir.z * 1.1;
  }
  aimPoint.y = 0.02;
}

function aimYaw() {
  return Math.atan2(aimPoint.x - player.pos.x, aimPoint.z - player.pos.z);
}

// ---------------------------------------------------------------------------
// player / game flow
// ---------------------------------------------------------------------------
function resetPlayer() {
  player.pos.copy(world.spawn);
  player.vel.set(0, 0, 0);
  player.walkDistance = 0;
  player.stepTimer = 0;
  elf.root.position.copy(player.pos);
  elf.root.rotation.y = Math.PI;
  aimPoint.set(player.pos.x, 0.02, player.pos.z - 10);
  aimValid = false;
  lastAimInput = 0;
}

function startGame() {
  unlockAudio();
  audio.ui();
  clearIntro();
  game.state = 'playing';
  game.timeLeft = ROUND_TIME;
  game.totalTime = ROUND_TIME;
  game.score = 0;
  game.caught = 0;
  game.combo = 0;
  game.comboTimer = 0;
  game.bestCombo = 0;
  game.shots = 0;
  game.hits = 0;
  game.focus = FOCUS_MAX;
  game.focusActive = false;
  game.focusLocked = false;
  game.focusRegenDelay = 0;
  game.drawing = false;
  game.drawT = 0;
  game.cooldown = 0;
  game.aimHold = 0;
  game.ending = 0;
  game.touchAimHold = 0;
  game.lastTick = -1;
  game.lastFleeToast = -10;
  game.lastCatchTime = -10;
  game.startTime = clock;
  game.session += 1;
  game.tutorialShown = false;
  document.body.classList.remove('focus-on');
  app.scrollTop = 0;
  app.scrollLeft = 0;

  resetPlayer();
  field.reset();
  arrows.clear();
  effects.clear();
  world.setProgress(0.08);
  ui.hideResult();
  ui.startGame(field.total, ROUND_TIME);
  ui.setDusk(0);
  focusHeld = false;
  touchFocus = false;
  keys.clear();
  joyState.x = joyState.y = 0;
  joyState.id = null;
  joyKnob.style.transform = '';
  shake = 0;
  preview.visible = true;
  aimRing.visible = true;
  audio.ambientGain && (audio.ambientGain.gain.value = 0.5);

  const session = game.session;
  introTimers.push(setTimeout(() => {
    if (game.state === 'playing' && game.session === session) {
      ui.toast('슬라임 8마리가 이슬잎 마을에 숨어들었습니다', '', 3200);
    }
  }, 500));
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  introTimers.push(setTimeout(() => {
    if (game.state === 'playing' && game.session === session) {
      ui.toast(
        coarse
          ? '집중 버튼을 누르면, 숨은 슬라임의 윤곽이 드러납니다'
          : 'Shift 로 집중하면, 숨은 슬라임의 윤곽이 드러납니다',
        'gold',
        3800
      );
    }
  }, 4700));
  if (coarse) {
    introTimers.push(setTimeout(() => {
      if (game.state === 'playing' && game.session === session) {
        ui.toast('왼쪽 스틱으로 이동 · 오른쪽 화면을 눌러 조준 후 발사', '', 3600);
      }
    }, 9000));
  }
}

function clearIntro() {
  introTimers.forEach((t) => clearTimeout(t));
  introTimers = [];
}

function pauseGame() {
  if (game.state !== 'playing') return;
  game.state = 'paused';
  focusHeld = false;
  touchFocus = false;
  game.focusActive = false;
  keys.clear();
  joyState.x = joyState.y = 0;
  joyKnob.style.transform = '';
  game.drawing = false;
  game.drawT = 0;
  document.body.classList.remove('focus-on');
  ui.pauseGame();
  audio.ui();
}

function resumeGame() {
  if (game.state !== 'paused') return;
  game.state = 'playing';
  ui.resumeGame();
  audio.ui();
  lastAimInput = clock;
}

function quitToTitle() {
  clearIntro();
  game.state = 'title';
  game.session += 1;
  focusHeld = false;
  touchFocus = false;
  game.focusActive = false;
  game.drawing = false;
  game.cooldown = 0;
  keys.clear();
  touch.active = false;
  touch.aiming = false;
  touch.id = null;
  joyState.x = joyState.y = 0;
  joyKnob.style.transform = '';
  arrows.clear();
  effects.clear();
  field.reset();
  resetPlayer();
  world.setProgress(0.13);
  ui.showTitle();
  ui.hideResult();
  app.scrollTop = 0;
  app.scrollLeft = 0;
  preview.visible = false;
  aimRing.visible = false;
  titleCamera.angle = Math.random() * 0.4 + 0.4;
  audio.ui();
}

function endGame(win) {
  if (game.state !== 'playing') return;
  game.state = 'ending';
  game.win = win;
  game.ending = 1.35;
  game.finalTime = game.timeLeft;
  game.focusActive = false;
  game.drawing = false;
  game.drawT = 0;
  document.body.classList.remove('focus-on');
  focusHeld = false;
  touchFocus = false;
  ui.reticle(pointer.x, pointer.y, false);
  if (win) {
    game.score += Math.round(game.timeLeft * 4);
    effects.victory(player.pos);
    audio.victory();
    ui.toast('마지막 슬라임까지 모두 잡았습니다!', 'gold', 2200);
    shake = 0.22;
  } else {
    audio.defeat();
    ui.toast('해가 저물었습니다... 슬라임들이 밤의 색으로 숨었습니다', 'warn', 2600);
  }
}

function finishResult() {
  game.state = 'result';
  const rank = rankFor(game.win, game.finalTime, field.caughtCount);
  ui.showResult({
    win: game.win,
    rank,
    score: game.score,
    caught: field.caughtCount,
    total: field.total,
    timeLeft: game.finalTime,
    bestCombo: game.bestCombo,
  });
  preview.visible = false;
  aimRing.visible = false;
  ui.setDusk(0);
  game.focusActive = false;
  document.body.classList.remove('focus-on');
}

function rankFor(win, timeLeft, caught) {
  if (!win) return caught >= 6 ? 'B' : caught >= 3 ? 'C' : 'D';
  if (timeLeft > 62) return 'S';
  if (timeLeft > 33) return 'A';
  if (timeLeft > 12) return 'B';
  return 'C';
}

function handleCatch(slime, point, wasState) {
  const now = clock;
  if (now - game.lastCatchTime < 9.5) game.combo += 1;
  else game.combo = 1;
  game.lastCatchTime = now;
  game.comboTimer = 9.5;
  game.bestCombo = Math.max(game.bestCombo, game.combo);
  game.hits += 1;

  let points = 100;
  if (wasState === 'flee') points += 65;
  else if (wasState === 'peek') points += 30;
  if (game.focusActive) points += 20;
  const dist = Math.hypot(slime.group.position.x - player.pos.x, slime.group.position.z - player.pos.z);
  if (dist > 11) points += 20;
  const mult = Math.min(5, Math.max(1, game.combo));
  points *= mult;
  game.score += points;

  const burstPos = point.clone();
  burstPos.y = Math.max(0.3, burstPos.y);
  effects.catchBurst(burstPos, slime.color);
  audio.hit();
  shake = Math.min(0.34, 0.16 + mult * 0.025);
  game.caught = field.caughtCount;

  const screen = projectToScreen(new THREE.Vector3(
    slime.group.position.x,
    slime.group.position.y + 0.9,
    slime.group.position.z
  ));
  if (screen.visible) {
    ui.floatText(screen.x, screen.y, `+${points}`, mult >= 3 ? 'big' : '');
    if (wasState === 'flee' && game.combo >= 2) {
      ui.floatText(screen.x, screen.y + 32, '도망 중 포획!', 'small');
    } else if (wasState === 'peek') {
      ui.floatText(screen.x, screen.y + 30, '눈이 마주쳤다!', 'small');
    }
  }
  ui.flashHit(pointer.x, pointer.y);
  ui.updateHud({
    timeLeft: game.timeLeft, totalTime: game.totalTime, caught: field.caughtCount,
    total: field.total, score: game.score, focusEnergy: game.focus,
    focusActive: game.focusActive, detect: detectionLevel(), combo: game.comboTimer > 0 ? game.combo : 0,
  });

  if (field.allCaught) {
    endGame(true);
  } else if (field.caughtCount === 1) {
    ui.toast('한 발 명중! 숨은 슬라임은 한 번에 잡힙니다', 'gold', 2600);
  } else if (field.caughtCount === Math.ceil(field.total / 2)) {
    ui.toast(`절반을 잡았습니다 · 남은 슬라임 ${field.total - field.caughtCount}마리`, '', 2300);
  }
}

function handleFlee(slime) {
  audio.flee();
  const screen = projectToScreen(new THREE.Vector3(slime.group.position.x, 1.2, slime.group.position.z));
  if (screen.visible) ui.floatText(screen.x, screen.y, '!', 'small');
  if (clock - game.lastFleeToast > 4.5) {
    game.lastFleeToast = clock;
    ui.toast('슬라임이 놀라 다른 색으로 갈아입고 도망쳤습니다', 'warn', 2300);
  }
}

function detectionLevel() {
  const d = field.nearestDistance(player.pos);
  if (!Number.isFinite(d)) return 0;
  return clamp(1 - (d - 1.8) / 16, 0, 1);
}

function requestShot() {
  if (game.state !== 'playing' || game.cooldown > 0 || game.drawing) return;
  game.drawing = true;
  game.drawT = 0;
  game.aimHold = 2.4;
  lastAimInput = clock;
  audio.draw();
  ui.hideMobileHint();
}

function releaseShot() {
  const origin = elf.getBowMuzzle(new THREE.Vector3());
  let target = aimPoint.clone();
  // never fire backwards into the archer
  const d = new THREE.Vector3(target.x - origin.x, 0, target.z - origin.z);
  if (d.lengthSq() < 1.2 * 1.2) {
    d.normalize();
    target.set(origin.x + d.x * 1.5, 0.02, origin.z + d.z * 1.5);
  }
  arrows.spawn(origin, target);
  game.shots += 1;
  game.drawing = false;
  game.cooldown = 0.42;
  elf.triggerRelease();
  audio.release();
  setTimeout(() => audio.whoosh(), 35);
  shake = Math.max(shake, 0.055);
  ui.kickReticle();
  if (!game.tutorialShown) {
    game.tutorialShown = true;
  }
}

function toggleMute() {
  const muted = !audio.muted;
  audio.setMuted(muted);
  ui.setMuted(muted);
  localStorage.setItem('dewleaf-muted', muted ? '1' : '0');
  if (!muted) {
    audio.unlock();
    audio.ui();
  }
}

// ---------------------------------------------------------------------------
// per-frame gameplay
// ---------------------------------------------------------------------------
function updatePlayer(dt) {
  let ix = 0, iz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) iz -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) iz += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
  ix += joyState.x;
  iz += joyState.y;
  const mag = Math.hypot(ix, iz);
  if (mag > 1) { ix /= mag; iz /= mag; }

  const focusSlow = game.focusActive ? 0.62 : 1;
  const speed = 5.15 * focusSlow;
  const targetVX = ix * speed;
  const targetVZ = iz * speed;
  player.vel.x = damp(player.vel.x, targetVX, 11, dt);
  player.vel.z = damp(player.vel.z, targetVZ, 11, dt);
  if (Math.abs(player.vel.x) < 0.01) player.vel.x = 0;
  if (Math.abs(player.vel.z) < 0.01) player.vel.z = 0;

  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;

  // collision with props
  const bodyR = 0.34;
  for (const c of world.colliders) {
    const dx = player.pos.x - c.x;
    const dz = player.pos.z - c.z;
    const min = c.r + bodyR;
    const d2 = dx * dx + dz * dz;
    if (d2 < min * min && d2 > 0.000001) {
      const d = Math.sqrt(d2);
      player.pos.x = c.x + (dx / d) * min;
      player.pos.z = c.z + (dz / d) * min;
    }
  }
  const pr = Math.hypot(player.pos.x, player.pos.z);
  if (pr > world.bounds) {
    player.pos.x = (player.pos.x / pr) * world.bounds;
    player.pos.z = (player.pos.z / pr) * world.bounds;
  }
  elf.root.position.copy(player.pos);

  const speedNow = Math.hypot(player.vel.x, player.vel.z);
  player.walkDistance += speedNow * dt;
  if (speedNow > 0.7) {
    player.stepTimer -= dt;
    if (player.stepTimer <= 0) {
      player.stepTimer = focusSlow > 0.9 ? 0.34 : 0.48;
      audio.step();
    }
  } else {
    player.stepTimer = 0.05;
  }
}

function updateFocus(dt) {
  if (game.state !== 'playing') return;
  const wants = (focusHeld || touchFocus) && !game.focusLocked;
  if (wants && game.focus > 0.015) {
    if (!game.focusActive) {
      game.focusActive = true;
      audio.focusOn();
    }
    game.focus = Math.max(0, game.focus - dt / 4.1);
    game.focusRegenDelay = 0.75;
    if (game.focus <= 0) {
      game.focus = 0;
      game.focusActive = false;
      game.focusLocked = true;
      audio.focusOff();
    }
  } else {
    if (game.focusActive) {
      game.focusActive = false;
      audio.focusOff();
    }
    if (!focusHeld && !touchFocus) game.focusLocked = false;
    game.focusRegenDelay -= dt;
    if (game.focusRegenDelay <= 0) {
      game.focus = Math.min(FOCUS_MAX, game.focus + dt / 7.2);
    }
  }
  if (game.focus <= 0.015) game.focusActive = false;
}

function updateGame(dt) {
  if (game.state === 'playing') {
    game.timeLeft -= dt;
    if (game.timeLeft <= 0) {
      game.timeLeft = 0;
      endGame(false);
      return;
    }
    // urgent tick
    const sec = Math.ceil(game.timeLeft);
    if (sec <= 12 && sec !== game.lastTick) {
      game.lastTick = sec;
      audio.tick(sec <= 5);
    }
    game.cooldown = Math.max(0, game.cooldown - dt);
    game.aimHold = Math.max(0, game.aimHold - dt);
    game.touchAimHold = Math.max(0, (game.touchAimHold || 0) - dt);
    game.comboTimer = Math.max(0, game.comboTimer - dt);
    if (game.comboTimer === 0) game.combo = 0;

    updatePlayer(dt);
    updateFocus(dt);

    if (game.drawing) {
      game.drawT += dt;
      if (game.drawT >= 0.19) releaseShot();
    }

    if (!field.allCaught && game.caught > 0) {
      // no-op; kept for clarity
    }
  } else if (game.state === 'ending') {
    game.ending -= dt;
    game.cooldown = Math.max(0, game.cooldown - dt);
    if (game.ending <= 0) finishResult();
  }

  // progress sky with remaining time
  if (game.state === 'playing' || game.state === 'ending') {
    const p = 0.08 + (1 - game.timeLeft / game.totalTime) * 0.92;
    world.setProgress(p);
    ui.setDusk(p);
  }
}

function updateElf(dt) {
  let state;
  if (game.state === 'title') {
    const yaw = Math.atan2(camera.position.x - elf.root.position.x, camera.position.z - elf.root.position.z);
    state = { speed: 0, moving: false, aimYaw: yaw, aiming: false, draw: 0, focus: false, time: clock };
  } else {
    const speed = Math.hypot(player.vel.x, player.vel.z);
    let faceYaw = aimYaw();
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    if (coarse && clock - lastAimInput > 2.8 && speed > 0.3) {
      faceYaw = Math.atan2(player.vel.x, player.vel.z);
    } else if (!pointer.active && speed > 0.3) {
      faceYaw = Math.atan2(player.vel.x, player.vel.z);
    }
    const draw = game.drawing ? clamp(game.drawT / 0.19, 0, 1) : 0;
    state = {
      speed,
      moving: speed > 0.2,
      aimYaw: faceYaw,
      aiming: game.drawing || game.aimHold > 0 || game.focusActive || game.cooldown > 0,
      draw,
      releasing: game.cooldown > 0.28,
      focus: game.focusActive,
      time: clock,
    };
  }
  elf.update(dt, state);
}

// ---------------------------------------------------------------------------
// aim preview
// ---------------------------------------------------------------------------
function updateAimVisuals() {
  const playing = game.state === 'playing' || game.state === 'ending';
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const showReticle = game.state === 'playing' && (!coarse || touch.aiming);
  if (game.state === 'playing') {
    if (!coarse) ui.reticle(pointer.x, pointer.y, true);
    else if (touch.aiming) ui.reticle(pointer.x, pointer.y, true);
    else ui.reticle(pointer.x, pointer.y, false);
  } else {
    ui.reticle(pointer.x, pointer.y, false);
  }

  const show = playing && aimValid && (!coarse || touch.aiming || game.drawing);
  preview.visible = show && game.state === 'playing';
  aimRing.visible = show && game.state === 'playing';
  if (show) {
    const origin = elf.getBowMuzzle(new THREE.Vector3());
    const pts = trajectoryPoints(origin, aimPoint, previewCount);
    const arr = previewGeo.attributes.position.array;
    pts.forEach((p, i) => {
      arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
    });
    previewGeo.attributes.position.needsUpdate = true;
    aimRing.position.set(aimPoint.x, 0.055, aimPoint.z);
    const pulse = 1 + Math.sin(clock * 5.5) * 0.08;
    aimRing.scale.setScalar(pulse);
    aimRing.material.opacity = game.drawing ? 0.8 : 0.42;
  }
  // subtle focus sparkles near hidden slimes
  if (game.state === 'playing' && game.focusActive) {
    game._spark = (game._spark ?? 0) + 0.016;
    if (game._spark > 0.28) {
      game._spark = 0;
      const candidates = field.slimes.filter((s) => (s.state === 'hidden' || s.state === 'peek') && s.group.position.distanceTo(player.pos) < 18);
      if (candidates.length) {
        const s = candidates[Math.floor(Math.random() * candidates.length)];
        effects.focusSparkle(s.group.position.clone().add(new THREE.Vector3(rand(-0.5, 0.5), rand(0.4, 0.9), rand(-0.5, 0.5))));
      }
    }
  }
}

// ---------------------------------------------------------------------------
// main loop
// ---------------------------------------------------------------------------
let last = performance.now();
let fpsFrames = 0;
let fpsClock = 0;
let lowQuality = false;

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, Math.max(0.0001, (now - last) / 1000));
  last = now;
  clock += dt;
  fpsFrames += 1;
  fpsClock += dt;
  if (fpsClock > 2.5) {
    const fps = fpsFrames / fpsClock;
    if (fps < 27 && !lowQuality) {
      lowQuality = true;
      pixelRatio = Math.max(1, pixelRatio - 0.3);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(window.innerWidth, window.innerHeight, false);
    }
    fpsFrames = 0;
    fpsClock = 0;
  }

  // aim depends on current camera, so run camera before the huntress pose
  if (game.state === 'playing' || game.state === 'ending') computeAim();
  updateGame(dt);
  updateCamera(dt);
  updateElf(dt);
  updateAimVisuals();

  const active = game.state === 'playing' || game.state === 'ending';
  if (active) {
    arrows.update(dt);
    field.update(dt, clock, player.pos, game.focusActive, Math.hypot(player.vel.x, player.vel.z) > 0.4);
    effects.update(dt);
  } else if (game.state === 'title') {
    field.update(dt, clock, new THREE.Vector3(999, 0, 999), false, false);
    effects.update(dt);
  }

  world.update(dt, clock);
  if (shake > 0.001) shake *= Math.exp(-7 * dt);

  if (game.state === 'playing') {
    const level = detectionLevel();
    ui.updateHud({
      timeLeft: game.timeLeft,
      totalTime: game.totalTime,
      caught: field.caughtCount,
      total: field.total,
      score: game.score,
      focusEnergy: game.focus,
      focusActive: game.focusActive,
      detect: level,
      combo: game.comboTimer > 0 ? game.combo : 0,
    });
    audio.update(dt, game.focusActive ? level : level * 0.4);
  } else {
    audio.update(dt, 0);
  }

  renderer.render(scene, camera);
  if (!window.__ready) {
    window.__ready = true;
    ui.bootDone();
  }
}

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------
window.__game = {
  game, field, elf, world, scene, camera, renderer, ui, player,
  start: () => startGame(),
  quit: () => quitToTitle(),
  getAim: () => aimPoint.clone(),
  catchAll: () => {
    for (const s of field.slimes) {
      if (s.state !== 'caught') {
        field.catchSlime(s);
      }
    }
    game.caught = field.caughtCount;
    if (field.allCaught) endGame(true);
  },
  setFocus: (v) => {
    if (v) { game.focusActive = true; game.focus = Math.max(0.4, game.focus); }
    else game.focusActive = false;
  },
};

resetPlayer();
updateCamera(0.016);
updateElf(0.016);
ui.bootDone();
requestAnimationFrame((t) => { last = t; loop(t); });
