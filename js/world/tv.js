/* =========================================================
   TELEVISIÓN — videojuego ficticio "NEON RUN" (sin copyright)
   Un runner abstracto dibujado en canvas 2D: horizonte de rejilla, sprites de
   rectángulos, HUD. Su color medio alimenta la luz que cae sobre el jugador.
   Eventos: 'hit' (te matan), 'coin', 'win'. El jugador reacciona a ellos.
   ========================================================= */
import * as THREE from 'three';

export class TVScreen {
  constructor(q) {
    this.W = q.name === 'low' ? 320 : 512; this.H = Math.round(this.W * .5625);
    this.cv = document.createElement('canvas'); this.cv.width = this.W; this.cv.height = this.H; this.g = this.cv.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 4;
    this.mat = new THREE.MeshPhysicalMaterial({ color: 0x030303, emissive: 0xffffff, emissiveMap: this.tex, emissiveIntensity: .95, roughness: .12, metalness: 0, clearcoat: 1, clearcoatRoughness: .08 });
    this.color = new THREE.Color(1, .4, .66); this.lum = .6;
    this.t = 0; this.acc = 0; this.hero = { y: 0, vy: 0 }; this.obst = [{ x: 1.2, w: .07, h: .12 }]; this.coins = [];
    this.score = 4820; this.lives = 3; this.flash = 0; this.hit = 0; this.event = null; this.nextEvt = 7 + Math.random() * 5; this.speed = .5;
    this.stars = Array.from({ length: 30 }, () => [Math.random(), Math.random() * .5, Math.random()]);
  }

  _spawn() { const last = this.obst[this.obst.length - 1]; if (!last || last.x < .75) this.obst.push({ x: 1.1 + Math.random() * .5, w: .05 + Math.random() * .05, h: .08 + Math.random() * .1 }); if (Math.random() < .03) this.coins.push({ x: 1.1, y: .12 + Math.random() * .18 }); }

