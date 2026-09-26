/* =========================================================
   GUION — capítulos, cámara y diálogos
   Todo lo "editorial" vive aquí. La historia es una conversación que avanza con el scroll:
     · Fuera del edificio → el scroll acerca la cámara, cruza la ventana y entra al salón.
     · Dentro: cada frase es un "beat". Mientras el scroll está dentro del tramo de una frase, el personaje habla
       (boca sincronizada, gestos, emoción) y la cámara corta entre primeros planos, detalles y planos generales.
     · Al final la cámara sale por la ventana y baja a la pizzería que hay bajo el piso.
   Para cambiar una frase, un plano o el ritmo se toca este archivo y nada más.
   ========================================================= */

import { E } from '../world/elevator.js';

/* ---- atajos de plano (ver shots.js) ---- */
const F = (who, o = {}) => ({ k: 'face', who, d: [.84, .68], fov: [33, 30], az: [0, 0], ...o });                       // primer plano de cara
const M = (who, o = {}) => ({ k: 'mouth', who, d: [.58, .48], fov: [23, 21], ly: -.028, az: [0, 0], ...o });            // boca + ojos
const O = (who, from, o = {}) => ({ k: 'ots', who, from, fov: [34, 31], back: [.2, .3], ...o });                        // sobre el hombro
const T = (a, b, o = {}) => ({ k: 'two', a, b, d: 2.4, fov: 44, dy: .18, ...o });                                        // plano de dos
const I = (what, who, o = {}) => ({ k: 'ins', what, who, d: .5, fov: 36, dy: .3, az: [22, 28], ...o });                 // detalle (mando, móvil, cigarro, boli)
const W = (pos, look, o = {}) => ({ k: 'fix', pos, look, fov: 62, ap: .2, ...o });                                        // plano general fijo
const WIDE_W = W([-2.75, 1.78, .35], [-.5, 1.0, -2.0], { pos1: [-2.55, 1.74, .15], look1: [-.4, 1.0, -2.0] });
const WIDE_E = W([3.5, 1.9, -3.6], [-.9, 1.0, -1.2], { fov: 58, pos1: [3.3, 1.85, -3.3] });

