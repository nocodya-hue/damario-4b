/* =========================================================
   ESCENA DEL ASCENSOR — fundido orgánico a negro y sección final
   Cuando la historia llega a EL0 (todo negro), los cuatro personajes se "trasladan" a la cabina (world/elevator.js), de pie y mirando a las puertas.
   La secuencia (puertas cerrándose, bajada de una planta con el indicador 4 → 3, ding, puertas abriendo) se reparte por el scroll de EL0 a END.
   Al volver hacia atrás (p < EL0) todo regresa al salón: mismas posturas, sillones, objetos y comportamientos de antes.
   ========================================================= */
import * as THREE from 'three';
import { buildElevator, E } from '../world/elevator.js';
import { CAST } from '../characters/cast.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sm = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
const smoother = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * u * (u * (u * 6 - 15) + 10); };

/* Cada uno en su sitio, sin formar fila: distancias distintas, giros distintos y posturas de manos/pies propias (mode: hang | pockets | crossed | rail) */
const SLOT = {
  gamer:  { x: -.62, z: -.5,  yaw: .42,  mode: 'pockets', fwd: 'R', lean: .05, roll: .03, gaze: [.15, .55] },     // rincón trasero izquierdo, girado hacia los demás
  smoker: { x: .3,   z: -.36, yaw: -.3,  mode: 'crossed', fwd: 'L', lean: -.03, roll: -.025, gaze: [.4, .45] },   // atrás a la derecha, brazos cruzados, mira a Noa
  phone:  { x: -.2,  z: .1,   yaw: .22,  mode: 'hang',    fwd: 'L', lean: .04, roll: .02, gaze: [.3, .4] },       // delante, medio de lado
  artist: { x: .66,  z: .2,   yaw: -.62, mode: 'rail',    fwd: 'R', lean: .07, roll: -.035, gaze: [.35, .35] },  // apoyada en la barandilla derecha, casi de perfil
};

export class ElevatorScene {
  constructor({ cast, scene, F, q, audio, rig, timeline }) {
    this.cast = cast; this.scene = scene; this.audio = audio; this.rig = rig; this.tl = timeline; this.api = buildElevator(F, q); scene.add(this.api.group);
    this.active = false; this.saved = {}; this.lastF = 0; this.fired = new Set(); this.dinged = false;
  }

  /* 0 = imagen normal, 1 = negro. Curva suave: el salón se apaga poco a poco (luz, enfoque y encuadre se cierran), negro fugaz y el ascensor aparece igual de suave. */
  /* 0 = imagen normal, 1 = negro. El fundido SOLO empieza cuando acaba la última frase ("Ok, vamos.": todos deciden ir a comer); antes de eso nunca oscurece nada */
  fade(p) {
    const { EL0 } = this.tl, last = [...this.tl.lines].reverse().find(l => !l.elev), from = last?.hold ?? this.tl.OUT0;
    if (p <= from) return 0;
    const down = smoother(from, EL0 - .004, p), up = 1 - smoother(EL0 + .001, EL0 + .024, p);
    return p < EL0 - .004 ? down : Math.min(1, up);
  }

  _stand(A, key, idx) {
    const seed = A.spec.seed, P = SLOT[key], others = Object.keys(this.cast.actors).filter(k => k !== key); const S = { next: 1 + idx * .7, tgt: null, cur: 'door' };
    const door = new THREE.Vector3(...E(0, 2.15, .8));
    const worldRail = (side, z) => new THREE.Vector3(...E(side * .86, .96, z));
    return (t, dt) => {
      const hp = A.hip; hp.y = A.restHipY - .012 * Math.abs(P.roll) * 10; hp.z = 0; hp.x = P.roll * .5; hp.pitch = 0; hp.yaw = 0; hp.roll = P.roll + Math.sin(t * .35 + seed) * .006;
      A.spinePitch.follow(.02 + P.lean + Math.sin(t * .5 + seed) * .012, dt, 4); A.chestPitch.follow(.012 + P.lean * .6, dt, 4); A.chestYaw.follow(Math.sin(t * .21 + seed) * .05 - P.yaw * .1, dt, 3); A.chestRoll.follow(-P.roll * 1.2 + Math.sin(t * .17 + seed) * .015, dt, 3);
      // pies: uno adelantado y algo abierto (postura de descanso, no "firmes")
      const f = P.fwd === 'L' ? 1 : -1;
      A.setFoot('L', A.W(.13, A.ankleH, .02 + (f > 0 ? .13 : -.03)), .12 * f + .08, 0, A.W(.2, .5, .9)); A.setFoot('R', A.W(-.13, A.ankleH, .02 + (f < 0 ? .13 : -.03)), -.12 * f - .08, 0, A.W(-.2, .5, .9));
      const hy = A.restHipY, sw = Math.sin(t * .6 + seed) * .01, pole = (x, z) => A.W(x, .9, z);
      const hang = (side) => [A.W(side * .25, hy - .08 + sw * side, .03), A.Wdir(-side, 0, .1), A.Wdir(0, -1, .1), { c: [.3, .35, .4, .45], th: [.3, .3, 0], w: 12 }, pole(side * .5, -.3)];
      const pocket = (side) => [A.W(side * .17, hy - .03, .13), A.Wdir(-side * .6, -.4, .6), A.Wdir(0, -.6, .7), { c: [.4, .5, .55, .6], th: [.5, .3, 0], w: 12 }, pole(side * .55, -.35)];
      const cross = (side) => [A.W(-side * .16, hy + .2 + sw, .21), A.Wdir(0, .3, -1), A.Wdir(side * .9, .1, .2), { c: [.3, .35, .4, .45], th: [.3, .3, 0], w: 12 }, pole(side * .4, .2)];
      let L, R;
      L = hang(1); R = hang(-1);                                                       // todos con los brazos caídos a los lados
      A.setHand('L', ...L); A.setHand('R', ...R);
      // mirada: se miran entre ellos, al indicador o al suelo; cambian cada pocos segundos
      if (t > S.next) { S.next = t + 1.6 + Math.random() * 3; const r = Math.random(); S.cur = r < P.gaze[0] ? 'door' : r < P.gaze[0] + P.gaze[1] ? 'mate' : 'mate2'; S.tgt = others[Math.floor(Math.random() * others.length)]; }
      const eyeOf = (k) => this.cast.actors[k].eyeW;
      let tg = door; if (S.cur === 'mate' || S.cur === 'mate2') tg = eyeOf(S.tgt); else if (S.cur === 'floor') tg = A.W(0, .1, .9);
      A.lookAt(tg, { w: 5 });
      if (t > (S.nb ??= t + Math.random() * 1.2)) { A.blink = 1; S.nb = t + 1.3 + Math.random() * 2; }      // parpadean con más frecuencia y se les nota (están quietos, de pie)
      A.express({ smile: .1 + .1 * Math.sin(t * .4 + seed) + (S.cur === 'mate' ? .12 : 0), browUp: .05 });
    };
  }

