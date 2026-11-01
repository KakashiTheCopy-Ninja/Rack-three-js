// All pixel work: background removal, garment recolouring, back-view generation, print compositing, silhouette tracing.
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const LUT_N = 3000; // linear 0..1.5 -> sRGB 0..255
const TO_SRGB = new Uint8ClampedArray(LUT_N + 1);
for (let i = 0; i <= LUT_N; i++) { const v = (i / LUT_N) * 1.5; TO_SRGB[i] = 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055); }
const lumLin = (r, g, b) => 0.2126 * LIN[r] + 0.7152 * LIN[g] + 0.0722 * LIN[b];
const hexRGB = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbHex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
export const lightness = hex => { const [r, g, b] = hexRGB(hex); return lumLin(r, g, b); };

export function loadImage(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('image failed to load')); im.src = src; });
}
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// ------------------------------------------------------------------ background removal
// Plain-colour backgrounds connected to the image border are removed. Photos with real transparency are only cropped.
export function cutout(img, { maxW = 1000, removeBg = true } = {}) {
  const s = Math.min(1, maxW / img.width), W = Math.round(img.width * s), H = Math.round(img.height * s), N = W * H;
  const c = mk(W, H), ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H);
  const id = ctx.getImageData(0, 0, W, H), d = id.data;
  let hasAlpha = false;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 200) { hasAlpha = true; break; }

  let fg = new Uint8Array(N);
  if (hasAlpha) { for (let i = 0; i < N; i++) fg[i] = d[i * 4 + 3] > 128 ? 1 : 0; }
  else if (!removeBg) fg.fill(1);
  else {
    let r = 0, g = 0, b = 0, n = 0;
    const add = i => { r += d[i * 4]; g += d[i * 4 + 1]; b += d[i * 4 + 2]; n++; };
    for (let x = 0; x < W; x++) for (let t = 0; t < 3; t++) { add(t * W + x); add((H - 1 - t) * W + x); }
    for (let y = 0; y < H; y++) for (let t = 0; t < 3; t++) { add(y * W + t); add(y * W + W - 1 - t); }
    r /= n; g /= n; b /= n;
    const tol2 = 38 * 38, bg = new Uint8Array(N), stack = new Int32Array(N); let sp = 0;
    const like = i => { const k = i * 4, dr = d[k] - r, dg = d[k + 1] - g, db = d[k + 2] - b; return dr * dr + dg * dg + db * db < tol2; };
    const push = i => { if (!bg[i] && like(i)) { bg[i] = 1; stack[sp++] = i; } };
    for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
    while (sp) {
      const i = stack[--sp], x = i % W;
      if (x > 0) push(i - 1); if (x < W - 1) push(i + 1); if (i >= W) push(i - W); if (i < N - W) push(i + W);
    }
    for (let i = 0; i < N; i++) fg[i] = bg[i] ? 0 : 1;
  }
  fg = largestComponent(fg, W, H);
  fg = fillHoles(fg, W, H);
  // erode 1px (kills the white halo), then soften
  const er = new Uint8Array(N);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; er[i] = fg[i] && fg[i - 1] && fg[i + 1] && fg[i - W] && fg[i + W] ? 1 : 0; }
  let a = Float32Array.from(er);
  for (let pass = 0; pass < 2; pass++) a = boxBlur(a, W, H);
  const alpha = new Uint8Array(N);
  for (let i = 0; i < N; i++) alpha[i] = Math.round(clamp((a[i] - 0.3) / 0.5, 0, 1) * 255);
  // pull edge colours from the solid interior so no background colour bleeds through
  const solid = new Uint8Array(N);
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { const i = y * W + x; solid[i] = er[i] && er[i - 2] && er[i + 2] && er[i - 2 * W] && er[i + 2 * W] ? 1 : 0; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (solid[i] || !alpha[i]) continue;
    let r = 0, g = 0, b = 0, n = 0;
    for (let R = 3; R <= 9 && !n; R += 3) for (let yy = Math.max(0, y - R); yy <= Math.min(H - 1, y + R); yy++) for (let xx = Math.max(0, x - R); xx <= Math.min(W - 1, x + R); xx++) {
      const j = yy * W + xx; if (solid[j]) { r += d[j * 4]; g += d[j * 4 + 1]; b += d[j * 4 + 2]; n++; }
    }
    if (n) { d[i * 4] = r / n; d[i * 4 + 1] = g / n; d[i * 4 + 2] = b / n; }
  }
  let x0 = W, x1 = 0, y0 = H, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (alpha[y * W + x] > 13) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 <= x0) throw new Error('Could not find the garment in that photo');
  for (let i = 0; i < N; i++) d[i * 4 + 3] = alpha[i];
  ctx.putImageData(id, 0, 0);
  const pad = 6; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const out = mk(x1 - x0 + 1, y1 - y0 + 1);
  out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

