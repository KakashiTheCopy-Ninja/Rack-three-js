import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PRODUCTS, SIZES, CATEGORIES, GARMENT_COLORS, CUSTOM_FEE, TYPE_LABEL, STYLE_OPTIONS, DEFAULT_STYLE } from './data.js';
import { THEMES } from './themes.js';
import { getProducts, placeOrder } from './api.js';
import { makeHangerMaterial, styleHangerMaterial, buildGarmentItem, loadStyle, loadHanger } from './model.js';
import { loadImage, cutout, prepareGarment } from './imaging.js';
import { createStudio } from './studio.js';
import { generateMockups } from './mockups.js';
import { loadUserProducts, saveUserProduct, deleteUserProduct } from './store.js';

const $ = (s, r = document) => r.querySelector(s);
const money = n => '$' + n.toFixed(2).replace(/\.00$/, '');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('rack:' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('rack:' + k, JSON.stringify(v)); return true; } catch { return false; } },
};

let SP = 1.7; const RAIL_Y = 2.6, CAM_Z = 6.2, FOV = 38, TILT = -0.3;
const state = {
  products: [], cat: 'all', q: '', sort: 'featured', savedOnly: false, view: 'rack',
  saved: new Set(store.get('saved', [])), cart: store.get('cart', []), promo: null,
  theme: new URLSearchParams(location.search).get('theme') || store.get('theme', 'boutique'),
};
if (!THEMES[state.theme]) state.theme = 'boutique';

// ====================================================== scene
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 80);
const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8478, 0.45); scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 2.7);
key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -7, right: 7, top: 5, bottom: -2, near: 1, far: 24 });
key.shadow.bias = -0.0006; key.shadow.normalBias = 0.04; key.shadow.radius = 7; key.shadow.blurSamples = 16;
const fill = new THREE.DirectionalLight(0xdfe8ff, 0.7), rim = new THREE.DirectionalLight(0xffffff, 0.9);
scene.add(key, key.target, fill, fill.target, rim, rim.target);

function surfaceTex(w, h, paint) { const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
const grain = (x, w, h, n, a) => { for (let i = 0; i < n; i++) { const v = Math.random() * 255 | 0; x.fillStyle = `rgba(${v},${v},${v},${a})`; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); } };
const wallTex = surfaceTex(512, 512, (x, w, h) => {   // painted panel wall: wide horizontal boards with shadow gaps
  x.fillStyle = '#f2f2f2'; x.fillRect(0, 0, w, h); grain(x, w, h, 5000, 0.05);
  for (const y of [0, 256]) { x.fillStyle = 'rgba(0,0,0,.28)'; x.fillRect(0, y, w, 3); x.fillStyle = 'rgba(255,255,255,.8)'; x.fillRect(0, y + 3, w, 2); }
});
wallTex.repeat.set(24, 3);
const floorTex = surfaceTex(512, 512, (x, w, h) => { x.fillStyle = '#e9e9e9'; x.fillRect(0, 0, w, h); grain(x, w, h, 14000, 0.09); });
floorTex.repeat.set(30, 5);
const wallMat = new THREE.MeshStandardMaterial({ roughness: 0.95, map: wallTex });
const wall = new THREE.Mesh(new THREE.PlaneGeometry(120, 14), wallMat); wall.position.set(0, 4, -1.9); wall.receiveShadow = true; scene.add(wall);
const floorMat = new THREE.MeshStandardMaterial({ roughness: 0.8, map: floorTex });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 20), floorMat); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 4); floor.receiveShadow = true; scene.add(floor);
const railMat = new THREE.MeshStandardMaterial({ metalness: 0.7, roughness: 0.3 });
const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 120, 16), railMat); rail.rotation.z = Math.PI / 2; rail.position.y = RAIL_Y; rail.castShadow = true; scene.add(rail);
for (let x = -58; x <= 62; x += 4) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 3, 8), railMat); r.position.set(x, RAIL_Y + 1.5, 0); scene.add(r); }
const signs = new THREE.Group(); scene.add(signs);
const signMat = new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false });
for (let i = 0; i < 9; i++) { const s = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.9), signMat); s.position.set(0, 3.45, -1.85); s.userData.k = (i - 4) * 12; signs.add(s); }
const hangerMat = makeHangerMaterial(THEMES[state.theme]); const hangerGltf = {};

const themeSel = $('#theme');
themeSel.innerHTML = Object.entries(THEMES).map(([k, t]) => `<option value="${k}">${t.name}</option>`).join('');
themeSel.onchange = () => applyTheme(themeSel.value);
function applyTheme(k) {
  const t = THEMES[k]; state.theme = k; store.set('theme', k);
  document.documentElement.dataset.theme = k;
  scene.background = new THREE.Color(t.bg); scene.fog = new THREE.Fog(t.bg, 14, 34);
  wallMat.color.set(t.wall); floorMat.color.set(t.floor); railMat.color.set(t.rail); styleHangerMaterial(hangerMat, t);
  scene.environmentIntensity = t.env; key.intensity = t.key; hemi.intensity = t.ui === 'dark' ? 0.2 : 0.55;
  key.color.set(t.ui === 'dark' ? 0xcfd8ff : 0xfff4e6);
  const c = document.createElement('canvas'); c.width = 1024; c.height = 220;
  const x = c.getContext('2d'); x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '700 120px "Helvetica Neue", Arial, sans-serif'; x.fillStyle = t.sign;
  if (t.signGlow) { x.shadowColor = t.sign; x.shadowBlur = 40; x.fillText(t.logo, 512, 112); x.fillText(t.logo, 512, 112); }
  x.shadowBlur = 0; x.globalAlpha = t.signGlow ? 1 : 0.85; x.fillText(t.logo, 512, 112);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; signMat.map?.dispose(); signMat.map = tex; signMat.needsUpdate = true;
  $('#logo').textContent = t.logo; document.title = t.logo; themeSel.value = k;
}

