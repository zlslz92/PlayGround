import * as THREE from 'three';
import { rand, radialTexture } from './utils.js';

class Pool {
  constructor(scene, capacity, additive = false) {
    this.scene = scene;
    this.capacity = capacity;
    this.particles = [];
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: {
        uMap: { value: radialTexture(64) },
      },
      vertexShader: /* glsl */`
        attribute float size;
        attribute vec3 aColor;
        varying vec3 vColor;
        void main() {
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (10.0 / max(0.1, -mv.z));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap;
        varying vec3 vColor;
        void main() {
          vec4 tex = texture2D(uMap, gl_PointCoord);
          if (tex.a < 0.03) discard;
          gl_FragColor = vec4(vColor, tex.a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  spawn(pos, color, opts = {}) {
    if (this.particles.length >= this.capacity) this.particles.shift();
    this.particles.push({
      pos: pos.clone(),
      vel: new THREE.Vector3(
        rand(-1, 1) * (opts.spread ?? 2),
        (opts.up ?? 2.5) + rand(-0.5, 1) * (opts.spread ?? 2),
        rand(-1, 1) * (opts.spread ?? 2)
      ).add(opts.velocity ? opts.velocity.clone() : new THREE.Vector3()),
      life: 0,
      max: (opts.life ?? 0.8) * rand(0.7, 1.2),
      size: (opts.size ?? 10) * rand(0.6, 1.35),
      color: new THREE.Color(color),
      gravity: opts.gravity ?? 7,
      drag: opts.drag ?? 1.2,
    });
  }

  update(dt) {
    const alive = [];
    let i = 0;
    for (const p of this.particles) {
      p.life += dt;
      if (p.life >= p.max) continue;
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0.03) {
        p.pos.y = 0.03;
        p.vel.set(p.vel.x * 0.4, Math.abs(p.vel.y) * 0.22, p.vel.z * 0.4);
      }
      const k = 1 - p.life / p.max;
      this.positions[i * 3] = p.pos.x;
      this.positions[i * 3 + 1] = p.pos.y;
      this.positions[i * 3 + 2] = p.pos.z;
      this.colors[i * 3] = p.color.r;
      this.colors[i * 3 + 1] = p.color.g;
      this.colors[i * 3 + 2] = p.color.b;
      this.sizes[i] = p.size * (0.4 + k * 0.8);
      alive.push(p);
      i++;
    }
    this.particles = alive;
    for (let j = i; j < this.capacity; j++) this.sizes[j] = 0;
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aColor.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
  }

  clear() {
    this.particles = [];
    this.sizes.fill(0);
    this.geometry.attributes.size.needsUpdate = true;
  }
}

export function createEffects(scene) {
  const splat = new Pool(scene, 900, false);
  const sparkle = new Pool(scene, 500, true);

  function catchBurst(pos, color) {
    const c = new THREE.Color(color);
    for (let i = 0; i < 34; i++) {
      splat.spawn(pos, i % 4 === 0 ? 0xf6f0d2 : c, {
        spread: 3.6, up: 3.2, size: 14, life: 1.1, gravity: 9, drag: 1.4,
      });
    }
    for (let i = 0; i < 18; i++) {
      sparkle.spawn(pos, i % 2 ? 0xffdc86 : 0xeaffc0, {
        spread: 2.4, up: 3.4, size: 8, life: 0.9, gravity: 3, drag: 2.1,
      });
    }
  }

  function groundPuff(pos, color = 0xd8c9a4) {
    for (let i = 0; i < 9; i++) {
      splat.spawn(pos, color, { spread: 1.2, up: 1.2, size: 7, life: 0.55, gravity: 2.5, drag: 2.2 });
    }
  }

  function focusSparkle(pos) {
    sparkle.spawn(pos, 0xffe8a2, { spread: 0.8, up: 0.9, size: 4, life: 0.7, gravity: -0.5, drag: 1.4 });
  }

  function victory(pos) {
    for (let i = 0; i < 4; i++) {
      const p = pos.clone().add(new THREE.Vector3(rand(-2, 2), rand(1.5, 3), rand(-2, 2)));
      for (let j = 0; j < 16; j++) {
        sparkle.spawn(p, [0xffd873, 0xdff5a1, 0xfff6d8][j % 3], {
          spread: 3, up: 3.5, size: 9, life: 1.6, gravity: 2.2, drag: 0.9,
        });
      }
    }
  }

  return {
    catchBurst, groundPuff, focusSparkle, victory,
    update(dt) { splat.update(dt); sparkle.update(dt); },
    clear() { splat.clear(); sparkle.clear(); },
  };
}