function boxBlur(a, W, H) {
  const o = new Float32Array(a.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= H) continue; for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= W) continue; s += a[yy * W + xx]; n++; } }
    o[y * W + x] = s / n;
  }
  return o;
}
function largestComponent(fg, W, H) {
  const N = W * H, label = new Int32Array(N), stack = new Int32Array(N); let best = 0, bestSize = 0, id = 0;
  for (let s = 0; s < N; s++) {
    if (!fg[s] || label[s]) continue;
    id++; let sp = 0, size = 0; stack[sp++] = s; label[s] = id;
    while (sp) {
      const i = stack[--sp]; size++; const x = i % W, y = (i / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx; if (fg[j] && !label[j]) { label[j] = id; stack[sp++] = j; }
      }
    }
    if (size > bestSize) { bestSize = size; best = id; }
  }
  const o = new Uint8Array(N); for (let i = 0; i < N; i++) o[i] = label[i] === best ? 1 : 0; return o;
}
function fillHoles(fg, W, H) {
  const N = W * H, out = new Uint8Array(N), stack = new Int32Array(N); let sp = 0;
  const push = i => { if (!fg[i] && !out[i]) { out[i] = 2; stack[sp++] = i; } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (sp) { const i = stack[--sp], x = i % W; if (x > 0) push(i - 1); if (x < W - 1) push(i + 1); if (i >= W) push(i - W); if (i < N - W) push(i + W); }
  const o = new Uint8Array(N); for (let i = 0; i < N; i++) o[i] = out[i] === 2 ? 0 : 1; return o;
}

// ------------------------------------------------------------------ garment analysis
export function prepareGarment(canvas) {
  const W = canvas.width, H = canvas.height, N = W * H;
  const id = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H), d = id.data;
  const hist = new Uint32Array(4096), sr = new Float64Array(4096), sg = new Float64Array(4096), sb = new Float64Array(4096);
  for (let i = 0; i < N; i++) {
    const k = i * 4; if (d[k + 3] < 250) continue;
    const q = ((d[k] >> 4) << 8) | ((d[k + 1] >> 4) << 4) | (d[k + 2] >> 4);
    hist[q]++; sr[q] += d[k]; sg[q] += d[k + 1]; sb[q] += d[k + 2];
  }
  let best = 0; for (let q = 1; q < 4096; q++) if (hist[q] > hist[best]) best = q;
  const base = [sr[best] / hist[best], sg[best] / hist[best], sb[best] / hist[best]].map(Math.round);
  const Y0 = Math.max(lumLin(...base), 1e-4), bs = base[0] + base[1] + base[2] + 1e-3, n0 = [base[0] / bs, base[1] / bs];

  // w = how "plain fabric" a pixel is (1 = recolour fully, 0 = print / label / seam, leave alone)
  const w = new Float32Array(N), ratio = new Float32Array(N), alpha = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const k = i * 4; alpha[i] = d[k + 3];
    const r = d[k], g = d[k + 1], b = d[k + 2], Y = lumLin(r, g, b), s = r + g + b;
    const dc = s < 36 ? 0 : Math.hypot(r / s - n0[0], g / s - n0[1]);
    const dl = Math.abs(Math.log((Y + 1e-3) / (Y0 + 1e-3)));
    w[i] = (1 - smooth(0.04, 0.085, dc)) * (1 - smooth(0.5, 0.78, dl));
    ratio[i] = clamp(Y / Y0, 0.15, 2.6);
  }
  // low-frequency shading map (folds & light falloff), used to shade prints and to build the back
  const gw = Math.ceil(W / 8), gh = Math.ceil(H / 8), gs = new Float32Array(gw * gh), gc = new Float32Array(gw * gh), gt = new Float32Array(gw * gh);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (alpha[i] < 250) continue; const gi = (y >> 3) * gw + (x >> 3); gt[gi]++;
    if (w[i] > 0.9) { gs[gi] += ratio[i]; gc[gi]++; }
  }
  const grid = new Float32Array(gw * gh).fill(NaN);
  for (let i = 0; i < grid.length; i++) if (gc[i] > 6 && gc[i] / gt[i] > 0.9) grid[i] = gs[i] / gc[i]; // only cells that are almost all plain fabric
  for (let pass = 0; pass < 14; pass++) {
    const nxt = Float32Array.from(grid);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const i = y * gw + x; if (!Number.isNaN(grid[i])) continue;
      let s = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue; const v = grid[yy * gw + xx]; if (!Number.isNaN(v)) { s += v; n++; } }
      if (n) nxt[i] = s / n;
    }
    grid.set(nxt);
  }
  for (let i = 0; i < grid.length; i++) if (Number.isNaN(grid[i])) grid[i] = 1;

  // collar position (for the back-view neck rib)
  let top = 0; outer: for (; top < H; top++) for (let x = 0; x < W; x++) if (alpha[top * W + x] > 128) break outer;
  let cxs = 0, cn = 0; for (let y = top; y < Math.min(H, top + 8); y++) for (let x = 0; x < W; x++) if (alpha[y * W + x] > 128) { cxs += x; cn++; }
  const G = { W, H, aspect: H / W, data: d, w, ratio, alpha, base, baseHex: rgbHex(...base), grid, gw, gh, neck: { x: cn ? cxs / cn : W / 2, y: top }, canvas, cache: new Map() };
  G.outline = traceOutline(alpha, W, H);
  return G;
}

