import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { composeSide } from './imaging.js';


// ---------------------------------------------------------------- hanger
export function makeHangerMaterial(theme) {
  return new THREE.MeshStandardMaterial({ color: theme.hanger, metalness: theme.hangerMetal ? 0.9 : 0.05, roughness: theme.hangerMetal ? 0.28 : 0.55 });
}
export function styleHangerMaterial(mat, theme) {
  mat.color.set(theme.hanger); mat.metalness = theme.hangerMetal ? 0.9 : 0.05; mat.roughness = theme.hangerMetal ? 0.28 : 0.55;
}
function buildHanger(drop, mat, halfW = 0.5, dy = 0.2) {
  const g = new THREE.Group(), top = -(0.36 + drop), r = 0.075;
  const pts = [new THREE.Vector3(0, top, 0), new THREE.Vector3(0, -r, 0)];
  for (let a = 0; a <= 250; a += 15) { const t = THREE.MathUtils.degToRad(a); pts.push(new THREE.Vector3(0, -r * Math.cos(t), r * Math.sin(t))); }
  const hook = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), 60, 0.011, 8), mat);
  const path = new THREE.CurvePath(), A = new THREE.Vector3(-halfW, top - dy, 0), B = new THREE.Vector3(0, top, 0), C = new THREE.Vector3(halfW, top - dy, 0);
  path.add(new THREE.LineCurve3(A, B)); path.add(new THREE.LineCurve3(B, C)); path.add(new THREE.LineCurve3(C, A));
  const frame = new THREE.Mesh(new THREE.TubeGeometry(path, 90, 0.011, 8, true), mat);
  hook.castShadow = frame.castShadow = true; g.add(hook, frame);
  return g;
}

// ---------------------------------------------------------------- garment (Blender-made, rigged, cloth-draped glTF)
const loader = new GLTFLoader(), styleCache = new Map();
// Loads models/<id>.glb; when a host cannot serve .glb files, falls back to models/<id>.js (the same bytes as base64).
async function fetchModel(id) {
  try { return await loader.loadAsync(`models/${id}.glb`); } catch { /* fall through */ }
  const b64 = (await import(`../models/${id}.js`)).default, bin = atob(b64), buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return loader.parseAsync(buf.buffer, '');
}
export function loadStyle(id) {
  if (!styleCache.has(id)) styleCache.set(id, fetchModel(id));
  return styleCache.get(id);
}
const Q = new THREE.Quaternion(), QA = new THREE.Quaternion(), V = new THREE.Vector3();
const AX = new THREE.Vector3(1, 0, 0), AZ = new THREE.Vector3(0, 0, 1);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// critically-damped-ish spring used for every swinging part
class Spring {
  constructor(w, z, lim = 0.6) { this.w = w; this.z = z; this.lim = lim; this.x = 0; this.v = 0; }
  step(dt, force) { const a = force - this.w * this.w * this.x - 2 * this.z * this.w * this.v; this.v += a * dt; this.x = clamp(this.x + this.v * dt, -this.lim, this.lim); return this.x; }
}

