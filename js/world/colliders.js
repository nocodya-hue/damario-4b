/* =========================================================
   COLISIONES — el cuerpo no atraviesa los muebles
   Muebles = cajas orientadas (OBB) que se recogen de las mallas marcadas con userData.col
   ANTES de fusionar la geometría. El cuerpo = cápsulas (pelvis, torso, muslos, piernas, brazos, manos)
   sobre el esqueleto real. Solver por posiciones:
     1) mide la penetración de cada cápsula contra las cajas de SU zona (asiento, mesa…)
     2) empuja: cadera/muslos/torso → cadera; piernas → pie; brazos/manos → mano
     3) "gravedad": si la pelvis flota cerca de un asiento, baja hasta apoyarse
   Todo con calentamiento (warm start) y relajación para que el contacto no vibre.
   ========================================================= */
import * as THREE from 'three';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _p = V3(), _l = V3(), _n = V3(), _d = V3();

export class OBB {
  constructor(mesh, half, center, opts = {}) {
    this.mesh = mesh; this.half = half; this.center = center; this.name = mesh.userData.col; this.live = !!opts.live; this.soft = opts.soft ?? 0;
    this.m = new THREE.Matrix4(); this.inv = new THREE.Matrix4(); this.refresh(true);
  }
  refresh(force) {
    if (!force && !this.live) return;
    this.mesh.updateWorldMatrix(true, false);
    this.m.copy(this.mesh.matrixWorld).multiply(new THREE.Matrix4().makeTranslation(this.center.x, this.center.y, this.center.z)); this.inv.copy(this.m).invert();
  }
  /* penetración de una esfera (p, r): devuelve {depth, n (mundo)} o null */
  sphere(p, r, out) {
    _l.copy(p).applyMatrix4(this.inv);
    const s = this.mesh.matrixWorld;                                      // escala uniforme aprox.
    const hx = this.half.x, hy = this.half.y - this.soft * .5, hz = this.half.z;
    const dx = Math.abs(_l.x) - hx, dy = Math.abs(_l.y) - hy, dz = Math.abs(_l.z) - hz;
    const ox = Math.max(dx, 0), oy = Math.max(dy, 0), oz = Math.max(dz, 0), outside = Math.hypot(ox, oy, oz);
    if (outside >= r) return null;
    if (outside > 1e-6) { _n.set(Math.sign(_l.x) * ox, Math.sign(_l.y) * oy, Math.sign(_l.z) * oz).divideScalar(outside); out.depth = r - outside; }
    else {
      // dentro: salir por la cara más cercana
      if (dx >= dy && dx >= dz) { _n.set(Math.sign(_l.x) || 1, 0, 0); out.depth = r - dx; }
      else if (dy >= dz) { _n.set(0, Math.sign(_l.y) || 1, 0); out.depth = r - dy; }
      else { _n.set(0, 0, Math.sign(_l.z) || 1); out.depth = r - dz; }
    }
    out.n = _n.transformDirection(this.m).clone(); return out;
  }
  /* distancia vertical (hacia abajo, mundo) desde p hasta la cara superior, si p está sobre la caja */
  gapBelow(p) {
    _l.copy(p).applyMatrix4(this.inv); const hy = this.half.y - this.soft * .5;
    if (Math.abs(_l.x) > this.half.x || Math.abs(_l.z) > this.half.z) return null;
    const top = V3(_l.x, hy, _l.z).applyMatrix4(this.m); return p.y - top.y;
  }
}

/* recoge las mallas marcadas (userData.col) de un grupo */
export function collectColliders(root) {
  root.updateMatrixWorld(true);
  const groups = {};
  root.traverse(o => {
    if (!o.isMesh || !o.userData.col) return;
    o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox, half = bb.getSize(V3()).multiplyScalar(.5), center = bb.getCenter(V3());
    let live = false; for (let a = o.parent; a; a = a.parent) if (a.userData && a.userData.dynamic) live = true;
    (groups[o.userData.col] = groups[o.userData.col] || []).push(new OBB(o, half, center, { live, soft: o.userData.soft || 0 }));
  });
  return groups;
}

