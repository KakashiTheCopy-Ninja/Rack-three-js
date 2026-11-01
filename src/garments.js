import * as THREE from 'three';
import { FONTS, PLACEMENTS } from './data.js';

// ---------- silhouettes (right half, bottom-centre -> neck-centre; x right, y up, units ~ metres/0.5) ----------
const HALF = {
  tee: [[0, -1.5], [0.6, -1.5], [0.58, -0.45], [0.78, -0.68], [1.0, -0.42], [0.64, -0.1], [0.24, 0], [0.13, -0.1], [0, -0.14]],
  sweat: [[0, -1.55], [0.62, -1.55], [0.6, -0.52], [0.84, -1.4], [1.08, -1.34], [0.72, -0.1], [0.26, 0], [0.14, -0.1], [0, -0.16]],
  hoodie: [[0, -1.58], [0.66, -1.58], [0.64, -0.55], [0.88, -1.42], [1.12, -1.36], [0.76, -0.1], [0.3, 0], [0.2, -0.18], [0, -0.3]],
};
const NECK_FROM = { tee: 5, sweat: 5, hoodie: 5 }; // index in HALF where the neckline starts
const HANGER_DROP = { tee: 0, sweat: 0, hoodie: 0.2 };

function outline(type) {
  const half = HALF[type];
  const pts = half.map(p => [...p]);
  for (let i = half.length - 1; i >= 0; i--) if (half[i][0] !== 0) pts.push([-half[i][0], half[i][1]]);
  return pts;
}
const OUT = { tee: outline('tee'), sweat: outline('sweat'), hoodie: outline('hoodie') };

// canvas <-> garment space (shared by the 3D overlay and the 2D thumbnails)
const PX = 400, BX = 1.2, BY = 0.1, CW = 960, CH = 700;
const sx = x => (x + BX) * PX, sy = y => (BY - y) * PX;

function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

function tracePath(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y))));
  ctx.closePath();
}

function neckLine(ctx, type) {
  const half = HALF[type], i0 = NECK_FROM[type];
  const pts = [];
  for (let i = i0; i < half.length; i++) pts.push(half[i]);
  for (let i = half.length - 2; i >= i0; i--) pts.push([-half[i][0], half[i][1]]);
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y))));
}

function line(ctx, a, b) { ctx.beginPath(); ctx.moveTo(sx(a[0]), sy(a[1])); ctx.lineTo(sx(b[0]), sy(b[1])); ctx.stroke(); }

export function drawPrint(ctx, pr, at) {
  if (!pr) return;
  const pl = PLACEMENTS[pr.place] || PLACEMENTS.chest;
  const cx = at ? at.cx : sx(pl.x), cy = at ? at.cy : sy(pl.y);
  const size = pr.size ?? 0.6;
  const lines = (pr.text || '').split('\n').filter(Boolean).slice(0, 3);
  const gs = 200 * size; // graphic box
  const hasG = (pr.graphic && pr.graphic !== 'none') || pr.img;
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = pr.color || '#fff';
  const family = (FONTS[pr.font] || FONTS.impact).css;
  let fpx = 150 * size;
  const maxW = 430 * size;
  ctx.font = `${fpx}px ${family}`;
  const widest = Math.max(1, ...lines.map(l => ctx.measureText(l).width));
  if (widest > maxW) fpx *= maxW / widest;
  ctx.font = `${fpx}px ${family}`;
  const lh = fpx * 1.02;
  const textH = lines.length * lh;
  const gap = hasG && lines.length ? 14 : 0;
  const total = (hasG ? gs : 0) + gap + textH;
  let y = cy - total / 2;
  if (hasG) {
    const gy = y + gs / 2;
    if (pr.img) {
      const k = Math.min(gs / pr.img.width, gs / pr.img.height);
      ctx.drawImage(pr.img, cx - pr.img.width * k / 2, gy - pr.img.height * k / 2, pr.img.width * k, pr.img.height * k);
    } else drawGraphic(ctx, pr.graphic, cx, gy, gs * 0.5);
    y += gs + gap;
  }
  lines.forEach((l, i) => ctx.fillText(l, cx, y + lh * (i + 0.5)));
  ctx.restore();
}

