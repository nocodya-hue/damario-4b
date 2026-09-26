/* =========================================================
   HUMAN — humano real (malla MakeHuman/MPFB CC0 generada en tools/make_humans.py)
   Carga el GLB (cuerpo con skin + ojos + córnea + pestañas + cejas + dientes + lengua + pelo
   + 34 morph targets de expresión) y ofrece:
     - mapa de huesos con nombres propios (hips, spine, chest, uArmL… wristL = hueso de la mano)
     - IK de 2 huesos y orientación de mano sobre el esqueleto REAL (posición de reposo en A)
     - dedos con eje de flexión calculado por geometría (extras del GLB)
     - expresión facial: mezcla semántica → unidades de expresión (morph targets)
     - mirada con huesos de ojo
     - métricas de la cabeza (para gorras, bocadillos, oído, boca)
   ========================================================= */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeSkin, refineFace } from './skin.js';

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

const NAMES = { hips: 'pelvis', spine: 'spine_01', spine2: 'spine_02', chest: 'spine_03', neck: 'neck_01', head: 'head', clavL: 'clavicle_l', clavR: 'clavicle_r',
  uArmL: 'upperarm_l', lArmL: 'lowerarm_l', wristL: 'hand_l', uArmR: 'upperarm_r', lArmR: 'lowerarm_r', wristR: 'hand_r',
  thighL: 'thigh_l', shinL: 'calf_l', ankleL: 'foot_l', ballL: 'ball_l', thighR: 'thigh_r', shinR: 'calf_r', ankleR: 'foot_r', ballR: 'ball_r', eyeL: 'eye_l', eyeR: 'eye_r' };
const CHILD = { upperarm_l: 'lowerarm_l', lowerarm_l: 'hand_l', upperarm_r: 'lowerarm_r', lowerarm_r: 'hand_r', thigh_l: 'calf_l', calf_l: 'foot_l', thigh_r: 'calf_r', calf_r: 'foot_r', clavicle_l: 'upperarm_l', clavicle_r: 'upperarm_r', foot_l: 'ball_l', foot_r: 'ball_r' };
const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];

const loader = new GLTFLoader();
const _qI = new THREE.Quaternion(), _v = V3(), _v2 = V3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();

export async function loadHuman(name, q, F) {
  const gltf = await loader.loadAsync(`assets/humans/${name}.glb`);
  const meta = await (await fetch(`assets/humans/${name}.json`)).json();
  return new Human(gltf, meta, q, F);
}

