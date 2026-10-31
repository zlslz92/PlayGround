/* Slime silhouettes. Every shape is drawn with its feet at (0, 0). */

import { TAU, smoothClosedPath } from './utils.js';

export const SHAPE_GEOM = {
  blob: { w: 72, h: 64, bbox: { x: -36, y: -62, w: 72, h: 62 }, eyeY: -32, eyeSpread: 9.5, eyeSize: 3.4, speed: 1 },
  pool: { w: 104, h: 46, bbox: { x: -52, y: -44, w: 104, h: 46 }, eyeY: -17, eyeSpread: 12, eyeSize: 3, speed: 0.82 },
  mound: { w: 76, h: 76, bbox: { x: -38, y: -73, w: 76, h: 74 }, eyeY: -36, eyeSpread: 9, eyeSize: 3.3, speed: 0.9 },
  fern: { w: 96, h: 78, bbox: { x: -48, y: -75, w: 96, h: 77 }, eyeY: -29, eyeSpread: 8, eyeSize: 3.1, speed: 1.02 },
  rock: { w: 80, h: 68, bbox: { x: -40, y: -65, w: 80, h: 65 }, eyeY: -33, eyeSpread: 9.5, eyeSize: 3.2, speed: 0.76 },
  mushroom: { w: 84, h: 88, bbox: { x: -42, y: -86, w: 84, h: 86 }, eyeY: -27, eyeSpread: 6.5, eyeSize: 2.8, speed: 0.88 },
  crystal: { w: 66, h: 98, bbox: { x: -33, y: -96, w: 66, h: 96 }, eyeY: -57, eyeSpread: 7, eyeSize: 3, speed: 0.84 },
  wall: { w: 88, h: 58, bbox: { x: -44, y: -29, w: 88, h: 58 }, eyeY: -4, eyeSpread: 10, eyeSize: 3.2, speed: 0 },
};

const wobble = (time, a, amount = 1, seed = 0) =>
  (Math.sin(a * 3 + time * 2.1 + seed) * 0.6 + Math.sin(a * 5 - time * 1.4 + seed * 2) * 0.4) * amount;

function blobPath(ctx, time, scale = 1) {
  const pts = [];
  const n = 28;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const r = 1 + wobble(time, a, 0.055) * scale;
    pts.push({ x: Math.cos(a) * 31 * r, y: -27 + Math.sin(a) * 30 * r });
  }
  // Keep the slime sitting on the ground.
  for (const p of pts) p.y = Math.min(p.y, 1);
  smoothClosedPath(ctx, pts);
}

function poolPath(ctx, time) {
  const pts = [];
  const n = 28;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const r = 1 + wobble(time, a, 0.035, 1) * 0.5;
    pts.push({ x: Math.cos(a) * 48 * r, y: -15 + Math.sin(a) * 16 * r });
  }
  for (const p of pts) p.y = Math.min(p.y, 1);
  smoothClosedPath(ctx, pts);
}

