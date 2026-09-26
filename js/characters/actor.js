/* =========================================================
   ACTOR — un personaje completo sobre un humano real (Human)
   Pose por OBJETIVOS: los comportamientos (behaviors.js) solo dicen dónde van las manos, los pies,
   la cadera y la mirada; el actor resuelve IK sobre el esqueleto real, suaviza con muelles
   amortiguados y añade vida (respiración, parpadeo, sacadas oculares, habla) + física de contacto.
   ========================================================= */
import * as THREE from 'three';
import { loadHuman, V3, clamp, lerp, sstep } from './human.js';
import { Anatomy } from './anatomy.js';

/* muelle 3D críticamente amortiguado con sub-pasos (estable aunque el fotograma sea largo) */
export class Spring3 {
  constructor(v = V3()) { this.p = v.clone(); this.v = V3(); this.t = v.clone(); this._f = V3(); }
  set(v) { this.p.copy(v); this.t.copy(v); this.v.set(0, 0, 0); }
  follow(target, dt, w = 14) {
    this.t.copy(target); const n = Math.max(1, Math.ceil(dt * w / .5)), h = dt / n;
    for (let i = 0; i < n; i++) { this._f.copy(this.t).sub(this.p).multiplyScalar(w * w).addScaledVector(this.v, -2 * w); this.v.addScaledVector(this._f, h); this.p.addScaledVector(this.v, h); }
    return this.p;
  }
}
export class Spring1 {
  constructor(v = 0) { this.p = v; this.v = 0; }
  follow(t, dt, w = 12) { const n = Math.max(1, Math.ceil(dt * w / .5)), h = dt / n; for (let i = 0; i < n; i++) { const f = (t - this.p) * w * w - 2 * w * this.v; this.v += f * h; this.p += this.v * h; } return this.p; }
}


/* ---------- LIP-SYNC: del texto a una secuencia de formas de boca (vocales = apertura/labios, m-b-p = cierre, pausas en la puntuación) ---------- */
const VOW = { a: [.88, 0, 0], e: [.52, 0, .34], i: [.26, 0, .58], o: [.56, .62, 0], u: [.32, .88, 0] };
export function visemes(text, dur) {
  const s = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''), ev = [];
  for (const ch of s) {
    if (VOW[ch]) ev.push({ ch, w: 1, jaw: VOW[ch][0], oh: VOW[ch][1], smile: VOW[ch][2] });
    else if ('mbpv'.includes(ch)) ev.push({ ch, w: .5, jaw: 0, oh: 0, smile: 0, press: 1 });
    else if (ch === ' ') ev.push({ ch, w: .28, jaw: .1, oh: 0, smile: 0 });
    else if (',;:'.includes(ch)) ev.push({ ch, w: 1.3, jaw: 0, oh: 0, smile: 0, press: .6 });
    else if ('.!?…'.includes(ch)) ev.push({ ch, w: 2.0, jaw: 0, oh: 0, smile: 0, press: .6 });
    else if (/[a-z]/.test(ch)) ev.push({ ch, w: .42, jaw: .2, oh: 0, smile: 0 });
  }
  const tot = ev.reduce((a, e) => a + e.w, 0) || 1, k = dur * .93 / tot; let c = .05;
  for (const e of ev) { e.t0 = c; c += e.w * k; e.t1 = c; }
  return ev;
}

const _e = new THREE.Euler(0, 0, 0, 'YXZ'), _qa = new THREE.Quaternion();

export class Actor {
  /* spec: { key, name, color, at:{x,z,yaw}, seatY, seed } */
  static async create(spec, F, q) {
    const human = await loadHuman(spec.model, q, F);
    return new Actor(spec, human, F, q);
  }

