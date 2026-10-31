import * as THREE from 'three';
import { clamp, damp, lerp, rand, TAU, toon, getGradientMap } from './utils.js';

const GOLD = 0xffd46a;

class Slime {
  constructor(scene, spot, index) {
    this.scene = scene;
    this.index = index;
    this.size = 0.9 + Math.random() * 0.2;
    this.state = 'hidden';
    this.spot = spot;
    this.color = new THREE.Color(spot.color);
    this.group = new THREE.Group();
    this.group.position.set(spot.x, spot.y + 0.015, spot.z);
    this.group.rotation.y = Math.random() * TAU;
    scene.add(this.group);

    this.phase = Math.random() * TAU;
    this.peekTimer = 2 + Math.random() * 4;
    this.peekTime = 0;
    this.fleeClock = 0;
    this.deadTime = 0;
    this.flee = null;
    this.jitter = 0;
    this.focused = false;

    // wet shadow
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.62 * this.size, 24),
      new THREE.MeshBasicMaterial({ color: 0x1c2a16, transparent: true, opacity: 0.28, depthWrite: false })
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = -0.012;
    this.group.add(this.shadow);

    // ripples
    this.ripples = [];
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.42, 0.47, 28),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.005;
      this.group.add(ring);
      this.ripples.push({ mesh: ring, t: i * 0.5 });
    }

    this.bodyMat = new THREE.MeshPhysicalMaterial({
      color: this.color.clone(),
      roughness: 0.26,
      metalness: 0.0,
      clearcoat: 0.55,
      clearcoatRoughness: 0.3,
      transparent: true,
      opacity: 0.91,
      emissive: this.color.clone().multiplyScalar(0.05),
      emissiveIntensity: 0.8,
    });
    this.body = new THREE.Mesh(new THREE.SphereGeometry(0.5 * this.size, 24, 18), this.bodyMat);
    this.body.position.y = 0.34 * this.size;
    this.body.scale.set(1.05, 0.78, 1.05);
    this.body.castShadow = true;
    this.body.receiveShadow = false;
    this.group.add(this.body);

    // inner core visible through the jelly
    this.coreMat = new THREE.MeshPhysicalMaterial({
      color: this.color.clone().multiplyScalar(0.68),
      roughness: 0.35, metalness: 0, transparent: true, opacity: 0.34,
      clearcoat: 0.6, clearcoatRoughness: 0.3,
    });
    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.27 * this.size, 14, 10), this.coreMat);
    this.core.position.y = 0.28 * this.size;
    this.core.scale.set(1, 0.8, 1);
    this.group.add(this.core);

    // highlight blobs
    this.shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15, depthWrite: false });
    const shineGeo = new THREE.SphereGeometry(0.095 * this.size, 10, 8);
    this.shine1 = new THREE.Mesh(shineGeo, this.shineMat);
    this.shine1.position.set(-0.16 * this.size, 0.55 * this.size, 0.22 * this.size);
    this.shine1.scale.set(1, 1.7, 0.35);
    this.group.add(this.shine1);
    this.shine2 = new THREE.Mesh(shineGeo, this.shineMat);
    this.shine2.position.set(0.24 * this.size, 0.42 * this.size, 0.26 * this.size);
    this.shine2.scale.set(0.55, 0.7, 0.3);
    this.group.add(this.shine2);

    // tiny leaf sprout
    const sproutMat = toon(0x7fa34b);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.16, 4), toon(0x6d8e3f));
    stem.position.set(0.05, 0.76 * this.size, -0.03);
    stem.rotation.z = 0.2;
    this.group.add(stem);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), sproutMat);
    leaf.scale.set(1.4, 0.42, 0.8);
    leaf.position.set(0.12, 0.85 * this.size, -0.03);
    leaf.rotation.z = -0.35;
    this.group.add(leaf);

    // face
    this.face = new THREE.Group();
    this.group.add(this.face);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x211d16 });
    const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.eyes = [];
    [-1, 1].forEach((s) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055 * this.size, 10, 8), eyeMat);
      eye.position.set(s * 0.15 * this.size, 0.4 * this.size, 0.43 * this.size);
      eye.scale.set(1, 1.3, 0.5);
      this.face.add(eye);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.016 * this.size, 6, 5), glintMat);
      glint.position.set(s * 0.15 * this.size - 0.015, 0.43 * this.size, 0.455 * this.size);
      this.face.add(glint);
      this.eyes.push(eye, glint);
    });
    // closed eyes
    this.sleepEyes = new THREE.Group();
    [-1, 1].forEach((s) => {
      const closed = new THREE.Mesh(
        new THREE.TorusGeometry(0.055 * this.size, 0.009 * this.size, 4, 8, Math.PI),
        new THREE.MeshBasicMaterial({ color: 0x2b2c22, transparent: true, opacity: 0.55 })
      );
      closed.position.set(s * 0.15 * this.size, 0.4 * this.size, 0.445 * this.size);
      closed.rotation.z = Math.PI;
      this.sleepEyes.add(closed);
    });
    this.face.add(this.sleepEyes);
    const mouth = new THREE.Mesh(
      new THREE.TorusGeometry(0.045 * this.size, 0.008 * this.size, 4, 10, Math.PI),
      new THREE.MeshBasicMaterial({ color: 0x2b2c22 })
    );
    mouth.position.set(0, 0.27 * this.size, 0.475 * this.size);
    mouth.rotation.z = Math.PI;
    this.mouth = mouth;
    this.face.add(mouth);

    // focus outline
    this.outlineMat = new THREE.MeshBasicMaterial({
      color: GOLD, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false,
    });
    this.outline = new THREE.Mesh(new THREE.SphereGeometry(0.5 * this.size * 1.09, 20, 14), this.outlineMat);
    this.outline.position.y = 0.34 * this.size;
    this.outline.scale.set(1.05, 0.78, 1.05);
    this.group.add(this.outline);

    // decorative glow ring for focus
    this.focusRing = new THREE.Mesh(
      new THREE.RingGeometry(0.78 * this.size, 0.84 * this.size, 32),
      new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
    );
    this.focusRing.rotation.x = -Math.PI / 2;
    this.focusRing.position.y = 0.01;
    this.group.add(this.focusRing);

    this.applySpotColor(true);
    this.closeEyes();
  }

  applySpotColor(instant = false, targetColor = null) {
    const c = targetColor ?? new THREE.Color(this.spot.color);
    this.color.copy(c);
    this.bodyMat.color.copy(c);
    this.coreMat.color.copy(c).multiplyScalar(0.68);
    this.bodyMat.emissive.copy(c).multiplyScalar(0.05);
    this.sleepEyes.children.forEach((m) => m.material.color.copy(c).multiplyScalar(0.45));
    this.ripples.forEach((r) => r.mesh.material.color.copy(c).lerp(new THREE.Color(0xffffff), 0.35));
    this.outlineMat.opacity = 0;
    if (instant) this.bodyMat.needsUpdate = true;
  }

  openEyes() {
    this.eyes.forEach((e) => { e.visible = true; });
    this.sleepEyes.visible = false;
    this.face.visible = true;
  }
  closeEyes() {
    this.eyes.forEach((e) => { e.visible = false; });
    this.sleepEyes.visible = true;
  }

  startPeek() {
    this.state = 'peek';
    this.peekTime = 0.65 + Math.random() * 0.5;
    this.openEyes();
  }

  chooseFleeSpot(field, playerPos) {
    const open = field.spots
      .filter((s) => s !== this.spot && !field.occupied.has(s.id))
      .map((s) => ({
        spot: s,
        d: Math.hypot(s.x - this.group.position.x, s.z - this.group.position.z),
        pd: Math.hypot(s.x - playerPos.x, s.z - playerPos.z),
      }));
    if (!open.length) return null;

    // ideal: a mid-range patch that leaves a comfortable gap from the huntress
    const ideal = open.filter((c) => c.d > 4.5 && c.d < 15 && c.pd > 5.2);
    if (ideal.length) {
      ideal.sort((a, b) => Math.abs(a.d - 9) - Math.abs(b.d - 9) + (Math.random() - 0.5) * 2);
      return ideal[0].spot;
    }

    // crowded round: settle for any patch the huntress is not standing next to
    const safe = open.filter((c) => c.pd > 3.6 && c.d > 2.2);
    if (safe.length) {
      safe.sort((a, b) => b.pd - a.pd + (Math.random() - 0.5) * 1.5);
      return safe[0].spot;
    }

    // last resort: the patch farthest from the huntress, even if it is close by
    open.sort((a, b) => b.pd - a.pd);
    return open[0].spot;
  }

  startFlee(field, playerPos) {
    if (this.state === 'flee' || this.state === 'caught') return false;
    const next = this.chooseFleeSpot(field, playerPos);
    if (!next) {
      this.jitter = 1;
      this.fleeClock = -0.8;
      return false;
    }
    this.state = 'flee';
    this.closeEyes();
    this.face.visible = false;
    field.occupied.delete(this.spot.id);
    field.occupied.add(next.id);
    const start = this.group.position.clone();
    const end = new THREE.Vector3(next.x, next.y ?? 0.03, next.z);
    const dist = Math.hypot(end.x - start.x, end.z - start.z);
    this.flee = {
      start, end, fromSpot: this.spot, toSpot: next,
      t: 0, dur: 0.85 + dist * 0.055,
      hops: 1 + Math.floor(dist / 3.4),
      oldColor: this.color.clone(), newColor: new THREE.Color(next.color),
    };
    this.fleeClock = 0;
    this.spot = next;
    field.spawnRipple(start, this.color, 1.15);
    return true;
  }

  catch() {
    if (this.state === 'caught') return false;
    this.state = 'caught';
    this.deadTime = 0;
    this.outlineMat.opacity = 0;
    this.focusRing.material.opacity = 0;
    return true;
  }

  update(dt, time, playerPos, focusActive, playerMoving, field) {
    if (this.state === 'caught') {
      this.deadTime += dt;
      const k = clamp(this.deadTime / 0.24, 0, 1);
      this.body.scale.set((1.05 + k * 0.6) * this.size, (0.78 - k * 0.7) * this.size, (1.05 + k * 0.6) * this.size);
      this.body.position.y = (0.34 - k * 0.28) * this.size;
      this.bodyMat.opacity = 0.93 * (1 - k);
      this.coreMat.opacity = 0.34 * (1 - k);
      this.group.visible = k < 1;
      return;
    }

    const dx = playerPos.x - this.group.position.x;
    const dz = playerPos.z - this.group.position.z;
    const dist = Math.hypot(dx, dz);
    this.focused = focusActive && dist < 19;

    // focus reveal
    const wantOutline = this.focused ? 0.55 : 0;
    this.outlineMat.opacity = damp(this.outlineMat.opacity, wantOutline, 10, dt);
    const wantRing = this.focused ? 0.32 + Math.sin(time * 4 + this.phase) * 0.12 : 0;
    this.focusRing.material.opacity = damp(this.focusRing.material.opacity, wantRing, 8, dt);

    // ripples
    this.ripples.forEach((r, i) => {
      r.t += dt * 0.55;
      if (r.t > 1) r.t -= 1;
      const k = 0.42 + r.t * 0.65;
      r.mesh.scale.setScalar(k);
      r.mesh.material.opacity = (1 - r.t) * 0.17;
    });

    const bob = Math.sin(time * 2.2 + this.phase) * 0.022;
    const breath = 1 + Math.sin(time * 2.4 + this.phase) * 0.035;

    if (this.state === 'hidden') {
      this.group.position.y = this.spot.y + 0.015 + bob * 0.5;
      this.body.scale.set(1.05 * breath, 0.78 / breath, 1.05 * breath);
      this.body.position.y = 0.34 * this.size + bob * 0.2;
      this.core.position.y = 0.28 * this.size + bob * 0.25;
      this.shine1.position.y = 0.55 * this.size + bob * 0.3;
      this.shine2.position.y = 0.42 * this.size + bob * 0.3;
      this.face.visible = true;
      this.closeEyes();

      // idle peek timer
      this.peekTimer -= dt;
      if (this.peekTimer <= 0) {
        this.startPeek();
        this.peekTimer = 3.8 + Math.random() * 4.5;
      }

      // bobbing turns into a subtle nervous wiggle near the huntress
      if (dist < 3.4) {
        this.jitter = damp(this.jitter, 1, 4, dt);
      } else {
        this.jitter = damp(this.jitter, 0, 2, dt);
      }
      if (this.jitter > 0.05) {
        this.group.position.x = this.spot.x + Math.sin(time * 26) * 0.015 * this.jitter;
        this.group.position.z = this.spot.z + Math.cos(time * 23) * 0.015 * this.jitter;
      } else {
        this.group.position.x = this.spot.x;
        this.group.position.z = this.spot.z;
      }

      // flee if the player stays on top of the hiding place
      if (dist < 2.0 && playerMoving) {
        this.fleeClock += dt;
        if (this.fleeClock > 0.45) {
          if (this.startFlee(field, playerPos)) {
            field.onFlee?.(this);
          }
          this.fleeClock = 0;
        }
      } else if (dist < 1.55) {
        this.fleeClock += dt;
        if (this.fleeClock > 0.9) {
          if (this.startFlee(field, playerPos)) field.onFlee?.(this);
          this.fleeClock = 0;
        }
      } else {
        this.fleeClock = damp(this.fleeClock, 0, 4, dt);
      }
    } else if (this.state === 'peek') {
      this.peekTime -= dt;
      const rise = Math.sin((1 - this.peekTime) * 6) * 0.02;
      this.group.position.y = this.spot.y + 0.03 + Math.max(0, rise);
      this.body.scale.set(1.04 * breath, 0.8 / breath, 1.04 * breath);
      this.body.position.y = 0.36 * this.size;
      // look toward the player while showing eyes
      const targetYaw = Math.atan2(dx, dz);
      this.group.rotation.y = damp(this.group.rotation.y, targetYaw, 3, dt);
      this.shine1.position.y = 0.56 * this.size;
      if (this.peekTime <= 0) {
        this.state = 'hidden';
        this.closeEyes();
        this.group.rotation.y = Math.random() * TAU;
      }
      if (dist < 2.2 && playerMoving) {
        if (this.startFlee(field, playerPos)) field.onFlee?.(this);
      }
    } else if (this.state === 'flee' && this.flee) {
      const f = this.flee;
      f.t += dt;
      const p = clamp(f.t / f.dur, 0, 1);
      const ease = p * p * (3 - 2 * p);
      this.group.position.x = lerp(f.start.x, f.end.x, ease);
      this.group.position.z = lerp(f.start.z, f.end.z, ease);
      const bounce = Math.abs(Math.sin(p * Math.PI * f.hops)) * (1 - p * 0.35);
      this.group.position.y = lerp(f.start.y, f.end.y, ease) + bounce * 0.85;
      // stretch while airborne, squash at landing
      const stretch = 0.82 + bounce * 0.4;
      this.body.scale.set(1.05 / stretch, 0.78 * stretch, 1.05 / stretch);
      this.body.position.y = 0.34 * this.size + bounce * 0.09;
      this.core.position.y = 0.28 * this.size + bounce * 0.1;
      this.shine1.position.y = 0.55 * this.size + bounce * 0.1;
      this.shine2.position.y = 0.42 * this.size + bounce * 0.1;
      this.face.visible = false;
      this.body.rotation.y += dt * 5.5;
      if (p > 0.75) {
        const k = (p - 0.75) / 0.25;
        this.color.copy(f.oldColor).lerp(f.newColor, k);
        this.bodyMat.color.copy(this.color);
        this.coreMat.color.copy(this.color).multiplyScalar(0.68);
        this.bodyMat.emissive.copy(this.color).multiplyScalar(0.05);
        this.sleepEyes.children.forEach((m) => m.material.color.copy(this.color).multiplyScalar(0.45));
        this.ripples.forEach((r) => r.mesh.material.color.copy(this.color).lerp(new THREE.Color(0xffffff), 0.35));
      }
      if (p >= 1) {
        this.state = 'hidden';
        this.group.position.set(f.end.x, f.end.y + 0.015, f.end.z);
        this.body.scale.set(1.05, 0.78, 1.05);
        this.body.position.y = 0.34 * this.size;
        this.body.rotation.y = 0;
        this.applySpotColor(false);
        this.closeEyes();
        this.face.visible = true;
        this.peekTimer = 1.6 + Math.random() * 2.2;
        this.flee = null;
        field.spawnRipple(this.group.position, this.color, 0.9);
      }
    }

    // font-facing for the slime creature, keep upright
    this.shadow.material.opacity = 0.22 - Math.min(0.12, Math.max(0, this.group.position.y - 0.1) * 0.25);
    this.shadow.scale.setScalar(1 + Math.max(0, this.group.position.y - 0.1) * 0.25);
  }
}

