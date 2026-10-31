/* The grove: terrain, landmarks, decorations and sight-line helpers. */

import {
  TAU,
  clamp,
  dist,
  lerp,
  makeRng,
  mixHex,
  rgba,
  shade,
} from './utils.js';

export const WORLD = {
  w: 2000,
  h: 1300,
  bounds: { minX: 130, maxX: 1870, minY: 150, maxY: 1170 },
};

export const SHAPES = [
  {
    id: 'blob',
    name: 'Blob',
    hint: 'The honest slime',
    speed: 1,
    start: true,
    icon: 'M12 20c-6 0-9-4-9-9 0-4 3-8 7-8 3 0 4 2 7 2 4 0 6 3 6 7 0 5-5 8-11 8Z',
  },
  {
    id: 'pool',
    name: 'Pool',
    hint: 'Flat and wide',
    speed: 0.82,
    start: true,
    icon: 'M4 15c2-4 7-6 12-5 4 1 6 3 5 5-1 3-6 4-11 3-4 0-7-1-6-3Z',
  },
  {
    id: 'mound',
    name: 'Mound',
    hint: 'Round and tall',
    speed: 0.9,
    start: true,
    icon: 'M12 4c5 0 8 5 9 10 1 5-3 8-9 8s-10-3-9-8c1-5 4-10 9-10Z',
  },
  {
    id: 'fern',
    name: 'Fern',
    hint: 'Lobed and leafy',
    speed: 1.02,
    icon: 'M10 21c-5-2-7-7-4-11 1-2 4-3 6-2 1-4 7-5 9-1 2 3 1 6-1 8 4 1 4 5 1 7-3 2-8 1-11-1Z',
  },
  {
    id: 'rock',
    name: 'Rock',
    hint: 'Heavy and still',
    speed: 0.76,
    icon: 'M5 17 3 9l5-6 8 1 5 6-3 8-7 2-6-3Z',
  },
  {
    id: 'mushroom',
    name: 'Mushroom',
    hint: 'Cap and stem',
    speed: 0.88,
    icon: 'M4 12c0-5 4-9 8-9s8 4 8 9H4Zm5 1h6l1 8H8l1-8Z',
  },
  {
    id: 'crystal',
    name: 'Crystal',
    hint: 'Sharp and bright',
    speed: 0.84,
    icon: 'M12 2 19 9l-3 12H8L5 9l7-7Z',
  },
  {
    id: 'wall',
    name: 'Cling',
    hint: 'Pressed to stone',
    speed: 0,
    hidden: true,
    icon: 'M4 8c2-3 5-4 8-3 3-1 6 0 8 3 1 3-1 6-4 7-3 1-7 1-10-1-3-1-3-4-2-6Z',
  },
];

export const COLORS = [
  { name: 'Fern', hex: '#5f8a47' },
  { name: 'Dune', hex: '#c9a76a' },
  { name: 'Slate', hex: '#7f8a9b' },
  { name: 'Tide', hex: '#3f8088' },
  { name: 'Ember', hex: '#a65f43' },
  { name: 'Gloam', hex: '#8060a8' },
  { name: 'Shadow', hex: '#3b4d55' },
  { name: 'Bone', hex: '#d5c6a4' },
];