  constructor(spec, human, F, q) {
    this.spec = spec; this.q = q; this.name = spec.name; this.key = spec.key; this.color = spec.color; this.F = F;
    const hm = this.human = this.rig = human; this.k = 1;                      // el humano ya viene a su altura real
    this.root = new THREE.Group(); this.root.name = 'actor_' + spec.key; this.root.add(hm.scene);
    this.meshes = Object.values(hm.meshes);
    // compatibilidad con los comportamientos: métricas de cabeza y expresión
    const H = this.head = hm.H; H.k = 1; H.ex = { jaw: 0, smile: 0, oh: 0, frown: 0, blink: 0, browUp: 0, browAngry: 0, look: new THREE.Vector2() };
    H.update = () => this._applyFace();
    this.restHipY = hm.rest.pelvis.y; this.restHipZ = hm.rest.pelvis.z;
    this.handL = { pose: (c, th, s) => hm.poseHand('l', c, th, s) }; this.handR = { pose: (c, th, s) => hm.poseHand('r', c, th, s) };

    // objetivos suavizados (coordenadas MUNDO)
    this.T = { handL: new Spring3(), handR: new Spring3(), footL: new Spring3(), footR: new Spring3(), look: new Spring3() };
    this.hand = { L: { palm: V3(-1, 0, 0), fing: V3(0, -1, 0), pole: V3(0, 0, 0), c: [0, 0, 0, 0], th: [0, 0, 0], spread: 0 }, R: { palm: V3(1, 0, 0), fing: V3(0, -1, 0), pole: V3(0, 0, 0), c: [0, 0, 0, 0], th: [0, 0, 0], spread: 0 } };
    this.hip = { y: this.restHipY, z: 0, x: 0, pitch: 0, yaw: 0, roll: 0 };
    this.spinePitch = new Spring1(); this.chestPitch = new Spring1(); this.chestYaw = new Spring1(); this.chestRoll = new Spring1();
    this.footYaw = [0, 0]; this.footPitch = [0, 0]; this.kneePole = [V3(), V3()];
    this.lookOpts = { maxYaw: 1.2, maxPitch: .6, share: .4, roll: 0, smooth: .12, pitchBias: 0 };
    this.headRoll = new Spring1();
    this.ex = { smile: 0, jaw: 0, oh: 0, frown: 0, browUp: 0, browAngry: 0 };
    this.exT = { smile: 0, browUp: 0, browAngry: 0, oh: 0, frown: 0 };
    this.talk = 0; this.talkT = 0; this.blinkT = 2 + Math.random() * 3; this.blink = 0; this.sacc = 0; this.saccV = new THREE.Vector2();
    this.t = 0; this.stand = 0; this.breathe = 1; this.colliders = null; this.ankleH = .105;
    this.corr = { hip: V3(), footL: V3(), footR: V3(), handL: V3(), handR: V3() };
    // habla, emoción, risa, gestos
    this.vis = null; this.vi = 0; this.mv = { jaw: new Spring1(), oh: new Spring1(), smile: new Spring1() }; this.talking = false; this.energy = 1;
    this.mood = { smile: 0, browUp: 0, frown: 0, browAngry: 0, oh: 0 }; this.moodW = 0; this.moodT = 0;
    this.laughUntil = 0; this.laughV = 0; this.headAct = null; this.gestSide = null; this.gx = { type: 'talk', w: 0, on: false, t0: 0, target: null }; this.padG = V3(); this.bob = 0;
    this.anchorHead = V3(); this.mouthWorld = V3(); this.handWorld = { L: V3(), R: V3() }; this.eyeW = V3(); this.attn = null; this.chestW = V3();
    this.anat = new Anatomy(this);              // anatomía real (límites articulares, IK con codo, autocolisión, inercia, equilibrio): regla permanente para todo personaje
  }

  /* posición mundo de un anclaje de la mano ('palm', 'gap'); válido tras resolver la pose */
  anchor(side, kind, out = V3()) { const k = side + kind, c = (this._anc ||= {}); const loc = (c[k] ||= this.human.anchorLocal(side.toLowerCase(), kind)); return this.human.hand[side.toLowerCase()].sock.localToWorld(out.copy(loc)); }

  /* socket de la mano donde colgar objetos (móvil, bolígrafo, cigarrillo): +Y = hacia atrás de los dedos, +Z = lado del pulgar */
  socket(side) { return this.human.hand[side].sock; }

  /* punto en el marco del socket: palm = hacia donde mira la palma, along = hacia la punta de los dedos (negativo = hacia atrás), thumb = hacia el pulgar */
  hold(side, palm, along, thumb) { const H = this.human.hand[side]; return V3(H.palmSign * palm, along, thumb); }

  place(x, z, yaw) { this.root.position.set(x, 0, z); this.root.rotation.y = yaw; this.root.updateMatrixWorld(true); }
  W(x, y, z, out = V3()) { return this.root.localToWorld(out.set(x, y, z)); }
  Wdir(x, y, z, out = V3()) { return out.set(x, y, z).applyQuaternion(this.root.getWorldQuaternion(_qa)).normalize(); }