export class SlimeField {
  constructor(scene, spots, count = 8, callbacks = {}) {
    this.scene = scene;
    this.spots = spots;
    this.count = count;
    this.onCatch = callbacks.onCatch;
    this.onFlee = callbacks.onFlee;
    this.onHop = callbacks.onHop;
    this.occupied = new Set();
    this.slimes = [];
    this.ripples = [];
    this.ringGeo = new THREE.RingGeometry(0.4, 0.48, 28);
    this.reset();
  }

  reset() {
    this.slimes.forEach((s) => {
      this.scene.remove(s.group);
      s.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    });
    this.slimes = [];
    this.occupied.clear();
    this.ripples.forEach((r) => {
      this.scene.remove(r.mesh);
      r.mesh.material.dispose();
    });
    this.ripples = [];
    const shuffled = [...this.spots].sort(() => Math.random() - 0.5);
    const chosen = [];
    for (const s of shuffled) {
      if (chosen.length >= this.count) break;
      if (chosen.every((c) => Math.hypot(c.x - s.x, c.z - s.z) > 4.6)) chosen.push(s);
    }
    // fall back if constraints are too strict
    for (const s of shuffled) {
      if (chosen.length >= this.count) break;
      if (!chosen.includes(s)) chosen.push(s);
    }
    chosen.forEach((spot, i) => {
      this.occupied.add(spot.id);
      const slime = new Slime(this.scene, spot, i);
      slime.onFlee = () => this.onFlee?.(slime);
      this.slimes.push(slime);
    });
  }

