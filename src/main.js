/* Boot: canvas, match, notebook, and a patient little clock. */

import { Game } from './game.js';
import { Renderer } from './render.js';
import { Soundscape } from './audio.js';
import { UI } from './ui.js';

const canvas = document.getElementById('game');
const sound = new Soundscape();
const game = new Game(canvas, sound);
const renderer = new Renderer(canvas);
game.setRenderer(renderer);
renderer.snapCamera(1000, 680, renderer.baseZoom);
const ui = new UI(game, sound);

window.addEventListener('resize', () => {
  renderer.resize();
  renderer.snapCamera(renderer.cam.x, renderer.cam.y, Math.min(renderer.cam.zoom, renderer.baseZoom * 1.06));
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.screen === 'playing') game.togglePause();
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  game.update(dt);
  renderer.draw(game, dt);
  ui.update(dt);
  sound.update(dt);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// A small developer handle, handy in the console and for automated checks.
window.slimeSeek = { game, renderer, ui, sound };