function sampleGrid(G, x, y) {
  const gx = clamp(x / 8 - 0.5, 0, G.gw - 1.001), gy = clamp(y / 8 - 0.5, 0, G.gh - 1.001);
  const x0 = gx | 0, y0 = gy | 0, fx = gx - x0, fy = gy - y0, g = G.grid, w = G.gw;
  return (g[y0 * w + x0] * (1 - fx) + g[y0 * w + x0 + 1] * fx) * (1 - fy) + (g[(y0 + 1) * w + x0] * (1 - fx) + g[(y0 + 1) * w + x0 + 1] * fx) * fy;
}

// ------------------------------------------------------------------ silhouette -> polygon (for the 3D body)
function traceOutline(alpha, W, H) {
  const gw = 200, gh = Math.max(20, Math.round(200 * H / W)), pw = gw + 2, ph = gh + 2, b = new Uint8Array(pw * ph);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    let s = 0, n = 0;
    const x0 = Math.floor(x * W / gw), x1 = Math.max(x0 + 1, Math.floor((x + 1) * W / gw)), y0 = Math.floor(y * H / gh), y1 = Math.max(y0 + 1, Math.floor((y + 1) * H / gh));
    for (let yy = y0; yy < Math.min(H, y1); yy += 2) for (let xx = x0; xx < Math.min(W, x1); xx += 2) { s += alpha[yy * W + xx]; n++; }
    b[(y + 1) * pw + x + 1] = s / n > 128 ? 1 : 0;
  }
  let sx = -1, sy = -1;
  outer: for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) if (b[y * pw + x]) { sx = x; sy = y; break outer; }
  if (sx < 0) return [[0, 0], [1, 0], [1, 1], [0, 1]];
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  let px = sx, py = sy, bt = 4; const pts = [[sx, sy]];
  for (let guard = 0; guard < pw * ph * 4; guard++) {
    let moved = false;
    for (let k = 1; k <= 8; k++) {
      const dd = (bt + k) % 8, nx = px + dirs[dd][0], ny = py + dirs[dd][1];
      if (nx < 0 || ny < 0 || nx >= pw || ny >= ph || !b[ny * pw + nx]) continue;
      const pd = (bt + k - 1) % 8, bx = px + dirs[pd][0] - nx, by = py + dirs[pd][1] - ny;
      bt = dirs.findIndex(([a, c]) => a === bx && c === by); if (bt < 0) bt = 0;
      px = nx; py = ny; moved = true; break;
    }
    if (!moved || (px === sx && py === sy)) break;
    pts.push([px, py]);
  }
  let poly = pts.map(([x, y]) => [(x - 0.5) / gw, (y - 0.5) / gh]);
  poly = rdp(poly, 0.0035);
  for (let it = 0; it < 2; it++) { // Chaikin smoothing
    const o = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], c = poly[(i + 1) % poly.length]; o.push([0.75 * a[0] + 0.25 * c[0], 0.75 * a[1] + 0.25 * c[1]], [0.25 * a[0] + 0.75 * c[0], 0.25 * a[1] + 0.75 * c[1]]); }
    poly = o;
  }
  return poly.filter((p, i) => { const q = poly[(i + 1) % poly.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4; });
}
function rdp(pts, eps) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, c] = st.pop(); let md = 0, mi = -1; const [ax, ay] = pts[a], [cx, cy] = pts[c], dx = cx - ax, dy = cy - ay, L = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < c; i++) { const dist = Math.abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / L; if (dist > md) { md = dist; mi = i; } }
    if (md > eps && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, c]); }
  }
  return pts.filter((_, i) => keep[i]);
}

