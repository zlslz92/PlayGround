import * as THREE from 'three';

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const TAU = Math.PI * 2;
export function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * t;
}
export function dampAngle(a, b, lambda, dt) {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * (1 - Math.exp(-lambda * dt));
}

export function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

let gradientMap = null;
export function getGradientMap() {
  if (gradientMap) return gradientMap;
  const steps = new Uint8Array([72, 132, 196, 240, 255]);
  gradientMap = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.generateMipmaps = false;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

export function toon(color, opts = {}) {
  const mat = new THREE.MeshToonMaterial({
    color,
    gradientMap: getGradientMap(),
    ...opts,
  });
  return mat;
}

export function standard(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...opts });
}

export function makeCanvasTexture(size, draw, { repeat = 1, srgb = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  return tex;
}

export function addOutline(mesh, scale = 1.05, color = 0x2a241c) {
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  const outline = new THREE.Mesh(mesh.geometry, mat);
  outline.scale.copy(mesh.scale).multiplyScalar(scale);
  outline.position.copy(mesh.position);
  outline.rotation.copy(mesh.rotation);
  outline.renderOrder = (mesh.renderOrder || 0) - 1;
  mesh.parent.add(outline);
  return outline;
}

// Rounded leaf shape used for pauldrons, skirt panels and decoration.
export function leafShape(width = 0.5, length = 1) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(width * 0.55, length * 0.18, width * 0.5, length * 0.62, 0, length);
  s.bezierCurveTo(-width * 0.5, length * 0.62, -width * 0.55, length * 0.18, 0, 0);
  return s;
}

export function leafGeometry(width = 0.5, length = 1, depth = 0.012) {
  const geo = new THREE.ExtrudeGeometry(leafShape(width, length), {
    depth,
    bevelEnabled: true,
    bevelSize: 0.008,
    bevelThickness: 0.006,
    bevelSegments: 1,
    curveSegments: 8,
  });
  geo.center();
  return geo;
}

export function radialTexture(size = 128, inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  return makeCanvasTexture(size, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, inner);
    g.addColorStop(0.55, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }, { srgb: false });
}

export function softPatchTexture(size = 128) {
  return makeCanvasTexture(size, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.12, s / 2, s / 2, s * 0.5);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }, { srgb: false });
}

export function disposeGroup(group) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (m.map) m.map.dispose();
        m.dispose();
      });
    }
  });
}

export function setShadow(obj, cast = true, receive = true) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
}