  spawnRipple(pos, color, scale = 1) {
    if (this.ripples.length > 8) {
      const old = this.ripples.shift();
      this.scene.remove(old.mesh);
      old.mesh.geometry.dispose();
      old.mesh.material.dispose();
    }
    const mesh = new THREE.Mesh(
      this.ringGeo,
      new THREE.MeshBasicMaterial({ color: color.clone ? color.clone() : color, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, 0.045, pos.z);
    mesh.scale.setScalar(scale * 0.7);
    this.scene.add(mesh);
    this.ripples.push({ mesh, t: 0, scale });
  }

  update(dt, time, playerPos, focusActive, playerMoving) {
    this.slimes.forEach((s) => s.update(dt, time, playerPos, focusActive, playerMoving, this));
    this.ripples = this.ripples.filter((r) => {
      r.t += dt;
      const p = r.t / 0.9;
      r.mesh.scale.setScalar(r.scale * (0.7 + p * 2.4));
      r.mesh.material.opacity = 0.55 * (1 - p);
      if (p >= 1) {
        this.scene.remove(r.mesh);
        r.mesh.material.dispose();
        return false;
      }
      return true;
    });
  }

  hitTest(prev, pos, radius = 0.62) {
    const a = new THREE.Vector3(prev.x, prev.y, prev.z);
    const b = new THREE.Vector3(pos.x, pos.y, pos.z);
    const ab = new THREE.Vector3().subVectors(b, a);
    const len2 = ab.lengthSq();
    let best = null;
    for (const s of this.slimes) {
      if (s.state === 'caught') continue;
      const c = new THREE.Vector3(s.group.position.x, s.group.position.y + 0.36 * s.size, s.group.position.z);
      let t = 0;
      if (len2 > 0.0001) t = clamp(new THREE.Vector3().subVectors(c, a).dot(ab) / len2, 0, 1);
      const p = new THREE.Vector3().copy(a).addScaledVector(ab, t);
      const d = p.distanceTo(c);
      const rr = radius * s.size + (s.state === 'flee' ? 0.1 : 0);
      if (d < rr) {
        if (!best || d < best.d) best = { slime: s, d, point: p.clone() };
      }
    }
    return best;
  }

  alertNear(pos, radius = 1.5) {
    for (const s of this.slimes) {
      if (s.state !== 'hidden' && s.state !== 'peek') continue;
      const d = Math.hypot(s.group.position.x - pos.x, s.group.position.z - pos.z);
      if (d < radius) {
        if (s.startFlee(this, pos)) this.onFlee?.(s);
      }
    }
  }

  catchSlime(slime) {
    if (slime.catch()) {
      this.occupied.delete(slime.spot.id);
      this.onCatch?.(slime);
      return true;
    }
    return false;
  }

  nearestDistance(playerPos) {
    let best = Infinity;
    for (const s of this.slimes) {
      if (s.state === 'caught') continue;
      const d = Math.hypot(s.group.position.x - playerPos.x, s.group.position.z - playerPos.z);
      best = Math.min(best, d);
    }
    return best;
  }

  get caughtCount() {
    return this.slimes.filter((s) => s.state === 'caught').length;
  }
  get total() { return this.slimes.length; }
  get allCaught() { return this.caughtCount === this.slimes.length; }

  setFocusOutlines(on) {
    // handled in update; kept for API clarity
  }
}
