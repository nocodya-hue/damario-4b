/* =========================================================
   ANATOMÍA — restricciones reales para TODOS los personajes (regla permanente)
   Se crea sola en cada Actor (actor.anat); cualquier personaje nuevo la hereda sin tocar nada.

   Prioridad (de mayor a menor):  1 anatomía · 2 sin penetraciones · 3 articulaciones en rango ·
                                  4 equilibrio y gravedad · 5 movimiento natural · 6 obedecer la animación.
   La animación pide objetivos (mano, pie, mirada…); aquí se resuelven SIN poder violar las reglas de arriba:
   si un objetivo exige algo imposible, el resultado se aleja del objetivo lo mínimo (nunca al revés).

   1. Límites articulares (LIMITS): hombro (cono de elevación según el plano), giro del húmero, codo (bisagra 0–148°,
      sin hiperextensión), pronación/supinación repartida antebrazo+muñeca, muñeca (flexión, extensión, desviaciones),
      cadera, rodilla (bisagra hacia atrás), tobillo, columna, cuello, cabeza y clavículas.
   2. IK de dos huesos con objetivo de codo/rodilla (pole): el codo se busca sobre el círculo de giro (swivel) que
      cumple hombro + giro del húmero + no atravesar el cuerpo; la mano NO se obtiene rotando el brazo por su cuenta.
      El codo es una bisagra de verdad: el antebrazo solo gira sobre su eje (rodillo), nunca en direcciones imposibles.
   3. Autocolisión con volúmenes ajustados a la malla de cada cuerpo (cápsulas elípticas de torso, elipsoide de cabeza,
      cápsulas de cuello, brazos, muslos y piernas): brazo/mano no atraviesan torso, pecho ni cabeza; piernas entre sí y
      con el abdomen; las suelas no atraviesan el suelo. Se resuelve DENTRO de la IK (antes de que ocurra).
   4. Deformación: la clavícula acompaña al brazo al elevarlo (ritmo escapulohumeral) para que el hombro no colapse, el
      codo es una bisagra pura y la torsión del antebrazo se reparte con la muñeca (sin "envoltorio de caramelo").
   5. Física: velocidad angular máxima por articulación (aceleración; sin giros instantáneos), gravedad sobre la cadera
      (los pies mandan si la pierna no llega), equilibrio del centro de masas sobre el polígono de apoyo y pequeñas
      compensaciones del torso cuando el brazo carga el peso.
   6. Validación: anat.check() mide el estado FINAL del esqueleto (independiente del solver) y acumula violaciones;
      window.__anatAudit() recorre la historia fotograma a fotograma (ver main.js).
   ========================================================= */
import * as THREE from 'three';

const D = Math.PI / 180, PI = Math.PI, TAU = Math.PI * 2;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Qn = () => new THREE.Quaternion();
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const wrapPi = (a) => { a %= TAU; if (a > PI) a -= TAU; else if (a <= -PI) a += TAU; return a; };
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* ---------------------------------------------------------------- LÍMITES (grados) */
export const LIMITS = {
  /* hombro: θ = separación máxima del brazo respecto a "colgando" en cada plano de elevación φ
     (φ 0 = hacia delante, 90 = lateral, 180 = hacia atrás, −90 = cruzando el pecho); twist = giro del húmero sobre su eje */
  shoulder: { knots: [[-180, 55], [-135, 60], [-100, 100], [-60, 140], [0, 175], [90, 175], [135, 115], [180, 55]], twist: [-115, 115] },
  elbow: { max: 148 },                                   // flexión 0–148°: nunca hiperextensión ni hacia el lado equivocado
  forearm: { roll: 85 },                                 // pronación/supinación que aporta el antebrazo
  wrist: { flex: 80, ext: 70, radial: 25, ulnar: 40, twist: 22 },
  hip: { knots: [[-180, 20], [-135, 15], [-90, 25], [-45, 80], [0, 125], [45, 112], [90, 55], [135, 32], [180, 20]], twist: [-62, 62] },
  knee: { max: 150 },
  ankle: { x: [-38, 52], y: [-38, 38], z: [-26, 26] },   // dorsiflexión / plantarflexión, rotación, inversión
  spine: { x: [-12, 24], y: [-18, 18], z: [-13, 13] },   // por segmento (×3)
  neck: { x: [-34, 38], y: [-43, 43], z: [-28, 28] },
  head: { x: [-30, 30], y: [-38, 38], z: [-22, 22] },
  neckHeadYaw: 80,                                       // giro total cuello+cabeza
  clav: { x: [-10, 12], y: [-16, 16], z: [-26, 26] },
  tol: 1.0,                                              // tolerancia de la validación (°)
};
/* velocidad angular máxima por articulación (rad/s): inercia — nada gira de golpe */
const OMEGA = { spine: 3.6, neck: 7, head: 10, clav: 3.2, uarm: 9, farm: 12, hand: 16, thigh: 5.5, calf: 8.5, foot: 10 };
const omegaOf = (n) => n.startsWith('spine') ? OMEGA.spine : n.startsWith('neck') ? OMEGA.neck : n === 'head' ? OMEGA.head : n.startsWith('clav') ? OMEGA.clav : n.startsWith('upperarm') ? OMEGA.uarm
  : n.startsWith('lowerarm') ? OMEGA.farm : n.startsWith('hand') ? OMEGA.hand : n.startsWith('thigh') ? OMEGA.thigh : n.startsWith('calf') ? OMEGA.calf : n.startsWith('foot') ? OMEGA.foot : 0;

const curve = (knots, deg) => {
  const a0 = knots[0], b0 = knots[knots.length - 1];
  if (deg <= a0[0]) return a0[1]; if (deg >= b0[0]) return b0[1];
  for (let i = 1; i < knots.length; i++) if (deg <= knots[i][0]) { const a = knots[i - 1], b = knots[i]; return a[1] + (b[1] - a[1]) * (deg - a[0]) / (b[0] - a[0]); }
  return b0[1];
};
const _bm = new THREE.Matrix4(), _bc = V();
const basisQuat = (a, b, out) => { _bc.crossVectors(a, b); _bm.makeBasis(a, b, _bc); return out.setFromRotationMatrix(_bm); };
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const perc = (arr, p) => { if (!arr.length) return 0; arr.sort((x, y) => x - y); return arr[Math.min(arr.length - 1, Math.floor(arr.length * p))]; };

/* recorta la rotación local de un hueso (Euler YXZ respecto al reposo, que es la identidad en estos rigs). true si tuvo que corregir */
function clampEuler(bone, lim) {
  _e.setFromQuaternion(bone.quaternion, 'YXZ');
  const x = clamp(_e.x, lim.x[0] * D, lim.x[1] * D), y = clamp(_e.y, lim.y[0] * D, lim.y[1] * D), z = clamp(_e.z, lim.z[0] * D, lim.z[1] * D);
  if (Math.abs(x - _e.x) + Math.abs(y - _e.y) + Math.abs(z - _e.z) < 1e-6) return false;
  bone.quaternion.setFromEuler(_e.set(x, y, z, 'YXZ')); return true;
}
const eulerExcess = (bone, lim) => {
  _e.setFromQuaternion(bone.quaternion, 'YXZ');
  return Math.max(lim.x[0] * D - _e.x, _e.x - lim.x[1] * D, lim.y[0] * D - _e.y, _e.y - lim.y[1] * D, lim.z[0] * D - _e.z, _e.z - lim.z[1] * D);
};

/* =========================================================================================
   EXTREMIDAD DE DOS HUESOS (brazo o pierna): raíz (hombro/cadera) → medio (codo/rodilla) → final (muñeca/tobillo)
   El codo/rodilla es una BISAGRA cuyo eje sale de la geometría de reposo del rig (hRest, + = flexión).
   ========================================================================================= */
class Limb {
  constructor(an, cfg) {
    Object.assign(this, cfg); this.an = an;
    const hm = an.hm;
    this.L1 = this.mid.position.length(); this.L2 = this.end.position.length();
    this.rU = hm.restDir[this.root.name].clone(); this.rF = hm.restDir[this.mid.name].clone();
    this.hRest = V().crossVectors(this.rU, this.rF).normalize();
    this.betaRest = Math.acos(clamp(this.rU.dot(this.rF), -1, 1));
    this.Qr = basisQuat(this.rU, this.hRest, Qn()).invert();
    this.betaMax = (cfg.kind === 'arm' ? LIMITS.elbow.max : LIMITS.knee.max) * D;
    this.dMin = Math.max(Math.abs(this.L1 - this.L2) + .004, Math.sqrt(this.L1 ** 2 + this.L2 ** 2 + 2 * this.L1 * this.L2 * Math.cos(this.betaMax)));
    this.dMax = this.L1 + this.L2 - .002;
    this.knots = cfg.kind === 'arm' ? LIMITS.shoulder.knots : LIMITS.hip.knots;
    const tw = cfg.kind === 'arm' ? LIMITS.shoulder.twist : LIMITS.hip.twist; this.twMin = tw[0] * D; this.twMax = tw[1] * D;
    this.dg = 0; this._g = 0; this.lastBest = -1e9; this._sw = -1; this.phase = { armL: 0, armR: 2, legL: 1, legR: 3 }[cfg.name];
    this.fix = { shoulder: 0, twist: 0, elbow: 0, reach: 0, swivel: 0, pen: 0, wrist: 0, roll: 0, foot: 0 };
    this.A = V(); this.E = V(); this.W = V(); this.u = V(); this.f = V(); this.n = V();
    this.Fq = Qn(); this.Fi = Qn(); this.Pq = Qn(); this.Qu = Qn(); this.Qf0 = Qn();
    this.beta = 0; this.psi = 0; this.theta = 0; this.phi = 0;
    this._v = V(); this._nF = V(); this._h = V(); this._q = Qn(); this._ex = V(); this._ey = V(); this._ax = V(); this._pv = V(); this._t = V(); this._vF = V(); this._fd = V(); this._ang = {};
    this._pn = V(); this._viol = 0; this._pen = 0; this.hook = null;
  }

