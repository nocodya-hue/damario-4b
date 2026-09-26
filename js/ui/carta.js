/* =========================================================
   CARTA — del ascensor a la web de la pizzería
   Al terminar la última frase del ascensor ("…que alguien saque el teléfono y vea la carta") sale un móvil con el botón «Ver carta».
   Alguien lo pulsa (el dedo lo hace solo a los pocos segundos, o lo pulsas tú) y BAJAMOS a la sección de abajo: la escena 3D sube
   y sale por arriba mientras la web de Da Mario entra desde abajo. Después la escena se pausa y la web se scrollea con normalidad.
   La web vive en pizzeria/ (index.html es la versión suelta; aquí se inyecta el <main id="pizzeria"> y se inicia el módulo).
   Es una sola web continua: con el móvil a la vista, seguir bajando (rueda, gesto táctil o teclas) entra en la web; y en lo más alto de la web,
   seguir subiendo VUELVE al ascensor (la escena 3D baja de nuevo y se reanuda), desde donde se puede seguir subiendo por la historia.
   ========================================================= */
export class CartaFlow {
  constructor({ renderer, tl }) {
    this.renderer = renderer; this.tl = tl; this.shown = false; this.done = false; this.loading = null; this.pz = null;
    this.el = document.getElementById('carta'); this.btn = document.getElementById('cartaBtn'); this.finger = document.getElementById('cartaFinger'); this.mount = document.getElementById('pzMount');
    this.btn?.addEventListener('click', () => this.press());
    this.busy = false; this.loop = null; this.scroll = null; this.clock = null; this.fwd = 0; this.back = 0; this.lastScroll = 0; this.lastIntent = 0; this.lastWheel = 0; this.gTop = false; this.touchY = null;
    addEventListener('wheel', (e) => this.intent(e.deltaY), { passive: true });
    addEventListener('touchstart', (e) => { this.touchY = e.touches[0].clientY; }, { passive: true });
    addEventListener('touchmove', (e) => { if (this.touchY == null) return; const y = e.touches[0].clientY; this.intent(this.touchY - y); this.touchY = y; }, { passive: true });
    addEventListener('touchend', () => { this.touchY = null; this.fwd = 0; this.back = 0; }, { passive: true });
    addEventListener('keydown', (e) => { if (e.target && /input|textarea|select/i.test(e.target.tagName)) return; const k = e.key; if (k === 'ArrowDown' || k === 'PageDown' || k === ' ') this.intent(160); else if (k === 'ArrowUp' || k === 'PageUp') this.intent(-160); });
    window.__carta = this;                                                             // depuración: __carta.show() / __carta.enter()
  }
  /* main.js entrega el bucle de dibujo y el scroll para poder reanudar la escena al volver */
  bind({ loop, scroll, clock }) { this.loop = loop; this.scroll = scroll; this.clock = clock; }
  /* se llama cada fotograma con el progreso de la historia */
  update(p, gate, elevActive) {
    if (!this.loading && p > this.tl.EL0 - .012) this.preload();
    if (!this.shown && elevActive && !gate && p >= this.tl.cartaP - .002) this.show();
    else if (this.shown && !this.done && !this.pressing && !this.busy && p < this.tl.cartaP - .02) this.hide();      // si retrocedes en la historia, el móvil se guarda
  }
  /* intención de scroll: dy > 0 = bajar. Con el móvil a la vista, bajar entra en la web; en lo alto de la web, subir vuelve al ascensor */
  intent(dy) {
    if (this.busy || !dy) return; const now = performance.now();
    if (!this.done) {                                                                  // historia 3D
      if (!this.shown || this.pressing) return;
      if (dy > 0) { if (now - this.lastIntent > 700) this.fwd = 0; this.lastIntent = now; this.fwd += dy; if (this.fwd > 150) { this.fwd = 0; this.press(); } } else this.fwd = 0;
      return;
    }
    const sc = this.pz?.scroller; if (!sc || !this.mount.classList.contains('is-live')) return;   // web de la pizzería
    if (now - this.lastWheel > 220) this.gTop = sc.scrollTop <= 1 && now - this.lastScroll > 260;   // gesto nuevo: solo vale si EMPIEZA en lo alto (la inercia de una subida que acaba de llegar arriba no cuenta)
    this.lastWheel = now;
    if (!this.gTop || sc.scrollTop > 1) { this.back = 0; return; }
    if (dy < 0) { if (now - this.lastIntent > 700) this.back = 0; this.lastIntent = now; this.back += -dy; if (this.back > 150) { this.back = 0; this.exit(); } } else this.back = 0;
  }
  hide() {
    this.shown = false; clearTimeout(this.timer); this.el.classList.remove('is-in', 'is-press');
    setTimeout(() => { if (!this.shown) this.el.hidden = true; }, 700);
  }
  preload() {
    if (this.loading) return this.loading;
    return this.loading = (async () => {
      const html = await (await fetch('pizzeria/index.html')).text(), doc = new DOMParser().parseFromString(html, 'text/html'), main = doc.getElementById('pizzeria');
      this.mount.innerHTML = main.outerHTML.replace(/(src|href)="assets\//g, '$1="pizzeria/assets/');
      if (!document.querySelector('link[data-pz]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'pizzeria/pizzeria.css'; l.dataset.pz = '1'; document.head.appendChild(l); await new Promise((r) => { l.onload = r; l.onerror = r; }); }
      const mod = await import('../../pizzeria/pizzeria.js'); this.pz = mod.initPizzeria({ root: this.mount.querySelector('#pizzeria'), assets: 'pizzeria/' }); this.pz.pause();
    })().catch((e) => { console.error('[carta] no se pudo cargar la web', e); this.loading = null; });
  }
  show() {
    this.shown = true; this.el.hidden = false; this.pressing = false; requestAnimationFrame(() => requestAnimationFrame(() => this.el.classList.add('is-in')));
    this.timer = setTimeout(() => this.autoTap(), 3400);                               // si nadie lo pulsa, el dedo lo hace
  }
  autoTap() {
    if (this.done || this.pressing) return; const r = this.btn.getBoundingClientRect(), f = this.finger, g = window.gsap;
    if (!g) return this.press(); g.set(f, { left: r.left + r.width * .62, top: r.top + r.height + 90, opacity: 0, scale: 1 });
    g.timeline({ onComplete: () => this.press() }).to(f, { opacity: 1, duration: .25 }).to(f, { top: r.top + r.height * .5, duration: .7, ease: 'power3.out' }).to(f, { scale: .78, duration: .12 }).to(f, { scale: 1, opacity: 0, duration: .25 });
  }
  /* atajo desde la barra del edificio: entra directamente en la sección indicada de la web (sin esperar al ascensor ni al móvil) */
  goto(id) {
    if (this.done || this.busy || this.pressing) return Promise.resolve(); this.target = id; this.pressing = true; clearTimeout(this.timer);
    return this.enter();
  }
  press() {
    if (this.pressing || this.done) return; this.pressing = true; clearTimeout(this.timer); this.el.classList.add('is-press');
    setTimeout(() => this.enter(), 380);
  }
  async enter() {
    if (this.done) return; this.done = true; this.busy = true; if (this.scroll) this.scroll.frozen = true; await this.preload(); if (!this.pz) { this.done = false; this.pressing = false; this.busy = false; this.target = null; if (this.scroll) this.scroll.frozen = false; return; }
    const sc0 = this.pz.scroller; const tEl = this.target && this.mount.querySelector('#' + this.target); if (sc0) { sc0.scrollTop = tEl && this.target !== 'pzHero' ? Math.max(0, tEl.offsetTop - 6) : 0; if (!sc0.dataset.cartaHook) { sc0.dataset.cartaHook = '1'; sc0.addEventListener('scroll', () => { this.lastScroll = performance.now(); }, { passive: true }); } }
    const g = window.gsap, gl = document.getElementById('gl'), ui = document.getElementById('ui'), mount = this.mount; mount.classList.add('is-live'); mount.setAttribute('aria-hidden', 'false');
    const finish = () => { this.renderer.setAnimationLoop(null); document.body.classList.add('in-pizzeria'); if (g) g.set([gl, ui, this.el], { clearProps: 'all' }); mount.style.transform = 'none'; this.pz.resume(); const goId = this.target; if (!goId) this.pz.enter(); this.target = null; this.busy = false;
      if (goId && goId !== 'pzHero') {                                                   // al reanudar se recalculan alturas (horno pegajoso): se reaplica el destino hasta que el diseño se estabiliza
        const sc = this.pz.scroller, at = () => { const t = this.mount.querySelector('#' + goId); if (t) sc.scrollTop = Math.max(0, t.offsetTop - 6); };
        at(); requestAnimationFrame(at); setTimeout(at, 120); setTimeout(at, 450); setTimeout(at, 1000);
      } this.lastScroll = performance.now(); mount.querySelector('#pzScroller')?.focus?.({ preventScroll: true }); };
    if (!g) { mount.style.transform = 'none'; return finish(); }
    g.timeline({ onComplete: finish, defaults: { duration: 1.7, ease: 'expo.inOut' } })
      .to([gl, ui, this.el], { yPercent: -100 }, 0).fromTo(mount, { yPercent: 102 }, { yPercent: 0 }, 0);
  }
  /* vuelta: la web baja y la escena 3D del ascensor reaparece por arriba; se reanuda el dibujo y la historia sigue donde estaba */
  async exit() {
    if (!this.done || this.busy) return; this.busy = true;
    const g = window.gsap, gl = document.getElementById('gl'), ui = document.getElementById('ui'), mount = this.mount;
    this.pz.pause(); document.body.classList.remove('in-pizzeria');
    if (this.loop) { this.clock?.getDelta?.(); this.renderer.setAnimationLoop(this.loop); }
    if (this.scroll) { void document.body.offsetHeight; this.scroll._center(); this.scroll.frozen = false; }   // el documento volvió: se recoloca en el centro sin mover el progreso p
    const done = () => { if (g) g.set([gl, ui, this.el], { clearProps: 'all' }); mount.classList.remove('is-live'); mount.setAttribute('aria-hidden', 'true'); mount.style.transform = ''; this.el.classList.remove('is-press'); this.done = false; this.pressing = false; this.busy = false; this.fwd = 0; this.back = 0; this.lastIntent = 0; };
    if (!g) return done();
    g.set([gl, ui, this.el], { yPercent: -100 }); g.set(mount, { yPercent: 0 });
    g.timeline({ onComplete: done, defaults: { duration: 1.5, ease: 'expo.inOut' } }).to([gl, ui, this.el], { yPercent: 0 }, 0).to(mount, { yPercent: 102 }, 0);
  }
}
