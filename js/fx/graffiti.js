/* =========================================================
   GRAFFITI EN TIEMPO REAL
   El dibujo NO es una imagen terminada: son trazos con longitud que se revelan
   según un progreso g ∈ [0,1] controlado por el scroll. Cada frame se repinta
   la libreta en capas, de abajo arriba, como en papel:
     guías a lápiz → esqueleto de letras → sombra → contorno negro → relleno de color
     → brillos → detalles (estrellas, corona, chorretones) → firma
   Devuelve también la posición de la punta (u,v) y la herramienta activa, que
   usa el grafitero para mover la mano exactamente sobre el trazo que se está haciendo.
   ========================================================= */
import * as THREE from 'three';
import { seed } from '../world/materials.js';

const W = 1536, H = 1024;
const INK = '#141010', CREAM = '#f2ead8';

/* esqueletos de letra (caja 0..1), en estilo "bubble" */
const GLYPHS = {
  B: { w: .86, s: [[[.12, .06], [.12, .5], [.12, .94]], [[.12, .06], [.5, .04], [.72, .18], [.74, .3], [.6, .46], [.12, .5]], [[.12, .5], [.6, .52], [.82, .66], [.82, .8], [.62, .94], [.12, .94]]] },
  A: { w: .94, s: [[[.06, .94], [.28, .5], [.48, .06]], [[.48, .06], [.68, .5], [.9, .94]], [[.22, .64], [.48, .66], [.74, .64]]] },
  R: { w: .86, s: [[[.12, .06], [.12, .5], [.12, .94]], [[.12, .06], [.5, .04], [.74, .18], [.76, .32], [.6, .48], [.12, .5]], [[.42, .5], [.62, .7], [.84, .94]]] },
  I: { w: .34, s: [[[.5, .06], [.5, .5], [.5, .94]]] },
  O: { w: .98, s: [[[.5, .05], [.82, .16], [.94, .5], [.82, .84], [.5, .95], [.18, .84], [.06, .5], [.18, .16], [.5, .05]]] },
};
const WORD = 'BARRIO';

function catmull(pts, n = 10) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < n; k++) { const t = k / n, t2 = t * t, t3 = t2 * t; out.push([.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3), .5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]); }
  }
  out.push(pts[pts.length - 1]); return out;
}
function makeStroke(pts, r, jit = 1.6) {
  const pl = catmull(pts, 9).map(([x, y]) => [x + (r() - .5) * jit, y + (r() - .5) * jit]);
  const cum = [0]; for (let i = 1; i < pl.length; i++) cum.push(cum[i - 1] + Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]));
  return { pl, cum, len: cum[cum.length - 1] };
}
function subPath(st, f) {                       // trozo del trazo de 0 a f (0..1)
  const L = st.len * f, out = [st.pl[0]]; let tip = st.pl[0];
  for (let i = 1; i < st.pl.length; i++) { if (st.cum[i] <= L) { out.push(st.pl[i]); tip = st.pl[i]; } else { const t = (L - st.cum[i - 1]) / Math.max(1e-6, st.cum[i] - st.cum[i - 1]), a = st.pl[i - 1], b = st.pl[i]; tip = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; out.push(tip); break; } }
  return { pts: out, tip };
}

export class Graffiti {
  constructor(q) {
    const s = q.name === 'low' ? .5 : 1;
    this.cv = document.createElement('canvas'); this.cv.width = W * s; this.cv.height = H * s; this.s = s; this.g = this.cv.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = q.aniso; this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.mat = new THREE.MeshStandardMaterial({ map: this.tex, roughness: .92, metalness: 0, envMapIntensity: .3 });
    this.progress = -1; this.tip = { u: .1, v: .1, tool: 'pencil', color: '#777', active: false };
    this._build(); this._paper(); this.set(0);
  }