  angles(uWorld, out) {                              // θ y φ del segmento superior en el marco del tronco/pelvis
    const v = this._v.copy(uWorld).applyQuaternion(this.Fi);
    out.theta = Math.acos(clamp(-v.y, -1, 1)); out.phi = Math.atan2(v.x * this.s, v.z); out.v = v; return out;
  }
  thetaMax(phi) { return curve(this.knots, phi / D) * D; }

  /* giro del húmero/fémur: ángulo (con signo) entre la bisagra "neutra" para esta dirección (mínimo arco desde el reposo) y la real */
  twistOf(vF, nF) {
    this._q.setFromUnitVectors(this.rU, vF); const hN = this._h.copy(this.hRest).applyQuaternion(this._q);
    return Math.atan2(this._t.crossVectors(hN, nF).dot(vF), hN.dot(nF));
  }

  /* evalúa un giro (swivel) g: deja E/u/f/n/psi/theta y devuelve el coste */
  _eval(g, pen) {
    const { A, _ax: ax, _ex: ex, _ey: ey, L1, L2 } = this, cg = Math.cos(g), sg = Math.sin(g), k = L1 * this._sa;
    this.E.copy(A).addScaledVector(ax, L1 * this._ca).addScaledVector(ex, k * cg).addScaledVector(ey, k * sg);
    this.u.copy(this.E).sub(A).multiplyScalar(1 / L1); this.f.copy(this.W).sub(this.E).multiplyScalar(1 / L2);
    const an = this.angles(this.u, this._ang), excess = Math.max(0, an.theta - this.thetaMax(an.phi));
    this.n.crossVectors(this.u, this.f); const sb = this.n.length(); let psi = 0, tv = 0;
    if (sb > 1e-3) { this.n.multiplyScalar(1 / sb); this._nF.copy(this.n).applyQuaternion(this.Fi); psi = this.twistOf(an.v, this._nF); tv = Math.max(0, this.twMin - psi, psi - this.twMax); }
    this.theta = an.theta; this.phi = an.phi; this.psi = psi;
    const p = pen ? pen(this, this.E, this.W) : 0, hx = (this.hook && sb > 1e-3) ? this.hook(this, sb) : 0;        // hx: lo que la muñeca/pronación tendría que exceder para dar la orientación de mano pedida
    this._viol = excess + tv + hx; this._pen = p;
    return excess * 10 + tv * 8 + hx * 6 + p * 300 + Math.abs(g) * .02;
  }
  _ok() { return this._viol < 1e-4 && this._pen < .003; }

  /* estado REAL de los huesos → exceso del cono del hombro/cadera, del giro y de la flexión (rad); posiciones A/E/W en mundo */
  measure(out = {}) {
    this.root.getWorldPosition(this.A); this.mid.getWorldPosition(this.E); this.end.getWorldPosition(this.W); this.frame.getWorldQuaternion(this.Fq); this.Fi.copy(this.Fq).invert();
    const u = this._mu ||= V(), f = this._mf ||= V(), n = this._mn ||= V(); u.copy(this.E).sub(this.A).normalize(); f.copy(this.W).sub(this.E).normalize();
    const an = this.angles(u, this._ang); out.theta = an.theta; out.ex = an.theta - this.thetaMax(an.phi);
    out.beta = Math.acos(clamp(u.dot(f), -1, 1)); out.twEx = 0; out.hinge = 0;
    if (out.beta > .17) {
      n.crossVectors(u, f).normalize(); const hw = (this._mh ||= V()).copy(this.hRest).applyQuaternion(this.root.getWorldQuaternion(this._mq ||= Qn())); out.hinge = Math.acos(clamp(n.dot(hw), -1, 1));
      const psi = this.twistOf(an.v, this._nF.copy(n).applyQuaternion(this.Fi)); out.twEx = Math.max(this.twMin - psi, psi - this.twMax, 0);
    }
    return out;
  }

  /* resuelve la extremidad para un objetivo y un pole (mundo). Escribe las rotaciones de raíz y medio (bisagra). */
  solve(target, pole, pen) {
    const { A, W, _ax: ax, _ex: ex, _ey: ey, L1, L2 } = this;
    this.root.getWorldPosition(A); this.frame.getWorldQuaternion(this.Fq); this.Fi.copy(this.Fq).invert();
    ax.copy(target).sub(A); const dist = ax.length(); ax.multiplyScalar(1 / Math.max(dist, 1e-6));
    const reach = clamp(dist, this.dMin, this.dMax); if (Math.abs(reach - dist) > 1e-4) this.fix.reach++;
    W.copy(A).addScaledVector(ax, reach);
    this._ca = clamp((L1 * L1 + reach * reach - L2 * L2) / (2 * L1 * reach), -1, 1); this._sa = Math.sqrt(1 - this._ca * this._ca);
    const pv = this._pv.copy(pole).sub(A); pv.addScaledVector(ax, -pv.dot(ax));
    if (pv.lengthSq() < 1e-6) { pv.set(this.kind === 'arm' ? this.s * .5 : this.s * .2, -1, this.kind === 'arm' ? -.4 : .6); pv.addScaledVector(ax, -pv.dot(ax)); }
    if (pv.lengthSq() < 1e-8) pv.set(0, 1, 0).addScaledVector(ax, -ax.y);
    ex.copy(pv).normalize(); ey.crossVectors(ax, ex);
    // 1) giro óptimo: el más cercano al que pide el pole que cumpla hombro + giro del húmero + no atravesar el cuerpo + muñeca.
    //    Arranque en caliente (el del fotograma anterior) y barrido grueso→fino: casi siempre bastan 1-2 evaluaciones.
    const prev = this.dg; let best = this._eval(prev, pen), bg = prev;
    const good = () => this._ok() || best <= this.lastBest + .02;                          // válido, o tan bueno como lo que ya se logró (p. ej. muñeca inalcanzable de forma persistente)
    const fr = this.an.frame, sweepNow = fr !== this._sw && (fr + this.phase) % 6 === 0; if (sweepNow) this._sw = fr;        // cada 6 fotogramas se re-explora el círculo entero (evita quedarse en un mínimo local)
    let done = good() && !sweepNow;
    if (Math.abs(prev) > .02) { const c0 = this._eval(0, pen); if (c0 <= best || (this._ok() && done)) { best = c0; bg = 0; } done = (done || good()) && !sweepNow; }   // volver al pole cuando es posible
    if (!done) {
      for (const g of [45, -45, 90, -90, 135, -135, 180].map(x => x * D)) { const c = this._eval(g, pen); if (c < best) { best = c; bg = g; } }
      for (const dgm of [-20 * D, 20 * D, -10 * D, 10 * D]) { const g = bg + dgm, c = this._eval(g, pen); if (c < best) { best = c; bg = g; } }
    }
    this.lastBest = best;
    // 2) continuidad: el giro cambia como mucho .09 rad por fotograma si el intermedio es válido (el codo no salta)
    const mv = prev + clamp(bg - prev, -.09, .09);
    if (Math.abs(mv - bg) > 1e-4) { this._eval(mv, pen); if (this._ok()) bg = mv; }
    this._g = bg; this._eval(bg, pen); if (Math.abs(bg) > 1e-3) this.fix.swivel++;
    this._assemble();
  }