const ZONE_DATA = [
  {
    id: 'fern',
    name: 'Fern Hollow',
    x: 415,
    y: 775,
    r: 218,
    color: '#5f8a47',
    accent: '#a8d56f',
    pattern: 'moss',
    shape: 'fern',
    groundStd: 0.2,
    note: 'Soft, springy and full of tiny secrets.',
  },
  {
    id: 'dune',
    name: 'Amber Dune',
    x: 1025,
    y: 312,
    r: 196,
    color: '#c9a76a',
    accent: '#f2d79b',
    pattern: 'sand',
    shape: 'mound',
    groundStd: 0.12,
    note: 'Warm sand, cold night. A comfortable lie.',
  },
  {
    id: 'moonstone',
    name: 'Moonstone Shelf',
    x: 1618,
    y: 552,
    r: 202,
    color: '#7f8a9b',
    accent: '#cbd5e4',
    pattern: 'stone',
    shape: 'crystal',
    groundStd: 0.14,
    note: 'Old stone that remembers the shape of rain.',
  },
  {
    id: 'tide',
    name: 'Tidal Pool',
    x: 1375,
    y: 1043,
    r: 238,
    color: '#3f8088',
    accent: '#82d8d0',
    pattern: 'water',
    shape: 'pool',
    groundStd: 0.08,
    note: 'Still water. An excellent mirror.',
  },
  {
    id: 'ember',
    name: 'Ember Scar',
    x: 725,
    y: 1082,
    r: 184,
    color: '#a65f43',
    accent: '#ffa66f',
    pattern: 'ember',
    shape: 'rock',
    groundStd: 0.22,
    note: 'The ground here never quite went to sleep.',
  },
  {
    id: 'glowcap',
    name: 'Glowcap Ring',
    x: 322,
    y: 312,
    r: 182,
    color: '#8060a8',
    accent: '#d0abff',
    pattern: 'glowcap',
    shape: 'mushroom',
    groundStd: 0.16,
    note: 'Mushrooms whispering in ultraviolet.',
  },
];

export const ZONES = ZONE_DATA.map((z, i) => ({
  ...z,
  index: i,
  points: [],
  rim: [],
  patternData: {},
  labelY: z.y + z.r * 0.72,
}));

export const OBSTACLES = [
  { x: 760, y: 560, r: 56, seed: 11, moss: 0.72, height: 58 },
  { x: 1250, y: 760, r: 84, seed: 27, moss: 0.5, height: 78 },
  { x: 1650, y: 850, r: 66, seed: 43, moss: 0.62, height: 66 },
  { x: 1000, y: 990, r: 58, seed: 58, moss: 0.42, height: 54 },
  { x: 590, y: 450, r: 48, seed: 71, moss: 0.8, height: 52 },
  { x: 1480, y: 280, r: 48, seed: 86, moss: 0.55, height: 54 },
  { x: 1138, y: 612, r: 34, seed: 93, moss: 0.35, height: 132, tall: true },
  { x: 890, y: 930, r: 32, seed: 104, moss: 0.6, height: 116, tall: true },
].map((o, i) => ({
  ...o,
  id: `stone-${i}`,
  kind: 'stone',
  name: o.tall ? 'Standing stone' : 'Mossy boulder',
  shape: 'rock',
  climbable: true,
  color: o.tall ? '#767c71' : '#6f766c',
  accent: '#9aa08f',
  points: [],
  mossPatches: [],
}));

export const PATROL = [
  { x: 1000, y: 690 },
  { x: 1235, y: 565 },
  { x: 1410, y: 705 },
  { x: 1500, y: 925 },
  { x: 1215, y: 1030 },
  { x: 1000, y: 915 },
  { x: 820, y: 1080 },
  { x: 640, y: 870 },
  { x: 600, y: 665 },
  { x: 770, y: 445 },
  { x: 1060, y: 425 },
];

