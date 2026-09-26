/* =========================================================
   DA MARIO — comportamiento de la web (módulo)
   initPizzeria({ root, assets }) monta todo sobre el DOM de #pizzeria y devuelve { enter, pause, resume, scroller }.
   · Pizzas «hiperrealistas»: fotografía de pizza + mapa de profundidad (Depth-Anything-V2) + normales + rugosidad sobre un plano subdividido
     y desplazado (relieve real), con luz cálida que orbita y entorno de estudio → brillos que barren la salsa y el queso al girar.
   · Sin dependencias de scroll global: usa el propio contenedor .pz-scroller.
   ========================================================= */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => 1 - Math.pow(1 - clamp(t), 3);
const easeIO = (t) => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const eur = (n) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

export const MENU = [
  { id: 'mario', name: 'La Mario', price: 13.5, desc: 'La que abrió el negocio. Pepperoni, aceituna negra, albahaca.' },
  { id: 'margherita', name: 'Margherita', price: 10.5, desc: 'Tomate, fior di latte, albahaca. Nada más.' },
  { id: 'diavola', name: 'Diavola', price: 13, desc: 'Salame picante y guindilla. Pide cerveza antes.' },
  { id: 'funghi', name: 'Funghi', price: 13.5, desc: 'Champiñón, fior di latte, albahaca. Otoño en la boca.' },
  { id: 'formaggi', name: 'Quattro Formaggi', price: 14, desc: 'Cuatro quesos. Cuatro caracteres.' },
];

/* ------------------------------------------------------------------ imágenes */
const imgCache = new Map();
const loadImg = (url) => { if (!imgCache.has(url)) imgCache.set(url, new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = rej; i.src = url; })); return imgCache.get(url); };
const exists = (url) => loadImg(url).then(() => true, () => false);

/* ------------------------------------------------------------------ vista 3D de pizza fotográfica */
const views = new Set(); let raf = 0, last = 0, paused = false;
function loop(t) {
  raf = requestAnimationFrame(loop); const dt = Math.min(.05, (t - last) / 1000 || .016); last = t;
  if (paused) return; for (const v of views) if (v.visible) v.frame(dt, t / 1000);
}