export function buildGarmentItem(product, cfg, hangerMat, G, gltf) {
  const root = new THREE.Group();
  const model = cloneSkinned(gltf.scene);
  const hasHood = !!model.getObjectByName('hood1');
  const drop = hasHood ? 0.3 : 0;
  root.add(buildHanger(drop, hangerMat, 0.5, 0.2));
  const garment = new THREE.Group(); root.add(garment); garment.add(model);

  const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
  const k = Math.min(3.3, (2.1 - drop) / size.y);
  garment.scale.setScalar(k); garment.position.y = -0.4 - drop;

  // -------- materials: fabric = photo atlas (front | back), plain = inside / rim / hood, cord = drawstrings
  const atlas = document.createElement('canvas'); atlas.width = G.W * 2; atlas.height = G.H;
  const tex = new THREE.CanvasTexture(atlas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.flipY = false;
  const fabricMat = new THREE.MeshStandardMaterial({ color: 0x666666, map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.68, roughness: 1, toneMapped: false, side: THREE.DoubleSide });
  const plainMat = new THREE.MeshStandardMaterial({ color: 0x666666, emissive: 0xffffff, emissiveIntensity: 0.68, roughness: 1, toneMapped: false, side: THREE.DoubleSide });
  const cordMat = new THREE.MeshStandardMaterial({ color: 0xd6d0c2, roughness: 0.9, toneMapped: false, emissive: 0x777066, emissiveIntensity: 0.5 });
  const pickables = [];
  model.traverse(o => {
    if (!o.isMesh) return;
    o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true;
    const n = (o.material.name || '').toLowerCase();
    o.material = n.startsWith('fabric') ? fabricMat : n.startsWith('cord') ? cordMat : plainMat;
    pickables.push(o);
  });

  // -------- rig
  const bone = n => model.getObjectByName(n);
  model.updateMatrixWorld(true);
  const rig = {};
  for (const n of ['root', 'spine1', 'spine2', 'spine3', 'sleeveL1', 'sleeveL2', 'sleeveR1', 'sleeveR2', 'hood1', 'hood2']) {
    const b = bone(n); if (!b) continue;
    const parentW = new THREE.Quaternion(); b.parent.getWorldQuaternion(parentW);
    rig[n] = { b, rest: b.quaternion.clone(), pInv: parentW.clone().invert(), pW: parentW };
  }
  const sp = {
    sL: [new Spring(6.2, 0.26), new Spring(6.2, 0.26)], sR: [new Spring(6.2, 0.26), new Spring(6.2, 0.26)],   // side swing, forward swing
    fL: [new Spring(6.8, 0.26), new Spring(6.8, 0.26)], fR: [new Spring(6.8, 0.26), new Spring(6.8, 0.26)],
    body: [new Spring(4.2, 0.4, 0.25), new Spring(4.2, 0.4, 0.25)], hood: [new Spring(5.2, 0.55, 0.22), new Spring(5.2, 0.55, 0.22)],
  };
  const prev = { x: 0, z: 0, ry: 0, vx: 0, vz: 0, w: 0, init: false };
  const setRot = (n, ax, az) => {   // rotate bone n by (ax about X, az about Z) in garment space
    const r = rig[n]; if (!r) return;
    Q.setFromAxisAngle(AX, ax); QA.setFromAxisAngle(AZ, az); Q.multiply(QA);
    Q.premultiply(r.pInv).multiply(r.pW);           // into the parent's frame
    r.b.quaternion.copy(Q).multiply(r.rest);
  };
  let t = Math.random() * 10;

  const api = {
    root, garment, body: pickables[0], pickables, hood: null, G, model, k,
    get front() { return front; },
    refresh() {
      const ctx = atlas.getContext('2d'), base = cfg.hex || G.baseHex;
      ctx.fillStyle = base; ctx.fillRect(0, 0, atlas.width, atlas.height);
      front = composeSide(G, cfg, 'front', front); ctx.drawImage(front, 0, 0);
      ctx.drawImage(composeSide(G, cfg, 'back'), G.W, 0);
      tex.needsUpdate = true;
      const c = new THREE.Color(base);
      plainMat.color.copy(c).multiplyScalar(0.4); plainMat.emissive.copy(c);
    },
    // called every frame with the item's position (rack units) and yaw: sleeves, body and hood swing from the motion
    drive(dt, x, z, ry) {
      t += dt;
      if (!prev.init) { Object.assign(prev, { x, z, ry, init: true }); }
      const vx = (x - prev.x) / dt, vz = (z - prev.z) / dt, w = (ry - prev.ry) / dt;
      const ax = clamp((vx - prev.vx) / dt, -60, 60), az = clamp((vz - prev.vz) / dt, -60, 60), al = clamp((w - prev.w) / dt, -80, 80);
      Object.assign(prev, { x, z, ry, vx, vz, w });
      const idle = Math.sin(t * 1.3) * 0.015, idle2 = Math.sin(t * 0.9 + 1.7) * 0.02;
      const g = 0.3, arm = 0.34 * k;
      // left sleeve hangs at +x, right at -x. yaw acceleration swings them fore/aft, translation swings them sideways/back
      const sL = sp.sL[0].step(dt, -ax * g * 0.7 - vx * 0.5), fL = sp.fL[0].step(dt, az * g + al * arm * 0.05 * -1);
      const sR = sp.sR[0].step(dt, -ax * g * 0.7 - vx * 0.5), fR = sp.fR[0].step(dt, az * g + al * arm * 0.05);
      const sL2 = sp.sL[1].step(dt, -ax * g - vx * 0.5 + sL * 14), fL2 = sp.fL[1].step(dt, az * g * 1.2 + fL * 14 - al * arm * 0.06);
      const sR2 = sp.sR[1].step(dt, -ax * g - vx * 0.5 + sR * 14), fR2 = sp.fR[1].step(dt, az * g * 1.2 + fR * 14 + al * arm * 0.06);
      const bz = sp.body[0].step(dt, -ax * g * 0.35), bx = sp.body[1].step(dt, az * g * 0.4);
      const hz = sp.hood[0].step(dt, -ax * g * 0.5), hx = sp.hood[1].step(dt, az * g * 0.8 + 0.0);
      setRot('spine1', bx * 0.35 + idle2 * 0.2, bz * 0.35);
      setRot('spine2', bx * 0.7, bz * 0.7 + idle * 0.3);
      setRot('spine3', bx * 1.0 + idle2 * 0.4, bz * 1.0 + idle * 0.5);
      // sleeve bones: +z rotation swings the tip toward +x; +x rotation swings the tip toward -z (back)
      setRot('sleeveL1', -fL + idle2, sL + idle * 0.6); setRot('sleeveL2', -fL2 * 0.8, sL2 * 0.9);
      setRot('sleeveR1', -fR - idle2, sR - idle * 0.6); setRot('sleeveR2', -fR2 * 0.8, sR2 * 0.9);
      setRot('hood1', -hx * 0.6, hz * 0.5); setRot('hood2', -hx * 0.9, hz * 0.8);
    },
    thumb(w = 220) {
      const c = document.createElement('canvas'); c.width = w; c.height = Math.round(w * G.aspect);
      c.getContext('2d').drawImage(front, 0, 0, c.width, c.height); return c.toDataURL('image/webp', 0.85);
    },
    dispose() { tex.dispose(); fabricMat.dispose(); plainMat.dispose(); cordMat.dispose(); },
  };
  let front = null;
  api.refresh();
  return api;
}

// ---------------------------------------------------------------- snapshots for mockups (own renderer, shares geometry/materials)
let snap;
export function snapshotYaws(item, yaws, w = 420, h = 560) {
  if (!snap) {
    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.6;
    const key = new THREE.DirectionalLight(0xffffff, 1.8); key.position.set(2, 4, 6); scene.add(key, new THREE.HemisphereLight(0xffffff, 0x998877, 0.5));
    snap = { renderer, scene, camera: new THREE.PerspectiveCamera(26, w / h, 0.1, 50) };
  }
  const { renderer, scene, camera } = snap;
  renderer.setSize(w, h, false); renderer.setPixelRatio(1);
  camera.aspect = w / h; camera.position.set(0, -1.25, 7); camera.lookAt(0, -1.25, 0); camera.updateProjectionMatrix();
  const clone = cloneSkinned(item.root); clone.position.set(0, 0, 0); clone.rotation.set(0, 0, 0); clone.scale.setScalar(1); clone.visible = true; scene.add(clone);
  const out = yaws.map(y => {
    clone.rotation.y = THREE.MathUtils.degToRad(y); renderer.render(scene, camera);
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(renderer.domElement, 0, 0); return c;
  });
  scene.remove(clone);
  return out;
}