  /* el comportamiento fija estos objetivos cada frame */
  /* pose del gesto de la mano libre (coordenadas del actor → mundo). s = +1 mano izquierda */
  _gestPose(side) {
    const g = this.gx, t = this.t - g.t0, s = side === 'L' ? 1 : -1, q = this.root.quaternion, e = this.mv.jaw.p * this.energy, ch = this.chestW.clone().add(V3(0, .2, 0));   // el hueso 'chest' queda bajo (sentado ≈ .82 m): +.2 = altura del codo/pecho
    const Lc = (x, y, z) => V3(x, y, z).applyQuaternion(q), out = { c: [.25, .3, .35, .4], th: [.2, .2, 0], pole: this.W(s * .5, .75, -.3) };
    switch (g.type) {
      case 'open': out.pos = ch.clone().add(Lc(s * (.34 + .03 * Math.sin(t * 3)), -.1 + .04 * e, .3)); out.fing = Lc(s * .3, .15, .9).normalize(); out.palm = Lc(0, 1, .15).normalize(); out.c = [.08, .1, .12, .15]; out.th = [.05, .05, 0]; break;
      case 'up': out.pos = ch.clone().add(Lc(s * .3, .07 + .02 * Math.sin(t * 6), .3)); out.fing = Lc(0, 1, .25).normalize(); out.palm = Lc(-s, 0, .35).normalize(); out.c = [0, 1.3, 1.3, 1.3]; out.th = [.9, .1, 0]; break;
      case 'point': { const tg = g.target || ch.clone().add(Lc(0, 0, 2)), base = ch.clone().add(Lc(s * .13, .02, .1)), dir = tg.clone().sub(base).normalize(), dl = dir.clone().applyQuaternion(q.clone().invert());
        if (dl.x * s < -.1) dl.x = -.1 * s; dl.z = Math.max(dl.z, .2); dir.copy(dl.normalize().applyQuaternion(q));     // si el objetivo queda al otro lado del cuerpo, señala hacia delante: el brazo no puede cruzar el torso
        out.pos = base.addScaledVector(dir, .4); out.fing = dir; /* el brazo señala HACIA el objetivo: el antebrazo va en su dirección y la muñeca queda casi neutra */ out.palm = Lc(-s * .35, -.9, .1).normalize(); out.c = [0, 1.25, 1.25, 1.25]; out.th = [.85, .1, 0]; break; }
      case 'dismiss': out.pos = ch.clone().add(Lc(s * (.32 + .07 * Math.sin(t * 8)), -.06, .3)); out.fing = Lc(s * .25, .05, .95).normalize(); out.palm = Lc(0, -1, .1).normalize(); out.c = [.12, .12, .15, .2]; break;
      case 'chop': out.pos = ch.clone().add(Lc(s * .16, -.02 + .12 * Math.max(0, Math.sin(t * 5.4)) - .05, .34)); out.fing = Lc(0, .1, 1).normalize(); out.palm = Lc(-s, 0, 0); out.c = [.1, .1, .12, .14]; out.th = [.1, .1, 0]; break;
      default: out.pos = ch.clone().add(Lc(s * (.2 + .02 * Math.sin(t * 2.7)), -.13 + .05 * Math.sin(t * 5.3) + .07 * e, .3 + .04 * Math.cos(t * 3.1))); out.fing = Lc(-s * .2, .3 + .2 * e, .9).normalize(); out.palm = Lc(-s * .65, .7, .2).normalize(); out.c = [.2 + .2 * e, .3, .35, .4]; out.th = [.25, .25, 0];
    }
    return out;
  }
  setHand(side, pos, palm, fing, pose = {}, pole) {
    const h = this.hand[side];
    if (side === this.gestSide && this.gx.w > .004) {
      const g = this._gestPose(side), w = this.gx.w; pos = pos.clone().lerp(g.pos, w); palm = palm.clone().lerp(g.palm, w).normalize(); fing = fing.clone().lerp(g.fing, w).normalize();
      const c0 = pose.c || h.c, t0 = pose.th || h.th; pose = { ...pose, c: c0.map((x, i) => x + (g.c[i] - x) * w), th: t0.map((x, i) => x + (g.th[i] - x) * w), w: Math.max(pose.w ?? 16, 12) }; pole = g.pole;
    }
    this.T['hand' + side].follow(pos, this._dt, pose.w ?? 16);
    h.palm.lerp(palm, .35); h.fing.lerp(fing, .35);
    if (pole) h.pole.copy(pole);
    h.c = pose.c || h.c; h.th = pose.th || h.th; h.spread = pose.spread ?? h.spread;
  }
  setFoot(side, pos, yaw = 0, pitch = 0, knee) { const i = side === 'L' ? 0 : 1; this.T['foot' + side].follow(pos, this._dt, 20); this.footYaw[i] = yaw; this.footPitch[i] = pitch; if (knee) this.kneePole[i].copy(knee); }