/* ---- la conversación ---- */
const line = (who, to, text, o = {}) => ({ who, to, text, ...o });
export const BEATS = [
  // ── 02 EL CONCIERTO ──
  { ch: 1, line: line('phone', null, 'Chicos, ¿vísteis anoche el concierto de Mucho Muchacho?', { cue: 'show', gest: 'open', mood: { smile: .6, browUp: .5 }, energy: 1.15 }),
    shots: [[1, F('phone', { az: [-16, -8] })], [.75, M('phone')], [.85, F('gamer', { az: [15, 9], d: [.9, .8] })]] },
  { ch: 1, line: line('gamer', 'phone', '¿El de ayer? Ni de coña, yo estaba con la ronda.', { head: 'shake', mood: { browUp: .25 } }),
    shots: [[1.1, F('gamer', { az: [12, 6] })], [.7, I('pad', 'gamer', { pov: true, fov: [34, 26], roll: 90 })], [.8, F('phone', { az: [-10, -15], d: [.9, .8] })]] },
  { ch: 1, line: line('phone', 'gamer', '¡Pero si lo echaron en directo! Fue una locura, tía.', { gest: 'chop', head: 'nod', mood: { smile: .8, browUp: .4 }, energy: 1.3 }),
    shots: [[.8, M('phone', { az: [10, 4] })], [1, O('phone', 'gamer')], [.9, F('smoker', { az: [-14, -10] })]] },
  { ch: 1, line: line('smoker', null, 'Yo tampoco lo vi.', { head: 'shake', mood: { browUp: .3 } }),
    shots: [[1, F('smoker', { az: [18, 12] })], [.5, F('artist', { az: [-12, -8] })]], react: [{ who: 'artist', type: 'nod', u: .5 }] },
  { ch: 1, line: line('smoker', null, 'Pero si queréis ver algo bueno, hay que ir a Pacha Ibiza a ver la sesión.', { gest: 'up', mood: { smile: .45, browUp: .5 }, energy: 1.1 }),
    shots: [[1.2, F('smoker', { az: [-20, -12] })], [.7, M('smoker')], [.8, I('cig', 'smoker', { az: [-25, -30] })], [.7, O('smoker', 'phone')]] },
  { ch: 1, line: line('artist', 'smoker', '¿Otra vez con Ibiza? Siempre dices lo mismo, Malik.', { gest: 'dismiss', head: 'shake', mood: { smile: .35, browUp: .3 } }),
    shots: [[1.1, F('artist', { az: [-14, -8] })], [.7, M('artist')], [.8, F('smoker', { az: [14, 18], d: [.9, .8] })]] },
  { ch: 1, line: line('smoker', 'artist', '¡Es que la sesión de este verano es de otro planeta!', { gest: 'open', mood: { smile: .75, browUp: .6 }, energy: 1.35 }),
    shots: [[.7, M('smoker', { az: [-8, -14] })], [1, F('smoker', { az: [10, 16], d: [.85, .7] })], [.8, F('phone', { az: [-12, -6] })]], react: [{ who: 'phone', type: 'laugh', u: .75 }] },
  // ── 03 EL NIVEL FINAL ──
  { ch: 2, line: line('gamer', null, 'Vale, pero antes tengo que pasarme el último nivel.', { head: 'nod', mood: { browUp: .3 } }),
    shots: [[1, F('gamer', { az: [-14, -8] })], [.8, I('pad', 'gamer', { pov: true, fov: [34, 26], roll: 90 })]] },
  { ch: 2, line: line('phone', 'gamer', 'Llevas tres días en ese nivel, Yeray.', { gest: 'point', target: 'gamer', head: 'tilt', mood: { smile: .5, browUp: .3 } }),
    shots: [[1, F('phone', { az: [-12, -18] })], [.7, T('phone', 'gamer', { d: 2.6, fov: 46, flip: true })], [.7, F('gamer', { az: [16, 10], d: [.85, .75] })]] },
  { ch: 2, line: line('gamer', 'phone', '¡Es que el jefe final es imposible! Se cura, te persigue… ¡y encima hace trampas!', { head: 'shake', mood: { browAngry: .35, browUp: .5, frown: .15 }, energy: 1.45 }),
    shots: [[1, F('gamer', { az: [10, 4], d: [.75, .62], fov: [30, 27] })], [.7, M('gamer', { az: [-10, -4] })], [.8, I('pad', 'gamer', { pov: true, fov: [34, 26], roll: 90 })], [1, F('gamer', { az: [-18, -10], d: [.8, .66] })]] },
  { ch: 2, line: line('smoker', 'gamer', 'Yo tengo el récord de ese juego, ¿eh?', { gest: 'point', target: 'gamer', mood: { smile: .6, browUp: .4 } }),
    shots: [[1, F('smoker', { az: [14, 8] })], [.7, F('gamer', { az: [-14, -8], d: [.85, .8] })]] },
  { ch: 2, line: line('gamer', 'smoker', 'Tú tienes el récord de morir en el tutorial.', { mood: { smile: .5, browUp: .3 }, energy: 1.2 }),
    shots: [[1, F('gamer', { az: [12, 7] })], [.7, F('phone', { az: [-14, -10], d: [.8, .7] })], [.6, F('artist', { az: [-10, -6], d: [.8, .7] })]],
    react: [{ who: 'phone', type: 'laugh', u: .7 }, { who: 'artist', type: 'laugh', u: .8 }, { who: 'smoker', type: 'laugh', u: .95 }] },
  { ch: 2, pause: 1.1, shots: [[1, F('phone', { az: [-8, -14], d: [.75, .65] })], [1, F('smoker', { az: [-12, -6], d: [.85, .7] })], [1, WIDE_W]], react: [{ who: 'phone', type: 'laugh', u: .1 }, { who: 'smoker', type: 'laugh', u: .1 }, { who: 'artist', type: 'laugh', u: .1 }] },
  // ── 04 LA NEVERA ──
  { ch: 3, line: line('artist', null, 'Chicos… ¿alguien ha mirado la nevera?', { gest: 'open', mood: { browUp: .5, smile: .2 } }),
    shots: [[1, F('artist', { az: [14, 8] })], [.7, M('artist', { az: [8, 14] })]] },
  { ch: 3, line: line('phone', 'artist', 'Yo sí. Hay medio limón y una salsa picante caducada.', { head: 'shake', mood: { frown: .35, smile: .25 }, energy: 1.05 }),
    shots: [[1, F('phone', { az: [-10, -16] })], [.8, M('phone', { az: [-14, -8] })], [.7, F('artist', { az: [-10, -14], d: [.85, .75] })]] },
  { ch: 3, line: line('smoker', null, 'Pues habrá que salir a comprar comida.', { gest: 'up', head: 'nod', mood: { browUp: .45 } }),
    shots: [[1, F('smoker', { az: [-16, -8] })], [.7, M('smoker', { az: [10, 4] })]] },
  { ch: 3, line: line('gamer', null, 'Yo no salgo. Que me lo traigan.', { head: 'shake', mood: { smile: .3 } }),
    shots: [[1, F('gamer', { az: [10, 14] })], [.7, I('pad', 'gamer', { pov: true, fov: [34, 26], roll: 90 })]] },
  { ch: 3, line: line('artist', 'gamer', 'Nadie te lo va a traer, listo.', { gest: 'point', target: 'gamer', mood: { smile: .55, browUp: .3 }, energy: 1.15 }),
    shots: [[1, F('artist', { az: [-12, -6] })], [.7, F('gamer', { az: [14, 8], d: [.85, .8] })]], react: [{ who: 'phone', type: 'laugh', u: .6 }] },
  // ── 05 LA PIZZERÍA ──
  { ch: 4, line: line('smoker', null, 'Chicos, ¿salimos a comer?', { gest: 'up', head: 'nod', mood: { smile: .55, browUp: .6 }, energy: 1.2 }),
    shots: [[1, F('smoker', { az: [12, 6], d: [.9, .72] })], [.7, M('smoker', { az: [-6, -12] })], [.9, WIDE_E]] },
  { ch: 4, line: line('phone', null, 'Sí, abajo hay un restaurante de pizza de locos.', { gest: 'point', target: 'down', head: 'nod', mood: { smile: 1, browUp: .7 }, energy: 1.4 }),
    shots: [[.8, M('phone', { az: [-8, -2] })], [.9, F('phone', { az: [10, 16], d: [.8, .68] })], [.9, WIDE_W]], react: [{ who: 'artist', type: 'nod', u: .5 }, { who: 'smoker', type: 'laugh', u: .8 }] },
  { ch: 4, line: line('gamer', null, 'Ok, vamos.', { head: 'nod', mood: { smile: .8, browUp: .6 }, energy: 1.3 }),
    shots: [[1, F('gamer', { az: [-10, -4] })], [.8, WIDE_E]], react: [{ who: 'phone', type: 'laugh', u: .4 }, { who: 'artist', type: 'laugh', u: .5 }, { who: 'smoker', type: 'laugh', u: .6 }] },
];