/** Small, scannable landmarks. Touching one teaches the slime its shape. */
export const PROPS = [
  { id: 'fern-a', type: 'fern', shape: 'fern', x: 848, y: 812, scale: 1.2, rot: -0.2, color: '#5f8a47', accent: '#a2cf6d' },
  { id: 'fern-b', type: 'fern', shape: 'fern', x: 330, y: 908, scale: 1.45, rot: 0.7, color: '#557d40', accent: '#91bc5d' },
  { id: 'fern-c', type: 'fern', shape: 'fern', x: 528, y: 702, scale: 1.1, rot: 2.1, color: '#688f4c', accent: '#aed77d' },
  { id: 'fern-d', type: 'fern', shape: 'fern', x: 1700, y: 208, scale: 1.1, rot: 1.1, color: '#577d42', accent: '#9ac567' },
  { id: 'rock-a', type: 'rock', shape: 'rock', x: 952, y: 566, scale: 0.92, rot: 0.3, color: '#747a70', accent: '#9aa092' },
  { id: 'rock-b', type: 'rock', shape: 'rock', x: 548, y: 1018, scale: 1.05, rot: 1.4, color: '#7b7569', accent: '#a49b88' },
  { id: 'rock-c', type: 'rock', shape: 'rock', x: 1752, y: 1040, scale: 1.14, rot: 2.4, color: '#6e756d', accent: '#91998e' },
  { id: 'mushroom-a', type: 'mushroom', shape: 'mushroom', x: 262, y: 242, scale: 1.15, rot: 0.2, color: '#6e4a91', accent: '#c79cf2' },
  { id: 'mushroom-b', type: 'mushroom', shape: 'mushroom', x: 414, y: 410, scale: 0.92, rot: 1.7, color: '#5f4587', accent: '#b48ae4' },
  { id: 'mushroom-c', type: 'mushroom', shape: 'mushroom', x: 1450, y: 1146, scale: 1.25, rot: 2.8, color: '#735196', accent: '#cf9fff' },
  { id: 'crystal-a', type: 'crystal', shape: 'crystal', x: 1748, y: 470, scale: 1.2, rot: 0.5, color: '#5f7c9f', accent: '#a9dbff' },
  { id: 'crystal-b', type: 'crystal', shape: 'crystal', x: 1532, y: 636, scale: 0.95, rot: 1.9, color: '#6f86a6', accent: '#c1e6ff' },
  { id: 'crystal-c', type: 'crystal', shape: 'crystal', x: 982, y: 204, scale: 0.88, rot: 2.2, color: '#637f9c', accent: '#a9d7ff' },
].map((p, i) => ({ ...p, index: i, phase: i * 1.7, scanned: false }));

export const DECOR = [];
export const TREES = [];
export const GROUND_DETAILS = [];
export const FIREFLIES = [];

function blobPoints(rng, radius, count = 24, irregularity = 0.13, rx = 1, ry = 1) {
  const pts = [];
  const phases = Array.from({ length: 4 }, () => rng.range(0, TAU));
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU;
    const wobble =
      Math.sin(a * 2 + phases[0]) * 0.5 +
      Math.sin(a * 3 + phases[1]) * 0.3 +
      Math.sin(a * 5 + phases[2]) * 0.2;
    const r = radius * (1 + wobble * irregularity);
    pts.push({ x: Math.cos(a) * r * rx, y: Math.sin(a) * r * ry, a });
  }
  return pts;
}

function insideEllipse(rng, radius, ySquash = 0.92) {
  const a = rng.range(0, TAU);
  const d = Math.sqrt(rng()) * radius * 0.94;
  return { x: Math.cos(a) * d, y: Math.sin(a) * d * ySquash, a };
}