// ====================================================== items (each product = one hanger)
const items = []; let order = [], viewR = 0, seq = 0;
async function loadGarment(p) {
  const img = await loadImage(p.photo), c = document.createElement('canvas');
  c.width = img.width; c.height = img.height; c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0);
  return prepareGarment(c);
}
const styleOf = p => p.style || DEFAULT_STYLE[p.type];
function makeItem(product, G, gltf) {
  const cfg = { hex: null, colorName: 'Original', layers: [] };
  const b = buildGarmentItem(product, cfg, hangerMat, G, gltf, hangerGltf[styleOf(product).startsWith('hoodie') ? 'tall' : 'std']);
  const it = { product, cfg, b, G, i: seq++, x: 0, z: 0, ry: TILT, s: 0.001, ang: 0, angV: 0, tx: 0, visible: true, enter: 0 };
  b.pickables.forEach(m => (m.item = it)); b.root.position.y = RAIL_Y + 4; scene.add(b.root); items.push(it); return it;
}
const halfView = () => Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * CAM_Z * camera.aspect;
function matches(p) {
  if (state.cat !== 'all' && p.type !== state.cat) return false;
  if (state.savedOnly && !state.saved.has(p.id)) return false;
  const q = state.q.trim().toLowerCase();
  return !q || `${p.name} ${TYPE_LABEL[p.type]} ${p.blurb}`.toLowerCase().includes(q);
}
function layout(resetCam = true) {
  const list = items.filter(it => matches(it.product));
  const sorters = { featured: (a, b) => a.i - b.i, low: (a, b) => a.product.price - b.product.price, high: (a, b) => b.product.price - a.product.price, name: (a, b) => a.product.name.localeCompare(b.product.name) };
  list.sort(sorters[state.sort]); order = list;
  SP = list.length < 8 ? 1.7 : 1.35;
  items.forEach(it => { it.visible = list.includes(it); });
  list.forEach((it, k) => { it.tx = (k - (list.length - 1) / 2) * SP; });
  viewR = Math.max(0, ((list.length - 1) / 2) * SP + 0.9 - halfView());
  if (resetCam) cam.target = 0;
  $('#empty').hidden = list.length > 0 || state.view !== 'rack';
  renderGrid();
}

// ====================================================== interaction
const cam = { x: 0, target: 0, prev: 0 };
const ptr = { nx: 0, ny: 0, px: 0, py: 0, inside: false, touch: false, down: false, moved: 0, dx: 0 };
let hovered = null, focus = null, focusRot = 0, turn = null, draft = null;
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), tooltip = $('#tooltip');
function pick() {
  ndc.set(ptr.nx, ptr.ny); ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(order.flatMap(it => it.b.pickables), false)[0];
  return hit ? hit.object.item : null;
}
function setHover(it) {
  if (it === hovered) return; hovered = it;
  canvas.style.cursor = it ? 'pointer' : (ptr.down ? 'grabbing' : 'default');
  if (it) it.angV += clamp(ptr.dx * 0.004, -1.5, 1.5) || 0.5;
  if (it) { tooltip.hidden = false; tooltip.innerHTML = `<b>${esc(it.product.name)}</b><span>${money(it.product.price)}</span><em>Click to open</em>`; } else tooltip.hidden = true;
}
canvas.addEventListener('pointermove', e => {
  ptr.touch = e.pointerType === 'touch'; ptr.dx = e.clientX - ptr.px; ptr.px = e.clientX; ptr.py = e.clientY;
  ptr.nx = (e.clientX / innerWidth) * 2 - 1; ptr.ny = -(e.clientY / innerHeight) * 2 + 1; ptr.inside = true;
  if (ptr.down) {
    ptr.moved += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
    if (ptr.moved > 6) {
      if (focus) { focusRot = clamp(focusRot + (e.movementX || 0) * 0.012, -0.5, Math.PI + 0.5); turn = null; }
      else cam.target = clamp(cam.target - (e.movementX || 0) * (2 * halfView() / innerWidth) * 1.1, -viewR, viewR);
    }
  }
  tooltip.style.transform = `translate(${e.clientX + 16}px, ${e.clientY + 16}px)`;
});
canvas.addEventListener('pointerleave', () => { ptr.inside = false; setHover(null); });
canvas.addEventListener('pointerdown', e => {
  ptr.down = true; ptr.moved = 0; ptr.px = e.clientX; ptr.nx = (e.clientX / innerWidth) * 2 - 1; ptr.ny = -(e.clientY / innerHeight) * 2 + 1;
  canvas.setPointerCapture?.(e.pointerId); if (e.pointerType === 'touch') setHover(pick());
});
canvas.addEventListener('pointerup', () => {
  const wasDrag = ptr.moved > 6; ptr.down = false; if (wasDrag) return;
  const hit = pick();
  if (focus) { if (!hit || hit !== focus) closePanel(); return; }
  if (hit) openProduct(hit.product.id);
});
canvas.addEventListener('wheel', e => { if (!focus) cam.target = clamp(cam.target + (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * 0.006, -viewR, viewR); }, { passive: true });
addEventListener('keydown', e => {
  if (e.target.matches('input, textarea, select')) { if (e.key === 'Escape') e.target.blur(); return; }
  if (e.key === '/') { e.preventDefault(); $('#search').focus(); }
  else if (e.key === 'Escape') {
    for (const id of ['#mockups', '#addProd', '#checkout']) if (!$(id).hidden) { $(id).hidden = true; return; }
    if (studio.isOpen()) studio.close(); else if (cartOpen) toggleCart(false); else closePanel();
  } else if (!focus && e.key === 'ArrowRight') cam.target = clamp(cam.target + 1.6, -viewR, viewR);
  else if (!focus && e.key === 'ArrowLeft') cam.target = clamp(cam.target - 1.6, -viewR, viewR);
  else if (e.key === 'Enter' && hovered && !focus) openProduct(hovered.product.id);
});
function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h;
  camera.fov = w / h < 0.9 ? FOV + 14 : FOV; camera.updateProjectionMatrix();
  if (items.length) layout(false); cam.target = clamp(cam.target, -viewR, viewR);
}
addEventListener('resize', resize);

