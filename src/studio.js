import { GARMENT_COLORS, FONTS, PRINT_COLORS, PLACEMENTS } from './data.js';
import { composeSide, layerMetrics, loadImage, cutout, lightness } from './imaging.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let uid = 1;

export function createStudio(host, { toast }) {
  host.innerHTML = `
  <div class="studio-card" role="dialog" aria-modal="true" aria-label="Design studio">
    <header class="studio-head">
      <div><h3>Design studio</h3><p id="sdName"></p></div>
      <div class="studio-actions"><button class="btn ghost" id="sdMock">✦ Generate mockups</button><button class="btn primary" id="sdDone">Done</button></div>
    </header>
    <div class="studio-body">
      <section class="stage-col">
        <div class="side-tabs" role="tablist"><button role="tab" data-side="front">Front <b id="sdFrontN"></b></button><button role="tab" data-side="back">Back <b id="sdBackN"></b></button></div>
        <div class="stage" id="sdStage"><canvas id="sdBase"></canvas><canvas id="sdUi"></canvas></div>
        <p class="stage-hint">Drag to move · pull the corner dot to resize · turn it with the top knob</p>
      </section>
      <aside class="studio-ctl">
        <h4>Garment colour <em id="sdColorName"></em></h4>
        <div class="swatches small" id="sdColors"></div>
        <h4>Add your design</h4>
        <div class="row"><label class="btn primary small">Upload artwork<input type="file" id="sdFile" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden></label>
          <button class="btn ghost small" id="sdAddText">Add text</button></div>
        <label class="chk"><input type="checkbox" id="sdRemoveBg" checked> Remove plain background from uploads</label>
        <h4>Layers on this side</h4>
        <ul class="layers" id="sdLayers"></ul>
        <div class="sel" id="sdSel" hidden>
          <h4>Selected</h4>
          <div class="seg" id="sdPlace"></div>
          <label class="fld">Size <input type="range" id="sdSize" min="0.04" max="1" step="0.005"></label>
          <label class="fld">Rotate <input type="range" id="sdRot" min="-180" max="180" step="1"></label>
          <div class="row"><button class="btn ghost small" id="sdFlip">Flip</button><button class="btn ghost small" id="sdDel">Delete layer</button></div>
          <div id="sdTextCtl" hidden>
            <label class="fld">Text <textarea id="sdText" rows="2" maxlength="60"></textarea></label>
            <div class="seg" id="sdFont"></div>
            <div class="swatches small" id="sdTextColors"></div>
          </div>
        </div>
      </aside>
    </div>
  </div>`;
  const q = s => host.querySelector(s), base = q('#sdBase'), ui = q('#sdUi');
  let c = null, side = 'front', sel = null, drag = null, raf = 0, dirty = true;

  const cfgLayers = () => c.cfg.layers;
  const here = () => cfgLayers().filter(l => l.side === side);
  const byId = id => cfgLayers().find(l => l.id === id);
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); };
  const touch = () => { dirty = true; schedule(); };

  function paint() {
    if (!c) return;
    if (dirty) { composeSide(c.G, c.cfg, side, base); dirty = false; }
    ui.width = c.G.W; ui.height = c.G.H;
    const x = ui.getContext('2d'), k = c.G.W / base.getBoundingClientRect().width || 1;
    // print-area guide
    x.save(); x.setLineDash([10 * k, 8 * k]); x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 1.5 * k;
    const g = side === 'front' ? [0.28, 0.2, 0.72, 0.78] : [0.26, 0.14, 0.74, 0.8];
    x.strokeRect(g[0] * c.G.W, g[1] * c.G.H, (g[2] - g[0]) * c.G.W, (g[3] - g[1]) * c.G.H); x.restore();
    const L = sel && byId(sel); if (!L || L.side !== side) return;
    const m = layerMetrics(L, c.G.W); if (!m) return;
    x.save(); x.translate(L.u * c.G.W, L.v * c.G.H); x.rotate(L.rot || 0);
    x.strokeStyle = '#4f8cff'; x.lineWidth = 2 * k; x.strokeRect(-m.w / 2, -m.h / 2, m.w, m.h);
    x.beginPath(); x.moveTo(0, -m.h / 2); x.lineTo(0, -m.h / 2 - 26 * k); x.stroke();
    x.fillStyle = '#fff'; x.lineWidth = 2 * k;
    for (const [hx, hy] of [[m.w / 2, m.h / 2], [0, -m.h / 2 - 26 * k]]) { x.beginPath(); x.arc(hx, hy, 8 * k, 0, 7); x.fill(); x.stroke(); }
    x.restore();
  }

  // ---- pointer handling (coordinates in garment-photo pixels)
  const pt = e => { const r = base.getBoundingClientRect(); return { x: (e.clientX - r.left) * c.G.W / r.width, y: (e.clientY - r.top) * c.G.H / r.height, k: c.G.W / r.width }; };
  const toLocal = (L, p) => { const dx = p.x - L.u * c.G.W, dy = p.y - L.v * c.G.H, a = -(L.rot || 0), ca = Math.cos(a), sa = Math.sin(a); let x = dx * ca - dy * sa; const y = dx * sa + dy * ca; if (L.flip) x = -x; return { x, y }; };
  function hitLayer(p) {
    for (const L of here().reverse()) { const m = layerMetrics(L, c.G.W); if (!m) continue; const l = toLocal(L, p); if (Math.abs(l.x) <= m.w / 2 && Math.abs(l.y) <= m.h / 2) return L; }
    return null;
  }
  ui.addEventListener('pointerdown', e => {
    if (!c) return; const p = pt(e), L = sel && byId(sel);
    if (L && L.side === side) {
      const m = layerMetrics(L, c.G.W), cos = Math.cos(L.rot || 0), sin = Math.sin(L.rot || 0), ctr = { x: L.u * c.G.W, y: L.v * c.G.H };
      const hs = (lx, ly) => ({ x: ctr.x + lx * cos - ly * sin, y: ctr.y + lx * sin + ly * cos });
      const sc = hs(m.w / 2, m.h / 2), ro = hs(0, -m.h / 2 - 26 * p.k);
      if (Math.hypot(p.x - sc.x, p.y - sc.y) < 16 * p.k) { drag = { mode: 'scale', L, d0: Math.hypot(p.x - ctr.x, p.y - ctr.y), w0: L.type === 'image' ? L.w : L.size }; ui.setPointerCapture(e.pointerId); return; }
      if (Math.hypot(p.x - ro.x, p.y - ro.y) < 16 * p.k) { drag = { mode: 'rotate', L }; ui.setPointerCapture(e.pointerId); return; }
    }
    const h = hitLayer(p);
    sel = h ? h.id : null;
    if (h) { drag = { mode: 'move', L: h, p0: p, u0: h.u, v0: h.v }; ui.setPointerCapture(e.pointerId); }
    syncControls(); schedule();
  });
  ui.addEventListener('pointermove', e => {
    if (!drag) return; const p = pt(e), L = drag.L;
    if (drag.mode === 'move') { L.u = Math.min(0.98, Math.max(0.02, drag.u0 + (p.x - drag.p0.x) / c.G.W)); L.v = Math.min(0.98, Math.max(0.02, drag.v0 + (p.y - drag.p0.y) / c.G.H)); }
    else if (drag.mode === 'scale') {
      const f = Math.hypot(p.x - L.u * c.G.W, p.y - L.v * c.G.H) / (drag.d0 || 1);
      if (L.type === 'image') L.w = Math.min(1.2, Math.max(0.04, drag.w0 * f)); else L.size = Math.min(0.3, Math.max(0.02, drag.w0 * f));
      syncSliders();
    } else { let a = Math.atan2(p.y - L.v * c.G.H, p.x - L.u * c.G.W) + Math.PI / 2; if (Math.abs(a) < 0.07) a = 0; L.rot = a; syncSliders(); }
    touch();
  });
  const endDrag = () => { drag = null; };
  ui.addEventListener('pointerup', endDrag); ui.addEventListener('pointercancel', endDrag);

  // ---- controls
  function syncSliders() {
    const L = sel && byId(sel); if (!L) return;
    q('#sdSize').min = L.type === 'image' ? 0.04 : 0.02; q('#sdSize').max = L.type === 'image' ? 1 : 0.3;
    q('#sdSize').value = L.type === 'image' ? L.w : L.size;
    let deg = Math.round(((L.rot || 0) * 180) / Math.PI); deg = ((deg + 540) % 360) - 180; q('#sdRot').value = deg;
  }
  function syncControls() {
    q('#sdFrontN').textContent = cfgLayers().filter(l => l.side === 'front').length || '';
    q('#sdBackN').textContent = cfgLayers().filter(l => l.side === 'back').length || '';
    host.querySelectorAll('[data-side]').forEach(b => b.setAttribute('aria-selected', b.dataset.side === side));
    q('#sdLayers').innerHTML = here().slice().reverse().map(L => `<li data-id="${L.id}" class="${L.id === sel ? 'on' : ''}">
      ${L.type === 'image' ? `<img src="${L.src}" alt="">` : `<span class="tglyph">T</span>`}<span>${L.type === 'image' ? 'Artwork' : esc((L.text || '').split('\n')[0] || 'Text')}</span></li>`).join('') || '<li class="none">Nothing on the ' + side + ' yet. Upload artwork or add text.</li>';
    const L = sel && byId(sel), show = !!L && L.side === side;
    q('#sdSel').hidden = !show; if (!show) return;
    q('#sdPlace').innerHTML = PLACEMENTS[side].map(p => `<button data-p="${p.id}">${p.label}</button>`).join('');
    q('#sdTextCtl').hidden = L.type !== 'text';
    if (L.type === 'text') {
      q('#sdText').value = L.text;
      q('#sdFont').innerHTML = Object.entries(FONTS).map(([k, f]) => `<button data-f="${k}" style="font-family:${f.css}" aria-pressed="${L.font === k}">${f.label}</button>`).join('');
      q('#sdTextColors').innerHTML = PRINT_COLORS.map(col => `<button class="sw" data-c="${col}" style="--c:${col}" aria-pressed="${L.color === col}" aria-label="${col}"></button>`).join('');
    }
    syncSliders();
  }
  function renderColors() {
    q('#sdColors').innerHTML = GARMENT_COLORS.map(g => `<button class="sw ${g.hex ? '' : 'orig'}" data-n="${g.name}" style="--c:${g.hex || c.G.baseHex}" aria-pressed="${(c.cfg.colorName || 'Original') === g.name}" aria-label="${g.name}" title="${g.name}"></button>`).join('');
    q('#sdColorName').textContent = '— ' + (c.cfg.colorName || 'Original');
  }

  q('#sdColors').onclick = e => {
    const b = e.target.closest('[data-n]'); if (!b) return;
    const g = GARMENT_COLORS.find(x => x.name === b.dataset.n); c.cfg.hex = g.hex; c.cfg.colorName = g.name; renderColors(); touch();
  };
  host.querySelector('.side-tabs').onclick = e => { const b = e.target.closest('[data-side]'); if (!b) return; side = b.dataset.side; sel = null; dirty = true; syncControls(); schedule(); };
  q('#sdLayers').onclick = e => { const li = e.target.closest('li[data-id]'); if (li) { sel = li.dataset.id; syncControls(); schedule(); } };
  q('#sdPlace').onclick = e => {
    const b = e.target.closest('[data-p]'), L = sel && byId(sel); if (!b || !L) return;
    const p = PLACEMENTS[side].find(x => x.id === b.dataset.p); L.u = p.u; L.v = p.v; fitWidth(L, p.w); L.rot = 0; syncSliders(); touch();
  };
  q('#sdSize').oninput = e => { const L = byId(sel); if (!L) return; if (L.type === 'image') L.w = +e.target.value; else L.size = +e.target.value; touch(); };
  q('#sdRot').oninput = e => { const L = byId(sel); if (L) { L.rot = (+e.target.value * Math.PI) / 180; touch(); } };
  q('#sdFlip').onclick = () => { const L = byId(sel); if (L) { L.flip = !L.flip; touch(); } };
  q('#sdDel').onclick = removeSel;
  q('#sdText').oninput = e => { const L = byId(sel); if (L) { L.text = e.target.value; touch(); syncLayerList(); } };
  q('#sdFont').onclick = e => { const b = e.target.closest('[data-f]'), L = byId(sel); if (b && L) { L.font = b.dataset.f; L.fontCss = FONTS[L.font].css; syncControls(); touch(); } };
  q('#sdTextColors').onclick = e => { const b = e.target.closest('[data-c]'), L = byId(sel); if (b && L) { L.color = b.dataset.c; syncControls(); touch(); } };
  const syncLayerList = () => { const li = q(`#sdLayers li[data-id="${sel}"] span:last-child`); const L = byId(sel); if (li && L) li.textContent = (L.text || '').split('\n')[0] || 'Text'; };
  function removeSel() { const L = byId(sel); if (!L) return; c.cfg.layers = cfgLayers().filter(l => l !== L); sel = null; syncControls(); touch(); }
  function fitWidth(L, w) { // keep tall artwork inside ~58% of garment height
    if (L.type !== 'image') { L.size = Math.min(0.3, w * 0.28); return; }
    const aspect = L.img.height / L.img.width; L.w = Math.min(w, (0.58 * c.G.H) / (c.G.W * aspect));
  }

  q('#sdFile').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (f.size > 8e6) return toast('Please use an image under 8 MB');
    try {
      const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
      const im = await loadImage(url), art = cutout(im, { maxW: 900, removeBg: q('#sdRemoveBg').checked });
      const p = PLACEMENTS[side][0], L = { id: 'l' + uid++, type: 'image', side, img: art, src: art.toDataURL('image/png'), u: p.u, v: p.v, w: p.w, rot: 0, flip: false };
      fitWidth(L, p.w); c.cfg.layers.push(L); sel = L.id; syncControls(); touch();
    } catch (err) { toast('Could not read that image. Try a PNG or JPG.'); }
  };
  q('#sdAddText').onclick = () => {
    const p = PLACEMENTS[side][0], dark = lightness(c.cfg.hex || c.G.baseHex) > 0.3;
    const L = { id: 'l' + uid++, type: 'text', side, text: 'YOUR TEXT', font: 'impact', fontCss: FONTS.impact.css, color: dark ? '#18181b' : '#f2efe8', size: 0.075, u: p.u, v: p.v, rot: 0, flip: false };
    c.cfg.layers.push(L); sel = L.id; syncControls(); touch();
  };
  q('#sdDone').onclick = () => api.close();
  q('#sdMock').onclick = () => c.onMockups();
  host.addEventListener('pointerdown', e => { if (e.target === host) api.close(); });
  addEventListener('keydown', e => { if (!c || e.target.matches('input,textarea')) return; if (e.key === 'Delete' || e.key === 'Backspace') { removeSel(); e.preventDefault(); } });
  addEventListener('resize', () => c && schedule());

  const api = {
    isOpen: () => !!c,
    open(ctx) {
      c = ctx; side = 'front'; sel = null; dirty = true;
      host.hidden = false; q('#sdName').textContent = ctx.product.name;
      base.width = ctx.G.W; base.height = ctx.G.H; q('#sdStage').style.setProperty('--ar', ctx.G.W / ctx.G.H); renderColors(); syncControls(); schedule();
    },
    close() { if (!c) return; const done = c.onClose; c = null; host.hidden = true; done(); },
  };
  return api;
}