function drawGraphic(ctx, kind, x, y, r) {
  ctx.beginPath();
  if (kind === 'star') {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
  } else if (kind === 'heart') {
    ctx.moveTo(x, y + r * 0.9);
    ctx.bezierCurveTo(x - r * 1.5, y - r * 0.2, x - r * 0.7, y - r * 1.1, x, y - r * 0.4);
    ctx.bezierCurveTo(x + r * 0.7, y - r * 1.1, x + r * 1.5, y - r * 0.2, x, y + r * 0.9);
  } else if (kind === 'bolt') {
    [[0.2, -1], [-0.6, 0.15], [-0.05, 0.15], [-0.3, 1], [0.65, -0.2], [0.05, -0.2], [0.55, -1]]
      .forEach(([px, py], i) => (i ? ctx.lineTo(x + px * r, y + py * r) : ctx.moveTo(x + px * r, y + py * r)));
  }
  ctx.closePath(); ctx.fill();
}

// Paints fabric details (shading, seams, ribbing, pocket, print). With opts.color it also fills the garment (thumbnails).
export function drawFace(ctx, type, opts) {
  const { color = null, print = null } = opts;
  const half = HALF[type];
  ctx.clearRect(0, 0, CW, CH);
  ctx.save();
  tracePath(ctx, OUT[type]);
  ctx.clip();
  if (color) { ctx.fillStyle = color; ctx.fillRect(0, 0, CW, CH); }

  let g = ctx.createLinearGradient(0, 0, CW, 0);
  g.addColorStop(0, 'rgba(0,0,0,.30)'); g.addColorStop(0.2, 'rgba(0,0,0,.02)');
  g.addColorStop(0.8, 'rgba(0,0,0,.02)'); g.addColorStop(1, 'rgba(0,0,0,.30)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
  g = ctx.createLinearGradient(0, 0, 0, CH);
  g.addColorStop(0, 'rgba(255,255,255,.07)'); g.addColorStop(0.45, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.14)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);

  const r = rng(type.length * 97 + 13);
  for (let i = 0; i < 9; i++) { // soft hanging folds
    const x = sx(-0.5 + r() * 1.0), w = 40 + r() * 70, dark = i % 2 === 0;
    const gg = ctx.createLinearGradient(x - w, 0, x + w, 0);
    const c = dark ? '0,0,0' : '255,255,255', a = dark ? 0.1 : 0.035;
    gg.addColorStop(0, `rgba(${c},0)`); gg.addColorStop(0.5, `rgba(${c},${a})`); gg.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = gg; ctx.fillRect(x - w, 0, w * 2, CH);
  }

  const shoulder = half[5], armpit = half[2], cuffIn = half[3], cuffOut = half[4], hem = half[1];
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 3;
  [1, -1].forEach(s => line(ctx, [s * shoulder[0] * 0.97, shoulder[1] - 0.02], [s * armpit[0], armpit[1]]));

  const dashed = (a, b, c = 'rgba(255,255,255,.35)') => {
    ctx.save(); ctx.setLineDash([9, 7]); ctx.strokeStyle = c; ctx.lineWidth = 2; line(ctx, a, b); ctx.restore();
  };

  if (type === 'tee') {
    dashed([-hem[0] + 0.02, hem[1] + 0.07], [hem[0] - 0.02, hem[1] + 0.07]);
    [1, -1].forEach(s => {
      const a = [s * cuffIn[0], cuffIn[1]], b = [s * cuffOut[0], cuffOut[1]];
      dashed([a[0] - s * 0.02, a[1] + 0.08], [b[0] - s * 0.02, b[1] + 0.08]);
    });
  } else {
    // ribbed hem + cuffs
    ctx.fillStyle = 'rgba(0,0,0,.16)';
    ctx.fillRect(sx(-hem[0]), sy(hem[1] + 0.22), sx(hem[0]) - sx(-hem[0]), 0.22 * PX);
    ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.lineWidth = 2; line(ctx, [-hem[0], hem[1] + 0.22], [hem[0], hem[1] + 0.22]);
    ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 2;
    for (let x = -hem[0] + 0.07; x < hem[0]; x += 0.07) line(ctx, [x, hem[1]], [x, hem[1] + 0.22]);
    [1, -1].forEach(s => {
      const a = [s * cuffIn[0], cuffIn[1]], b = [s * cuffOut[0], cuffOut[1]];
      const dx = armpit[0] - cuffIn[0], dy = armpit[1] - cuffIn[1], d = Math.hypot(dx, dy);
      const u = [(s * dx) / d * 0.22, dy / d * 0.22];
      ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath();
      [a, b, [b[0] + u[0], b[1] + u[1]], [a[0] + u[0], a[1] + u[1]]].forEach(([x, y], i) => (i ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y))));
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 2; line(ctx, [a[0] + u[0], a[1] + u[1]], [b[0] + u[0], b[1] + u[1]]);
    });
  }

  // collar / hood rim
  neckLine(ctx, type);
  ctx.lineJoin = 'round';
  if (type === 'hoodie') {
    ctx.strokeStyle = 'rgba(0,0,0,.34)'; ctx.lineWidth = 46; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 3; ctx.translate(0, 24); neckLine(ctx, type); ctx.stroke(); ctx.translate(0, -24);
  } else {
    ctx.strokeStyle = 'rgba(0,0,0,.24)'; ctx.lineWidth = 28; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 2; ctx.translate(0, 15); neckLine(ctx, type); ctx.stroke(); ctx.translate(0, -15);
  }

  if (type === 'hoodie') {
    // drawcords
    ctx.strokeStyle = 'rgba(235,230,215,.9)'; ctx.lineWidth = 6;
    [1, -1].forEach(s => {
      ctx.beginPath(); ctx.moveTo(sx(s * 0.15), sy(-0.26));
      ctx.quadraticCurveTo(sx(s * 0.2), sy(-0.55), sx(s * 0.15), sy(-0.82)); ctx.stroke();
      ctx.fillStyle = 'rgba(50,50,50,.85)'; ctx.fillRect(sx(s * 0.15) - 5, sy(-0.82), 10, 22);
    });
    // kangaroo pocket
    ctx.strokeStyle = 'rgba(0,0,0,.34)'; ctx.lineWidth = 3; ctx.fillStyle = 'rgba(0,0,0,.07)';
    ctx.beginPath(); ctx.moveTo(sx(-0.5), sy(-1.0)); ctx.lineTo(sx(0.5), sy(-1.0)); ctx.lineTo(sx(0.6), sy(-1.4)); ctx.lineTo(sx(-0.6), sy(-1.4)); ctx.closePath();
    ctx.fill(); ctx.stroke();
    [1, -1].forEach(s => line(ctx, [s * 0.5, -1.0], [s * 0.38, -1.12]));
  }

  drawPrint(ctx, print);
  ctx.restore();
}

