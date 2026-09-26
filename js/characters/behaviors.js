/* =========================================================
   COMPORTAMIENTOS — la vida de cada personaje
   Cada uno es una función (t, dt, env) que escribe OBJETIVOS en el actor: cadera, columna,
   pies, manos, mirada, expresión. Los movimientos son ciclos con ruido y máquinas de
   estados con duraciones aleatorias: nada es un bucle mecánico.
   Los "cues" (A.cue) los manda el director de la historia (diálogos, gestos, atención).
   ========================================================= */
import * as THREE from 'three';
import { V3, clamp, lerp, sstep } from './human.js';
import { Spring1, Spring3 } from './actor.js';
import { buildPad } from '../world/props.js';
import { L } from '../world/layout.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const v = (x, y, z) => new THREE.Vector3(x, y, z);
const tmp = { a: v(0, 0, 0), b: v(0, 0, 0), c: v(0, 0, 0), d: v(0, 0, 0) };

/* Mira hacia donde indique la atención del director (A.attn) o a un punto por defecto */
function gaze(A, t, dflt, o = {}) {
  const at = A.attn && t < A.attn.until ? A.attn : null;
  A.lookAt(at ? at.p : dflt, at ? { w: 8, ...o, ...(at.o || {}) } : { w: 6, ...o });
}
const seatHip = (A, extra = 0) => A.spec.seatY + .115 + extra;