  lookAt(p, o = {}) {
    let pp = p, roll = o.roll || 0; const ha = this.headAct, sp = this.talking ? this.mv.jaw.p : 0;
    if (ha || this.talking) {                                          // cabeceos: asentir/negar/ladear + vaivén al hablar
      const d = Math.max(.7, p.distanceTo(this.eyeW)); let nod = this.talking ? Math.sin(this.t * 4.1 + this.spec.seed) * .022 + sp * .045 : 0, shake = 0;
      if (ha) { const u = (this.t - ha.t0) / ha.dur; if (u >= 1 || u < 0) this.headAct = null; else { const env = Math.sin(u * Math.PI) ** .6, w = Math.sin(u * Math.PI * 2 * ha.n);
        if (ha.type === 'nod') nod -= w * .17 * env; else if (ha.type === 'shake') shake = w * .24 * env; else if (ha.type === 'tilt') roll += .28 * env; else if (ha.type === 'up') nod += .12 * env; } }
      pp = p.clone().addScaledVector(V3(0, 1, 0), nod * d).addScaledVector(this.Wdir(1, 0, 0), shake * d);
    }
    this.T.look.follow(pp, this._dt, o.w ?? 9); Object.assign(this.lookOpts, { maxYaw: 1.2, maxPitch: .6, share: .4, roll: 0, pitchBias: 0 }, o, { roll });
  }
  express(o = {}) { Object.assign(this.exT, o); }
  say(dur) { this.talkT = dur; }
  /* frase con sincronía labial. o: { gest:'talk'|'open'|'up'|'point'|'dismiss'|'chop'|'none', target:Vector3, mood:{smile,browUp,frown,browAngry,oh}, energy, head:'nod'|'shake'|'tilt' } */
  speak(text, dur, o = {}) {
    const delay = o.delay ?? .3;                                                        // fase previa: toma aire, mira al interlocutor y abre un poco la boca antes de la primera sílaba
    this.vis = { t0: this.t + delay, dur, ev: visemes(text, dur), t00: this.t }; this.vi = 0; this._lastVi = -1; this.talking = true; this.energy = o.energy ?? 1;
    this.gx.type = o.gest || 'talk'; this.gx.on = this.gx.type !== 'none'; this.gx.t0 = this.t; this.gx.target = o.target || null;
    this.moodT = this.t + dur + .5; Object.assign(this.mood, { smile: 0, browUp: 0, frown: 0, browAngry: 0, oh: 0 }, o.mood || {});
    if (o.head) this.react(o.head);
  }
  stopSpeak() { this.vis = null; this.gx.on = false; this.moodT = 0; }
  laughAt(dur = 2) { this.laughUntil = Math.max(this.laughUntil, this.t + dur); }
  /* gestos de cabeza: nod (asentir), shake (negar), tilt (ladear), laugh */
  react(type, n = 2, dur = 1.1) { if (type === 'laugh') return this.laughAt(dur + 1); this.headAct = { type, t0: this.t, dur, n: type === 'nod' ? n : n + 1 }; }