  /* la luz ambiente y el sol de la sala llegan también a la cabina (sin sombras): se apagan dentro para que solo mande la luz del techo */
  _roomLights(on) {
    if (on) { this.rl = []; this.scene.traverse(o => { if (o.isHemisphereLight || o.isDirectionalLight || o.isSpotLight) { this.rl.push([o, o.intensity]); o.intensity *= o.isHemisphereLight ? .16 : 0; } }); for (const a of Object.values(this.cast.actors)) { if (a.fill) { this.rl.push([a.fill, a.fill.intensity]); a.fill.intensity *= .12; } if (a.rim) { this.rl.push([a.rim, a.rim.intensity]); a.rim.intensity *= .55; } } }
    else if (this.rl) { for (const [o, i] of this.rl) o.intensity = i; this.rl = null; }
  }

  enter() {
    const A = this.cast.actors, env = this.cast.env; this.active = true; this.api.group.visible = true; this._roomLights(true);
    let i = 0; for (const [k, a] of Object.entries(A)) {
      this.saved[k] = { x: a.root.position.x, z: a.root.position.z, yaw: a.root.rotation.y, beh: a.behavior, col: a.colliders, post: a.post, ank: a.ankleH, vis: [] };
      for (const o of Object.values(a.props || {})) if (o && o.isObject3D) { this.saved[k].vis.push([o, o.visible]); o.visible = false; }
      a.stopSpeak(); a.attn = null; a.colliders = null; a.post = null; a.gx.on = false; a.push?.L.set(0, 0, 0); a.push?.R.set(0, 0, 0);
      a.place(this.api.group.position.x + SLOT[k].x, this.api.group.position.z + SLOT[k].z, SLOT[k].yaw); a.root.position.y = this.api.group.position.y; a.root.updateMatrixWorld(true);
      a.behavior = this._stand(a, k, i++); a.thumbT = null; a.fingerT = null;
    }
    for (const a of Object.values(A)) a.anat.warm = true;
    for (let n = 0; n < 28; n++) for (const a of Object.values(A)) a.update(n / 20, 1 / 20, env);      // pasos de 50 ms (el máximo que admite Actor.update): mismo tiempo simulado con la mitad de cálculos
    for (const a of Object.values(A)) a.anat.timeJump(false);
    this.fired.clear(); this.dinged = false; this.lastF = 0;
  }

  exit() {
    const A = this.cast.actors, env = this.cast.env; this.active = false; this.api.group.visible = false; this.rig.shake = 0; this._roomLights(false);
    for (const [k, a] of Object.entries(A)) { const s = this.saved[k]; if (!s) continue; a.place(s.x, s.z, s.yaw); a.root.position.y = 0; a.behavior = s.beh; a.colliders = s.col; a.post = s.post; for (const [o, v] of s.vis) o.visible = v; a.root.updateMatrixWorld(true); }
    for (const a of Object.values(A)) a.anat.warm = true;
    for (let n = 0; n < 24; n++) for (const a of Object.values(A)) a.update(n / 20, 1 / 20, env);
    for (const a of Object.values(A)) a.anat.timeJump(false);
  }

  update(p, dt, t) {
    const { EL0, END } = this.tl, want = p >= EL0 - .003; if (want !== this.active) want ? this.enter() : this.exit();
    if (!this.active) return this.fade(p);
    const f = clamp((p - EL0) / (END - EL0), 0, 1), fa = Math.min(f, .6); this.api.set(fa, t);      // la cabina baja con las puertas cerradas: llega a la pizzería al pulsar «Ver carta» (no hay llegada por scroll)
    this.rig.shake = .0022;      // vibración suave de la cabina mientras baja
    this.lastF = f; return this.fade(p);
  }
}
