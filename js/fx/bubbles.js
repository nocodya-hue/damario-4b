/* =========================================================
   BOCADILLOS — diseño editorial integrado en la escena (DOM proyectado a 3D)
   Secuencia de cada frase:
     1. aparece un punto (color del personaje)  →  2. se expande en tarjeta
     →  3. aparece el texto  →  4. se mantiene unos segundos  →  5. sale hacia arriba
   Animación: fade + desplazamiento vertical + pequeño scale-in (solo transform/opacity).
   ========================================================= */
import * as THREE from 'three';

const _v = new THREE.Vector3();
let _ctx;
function textWidth(text) {
  _ctx = _ctx || document.createElement('canvas').getContext('2d');
  _ctx.font = "500 15.5px 'Bricolage Grotesque', Helvetica, Arial, sans-serif";
  return _ctx.measureText(text).width;
}

export class Bubbles {
  constructor(root) { this.root = root; this.items = []; }

  show(actor, text, dur = 2.6, now = performance.now() / 1000) {
    // solo un bocadillo por personaje a la vez
    for (const b of this.items) if (b.actor === actor && b.state !== 'out') this._out(b, now);
    const el = document.createElement('div'); el.className = 'bub';
    el.style.setProperty('--c', actor.color);
    el.innerHTML = `<div class="bub__in"><div class="bub__card"><div class="bub__txt"><span class="bub__who">${actor.name}</span><span class="bub__msg"></span></div></div><i class="bub__tail"></i></div>`;
    el.querySelector('.bub__msg').textContent = text;
    const maxW = Math.min(innerWidth * .8, 380), tw = textWidth(text), wrap = tw + 34 > maxW, w = Math.min(maxW, tw + 34), lines = wrap ? Math.ceil(tw / (maxW - 34)) : 1;
    el.style.setProperty('--w', Math.ceil(w) + 'px'); el.style.setProperty('--h', (36 + lines * 19) + 'px');
    if (wrap) el.querySelector('.bub__msg').style.whiteSpace = 'normal';
    this.root.appendChild(el);
    const b = { el, actor, text, w, h: 36 + lines * 19, t0: now, dur, state: 'dot', x: -999, y: -999, right: false };
    requestAnimationFrame(() => el.classList.add('is-dot'));
    this.items.push(b); return b;
  }

  _out(b, now) { if (b.state === 'out') return; b.state = 'out'; b.tOut = now; b.el.classList.remove('is-open'); b.el.classList.add('is-out'); }

  update(now, camera, W, H) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const b = this.items[i], age = now - b.t0;
      if (b.state === 'dot' && age > .38) { b.state = 'open'; b.el.classList.remove('is-dot'); b.el.classList.add('is-open'); }
      if (b.state === 'open' && age > .38 + .5 + b.dur) this._out(b, now);
      if (b.state === 'out' && now - b.tOut > .7) { b.el.remove(); this.items.splice(i, 1); continue; }
      // proyección de la cabeza del personaje a pantalla
      _v.copy(b.actor.anchorHead).project(camera);
      const behind = _v.z > 1 || _v.z < -1, sx = (_v.x * .5 + .5) * W, sy = (-_v.y * .5 + .5) * H;
      const onScreen = !behind && sx > -40 && sx < W + 40 && sy > -20 && sy < H + 20;
      b.right = sx > W * .58;
      const half = 16, left = b.right ? sx - b.w + half : sx - half;
      const x = Math.min(W - b.w - 10, Math.max(10, left)), y = Math.min(H - 20, Math.max(b.h + 24, sy - 14));
      b.x += (x - b.x) * (b.x < -900 ? 1 : .35); b.y += (y - b.y) * (b.y < -900 ? 1 : .35);
      b.el.style.transform = `translate3d(${b.x.toFixed(1)}px,${(b.y - b.h - 12).toFixed(1)}px,0)`;
      b.el.classList.toggle('is-right', b.right);
      b.el.style.visibility = onScreen ? 'visible' : 'hidden';
    }
  }
  clear() { for (const b of this.items) b.el.remove(); this.items.length = 0; }
}