export class Human {
  constructor(gltf, meta, q, F) {
    this.gltf = gltf; this.meta = meta; this.q = q; this.scene = gltf.scene; this.scene.name = 'human';
    this.bones = {}; this.meshes = {}; this.b = {}; this.restDir = {};
    this.scene.traverse(o => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.isSkinnedMesh) { this.meshes[o.name.toLowerCase()] = o; o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true; }
    });
    for (const [k, n] of Object.entries(NAMES)) this.b[k] = this.bones[n];
    this.scene.updateMatrixWorld(true);
    this.rest = {}; for (const n in this.bones) this.rest[n] = this.bones[n].getWorldPosition(V3());
    for (const [b, c] of Object.entries(CHILD)) this.restDir[b] = this.bones[c].position.clone().normalize();
    this.k = meta.height / 1.75;
    this._morphMaps();
    this._headMetrics();
    this._handFrames();
    this._fingerRigs();
    this._materials(F);
  }

  /* ------------------------------------------------ morph targets */
  _morphMaps() {
    this.morph = []; // [{mesh, map: name→index}]
    for (const m of Object.values(this.meshes)) {
      if (!m.morphTargetDictionary) {
        const tn = m.geometry?.userData?.targetNames || m.userData?.targetNames; if (!tn) continue;
      }
      if (m.morphTargetDictionary) this.morph.push({ mesh: m, map: m.morphTargetDictionary });
    }
    this.mw = {};                                             // pesos actuales por unidad
  }
  setUnit(name, v) { this.mw[name] = v; }
  applyUnits() {
    for (const { mesh, map } of this.morph) { const inf = mesh.morphTargetInfluences; for (const n in map) inf[map[n]] = this.mw[n] || 0; }
  }

  /* expresión semántica (0..1) → unidades de expresión */
  express(e) {
    const u = this.mw, c = (x) => clamp(x, 0, 1);
    const blinkL = c(e.blink + (e.blinkL || 0) + e.smile * .22 + e.browAngry * .12), blinkR = c(e.blink + (e.blinkR || 0) + e.smile * .22 + e.browAngry * .12);
    u['eye-left-closure'] = blinkL; u['eye-right-closure'] = blinkR;
    u['eye-left-opened-up'] = c(e.browUp * .5 + (e.surprise || 0) * .6) * (1 - blinkL); u['eye-right-opened-up'] = u['eye-left-opened-up'];
    u['eye-left-slit'] = u['eye-right-slit'] = c(e.browAngry * .45);
    u['eyebrows-left-up'] = u['eyebrows-right-up'] = c(e.browUp * .9);
    u['eyebrows-left-inner-up'] = u['eyebrows-right-inner-up'] = c(e.browUp * .3 + e.frown * .6);
    u['eyebrows-left-extern-up'] = u['eyebrows-right-extern-up'] = c(e.browUp * .5);
    u['eyebrows-left-down'] = u['eyebrows-right-down'] = c(e.browAngry);
    u['mouth-open'] = c(e.jaw * 1.0 + (e.surprise || 0) * .4);
    u['mouth-corner-puller'] = c(e.smile * .9);
    u['mouth-upward-retraction'] = c(e.smile * .3 + (e.laugh || 0) * .4);
    u['mouth-elevation'] = c(e.smile * .12);
    u['mouth-depression'] = c(e.frown * .7); u['mouth-depression-retraction'] = c(e.frown * .4);
    u['mouth-pursing'] = c(e.oh); u['mouth-protusion'] = c(e.oh * .55);
    u['mouth-compression'] = c(e.browAngry * .35 + (e.press || 0));
    u['nose-compression'] = c(e.browAngry * .3); u['nose-left-elevation'] = u['nose-right-elevation'] = c(e.smile * .2 + e.browAngry * .2);
    u['neck-platysma'] = c(e.jaw * .3 + (e.strain || 0));
    this.applyUnits();
    if (this.skin) this.skin.skinUniforms.uWr.value.set(e.browUp || 0, Math.max(e.smile || 0, e.laugh || 0), e.browAngry || 0, e.strain || 0);
  }

  /* ------------------------------------------------ métricas de cabeza (en el espacio del hueso 'head') */
  _headMetrics() {
    const body = this.meshes.body, pos = body.geometry.attributes.position, si = body.geometry.attributes.skinIndex, sw = body.geometry.attributes.skinWeight;
    const skel = body.skeleton, headIdx = skel.bones.indexOf(this.b.head), neckIdx = skel.bones.indexOf(this.b.neck);
    const hb = this.b.head, inv = new THREE.Matrix4().copy(hb.matrixWorld).invert(), p = V3(), box = new THREE.Box3();
    for (let i = 0; i < pos.count; i++) {
      let w = 0; for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === headIdx) w += sw.getComponent(i, k);
      if (w < .9) continue; p.fromBufferAttribute(pos, i).applyMatrix4(inv); if (p.y > .02) box.expandByPoint(p);
    }
    const c = box.getCenter(V3()), s = box.getSize(V3());
    const eye = this.bones.eye_l.getWorldPosition(V3()).applyMatrix4(inv);
    this.H = { root: hb, cy: c.y, cz: c.z, hw: s.x / 2, hh: s.y / 2, hd: s.z / 2, ey: eye.y, box, eyeSep: eye.x };
    // boca: centro de los dientes en el espacio de la cabeza
    const teeth = this.meshes.teeth; if (teeth) { const tb = new THREE.Box3().setFromBufferAttribute(teeth.geometry.attributes.position); const tc = tb.getCenter(V3()); this.H.mouth = tc.applyMatrix4(inv); this.H.mouth.z += .012; }
    else this.H.mouth = V3(0, c.y - s.y * .3, c.z + s.z * .5);
  }

  /* ------------------------------------------------ manos: marcos de reposo y "sockets" para objetos */
  _handFrames() {
    this.hand = {};
    for (const s of ['l', 'r']) {
      const hb = this.bones['hand_' + s], ex = hb.userData || {}, fr = ex.fingerDir, pl = ex.palmDir;
      const f = V3().fromArray(fr), p = V3().fromArray(pl);
      const thumbDir = this.rest['thumb_01_' + s].clone().sub(this.rest['hand_' + s]);
      // marco del "socket": +Y = -dedos, +Z = lado del pulgar, +X = Y × Z
      const y = f.clone().negate().normalize();
      let z = thumbDir.clone().addScaledVector(y, -thumbDir.dot(y)).normalize();
      const x = V3().crossVectors(y, z).normalize();
      const sock = new THREE.Object3D(); sock.name = 'socket_' + s; sock.quaternion.setFromRotationMatrix(_m.makeBasis(x, y, z)); hb.add(sock);
      const palmSign = Math.sign(x.dot(p)) || 1;
      this.hand[s] = { fingerRest: f.normalize(), palmRest: p.normalize(), sock, palmSign, bone: hb, thumb: z.clone(), basis: { x, y, z: z.clone() } };
      { const H = this.hand[s], rf = H.fingerRest, rp = H.palmRest.clone().addScaledVector(rf, -H.palmRest.dot(rf)).normalize(), rz = V3().crossVectors(rf, rp).normalize(); H.dec = { a: z.dot(rf), b: z.dot(rp), c: z.dot(rz) }; }
    }
  }

  /* posición en el marco del socket de un punto en coordenadas de REPOSO del mundo (para colgar objetos entre dedos) */
  holdRest(side, p) { const H = this.hand[side], v = p.clone().sub(this.rest['hand_' + side]); return V3(v.dot(H.basis.x), v.dot(H.basis.y), v.dot(H.basis.z)); }

  /* punto de anclaje de la mano (marco del socket): 'palm' = centro de la palma sobre la piel; 'gap' = entre índice y corazón */
  anchorLocal(side, kind) {
    const R = this.rest, H = this.hand[side], s = side; let P;
    if (kind === 'gap') P = R['index_01_' + s].clone().add(R['middle_01_' + s]).add(R['index_02_' + s]).add(R['middle_02_' + s]).multiplyScalar(.25);
    else P = R['hand_' + s].clone().add(R['middle_01_' + s]).multiplyScalar(.5).addScaledVector(H.palmRest, .010);
    return this.holdRest(side, P);
  }
  /* dirección de la palma para que el eje del pulgar (eje del cigarrillo) apunte a dThumb con los dedos hacia fing; bias = preferencia de palma */
  orientThumb(side, fing, dThumb, bias) {
    const H = this.hand[side], { a, b, c } = H.dec, f = fing.clone().normalize(), h = Math.abs(f.y) < .9 ? V3(0, 1, 0) : V3(1, 0, 0);
    const e1 = h.clone().addScaledVector(f, -h.dot(f)).normalize(), e2 = V3().crossVectors(f, e1);
    let best = null, bs = -1e9; const d = dThumb.clone().normalize();
    for (let i = 0; i < 72; i++) { const th = i / 72 * Math.PI * 2, p = e1.clone().multiplyScalar(Math.cos(th)).addScaledVector(e2, Math.sin(th)); const T = f.clone().multiplyScalar(a).addScaledVector(p, b).addScaledVector(V3().crossVectors(f, p), c); const sc = T.dot(d) * 10 + (bias ? p.dot(bias) * .4 : 0); if (sc > bs) { bs = sc; best = p; } }
    return best;
  }

  /* dedos: eje de flexión y nombres de huesos */
  _fingerRigs() {
    this.fingers = { l: [], r: [] };
    for (const s of ['l', 'r']) for (const f of FINGERS) {
      const chain = [1, 2, 3].map(k => { const b = this.bones[`${f}_0${k}_${s}`]; const ex = b.userData || {}; return { bone: b, axis: V3().fromArray(ex.axis), dir: V3().fromArray(ex.dir) }; });
      this.fingers[s].push(chain);
    }
  }
  /* c: curl [índice, corazón, anular, meñique] 0..1.5; th: [flexión, abducción] del pulgar; spread: separación */
  poseHand(side, c = [0, 0, 0, 0], th = [0, 0, 0], spread = 0) {
    const chains = this.fingers[side];
    // pulgar
    const T = chains[0];
    const ta = (.25 + th[1] * .5), tf = th[0];
    const palm = this.hand[side].palmRest, thumbAxis2 = this.hand[side].fingerRest.clone().cross(palm).normalize();
    T[0].bone.quaternion.setFromAxisAngle(T[0].axis, tf * .45 + .18).multiply(_q.setFromAxisAngle(thumbAxis2, -ta * .5 * (side === 'l' ? 1 : -1)));
    T[1].bone.quaternion.setFromAxisAngle(T[1].axis, tf * .8); T[2].bone.quaternion.setFromAxisAngle(T[2].axis, tf * .75);
    for (let i = 1; i < 5; i++) {
      const ch = chains[i], v = c[i - 1] ?? c[0];
      const sp = (i - 2.5) * spread * .08 * (side === 'l' ? 1 : -1);
      ch[0].bone.quaternion.setFromAxisAngle(ch[0].axis, v * .78 + .10);
      if (spread) ch[0].bone.quaternion.multiply(_q.setFromAxisAngle(this.hand[side].palmRest, sp));
      ch[1].bone.quaternion.setFromAxisAngle(ch[1].axis, v * 1.0 + .08); ch[2].bone.quaternion.setFromAxisAngle(ch[2].axis, v * .68 + .04);
    }
  }


  /* pulgar que alcanza un punto del mundo (botón o palanca): CCD sobre las 3 falanges partiendo de la pose de los dedos; w = mezcla 0..1 con la pose libre */
  reachThumb(side, target, w = 1) { return this.reachFinger(side, 0, target, w, .027); }
  reachFinger(side, fi, target, w = 1, TIP = .022) {
    const bones = this.fingers[side][fi].map(c => c.bone), saved = bones.map(b => b.quaternion.clone());
    const p1 = V3(), p2 = V3(), p3 = V3(), tip = V3(), d1 = V3(), d2 = V3(), qq = new THREE.Quaternion(), qw = new THREE.Quaternion();
    const tipPos = () => { bones[0].updateMatrixWorld(true); bones[2].getWorldPosition(p3); bones[1].getWorldPosition(p2); return tip.copy(p3).addScaledVector(p3.clone().sub(p2).normalize(), TIP); };
    bones[0].parent.updateWorldMatrix(true, false);
    for (let it = 0; it < 8; it++) {
      for (let i = 2; i >= 0; i--) {
        const b = bones[i]; b.getWorldPosition(p1); tipPos(); d1.copy(tip).sub(p1); d2.copy(target).sub(p1); if (d1.lengthSq() < 1e-8 || d2.lengthSq() < 1e-8) continue;
        qq.setFromUnitVectors(d1.normalize(), d2.normalize()); qq.slerp(_qI, i === 0 ? .55 : .3);          // pasos parciales: reparte el giro entre las 3 falanges
        b.getWorldQuaternion(qw); qw.premultiply(qq); this.setWorldQuat(b, qw);
      }
      if (tipPos().distanceTo(target) < .0025) break;
    }
    if (w < 1) bones.forEach((b, i) => { b.quaternion.slerp(saved[i], 1 - w); }); bones[0].updateMatrixWorld(true);
    return tipPos().distanceTo(target);
  }

  /* ------------------------------------------------ IK y orientación */
  aim(bone, dirWorld) {
    bone.parent.getWorldQuaternion(_q).invert();
    const d = _v.copy(dirWorld).normalize().applyQuaternion(_q);
    bone.quaternion.setFromUnitVectors(this.restDir[bone.name], d);
    bone.updateMatrixWorld(true);
  }
  ik2(root, mid, end, target, pole) {
    const A = root.getWorldPosition(_v2).clone();
    const L1 = mid.position.length(), L2 = end.position.length();
    const d = target.clone().sub(A); const dist = d.length(), dir = d.clone().normalize();
    const reach = clamp(dist, Math.abs(L1 - L2) + .002, L1 + L2 - .002);
    const cosA = clamp((L1 * L1 + reach * reach - L2 * L2) / (2 * L1 * reach), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    const pv = pole.clone().sub(A); pv.addScaledVector(dir, -pv.dot(dir)); if (pv.lengthSq() < 1e-6) pv.set(0, 0, 1); pv.normalize();
    const E = A.clone().addScaledVector(dir, L1 * cosA).addScaledVector(pv, L1 * sinA);
    this.aim(root, E.clone().sub(A));
    const T = A.clone().addScaledVector(dir, reach);
    this.aim(mid, T.clone().sub(E));
    return dist;
  }
  setWorldQuat(obj, qw) { obj.parent.getWorldQuaternion(_q2).invert(); obj.quaternion.copy(_q2.multiply(qw)); obj.updateMatrixWorld(true); }

  /* mano: dedos hacia fingerDir, palma hacia palmDir (mundo) */
  orientHand(side, fingerDir, palmDir) {
    const H = this.hand[side];
    const f = fingerDir.clone().normalize(); let p = palmDir.clone(); p.addScaledVector(f, -p.dot(f)); if (p.lengthSq() < 1e-6) p.set(0, 0, 1); p.normalize();
    const z = V3().crossVectors(f, p).normalize();
    const Rd = new THREE.Matrix4().makeBasis(f, p, z);
    const rf = H.fingerRest, rp = H.palmRest.clone().addScaledVector(rf, -H.palmRest.dot(rf)).normalize(), rz = V3().crossVectors(rf, rp).normalize();
    const Rr = new THREE.Matrix4().makeBasis(rf, rp, rz);
    const qd = new THREE.Quaternion().setFromRotationMatrix(Rd), qr = new THREE.Quaternion().setFromRotationMatrix(Rr);
    this.setWorldQuat(H.bone, qd.multiply(qr.invert()));
  }

  /* mirada: reparte yaw/pitch entre cuello y cabeza; ojos aparte */
  look(targetWorld, o = {}) {
    const { neck, head, chest } = this.b, maxYaw = o.maxYaw ?? 1.15, maxPitch = o.maxPitch ?? .6, share = o.share ?? .4, roll = o.roll || 0, s = o.smooth ?? .15;
    const headC = head.getWorldPosition(V3()); headC.y += .1;
    const inv = chest.getWorldQuaternion(_q).invert(); const d = targetWorld.clone().sub(headC).applyQuaternion(inv);
    let yaw = Math.atan2(d.x, d.z), pitch = -Math.atan2(d.y, Math.hypot(d.x, d.z));
    yaw = clamp(yaw, -maxYaw, maxYaw); pitch = clamp(pitch + (o.pitchBias || 0), -maxPitch, maxPitch);
    const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch * share, yaw * share, roll * .3, 'YXZ')), q2 = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch * (1 - share), yaw * (1 - share), roll * .7, 'YXZ'));
    neck.quaternion.slerp(q1, s); head.quaternion.slerp(q2, s);
  }
  eyes(yaw, pitch) { for (const e of [this.b.eyeL, this.b.eyeR]) e.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')); }

  /* ------------------------------------------------ materiales */
  _materials(F) {
    const env = F?.env, ei = F?.envIntensity ?? .45;
    this.scene.traverse(o => {
      if (!(o.isMesh || o.isSkinnedMesh)) return;
      const m = o.material; if (!m) return; const kind = m.userData?.kind || m.name;
      m.envMap = env || null; m.envMapIntensity = kind === 'skin' ? .5 : ei;
      if (kind === 'skin') { m.roughness = .58; m.metalness = 0; }
      if (kind === 'eye') { m.roughness = .3; m.envMapIntensity = .35; }
      if (kind === 'cornea') { m.transparent = true; m.opacity = .06; m.roughness = 0; m.envMapIntensity = .9; m.depthWrite = false; m.color.set(0xffffff); o.renderOrder = 3; }
      if (kind === 'teeth') { m.roughness = .3; }
      if (kind === 'hair' || kind === 'eyebrows' || kind === 'eyelashes') { m.side = THREE.DoubleSide; m.alphaTest = .35; m.transparent = false; m.depthWrite = true; }
      if (kind === 'hair') { m.roughness = .62; m.envMapIntensity = .2; m.color.multiplyScalar(.6); }
      m.needsUpdate = true;
    });
    const body = this.meshes.body; if (body) { this.skin = makeSkin(this, F, body.material); body.material = this.skin; }
    refineFace(this, F);
  }
}
