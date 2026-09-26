/* =========================================================
   Cámara cinematográfica controlada por el scroll
   - Keyframes (posición, objetivo, fov, alabeo, foco, apertura) en función de p ∈ [0,1].
   - Interpolación Hermite: tangente 0 en los "hold" → la cámara se asienta y se queda
     casi quieta mientras el scroll sigue avanzando (momentos de calma).
   - Peso: p suavizado (exponencial) + muelle críticamente amortiguado sobre la pose.
   - Micro-vida: temblor de cámara al hombro y parallax de ratón, muy sutiles.
   ========================================================= */
import * as THREE from 'three';

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

function hermite(p0, p1, m0, m1, h, t) {
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * h * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * h * m1;
}

export class CameraRig {
  constructor(camera, keys, opts = {}) {
    this.cam = camera;
    this.keys = keys.map(k => ({ ...k, pos: V(k.pos), look: V(k.look), roll: (k.roll || 0), ap: k.ap ?? 0, fov: k.fov ?? 40, focus: k.focus ?? null, hold: !!k.hold }));
    this.p = 0; this.pRaw = 0; this._first = true; this.cutPulse = 0; this.shake = 0;
    this.stiff = opts.stiff ?? 12;
    this.vel = new THREE.Vector3(); this.velL = new THREE.Vector3();
    this.pos = this.keys[0].pos.clone(); this.look = this.keys[0].look.clone();
    this.fov = this.keys[0].fov; this.roll = 0; this.ap = 0; this.focus = 5;
    this.mouse = new THREE.Vector2(); this.mouseS = new THREE.Vector2();
    this.parallax = opts.parallax ?? 1;
    this.prevDir = new THREE.Vector3(0, 0, -1); this.prevPos = this.pos.clone();
    this.fxRot = new THREE.Vector2(); this.fxTrans = new THREE.Vector2();
    this.locked = null; this.dyn = null; this._shot = undefined;     // dyn(p,out): planos dinámicos (cortes); devuelve false si no manda
    this.view = { yaw: 0, pitch: 0, dragging: false, idle: 99, pPrev: 0 };   // mirada libre 360° (sobre la cámara del guion)
    this._tmp = new THREE.Vector3(); this._q = new THREE.Quaternion();
    this.sampled = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40, roll: 0, ap: 0, focus: 5 };
    // tangentes
    const K = this.keys;
    K.forEach((k, i) => {
      if (k.hold || i === 0 || i === K.length - 1) { k.mPos = new THREE.Vector3(); k.mLook = new THREE.Vector3(); k.mS = { fov: 0, roll: 0, ap: 0, focus: 0 }; return; }
      const a = K[i - 1], b = K[i + 1], dp = b.p - a.p;
      k.mPos = b.pos.clone().sub(a.pos).multiplyScalar(1 / dp);
      k.mLook = b.look.clone().sub(a.look).multiplyScalar(1 / dp);
      k.mS = { fov: (b.fov - a.fov) / dp, roll: (b.roll - a.roll) / dp, ap: (b.ap - a.ap) / dp, focus: 0 };
    });
  }

  setMouse(x, y) { this.mouse.set(x, y); }
  /* mirada libre: arrastrar = girar en cualquier dirección (yaw ilimitado, pitch ±85°). Recentra sola al volver a hacer scroll. */
  lookDrag(dx, dy) { const v = this.view, k = .0042 * Math.max(.5, this.cam.fov / 50); v.yaw += dx * k; v.pitch = clamp(v.pitch + dy * k, -1.48, 1.48); v.idle = 0; }
  lookReset() { this.view.reset = true; }

  /* muestrea la pose "ideal" en p */
  sample(p, out = this.sampled) {
    out.shotId = undefined; out.roll = 0;
    if (this.dyn && this.dyn(p, out)) return out;
    const K = this.keys;
    let i = 0;
    while (i < K.length - 2 && p > K[i + 1].p) i++;
    const a = K[i], b = K[i + 1], h = b.p - a.p, t = clamp((p - a.p) / h, 0, 1);
    for (const c of ['x', 'y', 'z']) {
      out.pos[c] = hermite(a.pos[c], b.pos[c], a.mPos[c], b.mPos[c], h, t);
      out.look[c] = hermite(a.look[c], b.look[c], a.mLook[c], b.mLook[c], h, t);
    }
    out.fov = hermite(a.fov, b.fov, a.mS.fov, b.mS.fov, h, t);
    out.roll = hermite(a.roll, b.roll, a.mS.roll, b.mS.roll, h, t);
    out.ap = clamp(hermite(a.ap, b.ap, a.mS.ap, b.mS.ap, h, t), 0, 2);
    // foco: distancia al punto indicado (o al objetivo de mirada)
    const fa = a.focus ? V(a.focus).distanceTo(out.pos) : out.pos.distanceTo(out.look);
    const fb = b.focus ? V(b.focus).distanceTo(out.pos) : out.pos.distanceTo(out.look);
    const s = t * t * (3 - 2 * t);
    out.focus = fa + (fb - fa) * s;
    return out;
  }

  lock(p) { this.locked = p; }

  update(dt, pTarget, time) {
    dt = Math.min(dt, 1 / 20);
    this.pRaw = pTarget;
    const goal = this.locked != null ? this.locked : pTarget;
    // 1) p suavizado: responde al scroll con inercia y se detiene con suavidad
    const k = 1 - Math.exp(-dt * this.stiff);
    this.p += (goal - this.p) * k;
    if (Math.abs(goal - this.p) < 1e-5) this.p = goal;
    const s = this.sample(this.p);
    // corte: al cambiar de plano la cámara salta (sin muelle ni desenfoque de movimiento)
    const sid = s.shotId ?? -1, snap = this._shot !== undefined && sid !== this._shot; this._shot = sid;
    if (snap || this._first) { this.pos.copy(s.pos); this.look.copy(s.look); this.vel.set(0, 0, 0); this.velL.set(0, 0, 0); this.fov = s.fov; this.roll = s.roll; this.ap = s.ap; this.focus = s.focus; this._first = false; this._cut = true; if (snap) this.cutPulse = 1; }
    // 2) muelle crítico sobre la pose (peso de la cámara)
    const w = 15;
    const step = (cur, vel, tgt) => { const f = tgt.clone().sub(cur).multiplyScalar(w * w).addScaledVector(vel, -2 * w); vel.addScaledVector(f, dt); cur.addScaledVector(vel, dt); };
    step(this.pos, this.vel, s.pos); step(this.look, this.velL, s.look);
    const kf = 1 - Math.exp(-dt * 9);
    this.fov += (s.fov - this.fov) * kf; this.roll += (s.roll - this.roll) * kf;
    this.ap += (s.ap - this.ap) * kf; this.focus += (s.focus - this.focus) * (1 - Math.exp(-dt * 5));

    // 3) vida: temblor al hombro + parallax de ratón
    this.mouseS.lerp(this.mouse, 1 - Math.exp(-dt * 3));
    const cam = this.cam;
    const hx = Math.sin(time * .71) * .0032 + Math.sin(time * 1.9) * .0011, hy = Math.sin(time * .53 + 1.3) * .0028 + Math.sin(time * 2.3) * .001;
    cam.position.copy(this.pos);
    if (this.shake > 0) { cam.position.x += (Math.sin(time * 43) + Math.sin(time * 71 + 1.3)) * .5 * this.shake; cam.position.y += (Math.sin(time * 37 + .7) + Math.sin(time * 59)) * .5 * this.shake; }      // vibración de la cabina
    cam.up.set(0, 1, 0);
    // roll: rota el vector "arriba" alrededor del eje de visión
    cam.lookAt(this.look);
    if (this.roll) cam.rotateZ(THREE.MathUtils.degToRad(this.roll));
    // mirada libre: yaw alrededor del eje vertical del mundo, pitch alrededor del eje horizontal de la cámara; se relaja si el scroll avanza
    { const v = this.view, sp = Math.abs(pTarget - v.pPrev) / Math.max(dt, 1e-3); v.pPrev = pTarget; v.idle += dt;
      if (sp > .01 || v.reset) { const kk = 1 - Math.exp(-dt * (v.reset ? 5 : 2.2)); v.yaw -= v.yaw * kk; v.pitch -= v.pitch * kk; if (Math.abs(v.yaw) < 1e-3 && Math.abs(v.pitch) < 1e-3) { v.yaw = v.pitch = 0; v.reset = false; } }
      if (v.yaw || v.pitch) { cam.quaternion.premultiply(this._q.setFromAxisAngle(this._tmp.set(0, 1, 0), v.yaw)); cam.rotateX(v.pitch); } }
    const par = this.parallax * .09;
    cam.translateX(this.mouseS.x * par + hx); cam.translateY(-this.mouseS.y * par * .6 + hy);
    cam.rotateY(-this.mouseS.x * .008); cam.rotateX(this.mouseS.y * .005);
    // en pantallas verticales se abre el fov para conservar el encuadre horizontal
    const asp = innerWidth / innerHeight, fovEff = asp < 1.6 ? 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(this.fov / 2)) * Math.pow(1.6 / asp, .62)) * 180 / Math.PI : this.fov;
    if (Math.abs(cam.fov - fovEff) > .01) { cam.fov = fovEff; cam.updateProjectionMatrix(); }

    // 4) velocidad en pantalla para el motion blur
    const dir = this._tmp.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const dq = this._q.copy(cam.quaternion);
    const focalPx = (0.5 * innerHeight * (window.devicePixelRatio || 1)) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const dPos = cam.position.clone().sub(this.prevPos).applyQuaternion(dq.invert());
    const yaw = Math.atan2(dir.x, -dir.z) - Math.atan2(this.prevDir.x, -this.prevDir.z);
    const pitch = Math.asin(clamp(dir.y, -1, 1)) - Math.asin(clamp(this.prevDir.y, -1, 1));
    const wrap = a => (a > Math.PI ? a - 2 * Math.PI : a < -Math.PI ? a + 2 * Math.PI : a);
    this.fxRot.set(-wrap(yaw) * focalPx, wrap(pitch) * focalPx);
    this.fxTrans.set(-dPos.x * focalPx, dPos.y * focalPx);
    if (this._cut) { this.fxRot.set(0, 0); this.fxTrans.set(0, 0); this._cut = false; }
    this.prevDir.copy(dir); this.prevPos.copy(cam.position);
  }
}