  /* --------- pose completa (cadera, columna, piernas, brazos) con correcciones de contacto `c` --------- */
  _solveLegacy(c) {
    const hm = this.human, b = hm.b, hp = this.hip;
    const ch = c.hip.clone().applyQuaternion(this.root.getWorldQuaternion(_qa).invert());     // la corrección de contacto viene en MUNDO; la cadera vive en el espacio local del actor
    b.hips.position.set(hp.x + ch.x, hp.y + ch.y, hp.z + ch.z + this.restHipZ);
    b.hips.quaternion.setFromEuler(_e.set(hp.pitch, hp.yaw, hp.roll));
    const br = Math.sin(this.t * 1.35 + this.spec.seed) * this.breathe, P = this.spinePitch.p + this.chestPitch.p + this.bob, Yw = this.chestYaw.p, R = this.chestRoll.p;
    const sp = [.28, .36, .36];
    [b.spine, b.spine2, b.chest].forEach((bone, i) => { bone.quaternion.setFromEuler(_e.set(P * sp[i] + br * (i === 2 ? .008 : .003), Yw * sp[i], R * sp[i])); });
    b.clavL.quaternion.setFromEuler(_e.set(0, 0, br * .01)); b.clavR.quaternion.setFromEuler(_e.set(0, 0, -br * .01));
    hm.scene.updateMatrixWorld(true);
    for (const [i, sd] of [[0, 'L'], [1, 'R']]) {
      const thigh = i ? b.thighR : b.thighL, shin = i ? b.shinR : b.shinL, foot = i ? b.ankleR : b.ankleL;
      const tgt = this.T['foot' + sd].p.clone().add(c['foot' + sd]);
      const pole = this.kneePole[i].lengthSq() ? this.kneePole[i] : this.W((i ? -.18 : .18), 1, .8);
      hm.ik2(thigh, shin, foot, tgt, pole);
      const qf = new THREE.Quaternion().setFromEuler(_e.set(this.footPitch[i], this.footYaw[i], 0)).premultiply(this.root.getWorldQuaternion(_qa));
      hm.setWorldQuat(foot, qf);
    }
    for (const [sd, ux, lx, hd, s] of [['L', b.uArmL, b.lArmL, b.wristL, 1], ['R', b.uArmR, b.lArmR, b.wristR, -1]]) {
      const tgt = this.T['hand' + sd].p.clone().add(c['hand' + sd]), h = this.hand[sd];
      const pole = h.pole.lengthSq() ? h.pole : this.W(s * .45, .9, -.35, V3());
      hm.ik2(ux, lx, hd, tgt, pole);
      hm.orientHand(sd.toLowerCase(), h.fing, h.palm);
    }
  }

  /* pose completa con restricciones anatómicas (ver anatomy.js): columna limitada, gravedad sobre la cadera, piernas y brazos con IK + bisagra + colisión */
  _solve(c) {
    const an = this.anat; if (!an.on) return this._solveLegacy(c);
    const hm = this.human, b = hm.b, hp = this.hip, rq = this.root.getWorldQuaternion(_qa);
    const ch = c.hip.clone().add(an.bal).applyQuaternion(rq.clone().invert());               // correcciones de contacto y equilibrio vienen en MUNDO; la cadera vive en el espacio local del actor
    b.hips.position.set(hp.x + ch.x, hp.y + ch.y, hp.z + ch.z + this.restHipZ);
    b.hips.quaternion.setFromEuler(_e.set(hp.pitch, hp.yaw, hp.roll));
    const br = Math.sin(this.t * 1.35 + this.spec.seed) * this.breathe, P = this.spinePitch.p + this.chestPitch.p + this.bob + an.react.pitch, Yw = this.chestYaw.p, R = this.chestRoll.p + an.react.roll;
    const sp = [.28, .36, .36];
    [b.spine, b.spine2, b.chest].forEach((bone, i) => { bone.quaternion.setFromEuler(_e.set(P * sp[i] + br * (i === 2 ? .008 : .003), Yw * sp[i], R * sp[i])); });
    an.constrainSpine();
    hm.scene.updateMatrixWorld(true);
    const ft = { L: this.T.footL.p.clone().add(c.footL), R: this.T.footR.p.clone().add(c.footR) };
    const drop = Math.max(an.legDrop('L', ft.L), an.legDrop('R', ft.R));                     // gravedad: si la pierna no llega, la cadera baja hasta que los pies apoyen
    if (drop > 0) { b.hips.position.y -= drop; hm.scene.updateMatrixWorld(true); }
    an.floorY = this.root.matrixWorld.elements[13]; an.prepBody();
    for (const [i, sd] of [[0, 'L'], [1, 'R']]) {
      const foot = i ? b.ankleR : b.ankleL, pole = this.kneePole[i].lengthSq() ? this.kneePole[i] : this.W((i ? -.18 : .18), 1, .8);
      const qf = new THREE.Quaternion().setFromEuler(_e.set(this.footPitch[i], this.footYaw[i], 0)).premultiply(rq);
      an.solveLeg(sd, ft[sd], pole, qf); an.refreshLeg(sd); void foot;
    }
    for (const [sd, s] of [['L', 1], ['R', -1]]) {
      const tgt = this.T['hand' + sd].p.clone().add(c['hand' + sd]), h = this.hand[sd];
      an.solveArm(sd, tgt, h.pole.lengthSq() ? h.pole : this.W(s * .45, .9, -.35, V3()), h.fing, h.palm, br);
    }
  }