/* conjunto de cajas relevantes para un actor + solver */
export class BodyColliders {
  constructor(groups, names, o = {}) { this.boxes = names.flatMap(n => groups[n] || []); this.o = { pelvisR: .09, torsoR: .11, thighR: .078, calfR: .05, uarmR: .045, farmR: .037, handR: .045, ...o }; this._out = {}; this.prev = null; this.debug = { hip: 0, foot: 0, hand: 0 }; }
  segments(A) {
    const h = A.human, b = h.b, o = this.o, P = (bone) => bone.getWorldPosition(V3());
    const hips = P(b.hips), tl = P(b.thighL), tr = P(b.thighR), kl = P(b.shinL), kr = P(b.shinR), al = P(b.ankleL), ar = P(b.ankleR);
    const sp = P(b.spine), ch = P(b.chest), nk = P(b.neck);
    const ul = P(b.uArmL), ur = P(b.uArmR), el = P(b.lArmL), er = P(b.lArmR), wl = P(b.wristL), wr = P(b.wristR);
    const pel = hips.clone(); pel.y -= .045;
    return [
      { g: 'hip', a: tl, b: tr, r: o.pelvisR }, { g: 'hip', a: pel, b: sp, r: o.pelvisR * .95 }, { g: 'hip', a: sp, b: ch, r: o.torsoR }, { g: 'hip', a: ch, b: nk, r: o.torsoR * .9 },
      { g: 'hip', a: tl, b: kl, r: o.thighR }, { g: 'hip', a: tr, b: kr, r: o.thighR },
      { g: 'footL', a: kl, b: al, r: o.calfR }, { g: 'footR', a: kr, b: ar, r: o.calfR },
      { g: 'handL', a: ul, b: el, r: o.uarmR }, { g: 'handL', a: el, b: wl, r: o.farmR }, { g: 'handR', a: ur, b: er, r: o.uarmR }, { g: 'handR', a: er, b: wr, r: o.farmR },
    ];
  }
  resolve(A, c) {
    if (!this.boxes.length) return;
    for (const bx of this.boxes) bx.refresh();
    const out = this._out, G = ['hip', 'footL', 'footR', 'handL', 'handR'];
    // warm start: correcciones del fotograma anterior (relajadas)
    if (this.prev) for (const k in c) c[k].copy(this.prev[k]).multiplyScalar(.9);
    for (let it = 0; it < 6; it++) {
      A._solve(c); A.human.scene.updateMatrixWorld(true);
      const ax = {}; for (const g of G) ax[g] = { px: 0, nx: 0, py: 0, ny: 0, pz: 0, nz: 0, n: 0 };
      const segs = this.segments(A); this.dbg = [];
      for (const [si, s] of segs.entries()) for (let i = 0; i <= 6; i++) {
        _p.copy(s.a).lerp(s.b, i / 6);
        for (const bx of this.boxes) {
          const r = bx.sphere(_p, s.r, out); if (!r || r.depth < 1e-4) continue;
          const A2 = ax[s.g], v = r.n, d = r.depth; A2.n++;
          if (v.x > 0) A2.px = Math.max(A2.px, v.x * d); else A2.nx = Math.max(A2.nx, -v.x * d);
          if (v.y > 0) A2.py = Math.max(A2.py, v.y * d); else A2.ny = Math.max(A2.ny, -v.y * d);
          if (v.z > 0) A2.pz = Math.max(A2.pz, v.z * d); else A2.nz = Math.max(A2.nz, -v.z * d);
          this.dbg.push([si, i, +d.toFixed(3), bx.name, v.toArray().map(x => +x.toFixed(2)).join(',')]);
        }
      }
      // gravedad: si la pelvis flota cerca de un asiento, baja hasta apoyarse
      let settle = 0;
      if (!ax.hip.n) {
        const hp = A.human.b.hips.getWorldPosition(V3()), bottom = V3(hp.x, hp.y - .045 - this.o.pelvisR, hp.z); let gap = 1e9;
        for (const bx of this.boxes) { const gp = bx.gapBelow(bottom); if (gp !== null && gp > -.05 && gp < gap) gap = gp; }
        if (gap > .003 && gap < .14) settle = -gap * .8;
      }
      let moved = 0; const lim = .06;
      for (const g of G) {
        const a = ax[g]; if (!a.n) continue;
        const px = Math.min(lim, a.px - a.nx), py = Math.min(lim, Math.max(-lim, a.py - a.ny)), pz = Math.min(lim, Math.max(-lim, a.pz - a.nz));
        c[g].x += Math.max(-lim, px) * .85; c[g].y += py * .85; c[g].z += pz * .85; moved += Math.abs(px) + Math.abs(py) + Math.abs(pz);
      }
      if (settle) { c.hip.y += settle; moved += Math.abs(settle); }
      if (moved < .0006) break;
    }
    c.hip.clampLength(0, .14); for (const k of ['footL', 'footR', 'handL', 'handR']) c[k].clampLength(0, .2);
    // suavizado temporal de las correcciones: sin esto la cadera alterna cada fotograma entre "bajar por gravedad" y "subir por contacto" y el personaje tiembla
    this.hs ||= {}; for (const k in c) { const h = (this.hs[k] ||= c[k].clone()); h.lerp(c[k], k === 'hip' ? .14 : .35); c[k].copy(h); }
    this.prev = {}; for (const k in c) this.prev[k] = c[k].clone();
    this.debug.hip = c.hip.length(); A._solve(c);
  }
}