/* ---- ASCENSOR: cámara fija dentro de la cabina, desde el lado de las puertas (ven a los personajes de frente, que miran hacia ellas) ---- */
const ELEV_DOORS = { k: 'fix', pos: E(.82, 1.72, -.74), look: E(-.05, 1.45, .3), pos1: E(.72, 1.7, -.72), look1: E(-.05, 1.45, .4), fov: 62, ap: 0 };
const EF = (pos, look, pos1, look1, fov = 34) => ({ k: 'fix', pos: E(...pos), look: E(...look), pos1: E(...pos1), look1: E(...look1), fov, ap: 0 });
const ELEV_BEATS = [
  { line: line('smoker', null, 'Oye, pero ¿sabéis qué queréis comer?', { gest: 'open', head: 'nod', mood: { smile: .3, browUp: .5 }, energy: 1.1 }),
    shot: EF([.56, 1.62, .74], [.3, 1.6, -.36], [.5, 1.62, .7], [.3, 1.6, -.36], 32), react: [{ who: 'phone', type: 'nod', u: .7 }] },
  { line: line('artist', 'smoker', 'Pues yo, la verdad, no lo había pensado.', { head: 'tilt', mood: { smile: .3, browUp: .3 } }),
    shot: EF([-.05, 1.6, .8], [.66, 1.58, .2], [.0, 1.6, .78], [.66, 1.58, .2], 32), react: [{ who: 'gamer', type: 'shake', u: .6 }] },
  { line: line('phone', null, 'Bueno, pues que alguien saque el teléfono y vea la carta.', { gest: 'up', head: 'nod', mood: { smile: .5, browUp: .4 }, energy: 1.15 }),
    shot: EF([.32, 1.58, .8], [-.2, 1.56, .1], [.26, 1.58, .78], [-.2, 1.56, .1], 30), react: [{ who: 'smoker', type: 'nod', u: .8 }] },
];

