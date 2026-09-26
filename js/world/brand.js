/* =========================================================
   BRAND — identidad de Da Mario (y del fanzine "4B") dibujada en canvas para los objetos del mundo 3D:
   cartel de la fachada, póster luminoso del ascensor, flyer de la carta, fanzine y tarjetas de la mesa de centro.
   Mismas fuentes y paleta que la web de la pizzería (pizzeria/DESIGN.md). Las fuentes se declaran en css/style.css y se esperan en `brandFonts()`.
   ========================================================= */
import * as THREE from 'three';

export const BRAND = { tomato: '#E2412A', tomatoD: '#B9301E', cream: '#F2E6CD', ink: '#1B1210', basil: '#2E6B3B', mustard: '#F2BF2E' };
const A = "BrandAnton, Impact, 'Arial Narrow', sans-serif", S = "BrandScript, 'Brush Script MT', cursive", SER = "Georgia, 'Times New Roman', serif";

export async function brandFonts() { try { await Promise.all([document.fonts.load('120px BrandAnton'), document.fonts.load('120px BrandScript')]); } catch (e) { /* sin fuentes: se usa la alternativa */ } }

function tex(w, h, draw, aniso = 8) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; return t; }
function damero(g, x, y, w, h, cell, c1, c2) { g.fillStyle = c2; g.fillRect(x, y, w, h); g.fillStyle = c1; for (let j = 0; j * cell < h; j++) for (let i = 0; i * cell < w; i++) if ((i + j) % 2 === 0) g.fillRect(x + i * cell, y + j * cell, Math.min(cell, w - i * cell), Math.min(cell, h - j * cell)); }
function grain(g, w, h, n = 500, a = .12) { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? '0,0,0' : '255,255,255'},${Math.random() * a})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3); } }
function tracked(g, text, cx, y, gap) { let w = 0; for (const ch of text) w += g.measureText(ch).width + gap; w -= gap; let x = cx - w / 2; const al = g.textAlign; g.textAlign = 'left'; for (const ch of text) { g.fillText(ch, x, y); x += g.measureText(ch).width + gap; } g.textAlign = al; }

/* logotipo «Da MARIO» centrado con ancho total wd (medido con las fuentes reales) */
export function logo(g, cx, cy, wd, col = BRAND.cream, accent = col) {
  g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.font = `300px ${S}`; const wDa = g.measureText('Da').width; g.font = `300px ${A}`; const wM = g.measureText('MARIO').width;
  const k = wd / (wDa + 18 + wM), fs = 300 * k, gap = fs * .06, x0 = cx - (wDa * k + gap + wM * k) / 2, y0 = cy + fs * .36;
  g.font = `${fs}px ${S}`; g.fillStyle = accent; g.fillText('Da', x0, y0 - fs * .03); g.font = `${fs}px ${A}`; g.fillStyle = col; g.fillText('MARIO', x0 + wDa * k + gap, y0);
}
export function pizzaIcon(g, cx, cy, r) {
  g.save(); g.translate(cx, cy); g.fillStyle = '#E2AC60'; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill(); g.fillStyle = BRAND.tomato; g.beginPath(); g.arc(0, 0, r * .8, 0, 7); g.fill();
  const rr = (i) => { const s = Math.sin(i * 12.9898) * 43758.5453; return s - Math.floor(s); };
  for (let i = 0; i < 9; i++) { const a = rr(i) * 6.28, d = rr(i + 9) * r * .55, q = r * (.10 + rr(i + 20) * .07); g.fillStyle = '#FAF0D6'; g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, q, 0, 7); g.fill(); }
  g.fillStyle = BRAND.basil; for (let k = 0; k < 4; k++) { const a = k * 1.57 + .6; g.save(); g.translate(Math.cos(a) * r * .5, Math.sin(a) * r * .5); g.rotate(a); g.beginPath(); g.ellipse(0, 0, r * .15, r * .07, 0, 0, 7); g.fill(); g.restore(); }
  g.restore();
}

