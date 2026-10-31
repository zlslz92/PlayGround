import * as THREE from 'three';
import {
  addOutline, angleLerp, clamp, damp, leafGeometry, lerp, toon,
} from './utils.js';
import { makeDressTexture, makeLeatherTexture, makeWoodTexture } from './textures.js';

const OUTLINE = 0x2c2418;

function addPart(parent, geo, mat, opts = {}) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(opts.x ?? 0, opts.y ?? 0, opts.z ?? 0);
  mesh.rotation.set(opts.rx ?? 0, opts.ry ?? 0, opts.rz ?? 0);
  mesh.scale.set(opts.sx ?? 1, opts.sy ?? 1, opts.sz ?? 1);
  mesh.castShadow = opts.castShadow ?? true;
  mesh.receiveShadow = opts.receiveShadow ?? false;
  parent.add(mesh);
  if (opts.outline) addOutline(mesh, opts.outlineScale ?? 1.06, OUTLINE);
  return mesh;
}

export function createElf() {
  const root = new THREE.Group();
  root.name = 'Lyra';
  const body = new THREE.Group();
  root.add(body);

  // ---------------- materials ----------------
  const skin = toon(0xf3c8a4);
  const skinDark = toon(0xe6b28c);
  const hair = toon(0xeab867);
  const hairLight = toon(0xf6d48d);
  const hairDark = toon(0xd39c4d);
  const leaf = toon(0x5f8434, { side: THREE.DoubleSide });
  const leafDark = toon(0x456b2a, { side: THREE.DoubleSide });
  const leafLight = toon(0x81a54c, { side: THREE.DoubleSide });
  const dressTex = makeDressTexture();
  const leatherTex = makeLeatherTexture();
  const woodTex = makeWoodTexture();
  const dress = toon(0xffffff, { map: dressTex });
  const leather = toon(0xffffff, { map: leatherTex });
  const leatherDark = toon(0x5d4129);
  const gold = toon(0xd8b25f);
  const wood = toon(0xffffff, { map: woodTex });
  const bowWood = toon(0x7d4f2d);
  const stringMat = new THREE.LineBasicMaterial({ color: 0xf3e8c8 });
  const eyeWhite = toon(0xfaf5e6);
  const iris = toon(0x6a7f2c);
  const pupil = toon(0x2a2117);
  const browMat = toon(0xa4682f);
  const lip = toon(0xb6675f);

  // ---------------- legs ----------------
  const legL = new THREE.Group();
  const legR = new THREE.Group();
  legL.position.set(-0.085, 0.9, 0);
  legR.position.set(0.085, 0.9, 0);
  body.add(legL, legR);

  function buildLeg(group, side) {
    addPart(group, new THREE.CylinderGeometry(0.07, 0.055, 0.4, 9), skin,
      { y: -0.2, outline: true, outlineScale: 1.09 });
    const knee = new THREE.Group();
    knee.position.set(0, -0.4, 0);
    group.add(knee);
    addPart(knee, new THREE.SphereGeometry(0.058, 9, 7), skin, { y: 0.01 });
    addPart(knee, new THREE.CylinderGeometry(0.052, 0.037, 0.4, 9), skin,
      { y: -0.2, outline: true, outlineScale: 1.1 });
    // sandal sole
    addPart(knee, new THREE.BoxGeometry(0.105, 0.035, 0.235), leatherDark,
      { y: -0.4, z: 0.045, outline: true, outlineScale: 1.1 });
    addPart(knee, new THREE.SphereGeometry(0.048, 7, 5), skin,
      { y: -0.375, z: 0.06, sx: 0.9, sy: 0.7, sz: 1.35 });
    // sandal straps
    for (let i = 0; i < 3; i++) {
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.009, 4, 10, Math.PI), leatherDark);
      strap.position.set(0, -0.325 + i * 0.025, 0.03 + i * 0.025);
      strap.rotation.x = Math.PI / 2;
      strap.rotation.z = i * 0.2;
      knee.add(strap);
    }
    // ankle wrap
    addPart(knee, new THREE.CylinderGeometry(0.048, 0.048, 0.05, 8), leather,
      { y: -0.335, outline: false });
    if (side > 0) {
      addPart(group, new THREE.TorusGeometry(0.072, 0.012, 4, 12), leather,
        { y: -0.23, rx: Math.PI / 2, outline: false });
    }
    return knee;
  }
  const kneeL = buildLeg(legL, -1);
  const kneeR = buildLeg(legR, 1);

  // ---------------- torso ----------------
  const torso = new THREE.Group();
  torso.position.set(0, 0.02, 0);
  body.add(torso);

  // skirt
  const skirt = addPart(torso, new THREE.CylinderGeometry(0.145, 0.235, 0.3, 14, 1, true), dress,
    { y: -0.13, sz: 0.78, outline: true, outlineScale: 1.05 });
  addPart(torso, new THREE.CylinderGeometry(0.15, 0.15, 0.035, 14), leather,
    { y: 0.01, sz: 0.8, outline: false });
  addPart(torso, new THREE.BoxGeometry(0.07, 0.055, 0.03), gold,
    { y: 0.01, z: 0.125 });
  // hanging leaf panels
  const panelAngles = [0, Math.PI, Math.PI * 0.5, Math.PI * 1.5];
  panelAngles.forEach((a, i) => {
    const len = i < 2 ? 0.52 : 0.4;
    const geo = leafGeometry(0.34, len, 0.012);
    const panel = new THREE.Mesh(geo, i % 2 ? leafDark : leaf);
    panel.position.set(Math.sin(a) * 0.19, -0.27 - len * 0.28, Math.cos(a) * 0.17);
    panel.rotation.set(Math.PI, (a + Math.PI) % (Math.PI * 2), 0);
    panel.rotation.z = Math.sin(a) * 0.16;
    panel.castShadow = true;
    torso.add(panel);
  });
  // side sash
  addPart(torso, new THREE.CylinderGeometry(0.152, 0.17, 0.055, 14), leather,
    { y: -0.42, sz: 0.8, outline: false });

  // bodice
  addPart(torso, new THREE.CylinderGeometry(0.16, 0.135, 0.4, 14), dress,
    { y: 0.23, sz: 0.72, outline: true, outlineScale: 1.05 });
  addPart(torso, new THREE.SphereGeometry(0.16, 14, 10), dress,
    { y: 0.16, sz: 0.72, sy: 0.75, outline: false });
  // neckline leaves
  for (let i = 0; i < 5; i++) {
    const a = -0.55 + i * 0.275;
    const l = new THREE.Mesh(leafGeometry(0.12, 0.24, 0.008), i % 2 ? leafLight : leaf);
    l.position.set(Math.sin(a) * 0.13, 0.39, Math.cos(a) * 0.105);
    l.rotation.set(Math.PI, -a, 0);
    torso.add(l);
  }
  // leaf shoulder pauldron (right shoulder of the model)
  for (let i = 0; i < 4; i++) {
    const l = new THREE.Mesh(leafGeometry(0.22, 0.42, 0.014), i % 2 ? leaf : leafDark);
    l.position.set(0.24 + i * 0.018, 0.38 - i * 0.018, -0.02 + i * 0.045);
    l.rotation.set(0.25, -0.55 - i * 0.25, -0.65 + i * 0.12);
    l.castShadow = true;
    torso.add(l);
  }

  // ---------------- arms ----------------
  const shoulderL = new THREE.Group();
  const shoulderR = new THREE.Group();
  shoulderL.position.set(-0.225, 0.4, 0);
  shoulderR.position.set(0.225, 0.4, 0);
  torso.add(shoulderL, shoulderR);

  function buildArm(group, side) {
    addPart(group, new THREE.SphereGeometry(0.062, 9, 7), skin, { y: -0.01 });
    addPart(group, new THREE.CylinderGeometry(0.052, 0.044, 0.3, 9), skin,
      { y: -0.16, outline: true, outlineScale: 1.12 });
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.31, 0);
    group.add(elbow);
    addPart(elbow, new THREE.SphereGeometry(0.043, 8, 6), skin, { y: 0.01 });
    addPart(elbow, new THREE.CylinderGeometry(0.044, 0.034, 0.28, 9), skin,
      { y: -0.14, outline: true, outlineScale: 1.12 });
    // bracer
    addPart(elbow, new THREE.CylinderGeometry(0.057, 0.047, 0.2, 9), leather,
      { y: -0.16, outline: true, outlineScale: 1.08 });
    addPart(elbow, new THREE.CylinderGeometry(0.051, 0.045, 0.03, 9), leafDark,
      { y: -0.07 });
    addPart(elbow, new THREE.CylinderGeometry(0.046, 0.04, 0.02, 9), gold,
      { y: -0.255 });
    // hand
    const hand = new THREE.Group();
    hand.position.set(0, -0.3, 0);
    elbow.add(hand);
    addPart(hand, new THREE.SphereGeometry(0.046, 9, 7), skin,
      { y: -0.01, sx: 0.85, sy: 1.15, sz: 0.8, outline: true, outlineScale: 1.08 });
    return { elbow, hand };
  }
  const armL = buildArm(shoulderL, -1);
  const armR = buildArm(shoulderR, 1);

  // arm leaf bands
  for (let i = 0; i < 3; i++) {
    const l = new THREE.Mesh(leafGeometry(0.08, 0.2, 0.006), leafLight);
    l.position.set(-0.245 - i * 0.03, 0.36 + i * 0.02, 0.02 + (i - 1) * 0.03);
    l.rotation.set(0.2, 0, 2.4 + i * 0.3);
    torso.add(l);
  }

  // quiver
  const quiver = new THREE.Group();
  quiver.position.set(0.16, 0.24, -0.16);
  quiver.rotation.set(0.1, 0.2, -0.35);
  torso.add(quiver);
  addPart(quiver, new THREE.CylinderGeometry(0.062, 0.05, 0.52, 10, 1, true), leather,
    { outline: true, outlineScale: 1.08 });
  addPart(quiver, new THREE.TorusGeometry(0.06, 0.012, 4, 10), leatherDark, { y: 0.25, rx: Math.PI / 2 });
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.55, 4), toon(0xe3d3a9));
    shaft.position.set(Math.cos(a) * 0.025, 0.36 + i * 0.008, Math.sin(a) * 0.025);
    quiver.add(shaft);
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 4), i % 2 ? toon(0xd8e3c2) : toon(0xc7a06f));
    fl.position.copy(shaft.position).y += 0.27;
    quiver.add(fl);
  }
  // shoulder strap
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.66, 0.026), leather);
  strap.position.set(0, 0.19, 0.112);
  strap.rotation.z = 0.52;
  torso.add(strap);
  addPart(torso, new THREE.SphereGeometry(0.035, 6, 5), gold, { x: -0.13, y: 0.37, z: 0.12 });

  // ---------------- head ----------------
  const neck = new THREE.Group();
  neck.position.set(0, 0.47, 0);
  torso.add(neck);
  addPart(neck, new THREE.CylinderGeometry(0.045, 0.052, 0.1, 9), skin, { y: 0.02, outline: true, outlineScale: 1.1 });
  const head = new THREE.Group();
  head.position.set(0, 0.14, 0);
  neck.add(head);
  const headMesh = addPart(head, new THREE.SphereGeometry(0.165, 18, 14), skin,
    { y: 0.09, sx: 0.94, sy: 1.06, sz: 0.94, outline: true, outlineScale: 1.035 });
  // chin/jaw soften
  addPart(head, new THREE.SphereGeometry(0.075, 10, 8), skin, { y: 0.0, z: 0.055, sy: 0.8 });

  // ears
  [-1, 1].forEach((s) => {
    const ear = new THREE.Group();
    ear.position.set(s * 0.145, 0.1, -0.005);
    ear.rotation.set(-0.15, 0, s * -0.95);
    head.add(ear);
    addPart(ear, new THREE.ConeGeometry(0.045, 0.2, 5), skin,
      { y: 0.09, sx: 0.8, sz: 0.55, outline: true, outlineScale: 1.12 });
    addPart(ear, new THREE.ConeGeometry(0.022, 0.13, 4), skinDark,
      { y: 0.085, z: 0.012, sx: 0.7, sz: 0.35 });
  });

  // eyes
  [-1, 1].forEach((s) => {
    const ex = s * 0.067;
    addPart(head, new THREE.SphereGeometry(0.036, 10, 8), eyeWhite,
      { x: ex, y: 0.085, z: 0.137, sx: 1.1, sy: 1.0, sz: 0.42, castShadow: false });
    addPart(head, new THREE.SphereGeometry(0.022, 10, 8), iris,
      { x: ex, y: 0.083, z: 0.152, sx: 1.0, sy: 1.05, sz: 0.35, castShadow: false });
    addPart(head, new THREE.SphereGeometry(0.012, 8, 6), pupil,
      { x: ex, y: 0.083, z: 0.163, sx: 1.0, sy: 1.15, sz: 0.3, castShadow: false });
    addPart(head, new THREE.SphereGeometry(0.0055, 6, 5), toon(0xfffdf2),
      { x: ex - 0.005, y: 0.092, z: 0.169, castShadow: false });
    // eyebrow
    addPart(head, new THREE.BoxGeometry(0.055, 0.009, 0.012), browMat,
      { x: ex, y: 0.137, z: 0.152, rz: s * 0.12, castShadow: false });
  });
  // nose
  addPart(head, new THREE.ConeGeometry(0.014, 0.03, 5), skinDark,
    { y: 0.055, z: 0.16, rx: Math.PI / 2, castShadow: false });
  // mouth
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0045, 4, 10, Math.PI), lip);
  mouth.position.set(0, 0.018, 0.152);
  mouth.rotation.set(0, 0, Math.PI);
  head.add(mouth);
  // blush
  [-1, 1].forEach((s) => {
    addPart(head, new THREE.CircleGeometry(0.022, 10), toon(0xe9a08c, { transparent: true, opacity: 0.55 }),
      { x: s * 0.095, y: 0.038, z: 0.143, rz: s * 0.2, castShadow: false });
  });

  // hair cap
  const hairMat = hair;
  const cap = addPart(head, new THREE.SphereGeometry(0.178, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), hairMat,
    { y: 0.1, z: -0.008, sx: 1.005, sy: 1.03, sz: 1.0, outline: true, outlineScale: 1.03 });
  // back hair volume
  addPart(head, new THREE.SphereGeometry(0.17, 14, 12), hairDark,
    { y: 0.08, z: -0.055, sx: 0.96, sy: 1.0, sz: 0.78 });
  // fringe strands
  const fringe = [
    [-0.12, 0.19, 0.13, -0.5, 0.75], [-0.055, 0.2, 0.155, -0.2, 0.95],
    [0.02, 0.205, 0.158, 0.1, 1.0], [0.09, 0.195, 0.14, 0.35, 0.85], [0.14, 0.17, 0.11, 0.6, 0.7],
  ];
  fringe.forEach(([x, y, z, rz, sc], i) => {
    const strand = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.18, 5), i % 2 ? hairLight : hair);
    strand.position.set(x, y, z);
    strand.rotation.set(0.15, 0, rz + Math.PI);
    strand.scale.set(sc, sc * 1.15, 0.55);
    strand.castShadow = true;
    head.add(strand);
  });
  // side locks in front of ears
  [-1, 1].forEach((s) => {
    const lock = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.28, 5), hair);
    lock.position.set(s * 0.155, 0.02, 0.03);
    lock.rotation.set(0.1, 0, Math.PI + s * 0.08);
    lock.scale.set(1, 1, 0.6);
    lock.castShadow = true;
    head.add(lock);
  });

  // ponytail
  const ponytailBase = new THREE.Group();
  ponytailBase.position.set(0, 0.19, -0.075);
  head.add(ponytailBase);
  // hair tie puff
  addPart(ponytailBase, new THREE.SphereGeometry(0.062, 10, 8), hairLight, { y: 0.015, sx: 1.0, sy: 0.9, sz: 1.0 });
  addPart(ponytailBase, new THREE.TorusGeometry(0.05, 0.012, 4, 10), leatherDark, { y: 0.0, rx: Math.PI / 2 });
  const ponyChain = [];
  let parent = ponytailBase;
  const segs = [
    { len: 0.2, r1: 0.055, r2: 0.072, rot: 0.75 },
    { len: 0.24, r1: 0.07, r2: 0.082, rot: -0.22 },
    { len: 0.24, r1: 0.078, r2: 0.062, rot: -0.35 },
    { len: 0.22, r1: 0.058, r2: 0.028, rot: -0.45 },
  ];
  segs.forEach((cfg, i) => {
    const g = new THREE.Group();
    g.position.set(0, i === 0 ? 0.03 : -segs[i - 1].len + 0.02, 0);
    g.rotation.x = cfg.rot;
    parent.add(g);
    const geo = new THREE.CylinderGeometry(cfg.r1, cfg.r2, cfg.len, 8);
    geo.translate(0, cfg.len / 2, 0);
    addPart(g, geo, i === 3 ? hairLight : hair,
      { outline: true, outlineScale: 1.08 });
    // a highlight strand
    addPart(g, new THREE.CylinderGeometry(cfg.r1 * 0.3, cfg.r2 * 0.2, cfg.len * 0.9, 4), hairLight,
      { x: -cfg.r1 * 0.5, y: cfg.len * 0.45, z: -cfg.r1 * 0.35, castShadow: false });
    ponyChain.push({ group: g, rest: cfg.rot, length: cfg.len });
    parent = g;
  });

  // choker + leaf pendant
  addPart(neck, new THREE.TorusGeometry(0.048, 0.008, 4, 12), leatherDark, { y: 0.005, rx: Math.PI / 2 });
  const pendant = new THREE.Mesh(leafGeometry(0.055, 0.11, 0.006), leafLight);
  pendant.position.set(0, -0.035, 0.055);
  pendant.rotation.set(Math.PI, 0, 0);
  neck.add(pendant);

  // ---------------- bow ----------------
  const bowRig = new THREE.Group();
  bowRig.position.set(-0.27, 0.05, 0.12);
  torso.add(bowRig);
  const bowGroup = new THREE.Group();
  bowRig.add(bowGroup);
  const bowCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.56, 0.03),
    new THREE.Vector3(0, -0.42, 0.12),
    new THREE.Vector3(0, -0.2, 0.09),
    new THREE.Vector3(0, 0, 0.025),
    new THREE.Vector3(0, 0.2, 0.09),
    new THREE.Vector3(0, 0.42, 0.12),
    new THREE.Vector3(0, 0.56, 0.03),
  ]);
  const bowMesh = new THREE.Mesh(new THREE.TubeGeometry(bowCurve, 36, 0.014, 6, false), bowWood);
  bowMesh.castShadow = true;
  bowGroup.add(bowMesh);
  addOutline(bowMesh, 1.06, OUTLINE);
  // grip
  addPart(bowGroup, new THREE.CylinderGeometry(0.022, 0.022, 0.14, 8), leatherDark, { y: 0, z: 0.02 });
  // string
  const stringGeo = new THREE.BufferGeometry();
  const stringPositions = new Float32Array(9);
  stringGeo.setAttribute('position', new THREE.BufferAttribute(stringPositions, 3));
  const bowString = new THREE.Line(stringGeo, stringMat);
  bowGroup.add(bowString);
  // nocked arrow attached to bow
  const nockedArrow = new THREE.Group();
  const nockShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.72, 5), toon(0xe9dcb4));
  nockShaft.rotation.x = Math.PI / 2;
  nockShaft.position.z = 0.36;
  nockedArrow.add(nockShaft);
  const nockTip = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.07, 4), toon(0xbfc7c0));
  nockTip.rotation.x = Math.PI / 2;
  nockTip.position.z = 0.74;
  nockedArrow.add(nockTip);
  const nockFl = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.13, 4), toon(0xe9e3cd));
  nockFl.rotation.x = -Math.PI / 2;
  nockFl.position.z = 0.02;
  nockedArrow.add(nockFl);
  nockedArrow.visible = false;
  bowGroup.add(nockedArrow);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, 0.16);
  bowGroup.add(muzzle);

  // ---------------- state / animation ----------------
  let walkPhase = 0;
  let currentAim = 0;
  let drawAmount = 0;
  let rootYaw = 0;
  let release = 0;
  let time = 0;

  shoulderL.rotation.set(0.06, 0, 0.12);
  shoulderR.rotation.set(0.06, 0, -0.12);
  armL.elbow.rotation.set(-0.1, 0, 0);
  armR.elbow.rotation.set(-0.1, 0, 0);

  const bowRest = new THREE.Vector3(-0.31, -0.16, 0.1);
  const bowAim = new THREE.Vector3(-0.2, 0.31, 0.34);

  function update(dt, state) {
    time += dt;
    const speed = state.speed ?? 0;
    const moving = state.moving ?? speed > 0.1;
    const aimTarget = state.aimYaw ?? rootYaw;
    rootYaw = angleLerp(rootYaw, aimTarget, 1 - Math.exp(-14 * dt));
    root.rotation.y = rootYaw;

    // walk cycle
    const run = clamp(speed / 5.0, 0, 1);
    walkPhase += dt * (3.2 + speed * 1.25);
    const swing = Math.sin(walkPhase) * 0.62 * run;
    const swing2 = Math.sin(walkPhase + Math.PI) * 0.62 * run;

    const focusBlend = state.focus ? 1 : 0;
    const aimTargetBlend = state.aiming ? 1 : 0;
    currentAim = damp(currentAim, aimTargetBlend, 14, dt);
    drawAmount = damp(drawAmount, state.draw ?? 0, state.releasing ? 26 : 20, dt);
    release = Math.max(0, release - dt * 4);

    // legs
    legL.rotation.x = swing;
    legR.rotation.x = swing2;
    kneeL.rotation.x = Math.max(0, -Math.sin(walkPhase)) * 0.55 * run;
    kneeR.rotation.x = Math.max(0, -Math.sin(walkPhase + Math.PI)) * 0.55 * run;

    // body bob & lean
    const bob = Math.abs(Math.sin(walkPhase)) * 0.035 * run;
    body.position.y = bob - focusBlend * 0.04 + Math.sin(time * 1.7) * 0.006;
    torso.rotation.z = Math.sin(walkPhase) * 0.035 * run;
    torso.rotation.x = run * 0.06 + focusBlend * 0.06;

    // arms
    const armSwingL = Math.sin(walkPhase + Math.PI) * 0.38 * run;
    const armSwingR = Math.sin(walkPhase) * 0.38 * run;
    const aimL = currentAim;
    shoulderL.rotation.x = lerp(0.06 + armSwingL, -1.32, aimL) + release * 0.1;
    shoulderL.rotation.z = lerp(0.12, 0.3, aimL);
    armL.elbow.rotation.x = lerp(-0.1 + Math.max(0, -Math.sin(walkPhase)) * 0.12 * run, -0.12, aimL);

    shoulderR.rotation.x = lerp(0.06 + armSwingR, -1.15 + drawAmount * 0.12, aimL);
    shoulderR.rotation.z = lerp(-0.12, -0.6 - drawAmount * 0.25, aimL);
    armR.elbow.rotation.x = lerp(-0.1, -1.7 * Math.min(1, drawAmount + 0.15), aimL);
    armR.elbow.rotation.z = lerp(0, 0.4, aimL);

    // head look toward camera slightly / breathing
    head.rotation.y = Math.sin(time * 0.9) * 0.04 * (1 - aimL);
    head.rotation.x = -aimL * 0.06 + focusBlend * 0.04;

    // ponytail lag
    ponyChain.forEach((seg, i) => {
      const sway = Math.sin(time * 2.3 - i * 0.8) * 0.045 + Math.cos(walkPhase * 2 - i * 0.6) * 0.05 * run;
      seg.group.rotation.x = seg.rest + sway - run * 0.12 - release * 0.08;
      seg.group.rotation.z = Math.sin(time * 1.7 - i * 0.7) * 0.04 + Math.sin(walkPhase - i) * 0.06 * run;
    });

    // bow rig
    const target = bowRest.clone().lerp(bowAim, currentAim);
    target.y -= focusBlend * 0.05;
    bowRig.position.lerp(target, 1 - Math.exp(-12 * dt));
    bowRig.rotation.z = lerp(0.18, 0.04, currentAim);
    bowRig.rotation.x = Math.sin(time * 1.4) * 0.02;
    bowGroup.scale.setScalar(lerp(1, 1.04, currentAim));

    // string & nocked arrow
    const top = new THREE.Vector3(0, 0.56, 0.03);
    const bottom = new THREE.Vector3(0, -0.56, 0.03);
    const nockZ = -0.18 - drawAmount * 0.26;
    stringPositions.set([top.x, top.y, top.z, 0, 0.012 * drawAmount, nockZ, bottom.x, bottom.y, bottom.z]);
    stringGeo.attributes.position.needsUpdate = true;
    nockedArrow.visible = drawAmount > 0.04 && (state.aiming || state.releasing);
    nockedArrow.position.set(0, 0, nockZ);
    nockedArrow.scale.z = lerp(0.7, 1, drawAmount);

    // subtle whole-body crouch while focusing
    body.scale.y = lerp(1, 0.985, focusBlend);
  }

  return {
    root,
    update,
    getAimYaw() { return rootYaw; },
    getBowMuzzle(target = new THREE.Vector3()) {
      muzzle.getWorldPosition(target);
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(root.quaternion);
      target.addScaledVector(forward, 0.15);
      return target;
    },
    getForward(target = new THREE.Vector3()) {
      return target.set(0, 0, 1).applyQuaternion(root.quaternion);
    },
    triggerRelease() { release = 1; },
    setDraw(v) { drawAmount = v; },
    refs: { torso, head, bowGroup, legL, legR, shoulderL, shoulderR },
  };
}