  _build() {
    const r = seed(2024), fillCols = ['#ff4a2b', '#ff8a3d', '#ff7ab0', '#2f9e5f', '#f3c15a', '#ff4a2b'];
    const size = 268, gap = 22, skew = -.14; let total = 0;
    for (const ch of WORD) total += GLYPHS[ch].w * size + gap; total -= gap;
    let x0 = (W - total) / 2 + 30; const y0 = 320;
    this.letters = [];
    for (let i = 0; i < WORD.length; i++) {
      const G = GLYPHS[WORD[i]], wave = Math.sin(i * 1.1) * 14, strokes = [];
      const map = ([u, v]) => [x0 + u * size + (1 - v) * size * -skew * 1 + (r() - .5) * .0, y0 + v * size + wave];
      for (const st of G.s) strokes.push(makeStroke(st.map(map), r));
      this.letters.push({ strokes, color: fillCols[i % fillCols.length] });
      x0 += G.w * size + gap;
    }
    const all = this.letters.flatMap(l => l.strokes.map(s => ({ st: s, color: l.color })));
    this.strokes = all;
    // guías a lápiz: línea de base, cajas y marcas de proporción
    this.guides = [
      makeStroke([[90, 660], [600, 650], [1100, 664], [1460, 655]], r, 3), makeStroke([[90, 260], [700, 250], [1440, 262]], r, 3),
      makeStroke([[80, 250], [90, 660]], r, 2), makeStroke([[1460, 250], [1466, 660]], r, 2),
      makeStroke([[120, 730], [180, 800], [260, 730]], r, 3),
    ];
    // detalles
    this.details = [
      { kind: 'crown', x: 240, y: 190 }, { kind: 'star', x: 1400, y: 240, s: 30 }, { kind: 'star', x: 120, y: 420, s: 20 }, { kind: 'star', x: 1360, y: 700, s: 24 },
      { kind: 'line', p: makeStroke([[200, 720], [700, 736], [1240, 716]], r, 3), w: 10, c: INK }, { kind: 'line', p: makeStroke([[260, 760], [640, 772], [980, 758]], r, 3), w: 6, c: '#ff4a2b' },
      { kind: 'drip', x: 420, y: 615, h: 92 }, { kind: 'drip', x: 760, y: 640, h: 70 }, { kind: 'drip', x: 1080, y: 630, h: 110 }, { kind: 'drip', x: 1240, y: 640, h: 56 },
      { kind: 'spark', x: 980, y: 210 }, { kind: 'spark', x: 170, y: 620 },
      { kind: 'arrow', p: makeStroke([[1200, 820], [1320, 790], [1400, 850]], r, 3) },
    ];
    // brillos blancos sobre las letras
    this.hi = this.strokes.map(({ st }, i) => { const a = Math.min(.5, .2 + (i % 3) * .1); return makeStroke(st.pl.slice(2, Math.max(4, Math.floor(st.pl.length * .45))).map(([x, y]) => [x - 8, y - 12]), r, 1); });
    this.sign = makeStroke([[1180, 900], [1240, 860], [1290, 920], [1330, 870], [1400, 910]], r, 2);
    this.wob = seed(77);
  }

