/* =========================================================
   PLANOS — cámara de cine que sigue las caras reales de los personajes
   Cada plano se define por su tipo y se resuelve CADA FOTOGRAMA contra el cuerpo actual del actor:
   así el primer plano siempre encuadra los ojos aunque el personaje se incline o gire la cabeza.
   Tipos:
     face   primer plano de cara       { who, d:[d0,d1], az:[a0,a1]°, dy, fov:[f0,f1], ly }
     mouth  plano detalle boca+ojos    (igual que face, más cerrado)
     ots    sobre el hombro            { who (sujeto), from (quien da la espalda), back, side, dy, fov }
     two    plano de dos               { a, b, d, az, fov }
     ins    plano detalle de objeto    { what:'pad'|'phone'|'cig'|'pen'|'hand', who, d, az, fov }
     fix    plano fijo                 { pos, look, fov }
   d/az/fov como par [inicio, fin] = el plano se mueve despacio (empuje / giro) mientras dura.
   ========================================================= */
import * as THREE from 'three';

const V = THREE.Vector3, Y = new V(0, 1, 0), DEG = Math.PI / 180;
const tq = new THREE.Quaternion(), hf = new V(), bf = new V();
const pair = (x, dflt) => Array.isArray(x) ? x : [x ?? dflt, x ?? dflt];
const mix = (p, u) => p[0] + (p[1] - p[0]) * u;

export class Shots {
  constructor(actors, timeline) { this.actors = actors; this.tl = timeline; this.cur = -1; }

  /* dirección "hacia donde mira" la cara en horizontal: mezcla de cuerpo y cabeza para que el plano no bailotee con cada giro */
  _fwd(A) {
    A.head.root.getWorldQuaternion(tq); hf.set(0, 0, 1).applyQuaternion(tq); hf.y *= .85;               // la cámara se coloca sobre el eje de la cara: si baja la cabeza, la cámara baja (se ven los ojos bajo la visera)
    bf.set(0, 0, 1).applyQuaternion(A.root.quaternion); bf.y = 0; bf.normalize();
    if (hf.lengthSq() < 1e-4) return bf.clone();
    const r = bf.clone().lerp(hf.normalize(), .5); r.y = Math.min(.25, Math.max(-.22, r.y)); return r.normalize();       // sin picados/contrapicados extremos: la cámara nunca se cuela bajo una mesa
  }
  _face(A) { return A.eyeW.clone().add(new V(0, -.018, 0)); }

  /* rellena {pos, look, fov, ap, focus, shotId}; devuelve false si p está fuera de los planos */
  sample(p, out) {
    const tl = this.tl; if (p < tl.P0 || p >= tl.END + .001) return false;
    let sh = this.cur >= 0 ? tl.shots[this.cur] : null;
    if (!sh || p < sh.p0 || p >= sh.p1) { let lo = 0, hi = tl.shots.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (tl.shots[m].p0 <= p) lo = m; else hi = m - 1; } this.cur = lo; sh = tl.shots[lo]; }
    const u = Math.min(1, Math.max(0, (p - sh.p0) / (sh.p1 - sh.p0)));
    this._solve(sh, u, out); out.roll = sh.roll ? mix(pair(sh.roll), u) : 0; out.shotId = sh.id; return true;
  }

  _solve(sh, u, out) {
    const A = this.actors, k = sh.k, fov = mix(pair(sh.fov, 34), u), d = mix(pair(sh.d, .8), u), dy = mix(pair(sh.dy, 0), u);
    let az = mix(pair(sh.az, 0), u) * DEG; if ((k === 'face' || k === 'mouth') && sh.who === 'artist') az = -Math.max(.6, Math.abs(az));      // Zuri: la cámara siempre por el lado libre (la lámpara del escritorio queda al otro)
    out.fov = fov; out.ap = sh.ap ?? (k === 'two' || k === 'fix' ? .35 : .95);
    if (k === 'face' || k === 'mouth') {
      const a = A[sh.who], f = this._fwd(a), c = this._face(a), dir = f.clone().applyAxisAngle(Y, az);
      out.pos.copy(c).addScaledVector(dir, d).add(new V(0, dy, 0));
      out.look.copy(c).add(new V(0, sh.ly ?? (k === 'mouth' ? -.03 : -.006), 0)).addScaledVector(f.clone().cross(Y), sh.lx ?? 0);
      out.focus = out.pos.distanceTo(c);
    } else if (k === 'ots') {                                                // cámara junto al hombro del que escucha, mirando al que habla
      const s = A[sh.who], o = A[sh.from], cs = this._face(s), co = o.eyeW.clone(), dir = cs.clone().sub(co); dir.y = 0; dir.normalize();
      const side = dir.clone().cross(Y).multiplyScalar(sh.side ?? .26);
      out.pos.copy(co).addScaledVector(dir, -mix(pair(sh.back, .18), u)).add(side).add(new V(0, sh.dy ?? .1, 0));
      out.look.copy(cs).addScaledVector(side, -.35); out.focus = out.pos.distanceTo(cs);
    } else if (k === 'two') {
      const a = A[sh.a].eyeW, b = A[sh.b].eyeW, mid = a.clone().lerp(b, .5), dir = b.clone().sub(a); dir.y = 0; const len = dir.length(); dir.normalize();
      const n = dir.clone().cross(Y).applyAxisAngle(Y, az); if (sh.flip) n.negate();
      out.pos.copy(mid).addScaledVector(n, Math.max(d, len * .9)).add(new V(0, dy, 0)); out.look.copy(mid).add(new V(0, -.05, 0)); out.focus = out.pos.distanceTo(mid);
    } else if (k === 'ins') {
      const a = A[sh.who]; let c;
      if (sh.what === 'pad') c = a.props.pad.position; else if (sh.what === 'phone') c = a.props.phone.position; else if (sh.what === 'cig') c = a.props.cig.position; else if (sh.what === 'pen') c = a.props.pen.position;
      else c = a.handWorld[sh.side || 'L'];
      const c2 = c.clone(), f = this._fwd(a);
      if (sh.pov) {                                                        // plano subjetivo: la cámara sobre las manos, mirando el mando como lo ve el jugador (referencia de manos en el mando)
        out.pos.copy(a.eyeW).addScaledVector(f, sh.pov.f ?? .2).add(new V(0, sh.pov.up ?? .2, 0)); out.look.copy(c2).add(new V(0, 0, 0)); out.focus = out.pos.distanceTo(c2); return;
      }
      const dir = f.applyAxisAngle(Y, az);
      out.pos.copy(c2).addScaledVector(dir, d).add(new V(0, dy, 0)); out.look.copy(c2); out.focus = out.pos.distanceTo(c2);
    } else {                                                                  // fix: plano fijo o con desplazamiento lineal entre dos poses
      const p0 = new V(...sh.pos), l0 = new V(...sh.look);
      if (sh.pos1) { out.pos.copy(p0).lerp(new V(...sh.pos1), u); out.look.copy(l0).lerp(new V(...(sh.look1 || sh.look)), u); } else { out.pos.copy(p0); out.look.copy(l0); }
      out.focus = sh.focus ?? out.pos.distanceTo(out.look);
    }
  }
}