function makeZonePattern(zone, rng) {
  const r = zone.r;
  const data = { specks: [], strokes: [], rings: [], caps: [], cracks: [], grains: [] };
  if (zone.pattern === 'moss') {
    for (let i = 0; i < 96; i++) {
      const p = insideEllipse(rng, r);
      data.strokes.push({
        ...p,
        len: rng.range(5, 17),
        lean: rng.range(-0.65, 0.65),
        tone: rng.pick([0.16, 0.24, 0.32, 0.1]),
      });
    }
    for (let i = 0; i < 34; i++) {
      const p = insideEllipse(rng, r);
      data.specks.push({ ...p, size: rng.range(1.2, 3.4), tone: rng.range(0, 1) });
    }
    for (let i = 0; i < 12; i++) {
      const p = insideEllipse(rng, r * 0.8);
      data.caps.push({ ...p, size: rng.range(3, 7), rot: rng.range(-0.4, 0.4), kind: rng.int(0, 2) });
    }
  } else if (zone.pattern === 'sand') {
    for (let i = 0; i < 150; i++) {
      const p = insideEllipse(rng, r);
      data.grains.push({ ...p, size: rng.range(0.6, 1.8), tone: rng.range(0, 1) });
    }
    for (let i = 0; i < 16; i++) {
      const p = insideEllipse(rng, r);
      data.rings.push({
        x: p.x,
        y: p.y,
        rx: rng.range(35, 110),
        ry: rng.range(6, 16),
        rot: rng.range(-0.5, 0.5),
        tone: rng.range(0, 1),
      });
    }
    for (let i = 0; i < 16; i++) {
      const p = insideEllipse(rng, r * 0.9);
      data.specks.push({ ...p, size: rng.range(1.4, 3.2), tone: rng.range(0, 1) });
    }
  } else if (zone.pattern === 'stone') {
    for (let i = 0; i < 22; i++) {
      const p = insideEllipse(rng, r * 0.94);
      const size = rng.range(16, 42);
      const sides = rng.int(4, 6);
      const pts = [];
      for (let s = 0; s < sides; s++) {
        const a = (s / sides) * TAU + rng.range(-0.18, 0.18);
        pts.push({ x: p.x + Math.cos(a) * size * rng.range(0.7, 1.2), y: p.y + Math.sin(a) * size * rng.range(0.5, 0.9) });
      }
      data.cracks.push({ pts, tone: rng.range(0.4, 1) });
    }
    for (let i = 0; i < 90; i++) {
      const p = insideEllipse(rng, r);
      data.specks.push({ ...p, size: rng.range(0.7, 2.4), tone: rng.range(0, 1) });
    }
    for (let i = 0; i < 9; i++) {
      const p = insideEllipse(rng, r * 0.6);
      data.rings.push({ x: p.x, y: p.y, rx: rng.range(22, 70), ry: rng.range(8, 22), rot: rng.range(-0.9, 0.9), tone: rng.range(0, 1) });
    }
  } else if (zone.pattern === 'water') {
    for (let i = 0; i < 20; i++) {
      const p = insideEllipse(rng, r);
      data.rings.push({
        x: p.x,
        y: p.y,
        rx: rng.range(28, 120),
        ry: rng.range(6, 20),
        rot: rng.range(-0.35, 0.35),
        phase: rng.range(0, TAU),
        tone: rng.range(0, 1),
      });
    }
    for (let i = 0; i < 45; i++) {
      const p = insideEllipse(rng, r);
      data.specks.push({ ...p, size: rng.range(1, 3.6), tone: rng.range(0, 1), phase: rng.range(0, TAU) });
    }
    for (let i = 0; i < 13; i++) {
      const p = insideEllipse(rng, r * 0.85);
      data.strokes.push({ ...p, len: rng.range(12, 36), lean: rng.range(-0.2, 0.2), tone: rng.range(0, 1) });
    }
  } else if (zone.pattern === 'ember') {
    for (let i = 0; i < 18; i++) {
      const start = insideEllipse(rng, r * 0.9);
      const pts = [{ x: start.x, y: start.y }];
      let x = start.x;
      let y = start.y;
      const steps = rng.int(3, 6);
      for (let s = 0; s < steps; s++) {
        x += rng.range(-55, 55);
        y += rng.range(-34, 34);
        pts.push({ x, y });
      }
      data.cracks.push({ pts, tone: rng.range(0.45, 1), width: rng.range(1, 2.6) });
    }
    for (let i = 0; i < 70; i++) {
      const p = insideEllipse(rng, r);
      data.specks.push({ ...p, size: rng.range(0.8, 2.8), tone: rng.range(0, 1), phase: rng.range(0, TAU) });
    }
    for (let i = 0; i < 10; i++) {
      const p = insideEllipse(rng, r * 0.8);
      data.rings.push({ x: p.x, y: p.y, rx: rng.range(24, 64), ry: rng.range(10, 26), rot: rng.range(-0.8, 0.8), tone: rng.range(0, 1) });
    }
  } else if (zone.pattern === 'glowcap') {
    for (let i = 0; i < 24; i++) {
      const p = insideEllipse(rng, r * 0.9);
      data.caps.push({
        ...p,
        size: rng.range(5, 16),
        rot: rng.range(-0.5, 0.5),
        hue: rng.range(0, 1),
      });
    }
    for (let i = 0; i < 9; i++) {
      const p = insideEllipse(rng, r * 0.72);
      data.rings.push({ x: p.x, y: p.y, rx: rng.range(30, 85), ry: rng.range(9, 27), rot: rng.range(-0.6, 0.6), phase: rng.range(0, TAU), tone: rng.range(0, 1) });
    }
    for (let i = 0; i < 42; i++) {
      const p = insideEllipse(rng, r);
      data.specks.push({ ...p, size: rng.range(0.8, 2.8), tone: rng.range(0, 1), phase: rng.range(0, TAU) });
    }
  }
  return data;
}