// ====================================================== loop
let lastT = performance.now(), elapsed = 0;
const panelW = () => (innerWidth > 860 ? Math.min(460, innerWidth * 0.36) : 0);
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function frame() {
  const now = performance.now(), dt = Math.min((now - lastT) / 1000, 0.05); lastT = now; elapsed += dt; const t = elapsed;
  if (!focus && ptr.inside && !ptr.touch && !ptr.down && state.view === 'rack') {
    const a = Math.abs(ptr.nx), s = Math.max(0, a - 0.55) / 0.45;
    cam.target = clamp(cam.target + Math.sign(ptr.nx) * Math.pow(s, 1.4) * 6.5 * dt, -viewR, viewR);
  }
  cam.x += (cam.target - cam.x) * (1 - Math.exp(-dt * 6));
  const camV = (cam.x - cam.prev) / Math.max(dt, 1e-4); cam.prev = cam.x;
  camera.position.set(cam.x + ptr.nx * 0.12, 2.1 + ptr.ny * 0.1, CAM_Z); camera.lookAt(cam.x, 1.8, 0);
  key.position.set(cam.x - 5, 7.5, 6.5); key.target.position.set(cam.x, 1, 0);
  fill.position.set(cam.x + 6, 2.5, 6); fill.target.position.set(cam.x, 1, 0); rim.position.set(cam.x + 2, 5, -5); rim.target.position.set(cam.x, 1.5, 0);
  signs.children.forEach(s => (s.position.x = Math.round((cam.x - s.userData.k) / 12) * 12));
  if (!focus && ptr.inside && !ptr.down) setHover(pick()); else if (focus) setHover(null);

  if (turn) { const p = clamp((now - turn.t0) / turn.dur, 0, 1); focusRot = turn.from + (turn.to - turn.from) * ease(p); if (p >= 1) turn = null; }
  if (focus) { const yaw = $('#pYaw'); if (yaw) { yaw.value = clamp(Math.round((focusRot * 180) / Math.PI), 0, 180); } }

  const hv = focus || hovered;
  const shiftX = focus && panelW() ? -(panelW() / 2) * ((2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (CAM_Z - 1.6)) / innerHeight) : 0;
  const mobileFocus = focus && !panelW();
  items.forEach(it => {
    let tx = it.tx, tz = 0, ry = TILT, ts = it.visible ? 1 : 0.001, ty = RAIL_Y;
    if (hv && it.visible && it !== hv) { const d = it.tx - hv.tx, f = focus ? 1.9 : 0.85; tx += Math.sign(d) * f * Math.exp(-Math.abs(d) / 1.8); }
    if (it === hovered && !focus) { tz = 0.85; ry = 0.05 + ptr.nx * 0.12; ts = 1.07; }
    if (it === focus) { tx = cam.x + shiftX; tz = mobileFocus ? 0.4 : 1.6; ry = focusRot + (turn || ptr.down ? 0 : Math.sin(t * 0.6) * 0.03); ts = mobileFocus ? 0.7 : 1.04; ty = RAIL_Y + (mobileFocus ? 1.85 : 0.1); }
    const k = 1 - Math.exp(-dt * (it === focus || it === hovered ? 9 : 7));
    it.x += (tx - it.x) * k; it.z += (tz - it.z) * k; it.s += (ts - it.s) * (1 - Math.exp(-dt * 8));
    it.ry += (ry - it.ry) * (it === focus && (turn || ptr.down) ? 0.5 : k);
    it.enter = Math.min(1, it.enter + dt * 1.2);
    const e = it.enter <= 0 ? 0 : 1 - Math.pow(1 - it.enter, 3);
    it.angV += -camV * 0.012 * (it.visible ? 1 : 0);
    it.angV += (-22 * it.ang - 2.4 * it.angV + Math.sin(t * 0.9 + it.i * 1.7) * 0.05) * dt; it.ang += it.angV * dt;
    const r = it.b.root; r.visible = it.s > 0.02 && e > 0;
    r.position.set(it.x, ty + (1 - e) * 3.5, it.z); r.rotation.set(0, it.ry, it.ang, 'YXZ'); r.scale.setScalar(Math.max(it.s, 0.001) * (0.6 + 0.4 * e));
    if (r.visible) it.b.drive(dt, it.x, it.z, it.ry);
  });
  $('#progress i').style.cssText = viewR > 0 ? `width:${100 / (1 + viewR)}%;left:${((cam.x + viewR) / (2 * viewR)) * (100 - 100 / (1 + viewR))}%` : 'width:100%;left:0';
  renderer.render(scene, camera); requestAnimationFrame(frame);
}