function moundPath(ctx) {
  ctx.beginPath();
  const cx = 0;
  const cy = -34;
  const rx = 34;
  const ry = 32;
  ctx.moveTo(-rx, 0);
  for (let i = 0; i <= 28; i++) {
    const a = Math.PI + (i / 28) * Math.PI;
    ctx.lineTo(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  }
  ctx.lineTo(rx, 0);
  ctx.quadraticCurveTo(0, 8, -rx, 0);
  ctx.closePath();
}

function fernPath(ctx, time) {
  // Central mound.
  ctx.beginPath();
  ctx.moveTo(-17, 0);
  ctx.quadraticCurveTo(-22, -20, -10, -30);
  ctx.quadraticCurveTo(0, -36, 11, -29);
  ctx.quadraticCurveTo(22, -19, 17, 0);
  ctx.quadraticCurveTo(0, 6, -17, 0);
  ctx.closePath();
  // Fronds.
  const fronds = [
    { a: -1.9, len: 34, w: 8 },
    { a: -1.45, len: 42, w: 9 },
    { a: -1.0, len: 35, w: 8 },
    { a: -0.55, len: 39, w: 8 },
    { a: -2.35, len: 28, w: 7 },
  ];
  for (let i = 0; i < fronds.length; i++) {
    const f = fronds[i];
    const sway = Math.sin(time * 1.3 + i * 1.7) * 0.035;
    const a = f.a + sway;
    const ox = 0;
    const oy = -20;
    const tx = Math.cos(a) * f.len;
    const ty = Math.sin(a) * f.len - 20;
    const nx = Math.cos(a + Math.PI / 2) * f.w;
    const ny = Math.sin(a + Math.PI / 2) * f.w;
    ctx.moveTo(ox + nx * 0.4, oy + ny * 0.4);
    ctx.quadraticCurveTo(ox + Math.cos(a) * f.len * 0.55 + nx, oy + Math.sin(a) * f.len * 0.55 + ny, tx, ty);
    ctx.quadraticCurveTo(ox + Math.cos(a) * f.len * 0.55 - nx, oy + Math.sin(a) * f.len * 0.55 - ny, ox - nx * 0.4, oy - ny * 0.4);
    ctx.closePath();
  }
}

function rockPath(ctx, time) {
  const base = [
    { x: -40, y: -2 },
    { x: -36, y: -24 },
    { x: -22, y: -45 },
    { x: -6, y: -61 },
    { x: 10, y: -56 },
    { x: 25, y: -48 },
    { x: 38, y: -27 },
    { x: 37, y: -5 },
    { x: 20, y: 4 },
    { x: -2, y: 6 },
    { x: -25, y: 4 },
  ];
  const pts = base.map((p, i) => ({
    x: p.x + Math.sin(time * 0.8 + i) * 0.45,
    y: p.y + Math.cos(time * 0.7 + i) * 0.35,
  }));
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

function mushroomPath(ctx, time) {
  // Stem.
  ctx.beginPath();
  ctx.moveTo(-9, 0);
  ctx.quadraticCurveTo(-12, -18, -7, -31);
  ctx.lineTo(7, -31);
  ctx.quadraticCurveTo(12, -18, 9, 0);
  ctx.quadraticCurveTo(0, 3, -9, 0);
  ctx.closePath();
  // Cap.
  ctx.beginPath();
  ctx.moveTo(-40, -31);
  ctx.bezierCurveTo(-41, -59, -23, -76, 0, -76);
  ctx.bezierCurveTo(23, -76, 41, -59, 40, -31);
  ctx.quadraticCurveTo(20, -24, 0, -25);
  ctx.quadraticCurveTo(-20, -24, -40, -31);
  ctx.closePath();
}

function crystalPath(ctx) {
  const pts = [
    { x: 0, y: -95 },
    { x: 20, y: -74 },
    { x: 31, y: -43 },
    { x: 25, y: -8 },
    { x: 12, y: 1 },
    { x: -13, y: 1 },
    { x: -27, y: -11 },
    { x: -32, y: -45 },
    { x: -20, y: -75 },
  ];
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

function wallPath(ctx, time) {
  const pts = [];
  const n = 26;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const r = 1 + wobble(time, a, 0.09, 3);
    pts.push({ x: Math.cos(a) * 43 * r, y: Math.sin(a) * 27 * r });
  }
  smoothClosedPath(ctx, pts);
}

export function traceShape(ctx, shape, time = 0) {
  switch (shape) {
    case 'pool': return poolPath(ctx, time);
    case 'mound': return moundPath(ctx);
    case 'fern': return fernPath(ctx, time);
    case 'rock': return rockPath(ctx, time);
    case 'mushroom': return mushroomPath(ctx, time);
    case 'crystal': return crystalPath(ctx);
    case 'wall': return wallPath(ctx, time);
    default: return blobPath(ctx, time);
  }
}

export function shapeBBox(shape) {
  return SHAPE_GEOM[shape]?.bbox ?? SHAPE_GEOM.blob.bbox;
}

export function shapeEyes(shape) {
  const g = SHAPE_GEOM[shape] ?? SHAPE_GEOM.blob;
  return { y: g.eyeY, spread: g.eyeSpread, size: g.eyeSize };
}