export function makeThumb(type, color, print, w = 300) {
  const c = document.createElement('canvas');
  c.width = CW; c.height = CH;
  drawFace(c.getContext('2d'), type, { color, print });
  const out = document.createElement('canvas');
  out.width = w; out.height = Math.round(w * CH / CW);
  out.getContext('2d').drawImage(c, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

// ---------- 3D ----------
const geoCache = {};
function bodyGeo(type) {
  if (geoCache[type]) return geoCache[type];
  const shape = new THREE.Shape();
  OUT[type].forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.045, bevelSegments: 4, curveSegments: 6 });
  geo.translate(0, 0, -0.05);
  return (geoCache[type] = geo);
}
let hoodGeo;
function getHoodGeo() {
  if (hoodGeo) return hoodGeo;
  const s = new THREE.Shape();
  s.moveTo(-0.5, -0.2);
  s.absellipse(0, -0.05, 0.5, 0.52, Math.PI, 0, true);
  s.lineTo(0.5, -0.2); s.closePath();
  hoodGeo = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 4, curveSegments: 20 });
  hoodGeo.translate(0, 0, -0.08);
  return hoodGeo;
}

let bump;
function fabricBump() {
  if (bump) return bump;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  for (let i = 0; i < 128; i += 2) for (let j = 0; j < 128; j += 2) {
    const v = 120 + ((i + j) % 4 === 0 ? 40 : 0) + Math.random() * 60;
    x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(i, j, 2, 2);
  }
  bump = new THREE.CanvasTexture(c);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping; bump.repeat.set(5, 5);
  return bump;
}