// ====================================================== header + grid
const cats = $('#cats');
function buildCats() {
  const have = new Set(state.products.map(p => p.type));
  cats.innerHTML = CATEGORIES.filter(c => c.id === 'all' || have.has(c.id)).map(c => `<button class="chip" data-cat="${c.id}" aria-pressed="${c.id === state.cat}">${c.label}</button>`).join('');
}
cats.onclick = e => { const b = e.target.closest('[data-cat]'); if (!b) return; state.cat = b.dataset.cat; closePanel(); buildCats(); layout(); };
let st; $('#search').oninput = e => { clearTimeout(st); st = setTimeout(() => { state.q = e.target.value; closePanel(); layout(); }, 150); };
$('#sort').onchange = e => { state.sort = e.target.value; layout(); };
function clearFilters() { state.q = ''; state.cat = 'all'; state.savedOnly = false; $('#search').value = ''; $('#savedBtn').setAttribute('aria-pressed', false); buildCats(); layout(); }
$('#clearFilters').onclick = clearFilters; $('#logo').onclick = e => { e.preventDefault(); clearFilters(); };
$('#savedBtn').onclick = () => { state.savedOnly = !state.savedOnly; $('#savedBtn').setAttribute('aria-pressed', state.savedOnly); layout(); };
$('#viewBtn').onclick = () => {
  state.view = state.view === 'rack' ? 'grid' : 'rack'; const g = state.view === 'grid';
  $('#viewBtn').setAttribute('aria-pressed', g); $('#viewBtn span').textContent = g ? '3D rack' : 'Grid';
  $('#grid').hidden = !g; canvas.style.visibility = g ? 'hidden' : 'visible'; $('#hint').hidden = g; $('#progress').hidden = g; closePanel(); layout(false);
};
function persistCart() {
  if (!store.set('cart', state.cart)) store.set('cart', state.cart.map(l => ({ ...l, layers: (l.layers || []).map(({ src, ...r }) => r) })));
  store.set('saved', [...state.saved]);
}
function updateCounts() { $('#savedCount').textContent = state.saved.size; $('#cartCount').textContent = state.cart.reduce((n, l) => n + l.qty, 0); persistCart(); }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600); }
function renderGrid() {
  if (state.view !== 'grid') return;
  $('#grid').innerHTML = order.map(it => `<article class="card" tabindex="0" data-id="${it.product.id}">
    <img alt="${esc(it.product.name)}" src="${it.product.photo}"><div class="card-b"><h3>${esc(it.product.name)}</h3><span>${money(it.product.price)}</span></div>
    <div class="dots"><i style="background:${it.G.baseHex}"></i><em>${TYPE_LABEL[it.product.type]} · ${GARMENT_COLORS.length - 1}+ colours</em></div></article>`).join('') || '<p class="grid-empty">Nothing matches that.</p>';
}
$('#grid').onclick = e => { const c = e.target.closest('.card'); if (c) openProduct(c.dataset.id); };
$('#grid').onkeydown = e => { if (e.key === 'Enter') { const c = e.target.closest('.card'); if (c) openProduct(c.dataset.id); } };

// ====================================================== product panel
const panel = $('#panel'), scrim = $('#scrim');
const designCount = cfg => cfg.layers.length;
const unitPrice = () => draft.product.price + (designCount(draft.it.cfg) ? CUSTOM_FEE : 0);
const serialLayers = layers => layers.map(({ img, ...r }) => ({ ...r }));