// ------------------------------------------------------------------ recolour + back view
function basePixels(G, hex, side) {
  const key = side + '|' + (hex || 'orig');
  const hit = G.cache.get(key); if (hit) return hit;
  const { W, H } = G, c = mk(W, H), ctx = c.getContext('2d'), out = ctx.createImageData(W, H), o = out.data, d = G.data, N = W * H;
  const T = hex ? hexRGB(hex).map(v => LIN[v]) : G.base.map(v => LIN[v]);
  if (side === 'front') {
    if (!hex) o.set(d);
    else for (let i = 0; i < N; i++) {
      const k = i * 4, ww = G.w[i]; o[k + 3] = d[k + 3];
      if (ww < 0.003) { o[k] = d[k]; o[k + 1] = d[k + 1]; o[k + 2] = d[k + 2]; continue; }
      const rt = G.ratio[i] * 2000, a = TO_SRGB[Math.min(LUT_N, (T[0] * rt) | 0)], b = TO_SRGB[Math.min(LUT_N, (T[1] * rt) | 0)], e = TO_SRGB[Math.min(LUT_N, (T[2] * rt) | 0)];
      o[k] = d[k] + (a - d[k]) * ww; o[k + 1] = d[k + 1] + (b - d[k + 1]) * ww; o[k + 2] = d[k + 2] + (e - d[k + 2]) * ww;
    }
  } else { // back: the same fabric with the front print "healed" out
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, k = i * 4; o[k + 3] = d[k + 3]; if (!d[k + 3]) continue;
      const s = sampleGrid(G, x, y), hf = G.w[i] > 0.95 ? clamp(G.ratio[i] / s, 0.9, 1.1) : 1, v = s * hf * 2000;
      o[k] = TO_SRGB[Math.min(LUT_N, (T[0] * v) | 0)]; o[k + 1] = TO_SRGB[Math.min(LUT_N, (T[1] * v) | 0)]; o[k + 2] = TO_SRGB[Math.min(LUT_N, (T[2] * v) | 0)];
    }
  }
  ctx.putImageData(out, 0, 0);
  if (side === 'back') drawNeckRib(ctx, G);
  if (G.cache.size > 10) G.cache.delete(G.cache.keys().next().value);
  G.cache.set(key, c);
  return c;
}
function drawNeckRib(ctx, G) {
  const { x, y } = G.neck, W = G.W, H = G.H;
  ctx.save(); ctx.lineCap = 'round'; ctx.globalCompositeOperation = 'source-atop';
  ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = H * 0.03;
  ctx.beginPath(); ctx.moveTo(x - W * 0.135, y + H * 0.012); ctx.quadraticCurveTo(x, y + H * 0.062, x + W * 0.135, y + H * 0.012); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x - W * 0.125, y + H * 0.03); ctx.quadraticCurveTo(x, y + H * 0.08, x + W * 0.125, y + H * 0.03); ctx.stroke();
  ctx.restore();
}