  /* fase final: recorta hombro/giro/codo sobre la solución elegida (no hace nada si ya cumple) y escribe las rotaciones */
  _assemble() {
    const { A, E, W, u, n, L1, L2, Fq, Fi, _vF: vF, _fd: fd, _nF: nF } = this;
    const an = this.angles(u, this._ang), tm = this.thetaMax(an.phi);
    if (an.theta > tm + 1e-4) {                                   // hombro/cadera: recorta θ al cono permitido
      this.fix.shoulder++; const s2 = Math.sin(tm);
      an.v.set(s2 * Math.sin(an.phi) * this.s, -Math.cos(tm), s2 * Math.cos(an.phi));
    }
    vF.copy(an.v).normalize(); u.copy(vF).applyQuaternion(Fq); E.copy(A).addScaledVector(u, L1);
    fd.copy(W).sub(E); if (fd.lengthSq() < 1e-8) fd.copy(u); fd.normalize();
    n.crossVectors(u, fd); const sb = n.length();
    if (sb > 1e-3) { n.multiplyScalar(1 / sb); nF.copy(n).applyQuaternion(Fi); }
    else { this._q.setFromUnitVectors(this.rU, vF); nF.copy(this.hRest).applyQuaternion(this._q); n.copy(nF).applyQuaternion(Fq); }
    let psi = this.twistOf(vF, nF); const psi0 = psi; psi = clamp(psi, this.twMin, this.twMax);
    if (Math.abs(psi - psi0) > 1e-4) {                            // giro fuera de rango: gira la bisagra hasta el límite y proyecta el antebrazo sobre su plano
      this.fix.twist++; nF.applyAxisAngle(vF, psi - psi0); n.copy(nF).applyQuaternion(Fq);
      fd.addScaledVector(n, -fd.dot(n)); if (fd.lengthSq() < 1e-8) fd.copy(u); fd.normalize();
    }
    let beta = Math.atan2(this._t.crossVectors(u, fd).dot(n), u.dot(fd));   // flexión 0..βmax, solo en el sentido positivo de la bisagra
    if (beta < 0) { beta = 0; this.fix.elbow++; } else if (beta > this.betaMax) { beta = this.betaMax; this.fix.elbow++; }
    fd.copy(u).applyAxisAngle(n, beta); this.beta = beta; this.psi = psi;
    W.copy(E).addScaledVector(fd, L2); this.f.copy(fd);
    basisQuat(u, n, this.Qu).multiply(this.Qr);                   // orientación mundo del hueso raíz: eje del hueso → u, eje de bisagra → n
    this.root.parent.getWorldQuaternion(this.Pq); this._q.copy(this.Pq).invert().multiply(this.Qu); this.root.quaternion.copy(this._q);
    this.mid.quaternion.setFromAxisAngle(this.hRest, beta - this.betaRest);
    this.Qf0.copy(this.Qu).multiply(this.mid.quaternion);         // orientación mundo del antebrazo/pierna antes del rodillo
    this.root.updateMatrixWorld(true);
  }
}

/* =========================================================================================
   ANATOMÍA DEL PERSONAJE
   ========================================================================================= */
export class Anatomy {
  constructor(actor) {
    this.A = actor; this.hm = actor.human; this.b = this.hm.b; this.on = !new URLSearchParams(location.search).has('noanat'); this.margin = .006;      // ?noanat = comparar con la IK antigua
    const b = this.b;
    this.limbs = {
      armL: new Limb(this, { name: 'armL', kind: 'arm', s: 1, root: b.uArmL, mid: b.lArmL, end: b.wristL, frame: b.chest }),
      armR: new Limb(this, { name: 'armR', kind: 'arm', s: -1, root: b.uArmR, mid: b.lArmR, end: b.wristR, frame: b.chest }),
      legL: new Limb(this, { name: 'legL', kind: 'leg', s: 1, root: b.thighL, mid: b.shinL, end: b.ankleL, frame: b.hips }),
      legR: new Limb(this, { name: 'legR', kind: 'leg', s: -1, root: b.thighR, mid: b.shinR, end: b.ankleR, frame: b.hips }),
    };
    this._prepWrist(); this._fit();
    this.prevQ = new Map(); this.rateFix = 0; this.first = true; this.dt = 0; this.preFix = false; this.frame = 0; this.skip = 0; this.warm = false; this.lastT = 0;
    this.stats = { frames: 0, viol: {}, worst: {}, fix: {}, limit: {}, pr: {} }; this.audit = false; this.lastViol = {};
    this.body = null; this.bal = V(); this._balS = { x: 0, z: 0, vx: 0, vz: 0 }; this.react = { roll: 0, pitch: 0, vr: 0, vp: 0 };
    this._T = { a: V(), b: V(), c: V(), d: V(), q: Qn() };
    this._sp = V(); this._out = { n: V() }; this._po = { n: V() }; this._tp = { n: V() };
    this.floorY = 0; this.soleClear = Math.max(0, (actor.ankleH || .117) - this.hm.rest.foot_l.y);
  }