function openProduct(id) {
  const it = items.find(i => i.product.id === id); if (!it) return;
  if (focus && focus !== it) resetItem(focus);
  focus = it; focusRot = 0; turn = null; setHover(null); tooltip.hidden = true;
  const p = it.product; draft = { it, product: p, size: null, qty: 1 };
  panel.innerHTML = `
  <button class="x" id="pClose" aria-label="Close">×</button>
  <div class="p-scroll">
    <img id="pPreview" class="p-preview" alt="" hidden>
    <p class="eyebrow">${TYPE_LABEL[p.type]}${p.user ? ' · added by you' : ''}</p>
    <h2>${esc(p.name)}</h2>
    <div class="price-row"><span class="price" id="pPrice"></span><button class="heart" id="pSave" aria-label="Save"></button></div>
    <p class="blurb">${esc(p.blurb)}</p>
    <h4>Colour <em id="pColorName"></em></h4>
    <div class="swatches" id="pColors">${GARMENT_COLORS.map(g => `<button class="sw ${g.hex ? '' : 'orig'}" data-n="${g.name}" style="--c:${g.hex || it.G.baseHex}" aria-label="${g.name}" title="${g.name}"></button>`).join('')}</div>
    <p class="note">Only the fabric changes. The artwork stays exactly as printed.</p>
    <h4>Size <em id="pSizeHint">select a size</em></h4>
    <div class="sizes" id="pSizes">${SIZES.map(s => `<button class="size" data-s="${s}">${s}</button>`).join('')}</div>
    <h4>View <em>drag the ${TYPE_LABEL[p.type].toLowerCase()} or use the slider</em></h4>
    <div class="viewctl"><input type="range" id="pYaw" min="0" max="180" value="0" aria-label="Rotate 0 to 180 degrees">
      <div class="seg"><button data-yaw="0">Front</button><button data-yaw="90">Side</button><button data-yaw="180">Back</button><button id="pTurn">▶ Turn 180°</button></div></div>
    <div class="studio-promo"><div><b>Design studio</b><small>+${money(CUSTOM_FEE)}</small></div>
      <p>Upload your own artwork, place it on the front or back, see it on this ${TYPE_LABEL[p.type].toLowerCase()} and get mockups.</p>
      <button class="btn primary wide" id="pStudio">Open design studio</button><p class="dsum" id="pDesignSum"></p></div>
    <ul class="meta"><li><b>Fabric</b> ${esc(p.fabric)}</li><li><b>Shipping</b> Free over $100 · 30-day returns</li><li><b>Custom prints</b> Made to order, ships in 3–5 days</li></ul>
    ${p.user ? '<button class="btn ghost small danger" id="pRemove">Remove this product from the rack</button>' : ''}
  </div>
  <div class="p-foot"><div class="buy"><div class="qty"><button id="qMinus" aria-label="Less">−</button><b id="qVal">1</b><button id="qPlus" aria-label="More">+</button></div><button class="btn primary" id="pAdd">Add to bag</button></div></div>`;
  panel.classList.add('open'); panel.setAttribute('aria-hidden', 'false'); document.documentElement.classList.add('focus'); scrim.hidden = innerWidth > 860;
  if (state.view === 'grid') $('#pPreview').hidden = false;
  syncPanel(); wirePanel();
}
function syncPanel() {
  const d = draft, cfg = d.it.cfg, n = designCount(cfg);
  $('#pPrice').textContent = money(unitPrice()); $('#pColorName').textContent = '— ' + cfg.colorName;
  $('#pSave').textContent = state.saved.has(d.product.id) ? '♥' : '♡'; $('#pSave').classList.toggle('on', state.saved.has(d.product.id));
  $('#qVal').textContent = d.qty; $('#pSizeHint').textContent = d.size || 'select a size';
  panel.querySelectorAll('#pColors .sw').forEach(b => b.setAttribute('aria-pressed', b.dataset.n === cfg.colorName));
  panel.querySelectorAll('#pSizes .size').forEach(b => b.setAttribute('aria-pressed', b.dataset.s === d.size));
  const f = cfg.layers.filter(l => l.side === 'front').length, bk = cfg.layers.filter(l => l.side === 'back').length;
  $('#pDesignSum').textContent = n ? `${n} design${n > 1 ? 's' : ''} added · ${f} front, ${bk} back` : '';
  if (state.view === 'grid') $('#pPreview').src = d.it.b.thumb(520);
}
function wirePanel() {
  const d = draft, it = d.it;
  $('#pClose').onclick = closePanel;
  $('#pColors').onclick = e => { const b = e.target.closest('[data-n]'); if (!b) return; const g = GARMENT_COLORS.find(x => x.name === b.dataset.n); it.cfg.hex = g.hex; it.cfg.colorName = g.name; it.b.refresh(); syncPanel(); };
  $('#pSizes').onclick = e => { const b = e.target.closest('[data-s]'); if (b) { d.size = b.dataset.s; syncPanel(); } };
  $('#pSave').onclick = () => { const id = d.product.id; state.saved.has(id) ? state.saved.delete(id) : state.saved.add(id); updateCounts(); syncPanel(); if (state.savedOnly) layout(false); };
  const yaw = $('#pYaw');
  yaw.oninput = () => { turn = null; focusRot = (+yaw.value * Math.PI) / 180; };
  panel.querySelectorAll('[data-yaw]').forEach(b => (b.onclick = () => { turn = { from: focusRot, to: (+b.dataset.yaw * Math.PI) / 180, t0: performance.now(), dur: 900 }; }));
  $('#pTurn').onclick = () => { focusRot = 0; turn = { from: 0, to: Math.PI, t0: performance.now(), dur: 3200 }; };
  $('#pStudio').onclick = openStudio;
  $('#qMinus').onclick = () => { d.qty = Math.max(1, d.qty - 1); syncPanel(); };
  $('#qPlus').onclick = () => { d.qty = Math.min(10, d.qty + 1); syncPanel(); };
  if ($('#pRemove')) $('#pRemove').onclick = function () { if (!this.dataset.sure) { this.dataset.sure = 1; this.textContent = 'Click again to remove for good'; return; } removeProduct(d.product.id); };
  $('#pAdd').onclick = () => {
    if (!d.size) { const s = $('#pSizes'); s.classList.remove('shake'); void s.offsetWidth; s.classList.add('shake'); return toast('Pick a size first'); }
    const layers = serialLayers(it.cfg.layers), custom = layers.length > 0, sig = JSON.stringify(layers.map(({ id, ...r }) => r));
    const line = state.cart.find(l => l.pid === d.product.id && l.color === it.cfg.colorName && l.size === d.size && l.sig === sig);
    if (line) line.qty = Math.min(10, line.qty + d.qty);
    else state.cart.push({ id: Math.random().toString(36).slice(2), pid: d.product.id, color: it.cfg.colorName, hex: it.cfg.hex, size: d.size, qty: d.qty, layers, sig, custom, price: unitPrice(), thumb: it.b.thumb(200) });
    updateCounts(); renderCart(); toast(`${d.product.name} added to your bag`);
    const pend = it; closePanel(); void pend; setTimeout(() => toggleCart(true), 250);
  };
}
function resetItem(it) { it.cfg.hex = null; it.cfg.colorName = 'Original'; it.cfg.layers = []; it.b.refresh(); }
function closePanel() {
  panel.classList.remove('open'); panel.setAttribute('aria-hidden', 'true'); scrim.hidden = true; document.documentElement.classList.remove('focus');
  if (focus) { resetItem(focus); focus = null; draft = null; turn = null; }
}
scrim.onclick = closePanel;