function buildWorld() {
  ZONES.forEach((zone, i) => {
    const rng = makeRng(9151 + i * 137);
    zone.points = blobPoints(rng, zone.r, 30, 0.11).map((p) => ({ x: zone.x + p.x, y: zone.y + p.y }));
    zone.inner = blobPoints(rng, zone.r * 0.84, 26, 0.14).map((p) => ({ x: zone.x + p.x, y: zone.y + p.y }));
    zone.patternData = makeZonePattern(zone, rng);
  });

  OBSTACLES.forEach((o) => {
    const rng = makeRng(o.seed * 977);
    o.points = blobPoints(rng, o.r, 16, 0.16, 1, 0.86).map((p) => ({ x: o.x + p.x, y: o.y + p.y }));
    for (let i = 0; i < 5; i++) {
      const p = insideEllipse(rng, o.r * 0.8, 0.7);
      o.mossPatches.push({ ...p, rx: rng.range(o.r * 0.18, o.r * 0.42), ry: rng.range(o.r * 0.08, o.r * 0.2), rot: rng.range(-0.4, 0.4) });
    }
  });

  // Ground-level detail: painted before characters.
  const rng = makeRng(44121);
  const nearObstacle = (x, y, pad = 10) => OBSTACLES.some((o) => dist(x, y, o.x, o.y) < o.r + pad);
  const nearSpawn = (x, y, pad = 90) => dist(x, y, 1000, 690) < pad;
  const nearZoneCenter = (x, y, factor = 0.5) => ZONES.some((z) => dist(x, y, z.x, z.y) < z.r * factor);

  for (let i = 0; i < 150; i++) {
    const x = rng.range(140, 1860);
    const y = rng.range(160, 1160);
    if (nearObstacle(x, y, 16) || nearSpawn(x, y, 60)) continue;
    GROUND_DETAILS.push({
      type: rng.pick(['grass', 'grass', 'grass', 'clover', 'pebble', 'flower', 'twig']),
      x,
      y,
      scale: rng.range(0.55, 1.45),
      phase: rng.range(0, TAU),
      tone: rng.range(0, 1),
      rot: rng.range(0, TAU),
    });
  }

  const tallTypes = ['fern', 'fern', 'mushroom', 'shrub', 'reed', 'rock', 'flower'];
  for (let i = 0; i < 62; i++) {
    const x = rng.range(145, 1855);
    const y = rng.range(175, 1140);
    if (nearObstacle(x, y, 30) || nearSpawn(x, y, 70) || nearZoneCenter(x, y, 0.45)) continue;
    const type = rng.pick(tallTypes);
    DECOR.push({
      type,
      x,
      y,
      scale: rng.range(0.7, 1.5),
      phase: rng.range(0, TAU),
      tone: rng.range(0, 1),
      lean: rng.range(-0.25, 0.25),
      rot: rng.range(0, TAU),
      layer: 'tall',
    });
  }

  // A few tall reeds hugging the water's edge.
  const tide = ZONES.find((z) => z.id === 'tide');
  for (let i = 0; i < 16; i++) {
    const a = rng.range(0, TAU);
    const d = tide.r * rng.range(0.78, 1.08);
    DECOR.push({
      type: rng.pick(['reed', 'reed', 'fern']),
      x: tide.x + Math.cos(a) * d,
      y: tide.y + Math.sin(a) * d * 0.72,
      scale: rng.range(0.8, 1.35),
      phase: rng.range(0, TAU),
      tone: rng.range(0, 1),
      lean: rng.range(-0.2, 0.2),
      rot: rng.range(0, TAU),
      layer: 'tall',
    });
  }

  // Tree ring. Trees beyond the clearing, with a handful leaning in.
  const treePositions = [];
  const edge = 165;
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * TAU + rng.range(-0.045, 0.045);
    const rad = rng.range(0.94, 1.16);
    const x = 1000 + Math.cos(a) * 1110 * rad;
    const y = 650 + Math.sin(a) * 720 * rad;
    treePositions.push({ x, y });
  }
  for (let i = 0; i < 13; i++) {
    const side = rng.int(0, 3);
    let x;
    let y;
    if (side === 0) {
      x = rng.range(120, 1880);
      y = rng.range(90, edge);
    } else if (side === 1) {
      x = rng.range(120, 1880);
      y = rng.range(WORLD.h - edge + 20, WORLD.h - 10);
    } else if (side === 2) {
      x = rng.range(20, edge);
      y = rng.range(120, 1180);
    } else {
      x = rng.range(WORLD.w - edge, WORLD.w - 10);
      y = rng.range(120, 1180);
    }
    treePositions.push({ x, y });
  }
  treePositions.forEach((p, i) => {
    const r = makeRng(700 + i * 31);
    TREES.push({
      x: p.x,
      y: p.y,
      scale: r.range(0.85, 1.55),
      lean: r.range(-0.17, 0.17),
      hue: r.range(0, 1),
      phase: r.range(0, TAU),
      seed: i,
    });
  });

  for (let i = 0; i < 54; i++) {
    FIREFLIES.push({
      x: rng.range(100, 1900),
      y: rng.range(120, 1200),
      phase: rng.range(0, TAU),
      radius: rng.range(16, 80),
      speed: rng.range(0.08, 0.28),
      size: rng.range(0.9, 2.2),
      tone: rng.range(0, 1),
    });
  }
}

