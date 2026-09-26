/* =========================================================
   BRANDNAV — barra de Da Mario sobre el edificio: atajo directo a la web de la pizzería desde el primer plano.
   Cada enlace salta a su sección (El horno, La carta, Mesa 7, Visítanos); «Abierto ahora» sigue el horario del local (Madrid).
   La web se precarga al acercarse a la barra (ratón, foco o toque) para que el salto sea inmediato.
   ========================================================= */
export class BrandNav {
  constructor({ carta }) {
    this.carta = carta; this.el = document.getElementById('bnav'); if (!this.el) return;
    this.el.querySelectorAll('[data-go]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); this.go(a.dataset.go); }));
    const warm = () => this.carta.preload(); ['pointerenter', 'focusin', 'touchstart'].forEach((t) => this.el.addEventListener(t, warm, { once: true, passive: true }));
    this.tick(); setInterval(() => this.tick(), 60000);
    const loader = document.getElementById('loader'), show = () => this.el.classList.add('is-in');
    if (!loader || loader.classList.contains('is-done')) setTimeout(show, 600);
    else new MutationObserver((m, o) => { if (loader.classList.contains('is-done')) { o.disconnect(); setTimeout(show, 900); } }).observe(loader, { attributes: true, attributeFilter: ['class'] });
  }
  async go(id) { this.el.classList.add('is-loading'); try { await this.carta.goto(id); } finally { this.el.classList.remove('is-loading'); } }
  /* horario del local (mismo que la web): abierto ahora / cerrado ahora */
  open() {
    const p = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()), g = (t) => p.find((x) => x.type === t).value;
    const day = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].indexOf(g('weekday').replace('.', '').toLowerCase().slice(0, 3)), m = +g('hour') * 60 + +g('minute');
    const T = (a, b) => [a[0] * 60 + a[1], b[0] * 60 + b[1]], mid = day === 4 || day === 5 ? [T([13, 0], [16, 30]), T([20, 0], [24, 30])] : day === 6 ? [T([13, 0], [17, 0]), T([20, 0], [23, 0])] : [T([13, 0], [16, 0]), T([20, 0], [23, 30])];
    const yest = (day === 5 || day === 6) && m < 30; return day !== 0 && (mid.some(([a, b]) => m >= a && m < b) || yest);
  }
  tick() { const o = document.getElementById('bnavOpen'); if (!o) return; const on = this.open(); o.classList.toggle('is-closed', !on); o.querySelector('b').textContent = on ? 'Abierto ahora' : 'Cerrado ahora'; }
}