// ====================================================== design studio + mockups
const studio = createStudio($('#studio'), { toast });
function openStudio() {
  const it = draft.it;
  studio.open({ it, G: it.G, cfg: it.cfg, product: draft.product, onMockups: openMockups, onClose: () => { it.b.refresh(); if (draft) { syncPanel(); const sw = panel.querySelectorAll('#pColors .sw'); sw.forEach(b => b.setAttribute('aria-pressed', b.dataset.n === it.cfg.colorName)); } } });
}
async function openMockups() {
  const it = draft.it, host = $('#mockups'); host.hidden = false;
  host.innerHTML = `<div class="modal-card mock"><button class="x" id="mkClose" aria-label="Close">×</button><h3>Mockups</h3><div class="mk-load"><div class="spinner"></div><p id="mkProg">Rendering your design…</p></div></div>`;
  $('#mkClose').onclick = () => (host.hidden = true);
  try {
    const list = await generateMockups({ it, product: draft.product, brand: THEMES[state.theme].logo, onProgress: (n, t) => { const p = $('#mkProg'); if (p) p.textContent = `Rendering mockup ${Math.min(n + 1, t)} of ${t}…`; } });
    const urls = list.map(m => m.canvas.toDataURL('image/jpeg', 0.92)), slug = draft.product.id;
    host.innerHTML = `<div class="modal-card mock"><button class="x" id="mkClose" aria-label="Close">×</button>
      <h3>Mockups</h3><p class="mk-sub">${list.length} mockups of this ${TYPE_LABEL[draft.product.type].toLowerCase()} in ${esc(it.cfg.colorName)}. Click one to enlarge. If the download button does nothing in your viewer, right-click an image and choose Save image.</p>
      <div class="mk-grid">${list.map((m, i) => `<figure class="${m.canvas.width / m.canvas.height > 1.5 ? 'wide' : ''}"><button class="mk-img" data-i="${i}"><img src="${urls[i]}" alt="${esc(m.title)}"></button>
        <figcaption><span>${esc(m.title)}</span><a class="btn ghost small" href="${urls[i]}" download="${slug}-${m.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jpg">Download</a></figcaption></figure>`).join('')}</div></div>
      <div class="lightbox" id="mkLight" hidden><img alt=""></div>`;
    $('#mkClose').onclick = () => (host.hidden = true);
    host.querySelectorAll('.mk-img').forEach(b => (b.onclick = () => { const lb = $('#mkLight'); lb.firstElementChild.src = urls[+b.dataset.i]; lb.hidden = false; }));
    $('#mkLight').onclick = () => ($('#mkLight').hidden = true);
  } catch (err) { console.error(err); host.querySelector('.mk-load').innerHTML = '<p>Could not render the mockups. Try again.</p>'; }
}
host_click(['#mockups', '#addProd']);
function host_click(sels) { sels.forEach(s => $(s).addEventListener('pointerdown', e => { if (e.target === $(s)) $(s).hidden = true; })); }

// ====================================================== add / remove products
async function addProductLive(product) {
  const G = await loadGarment(product);
  state.products.push(product);
  if (!matches(product)) clearFilters();
  const it = makeItem(product, G, await loadStyle(styleOf(product))); it.enter = -0.05; buildCats(); layout(false);
  cam.target = clamp(it.tx, -viewR, viewR); return it;
}
function removeProduct(id) {
  const k = items.findIndex(i => i.product.id === id); if (k < 0) return;
  closePanel(); const it = items[k]; scene.remove(it.b.root); it.b.dispose(); items.splice(k, 1);
  state.products = state.products.filter(p => p.id !== id); deleteUserProduct(id); buildCats(); layout(false); toast('Removed from the rack');
}
function openAddProduct() {
  const host = $('#addProd'); host.hidden = false;
  host.innerHTML = `<div class="modal-card ap"><button class="x" id="apClose" aria-label="Close">×</button>
    <h3>Add a product to the rack</h3><p class="mk-sub">Upload a photo of the shirt, sweatshirt or hoodie laid flat or on a ghost mannequin. A plain background is removed automatically and it hangs on the rack straight away.</p>
    <div class="ap-grid"><div><div class="ap-drop" id="apDrop"><canvas id="apPrev" width="10" height="10" hidden></canvas><label class="btn primary" id="apPick">Choose photo<input type="file" id="apFile" accept="image/*" hidden></label><p id="apMsg">PNG, JPG or WebP</p></div>
      <label class="chk"><input type="checkbox" id="apBg" checked> Remove plain background</label></div>
      <div class="ap-form"><label class="fld">Name <input id="apName" type="text" placeholder="e.g. Midnight Hoodie" maxlength="60"></label>
        <div class="fld">Type <div class="seg" id="apType"><button data-t="tee" aria-pressed="false">Shirt</button><button data-t="sweat" aria-pressed="true">Sweatshirt</button><button data-t="hoodie" aria-pressed="false">Hoodie</button></div></div>
        <div class="fld">3D model <div class="seg" id="apStyle"></div></div>
        <label class="fld">Price (USD) <input id="apPrice" type="number" min="1" step="1" value="48"></label>
        <label class="fld">Description <textarea id="apDesc" rows="3" maxlength="200" placeholder="One or two lines about this piece"></textarea></label>
        <button class="btn primary wide" id="apSave" disabled>Add to rack</button></div></div></div>`;
  let cut = null, srcImg = null, type = 'sweat', style = DEFAULT_STYLE.sweat;
  const drawStyles = () => { $('#apStyle').innerHTML = STYLE_OPTIONS[type].map(o => `<button data-s="${o.id}" aria-pressed="${o.id === style}">${o.label}</button>`).join(''); };
  drawStyles();
  $('#apStyle').onclick = e => { const b = e.target.closest('[data-s]'); if (b) { style = b.dataset.s; drawStyles(); } };
  const prev = $('#apPrev');
  const draw = () => {
    if (!srcImg) return; try { cut = cutout(srcImg, { removeBg: $('#apBg').checked }); } catch (e) { $('#apMsg').textContent = e.message; cut = null; $('#apSave').disabled = true; return; }
    const w = 300, h = Math.round(w * cut.height / cut.width); prev.width = w; prev.height = h; prev.hidden = false;
    const x = prev.getContext('2d'); for (let i = 0; i < w; i += 16) for (let j = 0; j < h; j += 16) { x.fillStyle = (i + j) / 16 % 2 ? '#d9d9d9' : '#f4f4f4'; x.fillRect(i, j, 16, 16); }
    x.drawImage(cut, 0, 0, w, h); $('#apMsg').textContent = 'Looks right? Fill in the details and add it.'; $('#apSave').disabled = false;
  };
  $('#apClose').onclick = () => (host.hidden = true);
  $('#apFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    $('#apMsg').textContent = 'Reading photo…';
    try {
      const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
      srcImg = await loadImage(url); if (!$('#apName').value) $('#apName').value = f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 60); draw();
    } catch { $('#apMsg').textContent = 'Could not read that image.'; }
  };
  $('#apBg').onchange = draw;
  $('#apType').onclick = e => { const b = e.target.closest('[data-t]'); if (!b) return; type = b.dataset.t; style = DEFAULT_STYLE[type]; drawStyles(); $('#apType').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); };
  $('#apSave').onclick = async () => {
    const name = $('#apName').value.trim(); if (!cut) return; if (!name) { $('#apName').focus(); return toast('Give the product a name'); }
    $('#apSave').disabled = true; $('#apSave').textContent = 'Adding…';
    const blob = await new Promise(r => cut.toBlob(r, 'image/png'));
    const fabric = { tee: 'Cotton tee', sweat: 'Fleece crewneck', hoodie: 'Fleece pullover hoodie' }[type];
    const product = { id: 'u-' + Date.now().toString(36), type, style, name, price: Math.max(1, +$('#apPrice').value || 48), fabric, blurb: $('#apDesc').value.trim() || `${name}. Available in ${GARMENT_COLORS.length - 1} colours with your own custom design.`, user: true, blob };
    product.photo = URL.createObjectURL(blob);
    const saved = await saveUserProduct(product);
    try { await addProductLive(product); host.hidden = true; toast(saved ? 'Added to the rack' : 'Added to the rack (could not save for next visit)'); }
    catch (err) { console.error(err); toast('Something went wrong adding that photo'); $('#apSave').disabled = false; $('#apSave').textContent = 'Add to rack'; }
  };
}
$('#addBtn').onclick = openAddProduct;

