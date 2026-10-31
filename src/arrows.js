import * as THREE from 'three';
import { clamp, toon } from './utils.js';

const GRAVITY = 13.5;
const SHOT_SPEED = 34;

export function solveShot(origin, target) {
  const flat = new THREE.Vector3(target.x - origin.x, 0, target.z - origin.z);
  const dist = Math.max(0.35, flat.length());
  const t = Math.max(0.09, dist / SHOT_SPEED);
  const vy = (target.y - origin.y + 0.5 * GRAVITY * t * t) / t;
  const v = flat.multiplyScalar(1 / t);
  v.y = vy;
  return { velocity: v, time: t };
}

export function trajectoryPoints(origin, target, count = 18) {
  const { velocity, time } = solveShot(origin, target);
  const points = [];
  for (let i = 0; i < count; i++) {
    const t = time * (i / (count - 1)) * 0.985;
    const p = new THREE.Vector3(
      origin.x + velocity.x * t,
      origin.y + velocity.y * t - 0.5 * GRAVITY * t * t,
      origin.z + velocity.z * t
    );
    if (p.y < 0.02) p.y = 0.02;
    points.push(p);
  }
  return points;
}

export class ArrowSystem {
  constructor(scene, field, callbacks = {}) {
    this.scene = scene;
    this.field = field;
    this.callbacks = callbacks;
    this.arrows = [];
    this.max = 16;
    this.geo = {
      shaft: new THREE.CylinderGeometry(0.012, 0.012, 0.84, 5),
      head: new THREE.ConeGeometry(0.032, 0.1, 5),
      fletch: new THREE.BoxGeometry(0.06, 0.012, 0.12),
    };
    this.geo.shaft.rotateX(Math.PI / 2);
    this.geo.head.rotateX(Math.PI / 2);
    this.mat = {
      shaft: toon(0xc9a877),
      head: toon(0xb9c2b6),
      fletch: toon(0xf1e8ca),
      trail: new THREE.LineBasicMaterial({ color: 0xfff2c9, transparent: true, opacity: 0.3 }),
    };
  }

  spawn(origin, target, opts = {}) {
    const { velocity } = solveShot(origin, target);
    const group = new THREE.Group();
    const shaft = new THREE.Mesh(this.geo.shaft, this.mat.shaft);
    shaft.castShadow = true;
    group.add(shaft);
    const head = new THREE.Mesh(this.geo.head, this.mat.head);
    head.position.z = 0.46;
    head.castShadow = true;
    group.add(head);
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(this.geo.fletch, this.mat.fletch);
      f.position.z = -0.36;
      f.rotation.z = (i / 3) * Math.PI;
      f.position.x = Math.cos((i / 3) * Math.PI) * 0.03;
      f.position.y = Math.sin((i / 3) * Math.PI) * 0.03;
      group.add(f);
    }
    group.position.copy(origin);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), velocity.clone().normalize());
    this.scene.add(group);

    const trailPositions = new Float32Array(9 * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    for (let i = 0; i < 9; i++) {
      trailPositions.set([origin.x, origin.y, origin.z], i * 3);
    }
    const trail = new THREE.Line(trailGeo, this.mat.trail);
    trail.frustumCulled = false;
    this.scene.add(trail);

    const arrow = {
      group, trail, trailGeo,
      pos: origin.clone(), prev: origin.clone(), vel: velocity.clone(),
      state: 'flying', ttl: 0, stuckTtl: 0, trailPts: Array.from({ length: 9 }, () => origin.clone()),
      speed: opts.speed ?? SHOT_SPEED,
    };
    this.arrows.push(arrow);
    if (this.arrows.length > this.max) this.remove(this.arrows[0]);
    return arrow;
  }

  remove(arrow) {
    const i = this.arrows.indexOf(arrow);
    if (i >= 0) this.arrows.splice(i, 1);
    this.scene.remove(arrow.group);
    this.scene.remove(arrow.trail);
    arrow.trailGeo.dispose();
  }

  update(dt) {
    for (const a of [...this.arrows]) {
      a.ttl += dt;
      if (a.state === 'flying') {
        a.prev.copy(a.pos);
        a.vel.y -= GRAVITY * dt;
        a.pos.addScaledVector(a.vel, dt);
        a.group.position.copy(a.pos);
        const dir = a.vel.clone().normalize();
        a.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);

        const hit = this.field.hitTest(a.prev, a.pos);
        if (hit) {
          this.callbacks.onHit?.(hit.slime, hit.point, a);
          this.remove(a);
          continue;
        }
        if (a.pos.y <= 0.055) {
          a.state = 'stuck';
          a.pos.y = 0.055;
          a.group.position.copy(a.pos);
          a.group.rotation.z += 0.2;
          a.stuckTtl = 1.7;
          this.callbacks.onGround?.(a.pos.clone(), a);
        }
        if (a.pos.length() > 45 || a.ttl > 6) {
          this.remove(a);
          continue;
        }
      } else {
        a.stuckTtl -= dt;
        if (a.stuckTtl < 0.35) {
          const s = clamp(a.stuckTtl / 0.35, 0, 1);
          a.group.scale.setScalar(s);
        }
        if (a.stuckTtl <= 0) {
          this.remove(a);
          continue;
        }
      }

      // trail
      const first = a.trailPts.shift();
      first.copy(a.pos);
      a.trailPts.push(first);
      const arr = a.trailGeo.attributes.position.array;
      a.trailPts.forEach((p, i) => {
        arr[i * 3] = p.x;
        arr[i * 3 + 1] = p.y;
        arr[i * 3 + 2] = p.z;
      });
      a.trailGeo.attributes.position.needsUpdate = true;
    }
  }

  clear() {
    for (const a of [...this.arrows]) this.remove(a);
  }
}