export function makeHangerMaterial(theme) {
  return new THREE.MeshStandardMaterial({
    color: theme.hanger, metalness: theme.hangerMetal ? 0.9 : 0.05, roughness: theme.hangerMetal ? 0.28 : 0.55,
  });
}
export function styleHangerMaterial(mat, theme) {
  mat.color.set(theme.hanger); mat.metalness = theme.hangerMetal ? 0.9 : 0.05; mat.roughness = theme.hangerMetal ? 0.28 : 0.55;
}

function buildHanger(drop, mat, halfW = 0.64, dy = 0.26) {
  const g = new THREE.Group();
  const top = -(0.36 + drop);
  const r = 0.075;
  const pts = [new THREE.Vector3(0, top, 0), new THREE.Vector3(0, -r, 0)];
  for (let a = 0; a <= 250; a += 15) { // curl over the rail in the y-z plane
    const t = THREE.MathUtils.degToRad(a);
    pts.push(new THREE.Vector3(0, -r * Math.cos(t), r * Math.sin(t)));
  }
  const hook = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), 60, 0.011, 8), mat);
  const path = new THREE.CurvePath();
  const A = new THREE.Vector3(-halfW, top - dy, 0), B = new THREE.Vector3(0, top, 0), C = new THREE.Vector3(halfW, top - dy, 0);
  path.add(new THREE.LineCurve3(A, B)); path.add(new THREE.LineCurve3(B, C)); path.add(new THREE.LineCurve3(C, A));
  const frame = new THREE.Mesh(new THREE.TubeGeometry(path, 90, 0.011, 8, true), mat);
  hook.castShadow = frame.castShadow = true;
  g.add(hook, frame);
  return g;
}

// A hanging item: pivot group at rail height. group.userData holds the interaction state.
export function buildItem(product, cfg, hangerMat) {
  const root = new THREE.Group();
  const drop = HANGER_DROP[product.type];
  root.add(buildHanger(drop, hangerMat));

  const garment = new THREE.Group();
  garment.position.y = -0.5 - drop;
  root.add(garment);

  const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.9, sheen: 0.5, sheenRoughness: 0.6, bumpMap: fabricBump(), bumpScale: 0.5 });
  const body = new THREE.Mesh(bodyGeo(product.type), mat);
  body.castShadow = true; body.receiveShadow = true;
  garment.add(body);

  let hood = null;
  if (product.type === 'hoodie') {
    hood = new THREE.Mesh(getHoodGeo(), mat);
    hood.position.set(0, 0.02, -0.17); hood.castShadow = true;
    garment.add(hood);
  }

  const canvas = document.createElement('canvas'); canvas.width = CW; canvas.height = CH;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(CW / PX, CH / PX),
    new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false }),
  );
  face.position.set(0, BY - CH / PX / 2, 0.112);
  garment.add(face);

  const api = {
    root, garment, body, hood, canvas, tex,
    update(next) {
      Object.assign(cfg, next);
      mat.color.set(cfg.color);
      mat.sheenColor.set(cfg.color).lerp(new THREE.Color(1, 1, 1), 0.12);
      drawFace(canvas.getContext('2d'), product.type, { print: cfg.print });
      tex.needsUpdate = true;
    },
    dispose() { mat.dispose(); tex.dispose(); face.geometry.dispose(); face.material.dispose(); },
  };
  api.update({});
  return api;
}


// ---------- photo-based garment: your real product photo (cut out) hung on the hanger ----------
const PHOTO_W = { tee: 2.1, sweat: 2.3, hoodie: 2.4 };
const MAX_H = 1.9;