/* ============ JUGADOR: sofá, mando, pulgares, reacciones ============ */
export function setupGamer(A, world, scene, M) {
  const pad = buildPad(M, 0x8d9096, 0x161616); scene.add(pad); pad.scale.setScalar(1.1);
  A.props = { pad }; A.cueHandlers = { laugh: (t) => A.laughAt(1.8) };
  const st = { lean: new Spring1(.3), react: null, mash: 0, nextGlance: rnd(6, 10), shake: 0, wL: null, wR: null };
  return (t, dt, env) => {
    const k = A.k, tv = env.tv, hp = A.hip;
    // eventos del juego
    if (tv && tv.event === 'hit') { st.react = { type: 'hit', t0: t, dur: 2.2 }; A.say(0); A.exT.jaw = 0; }
    if (tv && tv.event === 'win') st.react = { type: 'win', t0: t, dur: 1.8 };
    const rt = st.react ? (t - st.react.t0) / st.react.dur : 2;
    const hit = st.react?.type === 'hit' && rt < 1 ? Math.sin(Math.min(1, rt * 1.6) * Math.PI) : 0, win = st.react?.type === 'win' && rt < 1 ? Math.sin(rt * Math.PI) : 0;
    if (rt >= 1) st.react = null;
    // cadera y columna: inclinado hacia la pantalla, se echa atrás al perder y salta al ganar
    hp.y = seatHip(A) + win * .012; hp.z = -.10 * k; hp.pitch = -.03;
    const lean = .34 + .04 * Math.sin(t * .45) - hit * .34 + win * .04;
    A.spinePitch.follow(lean * .5, dt, 5); A.chestPitch.follow(lean * .55 + Math.sin(t * .9) * .008, dt, 5);
    A.chestYaw.follow(hit * .05 + Math.sin(t * .31) * .02, dt, 4); A.chestRoll.follow(Math.sin(t * .27) * .02 + hit * .03, dt, 4);
    // piernas: sentado, pies en el suelo, uno marca el ritmo
    const tap = Math.max(0, Math.sin(t * 6.2)) * (Math.sin(t * .3) > .1 ? 1 : 0);
    A.setFoot('L', A.W(.14 * k, A.ankleH, .36 * k), .1, 0, A.W(.2 * k, 1, .9 * k));
    A.setFoot('R', A.W(-.15 * k, A.ankleH + tap * .012, .34 * k), -.12, tap * .12, A.W(-.22 * k, 1, .9 * k));
    // mando: ante el pecho, hacia abajo; tiembla al machacar botones y se sacude al perder
    const act = .55 + .45 * Math.sin(t * .7) ** 2, mash = hit ? 1.6 : act;
    st.shake = hit * Math.sin(t * 40) * .01;
    const chest = A.rig.b.chest.getWorldPosition(tmp.a);
    const pc = A.W(0, 0, 0, tmp.b).set(chest.x, 0, chest.z); void pc;
    const ge = A.talking ? A.mv.jaw.p * A.energy : 0; A.padG.lerp(v(0, A.talking ? .035 * ge + .012 * Math.sin(t * 5.1) : 0, A.talking ? .05 * ge : 0), 1 - Math.exp(-dt * 8));   // al hablar sube el mando con las manos
    const padP = A.W(0 + st.shake, .80 * k + Math.sin(t * 6) * .002 * act + A.padG.y, .34 * k + hit * .05 + A.padG.z, tmp.c);
    pad.position.copy(padP);
    pad.quaternion.copy(A.root.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-.75 + hit * .3 + Math.sin(t * 1.3) * .03, Math.PI + Math.sin(t * .5) * .05 + st.shake * 5, Math.sin(t * 5) * .012 * act)));
    pad.updateMatrixWorld(true);
    // AGARRE: cada mano rodea su empuñadura como un asa: la palma apoya en el lado exterior-inferior, los cuatro dedos pasan por debajo y suben por dentro, y el pulgar queda libre sobre la cara superior
    const xP = v(1, 0, 0).applyQuaternion(pad.quaternion), yP = v(0, 1, 0).applyQuaternion(pad.quaternion), zP = v(0, 0, 1).applyQuaternion(pad.quaternion);
    const inw = (sx) => xP.clone().multiplyScalar(-sx);
    const gp = (sx) => pad.localToWorld(v(sx * .066, -.004, .012)).addScaledVector(inw(sx), -.024).addScaledVector(yP, -.014);
    const gA = gp(1), gB = gp(-1), isLeftA = A.root.worldToLocal(gA.clone()).x > 0;
    const gL = isLeftA ? gA : gB, gR = isLeftA ? gB : gA, sxL = isLeftA ? 1 : -1;
    const pole = (sx) => A.W(sx * .38 * k, .6 * k, .05 * k, v(0, 0, 0));
    const palmOf = (sx) => inw(sx).multiplyScalar(.85).addScaledVector(yP, .5).normalize(), fingOf = (sx) => inw(sx).multiplyScalar(.5).addScaledVector(yP, -.85).addScaledVector(zP, -.12).normalize();
    if (!st.wL) { st.wL = A.T.handL.p.clone(); st.wR = A.T.handR.p.clone(); }
    st.wL.copy(A.handWorld.L).addScaledVector(gL.clone().sub(A.anchor('L', 'palm', tmp.a)), .6); st.wR.copy(A.handWorld.R).addScaledVector(gR.clone().sub(A.anchor('R', 'palm', tmp.b)), .6);
    const fl = Math.abs(Math.sin(t * 9.3)) * mash, fr = Math.abs(Math.sin(t * 7.7 + 1)) * mash;
    A.setHand('L', st.wL, palmOf(sxL), fingOf(sxL), { c: [.62 + fl * .25, 1.05 + fl * .12, 1.16, 1.28], th: [.5 + Math.sin(t * 8.1) * .2 * mash, .3 + Math.sin(t * 5.3) * .15 * mash, 0], w: 22 }, pole(1));
    A.setHand('R', st.wR, palmOf(-sxL), fingOf(-sxL), { c: [.62 + fr * .25, 1.05 + fr * .12, 1.16, 1.28], th: [.5 + Math.sin(t * 7.1 + 2) * .25 * mash, .3 + Math.cos(t * 6.3) * .15 * mash, 0], w: 22 }, pole(-1));
    // PULGARES: cada mano es de un lado del mando; el de la palanca izquierda la mueve, el del lado de los botones los pulsa por turnos (más rápido si el juego se pone difícil)
    { const btn = [[.05, -.012], [.068, .002], [.05, .016], [.032, .002]], rate = 3.4 + 3.2 * mash, TT = st.thumb ||= { L: { p: v(0, 0, 0), w: 0 }, R: { p: v(0, 0, 0), w: 0 } };
      for (const [sd, sx] of [['L', sxL], ['R', -sxL]]) {
        let lx, lz, ly = .037;
        if (sx < 0) { lx = -.04 + Math.sin(t * 3.3 + 1) * .008 * (.6 + mash * .5); lz = .026 + Math.cos(t * 2.7) * .008 * (.6 + mash * .5); }         // palanca izquierda
        else { const ph = t * rate * .8 + (sd === 'L' ? .3 : 0), k = Math.floor(ph) % 10, f = ph % 1, bi = (Math.floor(ph / 10) * 3 + k) % 4;
          if (k >= 3) { lx = .04 + Math.sin(t * 2.9) * .007; lz = .026 + Math.cos(t * 3.4) * .007; }                                              // de vez en cuando la palanca derecha
          else { [lx, lz] = btn[bi]; ly -= .0055 * Math.sin(Math.min(1, f * 2.6) * Math.PI) * (f < .38 ? 1 : 0); } }                             // pulsación
        TT[sd].p.copy(pad.localToWorld(v(lx, ly, lz))); TT[sd].w = 1; }
      A.thumbT = TT;
      // ÍNDICES: llegan a los gatillos del borde delantero y los aprietan a ratos (más seguido cuando el juego se acelera); el resto de dedos siguen agarrando la empuñadura
      const FT = st.trig ||= { L: { p: v(0, 0, 0), w: 0 }, R: { p: v(0, 0, 0), w: 0 } };
      for (const [sd, sx, ph] of [['L', sxL, 0], ['R', -sxL, 1.9]]) { const pr = Math.max(0, Math.sin(t * (2.3 + 2.6 * mash) + ph)) ** 3, tr = pad.userData.triggers[sx > 0 ? 1 : 0];
        tr.rotation.x = -.25 + pr * .16; tr.position.y = .014 - pr * .003;
        FT[sd].p.copy(pad.localToWorld(v(sx * .052, .030 - pr * .004, -.05))); FT[sd].w = 1; }
      A.fingerT = FT; }
    // mirada: pantalla; de vez en cuando mira a la del teléfono; cambia de cara según el juego
    if (t > st.nextGlance && !A.attn) { A.attn = { p: env.actors.phone.eyeW.clone(), until: t + rnd(1.2, 2.2), o: { pitchBias: 0 } }; st.nextGlance = t + rnd(7, 13); }
    const scr = env.screenCenter || v(L.tv.x, L.tv.y, L.tv.z);
    gaze(A, t, scr, { pitchBias: -.02 });
    A.express({ browUp: .2 + Math.sin(t * .9) * .1 + win * .6 - hit * .3, browAngry: hit * 1.0, frown: hit * .7, smile: win * 1 + .08 * Math.max(0, Math.sin(t * .6)), oh: 0 });
    A.exT.jaw = hit * (.5 + .5 * Math.sin(t * 22)) * (rt < .5 ? 1 : 0);
  };
}

