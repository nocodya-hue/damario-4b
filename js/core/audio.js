/* =========================================================
   AUDIO — arquitectura de sonido (procedural, sin archivos)
   Solo se crea el AudioContext tras una interacción del usuario (botón "Sonido").
   Capas: tráfico lejano (coches que pasan, bocinas, tren) · TV (juego) · mando · móvil que vibra ·
   lápiz sobre papel (ligado al trazo real) · (sin voces: los diálogos son solo subtítulos).
   NO hay ruido continuo de fondo (ni "ciudad" ni murmullo de sala): todo lo que suena viene de algo concreto.
   Las fuentes puntuales van espacializadas (PannerNode) en la posición real del objeto.
      ========================================================= */
import * as THREE from 'three';
import { L } from '../world/layout.js';
import { visemes } from '../characters/actor.js';

const VOICES = { gamer: { f: 118, v: .9 }, phone: { f: 205, v: 1.1 }, smoker: { f: 92, v: .7 }, artist: { f: 176, v: 1.0 } };

export class AudioEngine {
  constructor() { this.ctx = null; this.on = false; this.samples = {}; this.nextClick = 0; this.nextBleep = 0; this._v = new THREE.Vector3(); }

  async enable() {
    const tk = this._tk = (this._tk || 0) + 1;                                    // si mientras esperamos (resume/play pendientes hasta el primer gesto) el usuario pulsa "off", esta activación queda anulada
    if (!this.ctx) this._init(); await this.ctx.resume(); if (tk !== this._tk) return; this.on = true; this.music.muted = false; this.master.gain.setTargetAtTime(.9, this.ctx.currentTime, .4);
    // música de fondo (archivo del usuario): entra suave y muy baja
    try { await this.music.play(); if (tk !== this._tk) { this.music.pause(); return; } this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime); this.musicGain.gain.setTargetAtTime(this.musicVol, this.ctx.currentTime, 1.4); } catch (e) { console.warn('[4B] no se pudo reproducir la música', e); }
  }
  disable() { this._tk = (this._tk || 0) + 1; this.on = false; if (this.music) this.music.muted = true; this.stopSpeech(); if (this.ctx) { this.master.gain.setTargetAtTime(0, this.ctx.currentTime, .2); this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, .25); setTimeout(() => { if (!this.on) this.music.pause(); }, 900); } }

  _noise(seconds = 2, color = 'white') {
    const c = this.ctx, b = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate), d = b.getChannelData(0); let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; if (color === 'brown') { last = (last + .02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
    return b;
  }
  _panner(pos) { const p = this.ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 1.2; p.rolloffFactor = 1.3; p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; p.connect(this.master); return p; }

  _init() {
    const c = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = c.createGain(); this.master.gain.value = 0; this.master.connect(c.destination);
    // música de fondo: "Big Poppa" (instrumental), en bucle y a muy poco volumen
    this.musicVol = .13; this.music = new Audio('assets/audio/musica-fondo.mp3'); this.music.loop = true; this.music.preload = 'none'; this.music.crossOrigin = 'anonymous';
    this.musicGain = c.createGain(); this.musicGain.gain.value = 0; c.createMediaElementSource(this.music).connect(this.musicGain).connect(this.master);
    // bus de tráfico: coches y tren de fondo; se apaga y amortigua dentro del salón (ver update)
    this.cityBus = c.createGain(); this.cityBus.gain.value = .8; this.cityLP = c.createBiquadFilter(); this.cityLP.type = 'lowpass'; this.cityLP.frequency.value = 2500; this.cityBus.connect(this.cityLP).connect(this.master);
    this.nextCar = c.currentTime + 1.5; this.nextTrain = c.currentTime + 9; this.nextHorn = c.currentTime + 14;
    // fuentes con posición
    this.pTV = this._panner(new THREE.Vector3(L.tv.x, L.tv.y, L.tv.z)); this.pPad = this._panner(new THREE.Vector3(-.8, .9, -1.1)); this.pPhone = this._panner(new THREE.Vector3(L.rocker.x, .9, L.rocker.z));
    this.pDesk = this._panner(new THREE.Vector3(L.notebook.x, L.notebook.y, L.notebook.z)); this.pSmoke = this._panner(new THREE.Vector3(L.greenChair.x, 1, L.greenChair.z));
    this.pen = c.createBufferSource(); this.pen.buffer = this._noise(3, 'white'); this.pen.loop = true;      // solo suena mientras el lápiz dibuja (ganancia 0 el resto del tiempo)
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2400; this.penGain = c.createGain(); this.penGain.gain.value = 0; this.pen.connect(hp).connect(this.penGain).connect(this.pDesk); this.pen.start();
  }


  /* coche que pasa: rumor de motor + rodadura, con barrido de filtro tipo Doppler y paneo de un lado a otro */
  _car(vol = 1) {
    const c = this.ctx, t = c.currentTime + .05, dur = 3 + Math.random() * 3.5, dir = Math.random() < .5 ? -1 : 1, pan = c.createStereoPanner(), g = c.createGain(), bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = .7; const n = c.createBufferSource(); n.buffer = this._noise(2, 'white'); n.loop = true; n.connect(bp).connect(g); g.connect(pan).connect(this.cityBus);
    const f0 = 380 + Math.random() * 300; bp.frequency.setValueAtTime(f0 * 1.5, t); bp.frequency.exponentialRampToValueAtTime(f0 * .7, t + dur);
    pan.pan.setValueAtTime(-.9 * dir, t); pan.pan.linearRampToValueAtTime(.9 * dir, t + dur);
    const pk = (.05 + Math.random() * .035) * vol; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + dur * .45); g.gain.linearRampToValueAtTime(0, t + dur);
    const o = c.createOscillator(); o.type = 'sawtooth'; const og = c.createGain(); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; o.connect(lp).connect(og).connect(pan);
    const f = 48 + Math.random() * 30; o.frequency.setValueAtTime(f * 1.15, t); o.frequency.linearRampToValueAtTime(f * .85, t + dur); og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(.022 * vol, t + dur * .45); og.gain.linearRampToValueAtTime(0, t + dur);
    n.start(t); n.stop(t + dur + .1); o.start(t); o.stop(t + dur + .1);
  }
  _horn() {
    const c = this.ctx, t = c.currentTime + .05, g = c.createGain(), pan = c.createStereoPanner(); pan.pan.value = (Math.random() - .5) * 1.4; g.connect(pan).connect(this.cityBus);
    const f = 380 + Math.random() * 120, beeps = Math.random() < .5 ? 1 : 2;
    for (let k = 0; k < beeps; k++) for (const m of [1, 1.26]) { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f * m; const og = c.createGain(); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; o.connect(lp).connect(og).connect(g); const a = t + k * .55; og.gain.setValueAtTime(0, a); og.gain.linearRampToValueAtTime(.008, a + .03); og.gain.linearRampToValueAtTime(0, a + .32); o.start(a); o.stop(a + .36); }
  }
  /* tren lejano: bocina grave, retumbar creciente y traqueteo de las ruedas sobre las juntas (patrón de dos golpes) */
  _train() {
    const c = this.ctx, t = c.currentTime + .1, dur = 10 + Math.random() * 4, dir = Math.random() < .5 ? -1 : 1, pan = c.createStereoPanner(), g = c.createGain(); pan.pan.setValueAtTime(-.85 * dir, t); pan.pan.linearRampToValueAtTime(.85 * dir, t + dur); g.connect(pan).connect(this.cityBus);
    const env = (peak, a, d) => { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.setValueAtTime(peak, t + a); g.gain.linearRampToValueAtTime(0, t + d); };
    env(.7, dur * .5, dur);
    const r = c.createBufferSource(); r.buffer = this._noise(4, 'brown'); r.loop = true; const rl = c.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 220; const rg = c.createGain(); rg.gain.value = .075; r.connect(rl).connect(rg).connect(g); r.start(t); r.stop(t + dur + .2);
    const rate = 4.2 + Math.random() * 1.2, n = Math.floor(dur * rate);      // traqueteo: golpes cortos con acento alterno
    for (let i = 0; i < n; i++) { const a = t + i / rate + (i % 2 ? .07 : 0), s = c.createBufferSource(); s.buffer = this._noise(.2, 'white'); const b = c.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = 900 + (i % 2) * 350; b.Q.value = 1.6; const cg = c.createGain(); cg.gain.setValueAtTime(0, a); cg.gain.linearRampToValueAtTime((i % 2 ? .035 : .06), a + .008); cg.gain.exponentialRampToValueAtTime(.0005, a + .09); s.connect(b).connect(cg).connect(g); s.start(a); s.stop(a + .12); }
    // bocina lejana al principio (dos notas graves con vibrato)
    const h = c.createGain(); h.connect(pan); const ho = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(); ho.type = 'sawtooth'; ho.frequency.value = 196; lfo.frequency.value = 5; lg.gain.value = 3; lfo.connect(lg).connect(ho.frequency);
    const hl = c.createBiquadFilter(); hl.type = 'lowpass'; hl.frequency.value = 700; ho.connect(hl).connect(h); const ha = t + .3; h.gain.setValueAtTime(0, ha); h.gain.linearRampToValueAtTime(.022, ha + .15); h.gain.setValueAtTime(.022, ha + 1.1); h.gain.linearRampToValueAtTime(0, ha + 1.6); ho.start(ha); lfo.start(ha); ho.stop(ha + 1.7); lfo.stop(ha + 1.7);
  }
  _blip(dest, f, dur, type = 'square', vol = .05, when = 0, slide = 0) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), t = c.currentTime + when;
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + dur); o.connect(g).connect(dest); o.start(t); o.stop(t + dur + .02);
  }
  _burst(dest, dur, f, vol) { const c = this.ctx, s = c.createBufferSource(); s.buffer = this._noise(.3); const b = c.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = 3; const g = c.createGain(), t = c.currentTime; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur); s.connect(b).connect(g).connect(dest); s.start(t); s.stop(t + dur + .05); }

  /* voz: síntesis del navegador (español) con timbre/tono propio por personaje; si no hay voces, murmullo con una sílaba por palabra */
  _voices() {
    if (this._vc) return this._vc; if (!('speechSynthesis' in window)) return (this._vc = {});
    const all = speechSynthesis.getVoices().filter(v => /^es/i.test(v.lang)); if (!all.length) return {};   // aún no cargadas: se reintenta en la siguiente frase
    const pick = (hints) => all.find(v => hints.some(h => v.name.toLowerCase().includes(h))) || null;
    const fem = pick(['monica', 'mónica', 'paulina', 'helena', 'laura', 'lucia', 'lucía', 'elena', 'marisol', 'sabina', 'female', 'google español']) || all[0], male = pick(['jorge', 'diego', 'juan', 'carlos', 'pablo', 'enrique', 'male', 'alvaro', 'álvaro']) || all[all.length - 1];
    const alt = all.find(v => v !== fem && v !== male) || male;
    return (this._vc = { gamer: { v: male, pitch: .95, rate: 1.08 }, phone: { v: fem, pitch: 1.25, rate: 1.1 }, smoker: { v: alt === male ? male : alt, pitch: .62, rate: .98 }, artist: { v: alt === fem ? fem : fem, pitch: 1.02, rate: 1.05 } });
  }
  speech() { /* sin voces: los diálogos se leen solo en los subtítulos */ }

  /* voz sintetizada por formantes: fuente de dientes de sierra (tono con entonación) → dos filtros pasabanda cuya frecuencia sigue la vocal de cada visema;
     m/b/p cierran la voz, las demás consonantes son soplos de ruido. Va exactamente sincronizada con el movimiento de la boca. */
  _formantVoice(who, text, dur, dest) {
    const c = this.ctx, v = VOICES[who] || VOICES.gamer, t0 = c.currentTime + .3, ev = visemes(text, dur), F = { a: [800, 1250], e: [520, 1900], i: [310, 2350], o: [520, 950], u: [330, 820] };
    const src = c.createOscillator(); src.type = 'sawtooth'; const b1 = c.createBiquadFilter(), b2 = c.createBiquadFilter(); b1.type = b2.type = 'bandpass'; b1.Q.value = 7; b2.Q.value = 9;
    const g = c.createGain(); g.gain.value = 0; const g2 = c.createGain(); g2.gain.value = .55; src.connect(b1).connect(g); src.connect(b2).connect(g2).connect(g); g.connect(dest);
    const q = /\?/.test(text), end = t0 + dur * .95;
    const f0 = (t) => { const u = Math.min(1, Math.max(0, (t - t0) / dur)); return v.f * (1.22 + (q ? .25 * u * u : -.22 * u) + .05 * Math.sin(u * 17)) * .5; };     // entonación: baja al final, sube en preguntas
    src.frequency.setValueAtTime(f0(t0), t0); g.gain.setValueAtTime(0, t0);
    for (const e of ev) {
      const a = t0 + e.t0, b = t0 + e.t1; src.frequency.linearRampToValueAtTime(f0(a) * (1 + .03 * Math.sin(a * 40)), a);
      if (F[e.ch]) { b1.frequency.linearRampToValueAtTime(F[e.ch][0], a + .02); b2.frequency.linearRampToValueAtTime(F[e.ch][1], a + .02); g.gain.linearRampToValueAtTime(.16 * v.v, a + .03); g.gain.linearRampToValueAtTime(.09 * v.v, b - .01); }
      else if (e.press || e.ch === ' ' || ',;:.!?…'.includes(e.ch)) { g.gain.linearRampToValueAtTime(0.0001, a + .015); }
      else { g.gain.linearRampToValueAtTime(.045 * v.v, a + .015); g.gain.linearRampToValueAtTime(.03 * v.v, b); this._burst(dest, Math.max(.03, (b - a) * .9), 2600 + (e.ch.charCodeAt(0) % 7) * 500, .022); }
    }
    g.gain.linearRampToValueAtTime(0, end + .05); src.start(t0 - .02); src.stop(end + .12); this._voiceSrc = src;
  }
  stopSpeech() { this.speaking = false; try { this._voiceSrc?.stop(); } catch {} if ('speechSynthesis' in window) speechSynthesis.cancel(); }

  /* llamada por fotograma con el estado de la escena */
  update(t, env, camera, scrollVel) {
    if (!this.on || !this.ctx) return; const c = this.ctx, now = c.currentTime;
    const l = c.listener; camera.getWorldPosition(this._v);
    if (l.positionX) { l.positionX.value = this._v.x; l.positionY.value = this._v.y; l.positionZ.value = this._v.z; const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), u = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion); l.forwardX.value = f.x; l.forwardY.value = f.y; l.forwardZ.value = f.z; l.upX.value = u.x; l.upY.value = u.y; l.upZ.value = u.z; }
    const inside = camera.position.x > -3.2;
    // tráfico de fondo: coches cada pocos segundos, alguna bocina y un tren de vez en cuando; dentro del salón suena lejano y apagado
    this.cityBus.gain.setTargetAtTime(inside ? .55 : 1, now, .6); this.cityLP.frequency.setTargetAtTime(inside ? 900 : 4200, now, .6);
    if (now > this.nextCar) { this._car(inside ? .9 : 1.3); this.nextCar = now + 3.5 + Math.random() * 6; }
    if (now > this.nextHorn) { this._horn(); this.nextHorn = now + 18 + Math.random() * 25; }
    if (now > this.nextTrain) { this._train(); this.nextTrain = now + 32 + Math.random() * 28; }
    // TV: pitidos de videojuego; el golpe cuando pierden
    if (env.tv) {
      if (env.tv.event === 'hit') { this._blip(this.pTV, 320, .35, 'sawtooth', .05, 0, -220); this._blip(this.pTV, 180, .3, 'square', .03, .12, -100); }
      if (env.tv.event === 'win') { [520, 660, 880].forEach((f, i) => this._blip(this.pTV, f, .12, 'square', .035, i * .08)); }
      if (t > this.nextBleep) { this.nextBleep = t + .25 + Math.random() * .7; if (Math.random() < .55) this._blip(this.pTV, 700 + Math.random() * 500, .05, 'square', .012); }
    }
    // mando: clics de botones a ritmo irregular
    if (t > this.nextClick) { this.nextClick = t + .09 + Math.random() * .25; if (Math.random() < .6) this._burst(this.pPad, .03, 1800 + Math.random() * 900, .05); }
    // lápiz: sube con el trazo activo y con la velocidad del scroll
    const pen = env.pencilLevel ? Math.min(1, .35 + Math.abs(scrollVel) * .0016) : 0; this.penGain.gain.setTargetAtTime(pen * .035, now, .06);
  }
  /* ding de ascensor: campana de dos parciales que se apaga en ~1.4 s (bajito) */
  ding() { if (!this.on || !this.ctx) return; const c = this.ctx, t = c.currentTime + .02, g = c.createGain(); g.connect(this.master); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.05, t + .01); g.gain.exponentialRampToValueAtTime(.0008, t + 1.5); for (const f of [1318, 1760, 2637]) { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f; const og = c.createGain(); og.gain.value = f === 2637 ? .25 : 1; o.connect(og).connect(g); o.start(t); o.stop(t + 1.6); } }
  buzz() { if (!this.on) return; for (let i = 0; i < 4; i++) this._blip(this.pPhone, 150, .12, 'square', .03, i * .17); }
  pop(pos) { if (!this.on) return; this._blip(this.master, 720, .07, 'sine', .03); }
}
