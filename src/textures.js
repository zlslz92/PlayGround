import * as THREE from 'three';
import { makeCanvasTexture, seeded } from './utils.js';

function noise(ctx, s, colors, count, rnd, size = [1, 3]) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
    const r = size[0] + rnd() * (size[1] - size[0]);
    ctx.beginPath();
    ctx.ellipse(rnd() * s, rnd() * s, r, r * (0.4 + rnd()), rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function makeGrassTexture(anisotropy = 4) {
  const tex = makeCanvasTexture(512, (ctx, s) => {
    const rnd = seeded(7);
    ctx.fillStyle = '#5c853f';
    ctx.fillRect(0, 0, s, s);
    // large soft tonal patches
    for (let i = 0; i < 26; i++) {
      const x = rnd() * s, y = rnd() * s, r = 40 + rnd() * 110;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const light = rnd() > 0.5;
      g.addColorStop(0, light ? 'rgba(126,164,82,0.4)' : 'rgba(70,108,54,0.38)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    noise(ctx, s, ['#527a39', '#6a9448', '#7ba454', '#486d33'], 1400, rnd, [0.6, 2.4]);
    // blades
    for (let i = 0; i < 2400; i++) {
      const x = rnd() * s, y = rnd() * s, h = 2 + rnd() * 5;
      ctx.strokeStyle = ['#456c32', '#6a9347', '#83ac5d', '#557f3c'][Math.floor(rnd() * 4)];
      ctx.globalAlpha = 0.4 + rnd() * 0.4;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + (rnd() - 0.5) * 3, y - h * 0.6, x + (rnd() - 0.5) * 4, y - h);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // tiny flowers
    const flower = ['#f4efd7', '#f2d98a', '#e7b6c6', '#d9e8f2'];
    for (let i = 0; i < 46; i++) {
      ctx.fillStyle = flower[Math.floor(rnd() * flower.length)];
      ctx.beginPath();
      ctx.arc(rnd() * s, rnd() * s, 1.2 + rnd() * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    // gentle vignette-like variation
    const v = ctx.createLinearGradient(0, 0, s, s);
    v.addColorStop(0, 'rgba(255,255,220,0.05)');
    v.addColorStop(1, 'rgba(20,50,20,0.09)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, s, s);
  }, { repeat: 1 });
  tex.anisotropy = anisotropy;
  return tex;
}

export function makeStoneTexture(anisotropy = 4) {
  const tex = makeCanvasTexture(512, (ctx, s) => {
    const rnd = seeded(23);
    ctx.fillStyle = '#7f8274';
    ctx.fillRect(0, 0, s, s);
    const cell = 64;
    for (let gy = 0; gy < s / cell; gy++) {
      for (let gx = 0; gx < s / cell; gx++) {
        const x = gx * cell + (rnd() - 0.5) * 6;
        const y = gy * cell + (rnd() - 0.5) * 6;
        const w = cell - 6 - rnd() * 5, h = cell - 6 - rnd() * 5;
        const tone = 158 + Math.floor(rnd() * 42);
        ctx.fillStyle = `rgb(${tone},${tone + 3},${tone - 12})`;
        ctx.beginPath();
        const rr = 6 + rnd() * 5;
        ctx.roundRect(x + 3, y + 3, w, h, rr);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,240,0.12)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    noise(ctx, s, ['#6f7264', '#9b9e8c', '#8a8d7c', '#b1b39f'], 900, rnd, [0.5, 2.2]);
    // moss in grout
    for (let i = 0; i < 120; i++) {
      ctx.fillStyle = `rgba(${86 + rnd() * 30},${112 + rnd() * 26},${58 + rnd() * 20},0.55)`;
      ctx.beginPath();
      ctx.arc(rnd() * s, rnd() * s, 1 + rnd() * 4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  tex.anisotropy = anisotropy;
  return tex;
}

export function makeDirtTexture(anisotropy = 4) {
  const tex = makeCanvasTexture(512, (ctx, s) => {
    const rnd = seeded(41);
    ctx.fillStyle = '#a9835a';
    ctx.fillRect(0, 0, s, s);
    noise(ctx, s, ['#98744e', '#b89367', '#8e6b46', '#c2a075'], 2000, rnd, [0.6, 3]);
    for (let i = 0; i < 240; i++) {
      ctx.fillStyle = ['#7c7a6c', '#8f8b7a', '#b9b2a0'][Math.floor(rnd() * 3)];
      ctx.beginPath();
      ctx.ellipse(rnd() * s, rnd() * s, 0.8 + rnd() * 2.2, 0.6 + rnd() * 1.6, rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // faint wheel ruts
    ctx.strokeStyle = 'rgba(110,80,50,0.18)';
    for (let i = 0; i < 4; i++) {
      ctx.lineWidth = 4 + rnd() * 8;
      ctx.beginPath();
      ctx.moveTo(0, 40 + i * 120 + rnd() * 20);
      ctx.bezierCurveTo(s * 0.3, 80 + i * 120, s * 0.7, 10 + i * 120, s, 60 + i * 120);
      ctx.stroke();
    }
  });
  tex.anisotropy = anisotropy;
  return tex;
}

export function makeDressTexture() {
  const tex = makeCanvasTexture(256, (ctx, s) => {
    const rnd = seeded(5);
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, '#6b8a35');
    g.addColorStop(1, '#54702b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    // leaf motifs
    for (let i = 0; i < 16; i++) {
      const x = (i % 4) * 64 + 32 + (rnd() - 0.5) * 14;
      const y = Math.floor(i / 4) * 64 + 32 + (rnd() - 0.5) * 14;
      const a = rnd() * Math.PI * 2;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.scale(0.8 + rnd() * 0.5, 0.8 + rnd() * 0.5);
      ctx.fillStyle = i % 3 === 0 ? 'rgba(40,63,21,0.55)' : 'rgba(133,163,78,0.5)';
      ctx.beginPath();
      ctx.moveTo(0, -22);
      ctx.bezierCurveTo(16, -12, 15, 12, 0, 24);
      ctx.bezierCurveTo(-15, 12, -16, -12, 0, -22);
      ctx.fill();
      ctx.strokeStyle = 'rgba(214,196,120,0.65)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, -20);
      ctx.lineTo(0, 20);
      for (let v = -14; v < 18; v += 8) {
        ctx.moveTo(0, v);
        ctx.lineTo(9, v - 5);
        ctx.moveTo(0, v);
        ctx.lineTo(-9, v - 5);
      }
      ctx.stroke();
      ctx.restore();
    }
    // subtle fabric weave
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < s; i += 4) {
      ctx.fillStyle = i % 8 ? '#fff8d0' : '#20300e';
      ctx.fillRect(i, 0, 1, s);
    }
    ctx.globalAlpha = 1;
  });
  tex.repeat.set(2, 1.4);
  return tex;
}

export function makeLeatherTexture() {
  const tex = makeCanvasTexture(128, (ctx, s) => {
    const rnd = seeded(11);
    ctx.fillStyle = '#7b5736';
    ctx.fillRect(0, 0, s, s);
    noise(ctx, s, ['#6a492d', '#8a6440', '#94704a', '#5e4027'], 500, rnd, [0.8, 3.2]);
    ctx.strokeStyle = 'rgba(228,201,144,0.35)';
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.4;
    ctx.strokeRect(8, 8, s - 16, s - 16);
    ctx.setLineDash([]);
  });
  return tex;
}

export function makeWoodTexture() {
  const tex = makeCanvasTexture(256, (ctx, s) => {
    const rnd = seeded(17);
    ctx.fillStyle = '#8a5f3a';
    ctx.fillRect(0, 0, s, s);
    for (let p = 0; p < 4; p++) {
      const y = p * 64;
      ctx.fillStyle = p % 2 ? '#906541' : '#835935';
      ctx.fillRect(0, y + 2, s, 60);
      ctx.strokeStyle = 'rgba(60,35,18,0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, y + 1);
      ctx.lineTo(s, y + 1);
      ctx.stroke();
      for (let i = 0; i < 9; i++) {
        ctx.strokeStyle = `rgba(72,44,24,${0.12 + rnd() * 0.2})`;
        ctx.lineWidth = 1 + rnd() * 1.6;
        ctx.beginPath();
        const yy = y + 8 + rnd() * 46;
        ctx.moveTo(0, yy);
        ctx.bezierCurveTo(s * 0.3, yy + 3, s * 0.7, yy - 3, s, yy + 2);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(55,35,18,0.6)';
      ctx.beginPath();
      ctx.arc(40 + rnd() * 170, y + 26 + rnd() * 16, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  tex.repeat.set(2, 2);
  return tex;
}

export function makeThatchTexture() {
  const tex = makeCanvasTexture(256, (ctx, s) => {
    const rnd = seeded(29);
    ctx.fillStyle = '#4d6a32';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 90; i++) {
      ctx.strokeStyle = ['#3e5828', '#5d7d3a', '#6f9144', '#47632e'][Math.floor(rnd() * 4)];
      ctx.lineWidth = 2 + rnd() * 3;
      ctx.beginPath();
      const x = rnd() * s, y = rnd() * s;
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 8, y + 16, x + 4 + rnd() * 10, y + 34);
      ctx.stroke();
    }
    for (let i = 0; i < 24; i++) {
      ctx.fillStyle = 'rgba(188,184,105,0.28)';
      ctx.beginPath();
      ctx.ellipse(rnd() * s, rnd() * s, 5 + rnd() * 12, 2 + rnd() * 4, rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  tex.repeat.set(2, 2);
  return tex;
}

export function makeBarkTexture() {
  const tex = makeCanvasTexture(256, (ctx, s) => {
    const rnd = seeded(31);
    ctx.fillStyle = '#6a4f36';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 60; i++) {
      ctx.strokeStyle = `rgba(${40 + rnd() * 40},${30 + rnd() * 30},${18 + rnd() * 20},${0.3 + rnd() * 0.4})`;
      ctx.lineWidth = 1 + rnd() * 3;
      const x = rnd() * s;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + 8, s * 0.3, x - 8, s * 0.7, x + 4, s);
      ctx.stroke();
    }
    for (let i = 0; i < 24; i++) {
      ctx.fillStyle = 'rgba(104,128,72,0.32)';
      ctx.beginPath();
      ctx.ellipse(rnd() * s, rnd() * s, 3 + rnd() * 7, 2 + rnd() * 4, rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  tex.repeat.set(1, 2);
  return tex;
}

export function makePetalTexture() {
  return makeCanvasTexture(64, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(s / 2, s / 2, s * 0.22, s * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
  }, { srgb: false });
}

export function makeWindowTexture() {
  return makeCanvasTexture(128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
    g.addColorStop(0, '#ffe9a6');
    g.addColorStop(0.55, '#e8b65c');
    g.addColorStop(1, '#9c6a32');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#5a3a22';
    ctx.lineWidth = 8;
    ctx.strokeRect(2, 2, s - 4, s - 4);
    ctx.beginPath();
    ctx.moveTo(s / 2, 0);
    ctx.lineTo(s / 2, s);
    ctx.moveTo(0, s / 2);
    ctx.lineTo(s, s / 2);
    ctx.stroke();
  });
}