/* ============ TELÉFONO: móvil, escucha, gesto de "espera", se levanta y camina ============ */
export function setupPhone(A, world, scene, M) {
  const phone = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(.008, .15, .072), new THREE.MeshStandardMaterial({ color: 0x111114, roughness: .3, metalness: .6 })); phone.add(body);
  const scrTex = document.createElement('canvas'); scrTex.width = 128; scrTex.height = 256; const sg = scrTex.getContext('2d');
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(.066, .142), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(scrTex), toneMapped: false })); screen.rotation.y = Math.PI / 2; screen.position.x = .0042; phone.add(screen);
  screen.material.map.colorSpace = THREE.SRGBColorSpace;
  scene.add(phone);
  const drawScreen = (t, mode) => { sg.fillStyle = mode === 'call' ? '#1d1730' : '#0f1418'; sg.fillRect(0, 0, 128, 256); if (mode === 'call') { sg.fillStyle = '#ff7ab0'; sg.beginPath(); sg.arc(64, 90, 30, 0, 7); sg.fill(); sg.fillStyle = '#fff'; sg.font = '600 16px sans-serif'; sg.textAlign = 'center'; sg.fillText('Mamá', 64, 150); sg.fillStyle = '#7dffb0'; sg.fillText(String(Math.floor(t % 60)).padStart(2, '0') + ' s', 64, 176); } else { for (let i = 0; i < 6; i++) { sg.fillStyle = i % 2 ? '#2b3a4a' : '#ff7ab0'; sg.fillRect(i % 2 ? 40 : 10, 20 + i * 34, 78 - (i * 7) % 30, 22); } } screen.material.map.needsUpdate = true; };
  const S = { state: 'screen', t0: 0, dur: 4, glance: null, standT: 0, nextStand: 26, walking: 0, cross: 0, buzz: 0, finger: 0, hipDy: new Spring1(0), pace: new Spring1(0), yaw: new Spring1(0) };
  A.gestSide = 'L';
  const seq = ['screen'];
  let idx = 0;
  const go = (s, dur, t) => { S.state = s; S.t0 = t; S.dur = dur; };
  A.props = { phone }; A.phoneGo = (n, d = 60) => go(n, d, A.t);
  A.cueHandlers = { wait: (t) => { go('wait', 3.2, t); }, laugh: (t) => { S.laugh = t; A.laughAt(1.6); }, show: (t) => { go('show', 3.4, t); } };
  return (t, dt, env) => {
    const k = A.k, hp = A.hip, b = A.rig.b, H = A.head;
    if (S.t0 === 0) { S.t0 = t; go('screen', 3, t); }
    if (t - S.t0 > S.dur && !['wait', 'stand'].includes(S.state)) { idx = (idx + 1) % seq.length; go(seq[idx], rnd(3, 5), t); }
    if ((S.state === 'wait' || S.state === 'show') && t - S.t0 > S.dur) go('screen', 3, t);
    // durante su plano (p≈.40–.47) está al teléfono, con la cara a la vista
    // en su escena se levanta, da unos pasos hablando y vuelve a sentarse (una vez por pasada)
    const st = S.state, u = (t - S.t0) / S.dur;
    // teléfono vibra de vez en cuando
    S.buzz = Math.max(0, S.buzz - dt); if (Math.random() < dt * .05) S.buzz = .9;
    drawScreen(t, st === 'screen' || st === 'show' ? 'chat' : 'call');
    // --- de pie / caminata corta (2 pasos, vuelta, se sienta) ---
    let stand = 0;
    if (st === 'stand') { const x = (t - S.t0); stand = sstep(0, 1.3, x) * (1 - sstep(S.dur - 1.6, S.dur - .2, x)); if (x > S.dur) go('screen', 3, t); }
    const walkPhase = st === 'stand' ? Math.max(0, (t - S.t0) - 1.3) : 0, walk = st === 'stand' ? (sstep(1.3, 2.2, t - S.t0) * (1 - sstep(S.dur - 3.2, S.dur - 2.0, t - S.t0))) : 0;
    const pace = S.pace.follow(walk * 0.55 * Math.sin(walkPhase * .9 - .6 * 0), dt, 5);   // metros a lo largo de -z local (adelante/atrás)
    // cadera
    const seatY = A.spec.seatY, standY = A.restHipY;
    hp.y = lerp(seatHip(A), standY, stand); hp.z = lerp(-.14 * k, .62 * k + pace, stand); hp.x = 0; hp.pitch = lerp(-.05, 0, stand);
    const roll = st === 'ear' || st === 'wait' ? .1 : 0;
    const leanF = lerp(-.14 + (st === 'screen' ? .16 : 0) + Math.sin(t * .5) * .02, .02, stand);
    A.spinePitch.follow(leanF * .5, dt, 4); A.chestPitch.follow(leanF * .5, dt, 4); A.chestRoll.follow(roll * .5 + Math.sin(t * .4) * .015, dt, 4); A.chestYaw.follow(st === 'wait' ? .15 : Math.sin(t * .23) * .05, dt, 4);
    // rocker: se mece con el peso
    const rk = A.env?.rockerBody; if (env.rockerBody) env.rockerBody.rotation.x = Math.sin(t * .8) * .014 * (1 - stand) + (st === 'ear' ? Math.sin(t * 1.9) * .004 : 0);
    // piernas (sentada: una sobre otra a ratos)
    const cross = sstep(0, 1, Math.sin(t * .13) * 2);
    const sitL = A.W(.13 * k, A.ankleH, .34 * k, tmp.a.clone()), sitR = A.W(-.12 * k + cross * .16 * k, A.ankleH + cross * .16 * k, .28 * k, tmp.b.clone());
    const step = walk > 0 ? Math.sin(walkPhase * 4.2) : 0;
    const standL = A.W(.1 * k, A.ankleH + Math.max(0, step) * .1 * walk, .62 * k + pace + step * .07 * walk, tmp.c.clone()), standR = A.W(-.1 * k, A.ankleH + Math.max(0, -step) * .1 * walk, .62 * k + pace - step * .07 * walk, tmp.d.clone());
    A.setFoot('L', sitL.lerp(standL, stand), .18, 0, A.W(.2 * k, 1, .9 * k)); A.setFoot('R', sitR.lerp(standR, stand), -.05, 0, A.W(-.22 * k, 1, .9 * k));
    // --- brazos según estado ---
    const hd = H.root.localToWorld(v(0, H.cy, H.cz)), earR = H.root.localToWorld(v(-H.hw * 1.02, H.cy - .008, H.cz)), earFace = H.root.localToWorld(v(0, H.cy - .03, H.cz + H.hd * 1.1));
    const c = A.rig.b.chest.getWorldPosition(tmp.a.clone());
    let rTarget, rFing, rPalm, lTarget, lFing, lPalm, lPose = { c: [.2, .2, .2, .2], th: [.1, .1, 0] }, rPose = { c: [1, 1, 1, 1], th: [.4, .3, 0] };
    const q = A.root.quaternion, dir = (x, y, z) => v(x, y, z).applyQuaternion(q).normalize();
    if (st === 'screen' || st === 'show') {
      rTarget = c.clone().add(v(-.12 * k, -.08 * k, .27 * k).applyQuaternion(q)); rFing = dir(-.05, .85, .5); rPalm = dir(.25, .5, -.8);
      lTarget = c.clone().add(v(.06 * k, -.14 * k, .28 * k).applyQuaternion(q)); lFing = dir(-.3, .5, .6); lPalm = dir(-.5, .3, -.5);
      lPose = { c: [.15 + Math.abs(Math.sin(t * 5)) * .6, .9, 1.0, 1.05], th: [.2 + Math.sin(t * 6) * .3, .3, 0] };
      if (st === 'show') rTarget = c.clone().add(v(-.1 * k, .24 * k, .42 * k).applyQuaternion(q));
      if (A.attn && t < A.attn.until) A.lookAt(A.attn.p, { w: 8, ...(A.attn.o || {}), roll: .05 }); else A.lookAt(rTarget.clone().add(v(0, .04, 0)), { w: 8, pitchBias: 0 });
      A.express({ smile: .25 + .35 * Math.max(0, Math.sin(t * .5)), browUp: Math.max(0, Math.sin(t * .7)) * .6, oh: 0 });
      A.lookOpts.roll = .05;
    } else if (st === 'ear' || st === 'wait') {
      rTarget = earR.clone().add(v(-.026, -.07 * k, .03).applyQuaternion(q)); rFing = dir(-.15, .95, .15); rPalm = dir(.95, 0, .2);
      lTarget = c.clone().add(v(.34 * k, -.2 * k, .12 * k).applyQuaternion(q)); lFing = dir(.2, -.5, .8); lPalm = dir(0, .95, -.1);
      if (st === 'wait') { lTarget = c.clone().add(v(.3 * k, .18 * k, .28 * k).applyQuaternion(q)); lFing = dir(.05, .95, .2); lPalm = dir(-.95, 0, .2); lPose = { c: [0, 1.3, 1.3, 1.3], th: [.9, .1, 0] }; A.express({ browUp: .7, smile: .1 }); }
      const listen = st === 'ear' ? Math.sin(t * 1.2) : 0;
      if (env.p > .41 && env.p < .475 && env.cam && Math.sin(t * .55) > -.35) A.lookAt(env.cam.clone().add(v(0, -.05, 0)), { w: 7, roll: .16 });
      else if (S.glance && t < S.glance.until) A.lookAt(S.glance.p, { w: 8, roll: .18 }); else A.lookAt(env.actors.gamer.eyeW.clone().lerp(env.actors.smoker.eyeW, .5 + .5 * Math.sin(t * .2)), { w: 6, roll: .16 });
      if (!S.glance || t > S.glance.until) { if (Math.random() < dt * .25) S.glance = { p: (Math.random() < .5 ? env.actors.gamer : env.actors.smoker).eyeW.clone(), until: t + rnd(1, 2) }; }
      if (st !== 'wait') A.express({ smile: Math.max(Math.max(0, listen) * .8, (S.laugh && t - S.laugh < 1.8) ? .95 : 0), browUp: Math.max(0, Math.sin(t * .9 + 1)) * .5, oh: 0 });
    } else {                                                   // de pie: habla paseando, un brazo con el móvil
      rTarget = earR.clone().add(v(-.02, -.09 * k, .03).applyQuaternion(q)); rFing = dir(-.15, .95, .15); rPalm = dir(.95, 0, .2);
      lTarget = c.clone().add(v(.3 * k, -.28 * k, .1 * k).applyQuaternion(q)); lFing = dir(0, -1, .1); lPalm = dir(-1, 0, 0);
      A.lookAt(env.actors.gamer.eyeW, { w: 6, roll: .12 }); A.express({ smile: .4 });
    }
    // --- el móvil manda: se define su pose (pantalla hacia la oreja o hacia la cara) y la mano lo agarra por detrás (palma sobre la trasera), corrigiendo por realimentación ---
    const hq2 = H.root.getWorldQuaternion(new THREE.Quaternion()), hl = (x, y, z) => v(x, y, z).applyQuaternion(hq2);
    let pc, ns, up;
    if (st === 'show') {
      pc = c.clone().add(v(-.1 * k, .24 * k, .42 * k).applyQuaternion(q)); ns = dir(.05, .08, 1); up = dir(0, 1, -.08);
    } else if (st === 'screen') {
      pc = c.clone().add(v(-.09 * k, .0 * k, .31 * k).applyQuaternion(q));
      ns = A.eyeW.clone().sub(pc).normalize(); up = dir(0, .72, .69);
    } else {
      pc = earR.clone().add(hl(-.022, -.028, .004)); ns = hl(1, 0, .06).normalize(); up = hl(-.04, 1, -.3);
    }
    up.addScaledVector(ns, -up.dot(ns)).normalize();
    const zP = v(0, 0, 0).crossVectors(ns, up).normalize();
    if (S.buzz > 0) pc.addScaledVector(zP, Math.sin(t * 90) * .0015);
    phone.position.copy(pc); phone.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ns, up, zP)); phone.updateMatrixWorld(true);
    const palmT = pc.clone().addScaledVector(ns, -.012).addScaledVector(up, -.03);      // el talón de la palma sostiene la parte baja de la trasera del móvil
    if (!S.wr) S.wr = A.T.handR.p.clone();
    S.wr.copy(A.handWorld.R).addScaledVector(palmT.clone().sub(A.anchor('R', 'palm', tmp.a)), .6);
    const wrap = st === 'screen' || st === 'show' ? [.85, .9, .95, 1.0] : [.8, .88, .95, 1.0];
    // agarre: el móvil descansa sobre la palma y los cuatro dedos rodean su borde lateral (van a lo ancho del móvil, no hacia arriba, si no lo atraviesan)
    // la dirección de los dedos se mezcla con la del antebrazo para que la muñeca no quede doblada (desviación pequeña, como en la referencia)
    const fore = A.handWorld.R.clone().sub(b.lArmR.getWorldPosition(tmp.a.clone())).normalize();
    const across = zP.clone().multiplyScalar(.9).addScaledVector(fore, .15).addScaledVector(up, .12).normalize();      // los dedos van hacia dentro (hacia el cuerpo) y el antebrazo llega de fuera: muñeca recta
    // pulgar a lo largo del borde contrario (arriba, apoyado en el marco), como en la referencia
    { const TT = A.thumbT ||= { L: { p: v(0, 0, 0), w: 0 }, R: { p: v(0, 0, 0), w: 0 } }; TT.R.p.copy(pc).addScaledVector(zP, -.034).addScaledVector(up, .012).addScaledVector(ns, .005); TT.R.w = (st === 'ear') ? .6 : 1; }
    A.setHand('R', S.wr, ns.clone(), across, { c: wrap, th: [.35, .35, 0], w: 22 }, A.W(-.5 * k, .7 * k, -.4 * k, tmp.d.clone()));
    A.setHand('L', lTarget, lPalm, lFing, lPose, A.W(.5 * k, .7 * k, -.2 * k, tmp.d.clone()));
    // el móvil: orientado según la pantalla/oreja
    phone.visible = true;
    A.exT.jaw = 0;
  };
}