class PhotoPizza {
  constructor(canvas, assets, o = {}) {
    this.canvas = canvas; this.assets = assets; this.o = { fov: 26, cam: [0, 1.9, 1.35], spin: .16, drag: true, exposure: 1.1, scale: 1, disp: .09, lum: 1, side: 1, ...o };
    this.r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.r.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); this.r.toneMapping = THREE.ACESFilmicToneMapping; this.r.toneMappingExposure = this.o.exposure; this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.aniso = this.r.capabilities.getMaxAnisotropy();
    this.scene = new THREE.Scene(); this.cam = new THREE.PerspectiveCamera(this.o.fov, 1, .1, 20);
    const pm = new THREE.PMREMGenerator(this.r); this.scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture; this.scene.environmentIntensity = .55; pm.dispose();
    this.key = new THREE.DirectionalLight(0xffe1bd, 2.4 * this.o.lum); this.key.position.set(1.4, 3, 1.2); this.scene.add(this.key);
    this.orbit = new THREE.PointLight(0xffc48a, 5 * this.o.lum, 5, 1.6); this.scene.add(this.orbit);
    this.rim = new THREE.DirectionalLight(0xff9c5a, 1.1 * this.o.side); this.rim.position.set(-2, 1.4, -2); this.scene.add(this.rim);
    this.scene.add(new THREE.HemisphereLight(0xfff1dc, 0x7a2b18, .45));
    this.root = new THREE.Group(); this.scene.add(this.root); this.disc = new THREE.Group(); this.root.add(this.disc);
    this.yaw = 0; this.vyaw = this.o.spin; this.tx = 0; this.ty = 0; this.tiltX = 0; this.tiltY = 0; this.drag = null; this.visible = false; this.swap = 1; this.kind = null; this.tex = new Map(); this.photo = null; this.body = null;
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement || canvas);
    new IntersectionObserver((e) => { this.visible = e[0].isIntersecting; }, { threshold: 0 }).observe(canvas);
    if (this.o.drag) this.bindDrag();
    views.add(this); this.resize();
  }
  bindDrag() {
    const c = this.canvas; let lx = 0;
    c.addEventListener('pointerdown', (e) => { this.drag = e.pointerId; lx = e.clientX; c.setPointerCapture(e.pointerId); this.vyaw = 0; });
    c.addEventListener('pointermove', (e) => { const r = c.getBoundingClientRect(); this.tx = (e.clientX - r.left) / r.width - .5; this.ty = (e.clientY - r.top) / r.height - .5; if (this.drag === e.pointerId) { const d = e.clientX - lx; lx = e.clientX; this.yaw += d * .011; this.vyaw = d * .011 * 60; } });
    const up = () => { this.drag = null; }; c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up); c.addEventListener('pointerleave', () => { this.tx = 0; this.ty = 0; });
  }
  resize() { const p = this.canvas.parentElement || this.canvas, w = Math.max(2, this.canvas.clientWidth || p.clientWidth), h = Math.max(2, this.canvas.clientHeight || p.clientHeight); this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
  texture(url, srgb) {
    return loadImg(url).then((img) => { const t = new THREE.Texture(img); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = this.aniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true; return t; });
  }
  async build(kind, layer = '') {                            // plano subdividido + relieve real + cuerpo de masa bajo el borde (layer: capa fotográfica opcional, comparte el relieve)
    const key = kind + layer; if (this.tex.has(key)) return this.tex.get(key);
    const u = (s) => `${this.assets}assets/img/pizza_${kind}${s}.png`;
    const p = Promise.all([this.texture(u(layer ? '_' + layer : ''), true), this.texture(u('_d'), false), this.texture(u('_n'), false), this.texture(u('_r'), false)]).then(([map, disp, nor, rou]) => {
      const a = map.image.height / map.image.width, g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ map, displacementMap: disp, displacementScale: this.o.disp, displacementBias: -.012, normalMap: nor, normalScale: new THREE.Vector2(1.15, 1.15), roughnessMap: rou, roughness: 1, metalness: 0, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: .3 * this.o.lum, alphaTest: .5, transparent: true, side: THREE.DoubleSide });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, a, 256, Math.round(256 * a)), mat); plane.rotation.x = -Math.PI / 2; g.add(plane);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(.43, .455, .07, 72), new THREE.MeshStandardMaterial({ color: 0xd49a52, roughness: .88, map })); body.position.y = -.026; g.add(body);
      g.userData = { mat, plane, body }; return g;
    });
    this.tex.set(key, p); return p;
  }
  async setPizza(kind) {
    if (this.kind === kind) return; this.kind = kind; const g = await this.build(kind); if (this.kind !== kind) return;
    if (this.photo) this.disc.remove(this.photo); this.photo = g; this.disc.add(g); this.swap = 0;
  }
  frame(dt, t) {
    if (this.drag === null) this.vyaw = lerp(this.vyaw, this.o.spin, 1 - Math.exp(-dt * 1.4));
    this.yaw += this.vyaw * dt; this.tiltX = lerp(this.tiltX, this.ty * .42, 1 - Math.exp(-dt * 4)); this.tiltY = lerp(this.tiltY, this.tx * .3, 1 - Math.exp(-dt * 4));
    this.swap = Math.min(1, this.swap + dt * 2.1); const s = ease(this.swap);
    this.disc.rotation.y = this.yaw; this.root.rotation.set(this.tiltX * .3, 0, this.tiltY * .2); this.root.scale.setScalar(lerp(.84, 1, s) * this.o.scale); this.root.position.y = (1 - s) * -.12;
    this.orbit.position.set(Math.cos(t * .55) * .9 * this.o.side, .55 + Math.sin(t * .9) * .1, Math.sin(t * .55) * .9 * this.o.side);   // luz que barre la superficie: el relieve y el brillo se "leen" al moverse
    const [x, y, z] = this.o.cam; this.cam.position.set(x, y, z); this.cam.lookAt(0, .02, 0);
    if (this.o.onFrame) this.o.onFrame(this, dt, t);
    this.r.render(this.scene, this.cam);
  }
}