  _applyFace() {
    const H = this.head, e = H.ex, hm = this.human;
    hm.express({ smile: e.smile, jaw: e.jaw, oh: e.oh, frown: e.frown, browUp: e.browUp, browAngry: e.browAngry, blink: e.blink, laugh: this.laugh || 0 });
    hm.eyes(e.look.x, e.look.y);
  }

  update(t, dt, env = {}) {
    this._dt = dt = Math.max(1e-4, Math.min(dt, 1 / 20)); const jump = t < this.anat.lastT - .3 || t > this.anat.lastT + 1.5; this.anat.lastT = t; if (jump && !this.anat.warm) this.anat.timeJump(false); this.t = t; this.anat.dt = dt; this.anat.frame++; const hm = this.human, b = hm.b;
    /* (1) el comportamiento escribe los objetivos */
    if (this.behavior) this.behavior(t, dt, env);
    /* (2) pose + contacto físico (basado en posiciones): medimos penetraciones y empujamos */
    const c = this.corr; for (const k of Object.keys(c)) c[k].set(0, 0, 0);
    this.root.updateMatrixWorld(true);
    this.anat.balance(dt, sstep(.82, .95, this.hip.y / this.restHipY)); this.anat.compensate(dt);     // equilibrio (de pie) y contra-inclinación por el peso de los brazos
    this._solve(c);
    if (this.colliders) this.colliders.resolve(this, c);
    if (this.anat.on) { this.anat.limitRates(dt, 'body'); this.anat.postRate(); hm.scene.updateMatrixWorld(true); }         // inercia: ninguna articulación gira de golpe
    for (const h of [this.handL, this.handR]) { /* dedos */ }
    this.handL.pose(this.hand.L.c, this.hand.L.th, this.hand.L.spread); this.handR.pose(this.hand.R.c, this.hand.R.th, this.hand.R.spread);
    if (this.fingerT) for (const sd of ['L', 'R']) { const T = this.fingerT[sd]; if (T && T.w > .01) hm.reachFinger(sd.toLowerCase(), 1, T.p, T.w, .022); }      // índices sobre los gatillos
    if (this.thumbT) for (const sd of ['L', 'R']) { const T = this.thumbT[sd]; if (T && T.w > .01) hm.reachThumb(sd.toLowerCase(), T.p, T.w); }      // pulgares sobre botones/palancas (mando)
    /* (3) cabeza: mirada + vida */
    hm.scene.updateMatrixWorld(true);
    this.headRoll.follow(this.lookOpts.roll || 0, dt, 6);
    hm.look(this.T.look.p, { ...this.lookOpts, roll: this.headRoll.p });
    if (this.anat.on) { this.anat.constrainHead(); this.anat.limitRates(dt, 'head'); this.anat.finish(dt); }
    const H = this.head, ex = H.ex, e = this.ex;
    for (const kx of ['smile', 'oh', 'frown', 'browUp', 'browAngry']) e[kx] += (this.exT[kx] - e[kx]) * (1 - Math.exp(-dt * 9));
    this.talkT = Math.max(0, this.talkT - dt);
    const talking = this.talkT > 0 ? 1 : 0; this.talk += (talking - this.talk) * (1 - Math.exp(-dt * 12));
    // --- habla con sincronía labial ---
    let tj = 0, to = 0, ts = 0;
    if (this.vis) {
      const tt = t - this.vis.t0, ev = this.vis.ev; while (this.vi < ev.length - 1 && tt > ev[this.vi].t1) this.vi++; while (this.vi > 0 && tt < ev[this.vi].t0) this.vi--;
      const cur = ev[this.vi]; if (cur && tt >= cur.t0 && tt <= cur.t1 + .02) { const k = this.energy; tj = cur.jaw * k * (.9 + .2 * Math.sin(this.vi * 2.3)); to = cur.oh; ts = cur.smile;
        if (this.vi !== this._lastVi) { this._lastVi = this.vi; if (cur.press >= .6 && cur.w >= 1.25 && this.vi > 4 && !this.headAct && this.vi % 2 === 0) this.react('nod', 1, .5); } }      // en las comas/pausas hace un pequeño cabeceo de énfasis
      else if (tt < 0) { tj = .13; this._inh = Math.sin(Math.PI * clamp(1 + tt / Math.max(.05, this.vis.t0 - this.vis.t00), 0, 1)) * .012; }          // inhalación previa
      if (tt > this.vis.dur + .1) { this.vis = null; this.gx.on = false; }
    }
    this.talking = !!this.vis;
    const mv = this.mv; mv.jaw.follow(tj, dt, 34); mv.oh.follow(to, dt, 30); mv.smile.follow(ts, dt, 26);
    this.gx.w += ((this.gx.on && this.gestSide ? 1 : 0) - this.gx.w) * (1 - Math.exp(-dt * (this.gx.on ? 5 : 3.2)));
    this.moodW += ((t < this.moodT ? 1 : 0) - this.moodW) * (1 - Math.exp(-dt * 4));
    // risa: mandíbula que bota, sonrisa, ojos entornados y hombros que sacuden
    this.laughV += ((t < this.laughUntil ? 1 : 0) - this.laughV) * (1 - Math.exp(-dt * 8)); const lf = this.laughV, lj = lf * (.3 + .28 * Math.sin(t * 13.5));
    this.bob = (this._inh || 0) + lf * Math.sin(t * 15) * .022 + (this.talking ? mv.jaw.p * .012 : 0); this._inh = 0;
    const syl = talking ? Math.max(0, Math.sin(t * 17 + Math.sin(t * 5) * 2)) * (.55 + .45 * Math.sin(t * 7.3)) : 0, md = this.mood, mw = this.moodW;
    ex.jaw = clamp(this.talk * syl * .75 + mv.jaw.p + lj + (this.exT.jaw || 0), 0, 1);
    ex.smile = clamp(e.smile + md.smile * mw + mv.smile.p * .55 + lf * .9, 0, 1);
    ex.oh = clamp(e.oh + this.talk * (.10 + .08 * Math.sin(t * 9)) * (1 - e.smile) + mv.oh.p * .9 + md.oh * mw, 0, 1);
    ex.frown = clamp(e.frown + md.frown * mw, 0, 1);
    ex.browUp = clamp(e.browUp + this.talk * .12 * Math.sin(t * 6) + md.browUp * mw + mv.jaw.p * .16 * (this.talking ? 1 : 0) + lf * .3, -.3, 1); ex.browAngry = clamp(e.browAngry + md.browAngry * mw, 0, 1);
    this.laugh = lf;
    this.blinkT -= dt; if (this.blinkT <= 0) { this.blink = 1; this.blinkT = 2.2 + Math.random() * 4; }
    this.blink = Math.max(0, this.blink - dt * 7.5); ex.blink = Math.max(Math.sin(Math.min(1, this.blink) * Math.PI), this.exT.eyesClosed || 0, lf * .55);
    this.sacc -= dt; if (this.sacc <= 0) { this.sacc = .5 + Math.random() * 1.6; this.saccV.set((Math.random() - .5) * .07, (Math.random() - .5) * .05); }
    const hd = H.root.worldToLocal(this.T.look.p.clone()); const ang = Math.atan2(hd.x, hd.z), pit = -Math.atan2(hd.y - H.ey, Math.hypot(hd.x, hd.z));
    ex.look.set(clamp(ang, -.5, .5) * .5 + this.saccV.x, clamp(pit, -.4, .4) * .5 + this.saccV.y);
    H.update();
    /* referencias útiles para efectos/UI */
    this.root.updateMatrixWorld(true);
    H.root.localToWorld(this.anchorHead.set(0, H.cy + H.hh * 1.35 + .05, 0)); H.root.localToWorld(this.mouthWorld.copy(H.mouth));
    H.root.localToWorld(this.eyeW.set(0, H.ey, H.hd * .9));
    b.wristL.getWorldPosition(this.handWorld.L); b.wristR.getWorldPosition(this.handWorld.R); b.chest.getWorldPosition(this.chestW);
    if (this.post) this.post(t, dt);
    if (this.attn && t > this.attn.until) this.attn = null;
  }
}
