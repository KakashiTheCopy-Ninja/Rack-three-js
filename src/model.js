import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { composeSide } from './imaging.js';


// ---------------------------------------------------------------- hanger (wooden, from Blender)
export function makeHangerMaterial(theme) {
  return { wood: new THREE.MeshStandardMaterial({ color: theme.wood, roughness: 0.55 }), metal: new THREE.MeshStandardMaterial({ color: theme.metal, metalness: 1, roughness: 0.28 }) };
}
export function styleHangerMaterial(m, theme) { m.wood.color.set(theme.wood); m.metal.color.set(theme.metal); }

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
const hangerCache = new Map();
export function loadHanger(tall) {
  const id = tall ? 'hanger_tall' : 'hanger_std';
  if (!hangerCache.has(id)) hangerCache.set(id, fetchModel(id));
  return hangerCache.get(id);
}

// tiny tileable normal maps (fleece/knit grain, and 1x1 rib ridges) generated once
function normalCanvas(size, height, strength) {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'), img = x.createImageData(size, size);
  const h = (i, j) => height(((i % size) + size) % size / size, ((j % size) + size) % size / size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const dx = (h(i + 1, j) - h(i - 1, j)) * strength, dy = (h(i, j + 1) - h(i, j - 1)) * strength, l = Math.hypot(dx, dy, 1), k = (j * size + i) * 4;
    img.data[k] = (-dx / l * 0.5 + 0.5) * 255; img.data[k + 1] = (-dy / l * 0.5 + 0.5) * 255; img.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0); return c;
}
function makeNormalTex(canvas) {
  const t = new THREE.CanvasTexture(canvas); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.channel = 1; t.anisotropy = 8; t.colorSpace = THREE.NoColorSpace; return t;
}
let knitTex, ribTex;
function detailTextures() {
  if (knitTex) return { knitTex, ribTex };
  const seed = (i, j) => { const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return n - Math.floor(n); };
  knitTex = makeNormalTex(normalCanvas(128, (u, v) => 0.55 * seed(Math.floor(u * 64), Math.floor(v * 64)) + 0.45 * (Math.sin(u * Math.PI * 16) * Math.sin(v * Math.PI * 16) * 0.5 + 0.5), 5));
  ribTex = makeNormalTex(normalCanvas(64, u => Math.pow(Math.sin(u * Math.PI * 2 * 2) * 0.5 + 0.5, 1.2) + 0.05 * seed(Math.floor(u * 64), 3), 9));
  return { knitTex, ribTex };
}

const Q = new THREE.Quaternion(), QA = new THREE.Quaternion(), V = new THREE.Vector3();
const AX = new THREE.Vector3(1, 0, 0), AZ = new THREE.Vector3(0, 0, 1);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// critically-damped-ish spring used for every swinging part
class Spring {
  constructor(w, z, lim = 0.6) { this.w = w; this.z = z; this.lim = lim; this.x = 0; this.v = 0; }
  step(dt, force) { const a = force - this.w * this.w * this.x - 2 * this.z * this.w * this.v; this.v += a * dt; this.x = clamp(this.x + this.v * dt, -this.lim, this.lim); return this.x; }
}

export function buildGarmentItem(product, cfg, hangerMats, G, gltf, hangerGltf) {
  const root = new THREE.Group();
  const model = cloneSkinned(gltf.scene);
  const tall = !!model.getObjectByName('hood1'), hookH = tall ? 0.16 : 0.10;
  const garment = new THREE.Group(); root.add(garment); garment.add(model);
  const hang = cloneSkinned(hangerGltf.scene); garment.add(hang);
  hang.traverse(o => { if (o.isMesh) { o.castShadow = true; o.material = (o.material.name || '').startsWith('metal') ? hangerMats.metal : hangerMats.wood; } });

  const box = new THREE.Box3().setFromObject(model);
  const k = Math.min(3.3, 2.45 / (hookH - box.min.y));
  garment.scale.setScalar(k); garment.position.y = -hookH * k;     // rail contact point = root origin

  // -------- materials: fabric / rib = photo atlas + micro detail, plain = inside + hood, cord = drawstrings
  const atlas = document.createElement('canvas'); atlas.width = G.W * 2; atlas.height = G.H;
  const tex = new THREE.CanvasTexture(atlas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.flipY = false;
  const { knitTex, ribTex } = detailTextures();
  const cloth = (extra) => new THREE.MeshPhysicalMaterial({ roughness: 0.92, sheen: 1, sheenRoughness: 0.5, vertexColors: true, side: THREE.DoubleSide, ...extra });
  const fabricMat = cloth({ map: tex, normalMap: knitTex, normalScale: new THREE.Vector2(0.55, 0.55) });
  const ribMat = cloth({ map: tex, normalMap: ribTex, normalScale: new THREE.Vector2(1.1, 1.1) });
  const plainMat = cloth({ color: 0xffffff, normalMap: knitTex, normalScale: new THREE.Vector2(0.4, 0.4) });
  const cordMat = new THREE.MeshStandardMaterial({ color: 0xe4dfd2, roughness: 0.85 });
  const pickables = [];
  model.traverse(o => {
    if (!o.isMesh) return;
    o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true;
    if (!o.geometry.attributes.color) o.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(o.geometry.attributes.position.count * 3).fill(1), 3));
    const n = (o.material.name || '').toLowerCase();
    o.material = n.startsWith('fabric') ? fabricMat : n.startsWith('rib') ? ribMat : n.startsWith('cord') ? cordMat : plainMat;
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
      plainMat.color.copy(c);
      for (const m of [fabricMat, ribMat, plainMat]) m.sheenColor.copy(c).lerp(new THREE.Color(1, 1, 1), 0.45);
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
    dispose() { tex.dispose(); fabricMat.dispose(); ribMat.dispose(); plainMat.dispose(); cordMat.dispose(); },
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