export function buildPhotoItem(product, cfg, hangerMat) {
  const root = new THREE.Group();
  const drop = HANGER_DROP[product.type] || 0;
  root.add(buildHanger(drop, hangerMat, 0.5, 0.2));
  const garment = new THREE.Group();
  garment.position.y = -0.4 - drop; garment.visible = false;
  root.add(garment);

  // invisible, double-sided proxy used only for hover / click picking
  const body = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
  garment.add(body);

  const state = { W: 1, H: 1, loaded: false, grid: null, mw: 0, mh: 0 };
  const pc = document.createElement('canvas');
  const printTex = new THREE.CanvasTexture(pc); printTex.colorSpace = THREE.SRGBColorSpace; printTex.anisotropy = 8;
  const printMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
    map: printTex, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2,
  }));
  printMesh.visible = false; printMesh.position.z = 0.04;
  garment.add(printMesh);
  const disposables = [printTex];

  function draw() {
    if (!state.loaded) return;
    const ctx = pc.getContext('2d');
    ctx.clearRect(0, 0, pc.width, pc.height);
    printMesh.visible = !!cfg.print;
    if (!cfg.print) { printTex.needsUpdate = true; return; }
    const pl = PLACEMENTS[cfg.print.place] || PLACEMENTS.chest;
    ctx.save();
    const k = pc.width / state.W / PX;
    ctx.scale(k, k);
    drawPrint(ctx, cfg.print, { cx: (state.W / 2 + pl.x) * PX, cy: -pl.y * (state.H / 1.55) * PX });
    ctx.restore();
    printTex.needsUpdate = true;
  }

  const ready = new Promise(resolve => {
    const img = new Image();
    img.onerror = () => { console.warn('photo failed', product.photo); resolve(); };
    img.onload = () => {
      const aspect = img.height / img.width;
      const W = Math.min(PHOTO_W[product.type] || 2.2, MAX_H / aspect), H = W * aspect;
      state.W = W; state.H = H;

      // gently curved sheet so edges fall away from the camera
      const geo = new THREE.PlaneGeometry(W, H, 18, 18);
      geo.translate(0, -H / 2, 0);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const u = pos.getX(i) / (W / 2);
        pos.setZ(i, 0.07 * (1 - u * u));
      }
      geo.computeVertexNormals();
      body.geometry = geo; printMesh.geometry = geo;

      const tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.needsUpdate = true;

      // alpha mask: used for the solid edge layers and for accurate hover hit-testing
      const mw = 1000, mh = Math.round(1000 * aspect);
      const mc = document.createElement('canvas'); mc.width = mw; mc.height = mh;
      const mx = mc.getContext('2d'); mx.drawImage(img, 0, 0, mw, mh);
      const d = mx.getImageData(0, 0, mw, mh), grid = new Uint8Array(mw * mh);
      for (let i = 0; i < grid.length; i++) { const a = d.data[i * 4 + 3]; grid[i] = a; d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = a; d.data[i * 4 + 3] = 255; }
      mx.putImageData(d, 0, 0);
      const maskTex = new THREE.CanvasTexture(mc);
      Object.assign(state, { grid, mw, mh });

      const face = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        color: 0x666666, map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.68, roughness: 1, metalness: 0,
        alphaTest: 0.5, alphaToCoverage: true, toneMapped: false,
      }));
      face.position.z = 0.035; face.castShadow = true; face.receiveShadow = true;
      garment.add(face);

      const edge = new THREE.Color(product.hex || '#888').multiplyScalar(0.62);
      [-0.04, -0.027, -0.014, -0.001, 0.012].forEach(z => {
        const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
          color: edge, alphaMap: maskTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1, toneMapped: false,
        }));
        m.position.z = z; m.receiveShadow = true; garment.add(m);
        disposables.push(m.material);
      });
      disposables.push(tex, maskTex, face.material, geo);

      pc.width = 1024; pc.height = Math.round(1024 * H / W);
      state.loaded = true; garment.visible = true;
      draw(); resolve();
    };
    img.src = product.photo;
  });

  const api = {
    root, garment, body, hood: null, ready,
    hit(uv) {
      if (!state.grid) return false;
      const ix = Math.min(state.mw - 1, Math.max(0, Math.floor(uv.x * state.mw)));
      const iy = Math.min(state.mh - 1, Math.max(0, Math.floor((1 - uv.y) * state.mh)));
      return state.grid[iy * state.mw + ix] > 110;
    },
    update(next) { Object.assign(cfg, { print: next.print ?? null }); draw(); },
    dispose() { disposables.forEach(d => d.dispose?.()); },
  };
  return api;
}