/* ------------------------------------------------------------------ montaje */
export function initPizzeria({ root, assets = './' }) {
  const $ = (s, r = root) => r.querySelector(s), $$ = (s, r = root) => [...r.querySelectorAll(s)];
  const scroller = $('#pzScroller');
  let hornoP = 0, vScroll = 0, lastTop = 0, mouse = { x: 0, y: 0 };
  if (!raf) raf = requestAnimationFrame(loop);

  /* ---------- cartel del hero: encaja "PIZZA" a todo el ancho ---------- */
  const rows = $$('.pz-poster__row'), hero = $('#pzHero');
  function fitPoster() {                                     // cada fila de letras condensadas llena el ancho: se ensancha (×1.5 máx.) y el resto se reparte en el espaciado
    const w = hero.clientWidth * 1.02;
    rows.forEach((r) => { r.style.setProperty('--sx', 1); r.style.setProperty('--ls', '-0.01em'); const rw = r.getBoundingClientRect().width, n = r.textContent.length, k = clamp(w / Math.max(rw, 1), .6, 1.5), left = Math.max(0, w - rw * k), fs = parseFloat(getComputedStyle(r).fontSize) || 300;
      r.style.setProperty('--sx', k.toFixed(3)); r.style.setProperty('--ls', `${(left / n / k / fs).toFixed(3)}em`); });
  }
  document.fonts?.ready.then(fitPoster); addEventListener('resize', fitPoster); fitPoster();

  /* ---------- imágenes de escena (fotos generadas); si aún no existen, se enmarca una pizza recortada ---------- */
  const FALL = ['mario', 'margherita', 'diavola', 'funghi']; let fi = 0;
  $$('img[data-scene]').forEach(async (img) => {
    const n = img.dataset.scene, url = `${assets}assets/img/${n}.webp`;
    if (await exists(url)) { img.src = url; return; }
    const holder = img.parentElement; holder.classList.add('is-missing'); const fb = document.createElement('img'); fb.className = 'pz-fallback'; fb.alt = ''; fb.src = `${assets}assets/img/pizza_${FALL[fi++ % FALL.length]}.png`; holder.appendChild(fb);
  });

  /* ---------- pizza del hero ---------- */
  const heroView = new PhotoPizza($('#pzHeroGL'), assets, { cam: [0, 1.95, 1.3], fov: 27, spin: .2, exposure: .82, lum: .4, side: .25, disp: .1, onFrame: (v) => { const sp = clamp(scroller.scrollTop / Math.max(1, hero.offsetHeight)); v.root.rotation.x += sp * .35; v.root.position.y += sp * -.05; } });
  heroView.setPizza('mario');

  /* ---------- patrón ondulado ---------- */
  const grid = $('#pzWaveGrid'), waveRows = [];
  for (let i = 0; i < 7; i++) { const row = document.createElement('div'); row.className = 'pz-wave__row'; row.innerHTML = '<span>Pizza</span>'.repeat(16); grid.appendChild(row); waveRows.push({ el: row, x: -Math.random() * 300, dir: i % 2 ? 1 : -1, sp: 22 + i * 3 }); }
  const noise = $('#pzWarpNoise'); let waveVisible = false; new IntersectionObserver((e) => { waveVisible = e[0].isIntersecting; }, { threshold: 0 }).observe($('#pzWave'));

  /* ---------- textos que suben por palabras ---------- */
  $$('[data-split]').forEach((el) => {
    const walk = (node, out) => { node.childNodes.forEach((n) => { if (n.nodeType === 3) n.textContent.split(/(\s+)/).forEach((tk) => { if (!tk) return; if (/^\s+$/.test(tk)) out.appendChild(document.createTextNode(' ')); else { const w = document.createElement('span'); w.className = 'w'; const i = document.createElement('i'); i.textContent = tk; w.appendChild(i); out.appendChild(w); } }); else if (n.nodeType === 1) { const c = n.cloneNode(false); walk(n, c); out.appendChild(c); } }); };
    const copy = el.cloneNode(false); walk(el, copy); el.innerHTML = copy.innerHTML; $$('.w > i', el).forEach((w, i) => w.style.setProperty('--i', i));
  });
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { root: scroller, threshold: .25 });
  $$('[data-split]').forEach((el) => io.observe(el));

  /* ---------- el horno: cartel cinético + la pizza se monta con el scroll ---------- */
  const horno = $('#pzHorno'), pin = $('#pzHornoPin'), steps = $$('.pz-step'), bar = $('#pzHornoBar'), word = $('#pzWord'); let hornoStep = -1;
  const WORDS = ['MASA', 'TOMATE', 'QUESO', 'EXTRA', 'FUEGO'];
  const PALETTE = [['#F2E6CD', '#1B1210', '#E2412A'], ['#E2412A', '#1B1210', '#F2E6CD'], ['#1B1210', '#F2E6CD', '#E2412A'], ['#F2E6CD', '#1B1210', '#1B1210'], ['#E2412A', '#1B1210', '#F2E6CD']];   // fondo · texto · palabra gigante
  let parts = null;
  const hornoView = new PhotoPizza($('#pzHornoGL'), assets, { cam: [0, 2.15, 1.5], fov: 26, spin: .3, drag: false, exposure: .9, lum: .6, side: .5, onFrame: (v, dt) => {
    if (!v.photo) return;
    if (!parts) {                                            // capas de la misma foto (masa → salsa → queso → pizza), comparten relieve
      parts = { wrap: new THREE.Group(), L: [] }; v.disc.add(parts.wrap);
      ['dough', 'sauce', 'cheese'].forEach((n, i) => v.build('mario', n).then((g) => { g.userData.mat.depthWrite = false; g.userData.body.visible = i === 0; g.renderOrder = i + 1; parts.wrap.add(g); parts.L[i] = g; }));
      v.photo.userData.mat.depthWrite = false; v.photo.renderOrder = 5;
    }
    const s = hornoP * 5, dd = easeIO(clamp(s / .8)), ds = easeIO(clamp((s - 1) / .8)), dc = easeIO(clamp((s - 2) / .8)), full = easeIO(clamp((s - 3) / .9)), fire = easeIO(clamp((s - 4) / .9));
    const put = (g, t, lift) => { if (!g) return; g.visible = t > .005; g.userData.mat.opacity = t; g.position.y = (1 - t) * lift; };
    put(parts.L[0], dd, .22); put(parts.L[1], ds, .26); put(parts.L[2], dc, .26); put(v.photo, full, .26); v.photo.userData.body.visible = false;
    if (full > .98) parts.L.forEach((g) => { if (g) g.visible = false; });     // al terminar queda una sola pizza (las capas ya están en la foto)
    v.orbit.color.setHex(fire > .01 ? 0xff7a2a : 0xffc48a); v.orbit.intensity = 3 + fire * 3.5; v.key.intensity = 1.45 + fire * .5; v.rim.intensity = .55 + fire * 1; v.r.toneMappingExposure = .9 + fire * .08;   // el fuego calienta el color pero no quema la foto
    v.o.spin = .3 + fire * .5;
  } });
  hornoView.setPizza('mario');

  /* ---------- la carta ---------- */
  const list = $('#pzList'), viewerTag = $('#pzViewerTag'), viewerPrice = $('#pzViewerPrice'); let sel = 0; const rowsCartaEls = []; let menu = MENU;
  const menuView = new PhotoPizza($('#pzMenuGL'), assets, { cam: [0, 1.75, 1.2], fov: 26, spin: .2, exposure: 1.12, disp: .1 });
  function select(i) {
    sel = i; rowsCartaEls.forEach((li, k) => { li.classList.toggle('is-on', k === i); li.querySelector('.pz-row').setAttribute('aria-pressed', k === i); li.querySelector('.pz-add').tabIndex = k === i ? 0 : -1; });
    viewerTag.textContent = menu[i].name; viewerPrice.innerHTML = `${menu[i].price.toLocaleString('es-ES', { minimumFractionDigits: 2 })}<small>€</small>`; menuView.setPizza(menu[i].id);
    viewerPrice.animate([{ transform: 'rotate(10deg) scale(.7)' }, { transform: 'rotate(10deg) scale(1)' }], { duration: 520, easing: 'cubic-bezier(.34,1.56,.64,1)' });
  }
  Promise.all(MENU.map((p) => exists(`${assets}assets/img/pizza_${p.id}.png`))).then((oks) => {
    menu = MENU.filter((_, i) => oks[i]);
    menu.forEach((p, i) => {
      const li = document.createElement('li'); li.innerHTML = `<button class="pz-row" type="button" aria-pressed="false"><span class="pz-row__name">${p.name}</span><span class="pz-row__price">${eur(p.price)}</span><span class="pz-row__desc"><span>${p.desc}</span></span></button><button class="pz-btn pz-btn--solid pz-add" type="button" tabindex="-1">Añadir</button>`;
      const btn = li.querySelector('.pz-row'), add = li.querySelector('.pz-add'), pick = () => select(i);
      btn.addEventListener('mouseenter', pick); btn.addEventListener('focus', pick); btn.addEventListener('click', pick);
      add.addEventListener('click', () => addToCart(p)); add.addEventListener('focus', pick); list.appendChild(li); rowsCartaEls.push(li);
    });
    select(0);
  });

  /* ---------- pedido ---------- */
  const cart = new Map(), cartEl = $('#pzCart'), cartList = $('#pzCartList'), cartEmpty = $('#pzCartEmpty'), cartTotal = $('#pzCartTotal'), cartCount = $('#pzCartCount'), cartBtn = $('#pzCartBtn'), cartOk = $('#pzCartOk');
  function renderCart() {
    let n = 0, total = 0; cartList.innerHTML = '';
    cart.forEach((q, id) => { const p = MENU.find((m) => m.id === id); n += q; total += q * p.price; const li = document.createElement('li'); li.innerHTML = `<b>${p.name}</b><span class="q"><button type="button" aria-label="Quitar una ${p.name}">−</button><span>${q}</span><button type="button" aria-label="Añadir otra ${p.name}">+</button></span><span>${eur(q * p.price)}</span>`; const [m, a] = li.querySelectorAll('button'); m.onclick = () => { if (q > 1) cart.set(id, q - 1); else cart.delete(id); renderCart(); }; a.onclick = () => { cart.set(id, q + 1); renderCart(); }; cartList.appendChild(li); });
    cartCount.textContent = n; cartTotal.textContent = eur(total); cartEmpty.hidden = n > 0; cartOk.hidden = true;
  }
  function addToCart(p) { cart.set(p.id, (cart.get(p.id) || 0) + 1); renderCart(); cartBtn.classList.remove('is-bump'); void cartBtn.offsetWidth; cartBtn.classList.add('is-bump'); }
  const openCart = (o) => { cartEl.hidden = false; requestAnimationFrame(() => cartEl.classList.toggle('is-open', o)); if (!o) setTimeout(() => { if (!cartEl.classList.contains('is-open')) cartEl.hidden = true; }, 650); };
  cartBtn.addEventListener('click', () => openCart(!cartEl.classList.contains('is-open'))); $('#pzCartClose').addEventListener('click', () => openCart(false));
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') openCart(false); });
  $('#pzCartGo').addEventListener('click', () => { if (!cart.size) { cartOk.textContent = 'Añade alguna pizza antes de pedir.'; cartOk.hidden = false; cartOk.style.background = 'var(--tomato-deep)'; return; } cartOk.style.background = ''; cartOk.textContent = `Pedido recibido: ${cartCount.textContent} pizza(s), ${cartTotal.textContent}. Te avisamos en 25 minutos.`; cartOk.hidden = false; cart.clear(); cartList.innerHTML = ''; cartCount.textContent = '0'; cartTotal.textContent = eur(0); cartEmpty.hidden = false; });
  renderCart();

  /* ---------- «vídeo»: la pizza gira junto al fuego (escena viva: relieve real, luz de horno y brasas) ---------- */
  const vbtn = $('#pzVideoBtn'), vbig = $('.pz-video__big'), emb = $('#pzEmbers'), ex = emb.getContext('2d'); let vWant = true, embVisible = false; const sparks = [];
  const fireView = new PhotoPizza($('#pzFireGL'), assets, { cam: [0, 2.0, 1.4], fov: 27, spin: .32, exposure: 1.02, disp: .1, onFrame: (v, dt, t) => {
    v.orbit.color.setHex(0xff7a2a); v.orbit.intensity = 9 + Math.sin(t * 7) * 1.4 + Math.sin(t * 13.1) * .8; v.key.color.setHex(0xff9a4a); v.key.intensity = 1.6; v.rim.color.setHex(0xff5a1c); v.rim.intensity = 3.2;
    v.cam.position.set(Math.sin(t * .18) * .35, 2.0 + Math.sin(t * .23) * .12, 1.4 + Math.cos(t * .18) * .1); v.cam.lookAt(0, .02, 0); if (!vWant) v.vyaw = 0;
  } });
  fireView.setPizza('mario');
  /* brasas desactivadas en «90 segundos» (embVisible se queda en false) */
  vbtn.addEventListener('click', () => { vWant = !vWant; vbtn.textContent = vWant ? 'Pausa' : 'Play'; vbtn.setAttribute('aria-pressed', vWant); if (vWant) fireView.vyaw = fireView.o.spin; });
  function embers(dt) {
    const w = emb.clientWidth, h = emb.clientHeight; if (emb.width !== w || emb.height !== h) { emb.width = w; emb.height = h; }
    ex.clearRect(0, 0, w, h); if (vWant && sparks.length < 90 && Math.random() < dt * 60) sparks.push({ x: w * (.15 + Math.random() * .7), y: h + 10, vx: (Math.random() - .5) * 26, vy: -(40 + Math.random() * 90), r: .8 + Math.random() * 2.4, life: 0, max: 3 + Math.random() * 4, ph: Math.random() * 6.28 });
    ex.globalCompositeOperation = 'lighter';
    for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i]; if (vWant) { s.life += dt; s.x += (s.vx + Math.sin(s.life * 2 + s.ph) * 18) * dt; s.y += s.vy * dt; } if (s.life > s.max || s.y < -20) { sparks.splice(i, 1); continue; }
      const k = 1 - s.life / s.max, g = ex.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 5); g.addColorStop(0, `rgba(255,${170 + k * 60 | 0},80,${.9 * k})`); g.addColorStop(1, 'rgba(255,90,20,0)'); ex.fillStyle = g; ex.beginPath(); ex.arc(s.x, s.y, s.r * 5, 0, 7); ex.fill(); }
  }

  /* ---------- fotos: arrastrar ---------- */
  const track = $('#pzTrack'); let dragging = false, sx = 0, sl = 0;
  track.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') return; dragging = true; sx = e.clientX; sl = track.scrollLeft; track.classList.add('is-drag'); track.setPointerCapture(e.pointerId); });
  track.addEventListener('pointermove', (e) => { if (dragging) track.scrollLeft = sl - (e.clientX - sx); });
  const endDrag = () => { dragging = false; track.classList.remove('is-drag'); }; track.addEventListener('pointerup', endDrag); track.addEventListener('pointercancel', endDrag);
  track.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') track.scrollBy({ left: 320, behavior: 'smooth' }); if (e.key === 'ArrowLeft') track.scrollBy({ left: -320, behavior: 'smooth' }); });

  /* ---------- reserva ---------- */
  const form = $('#pzForm'), err = $('#pzFormErr'), ok = $('#pzFormOk'); const today = new Date(); form.fecha.min = today.toISOString().slice(0, 10); form.fecha.value = new Date(today.getTime() + 864e5 * 2).toISOString().slice(0, 10);
  form.addEventListener('submit', (e) => {
    e.preventDefault(); ok.hidden = true; err.hidden = true; [...form.elements].forEach((f) => f.removeAttribute && f.removeAttribute('aria-invalid'));
    const bad = []; if (form.nombre.value.trim().length < 2) bad.push([form.nombre, 'Dinos tu nombre para apuntar la mesa.']);
    if (!form.fecha.value || form.fecha.value < form.fecha.min) bad.push([form.fecha, 'Elige una fecha a partir de hoy.']);
    if (!/^[\d\s+()-]{9,}$/.test(form.tel.value.trim())) bad.push([form.tel, 'Necesitamos un teléfono válido para confirmarte.']);
    if (bad.length) { bad.forEach(([f]) => f.setAttribute('aria-invalid', 'true')); err.textContent = bad[0][1]; err.hidden = false; bad[0][0].focus(); return; }
    const d = new Date(form.fecha.value + 'T12:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    ok.textContent = `Mesa para ${form.personas.value} el ${d} a las ${form.hora.value}, a nombre de ${form.nombre.value.trim()}. Te escribimos para confirmar.`; ok.hidden = false;
  });

  /* ---------- abierto / cerrado (horario en Madrid) ---------- */
  function openNow() {
    const p = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()), g = (t) => p.find((x) => x.type === t).value;
    const day = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].indexOf(g('weekday').replace('.', '').toLowerCase().slice(0, 3)), m = +g('hour') * 60 + +g('minute');
    const T = (a, b) => [a[0] * 60 + a[1], b[0] * 60 + b[1]], mid = day === 4 || day === 5 ? [T([13, 0], [16, 30]), T([20, 0], [24, 30])] : day === 6 ? [T([13, 0], [17, 0]), T([20, 0], [23, 0])] : [T([13, 0], [16, 0]), T([20, 0], [23, 30])];
    const yest = (day === 5 || day === 6) && m < 30; return day !== 0 && (mid.some(([a, b]) => m >= a && m < b) || yest);
  }
  const openEl = $('#pzOpen'), isOpen = openNow(); openEl.classList.toggle('is-closed', !isOpen); openEl.querySelector('b').textContent = isOpen ? 'Abierto ahora' : 'Cerrado ahora';

  /* ---------- anclas dentro del contenedor ---------- */
  $$('a[href^="#pz"]').forEach((a) => a.addEventListener('click', (e) => { const t = $(a.getAttribute('href')); if (!t) return; e.preventDefault(); scroller.scrollTo({ top: t.offsetTop - (t.id === 'pzHero' ? 0 : 6), behavior: reduced ? 'auto' : 'smooth' }); }));

  /* ---------- cursor, imanes e inclinación ---------- */
  const cur = $('#pzCursor'); let cx = 0, cy = 0, px = -100, py = -100;
  root.addEventListener('pointermove', (e) => { if (e.pointerType === 'touch') return; px = e.clientX; py = e.clientY; cur.classList.add('is-on'); mouse.x = e.clientX / innerWidth - .5; mouse.y = e.clientY / innerHeight - .5;
    const t = e.target.closest('[data-cursor]'), b = e.target.closest('a,button'); cur.classList.toggle('is-big', !!t); cur.firstElementChild.textContent = t ? t.dataset.cursor : ''; cur.style.setProperty('--c', b && !t ? 'var(--ink)' : 'var(--tomato)'); });
  root.addEventListener('pointerleave', () => cur.classList.remove('is-on'));
  const mags = $$('[data-magnet]');
  root.addEventListener('pointermove', (e) => { mags.forEach((m) => { const r = m.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), d = Math.hypot(dx, dy), R = Math.max(r.width, 90); m.style.transform = d < R ? `translate(${dx * .22}px, ${dy * .3}px)` : ''; }); });
  $$('[data-tilt]').forEach((f) => { f.addEventListener('pointermove', (e) => { const r = f.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; const rr = getComputedStyle(f).getPropertyValue('--r').trim() || '-1deg'; f.style.transform = `perspective(900px) rotate(${rr}) rotateX(${-y * 6}deg) rotateY(${x * 8}deg)`; }); f.addEventListener('pointerleave', () => { f.style.transform = ''; }); });

  /* ---------- bucle de scroll: parallax, marquesinas, cartel del horno ---------- */
  const heroView3D = $('.pz-hero__view'), fat = $('.pz-hero__fat'), abuelaBig = $('.pz-abuela__big'), abuela = $('#pzAbuela'), storyCard = $('.pz-story__card'), vbigWrap = $('#pzVideo'); let tt = 0;
  function setStep(idx) {
    hornoStep = idx; steps.forEach((s, i) => s.classList.toggle('is-on', i === idx)); const [bg, fg, wd] = PALETTE[idx]; pin.style.setProperty('--bg', bg); pin.style.setProperty('--fg', fg); pin.style.setProperty('--word', wd);
    word.textContent = WORDS[idx]; if (!reduced) word.animate([{ clipPath: 'inset(100% 0 0 0)', transform: 'translateY(-46%)' }, { clipPath: 'inset(0 0 0 0)', transform: 'translateY(-58%)' }], { duration: 800, easing: 'cubic-bezier(.16,1,.3,1)' });
  }
  function tick(now) {
    requestAnimationFrame(tick); const dt = Math.min(.05, (now - (tick.l || now)) / 1000); tick.l = now; tt += dt;
    const top = scroller.scrollTop; vScroll = lerp(vScroll, top - lastTop, 1 - Math.exp(-dt * 10)); lastTop = top;
    cx = lerp(cx, px, 1 - Math.exp(-dt * 16)); cy = lerp(cy, py, 1 - Math.exp(-dt * 16)); cur.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
    const H = scroller.clientHeight;
    if (top < hero.offsetHeight * 1.2) {                     // hero: cartel, pizza, «Da Mario» y sello a distinta velocidad
      const hp = clamp(top / Math.max(1, hero.offsetHeight));
      rows[0]?.style.setProperty('--ax', (-mouse.x * 26 - top * .05).toFixed(1) + 'px');
      heroView3D.style.setProperty('--my', (-hp * 90 + mouse.y * -14).toFixed(1) + 'px'); heroView3D.style.setProperty('--mx', (mouse.x * 18).toFixed(1) + 'px');
      fat.style.translate = `${(mouse.x * -22).toFixed(1)}px ${(-hp * 160).toFixed(1)}px`;
    }
    if (waveVisible) { const w = grid.scrollWidth / 2 || 1; waveRows.forEach((r) => { r.x += r.dir * (r.sp + Math.abs(vScroll) * 14) * dt; if (r.x > 0) r.x -= w * .5; if (r.x < -w * .5) r.x += w * .5; r.el.style.transform = `translate3d(${r.x}px,0,0)`; }); if (!reduced && ((tt * 20) | 0) !== tick.n) { tick.n = (tt * 20) | 0; noise.setAttribute('baseFrequency', `${(.006 + Math.sin(tt * .35) * .0016).toFixed(5)} ${(.014 + Math.sin(tt * .5 + 1) * .004).toFixed(5)}`); } }
    const ar = abuela.getBoundingClientRect(); if (ar.bottom > 0 && ar.top < H) { const p = (H - ar.top) / (H + ar.height); abuelaBig.style.transform = `translate3d(${((p - .5) * -7).toFixed(2)}vw,0,0)`; }
    const sr = storyCard.getBoundingClientRect(); if (sr.bottom > 0 && sr.top < H) storyCard.style.translate = `0 ${(((sr.top + sr.height / 2) / H - .5) * -50).toFixed(1)}px`;
    const hr = horno.getBoundingClientRect(), scr = scroller.getBoundingClientRect(), p = clamp((scr.top - hr.top) / Math.max(1, hr.height - scr.height)); hornoP = lerp(hornoP, p, 1 - Math.exp(-dt * 9));
    const idx = clamp(Math.floor(p * 5), 0, 4); if (idx !== hornoStep) setStep(idx); bar.style.width = (p * 100).toFixed(1) + '%';
    const vr = vbigWrap.getBoundingClientRect(); if (embVisible) embers(dt); if (vr.bottom > 0 && vr.top < H) vbig.style.transform = `translate3d(${((vr.top / H) * -6).toFixed(2)}vw, ${(vr.top * -.12).toFixed(1)}px, 0)`;
  }
  requestAnimationFrame(tick); setStep(0);

  /* ---------- entrada del cartel ---------- */
  function enter() {
    if (reduced) return; scroller.scrollTop = 0; const E = 'cubic-bezier(.16,1,.3,1)';
    rows.forEach((r, i) => r.animate([{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)' }], { duration: 1200, delay: 100 + i * 160, easing: E, fill: 'backwards' }));
    heroView3D.animate([{ opacity: 0, scale: '.4', rotate: '-40deg' }, { opacity: 1, scale: '1', rotate: '0deg' }], { duration: 1500, delay: 420, easing: E, fill: 'backwards' });
    fat.animate([{ opacity: 0, scale: '.6' }, { opacity: 1, scale: '1' }], { duration: 1000, delay: 900, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'backwards' });
    $$('.pz-hero__copy > *, .pz-nav').forEach((el, i) => el.animate([{ opacity: 0, translate: '0 24px' }, { opacity: 1, translate: '0 0' }], { duration: 900, delay: 700 + i * 120, easing: E, fill: 'backwards' }));
  }
  return { enter, pause() { paused = true; }, resume() { paused = false; heroView.resize(); hornoView.resize(); menuView.resize(); fireView.resize(); fitPoster(); }, scroller };
}