  update(dt, t) {
    this.t = t; this.flash = Math.max(0, this.flash - dt * 3.2); this.hit = Math.max(0, this.hit - dt * 2.4);
    this.nextEvt -= dt; this.event = null;
    if (this.nextEvt <= 0) { this.nextEvt = 10 + Math.random() * 9; if (Math.random() < .68) { this.event = 'hit'; this.flash = 1; this.hit = 1; this.lives = Math.max(1, this.lives - 1); if (this.lives === 1 && Math.random() < .5) this.lives = 3; } else { this.event = 'win'; this.flash = .6; this.score += 500; } }
    this.acc += dt; if (this.acc < 1 / 30) return; const d = this.acc; this.acc = 0;
    const g = this.g, W = this.W, H = this.H, hz = H * .58;
    // simulación
    this.speed = .5 + Math.sin(t * .2) * .06;
    for (const o of this.obst) o.x -= this.speed * d;
    for (const c of this.coins) c.x -= this.speed * d;
    this.obst = this.obst.filter(o => o.x > -.2); this.coins = this.coins.filter(c => c.x > -.1); this._spawn();
    const h = this.hero; const next = this.obst.find(o => o.x > .16 && o.x < .3);
    if (next && h.y === 0 && next.x < .27) h.vy = 1.5;
    h.vy -= 4.6 * d; h.y = Math.max(0, h.y + h.vy * d); if (h.y === 0) h.vy = 0;
    this.score += Math.floor(d * 120);
    // fondo: degradado de atardecer neón
    const gr = g.createLinearGradient(0, 0, 0, hz); gr.addColorStop(0, '#ff9ccb'); gr.addColorStop(.55, '#ff6fa8'); gr.addColorStop(1, '#ffa35c');
    g.fillStyle = gr; g.fillRect(0, 0, W, hz);
    // sol
    g.fillStyle = '#ffd08a'; g.beginPath(); g.arc(W * .72, hz - 6, H * .2, Math.PI, 0); g.fill();
    g.fillStyle = '#c2306f'; for (let i = 0; i < 5; i++) g.fillRect(W * .72 - H * .2, hz - 6 - i * 6 - 3, H * .4, 2 + i * .6);
    // estrellas
    g.fillStyle = 'rgba(255,240,220,.8)'; for (const s of this.stars) g.fillRect(((s[0] - t * .004 * (.3 + s[2])) % 1 + 1) % 1 * W, s[1] * hz * .8, 1.5, 1.5);
    // skyline paralaje
    for (let L = 0; L < 2; L++) { g.fillStyle = L ? '#b02a78' : '#d23c8e'; const sp = (L ? .45 : .25) * this.t * W * .35; for (let i = 0; i < 14; i++) { const bx = (((i * 61 + L * 30) * 1.7 - sp) % (W + 80) + W + 80) % (W + 80) - 40, bh = 20 + ((i * 37 + L * 11) % 40) * (L ? 1.2 : .8); g.fillRect(bx, hz - bh, 34, bh); } }
    // suelo con rejilla en perspectiva
    g.fillStyle = '#6a1650'; g.fillRect(0, hz, W, H - hz);
    g.strokeStyle = '#ff5fa8'; g.lineWidth = 1; g.beginPath();
    for (let i = -8; i <= 8; i++) { g.moveTo(W / 2 + i * 4, hz); g.lineTo(W / 2 + i * 70, H); }
    const off = (this.t * this.speed * 2) % 1; for (let i = 0; i < 9; i++) { const p = Math.pow((i + off) / 9, 2.2); const y = hz + p * (H - hz); g.moveTo(0, y); g.lineTo(W, y); }
    g.stroke();
    // héroe (pixel art de rectángulos): cuerpo naranja, visor crema
    const base = H * .82, hx = W * .22, hy = base - h.y * H * .5;
    g.fillStyle = '#ff7a2b'; g.fillRect(hx, hy - 26, 18, 22); g.fillStyle = '#ffe6bf'; g.fillRect(hx + 10, hy - 22, 8, 6);
    g.fillStyle = '#ff2f6a'; g.fillRect(hx - 4, hy - 16, 5, 9); g.fillStyle = '#1b0630'; const step = Math.floor(t * 12) % 2; g.fillRect(hx + 2 + step * 4, hy - 4, 5, 4); g.fillRect(hx + 11 - step * 4, hy - 4, 5, 4);
    // obstáculos
    for (const o of this.obst) { const ox = o.x * W, oh = o.h * H; g.fillStyle = '#3ff2c0'; g.fillRect(ox, base - oh, o.w * W, oh); g.fillStyle = '#e8fff8'; g.fillRect(ox, base - oh, o.w * W, 3); }
    for (const c of this.coins) { g.fillStyle = '#ffe36b'; g.beginPath(); g.arc(c.x * W, base - c.y * H - 20, 5, 0, 7); g.fill(); }
    // HUD
    g.fillStyle = '#fff2dc'; g.font = `700 ${Math.round(H * .075)}px 'DM Mono',monospace`; g.textBaseline = 'top'; g.textAlign = 'left';
    g.fillText('SCORE ' + String(this.score).padStart(6, '0'), 12, 10);
    g.textAlign = 'right'; g.fillText('x' + this.lives, W - 12, 10);
    g.fillStyle = 'rgba(255,240,220,.25)'; g.fillRect(12, 34, 90, 6); g.fillStyle = '#3ff2c0'; g.fillRect(12, 34, 90 * (this.lives / 3) * (.6 + .4 * Math.sin(t)), 6);
    // impacto / victoria
    if (this.hit > 0) { g.fillStyle = `rgba(255,30,60,${this.hit * .55})`; g.fillRect(0, 0, W, H); g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = `800 ${Math.round(H * .16)}px 'Bricolage Grotesque',sans-serif`; g.fillText('¡ARGH!', W / 2, H * .38); }
    else if (this.flash > 0) { g.fillStyle = `rgba(255,230,140,${this.flash * .35})`; g.fillRect(0, 0, W, H); }
    // scanlines sutiles
    g.fillStyle = 'rgba(0,0,0,.12)'; for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
    this.tex.needsUpdate = true;
    // color medio → luz (mezcla cálida/rosa según hit/flash)
    const k = Math.min(1, this.hit);
    this.color.setRGB(1, .42 - k * .25 + this.flash * .1, .62 - k * .4);
    this.lum = .55 + .2 * Math.sin(t * 3) * .5 + this.flash * .6 + k * .3;
  }
}