/* rótulo de la fachada (fascia): tomate + crema, damero fino, algo sucio de tantos años */
export function signTex() {
  return tex(2048, 320, (g, W, H) => {
    g.fillStyle = BRAND.tomatoD; g.fillRect(0, 0, W, H);
    damero(g, 0, 0, W, 26, 13, BRAND.cream, BRAND.tomatoD); damero(g, 0, H - 26, W, 26, 13, BRAND.cream, BRAND.tomatoD);
    g.strokeStyle = BRAND.cream; g.lineWidth = 5; g.strokeRect(34, 44, W - 68, H - 88);
    logo(g, W * .43, H * .49, W * .40, BRAND.cream, BRAND.mustard);
    g.font = `52px ${A}`; g.fillStyle = BRAND.cream; g.textAlign = 'center'; tracked(g, 'PIZZERÍA · HORNO DE LEÑA', W * .43, H * .84, 10);
    pizzaIcon(g, W * .80, H * .5, H * .30); g.textAlign = 'center'; g.font = `44px ${A}`; g.fillStyle = BRAND.cream; tracked(g, 'DESDE 1987', W * .92, H * .5, 8);
    grain(g, W, H, 900, .18); for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(20,8,4,${Math.random() * .16})`; g.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 4, 4 + Math.random() * 60); }   // mugre y regueros
  });
}

/* póster de calle / de ascensor (2:3): «MASA LENTA. NOCHE LARGA.» */
export function posterTex(w = 768, h = 1152) {
  return tex(w, h, (g, W, H) => {
    g.fillStyle = BRAND.tomato; g.fillRect(0, 0, W, H); damero(g, 0, 0, W, W / 14, W / 28, BRAND.cream, BRAND.tomato); damero(g, 0, H - W / 14, W, W / 14, W / 28, BRAND.cream, BRAND.tomato);
    g.fillStyle = BRAND.cream; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.font = `${W * .30}px ${A}`; g.fillText('MASA', W / 2, H * .30); g.fillText('LENTA.', W / 2, H * .30 + W * .30);
    pizzaIcon(g, W / 2, H * .60, W * .27); g.fillStyle = BRAND.ink; g.font = `${W * .16}px ${A}`; g.fillText('NOCHE LARGA.', W / 2, H * .86 - W * .01);
    logo(g, W / 2, H * .93 - W * .01, W * .40, BRAND.cream, BRAND.mustard); grain(g, W, H, 700, .08);
  });
}

/* flyer de la carta (papel crema) — el que alguien se dejó en la mesa */
export function flyerTex() {
  return tex(640, 900, (g, W, H) => {
    g.fillStyle = BRAND.cream; g.fillRect(0, 0, W, H); damero(g, 0, 0, W, 34, 17, BRAND.tomato, BRAND.cream); damero(g, 0, H - 34, W, 34, 17, BRAND.tomato, BRAND.cream);
    g.textAlign = 'center'; g.fillStyle = BRAND.tomato; g.font = `120px ${A}`; g.fillText('LA CARTA', W / 2, 150);
    const items = [['MARIO', '12,50'], ['MARGHERITA', '10,00'], ['DIAVOLA', '13,00'], ['FUNGHI', '13,50'], ['FORMAGGI', '13,50']]; g.textAlign = 'left';
    items.forEach(([n, p], i) => { const y = 250 + i * 110; g.fillStyle = BRAND.ink; g.font = `48px ${A}`; g.fillText(n, 46, y); g.textAlign = 'right'; g.fillStyle = BRAND.tomato; g.fillText(p + ' €', W - 46, y); g.textAlign = 'left'; g.fillStyle = 'rgba(27,18,16,.4)'; for (let x = 46; x < W - 46; x += 12) g.fillRect(x, y + 22, 4, 3); });
    g.textAlign = 'center'; g.fillStyle = BRAND.ink; g.font = `34px ${A}`; tracked(g, 'MASA LENTA. NOCHE LARGA.', W / 2, H - 70, 5); grain(g, W, H, 600, .10);
  });
}

/* fanzine «4B» (portada) */
export function zineTex(variant = 0) {
  const pal = [[BRAND.ink, BRAND.tomato, BRAND.cream], [BRAND.basil, BRAND.cream, BRAND.mustard]][variant % 2];
  return tex(560, 760, (g, W, H) => {
    g.fillStyle = pal[0]; g.fillRect(0, 0, W, H); g.textAlign = 'center'; g.fillStyle = pal[1]; g.font = `430px ${A}`; g.fillText('4B', W / 2, H * .56);
    g.fillStyle = pal[2]; g.font = `40px ${A}`; tracked(g, 'UN SALÓN · CUATRO MUNDOS', W / 2, H * .70, 6); g.fillRect(50, 60, W - 100, 8); g.font = `54px ${A}`; g.textAlign = 'left'; g.fillText(`Nº ${variant + 1}`, 50, 130);
    g.textAlign = 'right'; g.font = `44px ${SER}`; g.fillText('otoño', W - 50, 130); grain(g, W, H, 500, .10);
  });
}

/* tarjeta de visita (anverso tomate / reverso crema) */
export function cardTex(front = true) {
  return tex(700, 400, (g, W, H) => {
    if (front) { g.fillStyle = BRAND.tomato; g.fillRect(0, 0, W, H); damero(g, 0, 0, W, 18, 9, BRAND.cream, BRAND.tomato); damero(g, 0, H - 18, W, 18, 9, BRAND.cream, BRAND.tomato); logo(g, W / 2, H * .46, W * .62, BRAND.cream, BRAND.cream); g.fillStyle = BRAND.cream; g.font = `30px ${A}`; g.textAlign = 'center'; tracked(g, 'MASA LENTA. NOCHE LARGA.', W / 2, H * .82, 4); }
    else { g.fillStyle = BRAND.cream; g.fillRect(0, 0, W, H); logo(g, W * .40, H * .18, W * .42, BRAND.ink, BRAND.tomatoD); g.fillStyle = BRAND.ink; g.textAlign = 'left'; g.font = `34px ${A}`; ['Calle de Cuba 38 · Ruzafa', '46006 València', '96 374 19 87'].forEach((t, i) => g.fillText(t, 40, 190 + i * 56)); pizzaIcon(g, W - 100, H - 100, 62); }
    grain(g, W, H, 250, .08);
  });
}