  /* ------------------------------------------------------------------ ajuste de volúmenes a la malla del cuerpo */
  _fit() {
    const hm = this.hm, R = hm.rest, body = hm.meshes.body, pos = body.geometry.attributes.position, si = body.geometry.attributes.skinIndex, sw = body.geometry.attributes.skinWeight;
    const names = body.skeleton.bones.map(o => o.name), by = {}, P = V();
    body.updateMatrixWorld(true);
    for (let i = 0; i < pos.count; i++) {
      let bw = 0, bi = 0; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; bi = si.getComponent(i, k); } }
      (by[names[bi]] ||= []).push(P.fromBufferAttribute(pos, i).applyMatrix4(body.matrixWorld).clone());
    }
    const set = (...ns) => ns.flatMap(n => by[n] || []);
    const cap = (a, b, pts, pct = .85, lo = .12, hi = .88) => {      // radio de cápsula: percentil de la distancia al eje
      const ab = b.clone().sub(a), l2 = ab.lengthSq(), d = [];
      for (const p of pts) { const t = p.clone().sub(a).dot(ab) / l2; if (t < lo || t > hi) continue; d.push(p.clone().sub(a).addScaledVector(ab, -t).length()); }
      return d.length > 5 ? perc(d, pct) : .05;
    };
    const rest = (n) => R[n].clone();
    // torso: 3 cápsulas elípticas (semiancho x, semifondo z) centradas en la sección real de la malla
    const segT = (a, b, pts, bone) => {
      const xs = [], zs = []; let zc = 0; for (const p of pts) zc += p.z; zc = pts.length ? zc / pts.length : (a.z + b.z) / 2;
      for (const p of pts) { xs.push(Math.abs(p.x)); zs.push(Math.abs(p.z - zc)); }
      return { a, b, rx: Math.max(.08, perc(xs, .75)), rz: Math.max(.06, perc(zs, .75)), off: zc - (a.z + b.z) / 2, bone };
    };
    const pel = rest('pelvis'); pel.y -= .045;
    const chestTop = rest('spine_03'); chestTop.y = R.spine_03.y + (R.clavicle_l.y - R.spine_03.y) * .68;              // el cuello y los hombros no son "tronco": así la mano llega a la boca
    this.torsoSegs = [
      segT(pel, rest('spine_01'), set('pelvis'), this.b.hips),
      segT(rest('spine_01'), rest('spine_03'), set('spine_01', 'spine_02'), this.b.spine),
      segT(rest('spine_03'), chestTop, set('spine_03'), this.b.chest),
    ];
    this.neckR = Math.max(.045, cap(rest('neck_01'), rest('head'), set('neck_01'), .85, .05, .95)) + this.margin;
    const m = this.margin + .006, rr = {};
    for (const s of ['l', 'r']) {                                                      // radios de cápsula de brazos y piernas (+ margen de tela)
      rr['uarm_' + s] = cap(rest('upperarm_' + s), rest('lowerarm_' + s), set('upperarm_' + s), .6, .3, .85) + m;   // sin el bulto del deltoides
      rr['farm_' + s] = cap(rest('lowerarm_' + s), rest('hand_' + s), set('lowerarm_' + s), .6, .15, .85) + m;
      rr['thigh_' + s] = cap(rest('thigh_' + s), rest('calf_' + s), set('thigh_' + s), .6, .25, .85) + m;
      rr['calf_' + s] = cap(rest('calf_' + s), rest('foot_' + s), set('calf_' + s), .6) + m;
    }
    this.r = rr; this.handR = .03; this.handLen = R.middle_03_l.distanceTo(R.hand_l) + .02;
    const H = hm.H, top = H.cy + H.hh, bot = Math.min(H.cy - H.hh, (H.mouth?.y ?? -.02) - .045);
    this.headE = { cy: (top + bot) / 2, cz: H.cz, rx: H.hw * .92, ry: (top - bot) / 2, rz: H.hd * .92 };   // elipsoide de cabeza (espacio del hueso 'head')
    this.sole = {};                                                                    // puntos más bajos de la suela (talón, laterales, antepié, punta)
    for (const [s, sd] of [['l', 'L'], ['r', 'R']]) {
      const fpos = R['foot_' + s], pts = set('foot_' + s, 'ball_' + s).map(p => p.clone().sub(fpos));
      const zs = pts.map(p => p.z), zmin = Math.min(...zs), zmax = Math.max(...zs), zm = (zmin + zmax) / 2, xs = pts.map(p => p.x).sort((a, b) => a - b), xm = xs[xs.length >> 1];
      const low = (fn) => { let best = null; for (const p of pts) if (fn(p) && (!best || p.y < best.y)) best = p; return best; };
      this.sole[sd] = [low(p => p.z < zm && p.x < xm), low(p => p.z < zm && p.x >= xm), low(p => p.z >= zm && p.x < xm), low(p => p.z >= zm && p.x >= xm), low(p => p.z > zmax - .03)].filter(Boolean);
    }
  }

  /* ejes de la muñeca en el hueso del antebrazo (== ejes de reposo del rig) */
  _prepWrist() {
    this.wr = {};
    for (const [sd, s] of [['L', 'l'], ['R', 'r']]) {
      const H = this.hm.hand[s], f0 = H.fingerRest.clone(), p0 = H.palmRest.clone().addScaledVector(f0, -H.palmRest.dot(f0)).normalize(), z0 = V().crossVectors(f0, p0).normalize();
      const e1 = z0.clone(), e2 = p0.clone();                                          // e1: flexión/extensión · e2: desviación radial/cubital
      this.wr[sd] = { e1, e2, flexSign: Math.sign(V().crossVectors(e1, f0).dot(p0)) || 1, radSign: Math.sign(V().crossVectors(e2, f0).dot(z0)) || 1, a: this.hm.restDir['lowerarm_' + s].clone() };
    }
  }

  /* ------------------------------------------------------------------ el cuerpo en el mundo (para colisiones) */
  prepBody() {
    const b = this.b, T = this._T, body = this.body ||= { torso: [0, 1, 2].map(() => ({ a: V(), b: V(), X: V(), Y: V(), Z: V(), rx: 0, rz: 0, rr: 0, len2: 1 })), head: { c: V(), X: V(), Y: V(), Z: V() }, neckC: { a: V(), b: V(), r: 0 }, thigh: { L: { a: V(), b: V(), r: 0 }, R: { a: V(), b: V(), r: 0 } }, calf: { L: { a: V(), b: V(), r: 0 }, R: { a: V(), b: V(), r: 0 } } };
    b.hips.updateWorldMatrix(true, false);
    for (let i = 0; i < 3; i++) {
      const s = this.torsoSegs[i], o = body.torso[i], q = s.bone.getWorldQuaternion(T.q);
      if (i === 0) { b.hips.getWorldPosition(o.a); o.a.y -= .045; b.spine.getWorldPosition(o.b); }
      else if (i === 1) { b.spine.getWorldPosition(o.a); b.chest.getWorldPosition(o.b); }
      else { b.chest.getWorldPosition(o.a); o.b.set(0, s.b.y - s.a.y, 0).applyQuaternion(q).add(o.a); }
      o.X.set(1, 0, 0).applyQuaternion(q); o.Y.set(0, 1, 0).applyQuaternion(q); o.Z.set(0, 0, 1).applyQuaternion(q);
      o.a.addScaledVector(o.Z, s.off); o.b.addScaledVector(o.Z, s.off);
      o.rx = s.rx; o.rz = s.rz; o.rr = (s.rx + s.rz) * .5; o.len2 = Math.max(1e-6, o.a.distanceToSquared(o.b));
      (o.c ||= V()).copy(o.a).lerp(o.b, .5); o.R = Math.sqrt(o.len2) * .5 + Math.max(s.rx, s.rz);
    }
    const H = this.headE, hb = b.head, hq = hb.getWorldQuaternion(T.q), B = body.head;
    hb.getWorldPosition(B.c); B.X.set(1, 0, 0).applyQuaternion(hq); B.Y.set(0, 1, 0).applyQuaternion(hq); B.Z.set(0, 0, 1).applyQuaternion(hq);
    B.c.addScaledVector(B.Y, H.cy).addScaledVector(B.Z, H.cz); B.R = Math.max(H.rx, H.ry, H.rz);
    b.neck.getWorldPosition(body.neckC.a); hb.getWorldPosition(body.neckC.b); body.neckC.r = this.neckR;
    for (const [sd, th, sh, an] of [['L', b.thighL, b.shinL, b.ankleL], ['R', b.thighR, b.shinR, b.ankleR]]) {
      const t = body.thigh[sd], c = body.calf[sd]; th.getWorldPosition(t.a); sh.getWorldPosition(t.b); t.r = this.r['thigh_' + sd.toLowerCase()];
      c.a.copy(t.b); an.getWorldPosition(c.b); c.r = this.r['calf_' + sd.toLowerCase()];
    }
    return body;
  }

  /* ---- primitivas de penetración: devuelven la profundidad (m) y dejan la normal de salida en out.n ---- */
  _ellCap(p, rp, S, out) {
    const R = S.R + rp; if (p.distanceToSquared(S.c) > R * R) return 0;                                          // fase ancha
    const T = this._T, ab = T.c.copy(S.b).sub(S.a), t = clamp(T.d.copy(p).sub(S.a).dot(ab) / S.len2, 0, 1), o = T.b.copy(p).sub(T.a.copy(S.a).addScaledVector(ab, t));
    const ox = o.dot(S.X), oz = o.dot(S.Z), oy = (t <= 0 || t >= 1) ? o.dot(S.Y) : 0, rx = S.rx + rp, rz = S.rz + rp, ry = S.rr + rp;
    const s2 = (ox / rx) ** 2 + (oz / rz) ** 2 + (oy / ry) ** 2;
    if (s2 >= 1) return 0;
    out.n.set(0, 0, 0).addScaledVector(S.X, ox / (rx * rx)).addScaledVector(S.Z, oz / (rz * rz)).addScaledVector(S.Y, oy / (ry * ry));
    if (out.n.lengthSq() < 1e-12) out.n.copy(S.Z); out.n.normalize();
    return (1 - Math.sqrt(s2)) * Math.min(rx, rz);
  }
  _headPen(p, rp, out) {
    const H = this.headE, B = this.body.head, R = B.R + rp; if (p.distanceToSquared(B.c) > R * R) return 0;
    const o = this._T.b.copy(p).sub(B.c), rx = H.rx + rp, ry = H.ry + rp, rz = H.rz + rp;
    const ox = o.dot(B.X), oy = o.dot(B.Y), oz = o.dot(B.Z), s2 = (ox / rx) ** 2 + (oy / ry) ** 2 + (oz / rz) ** 2;
    if (s2 >= 1) return 0;
    out.n.set(0, 0, 0).addScaledVector(B.X, ox / (rx * rx)).addScaledVector(B.Y, oy / (ry * ry)).addScaledVector(B.Z, oz / (rz * rz)); if (out.n.lengthSq() < 1e-12) out.n.copy(B.Z); out.n.normalize();
    return (1 - Math.sqrt(s2)) * Math.min(rx, ry, rz);
  }
  _capPen(p, rp, C, out, tMin = 0) {
    const T = this._T, ab = T.c.copy(C.b).sub(C.a), l2 = Math.max(1e-8, ab.lengthSq()), t = clamp(T.d.copy(p).sub(C.a).dot(ab) / l2, tMin, 1), o = T.b.copy(p).sub(T.a.copy(C.a).addScaledVector(ab, t)), d = o.length(), need = C.r + rp;
    if (d >= need) return 0;
    if (d < 1e-6) out.n.set(0, 1, 0); else out.n.copy(o).multiplyScalar(1 / d);
    return need - d;
  }

  /* profundidad máxima de un punto (radio rp) contra el tronco, el cuello, la cabeza y los muslos; la normal de salida queda en out.n */
  pointPen(p, rp, out, o) {
    let best = 0; const body = this.body, s = this._tp; this.lastPart = '';
    const test = (d, name) => { if (d > best) { best = d; out.n.copy(s.n); this.lastPart = name; } };
    for (let i = 0; i < 3; i++) test(this._ellCap(p, rp, body.torso[i], s), i === 0 ? 'pelvis' : i === 1 ? 'abdomen' : 'pecho');
    test(this._headPen(p, rp * (o?.headScale ?? 1), s), 'cabeza');
    test(this._capPen(p, rp, body.neckC, s), 'cuello');
    for (const sd of ['L', 'R']) test(this._capPen(p, rp, body.thigh[sd], s, .28), 'muslo' + sd);
    return best;
  }

  /* penetración del brazo candidato (codo E, muñeca W): solo lo que depende del giro del codo. Se llama DENTRO de la búsqueda de la IK. */
  armPenCand(limb, E, W) {
    const A = limb.A, sd = limb.name.slice(3), sl = sd.toLowerCase(), ru = this.r['uarm_' + sl], rf = this.r['farm_' + sl], sp = this._sp, out = this._out;
    let worst = 0, sum = 0;
    const chk = (r) => { const d = this.pointPen(sp, r, out); if (d > worst) { worst = d; limb._pn.copy(out.n); } sum += d; };
    for (const t of [.55, .8, 1]) { sp.copy(A).lerp(E, t); chk(ru); }                    // el arranque del hombro pertenece al tronco: se omite
    for (const t of [.25, .6]) { sp.copy(E).lerp(W, t); chk(rf); }
    const other = this.limbs['arm' + (sd === 'L' ? 'R' : 'L')];                        // entre sí, los antebrazos no se atraviesan
    if (other.W.lengthSq() > 0) { const oc = this._oc ||= { a: null, b: null, r: 0 }; oc.a = other.E; oc.b = other.W; oc.r = this.r['farm_' + (sd === 'L' ? 'r' : 'l')];
      for (const t of [.25, .6, 1]) { sp.copy(E).lerp(W, t); const d = this._capPen(sp, rf, oc, out); if (d > worst) { worst = d; limb._pn.copy(out.n); } sum += d; } }
    return worst + sum * .15;
  }
  /* penetración completa del brazo (final): candidato + muñeca + mano con la orientación REAL de los dedos */
  armPen(limb, E, W, fing) {
    const sd = limb.name.slice(3), sl = sd.toLowerCase(), rf = this.r['farm_' + sl], sp = this._sp, out = this._out;
    let worst = this.armPenCand(limb, E, W), sum = 0;
    const chk = (r, opt) => { const d = this.pointPen(sp, r, out, opt); if (d > worst) { worst = d; limb._pn.copy(out.n); } sum += d; };
    sp.copy(W); chk(rf);
    if (fing) for (const k of [0, .5, 1]) { sp.copy(W).addScaledVector(fing, this.handLen * k); chk(this.handR, { headScale: .93 }); }
    return worst + sum * .15;
  }

  /* ------------------------------------------------------------------ resolutores */
  /* clavícula: acompaña al brazo al elevarlo (ritmo escapulohumeral) para que el hombro no colapse */
  _clavicle(L, T, breath) {
    const clav = L.name === 'armL' ? this.b.clavL : this.b.clavR, s = L.s;
    L.root.getWorldPosition(L.A); L.frame.getWorldQuaternion(L.Fq); L.Fi.copy(L.Fq).invert();
    const v = this._T.a.copy(T).sub(L.A).normalize().applyQuaternion(L.Fi), th = Math.acos(clamp(-v.y, -1, 1));
    const ele = clamp((th - 1.05) * .30, 0, .42), pro = clamp(v.z * .12 * sstep(.4, 1.4, th), -.05, .14);
    clav.quaternion.setFromEuler(_e.set(0, -s * pro, s * (breath * .01 + ele), 'YXZ'));
    clampEuler(clav, LIMITS.clav); this.preLimit(clav); clav.updateMatrixWorld(true);
  }

  /* orientación mundo pedida para el hueso de la mano (dedos hacia fing, palma hacia palm) */
  handQuat(sd, fing, palm, out) {
    const H = this.hm.hand[sd.toLowerCase()], f = fing.clone().normalize(), p = palm.clone(); p.addScaledVector(f, -p.dot(f)); if (p.lengthSq() < 1e-6) p.set(0, 0, 1); p.normalize();
    const z = V().crossVectors(f, p).normalize(), rf = H.fingerRest, rp = H.palmRest.clone().addScaledVector(rf, -H.palmRest.dot(rf)).normalize(), rz = V().crossVectors(rf, rp).normalize();
    out.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f, p, z)); return out.multiply(Qn().setFromRotationMatrix(new THREE.Matrix4().makeBasis(rf, rp, rz)).invert());
  }
  /* núcleo de la muñeca: reparte la torsión (antebrazo 68 % + muñeca) y mide cuánto excede de los límites de pronación y flexión/desviación */
  _handCore(sd, qh, Qf0) {
    const Wr = this.wr[sd], a = Wr.a, C = this._hc ||= { sw: Qn(), rollQ: Qn(), r1: Qn(), r2: Qn(), rv: V() }, wl = LIMITS.wrist;
    const rel = C.r1.copy(Qf0).invert().multiply(qh), tau = wrapPi(2 * Math.atan2(rel.x * a.x + rel.y * a.y + rel.z * a.z, rel.w));
    const rollMax = LIMITS.forearm.roll * D, wtw = wl.twist * D, roll = clamp(tau * .68, -rollMax, rollMax), wt = clamp(tau - roll, -wtw, wtw);
    C.rollQ.setFromAxisAngle(a, roll); rel.multiply(C.r2.setFromAxisAngle(a, -tau));                                 // rel = swing · torsión → swing
    C.sw.copy(C.r2.copy(C.rollQ).invert()).multiply(rel).multiply(C.rollQ);                                         // swing visto desde el antebrazo con rodillo
    const sw = C.sw, ang = 2 * Math.acos(clamp(sw.w, -1, 1)), sn = Math.sqrt(Math.max(1e-12, 1 - sw.w * sw.w)), rv = C.rv.set(sw.x / sn, sw.y / sn, sw.z / sn).multiplyScalar(ang > PI ? ang - TAU : ang);
    const c1 = rv.dot(Wr.e1) * Wr.flexSign, c2 = rv.dot(Wr.e2) * Wr.radSign, f1 = clamp(c1, -wl.ext * D, wl.flex * D), f2 = clamp(c2, -wl.ulnar * D, wl.radial * D);
    C.tau = tau; C.roll = roll; C.wt = wt; C.c1 = c1; C.c2 = c2; C.f1 = f1; C.f2 = f2;
    C.excess = Math.max(0, Math.abs(tau) - (rollMax + wtw)) + Math.abs(f1 - c1) + Math.abs(f2 - c2);
    return C;
  }
  /* excedente de muñeca del brazo candidato (lo llama la búsqueda del giro del codo) */
  _wristExcess(L, sd, qh, sb) {
    const T1 = this._wq1 ||= Qn(), T2 = this._wq2 ||= Qn();
    basisQuat(L.u, L.n, T1).multiply(L.Qr); T2.setFromAxisAngle(L.hRest, Math.atan2(sb, L.u.dot(L.f)) - L.betaRest);
    return this._handCore(sd, qh, T1.multiply(T2)).excess;
  }

  /* brazo: sd 'L'|'R'; target/pole en mundo; fing/palm = orientación pedida de la mano */
  solveArm(sd, target, pole, fing, palm, breath = 0) {
    const L = this.limbs['arm' + sd]; this.body || this.prepBody();
    // caché: el solver de contactos llama a _solve varias veces por fotograma con entradas casi idénticas; si el hombro, el objetivo y la mano no se han movido
    // más de ~1.5 mm la solución anterior sigue siendo válida (los huesos del brazo conservan su rotación local)
    const sig = L._sig ||= new Float32Array(15); L.root.getWorldPosition(L.A);
    const cur = [L.A.x, L.A.y, L.A.z, target.x, target.y, target.z, pole.x, pole.y, pole.z, fing.x, fing.y, fing.z, palm.x, palm.y, palm.z];
    if (L._sigFrame === this.frame && cur.every((v, i) => Math.abs(v - sig[i]) < 1.5e-3)) { L.root.updateMatrixWorld(true); return L; }
    cur.forEach((v, i) => { sig[i] = v; }); L._sigFrame = this.frame;
    const tg = this._tgA ||= V(); tg.copy(target);
    this._clavicle(L, tg, breath);
    const qh = this.handQuat(sd, fing, palm, this._qh ||= Qn()), pen = (limb, E, W) => this.armPenCand(limb, E, W);
    L.hook = (limb, sb) => this._wristExcess(limb, sd, qh, sb);
    for (let it = 0; it < 5; it++) {
      L.solve(tg, pole, pen); this._setHand(L, sd, qh);
      const d = this.armPen(L, L.E, L.W, this._fingerNow(L, sd));                    // con la orientación REAL de la mano (la muñeca puede haberla recortado)                                       // la mano/antebrazo finales no pueden estar dentro del cuerpo:
      if (d < .0025) break;                                                           // si el objetivo lo exige, se aparta del cuerpo (no se corrige después)
      L.fix.pen++; tg.addScaledVector(L._pn, Math.min(.12, d * 1.6));
    }
    L.hook = null;
    return L;
  }

  /* dirección mundo de los dedos con la pose actual de antebrazo (con rodillo) y mano */
  _fingerNow(L, sd) {
    const q = this._fq ||= Qn(); q.copy(L.Qf0).multiply(this._hc.rollQ).multiply(L.end.quaternion);
    return (this._fv ||= V()).copy(this.hm.hand[sd.toLowerCase()].fingerRest).applyQuaternion(q);
  }
  /* descompone la rotación local de la mano en torsión + flexión/desviación (medidas en el marco del antebrazo) */
  _decomposeHand(h, Wr) {
    const a = Wr.a, tw = wrapPi(2 * Math.atan2(h.x * a.x + h.y * a.y + h.z * a.z, h.w)), sw = h.clone().multiply(Qn().setFromAxisAngle(a, -tw));
    const ang = 2 * Math.acos(clamp(sw.w, -1, 1)), sn = Math.sqrt(Math.max(1e-12, 1 - sw.w * sw.w)), rv = V(sw.x / sn, sw.y / sn, sw.z / sn).multiplyScalar(ang > PI ? ang - TAU : ang);
    return { tw, c1: rv.dot(Wr.e1) * Wr.flexSign, c2: rv.dot(Wr.e2) * Wr.radSign };
  }
  /* tras la inercia (los giros intermedios pueden salirse del cono), la muñeca se vuelve a acotar */
  postRate() {
    const wl = LIMITS.wrist;
    for (const sd of ['L', 'R']) {
      const L = this.limbs['arm' + sd], Wr = this.wr[sd], a = Wr.a, h = L.end.quaternion, d = this._decomposeHand(h, Wr);
      const tw = clamp(d.tw, -wl.twist * D, wl.twist * D), f1 = clamp(d.c1, -wl.ext * D, wl.flex * D), f2 = clamp(d.c2, -wl.ulnar * D, wl.radial * D);
      if (Math.abs(tw - d.tw) + Math.abs(f1 - d.c1) + Math.abs(f2 - d.c2) < 1e-5) continue;
      const r2 = Wr.e1.clone().multiplyScalar(f1 * Wr.flexSign).addScaledVector(Wr.e2, f2 * Wr.radSign); r2.addScaledVector(a, -r2.dot(a)); const l = r2.length();
      h.copy(l > 1e-9 ? Qn().setFromAxisAngle(r2.multiplyScalar(1 / l), l) : Qn()).multiply(Qn().setFromAxisAngle(a, tw)); this.noteFix('muneca-tras-inercia');
    }
  }
  /* aplica la orientación de la mano con pronación repartida y límites de muñeca (los recortes solo actúan si la búsqueda del codo no encontró solución) */
  _setHand(L, sd, qh) {
    const C = this._handCore(sd, qh, L.Qf0), a = this.wr[sd].a, Wr = this.wr[sd];
    if (Math.abs(C.roll + C.wt - C.tau) > 1e-4) L.fix.roll++;
    let swQ = C.sw;
    if (Math.abs(C.f1 - C.c1) + Math.abs(C.f2 - C.c2) > 1e-4) {                                                     // muñeca fuera de rango: se recorta a su límite
      L.fix.wrist++; const r2 = Wr.e1.clone().multiplyScalar(C.f1 * Wr.flexSign).addScaledVector(Wr.e2, C.f2 * Wr.radSign); r2.addScaledVector(a, -r2.dot(a)); const l = r2.length();
      swQ = l > 1e-9 ? Qn().setFromAxisAngle(r2.multiplyScalar(1 / l), l) : Qn();
    }
    L.mid.quaternion.multiply(C.rollQ);                                                                             // bisagra · rodillo
    L.end.quaternion.copy(swQ).multiply(Qn().setFromAxisAngle(a, C.wt));
    L.mid.updateMatrixWorld(true);
  }

  /* pierna: sd 'L'|'R'; qfWorld = orientación pedida del pie (mundo) */
  solveLeg(sd, target, pole, qfWorld) {
    const L = this.limbs['leg' + sd]; this.body || this.prepBody();
    const pen = (limb, E, W) => this.legPen(limb, E, W);
    L.solve(target, pole, pen); this._setFoot(L, qfWorld);
    const lift = this.solePen(sd);                                                     // suelas: ningún punto atraviesa el suelo → el objetivo sube (dentro del solver)
    if (lift > .0015) { L.fix.foot++; target.y += lift; L.solve(target, pole, pen); this._setFoot(L, qfWorld); }
    return L;
  }
  _setFoot(L, qfWorld) {
    const foot = L.end; foot.parent.getWorldQuaternion(L.Pq); foot.quaternion.copy(L.Pq.invert().multiply(qfWorld));
    if (clampEuler(foot, LIMITS.ankle)) L.fix.wrist++;
    foot.updateMatrixWorld(true);
  }
  legPen(L, E, W) {
    const sd = L.name.slice(3), other = sd === 'L' ? 'R' : 'L', o = this._po, sp = this._sp, body = this.body; let worst = 0;
    const c1 = body.thigh[other], c2 = body.calf[other], rt = this.r['thigh_' + sd.toLowerCase()], rc = this.r['calf_' + sd.toLowerCase()];
    for (const t of [.55, .8, 1]) { sp.copy(L.A).lerp(E, t); worst = Math.max(worst, this._capPen(sp, rt, c1, o), this._capPen(sp, rt, c2, o), this._ellCap(sp, rt, body.torso[1], o) * .6, this._ellCap(sp, rt, body.torso[2], o) * .6); }
    for (const t of [.2, .55, .9]) { sp.copy(E).lerp(W, t); worst = Math.max(worst, this._capPen(sp, rc, c1, o), this._capPen(sp, rc, c2, o)); }
    return worst;
  }
  /* tras resolver una pierna, actualiza sus cápsulas para que la otra pierna y los brazos ya la vean en su sitio */
  refreshLeg(sd) {
    const b = this.b, body = this.body, [th, sh, an] = sd === 'L' ? [b.thighL, b.shinL, b.ankleL] : [b.thighR, b.shinR, b.ankleR];
    th.getWorldPosition(body.thigh[sd].a); sh.getWorldPosition(body.thigh[sd].b); body.calf[sd].a.copy(body.thigh[sd].b); an.getWorldPosition(body.calf[sd].b);
  }
  /* cuánto por debajo del suelo queda el punto más bajo de la suela (m) */
  solePen(sd) {
    const foot = this.limbs['leg' + sd].end, T = this._T.a; foot.updateWorldMatrix(true, false); let low = 1e9;
    for (const p of this.sole[sd]) { T.copy(p).applyMatrix4(foot.matrixWorld); low = Math.min(low, T.y); }
    return (this.floorY + this.soleClear) - low;
  }

  /* ------------------------------------------------------------------ columna, cuello, cabeza */
  /* inercia del tronco y las clavículas ANTES de resolver brazos y piernas (así estos se calculan sobre el tronco que de verdad se mostrará);
     idempotente: parte siempre de la pose del fotograma anterior (prevQ), aunque el solver se llame varias veces por fotograma */
  preLimit(bone) {
    const prev = this.prevQ.get(bone); if (!prev) { this.prevQ.set(bone, bone.quaternion.clone()); return; }
    if (this.first || !(this.dt > 0)) return; const max = omegaOf(bone.name) * this.dt;
    if (prev.angleTo(bone.quaternion) > max) { bone.quaternion.copy(prev.clone().rotateTowards(bone.quaternion, max)); this.preFix = true; }
  }
  constrainSpine() {
    let c = 0; for (const bone of [this.b.spine, this.b.spine2, this.b.chest]) { if (clampEuler(bone, LIMITS.spine)) c++; this.preLimit(bone); }
    if (c) this.noteFix('columna', c);
  }
  constrainHead() {
    const b = this.b; let c = 0;
    if (clampEuler(b.neck, LIMITS.neck)) c++; if (clampEuler(b.head, LIMITS.head)) c++;
    _e.setFromQuaternion(b.neck.quaternion, 'YXZ'); const yn = _e.y; _e.setFromQuaternion(b.head.quaternion, 'YXZ'); const yh = _e.y, tot = yn + yh, lim = LIMITS.neckHeadYaw * D;
    if (Math.abs(tot) > lim) { const k = lim / Math.abs(tot); for (const [bn, y] of [[b.neck, yn], [b.head, yh]]) { _e.setFromQuaternion(bn.quaternion, 'YXZ'); bn.quaternion.setFromEuler(_e.set(_e.x, y * k, _e.z, 'YXZ')); } c++; }
    if (c) this.noteFix('cabeza', c);
  }
  noteFix(k, n = 1) { this.stats.fix[k] = (this.stats.fix[k] || 0) + n; }

  /* ------------------------------------------------------------------ peso, equilibrio y gravedad */
  /* si la pierna no llega (cadera demasiado alta para los pies), la cadera baja: gravedad, los pies mandan */
  legDrop(sd, tgt) { const L = this.limbs['leg' + sd]; L.root.getWorldPosition(L.A); return Math.min(.25, Math.max(0, L.A.distanceTo(tgt) - (L.dMax - .006))); }
  /* equilibrio: el centro de masas proyectado debe caer sobre el polígono de apoyo cuando está de pie */
  balance(dt, standing) {
    const A = this.A, b = this.b, S = this._balS, T = this._T, rp = A.root.getWorldPosition(V()), inv = A.root.getWorldQuaternion(Qn()).invert();
    const com = b.hips.getWorldPosition(V()).multiplyScalar(.5).addScaledVector(b.chest.getWorldPosition(V()), .38).addScaledVector(b.head.getWorldPosition(V()), .12);
    const loc = (v) => v.sub(rp).applyQuaternion(inv), cl = loc(com), a1 = loc(this.limbs.legL.end.getWorldPosition(V())), a2 = loc(this.limbs.legR.end.getWorldPosition(V()));
    const xmin = Math.min(a1.x, a2.x) - .045, xmax = Math.max(a1.x, a2.x) + .045, zmin = Math.min(a1.z, a2.z) - .07, zmax = Math.max(a1.z, a2.z) + .11;
    const ex = cl.x < xmin ? xmin - cl.x : cl.x > xmax ? xmax - cl.x : 0, ez = cl.z < zmin ? zmin - cl.z : cl.z > zmax ? zmax - cl.z : 0;
    const tx = clamp(ex, -.08, .08) * standing, tz = clamp(ez, -.08, .08) * standing, w = 8, h = Math.min(dt, .05);       // muelle crítico: se reequilibra con inercia
    S.vx += ((tx - S.x) * w * w - 2 * w * S.vx) * h; S.x += S.vx * h; S.vz += ((tz - S.z) * w * w - 2 * w * S.vz) * h; S.z += S.vz * h;
    this.bal.set(S.x, 0, S.z).applyQuaternion(A.root.getWorldQuaternion(T.q)); void T;
  }
  /* pequeñas correcciones del torso por el peso de los brazos (contra-inclinación) */
  compensate(dt) {
    const A = this.A, b = this.b, R = this.react, chest = b.chest.getWorldPosition(V()), inv = A.root.getWorldQuaternion(Qn()).invert();
    let mx = 0, mz = 0; for (const w of [b.wristL, b.wristR]) { const p = w.getWorldPosition(V()).sub(chest).applyQuaternion(inv); mx += p.x; mz += p.z; }
    const tr = clamp(-mx * .045, -.03, .03), tp = clamp(-(mz - .55) * .03, -.03, .03), w = 6, h = Math.min(dt, .05);
    R.vr += ((tr - R.roll) * w * w - 2 * w * R.vr) * h; R.roll += R.vr * h; R.vp += ((tp - R.pitch) * w * w - 2 * w * R.vp) * h; R.pitch += R.vp * h;
  }

  /* ------------------------------------------------------------------ inercia: velocidad angular máxima por articulación */
  groups() { const b = this.b; return this._grp ||= { body: [b.spine, b.spine2, b.chest, b.clavL, b.clavR, b.uArmL, b.lArmL, b.wristL, b.uArmR, b.lArmR, b.wristR, b.thighL, b.shinL, b.ankleL, b.thighR, b.shinR, b.ankleR], head: [b.neck, b.head] }; }
  /* Inercia: cada articulación gira como mucho OMEGA·dt por fotograma hacia la solución de la IK. Prioridad del usuario: anatomía y "sin
     penetraciones" van ANTES que el movimiento natural → si la pose intermedia saliera del rango o atravesara el cuerpo, se acelera el giro
     (×2, ×4, ×8…) hasta que sea válida; en el peor caso se toma la solución de la IK (que siempre lo es). */
  limitRates(dt, group) {
    if (dt <= 0) return;
    const step = (bone, m) => {
      const prev = this.prevQ.get(bone); if (!prev) { this.prevQ.set(bone, bone.quaternion.clone()); return false; }
      const max = omegaOf(bone.name) * dt * m; let ch = false;
      if (!this.first && prev.angleTo(bone.quaternion) > max) { bone.quaternion.copy(prev.clone().rotateTowards(bone.quaternion, max)); ch = true; }
      return ch;
    };
    if (group === 'head') { for (const bone of this.groups().head) { if (step(bone, 1)) this.rateFix++; this.prevQ.get(bone).copy(bone.quaternion); } this.first = false; return; }
    const b = this.b, keep = (bone) => this.prevQ.get(bone)?.copy(bone.quaternion);
    for (const bone of [b.spine, b.spine2, b.chest, b.clavL, b.clavR]) { if (this.preFix) this.rateFix++; this.prevQ.get(bone) ? keep(bone) : this.prevQ.set(bone, bone.quaternion.clone()); }
    this.preFix = false;
    for (const [k, bones] of [['armL', [b.uArmL, b.lArmL, b.wristL]], ['armR', [b.uArmR, b.lArmR, b.wristR]], ['legL', [b.thighL, b.shinL, b.ankleL]], ['legR', [b.thighR, b.shinR, b.ankleR]]]) {
      const L = this.limbs[k], sd = k.slice(3), sol = bones.map(o => o.quaternion.clone()), first = this.first;
      const ref = this._limbRef(L, k, sd);                                            // cómo es la solución de la IK (para no exigirle a la inercia más que a ella)
      let moved = false;
      for (const m of [1, 2, 4, 8, 1e9]) {
        bones.forEach((o, i) => { o.quaternion.copy(sol[i]); }); let ch = false;
        if (m < 1e9) for (const o of bones) if (step(o, m)) ch = true;
        if (!ch) break;                                                               // ya está en la solución (o dentro del paso permitido)
        L.root.updateMatrixWorld(true); if (this._limbValid(L, k, sd, ref)) { moved = true; break; }
        if (m === 8) { this.stats.fix['inercia-cede-a-anatomia'] = (this.stats.fix['inercia-cede-a-anatomia'] || 0) + 1; bones.forEach((o, i) => o.quaternion.copy(sol[i])); L.root.updateMatrixWorld(true); break; }
      }
      if (moved) this.rateFix++; void first;
      for (const o of bones) keep(o);
    }
    this.first = this.first && false;
  }
  _limbRef(L, k, sd) {                                                                // medidas de la solución de la IK, antes de aplicar la inercia
    const ms = L.measure({}), r = { ex: ms.ex, twEx: ms.twEx, pen: 0, sole: 0 };
    if (k.startsWith('arm')) r.pen = this.armPen(L, L.E, L.W, this._fingerAt(L, sd)); else { r.pen = this.legPen(L, L.E, L.W); r.sole = this.solePen(sd); }
    return r;
  }
  _limbValid(L, k, sd, ref) {
    const ms = L.measure({}), t = .5 * D;
    if (ms.ex > Math.max(ref.ex, 0) + t || ms.twEx > Math.max(ref.twEx, 0) + t) return false;
    if (k.startsWith('arm')) { this._fingerAt(L, sd); return this.armPen(L, L.E, L.W, this._fv) <= Math.max(ref.pen, .005) + .001; }
    return this.legPen(L, L.E, L.W) <= Math.max(ref.pen, .006) + .001 && this.solePen(sd) <= Math.max(ref.sole, .002) + .001;
  }
  /* dirección de los dedos con la pose actual de los huesos (tras la inercia) */
  _fingerAt(L, sd) { const H = this.hm.hand[sd.toLowerCase()]; return (this._fv ||= V()).copy(H.fingerRest).applyQuaternion(H.bone.getWorldQuaternion(this._fq ||= Qn())); }

  /* salto de tiempo o fin de un calentamiento oculto (warm = true mientras dura): la pose se recoloca sin inercia y no se audita */
  timeJump() { this.first = true; this.prevQ.clear(); this._chk = null; this.skip = 4; this.warm = false; for (const k in this.limbs) this.limbs[k].lastBest = -1e9; }
  /* fin del fotograma: contabiliza intervenciones, fija el giro del codo y valida */
  finish(dt) {
    for (const k in this.limbs) { const L = this.limbs[k]; L.dg = L._g; for (const f in L.fix) if (L.fix[f]) { const key = k + '.' + f; this.stats.fix[key] = (this.stats.fix[key] || 0) + L.fix[f]; L.fix[f] = 0; } }
    if (this.rateFix) { this.stats.fix.inercia = (this.stats.fix.inercia || 0) + this.rateFix; this.rateFix = 0; }
    if (this._dbg) { this.prepBody(); for (const k of ['armL', 'armR']) { const L = this.limbs[k]; L.root.getWorldPosition(L.A); L.mid.getWorldPosition(L.E); L.end.getWorldPosition(L.W); } this._updVolumes(); }
    if (this.warm || this.skip > 0) { if (this.skip > 0) this.skip--; this._chk = null; return; }
    if (this.audit) this.check(dt);
  }

  /* ------------------------------------------------------------------ VALIDACIÓN del estado final (independiente del solver) */
  check(dt) {
    const S = this.stats, v = {}, W = S.worst, tol = LIMITS.tol * D, add = (k, amt) => { v[k] = 1; W[k] = Math.max(W[k] || 0, amt); };
    S.frames++; const b = this.b; this.prepBody();
    const out = { n: V() }, sp = this._sp;
    for (const k of ['armL', 'armR', 'legL', 'legR']) {
      const L = this.limbs[k]; L.root.getWorldPosition(L.A); L.mid.getWorldPosition(L.E); L.end.getWorldPosition(L.W); L.frame.getWorldQuaternion(L.Fq); L.Fi.copy(L.Fq).invert();
      const u = L.E.clone().sub(L.A).normalize(), f = L.W.clone().sub(L.E).normalize(), an = L.angles(u, {}), vF = an.v.clone();
      const ex = an.theta - L.thetaMax(an.phi); if (ex > tol) add(k + '.rango-hombro/cadera', ex / D);
      const beta = Math.acos(clamp(u.dot(f), -1, 1)); if (beta > L.betaMax + tol) add(k + '.codo/rodilla-flexion', (beta - L.betaMax) / D);
      const nW = u.clone().cross(f);
      if (beta > .17) {                                                                                                        // (con menos de 10° de flexión la bisagra es indefinida)
        nW.normalize(); const hw = L.hRest.clone().applyQuaternion(L.root.getWorldQuaternion(Qn()));                       // la flexión solo puede ir en el sentido de la bisagra real
        if (nW.dot(hw) < .94) add(k + '.bisagra-mal-orientada', Math.acos(clamp(nW.dot(hw), -1, 1)) / D);
        const o = Math.max(L.twMin - L.twistOf(vF, nW.clone().applyQuaternion(L.Fi)), L.twistOf(vF, nW.clone().applyQuaternion(L.Fi)) - L.twMax); if (o > tol) add(k + '.giro-humero/femur', o / D);
      }
      if (k.startsWith('arm')) {
        const sd = k.slice(3), s = sd.toLowerCase(), Wr = this.wr[sd], a = Wr.a, rel = L.mid.quaternion, h = L.end.quaternion;
        const roll = wrapPi(2 * Math.atan2(rel.x * a.x + rel.y * a.y + rel.z * a.z, rel.w)); if (Math.abs(roll) > LIMITS.forearm.roll * D + tol) add(k + '.pronacion', (Math.abs(roll) - LIMITS.forearm.roll * D) / D);
        const dh = this._decomposeHand(h, Wr), wl = LIMITS.wrist; if (Math.abs(dh.tw) > wl.twist * D + tol) add(k + '.muneca-giro', (Math.abs(dh.tw) - wl.twist * D) / D);
        const o1 = Math.max(-wl.ext * D - dh.c1, dh.c1 - wl.flex * D), o2 = Math.max(-wl.ulnar * D - dh.c2, dh.c2 - wl.radial * D); if (o1 > tol) add(k + '.muneca-flexion', o1 / D); if (o2 > tol) add(k + '.muneca-desviacion', o2 / D);
        if (beta >= L.betaMax - .002 || an.theta > 172 * D) this.stats.limit[k] = (this.stats.limit[k] || 0) + 1;      // apoyado en el tope articular: no es violación, pero se contabiliza (riesgo de compresión de la malla)
        let pen = 0, ph = 0, pp = '', ph2 = ''; const ru = this.r['uarm_' + s], rf = this.r['farm_' + s];
        for (const [a, b, r, nm] of [[L.A, L.E, ru, 'brazo'], [L.E, L.W, rf, 'antebrazo']]) for (const t of (nm === 'brazo' ? [.55, .8, 1] : [.2, .5, .8, 1])) { sp.copy(a).lerp(b, t); const d = this.pointPen(sp, r, out); if (d > pen) { pen = d; pp = nm + '↔' + this.lastPart; } }
        const fd = this.hm.hand[s].fingerRest.clone().applyQuaternion(this.hm.hand[s].bone.getWorldQuaternion(Qn()));
        for (const t of [0, .5, 1]) { sp.copy(L.W).addScaledVector(fd, this.handLen * t); const d = this.pointPen(sp, this.handR, out, { headScale: .93 }); if (d > ph) { ph = d; ph2 = this.lastPart; } }
        if (pen > .008) add(k + '.brazo-atraviesa-cuerpo[' + pp + ']', pen * 1000); if (ph > .008) add(k + '.mano-atraviesa-cuerpo[' + ph2 + ']', ph * 1000);
      } else {
        const sd = k.slice(3), lo = this.solePen(sd); if (lo > .004) add(k + '.pie-atraviesa-suelo', lo * 1000);
        const A2 = LIMITS.ankle, om = eulerExcess(L.end, A2); if (om > tol) add(k + '.tobillo', om / D);
        const pen = this.legPen(L, L.E, L.W); if (pen > .008) add(k + '.pierna-atraviesa-pierna/abdomen', pen * 1000);
      }
    }
    { const l = this.limbs.armL, r = this.limbs.armR; let m = 0; const ca = { a: l.E, b: l.W, r: this.r.farm_l }; for (const t of [.2, .5, .8, 1]) { sp.copy(r.E).lerp(r.W, t); m = Math.max(m, this._capPen(sp, this.r.farm_r, ca, out)); } if (m > .008) add('brazo-atraviesa-brazo', m * 1000); }
    for (const [bn, lim, name] of [[b.spine, LIMITS.spine, 'columna'], [b.spine2, LIMITS.spine, 'columna'], [b.chest, LIMITS.spine, 'columna'], [b.neck, LIMITS.neck, 'cuello'], [b.head, LIMITS.head, 'cabeza'], [b.clavL, LIMITS.clav, 'clavicula'], [b.clavR, LIMITS.clav, 'clavicula']]) {
      const o = eulerExcess(bn, lim); if (o > tol) add(name + '.rango', o / D);
    }
    if (dt > 0 && this._chk) for (const bone of [...this.groups().body, ...this.groups().head]) { const p = this._chk.get(bone); if (!p) continue; const w = p.angleTo(bone.quaternion) / dt, om = omegaOf(bone.name); if (w > om * 8.4) add('rotacion-instantanea.' + bone.name, w / om); }
    const chk = this._chk ||= new Map(); for (const bone of [...this.groups().body, ...this.groups().head]) (chk.get(bone) || chk.set(bone, Qn()).get(bone)).copy(bone.quaternion);
    for (const k in v) S.viol[k] = (S.viol[k] || 0) + 1;
    this.lastViol = v;
  }
  /* depuración visual: dibuja los volúmenes de colisión (elipsoides) sobre el personaje. anat.showVolumes(scene) / anat.showVolumes(scene, false) */
  showVolumes(scene, on = true) {
    if (this._dbg) { for (const m of this._dbg.meshes) scene.remove(m); this._dbg = null; }
    if (!on) return;
    const geo = new THREE.SphereGeometry(1, 14, 10), mk = (col) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, wireframe: true, transparent: true, opacity: .55, depthTest: false })); m.renderOrder = 99; m.matrixAutoUpdate = false; scene.add(m); return m; };
    this._dbg = { meshes: [], items: [] };
    const add = (col, fn) => { const m = mk(col); this._dbg.meshes.push(m); this._dbg.items.push({ m, fn }); };
    for (let i = 0; i < 3; i++) add(0xff5555, () => { const S = this.body.torso[i]; return [S.a, S.b, S.rx, S.rz, S.X, S.Z]; });
    add(0xffff55, () => { const B = this.body.head, H = this.headE; return [B.c, B.c, H.rx, H.rz, B.X, B.Z, H.ry]; });
    add(0xffaa55, () => [this.body.neckC.a, this.body.neckC.b, this.neckR, this.neckR]);
    for (const sd of ['L', 'R']) {
      add(0x55ff55, () => [this.body.thigh[sd].a, this.body.thigh[sd].b, this.body.thigh[sd].r, this.body.thigh[sd].r]); add(0x55ff55, () => [this.body.calf[sd].a, this.body.calf[sd].b, this.body.calf[sd].r, this.body.calf[sd].r]);
      const L = this.limbs['arm' + sd], s = sd.toLowerCase();
      add(0x55ccff, () => [L.A, L.E, this.r['uarm_' + s], this.r['uarm_' + s]]); add(0x55ccff, () => [L.E, L.W, this.r['farm_' + s], this.r['farm_' + s]]);
    }
  }
  _updVolumes() {
    if (!this._dbg) return; const X = V(), Y = V(), Z = V(), m4 = new THREE.Matrix4(), mid = V();
    for (const { m, fn } of this._dbg.items) {
      const [a, b, rx, rz, ax, az, ry] = fn(); const len = a.distanceTo(b); Y.copy(b).sub(a); if (len > 1e-6) Y.multiplyScalar(1 / len); else Y.set(0, 1, 0);
      if (ax) { X.copy(ax); Z.copy(az); if (len > 1e-6) { Z.crossVectors(X, Y).normalize(); X.crossVectors(Y, Z).normalize(); } } else { X.set(1, 0, 0).addScaledVector(Y, -Y.x).normalize(); if (X.lengthSq() < .5) X.set(0, 0, 1).addScaledVector(Y, -Y.z).normalize(); Z.crossVectors(X, Y); }
      m4.makeBasis(X.clone().multiplyScalar(rx), Y.clone().multiplyScalar(ry ?? (len / 2 + Math.max(rx, rz) * .6)), Z.clone().multiplyScalar(rz)); mid.copy(a).lerp(b, .5); m4.setPosition(mid); m.matrix.copy(m4); m.matrixWorldNeedsUpdate = true; m.matrixWorld.copy(m4);
    }
  }
  /* depuración: qué muestras de un brazo penetran y contra qué (mm) */
  explain(sd) {
    const L = this.limbs['arm' + sd], s = sd.toLowerCase(), res = [], o = { n: V() }; this.prepBody(); L.root.getWorldPosition(L.A); L.mid.getWorldPosition(L.E); L.end.getWorldPosition(L.W);
    const fd = this.hm.hand[s].fingerRest.clone().applyQuaternion(this.hm.hand[s].bone.getWorldQuaternion(Qn())), body = this.body;
    const test = (name, p, r, opt) => { const parts = {}, q = { n: V() };
      for (let i = 0; i < 3; i++) { const d = this._ellCap(p, r, body.torso[i], q); if (d > 0) parts['torso' + i] = +(d * 1000).toFixed(0); }
      const dh = this._headPen(p, r * (opt?.headScale ?? 1), q); if (dh > 0) parts.cabeza = +(dh * 1000).toFixed(0); const dn = this._capPen(p, r, body.neckC, q); if (dn > 0) parts.cuello = +(dn * 1000).toFixed(0);
      for (const d2 of ['L', 'R']) { const dt = this._capPen(p, r, body.thigh[d2], q, .28); if (dt > 0) parts['muslo' + d2] = +(dt * 1000).toFixed(0); }
      if (Object.keys(parts).length) res.push([name, p.toArray().map(x => +x.toFixed(2)), parts]); };
    for (const t of [.55, .8, 1]) test('brazo' + t, L.A.clone().lerp(L.E, t), this.r['uarm_' + s]);
    for (const t of [.2, .5, .8, 1]) test('antebrazo' + t, L.E.clone().lerp(L.W, t), this.r['farm_' + s]);
    for (const t of [0, .5, 1]) test('mano' + t, L.W.clone().addScaledVector(fd, this.handLen * t), this.handR, { headScale: .93 });
    return res;
  }
  resetStats() { this.stats = { frames: 0, viol: {}, worst: {}, fix: {}, limit: {}, pr: {} }; this._chk = null; }
}
