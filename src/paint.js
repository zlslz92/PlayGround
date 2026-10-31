/* The paint layer: a tiny chameleon canvas and its camouflage metrics. */

import {
  TAU,
  clamp,
  colorDistance,
  hexToRgb,
  mixHex,
  rgba,
  shade,
} from './utils.js';

export const PAINT_SIZE = 96;

export function createPaintLayer(base = '#5f8a47', seed = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = PAINT_SIZE;
  canvas.height = PAINT_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, PAINT_SIZE, PAINT_SIZE);
  const rng = mulberry(seed);
  for (let i = 0; i < 320; i++) {
    const x = rng() * PAINT_SIZE;
    const y = rng() * PAINT_SIZE;
    const r = 1 + rng() * 7;
    ctx.fillStyle = rgba(rng() < 0.5 ? shade(base, 0.1) : shade(base, -0.12), 0.07 + rng() * 0.06);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  return { canvas, ctx };
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function paintStamp(layer, x, y, hex, radius = 8, seed = Math.random()) {
  const ctx = layer.ctx;
  const rng = mulberry(Math.floor(seed * 1e7));
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, rgba(hex, 0.88));
  g.addColorStop(0.68, rgba(hex, 0.55));
  g.addColorStop(1, rgba(hex, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
  // Speckles make a stroke feel like lichen rather than a sticker.
  for (let i = 0; i < 6; i++) {
    const a = rng() * TAU;
    const d = Math.sqrt(rng()) * radius * 0.85;
    ctx.fillStyle = rgba(rng() < 0.55 ? shade(hex, 0.12) : shade(hex, -0.14), 0.26);
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.7 + rng() * 1.8, 0, TAU);
    ctx.fill();
  }
}

export function fillPaint(layer, hex, speckle = true) {
  const ctx = layer.ctx;
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, PAINT_SIZE, PAINT_SIZE);
  if (!speckle) return;
  const rng = mulberry(Math.floor(Math.random() * 1e7));
  for (let i = 0; i < 280; i++) {
    const x = rng() * PAINT_SIZE;
    const y = rng() * PAINT_SIZE;
    const r = 0.5 + rng() * 5.5;
    ctx.fillStyle = rgba(rng() < 0.5 ? shade(hex, 0.1) : shade(hex, -0.1), 0.08 + rng() * 0.08);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
}

export function samplePaint(layer, x, y) {
  const d = layer.ctx.getImageData(
    clamp(Math.floor(x) - 1, 0, PAINT_SIZE - 3),
    clamp(Math.floor(y) - 1, 0, PAINT_SIZE - 3),
    3,
    3,
  ).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    r += d[i];
    g += d[i + 1];
    b += d[i + 2];
    n++;
  }
  return { r: r / n, g: g / n, b: b / n };
}

/** Average colour and texture complexity of the paint layer. */
export function paintStats(layer) {
  const image = layer.ctx.getImageData(0, 0, PAINT_SIZE, PAINT_SIZE).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let lum = 0;
  let lum2 = 0;
  let n = 0;
  for (let i = 0; i < image.length; i += 4) {
    if (image[i + 3] < 20) continue;
    r += image[i];
    g += image[i + 1];
    b += image[i + 2];
    const l = 0.2126 * image[i] + 0.7152 * image[i + 1] + 0.0722 * image[i + 2];
    lum += l;
    lum2 += l * l;
    n++;
  }
  if (!n) return { r: 0, g: 0, b: 0, hex: '#000000', lum: 0, std: 0 };
  r /= n;
  g /= n;
  b /= n;
  lum /= n;
  const variance = Math.max(0, lum2 / n - lum * lum);
  return {
    r,
    g,
    b,
    hex: `#${[r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('')}`,
    lum,
    std: Math.sqrt(variance) / 255,
  };
}

export function matchScores(paint, target) {
  const d = colorDistance(paint.hex, target.color);
  const color = Math.exp(-((d / 0.16) ** 2));
  const denom = Math.max(target.std, 0.1);
  const texture = clamp(1 - Math.abs(paint.std - target.std) / denom, 0, 1);
  return { color, texture };
}

/** Paint a plausible, imperfect AI disguise. */
export function makeAIPaint(baseColor, accentColor, complexity = 0.6, seed = 1) {
  const rng = mulberry(seed * 7331 + 17);
  const layer = createPaintLayer(baseColor, seed);
  const count = Math.round(24 + complexity * 70);
  for (let i = 0; i < count; i++) {
    const color = rng() < 0.55 ? accentColor : shade(baseColor, rng() < 0.5 ? 0.12 : -0.16);
    const x = rng() * PAINT_SIZE;
    const y = rng() * PAINT_SIZE;
    const r = 2 + rng() * (4 + complexity * 9);
    const g = layer.ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, 0.38));
    g.addColorStop(1, rgba(color, 0));
    layer.ctx.fillStyle = g;
    layer.ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return layer;
}

/** A small mottled swatch of the ground, for the paint studio. */
export function drawTargetSwatch(canvas, target, seed = 3) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = target.color;
  ctx.fillRect(0, 0, w, h);
  const rng = mulberry(seed * 97 + Math.floor(target.std * 1000));
  const accent = mixHex(target.color, '#ffffff', 0.16);
  const dark = mixHex(target.color, '#000000', 0.16);
  const count = Math.round(24 + target.std * 330);
  for (let i = 0; i < count; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = 0.5 + rng() * (2 + target.std * 14);
    ctx.fillStyle = rgba(rng() < 0.5 ? accent : dark, 0.18 + rng() * 0.2);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
}

export function paintToRgb(hex) {
  return hexToRgb(hex);
}