buildWorld();

export function zoneAt(x, y) {
  for (const zone of ZONES) {
    if (dist(x, y, zone.x, zone.y) < zone.r * 0.91) return zone;
  }
  return null;
}

export function zoneDistance(zone, x, y) {
  return dist(zone.x, zone.y, x, y);
}

export function nearestZone(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const z of ZONES) {
    const d = dist(x, y, z.x, z.y);
    if (d < bestD) {
      bestD = d;
      best = z;
    }
  }
  return best;
}

export function nearestProp(x, y, maxDist = 120) {
  let best = null;
  let bestD = maxDist;
  for (const p of PROPS) {
    const d = dist(x, y, p.x, p.y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

export function nearestPropOfShape(x, y, shape, maxDist = 135) {
  let best = null;
  let bestD = maxDist;
  for (const p of PROPS) {
    if (p.shape !== shape) continue;
    const d = dist(x, y, p.x, p.y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  for (const o of OBSTACLES) {
    if (shape !== 'rock') continue;
    const d = dist(x, y, o.x, o.y);
    if (d < bestD + o.r * 0.4) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

export function scannableNear(x, y, reach = 104) {
  let best = null;
  let bestD = reach;
  for (const p of PROPS) {
    const d = dist(x, y, p.x, p.y) - 18 * p.scale;
    if (d < bestD) {
      bestD = d;
      best = { kind: 'prop', prop: p, shape: p.shape, name: p.type, d };
    }
  }
  for (const o of OBSTACLES) {
    const d = dist(x, y, o.x, o.y) - o.r;
    if (d < bestD) {
      bestD = d;
      best = { kind: 'stone', prop: o, shape: 'rock', name: o.tall ? 'standing stone' : 'boulder', d };
    }
  }
  return best;
}

export function climbableNear(x, y, reach = 66) {
  let best = null;
  let bestD = reach;
  for (const o of OBSTACLES) {
    if (!o.climbable) continue;
    const d = dist(x, y, o.x, o.y) - o.r;
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

export function propTargetColor(shape, fallback = '#516b4f') {
  const p = PROPS.find((item) => item.shape === shape);
  if (!p) return fallback;
  return mixHex(p.color, p.accent, 0.16);
}

export function groundTarget(x, y, wall = null) {
  if (wall) {
    return {
      color: mixHex('#6e756b', '#5c7a4b', 0.34),
      std: 0.19,
      name: wall.tall ? 'Standing stone' : 'Mossy boulder',
      pattern: 'stone',
      shape: 'wall',
    };
  }
  const zone = zoneAt(x, y);
  if (zone) {
    return {
      color: mixHex(zone.color, zone.accent, 0.13),
      std: zone.groundStd,
      name: zone.name,
      pattern: zone.pattern,
      shape: zone.shape,
      zone,
    };
  }
  return {
    color: '#1c3326',
    std: 0.06,
    name: 'Open glade',
    pattern: 'glade',
    shape: null,
    zone: null,
  };
}

export function rayCast(x, y, angle, maxDist = 2000, inflate = 0) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let nearest = maxDist;
  for (const o of OBSTACLES) {
    const r = o.r + inflate;
    const ox = x - o.x;
    const oy = y - o.y;
    const b = ox * dx + oy * dy;
    const c = ox * ox + oy * oy - r * r;
    const disc = b * b - c;
    if (disc < 0) continue;
    const root = Math.sqrt(disc);
    const t = -b - root;
    if (t > 0 && t < nearest) nearest = t;
  }
  return nearest;
}

export function segmentBlocked(x1, y1, x2, y2, inflate = 0) {
  const d = dist(x1, y1, x2, y2);
  if (d < 0.001) return false;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const hit = rayCast(x1, y1, angle, d, inflate);
  return hit < d - 0.5;
}

export function collideObstacles(x, y, radius) {
  let px = x;
  let py = y;
  for (const o of OBSTACLES) {
    const d = dist(px, py, o.x, o.y);
    const min = o.r + radius;
    if (d < min && d > 0.0001) {
      const push = (min - d) / d;
      px += (px - o.x) * push;
      py += (py - o.y) * push;
    }
  }
  return { x: px, y: py };
}

export function clampToWorld(x, y, radius = 0) {
  const b = WORLD.bounds;
  return {
    x: clamp(x, b.minX + radius, b.maxX - radius),
    y: clamp(y, b.minY + radius, b.maxY - radius),
  };
}

export function lineOfSight(x1, y1, x2, y2) {
  return !segmentBlocked(x1, y1, x2, y2, 2);
}

export function safeSpotAround(x, y, rng = Math.random) {
  for (let i = 0; i < 40; i++) {
    const a = rng() * TAU;
    const d = 130 + rng() * 220;
    const p = clampToWorld(x + Math.cos(a) * d, y + Math.sin(a) * d, 30);
    if (OBSTACLES.some((o) => dist(p.x, p.y, o.x, o.y) < o.r + 44)) continue;
    return p;
  }
  return { x: 1000, y: 690 };
}

export const ZONE_BY_ID = Object.fromEntries(ZONES.map((z) => [z.id, z]));

export function zoneFill(zone, time = 0) {
  // Kept here so UI hints and the canvas share the same base tones.
  return mixHex(zone.color, zone.accent, 0.18 + Math.sin(time * 0.0002) * 0.02);
}

export { rgba, shade, lerp };
