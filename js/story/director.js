/* =========================================================
   DIRECTOR — orquesta la historia a partir del scroll
   - Cada frase ocupa un tramo del scroll (script.js). Mientras p está dentro del tramo, el personaje habla:
     boca sincronizada con el texto, gesto de la mano libre, emoción, cabeceo. Al salir del tramo se corta.
   - Los demás lo miran (o no: el jugador mira la tele), reaccionan (asentir, negar, reír).
   - Subtítulos y voz (si el sonido está activo) van ligados al mismo tramo.
   ========================================================= */
import * as THREE from 'three';
import { TIMELINE } from './script.js';

export class Director {
  constructor({ actors, subs, audio, clock, rig }) {
    this.actors = actors; this.subs = subs; this.audio = audio; this.clock = clock; this.rig = rig; this.gate = null;
    this.lines = TIMELINE.lines; this.on = null; this.pend = []; this.active = null;
  }

  update(t, p) {
    const cur = (this.clock?.backward ? null : this.lines.find(l => p >= l.p0 && p < l.p1)) || null;
    // la compuerta se abre cuando la voz ha terminado de verdad (o pasado un margen de seguridad)
    if (this.gate && ((t >= this.gate.end && !this.audio?.speaking) || t >= this.gate.hard)) { this.gate = null; if (this.clock) this.clock.gate = null; }
    if (cur !== this.on) { if (this.on) this._stop(this.on, t); this.on = cur; if (cur) this._start(cur, t); }
    this.subs?.update(t);
    if (this.active && !this.active.faded && t > this.active.end + 1.4) { this.active.faded = true; this.subs?.hide(); }      // el subtítulo se apaga poco después de terminar la frase
    // reacciones programadas dentro de la frase actual
    if (cur) for (const r of this.pend) if (!r.done && t >= r.at) { r.done = true; const A = this.actors[r.who]; if (r.type === 'laugh') { A.laughAt(1.6 + Math.random() * .8); A.cueHandlers?.laugh?.(t); } else A.react(r.type); }
  }

  _target(A, spec) {
    if (!spec) return null; if (spec === 'down') return A.chestW.clone().add(new THREE.Vector3(0, -2.2, 0));
    const B = this.actors[spec]; return B ? B.eyeW.clone() : null;
  }

  _start(l, t) {
    if (!l.silent && this.clock) { const end = t + .2 + l.dur * .93 + .1; this.gate = { end, hard: end + 5 }; this.clock.gate = { min: l.p0, max: (l.hold ?? l.p1) - 1e-4 }; }
    this.pend = (l.react || []).map(r => ({ ...r, at: t + r.u * l.dur, done: false }));
    if (l.silent) return;
    const A = this.actors[l.who], B = l.to ? this.actors[l.to] : null;
    A.speak(l.text, l.dur, { delay: .2, gest: l.gest || (A.gestSide ? 'talk' : 'none'), target: this._target(A, l.target), mood: l.mood, energy: l.energy, head: l.head });
    A.cueHandlers?.[l.cue]?.(t);
    this.subs?.show(A, l.text, l.dur, .2, t);
    this.audio?.speech(l.who, l.text, l.dur);
    // atención: el que habla mira a su interlocutor; los demás miran al que habla (el jugador solo a ratos: está en su partida)
    const glance = l.dur + .5;
    // el que habla mira a su interlocutor (o, si habla a todos, a uno de los demás): nunca a su móvil ni a la libreta
    const others = Object.keys(this.actors).filter(k => k !== l.who), tgt = B || this.actors[others[Math.floor(Math.random() * others.length)]];
    A.attn = { p: tgt.eyeW.clone(), until: t + l.dur + .3, o: { w: 6 } };
    for (const [k, C] of Object.entries(this.actors)) {
      if (k === l.who) continue;
      if (k === 'gamer' && Math.random() < .55 && l.to !== 'gamer') continue;
      C.attn = { p: A.eyeW.clone(), until: t + glance, o: { w: 5 } };
    }
    // asentimiento de escucha ("mm-hm") a mitad de frase en las largas
    if (l.dur > 2.4) { const lk = l.to || Object.keys(this.actors).filter(k => k !== l.who)[Math.floor(Math.random() * 3)]; if (lk !== 'gamer' || Math.random() < .5) this.pend.push({ who: lk, type: 'nod', at: t + l.dur * (.42 + Math.random() * .2), done: false }); }
    this.active = { line: l, end: t + l.dur };
  }

  _stop(l, t) {
    if (l.silent) return; if (this.gate && this.clock) { this.gate = null; this.clock.gate = null; } const A = this.actors[l.who]; A.stopSpeak(); this.subs?.hide(); this.audio?.stopSpeech();
    // traspaso de turno: quien acaba mira a quien habla después
    const nx = this.lines[this.lines.indexOf(l) + 1]; if (nx && !nx.silent && nx.who !== l.who) A.attn = { p: this.actors[nx.who].eyeW.clone(), until: t + 1.1, o: { w: 6 } };
    this.active = null;
  }
}

/* Subtítulos: bloque inferior con el nombre en el color del personaje; las palabras se iluminan al ritmo del habla (karaoke) */
export class Subtitles {
  constructor(root) { this.root = root; this.name = root.querySelector('.sub__who'); this.txt = root.querySelector('.sub__txt'); this.st = null; }
  show(actor, text, dur = 3, delay = .3, t = 0) {
    this.root.style.setProperty('--c', actor.color); this.name.textContent = actor.name; this.txt.textContent = '';
    const words = text.split(/\s+/).filter(Boolean), tot = words.reduce((a, w) => a + w.length + 1, 0); let acc = 0;
    this.spans = words.map((w) => { const sp = document.createElement('span'); sp.className = 'w'; sp.textContent = w; this.txt.append(sp, ' '); const t0 = acc / tot; acc += w.length + 1; return { sp, f: t0 }; });
    this.st = { t0: t + delay, dur: dur * .93 };
    this.root.classList.remove('is-on'); void this.root.offsetWidth; this.root.classList.add('is-on');
  }
  update(t) { const s = this.st; if (!s || !this.spans) return; const f = Math.min(1.001, Math.max(0, (t - s.t0) / s.dur)); for (const { sp, f: w } of this.spans) sp.classList.toggle('on', f >= w); }
  hide() { this.root.classList.remove('is-on'); this.st = null; }
}
