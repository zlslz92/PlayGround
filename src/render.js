/* Painterly canvas renderer for the grove, its slimes and its warden. */

import {
  TAU,
  angleDelta,
  clamp,
  dist,
  hexToRgb,
  lerp,
  lerpAngle,
  mixHex,
  rgba,
  shade,
  smoothClosedPath,
} from './utils.js';
import {
  DECOR,
  FIREFLIES,
  GROUND_DETAILS,
  OBSTACLES,
  PROPS,
  TREES,
  WORLD,
  ZONES,
  rayCast,
} from './world.js';
import { traceShape, shapeBBox, shapeEyes } from './slime.js';

const GROUND_BASE = '#0b1712';

function ellipse(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU);
}

function glowSprite(color, size = 128) {
  const key = `${color}-${size}`;
  if (glowSprite.cache.has(key)) return glowSprite.cache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, rgba(color, 0.95));
  g.addColorStop(0.26, rgba(color, 0.4));
  g.addColorStop(0.62, rgba(color, 0.12));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  glowSprite.cache.set(key, canvas);
  return canvas;
}
glowSprite.cache = new Map();

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.dpr = 1;
    this.w = 1;
    this.h = 1;
    this.cam = { x: 1000, y: 700, zoom: 1 };
    this.camTarget = { x: 1000, y: 700, zoom: 1 };
    this.shake = 0;
    this.time = 0;
    this.fog = document.createElement('canvas');
    this.fogCtx = this.fog.getContext('2d');
    this.resize();
    this.noise = this.makeNoise();
    this.blobs = this.makeBlobs();
    this.paths = this.makePaths();
    this.worldCache = null;
    this.entityCache = new Map();
    this.buildWorldCache();
  }

  buildWorldCache() {
    const canvas = document.createElement('canvas');
    canvas.width = WORLD.w;
    canvas.height = WORLD.h;
    const ctx = canvas.getContext('2d');
    this.drawGround(ctx, { screen: 'title' });
    this.drawZones(ctx, { screen: 'title' });
    this.drawGroundDetails(ctx, { screen: 'title' }, true);
    this.worldCache = canvas;
  }

  cacheSprite(key, width, height, offsetX, offsetY, draw) {
    if (this.entityCache.has(key)) return this.entityCache.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.ceil(width));
    canvas.height = Math.max(2, Math.ceil(height));
    const ctx = canvas.getContext('2d');
    ctx.translate(offsetX, offsetY);
    draw(ctx);
    const sprite = { canvas, x: -offsetX, y: -offsetY, w: canvas.width, h: canvas.height };
    this.entityCache.set(key, sprite);
    return sprite;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.dpr = dpr;
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.fog.width = Math.round(w * dpr);
    this.fog.height = Math.round(h * dpr);
    const compact = Math.min(w, h) < 800;
    const fit = compact
      ? clamp(Math.min(w / 540, h / 900), 0.7, 1.02)
      : clamp(Math.min(w / 1160, h / 790), 0.64, 1.06);
    this.baseZoom = fit;
  }

  snapCamera(x, y, zoom) {
    this.cam.x = x;
    this.cam.y = y;
    this.cam.zoom = zoom ?? this.baseZoom;
    this.camTarget.x = x;
    this.camTarget.y = y;
    this.camTarget.zoom = this.cam.zoom;
  }

  screenPos(x, y) {
    return {
      x: (x - this.cam.x) * this.cam.zoom + this.w / 2 + this.shakeX,
      y: (y - this.cam.y) * this.cam.zoom + this.h / 2 + this.shakeY,
    };
  }

  makeNoise() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 20 + Math.random() * 26;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  makeBlobs() {
    const rng = (seed => {
      let s = seed;
      return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
      };
    })(47);
    const blobs = [];
    const colors = ['#1b3527', '#213d2c', '#173024', '#28442f', '#163026'];
    for (let i = 0; i < 42; i++) {
      blobs.push({
        x: 100 + rng() * 1800,
        y: 110 + rng() * 1080,
        r: 80 + rng() * 260,
        c: colors[Math.floor(rng() * colors.length)],
        a: 0.16 + rng() * 0.16,
        sx: 0.6 + rng() * 0.8,
      });
    }
    return blobs;
  }

  makePaths() {
    return [
      { pts: [{ x: 620, y: 520 }, { x: 800, y: 640 }, { x: 1000, y: 690 }, { x: 1240, y: 760 }], w: 44 },
      { pts: [{ x: 1000, y: 690 }, { x: 980, y: 860 }, { x: 870, y: 1010 }], w: 36 },
      { pts: [{ x: 1000, y: 690 }, { x: 900, y: 540 }, { x: 820, y: 420 }], w: 34 },
      { pts: [{ x: 1240, y: 760 }, { x: 1400, y: 855 }, { x: 1390, y: 980 }], w: 32 },
    ];
  }

  updateCamera(game, dt) {
    const playerHider = game.hiders?.find((h) => h.isPlayer);
    let focus = null;
    let zoom = this.baseZoom;
    if (game.screen === 'title') {
      const t = this.time * 0.05;
      focus = {
        x: 900 + Math.sin(t) * 100,
        y: 680 + Math.cos(t * 0.8) * 60,
      };
      zoom = this.baseZoom * 1.03;
    } else if (game.role === 'seeker') {
      focus = { x: game.seeker.x, y: game.seeker.y };
      zoom = this.baseZoom * 0.94;
    } else if (playerHider && !playerHider.caught) {
      focus = { x: playerHider.x, y: playerHider.y };
    } else {
      const alive = game.hiders?.find((h) => !h.caught && !h.isPlayer);
      focus = alive ? { x: alive.x, y: alive.y } : { x: game.seeker.x, y: game.seeker.y };
      zoom = this.baseZoom * 0.94;
    }
    if (!focus) focus = { x: 1000, y: 700 };
    const b = WORLD.bounds;
    const halfW = this.w / 2 / zoom;
    const halfH = this.h / 2 / zoom;
    let tx = focus.x;
    let ty = focus.y;
    tx = halfW * 2 > WORLD.w ? WORLD.w / 2 : clamp(tx, halfW - 80, WORLD.w - halfW + 80);
    ty = halfH * 2 > WORLD.h ? WORLD.h / 2 : clamp(ty, halfH - 60, WORLD.h - halfH + 60);
    this.camTarget.x = tx;
    this.camTarget.y = ty;
    this.camTarget.zoom = zoom;
    const k = 1 - Math.exp(-Math.min(dt, 0.05) * 5.5);
    this.cam.x = lerp(this.cam.x, this.camTarget.x, k);
    this.cam.y = lerp(this.cam.y, this.camTarget.y, k);
    this.cam.zoom = lerp(this.cam.zoom, this.camTarget.zoom, k);
    this.shake *= Math.exp(-Math.min(dt, 0.05) * 5);
    this.shakeX = this.shake ? (Math.random() - 0.5) * this.shake * 22 : 0;
    this.shakeY = this.shake ? (Math.random() - 0.5) * this.shake * 16 : 0;
  }

  draw(game, dt) {
    this.time += dt;
    this.updateCamera(game, dt);
    const ctx = this.ctx;
    const scale = this.dpr * this.cam.zoom;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#07100d';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(
      scale,
      0,
      0,
      scale,
      this.dpr * (this.w / 2 - this.cam.x * this.cam.zoom) + this.shakeX * this.dpr,
      this.dpr * (this.h / 2 - this.cam.y * this.cam.zoom) + this.shakeY * this.dpr,
    );

    this.drawWorldBackground(ctx, game);
    this.drawZoneShimmer(ctx, game);
    this.drawCone(ctx, game);
    this.drawEntities(ctx, game);
    this.drawGlowPass(ctx, game);
    this.drawFireflies(ctx, game);
    this.drawParticles(ctx, game);
    this.drawWorldUi(ctx, game);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (game.role === 'seeker' && game.screen === 'playing') this.drawFog(ctx, game);
    this.drawScreenGrade(ctx, game);
  }

  drawWorldBackground(ctx, game) {
    if (!this.worldCache) return;
    const halfW = this.w / 2 / this.cam.zoom + 30;
    const halfH = this.h / 2 / this.cam.zoom + 30;
    const sx = clamp(this.cam.x - halfW, 0, WORLD.w);
    const sy = clamp(this.cam.y - halfH, 0, WORLD.h);
    const sw = clamp(this.cam.x + halfW, 0, WORLD.w) - sx;
    const sh = clamp(this.cam.y + halfH, 0, WORLD.h) - sy;
    if (sw > 0 && sh > 0) ctx.drawImage(this.worldCache, sx, sy, sw, sh, sx, sy, sw, sh);
  }

  drawZoneShimmer(ctx, game) {
    // A handful of cheap moving highlights on top of the baked grove.
    const t = this.time;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const z of ZONES) {
      if (!this.inView(z.x, z.y, z.r)) continue;
      const pulse = 0.5 + Math.sin(t * 1.1 + z.index * 1.7) * 0.5;
      if (z.pattern === 'water') {
        ctx.strokeStyle = `rgba(175, 244, 234, ${0.055 + pulse * 0.05})`;
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
          const r = ((t * 17 + i * 74) % (z.r * 0.8)) + 8;
          ctx.beginPath();
          ctx.ellipse(z.x + Math.sin(i * 2.1) * z.r * 0.3, z.y + Math.cos(i * 1.3) * z.r * 0.22, r, r * 0.34, 0, 0, TAU);
          ctx.stroke();
        }
      } else if (z.pattern === 'ember') {
        ctx.globalAlpha = 0.05 + pulse * 0.05;
        ctx.drawImage(glowSprite(z.accent, 128), z.x - z.r, z.y - z.r * 0.7, z.r * 2, z.r * 1.4);
        ctx.globalAlpha = 1;
      } else if (z.pattern === 'glowcap') {
        ctx.globalAlpha = 0.035 + pulse * 0.04;
        ctx.drawImage(glowSprite('#d0abff', 128), z.x - z.r * 0.8, z.y - z.r * 0.7, z.r * 1.6, z.r * 1.4);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  drawGround(ctx, game) {
    ctx.fillStyle = GROUND_BASE;
    ctx.fillRect(-200, -200, WORLD.w + 400, WORLD.h + 400);
    const g = ctx.createRadialGradient(1000, 650, 120, 1000, 650, 1120);
    g.addColorStop(0, '#203b2b');
    g.addColorStop(0.46, '#173024');
    g.addColorStop(0.78, '#0f2119');
    g.addColorStop(1, '#08130f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WORLD.w, WORLD.h);

    for (const b of this.blobs) {
      const bg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      bg.addColorStop(0, rgba(b.c, b.a));
      bg.addColorStop(1, rgba(b.c, 0));
      ctx.fillStyle = bg;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(b.sx, 1);
      ctx.beginPath();
      ctx.arc(0, 0, b.r, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // Winding, half-overgrown deer paths.
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const path of this.paths) {
      ctx.beginPath();
      ctx.moveTo(path.pts[0].x, path.pts[0].y);
      for (let i = 1; i < path.pts.length - 1; i++) {
        const p = path.pts[i];
        const next = path.pts[i + 1];
        ctx.quadraticCurveTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2);
      }
      ctx.strokeStyle = 'rgba(77, 67, 47, 0.16)';
      ctx.lineWidth = path.w;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(143, 124, 83, 0.045)';
      ctx.lineWidth = path.w * 0.4;
      ctx.stroke();
    }
    ctx.restore();

    const pattern = ctx.createPattern(this.noise, 'repeat');
    ctx.save();
    ctx.globalAlpha = 0.075;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, WORLD.w, WORLD.h);
    ctx.restore();

    // Forest floor falls away at the clearing edge.
    const edge = ctx.createRadialGradient(1000, 650, 620, 1000, 650, 1160);
    edge.addColorStop(0, 'rgba(3, 8, 6, 0)');
    edge.addColorStop(0.74, 'rgba(3, 8, 6, 0.18)');
    edge.addColorStop(1, 'rgba(2, 5, 4, 0.72)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  }

  drawZones(ctx, game) {
    for (const zone of ZONES) {
      this.drawZone(ctx, zone, game);
    }
  }

  drawZone(ctx, zone, game) {
    const t = this.time;
    ctx.save();
    smoothClosedPath(ctx, zone.points);
    const grad = ctx.createRadialGradient(
      zone.x - zone.r * 0.22,
      zone.y - zone.r * 0.28,
      zone.r * 0.08,
      zone.x,
      zone.y,
      zone.r * 1.02,
    );
    grad.addColorStop(0, mixHex(zone.color, zone.accent, 0.34));
    grad.addColorStop(0.64, zone.color);
    grad.addColorStop(1, mixHex(zone.color, '#0a1510', 0.34));
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.clip();
    this.drawZonePattern(ctx, zone, t);
    // Mottled light across the patch.
    for (let i = 0; i < 4; i++) {
      const angle = t * 0.02 + i * 1.7 + zone.index;
      const lx = zone.x + Math.cos(angle) * zone.r * 0.4;
      const ly = zone.y + Math.sin(angle * 1.2) * zone.r * 0.32;
      const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, zone.r * 0.5);
      lg.addColorStop(0, rgba(zone.accent, 0.055));
      lg.addColorStop(1, rgba(zone.accent, 0));
      ctx.fillStyle = lg;
      ctx.fillRect(zone.x - zone.r, zone.y - zone.r, zone.r * 2, zone.r * 2);
    }
    ctx.restore();

    // Rim light and a soft dark lip.
    ctx.save();
    smoothClosedPath(ctx, zone.points);
    ctx.strokeStyle = rgba(zone.accent, 0.26);
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.translate(1.5, 3);
    smoothClosedPath(ctx, zone.points);
    ctx.strokeStyle = 'rgba(3, 9, 6, 0.22)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    if (zone.pattern === 'ember' || zone.pattern === 'glowcap' || zone.pattern === 'water') {
      const pulsing = 0.5 + Math.sin(t * 1.3 + zone.index) * 0.5;
      const col = zone.pattern === 'water' ? '#65b8b0' : zone.accent;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.12 + pulsing * 0.06;
      ctx.drawImage(
        glowSprite(col, 256),
        zone.x - zone.r * 1.3,
        zone.y - zone.r * 0.9,
        zone.r * 2.6,
        zone.r * 1.8,
      );
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // A quiet label, like a field guide annotation.
    const label = zone.name.toUpperCase().split('').join(' ');
    ctx.save();
    ctx.font = `500 ${Math.max(9, zone.r * 0.052)}px Outfit, sans-serif`;
    ctx.textAlign = 'center';
    ctx.letterSpacing = '1px';
    ctx.fillStyle = rgba(zone.accent, 0.38);
    ctx.fillText(label, zone.x, zone.labelY + 18);
    ctx.restore();
  }

  drawZonePattern(ctx, zone, t) {
    const d = zone.patternData;
    if (zone.pattern === 'moss') {
      ctx.lineCap = 'round';
      for (const s of d.strokes) {
        ctx.strokeStyle = rgba(
          s.tone > 0.5 ? '#b9e188' : '#2f522f',
          s.tone > 0.5 ? 0.24 : 0.34,
        );
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(zone.x + s.x, zone.y + s.y);
        const sway = Math.sin(t * 0.7 + s.x * 0.01) * 2;
        ctx.quadraticCurveTo(
          zone.x + s.x + Math.cos(s.lean) * s.len * 0.5 + sway,
          zone.y + s.y - s.len * 0.4,
          zone.x + s.x + Math.cos(s.lean) * s.len + sway,
          zone.y + s.y + Math.sin(s.lean) * s.len - s.len * 0.7,
        );
        ctx.stroke();
      }
      for (const s of d.specks) {
        ctx.fillStyle = rgba(s.tone > 0.5 ? '#c7ea93' : '#3f6437', 0.3);
        ellipse(ctx, zone.x + s.x, zone.y + s.y, s.size, s.size * 0.7, 0);
        ctx.fill();
      }
      for (const m of d.caps) {
        this.drawTinyMushroom(ctx, zone.x + m.x, zone.y + m.y, m.size, m.rot, m.kind);
      }
    } else if (zone.pattern === 'sand') {
      for (const ring of d.rings) {
        ctx.strokeStyle = rgba(ring.tone > 0.5 ? '#f4e2b4' : '#8a633d', 0.12 + ring.tone * 0.1);
        ctx.lineWidth = 1.2;
        ellipse(ctx, zone.x + ring.x, zone.y + ring.y, ring.rx, ring.ry, ring.rot);
        ctx.stroke();
      }
      for (const g of d.grains) {
        ctx.fillStyle = rgba(g.tone > 0.5 ? '#f2dca8' : '#765131', 0.2 + g.tone * 0.2);
        ctx.fillRect(zone.x + g.x, zone.y + g.y, g.size, g.size);
      }
      for (const s of d.specks) {
        ctx.fillStyle = rgba(s.tone > 0.5 ? '#f5e3b7' : '#8c6a45', 0.3);
        ellipse(ctx, zone.x + s.x, zone.y + s.y, s.size, s.size * 0.55, 0.2);
        ctx.fill();
      }
    } else if (zone.pattern === 'stone') {
      for (const slab of d.cracks) {
        ctx.beginPath();
        ctx.moveTo(zone.x + slab.pts[0].x, zone.y + slab.pts[0].y);
        for (let i = 1; i < slab.pts.length; i++) ctx.lineTo(zone.x + slab.pts[i].x, zone.y + slab.pts[i].y);
        ctx.closePath();
        ctx.fillStyle = rgba(slab.tone > 0.5 ? '#a7b2c2' : '#46515e', 0.08 + slab.tone * 0.06);
        ctx.fill();
        ctx.strokeStyle = 'rgba(30, 39, 46, 0.22)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      for (const ring of d.rings) {
        ctx.strokeStyle = 'rgba(207, 220, 234, 0.1)';
        ellipse(ctx, zone.x + ring.x, zone.y + ring.y, ring.rx, ring.ry, ring.rot);
        ctx.stroke();
      }
      for (const s of d.specks) {
        ctx.fillStyle = rgba(s.tone > 0.5 ? '#d0d8e4' : '#3b4652', 0.27);
        ellipse(ctx, zone.x + s.x, zone.y + s.y, s.size, s.size * 0.7, 0);
        ctx.fill();
      }
    } else if (zone.pattern === 'water') {
      for (const s of d.strokes) {
        ctx.strokeStyle = rgba('#b7f3ea', 0.11);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(zone.x + s.x, zone.y + s.y);
        ctx.lineTo(zone.x + s.x + Math.cos(s.lean) * s.len, zone.y + s.y + Math.sin(s.lean) * s.len);
        ctx.stroke();
      }
      for (const ring of d.rings) {
        const pulse = (Math.sin(t * 0.9 + ring.phase) + 1) / 2;
        ctx.strokeStyle = rgba('#a8f0e8', 0.08 + pulse * 0.14);
        ctx.lineWidth = 1.2;
        ellipse(
          ctx,
          zone.x + ring.x,
          zone.y + ring.y,
          ring.rx * (0.86 + pulse * 0.14),
          ring.ry * (0.86 + pulse * 0.14),
          ring.rot,
        );
        ctx.stroke();
      }
      for (const s of d.specks) {
        const twinkle = (Math.sin(t * 2.1 + s.phase) + 1) / 2;
        ctx.fillStyle = rgba('#d8fff8', 0.1 + twinkle * 0.35);
        ellipse(ctx, zone.x + s.x, zone.y + s.y, s.size * 0.8, s.size * 0.35, 0);
        ctx.fill();
      }
    } else if (zone.pattern === 'ember') {
      ctx.globalCompositeOperation = 'lighter';
      for (const crack of d.cracks) {
        ctx.beginPath();
        ctx.moveTo(zone.x + crack.pts[0].x, zone.y + crack.pts[0].y);
        for (let i = 1; i < crack.pts.length; i++) ctx.lineTo(zone.x + crack.pts[i].x, zone.y + crack.pts[i].y);
        const pulse = 0.55 + Math.sin(t * 1.7 + crack.pts[0].x) * 0.2;
        ctx.strokeStyle = rgba('#ff8b4f', 0.16 + crack.tone * 0.34 * pulse);
        ctx.lineWidth = crack.width;
        ctx.stroke();
        ctx.strokeStyle = rgba('#ffc07a', 0.12 + crack.tone * 0.22);
        ctx.lineWidth = crack.width * 0.35;
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      for (const ring of d.rings) {
        ctx.strokeStyle = 'rgba(58, 30, 21, 0.3)';
        ctx.lineWidth = 1.5;
        ellipse(ctx, zone.x + ring.x, zone.y + ring.y, ring.rx, ring.ry, ring.rot);
        ctx.stroke();
      }
      for (const s of d.specks) {
        const pulse = (Math.sin(t * 2 + s.phase) + 1) / 2;
        if (s.tone > 0.72) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = rgba('#ffb066', 0.2 + pulse * 0.5);
          ellipse(ctx, zone.x + s.x, zone.y + s.y, s.size, s.size * 0.8, 0);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        } else {
          ctx.fillStyle = rgba('#41241a', 0.38);
          ellipse(ctx, zone.x + s.x, zone.y + s.y, s.size, s.size * 0.7, 0);
          ctx.fill();
        }
      }
    } else if (zone.pattern === 'glowcap') {
      for (const ring of d.rings) {
        const pulse = (Math.sin(t * 1.2 + ring.phase) + 1) / 2;
        ctx.strokeStyle = rgba('#c79cff', 0.08 + pulse * 0.12);
        ctx.lineWidth = 1.4;
        ellipse(ctx, zone.x + ring.x, zone.y + ring.y, ring.rx, ring.ry, ring.rot);
        ctx.stroke();
      }
      for (const m of d.caps) {
        const col = mixHex('#8f68bb', '#e0b8ff', m.hue);
        ctx.save();
        ctx.translate(zone.x + m.x, zone.y + m.y);
        ctx.rotate(m.rot);
        ctx.shadowColor = rgba(col, 0.8);
        ctx.shadowBlur = 12;
        ctx.fillStyle = rgba(col, 0.72);
        ellipse(ctx, 0, 0, m.size, m.size * 0.56, 0);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = rgba('#f0d8ff', 0.7);
        ellipse(ctx, -m.size * 0.22, -m.size * 0.12, m.size * 0.16, m.size * 0.1, 0);
        ctx.fill();
        ctx.fillStyle = 'rgba(40, 25, 46, 0.42)';
        ctx.fillRect(-1, 0, 2, m.size * 0.8);
        ctx.restore();
      }
      for (const s of d.specks) {
        const pulse = (Math.sin(t * 1.4 + s.phase) + 1) / 2;
        ctx.fillStyle = rgba('#d4a7ff', 0.08 + pulse * 0.3);
        ellipse(ctx, zone.x + s.x, zone.y + s.y, s.size * 0.6, s.size * 0.6, 0);
        ctx.fill();
      }
    }
  }

  drawTinyMushroom(ctx, x, y, size, rot, kind) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = 'rgba(214, 180, 132, 0.45)';
    ctx.fillRect(-size * 0.08, -size * 0.2, size * 0.16, size * 0.6);
    ctx.fillStyle = kind === 1 ? 'rgba(239, 180, 111, 0.5)' : 'rgba(198, 148, 120, 0.46)';
    ellipse(ctx, 0, -size * 0.2, size * 0.42, size * 0.24, 0);
    ctx.fill();
    ctx.restore();
  }

  drawGroundDetails(ctx, game, broad = false) {
    for (const d of GROUND_DETAILS) {
      if (!broad && !this.inView(d.x, d.y, 80)) continue;
      const sway = Math.sin(this.time * 1.1 + d.phase) * 0.05;
      if (d.type === 'grass') {
        ctx.strokeStyle = rgba(d.tone > 0.5 ? '#4d7040' : '#2d4a31', 0.5);
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 3; i++) {
          const a = -1.45 + i * 0.26 + sway + d.rot * 0.15;
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.quadraticCurveTo(
            d.x + Math.cos(a) * 5 * d.scale,
            d.y + Math.sin(a) * 8 * d.scale,
            d.x + Math.cos(a) * 9 * d.scale,
            d.y + Math.sin(a) * 13 * d.scale,
          );
          ctx.stroke();
        }
      } else if (d.type === 'clover') {
        ctx.fillStyle = 'rgba(74, 112, 58, 0.55)';
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * TAU + d.rot;
          ellipse(ctx, d.x + Math.cos(a) * 2.4 * d.scale, d.y + Math.sin(a) * 2 * d.scale, 2.4 * d.scale, 1.8 * d.scale, a);
          ctx.fill();
        }
      } else if (d.type === 'pebble') {
        ctx.fillStyle = 'rgba(92, 100, 89, 0.55)';
        ellipse(ctx, d.x, d.y, 3.2 * d.scale, 2 * d.scale, d.rot);
        ctx.fill();
        ctx.fillStyle = 'rgba(171, 184, 163, 0.22)';
        ellipse(ctx, d.x - 0.7, d.y - 0.7, 1.4 * d.scale, 0.8 * d.scale, d.rot);
        ctx.fill();
      } else if (d.type === 'flower') {
        ctx.strokeStyle = 'rgba(88, 122, 79, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + sway * 6, d.y - 7 * d.scale);
        ctx.stroke();
        const col = d.tone > 0.5 ? '#f1d9a2' : '#cfd8ec';
        ctx.fillStyle = rgba(col, 0.55);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU + d.rot;
          ellipse(ctx, d.x + Math.cos(a) * 1.7 * d.scale + sway * 6, d.y - 7 * d.scale + Math.sin(a) * 1.4 * d.scale, 1.3 * d.scale, 1.1 * d.scale, a);
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(248, 218, 120, 0.7)';
        ellipse(ctx, d.x + sway * 6, d.y - 7 * d.scale, 1.1 * d.scale, 1.1 * d.scale, 0);
        ctx.fill();
      } else if (d.type === 'twig') {
        ctx.strokeStyle = 'rgba(77, 61, 43, 0.6)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(d.x - Math.cos(d.rot) * 6 * d.scale, d.y - Math.sin(d.rot) * 5 * d.scale);
        ctx.lineTo(d.x + Math.cos(d.rot) * 6 * d.scale, d.y + Math.sin(d.rot) * 5 * d.scale);
        ctx.stroke();
      }
    }
  }

  inView(x, y, margin = 120) {
    const halfW = this.w / 2 / this.cam.zoom + margin;
    const halfH = this.h / 2 / this.cam.zoom + margin;
    return Math.abs(x - this.cam.x) < halfW && Math.abs(y - this.cam.y) < halfH;
  }

  drawEntities(ctx, game) {
    const list = [];
    for (const o of OBSTACLES) {
      if (!this.inView(o.x, o.y, 220)) continue;
      list.push({ y: o.y, draw: () => this.drawCachedObstacle(ctx, o, game) });
    }
    for (const p of PROPS) {
      if (!this.inView(p.x, p.y, 150)) continue;
      list.push({ y: p.y, draw: () => this.drawCachedProp(ctx, p, game) });
    }
    for (const d of DECOR) {
      if (!this.inView(d.x, d.y, 120)) continue;
      list.push({ y: d.y, draw: () => this.drawCachedDecor(ctx, d) });
    }
    for (const t of TREES) {
      if (!this.inView(t.x, t.y, 280)) continue;
      list.push({ y: t.y, draw: () => this.drawCachedTree(ctx, t) });
    }
    for (const h of game.hiders) {
      if (h.caught) continue;
      if (!this.inView(h.x, h.y, 150)) continue;
      list.push({ y: h.y, draw: () => this.drawHider(ctx, h, game) });
    }
    if (this.inView(game.seeker.x, game.seeker.y, 180)) {
      list.push({ y: game.seeker.y, draw: () => this.drawSeeker(ctx, game.seeker, game) });
    }
    list.sort((a, b) => a.y - b.y);
    for (const item of list) item.draw();
  }

  drawCachedObstacle(ctx, o, game) {
    const padX = o.r * 1.7 + 22;
    const padTop = (o.tall ? o.height * 1.14 : o.r * 1.2) + 30;
    const bottom = 30;
    const sprite = this.cacheSprite(`stone:${o.id}`, padX * 2, padTop + bottom, padX, padTop, (c) => {
      c.translate(-o.x, -o.y);
      this.drawObstacle(c, o, { climbHint: null, playerHider: null });
    });
    ctx.drawImage(sprite.canvas, o.x - padX, o.y - padTop, sprite.w, sprite.h);
    if (game.climbHint === o || (game.playerHider && game.playerHider.climb?.obstacle === o)) {
      this.drawPromptMark(ctx, o.x, o.tall ? o.y - o.height - 12 : o.y - o.r - 44, 'C', 'climb');
    }
  }

  drawCachedProp(ctx, p, game) {
    const t = this.time;
    const s = p.scale;
    const padX = 82 * s;
    const padTop = 128 * s;
    const bottom = 32 * s;
    const sprite = this.cacheSprite(`prop:${p.id}`, padX * 2, padTop + bottom, padX, padTop, (c) => {
      const copy = { ...p, scanned: false };
      c.translate(-p.x, -p.y);
      if (p.type === 'rock') this.drawRockProp(c, copy);
      else if (p.type === 'mushroom') this.drawMushroomProp(c, copy);
      else if (p.type === 'fern') this.drawFernProp(c, copy);
      else if (p.type === 'crystal') this.drawCrystalProp(c, copy);
    });
    ctx.drawImage(sprite.canvas, p.x - padX, p.y - padTop, sprite.w, sprite.h);
    const near = game.playerHider && !game.playerHider.caught && dist(game.playerHider.x, game.playerHider.y, p.x, p.y) < 145;
    if (near) {
      const pulse = (Math.sin(t * 4) + 1) / 2;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.24 + pulse * 0.15;
      ctx.drawImage(glowSprite('#d9f08e', 128), p.x - 48, p.y - 92, 96, 96);
      ctx.restore();
      this.drawPromptMark(ctx, p.x, p.y - 96 * s, 'E', p.scanned ? 'pose' : 'mimic');
    }
    if (p.scanned) {
      if (p.type === 'fern') this.drawScanTick(ctx, p.x + 26, p.y - 66 * s);
      else if (p.type === 'mushroom') this.drawScanTick(ctx, p.x + 28, p.y - 100 * s);
      else if (p.type === 'crystal') this.drawScanTick(ctx, p.x + 28, p.y - 92 * s);
      else this.drawScanTick(ctx, p.x + 22, p.y - 50);
    }
  }

  drawCachedDecor(ctx, d) {
    const s = d.scale;
    const padX = 62 * s;
    const padTop = 70 * s;
    const bottom = 22 * s;
    const sprite = this.cacheSprite(`decor:${d.x}:${d.y}`, padX * 2, padTop + bottom, padX, padTop, (c) => {
      c.translate(-d.x, -d.y);
      this.drawDecor(c, d);
    });
    ctx.drawImage(sprite.canvas, d.x - padX, d.y - padTop, sprite.w, sprite.h);
  }

  drawCachedTree(ctx, t) {
    const s = t.scale;
    const padX = 92 * s;
    const padTop = 182 * s;
    const bottom = 32 * s;
    const sprite = this.cacheSprite(`tree:${t.seed}`, padX * 2, padTop + bottom, padX, padTop, (c) => {
      c.translate(-t.x, -t.y);
      this.drawTree(c, t);
    });
    ctx.drawImage(sprite.canvas, t.x - padX, t.y - padTop, sprite.w, sprite.h);
  }

  drawProp(ctx, p, game) {
    this.drawCachedProp(ctx, p, game);
  }

  drawRockProp(ctx, p) {
    const s = p.scale;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(2, 7, 4, 0.4)';
    ellipse(ctx, 0, 4, 30, 10, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-30, 0);
    ctx.lineTo(-31, -21);
    ctx.lineTo(-18, -39);
    ctx.lineTo(2, -47);
    ctx.lineTo(22, -38);
    ctx.lineTo(31, -16);
    ctx.lineTo(28, 2);
    ctx.lineTo(9, 7);
    ctx.lineTo(-15, 6);
    ctx.closePath();
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.clip();
    const g = ctx.createLinearGradient(-20, -45, 20, 4);
    g.addColorStop(0, rgba(p.accent, 0.35));
    g.addColorStop(0.45, rgba(p.accent, 0.05));
    g.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = g;
    ctx.fillRect(-36, -52, 72, 64);
    ctx.fillStyle = 'rgba(60, 92, 49, 0.5)';
    ellipse(ctx, -12, -41, 17, 6, -0.3);
    ctx.fill();
    ellipse(ctx, 15, -29, 11, 4, 0.2);
    ctx.fill();
    ctx.restore();
    if (p.scanned) this.drawScanTick(ctx, p.x + 22, p.y - 50);
  }

  drawMushroomProp(ctx, p) {
    const s = p.scale;
    const t = this.time;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(2, 7, 4, 0.38)';
    ellipse(ctx, 0, 3, 24, 8, 0);
    ctx.fill();
    ctx.fillStyle = '#d8c9a8';
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.quadraticCurveTo(-11, -30, -6, -48);
    ctx.lineTo(7, -48);
    ctx.quadraticCurveTo(12, -30, 8, 0);
    ctx.quadraticCurveTo(0, 4, -8, 0);
    ctx.fill();
    ctx.fillStyle = 'rgba(76, 58, 92, 0.5)';
    ctx.fillRect(-7, -20, 14, 3);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.moveTo(-38, -46);
    ctx.bezierCurveTo(-40, -76, -20, -90, 0, -90);
    ctx.bezierCurveTo(22, -90, 40, -74, 38, -46);
    ctx.quadraticCurveTo(18, -38, 0, -40);
    ctx.quadraticCurveTo(-18, -38, -38, -46);
    ctx.fill();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.3 + Math.sin(t * 1.1 + p.phase) * 0.08;
    ctx.drawImage(glowSprite(p.accent, 128), -58, -108, 116, 116);
    ctx.restore();
    ctx.fillStyle = rgba(p.accent, 0.85);
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + p.phase;
      ellipse(ctx, Math.cos(a) * 21, -68 + Math.sin(a) * 8, 3.4, 2.5, a);
      ctx.fill();
    }
    ctx.restore();
    if (p.scanned) this.drawScanTick(ctx, p.x + 28, p.y - 100 * s);
  }

  drawFernProp(ctx, p) {
    const s = p.scale;
    const t = this.time;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(2, 7, 4, 0.35)';
    ellipse(ctx, 0, 4, 30, 9, 0);
    ctx.fill();
    const fronds = [
      { a: -1.95, len: 34, w: 7 },
      { a: -1.55, len: 42, w: 8 },
      { a: -1.15, len: 36, w: 7 },
      { a: -0.7, len: 41, w: 8 },
      { a: -2.35, len: 29, w: 6 },
    ];
    for (let i = 0; i < fronds.length; i++) {
      const f = fronds[i];
      const a = f.a + Math.sin(t * 1.2 + p.phase + i) * 0.04;
      const tx = Math.cos(a) * f.len;
      const ty = Math.sin(a) * f.len - 8;
      const nx = Math.cos(a + Math.PI / 2) * f.w;
      const ny = Math.sin(a + Math.PI / 2) * f.w;
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.quadraticCurveTo(Math.cos(a) * f.len * 0.55 + nx, Math.sin(a) * f.len * 0.55 - 8 + ny, tx, ty);
      ctx.quadraticCurveTo(Math.cos(a) * f.len * 0.55 - nx, Math.sin(a) * f.len * 0.55 - 8 - ny, 0, -4);
      ctx.closePath();
      ctx.fillStyle = i % 2 ? p.color : mixHex(p.color, p.accent, 0.24);
      ctx.fill();
      ctx.strokeStyle = rgba(p.accent, 0.2);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.quadraticCurveTo(tx * 0.55, ty * 0.55, tx, ty);
      ctx.stroke();
    }
    ctx.restore();
    if (p.scanned) this.drawScanTick(ctx, p.x + 26, p.y - 66 * s);
  }

  drawCrystalProp(ctx, p) {
    const s = p.scale;
    const t = this.time;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(2, 7, 4, 0.4)';
    ellipse(ctx, 0, 4, 28, 9, 0);
    ctx.fill();
    const shards = [
      { x: -15, h: 56, w: 12, lean: -0.18 },
      { x: 4, h: 82, w: 14, lean: 0.06 },
      { x: 19, h: 48, w: 10, lean: 0.22 },
    ];
    for (let i = 0; i < shards.length; i++) {
      const sh = shards[i];
      ctx.save();
      ctx.translate(sh.x, 0);
      ctx.rotate(sh.lean);
      ctx.beginPath();
      ctx.moveTo(0, -sh.h);
      ctx.lineTo(sh.w, -sh.h * 0.72);
      ctx.lineTo(sh.w * 0.8, 0);
      ctx.lineTo(-sh.w * 0.8, 0);
      ctx.lineTo(-sh.w, -sh.h * 0.76);
      ctx.closePath();
      const g = ctx.createLinearGradient(-sh.w, -sh.h, sh.w, 0);
      g.addColorStop(0, mixHex(p.color, '#ffffff', 0.35));
      g.addColorStop(0.4, p.color);
      g.addColorStop(1, mixHex(p.color, '#12222b', 0.5));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.fillStyle = rgba(p.accent, 0.42);
      ctx.beginPath();
      ctx.moveTo(0, -sh.h + 6);
      ctx.lineTo(sh.w * 0.35, -sh.h * 0.55);
      ctx.lineTo(0, -sh.h * 0.2);
      ctx.lineTo(-sh.w * 0.24, -sh.h * 0.58);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.24 + Math.sin(t * 1.5 + p.phase) * 0.06;
    ctx.drawImage(glowSprite(p.accent, 160), -62, -108, 124, 124);
    ctx.restore();
    ctx.restore();
    if (p.scanned) this.drawScanTick(ctx, p.x + 28, p.y - 92 * s);
  }

  drawScanTick(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = 'rgba(207, 239, 170, 0.78)';
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(18, 32, 22, 0.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x - 3, y);
    ctx.lineTo(x - 0.5, y + 2.5);
    ctx.lineTo(x + 3.5, y - 2.5);
    ctx.stroke();
    ctx.restore();
  }

  drawObstacle(ctx, o, game) {
    const t = this.time;
    ctx.save();
    ctx.translate(o.x, o.y);
    if (o.tall) {
      ctx.fillStyle = 'rgba(2, 7, 4, 0.46)';
      ellipse(ctx, 6, 5, o.r * 1.35, o.r * 0.5, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-o.r * 0.95, 0);
      ctx.lineTo(-o.r * 0.85, -o.height * 0.76);
      ctx.lineTo(-o.r * 0.35, -o.height);
      ctx.lineTo(o.r * 0.45, -o.height * 0.94);
      ctx.lineTo(o.r * 0.9, -o.height * 0.55);
      ctx.lineTo(o.r * 0.85, 0);
      ctx.closePath();
      const g = ctx.createLinearGradient(-o.r, 0, o.r, -o.height);
      g.addColorStop(0, '#4c554d');
      g.addColorStop(0.45, o.color);
      g.addColorStop(0.75, '#8b9185');
      g.addColorStop(1, '#5e675d');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.save();
      ctx.clip();
      for (let i = 0; i < 5; i++) {
        const y = -o.height * (0.15 + i * 0.16);
        ctx.strokeStyle = 'rgba(40, 50, 43, 0.34)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(-o.r, y);
        ctx.lineTo(o.r, y - 8 + i * 3);
        ctx.stroke();
      }
      // Mossy ledge.
      ctx.fillStyle = 'rgba(82, 114, 63, 0.5)';
      ellipse(ctx, -o.r * 0.14, -o.height * 0.74, o.r * 0.72, o.r * 0.22, -0.2);
      ctx.fill();
      ellipse(ctx, o.r * 0.34, -o.height * 0.43, o.r * 0.3, o.r * 0.12, 0.3);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(196, 211, 183, 0.12)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-o.r * 0.8, -o.height * 0.67);
      ctx.lineTo(-o.r * 0.35, -o.height * 0.92);
      ctx.stroke();
      if (game.climbHint === o || (game.playerHider && game.playerHider.climb?.obstacle === o)) {
        this.drawPromptMark(ctx, 0, -o.height - 12, 'C', 'climb');
      }
    } else {
      ctx.fillStyle = 'rgba(2, 7, 4, 0.42)';
      ellipse(ctx, 5, 5, o.r * 1.18, o.r * 0.44, 0);
      ctx.fill();
      ctx.beginPath();
      const pts = o.points.map((p) => ({ x: p.x - o.x, y: p.y - o.y }));
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      const g = ctx.createLinearGradient(-o.r, -o.r, o.r, o.r);
      g.addColorStop(0, '#8a9185');
      g.addColorStop(0.35, '#737c70');
      g.addColorStop(0.72, '#5b655b');
      g.addColorStop(1, '#414c43');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = 'rgba(210, 222, 202, 0.1)';
      ellipse(ctx, -o.r * 0.22, -o.r * 0.5, o.r * 0.42, o.r * 0.2, -0.5);
      ctx.fill();
      for (const m of o.mossPatches) {
        ctx.fillStyle = 'rgba(73, 105, 58, 0.55)';
        ellipse(ctx, m.x, m.y, m.rx, m.ry, m.rot);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(40, 49, 41, 0.38)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-o.r * 0.4, -o.r * 0.7);
      ctx.lineTo(-o.r * 0.1, -o.r * 0.25);
      ctx.lineTo(o.r * 0.35, -o.r * 0.4);
      ctx.stroke();
      ctx.restore();
      if (game.climbHint === o || (game.playerHider && game.playerHider.climb?.obstacle === o)) {
        this.drawPromptMark(ctx, 0, -o.r - 44, 'C', 'climb');
      }
    }
    ctx.restore();
  }

  drawDecor(ctx, d) {
    const t = this.time;
    const sway = Math.sin(t * 1.1 + d.phase) * 0.04 + d.lean;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.scale(d.scale, d.scale);
    if (d.type === 'fern') {
      ctx.fillStyle = 'rgba(2, 7, 4, 0.32)';
      ellipse(ctx, 0, 3, 23, 7, 0);
      ctx.fill();
      for (let i = 0; i < 6; i++) {
        const a = -2.5 + i * 0.38 + sway;
        const len = 22 + (i % 3) * 6;
        ctx.beginPath();
        ctx.moveTo(0, -2);
        ctx.quadraticCurveTo(Math.cos(a) * len * 0.5, Math.sin(a) * len * 0.5 - 7, Math.cos(a) * len, Math.sin(a) * len - 4);
        ctx.strokeStyle = rgba(d.tone > 0.5 ? '#4f7a47' : '#2c4b31', 0.7);
        ctx.lineWidth = 2.1;
        ctx.stroke();
      }
    } else if (d.type === 'mushroom') {
      ctx.fillStyle = 'rgba(2, 7, 4, 0.3)';
      ellipse(ctx, 0, 3, 12, 4, 0);
      ctx.fill();
      ctx.fillStyle = 'rgba(214, 200, 170, 0.8)';
      ctx.fillRect(-2.6, -18, 5.2, 18);
      ctx.fillStyle = rgba(d.tone > 0.5 ? '#b28bd9' : '#8a6c9d', 0.9);
      ellipse(ctx, 0, -19, 13, 7.5, 0);
      ctx.fill();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.18;
      ctx.drawImage(glowSprite('#cda3ff', 64), -24, -38, 48, 48);
      ctx.restore();
    } else if (d.type === 'shrub') {
      ctx.fillStyle = 'rgba(2, 7, 4, 0.3)';
      ellipse(ctx, 0, 4, 24, 7, 0);
      ctx.fill();
      for (let i = 0; i < 5; i++) {
        const a = i * 1.3 + d.tone;
        ctx.fillStyle = rgba(i % 2 ? '#2c4d34' : '#3b6040', 0.8);
        ellipse(ctx, Math.cos(a) * 9, -10 + Math.sin(a) * 5, 14, 10, a);
        ctx.fill();
      }
    } else if (d.type === 'reed') {
      for (let i = 0; i < 4; i++) {
        const a = -1.4 + i * 0.16 + sway;
        ctx.strokeStyle = rgba(d.tone > 0.5 ? '#567d5b' : '#35544a', 0.7);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo((i - 1.5) * 3, 0);
        ctx.quadraticCurveTo(Math.cos(a) * 16, -24, Math.cos(a) * 26, -44);
        ctx.stroke();
      }
    } else if (d.type === 'rock') {
      ctx.fillStyle = 'rgba(2, 7, 4, 0.3)';
      ellipse(ctx, 0, 4, 14, 5, 0);
      ctx.fill();
      ctx.fillStyle = 'rgba(94, 101, 93, 0.8)';
      ellipse(ctx, 0, -3, 12, 9, d.rot);
      ctx.fill();
      ctx.fillStyle = 'rgba(179, 189, 173, 0.18)';
      ellipse(ctx, -3, -6, 5, 3, d.rot);
      ctx.fill();
    } else if (d.type === 'flower') {
      ctx.strokeStyle = 'rgba(96, 129, 82, 0.65)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(sway * 10, -12, sway * 14, -20);
      ctx.stroke();
      ctx.fillStyle = rgba(d.tone > 0.5 ? '#ffe3a1' : '#d7e0f2', 0.85);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        ellipse(ctx, sway * 14 + Math.cos(a) * 2.6, -21 + Math.sin(a) * 2.2, 2.3, 1.8, a);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawTree(ctx, t) {
    const s = t.scale;
    const leaf = t.hue > 0.5 ? '#1a3527' : '#163025';
    const leaf2 = t.hue > 0.5 ? '#254330' : '#1e3a2b';
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(2, 6, 4, 0.55)';
    ellipse(ctx, 8, 7, 50, 14, 0);
    ctx.fill();
    ctx.save();
    ctx.rotate(t.lean);
    ctx.fillStyle = '#2b251b';
    ctx.beginPath();
    ctx.moveTo(-7, 0);
    ctx.lineTo(-4, -62);
    ctx.lineTo(6, -62);
    ctx.lineTo(10, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(132, 112, 77, 0.15)';
    ctx.fillRect(-4, -58, 3, 50);
    // Canopy.
    const canopies = [
      { x: -18, y: -90, r: 38 },
      { x: 16, y: -96, r: 42 },
      { x: 0, y: -120, r: 46 },
      { x: -30, y: -118, r: 30 },
      { x: 31, y: -122, r: 29 },
    ];
    for (let i = 0; i < canopies.length; i++) {
      const c = canopies[i];
      ctx.fillStyle = i % 2 ? leaf : leaf2;
      ellipse(ctx, c.x, c.y, c.r, c.r * 0.82, t.phase + i * 0.7);
      ctx.fill();
    }
    // Moonlit rim on the upper left.
    ctx.strokeStyle = 'rgba(136, 174, 133, 0.16)';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(-14, -121, 43, 3.8, 5.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(25, -108, 37, 3.9, 5.1);
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  drawHider(ctx, h, game) {
    const t = this.time;
    const isPlayer = h.isPlayer;
    const camo = h.camo ?? 0;
    const climbing = h.mode === 'climb' && h.climb;
    const x = h.x;
    const y = h.y;
    if (!climbing) {
      ctx.save();
      ctx.fillStyle = `rgba(2, 7, 4, ${0.38 - camo * 0.08})`;
      const bb = shapeBBox(h.shape);
      ellipse(ctx, x, y + 3, Math.min(44, bb.w * 0.36), 8, 0);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    const morphScale = h.morphScale ?? 1;
    if (climbing) {
      const o = h.climb.obstacle;
      const height = o.height ?? 60;
      const lift = 18 + h.climb.height * height * 0.52;
      const nx = Math.cos(h.climb.angle);
      const ny = Math.sin(h.climb.angle);
      ctx.translate(x, y - lift);
      ctx.rotate(Math.atan2(ny, nx) * 0.12);
      ctx.scale(0.92 * morphScale, 0.74 * morphScale);
      // Cling shadow on the stone.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ellipse(ctx, 4, 8, 36, 14, 0);
      ctx.fill();
    } else {
      ctx.translate(x, y);
      ctx.scale(morphScale, morphScale);
    }

    traceShape(ctx, h.shape, t + h.phase);
    const bb = shapeBBox(h.shape);
    ctx.save();
    ctx.clip();
    const base = h.paintStats?.hex ?? '#5f8a47';
    const bodyGrad = ctx.createLinearGradient(0, bb.y, 0, 0);
    bodyGrad.addColorStop(0, shade(base, 0.16));
    bodyGrad.addColorStop(0.55, base);
    bodyGrad.addColorStop(1, shade(base, -0.24));
    ctx.fillStyle = bodyGrad;
    ctx.fillRect(bb.x - 2, bb.y - 2, bb.w + 4, bb.h + 4);
    if (h.paint) {
      ctx.globalAlpha = 0.94;
      ctx.drawImage(h.paint.canvas, bb.x, bb.y, bb.w, bb.h);
      ctx.globalAlpha = 1;
    }
    // Gloss and inner translucency.
    const gloss = ctx.createRadialGradient(
      bb.x + bb.w * 0.34,
      bb.y + bb.h * 0.24,
      0,
      bb.x + bb.w * 0.34,
      bb.y + bb.h * 0.24,
      Math.max(bb.w, bb.h) * 0.52,
    );
    gloss.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
    gloss.addColorStop(0.32, 'rgba(255, 255, 255, 0.07)');
    gloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gloss;
    ctx.fillRect(bb.x, bb.y, bb.w, bb.h);
    ctx.fillStyle = 'rgba(8, 20, 12, 0.22)';
    ellipse(ctx, bb.x + bb.w * 0.5, bb.y + bb.h * 0.93, bb.w * 0.3, bb.h * 0.06, 0);
    ctx.fill();
    ctx.restore();

    traceShape(ctx, h.shape, t + h.phase);
    ctx.strokeStyle = `rgba(8, 18, 12, ${0.38 - camo * 0.18})`;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Eyes.
    const e = shapeEyes(h.shape);
    const eyeAlpha = isPlayer ? 0.8 - camo * 0.28 : 0.62 - camo * 0.25;
    const blink = h.blink ?? 0;
    const lookX = clamp((h.lookX ?? 0) * 2.2, -2, 2);
    const lookY = clamp((h.lookY ?? 0) * 1.4, -1.5, 1.5);
    drawEyes(ctx, e.y, e.spread, e.size, eyeAlpha, blink, lookX, lookY, h.eyeColor ?? '#16211a');

    // A rare glint keeps AI hides findable without making them obvious.
    if (!isPlayer && h.camo < 0.9) {
      const pulse = (Math.sin(t * 2.4 + h.phase * 3) + 1) / 2;
      if (pulse > 0.86) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(230, 255, 220, 0.5)';
        ctx.beginPath();
        ctx.arc(bb.x + bb.w * 0.3, bb.y + bb.h * 0.3, 1.3, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();

    if (isPlayer) {
      this.drawCamoRing(ctx, h, game);
    }
    if (h.nervous && !h.caught) {
      this.drawPromptMark(ctx, x, y - shapeBBox(h.shape).h - 18, '!', 'alert');
    }
  }

  drawCamoRing(ctx, h, game) {
    const bb = shapeBBox(h.shape);
    const r = Math.max(bb.w * 0.52, 42);
    const y = h.mode === 'climb' ? h.y - 24 : h.y - bb.h * 0.38;
    const pct = h.camo ?? 0;
    const col = pct > 0.86 ? '#bdf28a' : pct > 0.62 ? '#f2d681' : '#f09a7a';
    ctx.save();
    ctx.translate(h.x, y);
    ctx.rotate(-Math.PI / 2);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(5, 12, 8, 0.42)';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = rgba(col, 0.85);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU * clamp(pct, 0.001, 1));
    ctx.stroke();
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = rgba(col, 0.9);
    ctx.font = '600 9px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(pct * 100)}`, 0, 3);
    ctx.restore();
  }

  drawSeeker(ctx, s, game) {
    const t = this.time;
    const isPlayer = s.isPlayer;
    const alert = s.state === 'chase';
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.fillStyle = 'rgba(2, 6, 4, 0.5)';
    ellipse(ctx, 4, 5, 30, 11, 0);
    ctx.fill();

    // A long, ink-dark cloak with a wet stone sheen.
    const cloak = ctx.createLinearGradient(0, -120, 0, 4);
    cloak.addColorStop(0, '#26332b');
    cloak.addColorStop(0.55, '#141e19');
    cloak.addColorStop(1, '#0b120f');
    ctx.fillStyle = cloak;
    ctx.beginPath();
    ctx.moveTo(-24, 0);
    ctx.quadraticCurveTo(-31, -45, -19, -74);
    ctx.quadraticCurveTo(-13, -98, 0, -102);
    ctx.quadraticCurveTo(16, -99, 22, -74);
    ctx.quadraticCurveTo(33, -43, 25, 0);
    ctx.quadraticCurveTo(0, 9, -24, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(150, 179, 146, 0.13)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Arms and the lantern staff.
    ctx.strokeStyle = '#111a15';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-15, -64);
    ctx.quadraticCurveTo(-31, -48, -28, -30);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(14, -66);
    ctx.quadraticCurveTo(30, -52, 28, -31);
    ctx.stroke();
    ctx.strokeStyle = '#2d261b';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(28, -26);
    ctx.lineTo(30, -94);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(214, 174, 111, 0.28)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(28.7, -26);
    ctx.lineTo(30.7, -94);
    ctx.stroke();

    // Hood and hat.
    ctx.fillStyle = '#1a2720';
    ctx.beginPath();
    ctx.ellipse(0, -96, 18, 20, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#0d1712';
    ctx.beginPath();
    ctx.ellipse(0, -109, 37, 9, -0.03, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-17, -111);
    ctx.quadraticCurveTo(-13, -132, 0, -138);
    ctx.quadraticCurveTo(14, -131, 18, -111);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(132, 160, 128, 0.22)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-29, -111);
    ctx.quadraticCurveTo(0, -120, 30, -111);
    ctx.stroke();

    // Antler silhouettes.
    ctx.strokeStyle = '#19231c';
    ctx.lineWidth = 2.2;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 7, -128);
      ctx.quadraticCurveTo(side * 19, -145, side * 28, -150);
      ctx.moveTo(side * 16, -138);
      ctx.lineTo(side * 30, -140);
      ctx.moveTo(side * 22, -145);
      ctx.lineTo(side * 36, -155);
      ctx.stroke();
    }

    // The eye.
    const eyeGlow = alert ? '#ff9a72' : '#f3c97a';
    const eyePulse = 0.7 + Math.sin(t * (alert ? 9 : 2.3)) * 0.3;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 + eyePulse * 0.25;
    ctx.drawImage(glowSprite(eyeGlow, 128), -22, -114, 44, 44);
    ctx.restore();
    ctx.fillStyle = eyeGlow;
    ctx.beginPath();
    ctx.ellipse(0, -101, 4.4, 2.7, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1a130b';
    ctx.fillRect(-0.8, -103, 1.6, 4);

    // Lantern.
    const lx = 30;
    const ly = -42;
    ctx.strokeStyle = 'rgba(31, 25, 17, 0.9)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(lx, ly - 10);
    ctx.lineTo(lx, ly + 4);
    ctx.stroke();
    ctx.fillStyle = '#2f2518';
    ctx.fillRect(lx - 6, ly + 4, 12, 16);
    ctx.fillStyle = alert ? 'rgba(255, 133, 90, 0.95)' : 'rgba(255, 213, 133, 0.96)';
    ctx.fillRect(lx - 4, ly + 6, 8, 11);
    ctx.strokeStyle = 'rgba(255, 235, 178, 0.55)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(lx - 5, ly + 5, 10, 13);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 + eyePulse * 0.16;
    ctx.drawImage(glowSprite(eyeGlow, 160), lx - 62, ly - 62, 124, 124);
    ctx.restore();

    if (isPlayer) {
      ctx.strokeStyle = 'rgba(222, 242, 200, 0.4)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, -44, 52, 0, TAU);
      ctx.stroke();
    }

    if (s.state === 'chase' || s.state === 'search') {
      this.drawPromptMark(ctx, 0, -176, '!', 'alert');
    } else if (s.state === 'suspicious') {
      this.drawPromptMark(ctx, 0, -176, '?', 'wonder');
    }
    ctx.restore();
  }

  drawCone(ctx, game) {
    const seekers = [];
    if (game.role === 'hider') seekers.push(game.seeker);
    else if (game.role === 'seeker' && game.screen === 'playing') seekers.push(game.seeker);
    for (const s of seekers) {
      const half = s.coneHalf ?? 0.58;
      const range = s.coneRange ?? 440;
      const angle = s.aimAngle ?? s.angle;
      const color = s.state === 'chase' ? '#ff966b' : s.state === 'suspicious' ? '#ffd07a' : '#f6df9d';
      const segments = 46;
      const pts = [{ x: s.x, y: s.y }];
      for (let i = 0; i <= segments; i++) {
        const a = angle - half + (i / segments) * half * 2;
        const d = rayCast(s.x, s.y, a, range, 3);
        pts.push({ x: s.x + Math.cos(a) * d, y: s.y + Math.sin(a) * d });
      }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(s.x, s.y - 34, 20, s.x, s.y - 34, range);
      g.addColorStop(0, rgba(color, 0.26));
      g.addColorStop(0.45, rgba(color, 0.1));
      g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.fill();
      // A softer inner beam.
      const g2 = ctx.createRadialGradient(s.x, s.y - 34, 10, s.x, s.y - 34, range * 0.72);
      g2.addColorStop(0, rgba(color, 0.16));
      g2.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - 34);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(lerp(s.x, pts[i].x, 0.72), lerp(s.y - 34, pts[i].y, 0.72));
      }
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = rgba(color, 0.13);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();

      // Dust suspended in the beam.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 14; i++) {
        const drift = (this.time * 5 + i * 23) % 1;
        const a = angle - half * 0.85 + ((i * 0.618) % 1) * half * 1.7;
        const d = 30 + drift * range * 0.92;
        const alpha = (1 - drift) * 0.28;
        ctx.fillStyle = rgba(color, alpha);
        ctx.beginPath();
        ctx.arc(s.x + Math.cos(a) * d, s.y - 30 + Math.sin(a) * d * 0.55, 0.8 + (i % 3) * 0.5, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawGlowPass(ctx, game) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Lantern light and other warm pools.
    if (this.inView(game.seeker.x, game.seeker.y, 200)) {
      ctx.globalAlpha = 0.22;
      ctx.drawImage(glowSprite('#ffd68e', 256), game.seeker.x - 130, game.seeker.y - 120, 260, 260);
    }
    for (const z of ZONES) {
      if (z.pattern !== 'ember' && z.pattern !== 'glowcap') continue;
      if (!this.inView(z.x, z.y, z.r)) continue;
      ctx.globalAlpha = 0.07;
      ctx.drawImage(glowSprite(z.accent, 256), z.x - z.r, z.y - z.r, z.r * 2, z.r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  drawFireflies(ctx, game) {
    const t = this.time;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const f of FIREFLIES) {
      if (!this.inView(f.x, f.y, 100)) continue;
      const x = f.x + Math.sin(t * f.speed + f.phase) * f.radius;
      const y = f.y + Math.cos(t * f.speed * 0.8 + f.phase * 1.4) * f.radius * 0.6;
      const pulse = 0.3 + (Math.sin(t * 1.7 + f.phase * 2.2) + 1) * 0.35;
      ctx.globalAlpha = pulse;
      const col = f.tone > 0.55 ? '#f3e6a3' : '#b7ebba';
      ctx.drawImage(glowSprite(col, 64), x - 14, y - 14, 28, 28);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, y, f.size * 0.6, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // Drifting mist at the edges.
    ctx.save();
    for (let i = 0; i < 5; i++) {
      const x = 260 + i * 380 + Math.sin(t * 0.03 + i) * 80;
      const y = 150 + (i % 2) * 900 + Math.cos(t * 0.025 + i * 2) * 60;
      ctx.globalAlpha = 0.028;
      ctx.drawImage(glowSprite('#a9c7ae', 256), x - 400, y - 300, 800, 600);
    }
    ctx.restore();
  }

  drawParticles(ctx, game) {
    ctx.save();
    for (const p of game.particles) {
      const life = p.life / p.maxLife;
      const alpha = clamp(life, 0, 1);
      if (p.type === 'glow') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha * (p.alpha ?? 0.6);
        const size = p.size * (1.5 - life * 0.5);
        ctx.drawImage(glowSprite(p.color, 64), p.x - size, p.y - size, size * 2, size * 2);
        ctx.globalCompositeOperation = 'source-over';
      } else if (p.type === 'dot') {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * life, 0, TAU);
        ctx.fill();
      } else if (p.type === 'ring') {
        ctx.globalAlpha = alpha * 0.7;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.width ?? 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - life) + (p.start ?? 10), 0, TAU);
        ctx.stroke();
      } else if (p.type === 'text') {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.font = `600 ${p.size}px Outfit, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(p.text, p.x, p.y - (1 - life) * 30);
      } else if (p.type === 'splat') {
        ctx.globalAlpha = alpha * 0.8;
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ellipse(ctx, 0, 0, p.size * (1.2 - life * 0.2), p.size * 0.55, 0);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawWorldUi(ctx, game) {
    // Scan pings and hider suspicion markers are drawn above the fog.
    for (const ping of game.pings ?? []) {
      const life = clamp(ping.life / ping.maxLife, 0, 1);
      const pulse = (Math.sin(this.time * 8 + ping.id) + 1) / 2;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = life * (0.45 + pulse * 0.2);
      ctx.drawImage(glowSprite('#dfb6ff', 96), ping.x - 36, ping.y - 54, 72, 72);
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = `rgba(236, 213, 255, ${life * 0.8})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ping.x, ping.y - 48);
      ctx.lineTo(ping.x + 8, ping.y - 38);
      ctx.lineTo(ping.x, ping.y - 28);
      ctx.lineTo(ping.x - 8, ping.y - 38);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = `rgba(236, 213, 255, ${life * 0.65})`;
      ctx.font = '600 9px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(ping.label ?? '?', ping.x, ping.y - 57);
      ctx.restore();
    }

    if (game.role === 'seeker') {
      for (const h of game.hiders) {
        if (h.caught) continue;
        if (h.reveal > 0) {
          const a = clamp(h.reveal / 1.8, 0, 1);
          ctx.save();
          ctx.strokeStyle = `rgba(255, 180, 132, ${a * 0.9})`;
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 5]);
          ctx.beginPath();
          ctx.arc(h.x, h.y - 28, 40 + Math.sin(this.time * 4) * 3, 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = `rgba(255, 212, 172, ${a})`;
          ctx.font = '600 10px Outfit, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('SUSPECT', h.x, h.y - 78);
          ctx.restore();
        }
      }
      // Scan wave.
      if (game.scanWave) {
        const s = game.scanWave;
        const life = clamp(s.life / s.maxLife, 0, 1);
        ctx.save();
        ctx.strokeStyle = `rgba(207, 239, 170, ${life * 0.65})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius * (1 - life), 0, TAU);
        ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = life * 0.2;
        ctx.drawImage(
          glowSprite('#cdf0a8', 256),
          s.x - s.radius * (1 - life),
          s.y - s.radius * (1 - life),
          s.radius * (1 - life) * 2,
          s.radius * (1 - life) * 2,
        );
        ctx.restore();
      }
    }

    if (game.role === 'hider' && game.playerHider && !game.playerHider.caught) {
      const h = game.playerHider;
      if (game.nearScan && !h.climb) {
        this.drawPromptBubble(ctx, game.nearScan.prop.x, game.nearScan.prop.y - 110, game.nearScan.shape, game.nearScan.prop.scanned);
      }
    }

    if (game.playerHider?.caught) {
      // A little memorial ripple where the player vanished.
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = 'rgba(216, 241, 174, 0.5)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(game.playerHider.x, game.playerHider.y, 22, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawPromptMark(ctx, x, y, key, label) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(9, 18, 12, 0.78)';
    ctx.strokeStyle = 'rgba(207, 239, 170, 0.62)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(-9, -9, 18, 18, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#dff4b9';
    ctx.font = '600 10px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(key, 0, 0.5);
    if (label) {
      ctx.fillStyle = 'rgba(223, 244, 185, 0.75)';
      ctx.font = '500 8px Outfit, sans-serif';
      ctx.fillText(label.toUpperCase(), 0, 18);
    }
    ctx.restore();
  }

  drawPromptBubble(ctx, x, y, shape, scanned) {
    const label = scanned ? 'MIMIC' : 'COPY';
    ctx.save();
    ctx.fillStyle = 'rgba(8, 17, 11, 0.72)';
    ctx.strokeStyle = 'rgba(207, 239, 170, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x - 29, y - 12, 58, 20, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(225, 246, 192, 0.9)';
    ctx.font = '600 9px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`E · ${label} ${shape.toUpperCase()}`, x, y - 1);
    ctx.restore();
  }

  drawFog(ctx, game) {
    const f = this.fogCtx;
    const w = this.w * this.dpr;
    const h = this.h * this.dpr;
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.clearRect(0, 0, w, h);
    f.fillStyle = 'rgba(2, 7, 5, 0.74)';
    f.fillRect(0, 0, w, h);
    f.globalCompositeOperation = 'destination-out';
    const p = this.screenPos(game.seeker.x, game.seeker.y - 32);
    const px = p.x * this.dpr;
    const py = p.y * this.dpr;
    const rad = 330 * this.cam.zoom * this.dpr;
    const g = f.createRadialGradient(px, py, rad * 0.12, px, py, rad);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.9)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    f.fillStyle = g;
    f.beginPath();
    f.arc(px, py, rad, 0, TAU);
    f.fill();

    // The forward beam cuts a longer hole in the dark.
    const s = game.seeker;
    const half = s.coneHalf ?? 0.58;
    const range = (s.coneRange ?? 440) * 1.05;
    const pts = [{ x: s.x, y: s.y }];
    for (let i = 0; i <= 40; i++) {
      const a = s.aimAngle - half + (i / 40) * half * 2;
      const d = rayCast(s.x, s.y, a, range, 3);
      pts.push({ x: s.x + Math.cos(a) * d, y: s.y + Math.sin(a) * d });
    }
    f.save();
    f.beginPath();
    const sp = this.screenPos(pts[0].x, pts[0].y);
    f.moveTo(sp.x * this.dpr, sp.y * this.dpr);
    for (let i = 1; i < pts.length; i++) {
      const q = this.screenPos(pts[i].x, pts[i].y);
      f.lineTo(q.x * this.dpr, q.y * this.dpr);
    }
    f.closePath();
    f.clip();
    const beam = f.createRadialGradient(px, py, 20, px, py, range * this.cam.zoom * this.dpr);
    beam.addColorStop(0, 'rgba(0,0,0,1)');
    beam.addColorStop(0.65, 'rgba(0,0,0,0.82)');
    beam.addColorStop(1, 'rgba(0,0,0,0)');
    f.fillStyle = beam;
    f.fillRect(0, 0, w, h);
    f.restore();
    f.globalCompositeOperation = 'source-over';

    ctx.drawImage(this.fog, 0, 0);
    // Warm up the lantern after the darkness.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.2;
    const gl = this.screenPos(s.x + 26, s.y - 62);
    const size = 220 * this.cam.zoom * this.dpr;
    ctx.drawImage(glowSprite('#ffd58f', 256), gl.x * this.dpr - size / 2, gl.y * this.dpr - size / 2, size, size);
    ctx.restore();
  }

  drawScreenGrade(ctx, game) {
    // A barely-there green-black grade and edge falloff.
    const w = this.canvas.width;
    const h = this.canvas.height;
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.72);
    g.addColorStop(0, 'rgba(4, 12, 8, 0)');
    g.addColorStop(0.7, 'rgba(3, 9, 6, 0.12)');
    g.addColorStop(1, 'rgba(1, 4, 3, 0.48)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}

function drawEyes(ctx, eyeY, spread, size, alpha, blink, lookX, lookY, color) {
  if (alpha <= 0.02) return;
  const open = 1 - clamp(blink, 0, 1);
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  for (const side of [-1, 1]) {
    const x = side * spread;
    const y = eyeY;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, size, Math.max(0.4, size * 0.72 * open), 0, 0, TAU);
    ctx.fill();
    if (open > 0.3) {
      ctx.fillStyle = 'rgba(240, 255, 230, 0.9)';
      ctx.beginPath();
      ctx.arc(x - size * 0.28 + lookX * 0.35, y - size * 0.3 + lookY * 0.2, size * 0.28, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}