/* ---- compilación: reparte el recorrido de scroll [P0, OUT0] entre las frases (más larga = más scroll) ---- */
export const P0 = .085, OUT0 = .90, EL0 = .925, END = 1.0, GAP = .4;      // OUT0: fin de la conversación · EL0: empieza el ascensor · entre ambos, fundido en negro (SOLO después de que decidan ir a comer)
const durOf = (text) => Math.min(5.5, Math.max(1.2, text.length * .048 + .4));      // ~20 caracteres/s (antes ~15): frases más ágiles sin cortarlas

export const TIMELINE = (() => {
  const beats = BEATS.map(b => ({ ...b, dur: b.line ? durOf(b.line.text) : b.pause * .6 }));
  const total = beats.reduce((a, b) => a + b.dur + GAP, 0), K = (OUT0 - P0) / total;
  let p = P0, id = 0; const lines = [], shots = [];
  for (const b of beats) {
    const span = (b.dur + GAP) * K; b.p0 = p; b.p1 = p + span; p += span;
    const L = b.line || { silent: true }; Object.assign(L, { dur: b.dur, p0: b.p0, p1: b.p1, react: b.react || [], ch: b.ch }); lines.push(L);
    let groups;
    if (b.line) {
      // MIENTRAS HABLA: la cámara solo muestra a quien habla (máx. 2 planos suyos); las reacciones de los demás y los generales van DESPUÉS de que termine
      const spk = b.line.who, isSpk = (s) => s.k === 'two' ? (s.a === spk || s.b === spk) : (s.who === spk && s.k !== 'ins');      // los detalles de objetos (mando, cigarro) no muestran la boca: van después
      let sp = b.shots.filter(x => isSpk(x[1])).slice(0, 2); const af = [...b.shots.filter(x => !isSpk(x[1]))].sort((a, c) => (a[1].k === 'ins' && a[1].who === spk ? -1 : 0) - (c[1].k === 'ins' && c[1].who === spk ? -1 : 0)).slice(0, 1);
      if (!sp.length) sp = [[1, F(spk)]];
      const fs = af.length ? b.dur / (b.dur + GAP) : 1, cut = b.p0 + span * fs; L.hold = af.length ? cut : b.p1;      // hasta L.hold la historia no puede avanzar mientras dura el habla
      groups = [[sp, b.p0, cut]]; if (af.length) groups.push([af, cut, b.p1]);
    } else groups = [[b.shots, b.p0, b.p1]];
    for (const [list, a, z] of groups) { const wsum = list.reduce((acc, s) => acc + s[0], 0); let q = a; for (const [w, spec] of list) { const q1 = q + (z - a) * w / wsum; shots.push({ ...spec, id: id++, p0: q, p1: q1 }); q = q1; } }
  }
  // ── FINAL: fundido en negro y ascensor (planos medios) ──
  // 1) general del salón mientras se funde a negro
  shots.push({ ...WIDE_W, id: id++, p0: OUT0, p1: EL0 });
  // 2) ascensor: puertas cerrándose y, ya bajando, la conversación de qué comer → alguien saca el móvil → «Ver carta» → se baja a la web de la pizzería
  const elevStart = EL0 + .014, sp = END - .004 - elevStart, EB = ELEV_BEATS.map(b => ({ ...b, dur: durOf(b.line.text) })), tot = EB.reduce((a, b) => a + b.dur + GAP, 0), Kel = sp / tot;
  shots.push({ ...ELEV_DOORS, id: id++, p0: EL0, p1: elevStart });
  let pe = elevStart; const elevLines = [];
  for (const b of EB) {
    const span = (b.dur + GAP) * Kel, cut = pe + span * (b.dur / (b.dur + GAP)); b.p0 = pe; b.p1 = pe + span;
    const L = b.line; Object.assign(L, { dur: b.dur, p0: b.p0, p1: b.p1, react: b.react || [], ch: 5, hold: cut, elev: true }); lines.push(L); elevLines.push(L); beats.push(b);
    shots.push({ ...b.shot, id: id++, p0: b.p0, p1: b.p1 }); pe += span;
  }
  const cartaP = elevLines[elevLines.length - 1].hold;      // al terminar la última frase aparece el móvil con el botón «Ver carta»
  return { P0, OUT0, EL0, END, GAP, beats, lines, shots, K, cartaP };
})();