// ------------------------------------------------------------------ print layers
const measure = mk(4, 4).getContext('2d');
export function layerMetrics(L, W) {
  if (L.type === 'image') { if (!L.img) return null; const w = L.w * W; return { w, h: w * (L.img.height / L.img.width) }; }
  const px = Math.max(6, L.size * W), lines = (L.text || ' ').split('\n').slice(0, 4), font = `${px}px ${L.fontCss}`;
  measure.font = font; const w = Math.max(10, ...lines.map(l => measure.measureText(l).width));
  return { w, h: lines.length * px * 1.08, px, lines, font };
}
const tmp = document.createElement('canvas');
function drawLayer(ctx, G, L) {
  const m = layerMetrics(L, G.W); if (!m) return;
  const cx = L.u * G.W, cy = L.v * G.H, ext = Math.hypot(m.w, m.h) / 2 + 3;
  const x0 = Math.max(0, Math.floor(cx - ext)), y0 = Math.max(0, Math.floor(cy - ext)), x1 = Math.min(G.W, Math.ceil(cx + ext)), y1 = Math.min(G.H, Math.ceil(cy + ext));
  const bw = x1 - x0, bh = y1 - y0; if (bw <= 0 || bh <= 0) return;
  tmp.width = bw; tmp.height = bh;
  const t = tmp.getContext('2d', { willReadFrequently: true });
  t.clearRect(0, 0, bw, bh); t.save(); t.translate(cx - x0, cy - y0); t.rotate(L.rot || 0); if (L.flip) t.scale(-1, 1);
  if (L.type === 'image') t.drawImage(L.img, -m.w / 2, -m.h / 2, m.w, m.h);
  else {
    t.font = m.font; t.fillStyle = L.color; t.textAlign = 'center'; t.textBaseline = 'middle';
    m.lines.forEach((l, i) => t.fillText(l, 0, (i - (m.lines.length - 1) / 2) * m.px * 1.08));
  }
  t.restore();
  const img = t.getImageData(0, 0, bw, bh), d = img.data;
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const k = (y * bw + x) * 4, a = d[k + 3]; if (!a) continue;
    const gi = (y0 + y) * G.W + x0 + x, ga = G.alpha[gi]; if (!ga) { d[k + 3] = 0; continue; }
    const s = clamp(sampleGrid(G, x0 + x, y0 + y), 0.55, 1.15), hf = G.w[gi] > 0.5 ? clamp(G.ratio[gi] / s, 0.85, 1.15) : 1, sh = s * (1 + (hf - 1) * 0.5);
    d[k] *= sh; d[k + 1] *= sh; d[k + 2] *= sh; d[k + 3] = (a * ga) / 255;
  }
  t.putImageData(img, 0, 0); ctx.drawImage(tmp, x0, y0);
}

// cfg = { hex: '#rrggbb' | null, layers: [...] }; returns a canvas the size of the photo.
export function composeSide(G, cfg, side, target) {
  const c = target || mk(G.W, G.H); c.width = G.W; c.height = G.H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(basePixels(G, cfg.hex || null, side), 0, 0);
  for (const L of cfg.layers) if (L.side === side && (L.type === 'text' || L.img)) drawLayer(ctx, G, L);
  return c;
}
