import * as THREE from 'three';
import {
  clamp, lerp, rand, seeded, smoothstep, toon, getGradientMap,
  softPatchTexture, leafGeometry, TAU,
} from './utils.js';
import {
  makeGrassTexture, makeStoneTexture, makeDirtTexture, makeWoodTexture,
  makeThatchTexture, makeBarkTexture, makeWindowTexture,
} from './textures.js';

const deg = (d) => (d * Math.PI) / 180;

function makeSignTexture(title, subtitle) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  // wooden board
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#a97a4c');
  g.addColorStop(0.5, '#91663d');
  g.addColorStop(1, '#7d5532');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = `rgba(70,44,23,${0.08 + Math.random() * 0.16})`;
    ctx.lineWidth = 1 + Math.random() * 3;
    ctx.beginPath();
    ctx.moveTo(0, Math.random() * 256);
    ctx.bezierCurveTo(150, Math.random() * 256, 350, Math.random() * 256, 512, Math.random() * 256);
    ctx.stroke();
  }
  ctx.strokeStyle = '#5b3a20';
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, 498, 242);
  ctx.strokeStyle = 'rgba(255,236,190,0.25)';
  ctx.lineWidth = 3;
  ctx.strokeRect(20, 20, 472, 216);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f7edcb';
  ctx.shadowColor = 'rgba(40,24,10,0.6)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.font = '86px Jua, sans-serif';
  ctx.fillText(title, 256, 108);
  ctx.font = '34px "Gowun Dodum", sans-serif';
  ctx.fillStyle = '#e4d3a2';
  ctx.fillText(subtitle, 256, 186);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeWaterMaterial() {
  return new THREE.ShaderMaterial({
    transparent: false,
    toneMapped: true,
    uniforms: {
      uTime: { value: 0 },
      uA: { value: new THREE.Color('#4f8984') },
      uB: { value: new THREE.Color('#7bb8ac') },
      uC: { value: new THREE.Color('#d9efe0') },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform vec3 uA;
      uniform vec3 uB;
      uniform vec3 uC;
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float d = length(p);
        float r1 = sin(d * 26.0 - uTime * 1.6);
        float r2 = sin(vUv.x * 24.0 + uTime * 0.9) * sin(vUv.y * 19.0 - uTime * 1.1);
        float ripple = smoothstep(0.55, 1.0, r1 * 0.4 + r2 * 0.5);
        float shimmer = pow(max(0.0, sin((vUv.x + vUv.y) * 38.0 + uTime * 2.2)), 18.0);
        vec3 col = mix(uA, uB, 0.35 + 0.4 * smoothstep(0.0, 1.0, vUv.y + r2 * 0.1));
        col = mix(col, uC, ripple * 0.16 + shimmer * 0.35);
        float edge = smoothstep(0.82, 1.0, d);
        col = mix(col, uC, edge * 0.22);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

export function createWorld(scene, renderer) {
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const root = new THREE.Group();
  scene.add(root);
  const colliders = [];
  const hideSpots = [];
  const updaters = [];
  const timeUniform = { value: 0 };

  const pal = {
    grass: 0x5c853f,
    grassLight: 0x86ad5a,
    leafDark: 0x36552b,
    leafMid: 0x4f7336,
    leafLight: 0x83a94f,
    bark: 0x6b4e34,
    stone: 0x9b9d8d,
    wood: 0x8a5f3a,
    thatch: 0x4d6a32,
    cream: 0xf2e9c9,
  };

  // ---------- sky ----------
  const skyUniforms = {
    uTop: { value: new THREE.Color('#8fcab8') },
    uHorizon: { value: new THREE.Color('#f5efd0') },
    uSun: { value: new THREE.Color('#ffe0a0') },
    uSunDir: { value: new THREE.Vector3(0.5, 0.7, 0.4).normalize() },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(130, 32, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: skyUniforms,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vDir = normalize(wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSun; uniform vec3 uSunDir;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 col = mix(uHorizon, uTop, pow(h, 0.55));
          float sd = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
          col += uSun * pow(sd, 260.0) * 2.2;
          col += uSun * pow(sd, 8.0) * 0.16;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    })
  );
  sky.frustumCulled = false;
  root.add(sky);

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight(0xe8f5d8, 0x4c5c38, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe9bb, 2.5);
  sun.position.set(20, 28, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -34;
  sun.shadow.camera.right = 34;
  sun.shadow.camera.top = 34;
  sun.shadow.camera.bottom = -34;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  scene.add(sun.target);
  sun.target.position.set(0, 0, 0);
  const fill = new THREE.DirectionalLight(0xa9d4d8, 0.5);
  fill.position.set(-18, 12, -16);
  scene.add(fill);

  scene.fog = new THREE.Fog(0xd8e8c8, 34, 82);

  // ---------- ground ----------
  const grassTex = makeGrassTexture(anisotropy);
  grassTex.repeat.set(22, 22);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 160, 1, 1),
    toon(0xffffff, { map: grassTex })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);

  // subtle dark ring under the tree line to give the clearing depth
  const outerShade = new THREE.Mesh(
    new THREE.RingGeometry(27, 60, 64),
    new THREE.MeshBasicMaterial({ color: 0x33502b, transparent: true, opacity: 0.18, depthWrite: false })
  );
  outerShade.rotation.x = -Math.PI / 2;
  outerShade.position.y = 0.004;
  root.add(outerShade);

  const stoneTex = makeStoneTexture(anisotropy);
  stoneTex.repeat.set(4, 4);
  const dirtTex = makeDirtTexture(anisotropy);
  const woodTex = makeWoodTexture();
  const thatchTex = makeThatchTexture();
  const barkTex = makeBarkTexture();
  const windowTex = makeWindowTexture();

  // ---------- paths ----------
  const pathPolylines = [
    [[0, 28], [0, 18], [0, 9], [0, 6.3]],
    [[0, -6.3], [0, -13], [0, -22]],
    [[-5.6, 2.2], [-9, 4.8], [-12.6, 6.4]],
    [[5.6, 2.2], [9, 3.3], [13, 3.6]],
  ];
  const pathPoints = [];
  function addPath(points, width) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], 0, p[1])));
    const N = 46;
    const pos = [], uv = [], idx = [];
    const length = curve.getLength();
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const p = curve.getPoint(t);
      const tan = curve.getTangent(t).normalize();
      const nx = -tan.z, nz = tan.x;
      const wobble = 1 + Math.sin(t * 23 + width) * 0.12;
      const hw = (width / 2) * wobble;
      pos.push(p.x + nx * hw, 0.018, p.z + nz * hw);
      pos.push(p.x - nx * hw, 0.018, p.z - nz * hw);
      uv.push(0, (t * length) / 2.4);
      uv.push(1, (t * length) / 2.4);
      if (i < N) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = toon(0xffffff, { map: dirtTex, polygonOffset: true, polygonOffsetFactor: -1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    root.add(mesh);
    points.forEach((p, i) => {
      if (i > 0) pathPoints.push([points[i - 1], p]);
    });
  }
  pathPolylines.forEach((p, i) => addPath(p, i < 2 ? 3.1 : 2.1));

  // plaza
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(6.6, 56), toon(0xffffff, { map: stoneTex }));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.02;
  plaza.receiveShadow = true;
  root.add(plaza);
  const plazaRing = new THREE.Mesh(
    new THREE.RingGeometry(6.35, 6.9, 64),
    toon(0x8d8f7e)
  );
  plazaRing.rotation.x = -Math.PI / 2;
  plazaRing.position.y = 0.035;
  root.add(plazaRing);

  // ---------- pond ----------
  const pondPos = new THREE.Vector3(-12, 0, -4);
  const pondR = 4.3;
  const pondBank = new THREE.Mesh(
    new THREE.CircleGeometry(5.3, 48),
    toon(0x9a7e56)
  );
  pondBank.rotation.x = -Math.PI / 2;
  pondBank.position.set(pondPos.x, 0.012, pondPos.z);
  pondBank.receiveShadow = true;
  root.add(pondBank);
  const waterMat = makeWaterMaterial();
  const water = new THREE.Mesh(new THREE.CircleGeometry(pondR, 56), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(pondPos.x, 0.03, pondPos.z);
  root.add(water);
  const foam = new THREE.Mesh(
    new THREE.RingGeometry(pondR - 0.16, pondR + 0.12, 56),
    new THREE.MeshBasicMaterial({ color: 0xe8f2dc, transparent: true, opacity: 0.35, depthWrite: false })
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(pondPos.x, 0.045, pondPos.z);
  root.add(foam);
  updaters.push((dt) => { waterMat.uniforms.uTime.value += dt; });
  colliders.push({ x: pondPos.x, z: pondPos.z, r: pondR + 0.45 });

  // ---------- instanced collections ----------
  const inc = {
    foliage: [], trunks: [], grass: [], flowerHeads: [], flowerStems: [], tufts: [],
    pebbles: [], rocks: [], moss: [], logs: [], reeds: [], lilies: [], stones: [],
    mushrooms: [], mushroomCaps: [], fencePosts: [], fenceRails: [], clouds: [],
  };
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();

  function pushFoliage(x, y, z, sx, sy, sz, color, rx = 0, ry = 0, rz = 0) {
    inc.foliage.push({ x, y, z, sx, sy, sz, color, rx, ry, rz });
  }
  function addTree(x, z, scale = 1, variant = 0) {
    const h = (4.5 + Math.random() * 2.6) * scale;
    const lean = (Math.random() - 0.5) * 0.09;
    inc.trunks.push({
      x, z, y: h * 0.47, sx: 1.25 * scale, sy: h * 0.5, sz: 1.25 * scale,
      rx: lean, ry: Math.random() * TAU, rz: (Math.random() - 0.5) * 0.07,
      color: variant ? 0x7a5b3e : 0xffffff,
    });
    const crownY = h * 0.88;
    const n = 5 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.random() * 0.7;
      const r = i === 0 ? 0 : (0.7 + Math.random() * 1.5) * scale;
      const s = (1.2 + Math.random() * 0.9) * scale;
      const green = [pal.leafDark, pal.leafMid, pal.leafLight, 0x5f853f, 0x74984a][Math.floor(Math.random() * 5)];
      pushFoliage(
        x + Math.cos(a) * r,
        crownY + (Math.random() - 0.35) * 1.6 * scale + (i === 0 ? 0.5 * scale : 0),
        z + Math.sin(a) * r,
        s * (0.95 + Math.random() * 0.35), s * (0.72 + Math.random() * 0.3), s * (0.95 + Math.random() * 0.35),
        green,
        Math.random() * 0.5, Math.random() * TAU, Math.random() * 0.5
      );
    }
    // a couple of low branches
    colliders.push({ x, z, r: 0.72 * scale });
    return { x, z, h };
  }
  function addBush(x, z, s = 1, color = null) {
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, r = Math.random() * 0.55 * s;
      pushFoliage(
        x + Math.cos(a) * r, 0.35 * s + Math.random() * 0.3 * s, z + Math.sin(a) * r,
        (0.55 + Math.random() * 0.35) * s, (0.4 + Math.random() * 0.3) * s, (0.55 + Math.random() * 0.35) * s,
        color ?? [pal.leafDark, pal.leafMid, pal.leafLight][Math.floor(Math.random() * 3)],
        0, Math.random() * TAU, 0
      );
    }
  }

  // ---------- huts ----------
  const hutLocations = [
    { x: -13.5, z: 7.5, rot: Math.atan2(13.5, -7.5), s: 1 },
    { x: 13.5, z: -9, rot: Math.atan2(-13.5, 9), s: 0.95 },
    { x: -6.5, z: -18, rot: Math.atan2(6.5, 18), s: 1.08 },
    { x: -7, z: 17.5, rot: Math.atan2(7, -17.5), s: 0.88 },
  ];
  function addHut(cfg) {
    const g = new THREE.Group();
    g.position.set(cfg.x, 0, cfg.z);
    g.rotation.y = cfg.rot;
    g.scale.setScalar(cfg.s);
    root.add(g);
    const wallMat = toon(0xffffff, { map: woodTex });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.25, 2.4, 0.34, 12), toon(0x8b8d7b));
    base.position.y = 0.17;
    base.receiveShadow = true; base.castShadow = true;
    g.add(base);
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(1.95, 2.05, 1.9, 12), wallMat);
    wall.position.y = 1.22;
    wall.castShadow = true; wall.receiveShadow = true;
    g.add(wall);
    // door
    const doorShape = new THREE.Shape();
    doorShape.moveTo(-0.42, 0);
    doorShape.lineTo(-0.42, 1.0);
    doorShape.quadraticCurveTo(0, 1.38, 0.42, 1.0);
    doorShape.lineTo(0.42, 0);
    doorShape.closePath();
    const door = new THREE.Mesh(
      new THREE.ExtrudeGeometry(doorShape, { depth: 0.09, bevelEnabled: false, curveSegments: 8 }),
      toon(0x5d4028)
    );
    door.position.set(0, 0.34, 1.94);
    g.add(door);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), toon(0xd8b25e));
    knob.position.set(0.24, 1.0, 2.06);
    g.add(knob);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.12, 0.18), toon(0x6b4a2d));
    lintel.position.set(0, 1.81, 1.98);
    lintel.castShadow = true;
    g.add(lintel);
    // windows
    const winMat = new THREE.MeshBasicMaterial({ map: windowTex });
    [-1, 1].forEach((side) => {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.62), winMat);
      const a = side * 0.9;
      win.position.set(Math.sin(a) * 1.98, 1.45, Math.cos(a) * 1.98);
      win.rotation.y = a;
      g.add(win);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.76, 0.08), toon(0x5b4128));
      frame.position.copy(win.position);
      frame.position.multiplyScalar(0.995);
      frame.rotation.copy(win.rotation);
      g.add(frame);
      win.position.multiplyScalar(1.012);
    });
    // roof, layered leaves
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.75, 2.0, 12), toon(0xffffff, { map: thatchTex }));
    roof.position.y = 3.1;
    roof.rotation.y = Math.PI / 12;
    roof.castShadow = true; roof.receiveShadow = true;
    g.add(roof);
    const roof2 = new THREE.Mesh(new THREE.ConeGeometry(1.75, 1.25, 12), toon(0x5f7d38, { map: thatchTex }));
    roof2.position.y = 4.25;
    roof2.rotation.y = Math.PI / 15;
    roof2.castShadow = true;
    g.add(roof2);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), toon(0xc7a45b));
    finial.position.y = 4.95;
    g.add(finial);
    // leaf fringe on eaves
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.2;
      const leaf = new THREE.Mesh(leafGeometry(0.42, 0.72, 0.02), toon(i % 2 ? 0x5c7c36 : 0x6e8e42, { side: THREE.DoubleSide }));
      leaf.position.set(Math.cos(a) * 2.26, 2.16, Math.sin(a) * 2.26);
      leaf.rotation.set(deg(68), -a + Math.PI / 2, 0);
      leaf.castShadow = true;
      g.add(leaf);
    }
    // vine / moss tuft on roof
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * TAU, r = 1.2 + Math.random() * 0.8;
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35 + Math.random() * 0.25, 0), toon(0x789b48));
      blob.position.set(Math.cos(a) * r, 2.7 + Math.random() * 0.5, Math.sin(a) * r);
      blob.castShadow = true;
      g.add(blob);
    }
    colliders.push({ x: cfg.x, z: cfg.z, r: 2.25 * cfg.s });
    return g;
  }
  hutLocations.forEach(addHut);

  // ---------- well ----------
  {
    const g = new THREE.Group();
    g.position.set(0, 0, 0);
    root.add(g);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.16, 0.95, 16, 1, true), toon(0xffffff, { map: stoneTex, side: THREE.DoubleSide }));
    ring.position.y = 0.48; ring.castShadow = true; ring.receiveShadow = true; g.add(ring);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.12, 8, 20), toon(0xa5a795));
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.95; rim.castShadow = true; g.add(rim);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.98, 24), new THREE.MeshBasicMaterial({ color: 0x22332f }));
    inner.rotation.x = -Math.PI / 2; inner.position.y = 0.2; g.add(inner);
    [-1, 1].forEach((s) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.5, 7), toon(0x6b4b2e));
      post.position.set(s * 0.98, 1.25, 0); post.castShadow = true; g.add(post);
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 7), toon(0x745131));
    beam.rotation.z = Math.PI / 2; beam.position.y = 2.42; beam.castShadow = true; g.add(beam);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.55, 0.85, 4), toon(0xffffff, { map: thatchTex }));
    roof.position.y = 2.9; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.4, 4), toon(0xc9b184));
    rope.position.set(0, 1.68, 0); g.add(rope);
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.34, 10, 1, true), toon(0x8a6139, { side: THREE.DoubleSide }));
    bucket.position.set(0, 0.9, 0); g.add(bucket);
    colliders.push({ x: 0, z: 0, r: 1.28 });
    hideSpots.push({ id: 'stone', x: 2.6, z: -1.7, y: 0.02, color: 0xa9aa96, name: '돌바닥', kind: 'stone', size: 1.0 });
  }

  // ---------- garden ----------
  {
    const gx = 11, gz = 4.5, gw = 6.4, gd = 5.2;
    const soil = new THREE.Mesh(new THREE.PlaneGeometry(gw, gd), toon(0xffffff, { map: dirtTex }));
    soil.rotation.x = -Math.PI / 2;
    soil.position.set(gx, 0.022, gz);
    soil.receiveShadow = true;
    root.add(soil);
    // cabbages
    const rnd = seeded(91);
    for (let i = 0; i < 24; i++) {
      const x = gx - gw / 2 + 0.5 + rnd() * (gw - 1);
      const z = gz - gd / 2 + 0.4 + rnd() * (gd - 0.8);
      pushFoliage(x, 0.16 + rnd() * 0.06, z, 0.26 + rnd() * 0.13, 0.18 + rnd() * 0.08, 0.26 + rnd() * 0.13, rnd() > 0.5 ? 0x7aa34a : 0x88b45a, 0, rnd() * TAU, 0);
      if (rnd() > 0.55) {
        pushFoliage(x - 0.15, 0.08, z + 0.15, 0.13, 0.05, 0.13, 0x4f7a33, 0, rnd() * TAU, 0);
      }
    }
    // fence around with a gate on the south side
    const posts = [];
    const step = 1.25;
    for (let x = gx - gw / 2; x <= gx + gw / 2 + 0.01; x += step) {
      if (Math.abs(x - gx) < 0.7) {
        // gate gap on the south face only
        posts.push([x, gz - gd / 2, true]);
      } else {
        posts.push([x, gz - gd / 2]);
        posts.push([x, gz + gd / 2]);
      }
    }
    for (let z = gz - gd / 2 + step; z < gz + gd / 2 - 0.01; z += step) {
      posts.push([gx - gw / 2, z]);
      posts.push([gx + gw / 2, z]);
    }
    posts.forEach(([x, z, gate]) => {
      if (!gate) {
        inc.fencePosts.push({ x, y: 0.5, z, color: 0xb89a6c });
        colliders.push({ x, z, r: 0.18 });
      }
    });
    // rails (short boxes)
    function rail(x1, z1, x2, z2) {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const ang = Math.atan2(z2 - z1, x2 - x1);
      inc.fenceRails.push({
        x: (x1 + x2) / 2, y: 0.42, z: (z1 + z2) / 2,
        sx: len, sy: 0.075, sz: 0.055, ry: -ang, color: 0xc4a97a,
      });
      inc.fenceRails.push({
        x: (x1 + x2) / 2, y: 0.75, z: (z1 + z2) / 2,
        sx: len, sy: 0.075, sz: 0.055, ry: -ang, color: 0xb59768,
      });
    }
    rail(gx - gw / 2, gz + gd / 2, gx + gw / 2, gz + gd / 2);
    rail(gx - gw / 2, gz - gd / 2, gx - 0.7, gz - gd / 2);
    rail(gx + 0.7, gz - gd / 2, gx + gw / 2, gz - gd / 2);
    rail(gx - gw / 2, gz - gd / 2, gx - gw / 2, gz + gd / 2);
    rail(gx + gw / 2, gz - gd / 2, gx + gw / 2, gz + gd / 2);
    hideSpots.push({ id: 'garden', x: 9.6, z: 4.2, y: 0.02, color: 0x6f9745, name: '채소밭', kind: 'garden', size: 0.95 });
  }

  // ---------- village sign ----------
  {
    const g = new THREE.Group();
    g.position.set(3.4, 0, 11.2);
    g.rotation.y = deg(-18);
    root.add(g);
    [-0.7, 0.7].forEach((x) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.1, 7), toon(0x6e4c2e));
      post.position.set(x, 1.05, 0);
      post.castShadow = true;
      g.add(post);
    });
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.15, 0.1), toon(0x92673e));
    board.position.set(0, 1.65, 0.06);
    board.castShadow = true;
    g.add(board);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.16, 1.02), new THREE.MeshBasicMaterial({ map: makeSignTexture('이슬잎 마을', 'DEWLEAF VILLAGE') }));
    face.position.set(0, 1.65, 0.115);
    g.add(face);
    const sprig = new THREE.Mesh(leafGeometry(0.4, 0.8), toon(0x7da34d, { side: THREE.DoubleSide }));
    sprig.position.set(1.02, 2.3, 0.06);
    sprig.rotation.z = deg(40);
    g.add(sprig);
    colliders.push({ x: 3.4, z: 11.2, r: 0.8 });
  }

  // ---------- training target ----------
  {
    const g = new THREE.Group();
    g.position.set(-4.2, 0, 13.6);
    g.rotation.y = deg(22);
    root.add(g);
    const legMat = toon(0x6b4b2e);
    [-0.55, 0.55].forEach((x) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.3, 6), legMat);
      leg.position.set(x * 0.7, 1.1, x * 0.25);
      leg.rotation.z = x * 0.2;
      leg.castShadow = true;
      g.add(leg);
    });
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.16, 22), toon(0xd9c38b));
    disc.rotation.x = Math.PI / 2;
    disc.position.set(0, 1.65, 0.15);
    disc.castShadow = true;
    g.add(disc);
    [0.55, 0.3, 0.12].forEach((r, i) => {
      const ring = new THREE.Mesh(new THREE.CircleGeometry(r, 24), toon(i === 0 ? 0xb45b46 : i === 1 ? 0xf0e3bd : 0xb45b46));
      ring.position.set(0, 1.65, 0.24 + i * 0.006);
      g.add(ring);
    });
    // arrows stuck in the target
    for (let i = 0; i < 3; i++) {
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.55, 4), toon(0xe4d6b0));
      a.position.set(-0.2 + i * 0.2, 1.6 + (i % 2) * 0.18, 0.5);
      a.rotation.x = deg(75);
      g.add(a);
    }
    colliders.push({ x: -4.2, z: 13.6, r: 0.85 });
  }

  // ---------- big trees, bushes, rocks ----------
  const bigTrees = [
    [19, 15, 1.65], [-20, -15.5, 1.75], [4.5, -21, 1.5], [-16, 16.5, 1.35],
    [20, -4, 1.2], [-21, 3, 1.25],
  ];
  bigTrees.forEach(([x, z, s]) => addTree(x, z, s, 1));

  const innerTrees = [
    [-8.5, 13], [8.8, 15.5], [17.5, 6.5], [-17, -7], [-9.5, -12.5],
    [7.5, -15], [17, -18], [-18, -19], [9.5, -23], [-25, 10], [24, 9],
    [-14, -22], [23, -12], [-23, -4], [14, 18], [2, 22], [-11, 21.5],
  ];
  innerTrees.forEach(([x, z]) => addTree(x, z, 0.72 + Math.random() * 0.35));

  // border forest ring
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * TAU + (Math.random() - 0.5) * 0.1;
    const r = 29 + Math.random() * 8;
    addTree(Math.cos(a) * r, Math.sin(a) * r, 1.1 + Math.random() * 0.75, 1);
  }
  // low filler bushes
  const bushSpots = [
    [5.2, 11.4], [-7.2, 9.8], [12.5, 8.5],
    [-14.5, 3], [7.6, -7.5], [-8.6, -8.8], [14.6, -6.2], [-4.5, -9.8], [16, 2.5],
    [-6, -6], [-15, 12.5], [11, 12], [2, -12], [-19, 8], [6, -19],
  ];
  bushSpots.forEach(([x, z]) => addBush(x, z, 0.8 + Math.random() * 0.5));

  // rocks with moss
  const rockSpots = [
    [-6.4, 8.2, 1.1], [-5.2, 8.9, 0.65], [19.6, 11.2, 0.9], [8, 12.6, 0.7],
    [-10.4, -9.6, 0.95], [17.2, -13.2, 0.8], [-3.4, -16.5, 1.2], [12.2, -19, 0.85],
    [-19.5, -2.4, 1.1], [5.2, 18.2, 0.7], [21, 3.2, 0.9], [-16.4, -10.5, 0.7],
  ];
  rockSpots.forEach(([x, z, s]) => {
    inc.rocks.push({
      x, z, y: 0.3 * s, sx: 0.9 * s, sy: 0.65 * s, sz: 0.8 * s,
      rx: Math.random(), ry: Math.random() * TAU, rz: Math.random(),
      color: [0x9a9b8a, 0x8c9182, 0xa6a595][Math.floor(Math.random() * 3)],
    });
    inc.moss.push({
      x: x + 0.05, z: z - 0.04, y: 0.86 * s, sx: 0.78 * s, sy: 0.2 * s, sz: 0.7 * s,
      ry: Math.random() * TAU, color: [0x688c43, 0x789b4a, 0x5d7e3c][Math.floor(Math.random() * 3)],
    });
    if (s > 0.8) colliders.push({ x, z, r: 0.8 * s });
  });

  // ---------- hide spots ----------
  const patchTex = softPatchTexture();
  function addPatch(x, z, r, color, opacity = 0.92, y = 0.031) {
    const mat = toon(color, {
      transparent: true, opacity, map: patchTex, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(r, 32), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.rotation.z = Math.random() * TAU;
    root.add(mesh);
    return mesh;
  }
  function addTuft(x, z, color, scale = 1) {
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * TAU, r = Math.random() * 0.45 * scale;
      inc.tufts.push({
        x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, y: 0,
        sx: scale * (0.7 + Math.random() * 0.5), sy: scale * (0.8 + Math.random() * 0.7), sz: scale,
        ry: Math.random() * TAU, color,
      });
    }
  }
  function addPebbles(x, z, color, count = 7, radius = 1.2) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU, r = Math.random() * radius;
      inc.pebbles.push({
        x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, y: 0.03 + Math.random() * 0.02,
        sx: 0.07 + Math.random() * 0.09, sy: 0.03 + Math.random() * 0.035, sz: 0.07 + Math.random() * 0.09,
        ry: Math.random() * TAU, color,
      });
    }
  }
  function addFlowers(x, z, color, count = 26, radius = 1.5, height = 0.2) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * radius;
      const fx = x + Math.cos(a) * r, fz = z + Math.sin(a) * r;
      const h = height + Math.random() * 0.18;
      inc.flowerHeads.push({
        x: fx, z: fz, y: h, sx: 0.6 + Math.random() * 0.5, sy: 0.6 + Math.random() * 0.5, sz: 0.6 + Math.random() * 0.5,
        ry: Math.random() * TAU, color: color ?? [0xf4edcf, 0xf1cf86, 0xe5a6bd][Math.floor(Math.random() * 3)],
      });
      inc.flowerStems.push({ x: fx, z: fz, y: 0, sx: 0.8, sy: h, sz: 0.8, ry: 0, color: 0x527a36 });
    }
  }

  // spot: grass
  addPatch(4.4, 6.2, 2.0, 0x6f9a48, 0.9);
  addTuft(4.4, 6.2, 0x7ba54e, 1.3);
  addTuft(3.7, 6.7, 0x88b35a, 1.05);
  addTuft(5.1, 5.7, 0x679245, 1.1);
  addFlowers(4.4, 6.2, 0xe8dcc0, 5, 1.5, 0.2);
  hideSpots.push({ id: 'grass', x: 4.4, z: 6.2, y: 0.02, color: 0x6f9a48, name: '풀숲', kind: 'grass', size: 1.0 });

  // spot: dirt path
  addPatch(0.4, -8.5, 1.65, 0xb08a5f, 0.7, 0.045);
  addPebbles(0.4, -8.5, 0x8f8a79, 9, 1.6);
  addTuft(-0.9, -7.8, 0x6f9a48, 0.6);
  addTuft(1.7, -9.3, 0x6f9a48, 0.7);
  hideSpots.push({ id: 'dirt', x: 0.4, z: -8.5, y: 0.02, color: 0xb08a5f, name: '흙길', kind: 'dirt', size: 1.0 });

  // spot: pond shore puddle
  const puddleMat = new THREE.MeshPhysicalMaterial({
    color: 0x6fa9a4, roughness: 0.12, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.15,
    transparent: true, opacity: 0.92,
  });
  const puddle = new THREE.Mesh(new THREE.CircleGeometry(1.5, 32), puddleMat);
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.set(-6.3, 0.038, -2.3);
  puddle.scale.set(1.05, 1, 0.72);
  root.add(puddle);
  addPatch(-6.3, -2.3, 1.7, 0x9c7f58, 0.55, 0.03);
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * TAU;
    inc.reeds.push({
      x: -6.3 + Math.cos(a) * 1.75, z: -2.3 + Math.sin(a) * 1.35, y: 0,
      sx: 1, sy: 1 + Math.random() * 0.7, sz: 1, ry: Math.random() * TAU,
      color: [0x6e8f42, 0x7fa24c, 0x5d7d38][i % 3],
    });
  }
  hideSpots.push({ id: 'water', x: -6.3, z: -2.3, y: 0.04, color: 0x6fa9a4, name: '물가', kind: 'water', size: 1.05 });

  // spot: mossy rock
  addPatch(-5.9, 7.4, 1.9, 0x6d8a4c, 0.92);
  addTuft(-5.9, 7.4, 0x6a8c42, 1.25);
  addTuft(-6.6, 7.9, 0x7c9d4e, 1.0);
  addPebbles(-6.2, 6.9, 0x8c8d7a, 5, 1.1);
  inc.rocks.push({ x: -5.4, z: 8.3, y: 0.32, sx: 0.85, sy: 0.6, sz: 0.75, rx: 0.2, ry: 1.4, rz: 0.1, color: 0x8f9381 });
  inc.moss.push({ x: -5.4, z: 8.3, y: 0.82, sx: 0.7, sy: 0.16, sz: 0.62, ry: 1, color: 0x6a8c43 });
  hideSpots.push({ id: 'moss', x: -5.9, z: 7.4, y: 0.02, color: 0x6d8a4c, name: '이끼바위', kind: 'moss', size: 1.0 });

  // spot: flower bed
  addPatch(7.6, 8.3, 2.2, 0xcf93aa, 0.85);
  addFlowers(7.6, 8.3, 0xe6a6bd, 38, 1.9, 0.22);
  addFlowers(7.6, 8.3, 0xf4e7cd, 20, 1.8, 0.2);
  addFlowers(7.6, 8.3, 0xe8c06e, 12, 1.7, 0.24);
  hideSpots.push({ id: 'flower', x: 7.6, z: 8.3, y: 0.02, color: 0xcf93aa, name: '꽃밭', kind: 'flower', size: 0.98 });

  // spot: log pile
  addPatch(13.2, 1.4, 1.8, 0x9a6b42, 0.82);
  for (let i = 0; i < 3; i++) {
    inc.logs.push({
      x: 13.2 + (i === 2 ? 0 : -0.32 + i * 0.32), z: 2.45, y: 0.22 + (i === 2 ? 0.46 : 0),
      sx: 1, sy: 1, sz: 1, rx: 0, ry: 0.08, rz: 0,
      color: [0x8a5f3a, 0x9a6b42, 0x7e5634][i],
    });
  }
  inc.logs.push({ x: 13.4, z: 2.1, y: 0.22, sx: 0.9, sy: 0.9, sz: 0.9, rx: 0.2, ry: 0.5, rz: 0, color: 0x93653d });
  addTuft(12.2, 1.1, 0x6f9a48, 0.6);
  hideSpots.push({ id: 'wood', x: 13.2, z: 1.4, y: 0.02, color: 0x9a6b42, name: '장작더미', kind: 'wood', size: 1.0 });

  // spot: dark tree roots
  addPatch(-2.4, -12.6, 2.0, 0x506f38, 0.92);
  addTuft(-2.4, -12.6, 0x557a3c, 1.2);
  addTuft(-1.5, -12.1, 0x638742, 0.95);
  addTuft(-3.4, -13.2, 0x486b33, 1.0);
  inc.logs.push({ x: -2.9, z: -11.9, y: 0.16, sx: 1.4, sy: 1.4, sz: 1.4, rx: 0.1, ry: 0.9, rz: 0, color: 0x62462f });
  inc.logs.push({ x: -1.2, z: -13.4, y: 0.14, sx: 1.1, sy: 1.1, sz: 1.1, rx: 0.2, ry: -0.4, rz: 0, color: 0x6b4c32 });
  addPebbles(-2.4, -12.6, 0x79815f, 4, 1.4);
  hideSpots.push({ id: 'dark', x: -2.4, z: -12.6, y: 0.02, color: 0x506f38, name: '나무뿌리', kind: 'dark', size: 1.0 });

  // spot: straw bales
  addPatch(10.7, -12.0, 1.8, 0xc2a45f, 0.88);
  {
    const baleMat = toon(0xc2a45f);
    const bandMat = toon(0x8f6e3d);
    const bale = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 0.9), baleMat);
    bale.position.set(11.6, 0.4, -13.1);
    bale.rotation.y = 0.25;
    bale.castShadow = true; bale.receiveShadow = true;
    root.add(bale);
    [-0.35, 0.35].forEach((o) => {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.85, 0.94), bandMat);
      band.position.set(11.6 + o, 0.4, -13.1);
      band.rotation.y = 0.25;
      root.add(band);
    });
  }
  addTuft(9.6, -11.4, 0x7fa24c, 0.7);
  addFlowers(10.7, -12.0, 0xd9c58b, 10, 1.4, 0.16);
  hideSpots.push({ id: 'straw', x: 10.7, z: -12.0, y: 0.02, color: 0xc2a45f, name: '건초더미', kind: 'straw', size: 0.98 });

  // spot: pale fence
  addPatch(16.8, 7.8, 1.7, 0xc1a172, 0.8);
  {
    for (let i = 0; i < 5; i++) {
      inc.fencePosts.push({ x: 15.4 + i * 0.8, y: 0.5, z: 9.25, color: 0xc1a172 });
      inc.fencePosts.push({ x: 15.4 + i * 0.85, y: 0.5, z: 6.4, color: 0xb99a6d });
      if (i < 4) {
        inc.fenceRails.push({ x: 15.8 + i * 0.82, y: 0.45, z: 9.25, sx: 0.85, sy: 0.06, sz: 0.045, ry: 0, color: 0xcaa976 });
        inc.fenceRails.push({ x: 15.8 + i * 0.85, y: 0.7, z: 9.25, sx: 0.85, sy: 0.06, sz: 0.045, ry: 0, color: 0xcaa976 });
      }
    }
    colliders.push({ x: 16.8, z: 9.25, r: 0.9 });
    colliders.push({ x: 16.8, z: 6.4, r: 0.9 });
  }
  addTuft(17.4, 7.2, 0x7fa24c, 0.8);
  hideSpots.push({ id: 'pale', x: 16.8, z: 7.8, y: 0.02, color: 0xc1a172, name: '울타리', kind: 'pale', size: 0.98 });

  // spot: stepping stones
  addPatch(-4.5, -5.0, 1.8, 0x9c9e8c, 0.9);
  [[-4.5, -5.0, 1.0], [-5.6, -4.2, 0.7], [-3.4, -5.8, 0.65]].forEach(([x, z, s]) => {
    inc.stones.push({ x, z, y: 0.035, sx: s, sy: 1, sz: s * 0.85, ry: Math.random() * TAU, color: 0x9c9e8c });
  });
  addTuft(-3.6, -4.2, 0x6f9a48, 0.6);
  hideSpots.push({ id: 'stone2', x: -4.5, z: -5.0, y: 0.02, color: 0x9c9e8c, name: '디딤돌', kind: 'stone2', size: 1.0 });

  // ---------- lanterns ----------
  const lanternLights = [];
  const lanternSpots = [[4.9, 1.8], [-4.9, 1.8], [10.4, 9.4], [-10.6, -7.6], [0.8, 12.5]];
  lanternSpots.forEach(([x, z], idx) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    root.add(g);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 2.5, 6), toon(0x513a26));
    post.position.y = 1.25; post.castShadow = true; g.add(post);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.55, 5), toon(0x513a26));
    arm.rotation.z = Math.PI / 2; arm.position.set(0.24, 2.42, 0); g.add(arm);
    const cage = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.16, 6), toon(0x5d452c));
    cage.position.set(0.48, 2.52, 0); g.add(cage);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd37a });
    const bulb = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), glowMat);
    bulb.position.set(0.48, 2.3, 0); g.add(bulb);
    const light = new THREE.PointLight(0xffb95e, idx < 3 ? 6 : 0, 10, 2);
    light.position.set(0.48, 2.3, 0);
    g.add(light);
    lanternLights.push({ light, bulb, base: idx < 3 ? 6 : 0, seed: Math.random() * 10 });
    colliders.push({ x, z, r: 0.3 });
  });

  // ---------- benches ----------
  [[2.9, 3.4, -0.6], [-3.0, 3.6, 0.5]].forEach(([x, z, r]) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = r;
    root.add(g);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.5), toon(0x8b613c));
    seat.position.y = 0.5; seat.castShadow = true; g.add(seat);
    [-0.55, 0.55].forEach((o) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.4), toon(0x6f4a2c));
      leg.position.set(o, 0.25, 0); leg.castShadow = true; g.add(leg);
    });
    colliders.push({ x, z, r: 0.85 });
  });

  // ---------- grass field ----------
  const rnd = seeded(1337);
  function nearPath(x, z, pad = 1.25) {
    for (const pair of pathPoints) {
      const [a, b] = pair;
      const vx = b[0] - a[0], vz = b[1] - a[1];
      const wx = x - a[0], wz = z - a[1];
      const t = clamp((wx * vx + wz * vz) / (vx * vx + vz * vz), 0, 1);
      const dx = wx - vx * t, dz = wz - vz * t;
      if (dx * dx + dz * dz < pad * pad) return true;
    }
    return false;
  }
  function blockedForGrass(x, z) {
    if (x * x + z * z < 7.1 * 7.1) return true;
    if ((x - pondPos.x) ** 2 + (z - pondPos.z) ** 2 < 5.4 * 5.4) return true;
    if (x > 7.6 && x < 14.4 && z > 1.8 && z < 7.2) return true;
    if (nearPath(x, z, 1.35)) return true;
    for (const c of colliders) {
      if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + 0.2) ** 2) return true;
    }
    return false;
  }
  for (let i = 0; i < 4200; i++) {
    const a = rnd() * TAU, r = 6.6 + Math.sqrt(rnd()) * 27;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (blockedForGrass(x, z)) continue;
    inc.grass.push({
      x, z, y: 0,
      sx: 0.55 + rnd() * 0.9, sy: 0.55 + rnd() * 1.0, sz: 0.55 + rnd() * 0.9,
      ry: rnd() * TAU,
      color: [0x527a39, 0x669044, 0x7aa350, 0x486d33, 0x86ad5a][Math.floor(rnd() * 5)],
    });
  }
  for (let i = 0; i < 420; i++) {
    const a = rnd() * TAU, r = 7 + Math.sqrt(rnd()) * 26;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (blockedForGrass(x, z)) continue;
    const c = [0xf4edcf, 0xf1cf86, 0xe5a6bd, 0xc7d9f0, 0xe8b0a0][Math.floor(rnd() * 5)];
    inc.flowerHeads.push({
      x, z, y: 0.18 + rnd() * 0.14, sx: 0.7 + rnd() * 0.6, sy: 0.7 + rnd() * 0.6, sz: 0.7 + rnd() * 0.6,
      ry: rnd() * TAU, color: c,
    });
    inc.flowerStems.push({ x, z, y: 0, sx: 0.7, sy: 0.24, sz: 0.7, ry: 0, color: 0x527a36 });
  }
  // mushrooms near trees
  for (let i = 0; i < 46; i++) {
    const a = rnd() * TAU, r = 9 + Math.sqrt(rnd()) * 20;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (blockedForGrass(x, z)) continue;
    const s = 0.7 + rnd() * 0.9;
    inc.mushrooms.push({ x, z, y: 0, sx: s, sy: s, sz: s, ry: 0, color: 0xe7dcc4 });
    inc.mushroomCaps.push({ x, z, y: 0.2 * s, sx: s, sy: s * 0.7, sz: s, ry: 0, color: [0xb85b47, 0xc47a52, 0xd9a15b][Math.floor(rnd() * 3)] });
  }

  // lily pads
  [[ -13.2, -3.1, 0.55 ], [-11.2, -5.5, 0.45], [-10.2, -3.4, 0.5], [-13.6, -5.2, 0.4], [-12.2, -2.1, 0.34]].forEach(([x, z, s]) => {
    inc.lilies.push({ x, z, y: 0.055, sx: s, sy: 1, sz: s, ry: Math.random() * TAU, color: 0x5f8f4a });
  });
  addFlowers(pondPos.x - 3.4, pondPos.z + 4.6, null, 14, 0.8, 0.22);

  // ---------- clouds ----------
  for (let i = 0; i < 9; i++) {
    const a = rnd() * TAU, r = 55 + rnd() * 35;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, y = 26 + rnd() * 12;
    for (let j = 0; j < 4; j++) {
      inc.clouds.push({
        x: x + (j - 1.5) * 5.5 + rnd() * 3, y: y + rnd() * 2.5, z: z + rnd() * 4,
        sx: 5 + rnd() * 4, sy: 1.8 + rnd() * 1.4, sz: 3.4 + rnd() * 2,
        ry: rnd() * TAU, color: 0xfdf8dc,
      });
    }
  }

  // ---------- build instanced meshes ----------
  function createInstanced(geo, mat, list, { cast = false, receive = false, apply = null } = {}) {
    if (!list.length) return null;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    list.forEach((it, i) => {
      dummy.position.set(it.x, it.y, it.z);
      dummy.scale.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1);
      dummy.rotation.set(it.rx ?? 0, it.ry ?? 0, it.rz ?? 0);
      if (apply) apply(dummy, it);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (it.color != null) mesh.setColorAt(i, col.set(it.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    root.add(mesh);
    return mesh;
  }

  const foliageGeo = new THREE.IcosahedronGeometry(1, 1);
  createInstanced(foliageGeo, toon(0xffffff), inc.foliage, { cast: true, receive: true });
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.78, 2, 7, 1);
  const trunkMat = toon(0xffffff, { map: barkTex });
  createInstanced(trunkGeo, trunkMat, inc.trunks, { cast: true, receive: true });

  const grassGeo = new THREE.ConeGeometry(0.055, 0.48, 3, 1);
  grassGeo.translate(0, 0.22, 0);
  const grassMat = toon(0xffffff, { side: THREE.DoubleSide });
  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      #else
        vec3 iPos = vec3(0.0);
      #endif
      float sway = sin(uTime * 1.7 + iPos.x * 0.55 + iPos.z * 0.41) * 0.075;
      sway += sin(uTime * 2.6 + iPos.z * 0.8) * 0.03;
      transformed.x += sway * max(transformed.y - 0.05, 0.0) * 2.2;
      transformed.z += sway * 0.5 * max(transformed.y - 0.05, 0.0) * 2.2;`
    );
  };
  grassMat.customProgramCacheKey = () => 'grasssway';
  createInstanced(grassGeo, grassMat, inc.grass, { receive: true });

  const tuftGeo = new THREE.ConeGeometry(0.06, 0.55, 3, 1);
  tuftGeo.translate(0, 0.27, 0);
  createInstanced(tuftGeo, grassMat, inc.tufts, { receive: true });

  const flowerGeo = new THREE.IcosahedronGeometry(0.075, 0);
  createInstanced(flowerGeo, toon(0xffffff), inc.flowerHeads, { cast: false });
  const stemGeo = new THREE.CylinderGeometry(0.008, 0.012, 1, 3);
  stemGeo.translate(0, 0.5, 0);
  createInstanced(stemGeo, toon(0xffffff), inc.flowerStems, {});

  const pebbleGeo = new THREE.DodecahedronGeometry(1, 0);
  createInstanced(pebbleGeo, toon(0xffffff), inc.pebbles, { cast: false, receive: true });

  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  createInstanced(rockGeo, toon(0xffffff), inc.rocks, { cast: true, receive: true });
  const mossGeo = new THREE.IcosahedronGeometry(1, 0);
  createInstanced(mossGeo, toon(0xffffff), inc.moss, { cast: false, receive: true });

  const logGeo = new THREE.CylinderGeometry(0.22, 0.24, 2.4, 8);
  logGeo.rotateZ(Math.PI / 2);
  createInstanced(logGeo, toon(0xffffff, { map: woodTex }), inc.logs, { cast: true, receive: true });

  const reedGeo = new THREE.ConeGeometry(0.035, 1.2, 4);
  reedGeo.translate(0, 0.6, 0);
  createInstanced(reedGeo, toon(0xffffff, { side: THREE.DoubleSide }), inc.reeds, {});

  const lilyGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.04, 9);
  createInstanced(lilyGeo, toon(0xffffff), inc.lilies, {});

  const stoneGeo = new THREE.CylinderGeometry(1, 1.05, 0.09, 7);
  createInstanced(stoneGeo, toon(0xffffff), inc.stones, { receive: true });

  const mushStemGeo = new THREE.CylinderGeometry(0.025, 0.04, 0.22, 5);
  mushStemGeo.translate(0, 0.11, 0);
  createInstanced(mushStemGeo, toon(0xffffff), inc.mushrooms, {});
  const mushCapGeo = new THREE.SphereGeometry(0.11, 8, 5, 0, TAU, 0, Math.PI / 2);
  createInstanced(mushCapGeo, toon(0xffffff), inc.mushroomCaps, { cast: true });

  const fencePostGeo = new THREE.BoxGeometry(0.12, 1, 0.12);
  const fencePostMesh = createInstanced(fencePostGeo, toon(0xffffff, { map: woodTex }), inc.fencePosts.map((p) => ({ ...p, sy: 1.0 })), { cast: true });
  const fenceRailGeo = new THREE.BoxGeometry(1, 1, 1);
  createInstanced(fenceRailGeo, toon(0xffffff), inc.fenceRails, { cast: true });

  const cloudGeo = new THREE.IcosahedronGeometry(1, 1);
  const cloudMesh = createInstanced(cloudGeo, toon(0xffffff, { fog: false }), inc.clouds, {});
  if (cloudMesh) cloudMesh.castShadow = false;

  // ---------- pollen ----------
  const pollenCount = 220;
  const pollenGeo = new THREE.BufferGeometry();
  const pollenPos = new Float32Array(pollenCount * 3);
  const pollenData = [];
  for (let i = 0; i < pollenCount; i++) {
    const a = rnd() * TAU, r = Math.sqrt(rnd()) * 26;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, y = 0.4 + rnd() * 5.2;
    pollenPos.set([x, y, z], i * 3);
    pollenData.push({ x, y, z, phase: rnd() * TAU, speed: 0.1 + rnd() * 0.3, vy: 0.05 + rnd() * 0.15 });
  }
  pollenGeo.setAttribute('position', new THREE.BufferAttribute(pollenPos, 3));
  const pollenMat = new THREE.PointsMaterial({
    color: 0xfff3c4, size: 0.16, sizeAttenuation: true, transparent: true, opacity: 0.75,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pollen = new THREE.Points(pollenGeo, pollenMat);
  root.add(pollen);
  updaters.push((dt, t) => {
    const arr = pollenGeo.attributes.position.array;
    for (let i = 0; i < pollenCount; i++) {
      const p = pollenData[i];
      p.x += Math.sin(t * 0.5 + p.phase) * p.speed * dt;
      p.z += Math.cos(t * 0.4 + p.phase * 1.3) * p.speed * dt;
      p.y += p.vy * dt * 0.4;
      if (p.y > 7) p.y = 0.4;
      if (p.x * p.x + p.z * p.z > 27 * 27) {
        const a2 = Math.atan2(p.z, p.x);
        p.x = Math.cos(a2) * 26;
        p.z = Math.sin(a2) * 26;
      }
      arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
    }
    pollenGeo.attributes.position.needsUpdate = true;
  });

  // ---------- day progress ----------
  const skyDay = {
    top: [new THREE.Color('#93cbb8'), new THREE.Color('#f2b57c'), new THREE.Color('#63527c')],
    horizon: [new THREE.Color('#f8f1d5'), new THREE.Color('#ffd7a1'), new THREE.Color('#c08484')],
    fog: [new THREE.Color('#dce9ca'), new THREE.Color('#f0c8a3'), new THREE.Color('#8f7284')],
    sun: [new THREE.Color('#ffe9bb'), new THREE.Color('#ffbc74'), new THREE.Color('#e08b71')],
    hemiSky: [new THREE.Color('#e8f5d8'), new THREE.Color('#ffe2b8'), new THREE.Color('#9a8aa8')],
  };
  let lastProgress = -1;
  function sample(colors, p) {
    if (p < 0.62) return colors[0].clone().lerp(colors[1], smoothstep(0.0, 0.62, p));
    return colors[1].clone().lerp(colors[2], smoothstep(0.62, 1.0, p));
  }
  function setProgress(p) {
    p = clamp(p, 0, 1);
    if (Math.abs(p - lastProgress) < 0.002) return;
    lastProgress = p;
    const top = sample(skyDay.top, p);
    const horizon = sample(skyDay.horizon, p);
    skyUniforms.uTop.value.copy(top);
    skyUniforms.uHorizon.value.copy(horizon);
    skyUniforms.uSun.value.copy(sample(skyDay.sun, p));
    scene.fog.color.copy(sample(skyDay.fog, p));
    sun.color.copy(sample(skyDay.sun, p));
    sun.intensity = lerp(2.7, 1.35, smoothstep(0, 1, p));
    hemi.color.copy(sample(skyDay.hemiSky, p));
    hemi.intensity = lerp(0.85, 0.55, p);
    fill.intensity = lerp(0.5, 0.25, p);
    scene.fog.near = lerp(34, 26, p);
    scene.fog.far = lerp(82, 64, p);
    lanternLights.forEach((l) => { if (l.base > 0) l.base = lerp(3, 8, p); });
    skyUniforms.uSunDir.value.copy(sun.position).normalize();
  }
  setProgress(0.08);

  // ---------- update ----------
  function update(dt, t) {
    timeUniform.value = t;
    updaters.forEach((fn) => fn(dt, t));
    lanternLights.forEach((l) => {
      const flicker = 0.86 + Math.sin(t * 7.3 + l.seed) * 0.07 + Math.sin(t * 13.7 + l.seed * 2) * 0.05;
      if (l.base > 0) l.light.intensity = l.base * flicker;
    });
    if (cloudMesh) {
      // clouds drift very slowly
      cloudMesh.position.x = Math.sin(t * 0.01) * 2;
    }
  }

  return {
    root, scene, colliders, hideSpots, update, setProgress, pal, sun,
    spawn: new THREE.Vector3(0, 0, 10.5),
    bounds: 27,
    pond: { x: pondPos.x, z: pondPos.z, r: pondR },
  };
}