  _paper() {
    const g = this.g; g.save(); g.scale(this.s, this.s);
    g.fillStyle = CREAM; g.fillRect(0, 0, W, H);
    const r = seed(3); g.fillStyle = 'rgba(120,100,70,.10)'; for (let x = 60; x < W; x += 48) for (let y = 60; y < H; y += 48) g.fillRect(x, y, 3, 3);   // papel punteado
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(90,70,40,${r() * .04})`; g.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2); }
    g.restore(); this.paperData = g.getImageData(0, 0, this.cv.width, this.cv.height);
  }

  /* sub-progreso de una fase [a,b] en g, con n elementos en secuencia (solapados) */
  _phase(g, a, b, n, i) { const span = (b - a) / n, s = a + i * span * .82, e = s + span * 1.18; return Math.min(1, Math.max(0, (g - s) / (e - s))); }

  _stroke(pts, w, color, alpha = 1, off = 0) {
    if (pts.length < 2) return; const c = this.g; c.strokeStyle = color; c.globalAlpha = alpha; c.lineWidth = w; c.beginPath(); c.moveTo(pts[0][0] + off, pts[0][1] + off);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0] + off, pts[i][1] + off); c.stroke();
  }

  set(gp) {
    gp = Math.min(1, Math.max(0, gp));
    if (Math.abs(gp - this.progress) < .0004) return; this.progress = gp;
    const c = this.g; c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.putImageData(this.paperData, 0, 0); c.setTransform(this.s, 0, 0, this.s, 0, 0);
    c.lineCap = 'round'; c.lineJoin = 'round';
    let tip = null, tool = 'pencil', tcol = '#777', active = false;
    const mark = (t, tl, col) => { tip = t; tool = tl; tcol = col; active = true; };
    const N = this.strokes.length;

    // 1) guías a lápiz
    this.guides.forEach((st, i) => { const f = this._phase(gp, 0, .12, this.guides.length, i); if (f <= 0) return; const sp = subPath(st, f); this._stroke(sp.pts, 2.4, '#8b8478', .55); this._stroke(sp.pts, 1.2, '#5d5850', .5, .8); if (f < 1) mark(sp.tip, 'pencil', '#777'); });
    // 2) esqueleto a lápiz
    this.strokes.forEach(({ st }, i) => { const f = this._phase(gp, .10, .32, N, i); if (f <= 0) return; const sp = subPath(st, f); this._stroke(sp.pts, 3, '#6d6860', .6); this._stroke(sp.pts, 1.5, '#3f3b36', .55, 1); if (f < 1 && f > 0) mark(sp.tip, 'pencil', '#777'); });
    // 3) sombra (trazo desplazado)
    this.strokes.forEach(({ st }, i) => { const f = this._phase(gp, .30, .44, N, i); if (f <= 0) return; const sp = subPath(st, f); this._stroke(sp.pts, 76, '#2b2622', .38, 15); if (f < 1 && f > 0) mark({ 0: sp.tip[0] + 15, 1: sp.tip[1] + 15 }, 'marker', '#2b2622'); });
    // 4) contorno negro + interior hueco
    this.strokes.forEach(({ st }, i) => { const f = this._phase(gp, .32, .58, N, i); if (f <= 0) return; const sp = subPath(st, f); this._stroke(sp.pts, 74, INK, 1); this._stroke(sp.pts, 52, CREAM, 1); if (f < 1 && f > 0) mark(sp.tip, 'marker', '#141010'); });
    // 5) relleno de color
    this.strokes.forEach(({ st, color }, i) => { const f = this._phase(gp, .55, .78, N, i); if (f <= 0) return; const sp = subPath(st, f); this._stroke(sp.pts, 50, color, 1); this._stroke(sp.pts, 34, color, .5, -1); if (f < 1 && f > 0) mark(sp.tip, 'marker', color); });
    // 6) brillos blancos
    this.hi.forEach((st, i) => { const f = this._phase(gp, .76, .86, this.hi.length, i); if (f <= 0) return; const sp = subPath(st, f); this._stroke(sp.pts, 8, '#fff7e6', .85); if (f < 1 && f > 0) mark(sp.tip, 'marker', '#fff7e6'); });
    // 7) detalles
    this.details.forEach((d, i) => { const f = this._phase(gp, .84, .96, this.details.length, i); if (f <= 0) return; const t = f;
      if (d.kind === 'line' || d.kind === 'arrow') { const sp = subPath(d.p, t); this._stroke(sp.pts, d.w || 8, d.c || INK, 1); if (t < 1) mark(sp.tip, 'marker', d.c || INK); }
      else if (d.kind === 'star' || d.kind === 'spark') { c.globalAlpha = 1; c.strokeStyle = INK; c.lineWidth = 7; const s = (d.s || 26) * Math.min(1, t * 1.4); c.beginPath(); c.moveTo(d.x - s, d.y); c.lineTo(d.x + s, d.y); c.moveTo(d.x, d.y - s); c.lineTo(d.x, d.y + s); c.moveTo(d.x - s * .55, d.y - s * .55); c.lineTo(d.x + s * .55, d.y + s * .55); c.stroke(); if (t < 1) mark([d.x, d.y], 'marker', INK); }
      else if (d.kind === 'crown') { const p = [[d.x - 60, d.y + 50], [d.x - 60, d.y - 10], [d.x - 25, d.y + 20], [d.x, d.y - 40], [d.x + 25, d.y + 20], [d.x + 60, d.y - 10], [d.x + 60, d.y + 50]]; const st = makeStroke(p, this.wob, 2); const sp = subPath(st, t); this._stroke(sp.pts, 10, INK, 1); if (t > .95) { c.fillStyle = '#f3c15a'; c.globalAlpha = .9; c.beginPath(); c.moveTo(p[0][0], p[0][1]); for (let k = 1; k < p.length; k++) c.lineTo(p[k][0], p[k][1]); c.closePath(); c.fill(); } if (t < 1) mark(sp.tip, 'marker', INK); }
      else if (d.kind === 'drip') { const col = this.letters[i % this.letters.length].color; c.globalAlpha = 1; c.strokeStyle = col; c.lineWidth = 11; const hh = d.h * t; c.beginPath(); c.moveTo(d.x, d.y); c.lineTo(d.x, d.y + hh); c.stroke(); c.fillStyle = col; c.beginPath(); c.arc(d.x, d.y + hh, 8, 0, 7); c.fill(); if (t < 1) mark([d.x, d.y + hh], 'marker', col); }
    });
    // 8) firma
    { const f = Math.min(1, Math.max(0, (gp - .95) / .05)); if (f > 0) { const sp = subPath(this.sign, f); this._stroke(sp.pts, 6, INK, 1); if (f < 1) mark(sp.tip, 'marker', INK); } }
    c.globalAlpha = 1;
    this.tip = tip ? { u: tip[0] / W, v: tip[1] / H, tool, color: tcol, active: true } : { ...this.tip, active: false };
    this.tex.needsUpdate = true;
  }
}
