/* =========================================================
   HUD — capítulos, título, progreso, botón de sonido y transición a la siguiente sección
   ========================================================= */
import { CHAPTERS, TIMELINE } from '../story/script.js';

const $ = (s) => document.querySelector(s);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class HUD {
  constructor({ audio, scroll }) {
    this.ch = -1; this.audio = audio; this.scroll = scroll;
    this.title = $('#title'); this.card = $('#card'); this.hint = $('#hint'); this.prog = $('#progress'); this.line = $('#chLine'); this.list = [...document.querySelectorAll('#chapters li')];
    this.cardNum = $('#cardNum'); this.cardT = $('#cardT'); this.cardD = $('#cardD'); this.gl = $('#gl'); this.ui = $('#ui');
    const btn = $('#soundBtn'), label = btn.querySelector('span');
    // El sonido está SIEMPRE activado al empezar. Los navegadores solo dejan sonar tras un gesto (clic, tecla, toque, rueda): se intenta ya
    // y, si lo bloquean, arranca solo (música de fondo + ambiente) en la primera interacción. Únicamente lo apaga el botón.
    this.wantSound = true; btn.setAttribute('aria-pressed', 'true'); label.textContent = 'Sonido on';
    const running = () => audio.ctx && audio.ctx.state === 'running' && audio.music && !audio.music.paused;
    const start = async () => { if (!this.wantSound || running()) return; try { await audio.enable(); } catch {} if (running()) { btn.classList.remove('is-hint'); off(); } };
    const evs = ['pointerdown', 'keydown', 'touchend', 'wheel', 'click'], off = () => evs.forEach(e => removeEventListener(e, gesture));
    const gesture = (ev) => { if (btn.contains(ev.target)) return; start(); };
    evs.forEach(e => addEventListener(e, gesture, { passive: true }));
    btn.classList.add('is-hint'); start();
    btn.addEventListener('click', async () => {
      if (this.wantSound) { this.wantSound = false; audio.disable(); btn.setAttribute('aria-pressed', 'false'); label.textContent = 'Sonido off'; btn.classList.remove('is-hint'); off(); }
      else { this.wantSound = true; btn.setAttribute('aria-pressed', 'true'); label.textContent = 'Sonido on'; await audio.enable(); }
    });
    // capítulos clicables (saltan al inicio del capítulo) y atajos: Enter / N = siguiente frase, Retroceso / B = anterior
    this.list.forEach((li, i) => { li.style.cursor = 'pointer'; li.addEventListener('click', () => scroll.goto(Math.min(.999, CHAPTERS[i].a + .002), true)); });      // no se salta ninguna frase: la historia recorre en orden hasta llegar
    addEventListener('keydown', (e) => { if (e.target && /input|textarea/i.test(e.target.tagName)) return; const k = e.key; if (k !== 'Enter' && k !== 'n' && k !== 'N' && k !== 'b' && k !== 'B' && k !== 'Backspace') return;
      const beats = TIMELINE.beats, p = window.__clock ? window.__clock.p : scroll.p, eps = .002; let tgt; if (k === 'Enter' || k === 'n' || k === 'N') { tgt = p < TIMELINE.P0 ? TIMELINE.P0 + eps : (beats.find(b => b.p0 > p + eps)?.p0 ?? 1) + eps; } else { const prev = [...beats].reverse().find(b => b.p0 < p - .012); tgt = prev ? prev.p0 + eps : 0; }
      e.preventDefault(); scroll.goto(Math.min(1, tgt), true); });
    // los navegadores no permiten sonar sin un gesto: al primer clic/tecla/toque se activa el sonido (música de fondo + ambiente) salvo que el usuario lo apague
    this._userOff = false; btn.addEventListener('click', () => { this._userOff = btn.getAttribute('aria-pressed') !== 'true'; });
    const first = async (e) => { if (btn.contains(e.target) || this._userOff || btn.getAttribute('aria-pressed') === 'true') return; try { await audio.enable(); btn.classList.remove('is-hint'); btn.setAttribute('aria-pressed', 'true'); btn.querySelector('span').textContent = 'Sonido on'; } catch {} };
    for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, first, { once: true, passive: true });
    $('#replay')?.addEventListener('click', (e) => { e.preventDefault(); scrollTo({ top: 0, behavior: 'smooth' }); });
    // (la sección de abajo ya no es una página que se scrollea: es la web de la pizzería, a la que se baja desde js/ui/carta.js)
  }

  update(p) {
    // capítulo actual
    let ch = 0; for (const c of CHAPTERS) if (p >= c.a) ch = c.id;
    if (ch !== this.ch) {
      this.ch = ch; const c = CHAPTERS[ch];
      this.list.forEach((li, i) => li.classList.toggle('is-on', i === ch));
      this.card.classList.remove('is-on');
      setTimeout(() => { this.cardNum.textContent = c.n + ' / 0' + CHAPTERS.length; this.cardT.textContent = c.t; this.cardD.textContent = c.d; this.card.classList.add('is-on'); }, 260);
      const li = this.list[ch]; if (li) this.line.style.height = (li.offsetTop + li.offsetHeight / 2) + 'px';
    }
    this.title.style.opacity = String(1 - sstep(.0, .05, p)); this.hint.style.opacity = String(1 - sstep(.0, .025, p));
    this.prog.style.width = (p * 100).toFixed(2) + '%';
  }
}