// ====================================================== cart + checkout
let cartOpen = false; const cartEl = $('#cart'), product = id => state.products.find(p => p.id === id) || { name: 'Product', price: 0 };
const FREE_SHIP = 100;
function totals(shipMethod = 'standard') {
  const sub = state.cart.reduce((n, l) => n + l.price * l.qty, 0), disc = state.promo ? +(sub * state.promo.pct).toFixed(2) : 0;
  const ship = !state.cart.length ? 0 : shipMethod === 'express' ? 14.9 : (sub - disc >= FREE_SHIP ? 0 : 6.9), tax = +((sub - disc) * 0.08).toFixed(2);
  return { sub, disc, ship, tax, total: sub - disc + ship + tax };
}
const designNote = l => { if (!l.layers?.length) return ''; const t = l.layers.filter(x => x.type === 'text').map(x => x.text.replace(/\n/g, ' ')).filter(Boolean)[0]; const imgs = l.layers.filter(x => x.type === 'image').length; return `Custom design${imgs ? ` · ${imgs} artwork` : ''}${t ? ` · “${esc(t)}”` : ''}`; };
function renderCart() {
  const t = totals(), left = Math.max(0, FREE_SHIP - (t.sub - t.disc));
  cartEl.innerHTML = `<div class="d-head"><h3>Your bag</h3><button class="x" id="cClose" aria-label="Close bag">×</button></div>
  ${state.cart.length ? `<div class="ship-bar"><span>${left > 0 ? `You're ${money(left)} away from free shipping` : 'You get free shipping'}</span><i><b style="width:${clamp(100 - (left / FREE_SHIP) * 100, 0, 100)}%"></b></i></div>
  <ul class="lines">${state.cart.map(l => `<li data-id="${l.id}"><img src="${l.thumb || ''}" alt=""><div><b>${esc(product(l.pid).name)}</b><small>${esc(l.color)} · ${l.size}</small>
    ${l.layers?.length ? `<small class="cu">${designNote(l)}</small>` : ''}
    <div class="qty sm"><button data-a="minus" aria-label="Less">−</button><b>${l.qty}</b><button data-a="plus" aria-label="More">+</button><button class="link" data-a="rm">Remove</button></div></div><span>${money(l.price * l.qty)}</span></li>`).join('')}</ul>
  <div class="d-foot"><form class="promo" id="promoForm"><input id="promoIn" placeholder="Promo code (try RACK10)" value="${state.promo ? state.promo.code : ''}"><button class="btn ghost small">Apply</button></form>
    <dl class="sum"><dt>Subtotal</dt><dd>${money(t.sub)}</dd>${t.disc ? `<dt>Discount (${state.promo.code})</dt><dd>−${money(t.disc)}</dd>` : ''}<dt>Shipping</dt><dd>${t.ship ? money(t.ship) : 'Free'}</dd></dl>
    <button class="btn primary wide" id="goCheckout">Checkout · ${money(t.sub - t.disc + t.ship)}</button></div>`
  : `<div class="d-empty"><p>Your bag is empty.</p><button class="btn ghost" id="keepShopping">Back to the rack</button></div>`}`;
  $('#cClose').onclick = () => toggleCart(false); $('#keepShopping')?.addEventListener('click', () => toggleCart(false)); $('#goCheckout')?.addEventListener('click', openCheckout);
  $('#promoForm')?.addEventListener('submit', e => { e.preventDefault(); const c = $('#promoIn').value.trim().toUpperCase(); state.promo = c === 'RACK10' ? { code: c, pct: 0.1 } : null; toast(state.promo ? '10% off applied' : c ? 'That code isn’t valid' : 'Promo removed'); renderCart(); });
}
cartEl.onclick = e => {
  const b = e.target.closest('[data-a]'); if (!b) return; const l = state.cart.find(x => x.id === b.closest('li').dataset.id);
  if (b.dataset.a === 'plus') l.qty = Math.min(10, l.qty + 1); if (b.dataset.a === 'minus') l.qty = Math.max(1, l.qty - 1); if (b.dataset.a === 'rm') state.cart = state.cart.filter(x => x !== l);
  updateCounts(); renderCart();
};
function toggleCart(open) {
  cartOpen = open; cartEl.classList.toggle('open', open); cartEl.setAttribute('aria-hidden', !open); scrim.hidden = !open; scrim.onclick = open ? () => toggleCart(false) : closePanel;
  if (open) { closePanel(); scrim.hidden = false; scrim.onclick = () => toggleCart(false); renderCart(); }
}
$('#cartBtn').onclick = () => toggleCart(!cartOpen);
const co = $('#checkout');
function openCheckout() {
  if (!state.cart.length) return; toggleCart(false); co.hidden = false;
  const draw = () => { const ship = (co.querySelector('[name=ship]:checked') || { value: 'standard' }).value, t = totals(ship);
    co.querySelector('#coSum').innerHTML = `<dt>Subtotal</dt><dd>${money(t.sub)}</dd>${t.disc ? `<dt>Discount</dt><dd>−${money(t.disc)}</dd>` : ''}<dt>Shipping</dt><dd>${t.ship ? money(t.ship) : 'Free'}</dd><dt>Tax (8%)</dt><dd>${money(t.tax)}</dd><dt class="tot">Total</dt><dd class="tot">${money(t.total)}</dd>`;
    co.querySelector('#coPay').textContent = `Pay ${money(t.total)}`; };
  co.innerHTML = `<div class="modal-card"><button class="x" id="coClose" aria-label="Close">×</button>
    <form id="coForm" class="co-grid" autocomplete="on"><div><h3>Checkout</h3><p class="demo">Demo store. No real payment is taken. Connect Stripe or Shopify in <code>src/api.js</code>.</p>
      <fieldset><legend>Contact</legend><input name="email" type="email" placeholder="Email" required autocomplete="email"><input name="name" placeholder="Full name" required autocomplete="name"></fieldset>
      <fieldset><legend>Shipping address</legend><input name="addr" placeholder="Address" required autocomplete="street-address"><div class="two"><input name="city" placeholder="City" required autocomplete="address-level2"><input name="zip" placeholder="ZIP / Postcode" required autocomplete="postal-code"></div>
        <select name="country" autocomplete="country"><option>United States</option><option>Canada</option><option>United Kingdom</option><option>Australia</option><option>Pakistan</option><option>Germany</option></select></fieldset>
      <fieldset><legend>Delivery</legend><label class="radio"><input type="radio" name="ship" value="standard" checked> Standard · 4–7 days <span>${totals('standard').ship ? money(totals('standard').ship) : 'Free'}</span></label>
        <label class="radio"><input type="radio" name="ship" value="express"> Express · 1–2 days <span>$14.90</span></label></fieldset>
      <fieldset><legend>Payment (demo)</legend><input name="card" inputmode="numeric" placeholder="4242 4242 4242 4242" maxlength="19" required><div class="two"><input name="exp" placeholder="MM / YY" maxlength="7" required><input name="cvc" placeholder="CVC" maxlength="4" inputmode="numeric" required></div></fieldset></div>
      <div class="co-side"><h4>Order summary</h4><ul class="mini">${state.cart.map(l => `<li><img src="${l.thumb || ''}" alt=""><span>${esc(product(l.pid).name)} <small>${esc(l.color)} · ${l.size} × ${l.qty}${l.layers?.length ? ' · custom' : ''}</small></span><b>${money(l.price * l.qty)}</b></li>`).join('')}</ul>
        <dl class="sum" id="coSum"></dl><button class="btn primary wide" id="coPay"></button></div></form></div>`;
  draw(); $('#coClose').onclick = closeCheckout; co.querySelectorAll('[name=ship]').forEach(r => r.addEventListener('change', draw));
  co.querySelector('[name=card]').addEventListener('input', e => (e.target.value = e.target.value.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()));
  co.querySelector('[name=exp]').addEventListener('input', e => { const v = e.target.value.replace(/\D/g, '').slice(0, 4); e.target.value = v.length > 2 ? v.slice(0, 2) + ' / ' + v.slice(2) : v; });
  $('#coForm').onsubmit = async e => {
    e.preventDefault(); const fd = new FormData(e.target), btn = $('#coPay'); btn.disabled = true; btn.textContent = 'Processing…';
    const ship = fd.get('ship'), t = totals(ship);
    const order = await placeOrder({ customer: { email: fd.get('email'), name: fd.get('name') }, lines: state.cart, totals: t, ship });
    state.cart = []; state.promo = null; updateCounts(); renderCart();
    co.innerHTML = `<div class="modal-card done"><div class="chk">✓</div><h3>Thank you, ${esc(String(fd.get('name')).split(' ')[0])}!</h3><p>Order <b>${order.id}</b> is confirmed. A receipt is on its way to ${esc(fd.get('email'))}.</p><p class="demo">This was a demo order. Nothing was charged.</p><button class="btn primary" id="coDone">Keep shopping</button></div>`;
    $('#coDone').onclick = closeCheckout;
  };
}
function closeCheckout() { co.hidden = true; co.innerHTML = ''; }
co.addEventListener('pointerdown', e => { if (e.target === co) closeCheckout(); });

// ====================================================== boot
(async function boot() {
  applyTheme(state.theme);
  try {
    const seed = await getProducts(), mine = await loadUserProducts();
    mine.forEach(p => { p.photo = URL.createObjectURL(p.blob); });
    const all = [...seed, ...mine];
    hangerGltf.std = await loadHanger(false); hangerGltf.tall = await loadHanger(true);
    const gltfs = Object.fromEntries(await Promise.all([...new Set(all.map(styleOf))].map(async id => [id, await loadStyle(id)])));
    const loaded = await Promise.all(all.map(p => loadGarment(p).then(G => [p, G]).catch(() => null)));
    loaded.filter(Boolean).forEach(([p, G]) => { state.products.push(p); makeItem(p, G, gltfs[styleOf(p)]); });
  } catch (err) { console.error(err); }
  buildCats(); resize(); layout(); updateCounts(); renderCart();
  items.forEach((it, k) => { it.enter = -k * 0.09; });
  $('#loading').classList.add('gone'); setTimeout(() => $('#loading').remove(), 600);
  setTimeout(() => $('#hint').classList.add('dim'), 9000);
  requestAnimationFrame(frame);
  window.__rack = { state, items, cam, openProduct, layout, addProductLive, openStudio };
})();