/* ============ FUMADOR: recostado, ciclo de calada, humo ============ */
export function setupSmoker(A, world, scene, M, smoke) {
  const cig = new THREE.Group();
  const paper = new THREE.Mesh(new THREE.CylinderGeometry(.0034, .0034, .06, 8), new THREE.MeshStandardMaterial({ color: 0xd2cec4, roughness: .9 })); paper.rotation.x = Math.PI / 2; paper.position.z = -.005; cig.add(paper);
  const filter = new THREE.Mesh(new THREE.CylinderGeometry(.0035, .0035, .024, 8), new THREE.MeshStandardMaterial({ color: 0xc78a45, roughness: .7 })); filter.rotation.x = Math.PI / 2; filter.position.z = .037; cig.add(filter);
  const ember = new THREE.Mesh(new THREE.SphereGeometry(.0037, 8, 6), new THREE.MeshStandardMaterial({ color: 0x220800, emissive: 0xff5a1a, emissiveIntensity: 2.2 })); ember.position.z = -.037; cig.add(ember);
  scene.add(cig); cig.scale.setScalar(1.15);
  const W = { p1: v(0, 0, 0), p2: v(0, 0, 0), q: new THREE.Quaternion(), ax: v(0, 0, 1) };
  // tras resolver la pose: el cigarrillo queda sujeto entre las falanges del índice y el corazón, con el filtro hacia el lado del pulgar
  A.post = () => {
    const hb = A.human.bones; hb.index_02_r.getWorldPosition(W.p1); hb.middle_02_r.getWorldPosition(W.p2);
    A.socket('r').getWorldQuaternion(W.q); W.ax.set(0, 0, 1).applyQuaternion(W.q);
    cig.position.copy(W.p1).add(W.p2).multiplyScalar(.5).addScaledVector(W.ax, .018); cig.quaternion.copy(W.q); cig.updateMatrixWorld(true);
  };
  A.props = { cig, ember };
  const S = { state: 'hold', t0: 0, dur: 3, ash: 0, look: null, w: null, last: v(0, 0, 0) };
  const go = (s, dur, t) => { S.state = s; S.t0 = t; S.dur = dur; };
  const order = [['hold', 3.2], ['raise', 1.1], ['inhale', 1.5], ['lower', .9], ['exhale', 2.6], ['hold', 4.5], ['hold', 3]];
  let oi = 0;
  A.smokeGo = (name, dur = 60) => go(name, dur, A.t); A.smokeDbg = () => ({ st: S.state, t0: S.t0, dur: S.dur, w: S.w && S.w.toArray(), at: A.t, dbg: S.dbg });
  A.gestSide = 'L';
  A.cueHandlers = { laugh: (t) => { S.laugh = t; A.laughAt(1.8); }, exhale: (t) => { go('exhale', 2.6, t); } };
  return (t, dt, env) => {
    const k = A.k, hp = A.hip, b = A.rig.b, H = A.head;
    if (!S.t0) { S.t0 = t; }
    if (t - S.t0 > S.dur) { oi = (oi + 1) % order.length; go(order[oi][0], order[oi][1] * rnd(.85, 1.2), t); }
    if (A.talking && ['raise', 'inhale', 'lower', 'exhale'].includes(S.state)) { go('hold', 2, t); oi = 0; }
    const st = S.state, u = clamp((t - S.t0) / S.dur, 0, 1);
    // cadera reclinada, columna atrás; el sillón gira un poco sobre su base
    hp.y = seatHip(A, -.02 * k); hp.z = -.02; hp.pitch = -.16;
    const settle = Math.sin(t * .11) * .5 + .5;
    S.fw = (S.fw ?? 0) + ((['raise', 'inhale', 'lower'].includes(st) ? 1 : 0) - (S.fw ?? 0)) * (1 - Math.exp(-dt * 3));      // para llevarse el cigarro a la boca se inclina hacia delante: así la mano no queda dentro del pecho
    A.spinePitch.follow(-.22 - settle * .06 + S.fw * .24, dt, 3); A.chestPitch.follow(-.1 + S.fw * .22, dt, 3); A.chestYaw.follow(Math.sin(t * .17) * .1 + (st === 'exhale' ? -.1 : 0), dt, 3); A.chestRoll.follow(-.05, dt, 3);
    if (env.greenSeat) { env.greenSeat.rotation.y = Math.sin(t * .13) * .12 + Math.sin(t * .37) * .02; }
    // piernas estiradas y cruzadas a la altura del tobillo; el pie baila
    const bob = Math.sin(t * 2.6) * .012 * (st === 'hold' ? 1 : 0);
    A.setFoot('L', A.W(.12 * k, A.ankleH, .6 * k), .25, .05 + bob, A.W(.2 * k, 1, .8 * k));
    A.setFoot('R', A.W(-.13 * k, A.ankleH + .022, .54 * k), -.25, .12 + Math.sin(t * 2.6 + 1) * .05, A.W(-.2 * k, 1, .8 * k));
    // cigarrillo
    const c = b.chest.getWorldPosition(tmp.a.clone()), q = A.root.quaternion, dir = (x, y, z) => v(x, y, z).applyQuaternion(q).normalize();
    const mouth = A.mouthWorld.clone();
    const sh = b.uArmR.getWorldPosition(tmp.b.clone());                                   // referencias desde el hombro derecho: la mano siempre queda por fuera del torso aunque esté recostado
    const rest = sh.clone().add(v(-.30 * k, -.44 * k, .20 * k).applyQuaternion(q));
    const held = sh.clone().add(v(-.24 * k, -.26 * k, .30 * k).applyQuaternion(q));
    let target = rest, fing = dir(-.1, .2, .95), palm = dir(.7, .7, 0), inhale = 0, cur = [.55, .55, 1.2, 1.3], e = 0;
    const cigTip = cig.localToWorld(v(0, 0, .058));
    const hq = A.head.root.getWorldQuaternion(new THREE.Quaternion()), hd = (x, y, z) => v(x, y, z).applyQuaternion(hq);
    const lips = mouth.clone().add(hd(0, 0, .004));                                       // el filtro toca los labios
    const fingUp = dir(-.12, .95, .3), thumbTo = hd(.65, -.05, -.75);                      // dedos arriba; el cigarrillo apunta a la boca desde delante-derecha
    const palmUp = A.human.orientThumb('r', fingUp, thumbTo, dir(.7, 0, -.3));
    const approx = mouth.clone().add(hd(-.05, -.02, .09));
    if (!S.w) S.w = A.T.handR.p.clone();
    if (st === 'hold') { target = rest.clone().lerp(held, .5 + .5 * Math.sin(t * .6)); S.w.copy(target); }
    else if (st === 'raise') { e = sstep(0, 1, u); target = held.clone().lerp(approx, e); S.w.copy(target); fing = fing.clone().lerp(fingUp, e).normalize(); palm = palm.clone().lerp(palmUp, e).normalize(); }
    else if (st === 'inhale') { S.w.copy(A.handWorld.R).addScaledVector(lips.clone().sub(cigTip), .5); target = S.w; e = 1; fing = fingUp; palm = palmUp; inhale = sstep(0, .5, u); S.dbg = { wr: A.handWorld.R.toArray(), lips: lips.toArray(), tip: cigTip.toArray() }; }
    else if (st === 'lower') { e = 1 - sstep(0, 1, u); target = rest.clone().lerp(S.w, e); fing = fing.clone().lerp(fingUp, e).normalize(); palm = palm.clone().lerp(palmUp, e).normalize(); }
    else if (st === 'exhale') { target = rest.clone().lerp(held, .3); S.w.copy(target); }
    if (st === 'inhale') S.last.copy(S.w);
    if (st === 'lower') S.w.copy(S.last);
    // el pulgar y el índice/corazón sujetan el cigarrillo; anular y meñique cerrados
    A.setHand('R', target, palm, fing, { c: cur, th: [.3, .3, 0], w: 16 }, A.W(-.5 * k, .55 * k, .05 * k, tmp.d.clone()));
    // mano izquierda descansa en el brazo del sillón, dedos sueltos
    const armrest = c.clone().add(v(.32 * k, -.22 * k, .06 * k).applyQuaternion(q));
    A.setHand('L', armrest.add(v(0, Math.sin(t * .5) * .006, 0)), dir(0, -1, 0), dir(.05, -.15, 1), { c: [.35, .5, .6, .7], th: [.3, .2, 0], w: 8 }, A.W(.5 * k, .6 * k, -.3 * k, tmp.d.clone()));
    // cabeza: al techo al exhalar, mira a los demás, sonríe
    const smile = (st === 'exhale' ? .55 : .15) + (S.laugh && t - S.laugh < 1.6 ? .9 : 0);
    A.express({ smile, browUp: st === 'inhale' ? .3 : Math.max(0, Math.sin(t * .4)) * .3, oh: st === 'exhale' ? .5 * sstep(0, .25, u) * (1 - sstep(.5, .8, u)) : 0, frown: 0, eyesClosed: (st === 'inhale' && u > .3) ? .8 : 0 });
    A.exT.jaw = st === 'exhale' ? .3 * sstep(0, .2, u) * (1 - sstep(.4, .7, u)) : 0;
    const ceiling = A.W(-.4, 2.9, .4);
    if (st === 'exhale' && u > .15) A.lookAt(ceiling, { w: 5, pitchBias: -.15 });
    else if (st === 'inhale') A.lookAt(A.W(0, 1.1, 2), { w: 5 });
    else gaze(A, t, A.W(-1.2 * 1, 1.05, 1.2), { w: 5 });
    // humo: hilo constante de la brasa; bocanada al exhalar
    const ember2 = ember.getWorldPosition(tmp.b.clone());
    if (smoke) {
      smoke.emit(ember2, v(0, 1, 0), dt * 6 * (st === 'inhale' ? 0 : 1), { size: .012, life: 4, rise: .09, spread: .01 });
      if (st === 'exhale' && u > .12 && u < .75) smoke.emit(A.mouthWorld.clone().add(v(0, -.005, 0)), A.Wdir(-.15, .55, .85), dt * 90, { size: .05, life: 5, rise: .05, spread: .04, speed: .55 });
      if (st === 'inhale' && u > .55) smoke.emit(A.mouthWorld.clone(), v(0, .3, 0), dt * 5, { size: .02, life: 2.4, rise: .05, spread: .02, speed: .1 });
    }
    ember.material.emissiveIntensity = 1.4 + inhale * 4 + Math.sin(t * 9) * .2;
    A.props.ember.material.emissive.setRGB(1, .35 + inhale * .2, .1);
  };
}

