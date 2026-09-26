/* =========================================================
   SCROLL = TIMELINE
   El scroll nativo no mueve nada visible: sus desplazamientos alimentan un progreso virtual p que mueve la cámara y la línea de tiempo.
   ========================================================= */
export class ScrollTimeline {
  /* El scroll es un MANDO, no una posición: cada píxel desplazado suma a un progreso "virtual" p (1 = 17 000 px ≈ el recorrido de antes).
     El documento no tiene fondo real: al acercarse a un extremo se recoloca en el centro sin que se note, así que nunca "se acaba el scroll"
     (y la historia no necesita terminar sola al llegar al final). */
  constructor(spaceEl) {
    this.el = spaceEl; this.p = 0; this.vel = 0; this.jump = false; this.PX = 17000; this._t = performance.now();
    this.read = this.read.bind(this);
    this._center(); addEventListener('scroll', this.read, { passive: true }); addEventListener('resize', () => { this._y = scrollY; });
  }
  _range() { return Math.max(1, this.el.offsetHeight - innerHeight); }
  _center() { this._skip = true; scrollTo(0, this._range() * .5); this._y = scrollY; }
  read() {
    if (this.frozen) return;                              // web de la pizzería abierta: el documento de la historia está oculto y el navegador lo recoloca; no cuenta como scroll
    const y = scrollY; if (this._skip) { this._skip = false; this._y = y; return; }
    const d = y - this._y; this._y = y; this.p += d / this.PX;
    /* velocidad de scroll (px/s) suavizada, la usa el audio y el motion blur */
    const now = performance.now(), dt = Math.max(.001, (now - this._t) / 1000);
    this.vel = this.vel * .8 + (d / this.PX * this.PX / dt) * .2; this._t = now;
    const R = this._range(); if (y < R * .2 || y > R * .8) this._center();
  }
  /* salta a un p concreto (capítulos, teclas, depuración): la posición virtual pasa a ser p y la historia la sigue (sin saltarse frases) */
  goto(p) {
    this.p = p; this.jump = true; clearTimeout(this._jt); this._jt = setTimeout(() => { this.jump = false; }, 400);
  }
}

/* =========================================================
   RELOJ DE LA HISTORIA
   El scroll del usuario dice "hasta dónde quiere llegar"; la historia avanza hacia ahí, pero dentro de la conversación
   NUNCA corre más rápido que el habla: cada frase se dice entera y no se cambia de imagen hasta que termina (compuerta `gate`, la pone el Director).
   · hacia atrás (sin frase en curso) y fuera de la conversación: sigue al scroll con rapidez
   · hacia delante dentro de la conversación: velocidad = tramo de la frase / (duración + pausa) × 1.15 (sin atajos: nada se salta)
   · saltos explícitos (capítulos): `teleport(p)` coloca la historia directamente
   ========================================================= */
export class StoryClock {
  constructor(timeline) { this.tl = timeline; this.p = 0; this.catching = false; this.gate = null; this.backward = false; this.skim = false; this.rig = null; this.paced = false; this.target = 0; this._u = undefined; }      // paced=true: la historia nunca corre más que el habla (lento, sigue tras parar)
  _beatAt(p) { const b = this.tl.beats; let lo = 0, hi = b.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (b[m].p0 <= p) lo = m; else hi = m - 1; } return b[lo]; }
  teleport(p) { this.p = p; this.target = p; this._u = undefined; this.gate = null; this.backward = false; if (this.rig) this.rig.p = p; }
  /* El scroll del usuario NO es una posición sino un mando: cada movimiento hacia delante empuja la historia (target) esa misma cantidad,
     salvo mientras suena una frase (compuerta): entonces el scroll se descarta, la frase se dice entera y la historia se PARA cuando tú paras
     (no hay "sigue sola hasta alcanzar el scroll"). La ganancia se reajusta para que al llegar al final del documento la historia llegue justo a su final. */
  _drive(pUser, jump) {
    if (this._u === undefined || jump || Math.abs(pUser - this._u) > .3) { this._u = pUser; this.target = Math.min(1, Math.max(0, pUser)); return this.target; }      // salto pedido (capítulo, teclas) o primera lectura: sincroniza
    const d = pUser - this._u; this._u = pUser;
    if (d > 0) { if (!this.gate) this.target += d; }                                      // mientras suena una frase, el scroll hacia delante se descarta
    else if (d < 0) this.target += d;
    this.target = Math.min(1, Math.max(0, this.target));
    return this.target;
  }
  update(dt, pScroll, jump = false) {
    const { P0, OUT0 } = this.tl; dt = Math.min(dt, 1 / 15); this._jumping = jump; const pUser = this._drive(pScroll, jump); const gap = pUser - this.p;
    if (!this.gate) { if (gap < -.003) this.backward = true; else if (gap >= -.0005) this.backward = false; } else this.backward = false;
    if (this.backward || this.p >= OUT0 - 1e-4) { this.p += gap * (1 - Math.exp(-dt * 9)); this.catching = false; }
    else if (this.p < P0 - 1e-4) { this.p += (Math.min(pUser, P0) - this.p) * (1 - Math.exp(-dt * 12)); this.catching = false; }
    else if (gap > 0 && this.paced) { const b = this._beatAt(this.p), pace = (b.p1 - b.p0) / (b.dur + this.tl.GAP) * 2.2; this.p = Math.min(Math.min(pUser, OUT0 + .0005), this.p + pace * dt); this.catching = gap > .004; }
    else {                                                                            // la historia sigue al mando de inmediato y se detiene cuando tú paras…
      const cap = (this._jumping ? .24 : .09) * dt, st = gap * (1 - Math.exp(-dt * 18));      // …pero con velocidad máxima (≈ .05 de recorrido por segundo): nunca salta una frase ni un plano, ni retrocede
      this.p += Math.max(-cap * 2, Math.min(cap, st)); this.catching = gap > .004;
    }
    if (this.gate) { this.p = Math.min(this.gate.max, Math.max(this.gate.min, this.p)); this.target = Math.min(this.target, this.gate.max); }      // compuerta: la frase que suena se dice ENTERA; ni la cámara ni el personaje cambian hasta que termina (y no queda scroll pendiente)
    else if (Math.abs(pUser - this.p) < 1e-5) this.p = pUser;
    return this.p;
  }
}