/* ---- capítulos (calculados) ---- */
const chStart = (ch) => TIMELINE.beats.find(b => b.ch === ch)?.p0 ?? 1;
export const CHAPTERS = [
  { id: 0, n: '01', t: 'Entrada',         d: 'Un edificio viejo. Una ventana abierta.',               a: 0,           b: P0 },
  { id: 1, n: '02', t: 'El concierto',    d: 'Nadie vio nada. Todos tienen opinión.',                  a: P0,          b: chStart(2) },
  { id: 2, n: '03', t: 'El nivel final',  d: 'Tres días, un jefe imposible y cero excusas.',           a: chStart(2),  b: chStart(3) },
  { id: 3, n: '04', t: 'La nevera',       d: 'Medio limón y una salsa caducada.',                      a: chStart(3),  b: chStart(4) },
  { id: 4, n: '05', t: 'La pizzería',     d: 'Justo debajo. Siempre estuvo ahí.',                      a: chStart(4),  b: EL0 },
  { id: 5, n: '06', t: 'El ascensor',     d: 'Una planta más abajo.',                                 a: EL0,         b: 1.01 },
];

/* ---- cámara: entrada (fachada → ventana → salón) y salida (ventana → calle, pizzería). Entre P0 y OUT0 mandan los planos de shots.js ---- */
export const CAMERA_KEYS = [
  { p: 0.00, pos: [-12.8, 1.9, 7.2],  look: [-3.3, 3.4, 2.3],  fov: 40, ap: 0 },
  { p: 0.032, pos: [-9.6, 2.5, 4.4],   look: [-3.3, 1.7, 2.3],  fov: 38, ap: .6, focus: [-3.3, 1.7, 2.2] },
  { p: 0.06, pos: [-4.7, 1.78, 2.3],  look: [-0.5, 1.3, .3],   fov: 46, ap: .5 },
  { p: 0.082, pos: [-2.0, 1.72, 2.25], look: [1.0, 1.0, -1.5], fov: 52, ap: .3, hold: true },
  { p: P0, pos: [-1.95, 1.72, 2.25], look: [1.0, 1.0, -1.5],  fov: 52, ap: .3, hold: true },
  { p: 1.0, pos: E(0, 1.4, .74), look: E(0, 1.3, -.25), fov: 70, ap: .3, hold: true },
];
