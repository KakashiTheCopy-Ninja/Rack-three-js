import { composeSide, lightness } from './imaging.js';
import { GARMENT_COLORS, MOCKUP_COLORS } from './data.js';
import { snapshotYaws } from './model.js';

const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const tick = () => new Promise(r => setTimeout(r, 16));

function drawGarment(ctx, cv, cx, top, width, { angle = 0, blur = 44, offY = 28, alpha = 0.32 } = {}) {
  const h = width * (cv.height / cv.width);
  ctx.save(); ctx.translate(cx, top + h / 2); ctx.rotate(angle);
  ctx.shadowColor = `rgba(0,0,0,${alpha})`; ctx.shadowBlur = blur; ctx.shadowOffsetY = offY;
  ctx.drawImage(cv, -width / 2, -h / 2, width, h); ctx.restore(); return h;
}
function backdrop(ctx, w, h, a, b) {
  const g = ctx.createRadialGradient(w / 2, h * 0.4, 50, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, a); g.addColorStop(1, b); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}
const label = (ctx, text, x, y, size, color, weight = 600, align = 'center', font = '"Helvetica Neue", Arial, sans-serif') => {
  ctx.fillStyle = color; ctx.font = `${weight} ${size}px ${font}`; ctx.textAlign = align; ctx.fillText(text, x, y);
};

export async function generateMockups({ it, product, brand, onProgress }) {
  const G = it.b.G, cfg = it.cfg, out = [], hexNow = cfg.hex || G.baseHex, dark = lightness(hexNow) < 0.35;
  const step = (n, total) => onProgress && onProgress(n, total);
  const total = 6; let n = 0;
  const front = composeSide(G, cfg, 'front'), back = composeSide(G, cfg, 'back');

  // 1 + 2 flat views
  for (const [title, cv] of [['Front', front], ['Back', back]]) {
    const c = mk(1200, 1200), x = c.getContext('2d'); backdrop(x, 1200, 1200, '#f6f3ee', '#e2ddd3');
    const w = Math.min(1040, 1000 / (cv.height / cv.width)); drawGarment(x, cv, 600, (1200 - w * (cv.height / cv.width)) / 2 - 10, w);
    label(x, title.toUpperCase(), 600, 1150, 26, 'rgba(0,0,0,.4)', 700); out.push({ title: `${title} view`, canvas: c }); step(++n, total); await tick();
  }

  // 3 on a hanger
  {
    const c = mk(1200, 1500), x = c.getContext('2d'); backdrop(x, 1200, 1500, '#ece6dc', '#d6cebf');
    x.fillStyle = 'rgba(0,0,0,.08)'; x.fillRect(0, 1380, 1200, 120);
    x.strokeStyle = '#b8944f'; x.lineWidth = 16; x.lineCap = 'round'; x.beginPath(); x.moveTo(0, 120); x.lineTo(1200, 120); x.stroke();
    x.lineWidth = 9; x.beginPath(); x.arc(600, 98, 34, Math.PI * 0.55, Math.PI * 2.1); x.stroke();
    x.beginPath(); x.moveTo(600, 131); x.lineTo(600, 230); x.lineTo(310, 335); x.lineTo(890, 335); x.lineTo(600, 230); x.stroke();
    const w = Math.min(980, 1180 / front.height * front.width), h = drawGarment(x, front, 600, 215, w, { blur: 36, offY: 30 });
    x.fillStyle = 'rgba(0,0,0,.14)'; x.beginPath(); x.ellipse(600, 215 + h + 40, w * 0.38, 22, 0, 0, 7); x.fill();
    out.push({ title: 'On the rack', canvas: c }); step(++n, total); await tick();
  }

  // 4 colour range
  {
    const picks = MOCKUP_COLORS.map(nm => GARMENT_COLORS.find(g => g.name === nm)).filter(Boolean).slice(0, 6);
    const c = mk(1800, 1400), x = c.getContext('2d'); x.fillStyle = '#f2efe9'; x.fillRect(0, 0, 1800, 1400);
    label(x, 'AVAILABLE IN', 900, 70, 26, 'rgba(0,0,0,.45)', 700);
    for (let i = 0; i < picks.length; i++) {
      const cv = composeSide(G, { hex: picks[i].hex, layers: cfg.layers }, 'front'), col = i % 3, row = (i / 3) | 0, cx = 300 + col * 600, ty = 120 + row * 640;
      x.fillStyle = row === 0 ? '#ebe7df' : '#e7e2d8'; x.fillRect(col * 600 + 20, ty - 20, 560, 610);
      const w = Math.min(500, 480 / (cv.height / cv.width)); drawGarment(x, cv, cx, ty + 10, w, { blur: 26, offY: 16, alpha: 0.28 });
      label(x, picks[i].name, cx, ty + 560, 28, '#3a352c', 600);
      await tick();
    }
    out.push({ title: 'Colour range', canvas: c }); step(++n, total);
  }

  // 5 poster
  {
    const c = mk(1080, 1350), x = c.getContext('2d');
    if (dark) backdrop(x, 1080, 1350, '#efe5d4', '#d9c9ae'); else backdrop(x, 1080, 1350, '#2f2c27', '#14130f');
    const ink = dark ? '#2a2620' : '#f4efe6';
    label(x, 'NEW DROP', 70, 150, 120, ink, 400, 'left', 'Georgia, "Times New Roman", serif');
    label(x, (brand || 'The Rack').toUpperCase(), 74, 205, 26, ink, 700, 'left');
    const w = Math.min(900, 900 / (front.height / front.width) * 0.95); drawGarment(x, front, 560, 330, w, { angle: -0.09, blur: 60, offY: 40, alpha: 0.45 });
    label(x, product.name, 70, 1215, 44, ink, 700, 'left'); label(x, cfg.layers.length ? 'Custom design' : 'Limited stock', 72, 1262, 28, dark ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.6)', 500, 'left');
    label(x, '$' + (product.price + (cfg.layers.length ? 12 : 0)), 1010, 1262, 60, ink, 700, 'right');
    out.push({ title: 'Launch poster', canvas: c }); step(++n, total); await tick();
  }

  // 6 turnaround from the real 3D model
  try {
    const yaws = [0, 45, 90, 135, 180], frames = snapshotYaws(it.b, yaws, 420, 560);
    const c = mk(2100 + 40, 700), x = c.getContext('2d'); backdrop(x, c.width, 700, '#f4f1ec', '#dcd6cb');
    frames.forEach((f, i) => { x.drawImage(f, 20 + i * 420, 50); label(x, `${yaws[i]}°`, 20 + i * 420 + 210, 660, 24, 'rgba(0,0,0,.5)', 700); });
    label(x, '180° TURNAROUND', c.width / 2, 40, 22, 'rgba(0,0,0,.45)', 700);
    out.push({ title: '180° turnaround', canvas: c });
  } catch (err) { console.warn('turnaround skipped', err); }
  step(total, total);
  return out;
}