/* ============ GRAFITERO: dibuja de verdad sobre la libreta ============ */
export function setupArtist(A, world, scene, M) {
  const penG = new THREE.Group(), penMat = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: .4, metalness: .3 });
  const pen = new THREE.Mesh(new THREE.CylinderGeometry(.0048, .0055, .16, 10), penMat); pen.position.y = -.035; penG.add(pen);
  const cap2 = new THREE.Mesh(new THREE.CylinderGeometry(.0058, .0048, .05, 10), new THREE.MeshStandardMaterial({ color: 0x141414, roughness: .5 })); cap2.position.y = .07; penG.add(cap2);
  const nib = new THREE.Mesh(new THREE.ConeGeometry(.0048, .022, 10), new THREE.MeshStandardMaterial({ color: 0x777777, roughness: .4 })); nib.position.y = -.126; nib.rotation.x = Math.PI; penG.add(nib);
  scene.add(penG);
  A.props = { pen: penG, penMat, nib };
  A.gestSide = 'L'; A.cueHandlers = { laugh: (t) => A.laughAt(1.6) };
  const nbG = world.desk.userData.notebook, W = 0.42 - .01, Hh = 0.30 - .01;
  const S = { tip: v(L.notebook.x, L.notebook.y + .01, L.notebook.z), hover: 0, look: 0, nextUp: rnd(6, 9), upUntil: 0 };
  const pageToWorld = (u, vv, out = v(0, 0, 0)) => nbG.localToWorld(out.set((u - .5) * W, .0105, -(.5 - vv) * Hh));
  A.pageToWorld = pageToWorld;
  return (t, dt, env) => {
    const k = A.k, hp = A.hip, gr = env.graffiti, tip = gr.tip, prog = gr.progress;
    hp.y = seatHip(A); hp.z = -.1 * k;
    const active = tip.active && prog > 0 && prog < 1;
    const target = pageToWorld(tip.u, tip.v, tmp.a.clone());
    S.tip.lerp(target, 1 - Math.exp(-dt * (active ? 22 : 6)));
    // se inclina sobre la mesa, más cuanto más trabajo hay
    const focus = .3 + .35 * sstep(0, .1, prog) * (prog < 1 ? 1 : .2);
    const up = (t < S.upUntil || A.talking || A.laughV > .3) ? 1 : 0; if (t > S.nextUp && !A.attn) { S.upUntil = t + rnd(1.4, 2.4); S.nextUp = t + rnd(8, 14); }
    S.tk = (S.tk ?? 0) + ((A.talking || A.laughV > .3 ? 1 : (A.attn ? .8 : 0)) - (S.tk ?? 0)) * (1 - Math.exp(-dt * 3)); const lean = (1 - .85 * S.tk);      // al hablar o reírse se incorpora y deja de dibujar encorvada
    A.spinePitch.follow((focus + .25 - up * .35) * .95 * lean, dt, 4); A.chestPitch.follow((focus + .25 - up * .35) * 1.0 * lean, dt, 4); A.chestYaw.follow(Math.sin(t * .3) * .04, dt, 3); A.chestRoll.follow(Math.sin(t * .21) * .03 - .03, dt, 4);
    // pies en el aro del taburete, uno se balancea
    A.setFoot('L', A.W(.13 * k, .19 * k, .34 * k), .2, .1, A.W(.2 * k, 1, .9 * k)); A.setFoot('R', A.W(-.12 * k, .17 * k + Math.max(0, Math.sin(t * 2.1)) * .02, .3 * k), -.15, .1 + Math.sin(t * 2.1) * .07, A.W(-.2 * k, 1, .9 * k));
    // mano derecha: la muñeca queda detrás y por encima de la punta; el trazo va temblando como a mano
    const jitter = active ? v(Math.sin(t * 31) * .0008, 0, Math.cos(t * 27) * .0008) : v(0, 0, 0);
    const lift = active ? .0 : .055 + Math.sin(t * 2) * .006;
    const pw = S.tip.clone().add(jitter).add(v(0, lift, 0));
    const back = A.Wdir(-1, 0, 0);          // hacia el pecho (el papel está hacia +x mundo; el artista mira +x)
    const eastDir = v(1, 0, 0);
    const wrist = pw.clone().add(v(-.062, .078, .022)); void back; void eastDir;
    // bolígrafo: la punta va donde manda el trazo; la mano lo pellizca (pulgar + índice) y se corrige por realimentación
    const penDir = v(-.55, .8, .25).normalize();
    const hbn = A.human.bones, pinch = hbn.thumb_03_r.getWorldPosition(tmp.a.clone()).add(hbn.index_03_r.getWorldPosition(tmp.b.clone())).multiplyScalar(.5);
    penG.position.copy(pinch).addScaledVector(penDir, .092); penG.quaternion.setFromUnitVectors(v(0, 1, 0), penDir); penG.updateMatrixWorld(true);   // el bolígrafo va siempre en la mano; la punta llega al papel cuando la mano alcanza
    const grip = pw.clone().addScaledVector(penDir, .034);
    const wr = A.handWorld.R.clone().addScaledVector(grip.sub(pinch), .5);
    if (!(wr.distanceTo(wrist) < .25)) wr.copy(wrist);                       // seguridad: nunca se aleja del plan geométrico
    const rFing = pw.clone().sub(wr).normalize();
    A.setHand('R', wr, A.Wdir(.9, -.35, .3), rFing, { c: [.75, .95, 1.3, 1.4], th: [.6, .4, 0], w: 30 }, A.W(-.6 * k, .8 * k, -.1 * k, tmp.d.clone()));
    // la libreta se sujeta con la izquierda; el papel se mueve un pelín
    const lw = pageToWorld(.08, .55, tmp.b.clone()).add(v(-.05, .015, -.0));
    A.setHand('L', lw, v(0, -1, 0), A.Wdir(0, -.1, 1), { c: [.35, .4, .5, .55], th: [.2, .5, 0], w: 10 }, A.W(.5 * k, .9 * k, -.1 * k, tmp.d.clone()));
    // bolígrafo: color de la herramienta actual; pulgar/índice siguen la punta
    penMat.color.set(tip.tool === 'pencil' ? '#8d8a80' : (tip.color || '#141010'));
    pen.material = penMat;
    // mirada: al trazo; a veces levanta la vista hacia cámara/los otros
    gaze(A, t, S.tip.clone().add(v(0, .01, 0)), { w: 10, pitchBias: 0 });
    if (up && !A.attn) A.lookAt(env.actors.gamer.eyeW.clone().lerp(env.actors.phone.eyeW, .5), { w: 6 });
    A.express({ browUp: up ? .4 : -.1, browAngry: active ? .25 : 0, smile: up ? .5 : (prog > .97 ? 1 : .1), frown: 0, oh: 0, eyesClosed: 0 });
    A.exT.jaw = 0;
    // rasguño: nivel para el audio
    env.pencilLevel = active ? 1 : 0;
  };
}
