/* =========================================================
   GARMENTS — ropa como "cascarón" de la anatomía real
   Cada prenda se genera a partir de la malla del cuerpo (la del propio personaje):
     1. selecciona vértices por grupo óseo (tronco, brazo, pierna…) usando los pesos de piel
     2. los desplaza en radial (holgura de la prenda, con función por altura/ángulo)
     3. recorta con planos de dobladillo: los vértices que quedan fuera se proyectan al plano
        y los triángulos totalmente fuera desaparecen (borde limpio, sin costuras rotas)
     4. abre el frente (camisa, chaleco) y suaviza el campo de desplazamiento
   La prenda comparte esqueleto y pesos con el cuerpo → se dobla con él (codos, rodillas, cintura).
   Además calcula un atributo de pliegue (aFold) en articulaciones para arrugar la tela al doblarse.
   ========================================================= */
import * as THREE from 'three';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

const GROUP = (name) => {
  if (/^(pelvis)$/.test(name)) return 'pelvis';
  if (/^spine_0|^clavicle/.test(name)) return 'torso';
  if (name === 'neck_01') return 'neck'; if (name === 'head') return 'head';
  const side = name.endsWith('_l') ? 'L' : name.endsWith('_r') ? 'R' : '';
  if (/^(upperarm|lowerarm)/.test(name)) return 'arm' + side;
  if (/^(hand|thumb|index|middle|ring|pinky)/.test(name)) return 'hand' + side;
  if (/^(thigh|calf)/.test(name)) return 'leg' + side;
  if (/^(foot|ball)/.test(name)) return 'foot' + side;
  return 'other';
};

/* Datos del cuerpo en reposo (compartidos por todas las prendas de un personaje) */
export class BodyData {
  constructor(human) {
    const mesh = human.meshes.body, g = mesh.geometry; this.human = human; this.mesh = mesh;
    this.pos = g.attributes.position.array; this.nrm = g.attributes.normal.array; this.uv = g.attributes.uv.array;
    this.si = g.attributes.skinIndex.array; this.sw = g.attributes.skinWeight.array; this.index = g.index.array; this.n = g.attributes.position.count;
    this.bones = mesh.skeleton.bones; this.gname = this.bones.map(b => GROUP(b.name));
    const N = this.n; this.dom = new Array(N); this.fold = new Float32Array(N); this.w2 = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const acc = {}; let w2 = 0;
      const ws = []; for (let k = 0; k < 4; k++) { const w = this.sw[i * 4 + k]; if (w > 0) { const gn = this.gname[this.si[i * 4 + k]]; acc[gn] = (acc[gn] || 0) + w; ws.push(w); } }
      let best = 'other', bw = 0; for (const k in acc) if (acc[k] > bw) { bw = acc[k]; best = k; }
      ws.sort((a, b) => b - a); this.w2[i] = ws[1] || 0; this.dom[i] = best;
    }
    // ejes de las extremidades (polilíneas de reposo)
    const R = human.rest; this.axis = {};
    for (const s of ['l', 'r']) {
      this.axis['arm' + s.toUpperCase()] = ['upperarm_' + s, 'lowerarm_' + s, 'hand_' + s].map(n => R[n].clone());
      this.axis['leg' + s.toUpperCase()] = ['thigh_' + s, 'calf_' + s, 'foot_' + s].map(n => R[n].clone());
    }
    // línea central del tronco: z medio por altura (bins de 2 cm)
    this.zc = {}; const cnt = {};
    for (let i = 0; i < N; i++) if (this.dom[i] === 'torso' || this.dom[i] === 'pelvis') { const b = Math.round(this.pos[i * 3 + 1] / .02); this.zc[b] = (this.zc[b] || 0) + this.pos[i * 3 + 2]; cnt[b] = (cnt[b] || 0) + 1; }
    for (const b in this.zc) this.zc[b] /= cnt[b];
    this.adj = null;
  }
  zcAt(y) { const b = Math.round(y / .02); return this.zc[b] ?? this.zc[b - 1] ?? this.zc[b + 1] ?? 0; }
  /* proyecta p sobre la polilínea del miembro: { t (0 hombro/cadera → 1 muñeca/tobillo), s (m), c (punto del eje), d (dirección) } */
  project(limb, p) {
    const A = this.axis[limb]; let best = null, acc = 0; const total = A[0].distanceTo(A[1]) + A[1].distanceTo(A[2]);
    for (let i = 0; i < 2; i++) {
      const a = A[i], b = A[i + 1], ab = b.clone().sub(a), L = ab.length(); const u = ab.clone().divideScalar(L);
      let s = clamp(p.clone().sub(a).dot(u), i === 0 ? -1 : 0, i === 1 ? 1 : L);
      if (i === 1 && s > L) s = L + (s - L);      // más allá del extremo: t > 1
      const c = a.clone().addScaledVector(u, s), d = p.distanceTo(c);
      if (!best || d < best.d) best = { d, t: (acc + s) / total, s: acc + s, c, u, seg: i };
      acc += L;
    }
    return best;
  }
  /* pares de vértices duplicados por costuras de UV (misma posición ±8 mm, sin arista común): se sueldan al inflar para no abrir grietas */
  seamPairs() {
    if (this._pairs) return this._pairs; const yMinW = this.human.rest.spine_01.y - .02, adj = this.adjacency(), cell = .01, H = new Map(), out = [], pos = this.pos;
    const key = (x, y, z) => Math.floor(x / cell) + ',' + Math.floor(y / cell) + ',' + Math.floor(z / cell);
    for (let i = 0; i < this.n; i++) { const k = key(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); (H.get(k) || H.set(k, []).get(k)).push(i); }
    for (let i = 0; i < this.n; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2], cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) { const l = H.get((cx + dx) + ',' + (cy + dy) + ',' + (cz + dz)); if (!l) continue; for (const j of l) { if (j <= i || adj[i].has(j) || y < yMinW) continue; if (Math.hypot(x - pos[j * 3], y - pos[j * 3 + 1], z - pos[j * 3 + 2]) < .012) out.push([i, j]); } }
    }
    this._pairs = out; return out;
  }
  /* normales del cuerpo con las costuras de UV promediadas (evita grietas al inflar por la normal) */
  weldedNormals() {
    if (this._nw) return this._nw; const nw = new Float32Array(this.nrm);
    for (const [i, j] of this.seamPairs()) for (let q = 0; q < 3; q++) { const m = (this.nrm[i * 3 + q] + this.nrm[j * 3 + q]) / 2; nw[i * 3 + q] = nw[j * 3 + q] = m; }
    for (let i = 0; i < this.n; i++) { const l = Math.hypot(nw[i * 3], nw[i * 3 + 1], nw[i * 3 + 2]) || 1; nw[i * 3] /= l; nw[i * 3 + 1] /= l; nw[i * 3 + 2] /= l; }
    this._nw = nw; return nw;
  }
  adjacency() {
    if (this.adj) return this.adj; const adj = Array.from({ length: this.n }, () => new Set());
    for (let f = 0; f < this.index.length; f += 3) { const a = this.index[f], b = this.index[f + 1], c = this.index[f + 2]; adj[a].add(b); adj[a].add(c); adj[b].add(a); adj[b].add(c); adj[c].add(a); adj[c].add(b); }
    this.adj = adj; return adj;
  }
}

/* spec: {
     material, name,
     torso: { y0, y1?, collarY?, infl(y, ang) → m, gap?(y) → semiancho del frente abierto (m), gapMinZ? , armhole? },
     arms:  { sides:['l','r'], t1, infl(t, ang) },
     legs:  { sides:['l','r'], t1, infl(t, ang), t0? },
     smooth: iteraciones, uvScale }
   Devuelve { mesh, data } (mesh = THREE.SkinnedMesh) */
export function makeGarment(BD, spec) {
  const N = BD.n, pos = BD.pos, nrm = BD.weldedNormals();
  const SEAM = new Float32Array(N * 4), sel = new Uint8Array(N), clampedFlag = new Uint8Array(N), P = new Float32Array(pos.length), D = new Float32Array(N * 3); // desplazamientos
  P.set(pos);
  const T = spec.torso, A = spec.arms, Lg = spec.legs;
  const p = V3(), rad = V3();
  const info = new Array(N);
  for (let i = 0; i < N; i++) {
    const g = BD.dom[i]; p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    let rdir = null, infl = 0, clamped = false;
    if (T && T.xMax !== undefined && (g === 'torso' || g === 'neck' || g === 'pelvis') && Math.abs(p.x) > T.xMax) continue;
    if (T && (g === 'torso' || g === 'pelvis' || (T.legAbove !== undefined && (g === 'legL' || g === 'legR') && p.y > T.legAbove && Math.abs(p.x) < (T.legAboveX ?? .13)) || (g === 'neck' && !T.noNeck && T.collarY !== undefined && p.y <= (typeof T.collarY === 'function' ? T.collarY(0, 0) : T.collarY) + .15))) {
      const y = p.y, zc = BD.zcAt(y), ang = Math.atan2(p.x, p.z - zc);
      let yy = y;
      if (T.y0 !== undefined && y < T.y0) { yy = T.y0; clamped = true; }
      if (T.y1 !== undefined && y > T.y1) { yy = T.y1; clamped = true; }
      const cyl = T.collarY === undefined ? Infinity : (typeof T.collarY === 'function' ? T.collarY(p.x, p.z - zc) : T.collarY);
      let onCollar = false; if (y > cyl) { yy = cyl; clamped = true; onCollar = true; }
      // vértices por encima del cuello (hombros/nuca) siguen la línea; el resto radial
      rdir = V3(p.x, 0, p.z - zc); if (rdir.lengthSq() < 1e-8) rdir.set(0, 0, 1); rdir.normalize();
      { const yN = T.nrmFrom ?? (BD.human.rest.upperarm_l.y - .035), wN = sstep(yN, yN + (T.nrmSpan ?? .07), y); if (wN > 0) { rdir.lerp(V3(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]), wN * (T.nrmMax ?? 1)).normalize(); } }
      SEAM[i * 4] = ang; SEAM[i * 4 + 1] = yy; SEAM[i * 4 + 2] = Math.hypot(p.x, p.z - zc); SEAM[i * 4 + 3] = 0;
      infl = T.infl(yy, ang); P[i * 3 + 1] = yy;
      sel[i] = 1;
      // frente abierto: los vértices dentro de la abertura se clavan al borde y salen del recorte
      if (T.gap) { const gw = T.gap(yy); if (gw > 0 && p.z > zc + (T.gapMinZ ?? -.02) && Math.abs(p.x) < gw) { P[i * 3] = Math.sign(p.x || 1) * gw; clamped = true; info[i] = { gapIn: true }; } }
      // sisa/hombrera limpia: el borde de la abertura del brazo es una cápsula (hombro → codo) de radio R; lo que cae dentro se proyecta a su borde
      let dropped = false;
      if (T.armhole && y > (T.armhole.yMin ?? 0)) for (const sd of ['L', 'R']) {
        const ax = BD.axis['arm' + sd], VV = T.armhole.vert, Sj = VV ? ax[0].clone().add(V3(0, VV[0], 0)) : ax[0], u = VV ? V3(0, 1, 0) : ax[1].clone().sub(ax[0]).normalize(), q = clamp(p.clone().sub(Sj).dot(u), 0, VV ? VV[1] - VV[0] : (T.armhole.L ?? .09)), cc = Sj.clone().addScaledVector(u, q), dv = p.clone().sub(cc), d = dv.length();
        if (d < T.armhole.R && VV && (p.x - ax[0].x) * Math.sign(ax[0].x) > 0) { dropped = true; break; }                 // lateral al eje: queda bajo el brazo
        if (d < T.armhole.R) { dv.multiplyScalar(T.armhole.R / Math.max(d, 1e-4)); P[i * 3] = cc.x + dv.x; P[i * 3 + 1] = cc.y + dv.y; P[i * 3 + 2] = cc.z + dv.z; clamped = true; info[i] = Object.assign(info[i] || {}, { armhole: true }); }
      }
      if (dropped) { sel[i] = 0; continue; }
      info[i] = Object.assign(info[i] || {}, { part: 'torso', y: yy, ang, collar: onCollar, clip: clamped });
    } else if (A && (g === 'armL' || g === 'armR' || g === 'handL' || g === 'handR')) {
      const s = g.endsWith('L') ? 'l' : 'r'; if (!A.sides.includes(s)) continue; if (A.only && !A.only(p)) continue;
      const limb = 'arm' + s.toUpperCase(), pr = BD.project(limb, p);
      let t = pr.t; const tClamp = t > A.t1 ? A.t1 : (A.t0 !== undefined && t < A.t0 ? A.t0 : null); if (tClamp !== null) { clamped = true; t = tClamp; }
      const c = pr.c; rdir = p.clone().sub(c); rdir.addScaledVector(pr.u, -rdir.dot(pr.u)); if (rdir.lengthSq() < 1e-8) rdir.set(0, 1, 0); rdir.normalize();
      const ang = Math.atan2(rdir.x, rdir.z);
      infl = A.infl(t, ang, s);
      if (clamped) { // desplaza a lo largo del eje hasta el plano exacto t1
        const total = BD.axis[limb][0].distanceTo(BD.axis[limb][1]) + BD.axis[limb][1].distanceTo(BD.axis[limb][2]);
        const dt = (tClamp - pr.t) * total; const dir = pr.u; P[i * 3] = p.x + dir.x * dt; P[i * 3 + 1] = p.y + dir.y * dt; P[i * 3 + 2] = p.z + dir.z * dt;
      }
      { const ta = BD.axis[limb]; const tot = ta[0].distanceTo(ta[1]) + ta[1].distanceTo(ta[2]); SEAM[i * 4] = ang; SEAM[i * 4 + 1] = t * tot; SEAM[i * 4 + 2] = p.distanceTo(c); SEAM[i * 4 + 3] = 1; }
      sel[i] = 1; info[i] = { part: 'arm', t, side: s, ang, clip: tClamp !== null };
    } else if (Lg && (g === 'legL' || g === 'legR' || g === 'footL' || g === 'footR')) {
      const s = g.endsWith('L') ? 'l' : 'r'; if (!Lg.sides.includes(s)) continue; if (Lg.noFoot && g.startsWith('foot')) continue;      // sin vértices del pie: el bajo del pantalón queda en el límite pierna/pie (borde limpio, no escalonado sobre el empeine)
      const limb = 'leg' + s.toUpperCase(), pr = BD.project(limb, p);
      let t = pr.t; const t0 = Lg.t0 ?? 0;
      const A3 = BD.axis[limb], total = A3[0].distanceTo(A3[1]) + A3[1].distanceTo(A3[2]);
      const c = pr.c; rdir = p.clone().sub(c); rdir.addScaledVector(pr.u, -rdir.dot(pr.u)); if (rdir.lengthSq() < 1e-8) rdir.set(0, 0, 1); rdir.normalize();
      if (Lg.nrmFrom !== undefined) { const wN = sstep(Lg.nrmFrom, Lg.nrmFrom + (Lg.nrmSpan ?? .05), t); if (wN > 0) { const nn = V3(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]); rdir.lerp(nn, wN).normalize(); } }
      const ang = Math.atan2(rdir.x, rdir.z);
      const lc = t > (Lg.t1 ?? 9) ? Lg.t1 : (t < t0 && Lg.t0 !== undefined ? t0 : null);
      if (lc !== null) { const dt = (lc - t) * total; P[i * 3] = p.x + pr.u.x * dt; P[i * 3 + 1] = p.y + pr.u.y * dt; P[i * 3 + 2] = p.z + pr.u.z * dt; clamped = true; t = lc; }
      SEAM[i * 4] = ang; SEAM[i * 4 + 1] = t * total; SEAM[i * 4 + 2] = p.distanceTo(c); SEAM[i * 4 + 3] = 1;
      infl = Lg.infl(t, ang, s); sel[i] = 1; info[i] = { part: 'leg', t, side: s, ang, clip: lc !== null };
    }
    if (!sel[i]) continue;
    clampedFlag[i] = clamped ? 1 : 0;
    D[i * 3] = rdir.x * infl; D[i * 3 + 1] = rdir.y * infl; D[i * 3 + 2] = rdir.z * infl;
    if (info[i]?.gapIn) clampedFlag[i] = 2;
  }
  // relleno de agujeros: vértices sin seleccionar (huesos de hombro/axila) rodeados casi por completo de vértices de la prenda
  const adj = BD.adjacency();
  const fillMaxY = T ? (typeof T.collarY === 'function' ? T.collarY(0, 0) : (T.collarY ?? 9)) - .02 : 9;
  for (let pass = 0; pass < 6; pass++) {
    const add = [];
    for (let i = 0; i < N; i++) { if (sel[i]) continue; let c = 0, t = 0; for (const j of adj[i]) { t++; if (sel[j] && !clampedFlag[j]) c++; } if (t && c >= 2 && c / t >= .5 && pos[i * 3 + 1] < fillMaxY) add.push(i); }
    for (const i of add) { let sx = 0, sy = 0, sz = 0, c = 0; for (const j of adj[i]) if (sel[j] && !clampedFlag[j]) { sx += D[j * 3]; sy += D[j * 3 + 1]; sz += D[j * 3 + 2]; c++; } D[i * 3] = sx / c; D[i * 3 + 1] = sy / c; D[i * 3 + 2] = sz / c; sel[i] = 1; }
    if (!add.length) break;
  }
  // suavizado del campo de desplazamiento entre vecinos seleccionados
  for (let it = 0; it < (spec.smooth ?? 2); it++) {
    const D2 = D.slice();
    for (let i = 0; i < N; i++) { if (!sel[i]) continue; let sx = 0, sy = 0, sz = 0, c = 0; for (const j of adj[i]) if (sel[j] && !clampedFlag[j]) { sx += D[j * 3]; sy += D[j * 3 + 1]; sz += D[j * 3 + 2]; c++; } if (c) { D2[i * 3] = D[i * 3] * .5 + sx / c * .5; D2[i * 3 + 1] = D[i * 3 + 1] * .5 + sy / c * .5; D2[i * 3 + 2] = D[i * 3 + 2] * .5 + sz / c * .5; } }
    D.set(D2);
  }
  for (let i = 0; i < N; i++) if (sel[i]) { P[i * 3] += D[i * 3]; P[i * 3 + 1] += D[i * 3 + 1]; P[i * 3 + 2] += D[i * 3 + 2]; }
  for (const [i, j] of BD.seamPairs()) if (sel[i] && sel[j]) for (let q = 0; q < 3; q++) { const m = (P[i * 3 + q] + P[j * 3 + q]) / 2; P[i * 3 + q] = P[j * 3 + q] = m; }
  // relajación de posiciones (telas sueltas): suaviza los relieves finos del cuerpo (pezones, costillas) sin mover los bordes recortados
  for (let it = 0; it < (spec.relax ?? 0); it++) {
    const P2 = P.slice();
    for (let i = 0; i < N; i++) { if (!sel[i] || clampedFlag[i] || Math.abs(P[i * 3]) > (spec.relaxX ?? 9)) continue; let sx = 0, sy = 0, sz = 0, c = 0; for (const j of adj[i]) if (sel[j]) { sx += P[j * 3]; sy += P[j * 3 + 1]; sz += P[j * 3 + 2]; c++; } if (c) { P2[i * 3] = P[i * 3] * .4 + sx / c * .6; P2[i * 3 + 1] = P[i * 3 + 1] * .4 + sy / c * .6; P2[i * 3 + 2] = P[i * 3 + 2] * .4 + sz / c * .6; } }
    P.set(P2);
    for (const [i, j] of BD.seamPairs()) if (sel[i] && sel[j]) for (let q = 0; q < 3; q++) { const m = (P[i * 3 + q] + P[j * 3 + q]) / 2; P[i * 3 + q] = P[j * 3 + q] = m; }   // los vértices duplicados de la costura UV se relajan por separado: se vuelven a soldar
  }
  // triángulos: todos sus vértices seleccionados, y no todos recortados (clampedFlag) ni todos en la abertura
  const tris = [];
  for (let f = 0; f < BD.index.length; f += 3) {
    const a = BD.index[f], b = BD.index[f + 1], c = BD.index[f + 2];
    if (!(sel[a] && sel[b] && sel[c])) continue;
    if (clampedFlag[a] && clampedFlag[b] && clampedFlag[c]) continue;
    const el = (u, v) => Math.hypot(P[u * 3] - P[v * 3], P[u * 3 + 1] - P[v * 3 + 1], P[u * 3 + 2] - P[v * 3 + 2]); if (Math.max(el(a, b), el(b, c), el(a, c)) > .14) continue;
    tris.push(a, b, c);
  }
  // compactar vértices
  const map = new Int32Array(N).fill(-1), keep = []; for (const v of tris) if (map[v] < 0) { map[v] = keep.length; keep.push(v); }
  const M = keep.length, seam2 = new Float32Array(M * 4), pos2 = new Float32Array(M * 3), uv2 = new Float32Array(M * 2), si2 = new Uint16Array(M * 4), sw2 = new Float32Array(M * 4), fold = new Float32Array(M), col = new Float32Array(M * 3);
  keep.forEach((v, k) => {
    pos2[k * 3] = P[v * 3]; pos2[k * 3 + 1] = P[v * 3 + 1]; pos2[k * 3 + 2] = P[v * 3 + 2]; for (let q = 0; q < 4; q++) seam2[k * 4 + q] = SEAM[v * 4 + q];
    for (let q = 0; q < 4; q++) { si2[k * 4 + q] = BD.si[v * 4 + q]; sw2[k * 4 + q] = BD.sw[v * 4 + q]; }
    let ao = 1 - .3 * clamp(BD.w2[v] * 2, 0, 1);
    const dr = spec.drape;
    if (dr && SEAM[v * 4 + 3] < .5) {        // caída de tela en el dobladillo del tronco: pliegues verticales de tela suelta (radiales hacia fuera; los valles se oscurecen)
      const x = pos2[k * 3], y = pos2[k * 3 + 1], z = pos2[k * 3 + 2], zc = BD.zcAt(y), fade = sstep(dr.y0 + (dr.h ?? .18), dr.y0, y);
      if (fade > 0) {
        const th = Math.atan2(x, z - zc), n = dr.n ?? 8, ph = dr.phase ?? 0;
        const t = .5 + .5 * Math.sin(n * th + ph + 1.7 * Math.sin(2.3 * th + y * 9) + y * 6) * (.75 + .25 * Math.sin(3.1 * th + 1.3));
        const d = (dr.amp ?? .008) * fade * t, L = Math.hypot(x, z - zc) || 1;
        pos2[k * 3] += x / L * d; pos2[k * 3 + 2] += (z - zc) / L * d; ao *= 1 - .16 * fade * (1 - t);
      }
    }
    fold[k] = clamp(BD.w2[v] * 2, 0, 1); col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = ao;
  });
  const idx = new Uint32Array(tris.length); for (let i = 0; i < tris.length; i++) idx[i] = map[tris[i]];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos2, 3)); geo.setAttribute('skinIndex', new THREE.BufferAttribute(si2, 4)); geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw2, 4));
  geo.setAttribute('aFold', new THREE.BufferAttribute(fold, 1)); geo.setAttribute('aSeam', new THREE.BufferAttribute(seam2, 4)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  { const nn = geo.attributes.normal;            // las costuras de UV del cuerpo duplican vértices: se sueldan también las normales (si no, salen "pezones" y aros en el tejido)
    for (const [i, j] of BD.seamPairs()) { const a = map[i], b = map[j]; if (a < 0 || b < 0) continue; const x = nn.getX(a) + nn.getX(b), y = nn.getY(a) + nn.getY(b), z = nn.getZ(a) + nn.getZ(b), l = Math.hypot(x, y, z) || 1; nn.setXYZ(a, x / l, y / l, z / l); nn.setXYZ(b, x / l, y / l, z / l); } }
  // UV: proyección por caja en metros (mismo criterio que el resto de tejidos)
  const n2 = geo.attributes.normal; const sc = spec.uvScale ?? 1;
  for (let k = 0; k < M; k++) {
    const ax = Math.abs(n2.getX(k)), ay = Math.abs(n2.getY(k)), az = Math.abs(n2.getZ(k)); let u, v;
    if (ay >= ax && ay >= az) { u = pos2[k * 3]; v = pos2[k * 3 + 2]; } else if (ax >= az) { u = pos2[k * 3 + 2]; v = pos2[k * 3 + 1]; } else { u = pos2[k * 3]; v = pos2[k * 3 + 1]; }
    uv2[k * 2] = u * sc; uv2[k * 2 + 1] = v * sc;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv2, 2));
  const mesh = new THREE.SkinnedMesh(geo, spec.material); mesh.name = 'garment_' + (spec.name || 'x'); mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  mesh.bind(BD.mesh.skeleton, BD.mesh.bindMatrix); mesh.userData.rest = pos2;
  const collarPts = [], edge = [];
  const bn = (v) => { let bi = 0, bw = -1; for (let q = 0; q < 4; q++) if (BD.sw[v * 4 + q] > bw) { bw = BD.sw[v * 4 + q]; bi = BD.si[v * 4 + q]; } return BD.bones[bi].name; };
  keep.forEach((v, k) => { const inf = info[v]; if (!inf) return; const pt = V3(pos2[k * 3], pos2[k * 3 + 1], pos2[k * 3 + 2]); if (inf.collar) collarPts.push(pt); if (inf.collar || inf.clip) edge.push({ p: pt, info: inf, bone: bn(v) }); });
  return { mesh, geo, info, keep, map, collarPts, edge };
}

/* Sub-prenda: copia (con relieve) los triángulos de una prenda existente cuyo centroide cumple pick(x,y,z).
   Sirve para bolsillos, pestañas, pecheras, cinturas, refuerzos… todo cosido a la prenda y con su mismo esqueleto.
   spec: { material, name, pick(x,y,z) → bool, lift(x,y,z) → m sobre la superficie (0 en el borde) , uvScale, flat } */
export function subGarment(g, spec) {
  const src = g.geo, SM = src.attributes.aSeam.array, P = src.attributes.position.array, N = src.attributes.normal.array, I = src.index.array, SI = src.attributes.skinIndex.array, SW = src.attributes.skinWeight.array, FD = src.attributes.aFold.array;
  const tris = [];
  for (let f = 0; f < I.length; f += 3) { const a = I[f], b = I[f + 1], c = I[f + 2]; const x = (P[a * 3] + P[b * 3] + P[c * 3]) / 3, y = (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3, z = (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3; if (spec.pick(x, y, z, g.info[g.keep[a]] || {})) tris.push(a, b, c); }
  const map = new Map(), keep = []; for (const v of tris) if (!map.has(v)) { map.set(v, keep.length); keep.push(v); }
  const M = keep.length, pos = new Float32Array(M * 3), si = new Uint16Array(M * 4), sw = new Float32Array(M * 4), fold = new Float32Array(M), col = new Float32Array(M * 3).fill(1), uv = new Float32Array(M * 2), seam = new Float32Array(M * 4), pan = new Float32Array(M * 2);
  const sc = spec.uvScale ?? 1;
  keep.forEach((v, k) => {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], l = spec.lift(x, y, z);
    pos[k * 3] = x + N[v * 3] * l; pos[k * 3 + 1] = y + N[v * 3 + 1] * l; pos[k * 3 + 2] = z + N[v * 3 + 2] * l;
    for (let q = 0; q < 4; q++) { si[k * 4 + q] = SI[v * 4 + q]; sw[k * 4 + q] = SW[v * 4 + q]; }
    for (let q = 0; q < 4; q++) seam[k * 4 + q] = SM[v * 4 + q];
    if (spec.panelUV) { const q2 = spec.panelUV(x, y, z, g.info[g.keep[v]] || {}); pan[k * 2] = q2[0]; pan[k * 2 + 1] = q2[1]; }
    fold[k] = FD[v]; const ao = 1 - .3 * fold[k]; col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = ao;
    const ax = Math.abs(N[v * 3]), ay = Math.abs(N[v * 3 + 1]), az = Math.abs(N[v * 3 + 2]);
    let u, w; if (ay >= ax && ay >= az) { u = x; w = z; } else if (ax >= az) { u = z; w = y; } else { u = x; w = y; }
    uv[k * 2] = u * sc; uv[k * 2 + 1] = w * sc;
  });
  const idx = new Uint32Array(tris.length); for (let i = 0; i < tris.length; i++) idx[i] = map.get(tris[i]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  geo.setAttribute('aFold', new THREE.BufferAttribute(fold, 1)); geo.setAttribute('aSeam', new THREE.BufferAttribute(seam, 4)); geo.setAttribute('aPanel', new THREE.BufferAttribute(pan, 2)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const mesh = new THREE.SkinnedMesh(geo, spec.material); mesh.name = 'garment_' + (spec.name || 'sub'); mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  const host = g.mesh; mesh.bind(host.skeleton, host.bindMatrix); mesh.userData.rest = pos;
  return { mesh, geo };
}

/* Vértices del borde superior/inferior de una prenda (y == nivel): polilínea ordenada por ángulo alrededor de la línea central */
export function ringOf(g, y, tol = 1e-4) {
  const P = g.geo.attributes.position.array, pts = [];
  for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i + 1] - y) < tol) pts.push(V3(P[i], P[i + 1], P[i + 2]));
  if (!pts.length) return pts;
  const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length, cz = pts.reduce((a, p) => a + p.z, 0) / pts.length;
  pts.sort((a, b) => Math.atan2(a.x - cx, a.z - cz) - Math.atan2(b.x - cx, b.z - cz)); return pts;
}

/* Parche conforme: malla fina (celdas de ~6 mm) de contorno redondeado proyectada por rayos sobre una prenda existente.
   Bolsillos, solapas y parches con bordes perfectos (nada de dientes de sierra) que comparten esqueleto y pesos con la prenda.
   spec: { material, name, mode:'torso'|'leg', cx, cy, hw, hh, r, back, lift, edge, uvScale,
           (leg) limb:'legL'|'legR', ta, tb, ac, aw, rr } */
export function conformPatch(BD, g, spec) {
  const src = g.geo, P = src.attributes.position.array, I = src.index.array, SI = src.attributes.skinIndex.array, SW = src.attributes.skinWeight.array, FD = src.attributes.aFold.array, NRM = src.attributes.normal.array;
  const mode = spec.mode || 'torso', hw = spec.hw, hh = spec.hh, rc = Math.min(spec.r ?? .012, hw - .001, hh - .001), lift = spec.lift ?? .006, ed = spec.edge ?? .012;
  const nx = Math.min(44, Math.max(3, Math.ceil(2 * hw / .006))), ny = Math.min(44, Math.max(3, Math.ceil(2 * hh / .006)));
  const sdf = (u, v) => { const qx = Math.abs(u) - (hw - rc), qy = Math.abs(v) - (hh - rc); return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rc; };
  // geometría de partida por modo
  let limbTot = 0, A3 = null; if (mode === 'leg') { A3 = BD.axis[spec.limb]; limbTot = A3[0].distanceTo(A3[1]) + A3[1].distanceTo(A3[2]); }
  const axisPt = (s) => { const l1 = A3[0].distanceTo(A3[1]); return s <= l1 ? A3[0].clone().lerp(A3[1], s / l1) : A3[1].clone().lerp(A3[2], Math.min(1.2, (s - l1) / A3[1].distanceTo(A3[2]))); };
  const nTri = I.length / 3;
  const hit = (o, d) => {                                       // el impacto más externo a lo largo del rayo (mayor distancia desde el origen invertido)
    let best = null, bt = -1;
    for (let f = 0; f < nTri; f++) {
      const a = I[f * 3], b = I[f * 3 + 1], c = I[f * 3 + 2];
      const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2], e1x = P[b * 3] - ax, e1y = P[b * 3 + 1] - ay, e1z = P[b * 3 + 2] - az, e2x = P[c * 3] - ax, e2y = P[c * 3 + 1] - ay, e2z = P[c * 3 + 2] - az;
      const px = d.y * e2z - d.z * e2y, py = d.z * e2x - d.x * e2z, pz = d.x * e2y - d.y * e2x, det = e1x * px + e1y * py + e1z * pz; if (Math.abs(det) < 1e-9) continue;
      const inv = 1 / det, tx = o.x - ax, ty = o.y - ay, tz = o.z - az, u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, v = (d.x * qx + d.y * qy + d.z * qz) * inv; if (v < 0 || u + v > 1) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv; if (t < 0) continue;
      if (best === null || t < bt) { best = { a, b, c, u, v, t }; bt = t; }          // el primero que golpea desde fuera = la superficie externa
    }
    return best;
  };
  const gv = [], vid = new Int32Array((nx + 1) * (ny + 1)).fill(-1), V = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const u = -hw + 2 * hw * i / nx, v = -hh + 2 * hh * j / ny; let o, d;
    if (mode === 'torso') { const x = spec.cx + u, y = spec.cy + v; o = V3(x, y, spec.back ? -.6 : .6); d = V3(0, 0, spec.back ? 1 : -1); }
    else { const t = (spec.ta + spec.tb) / 2 + v / limbTot, ang = spec.ac + u / (spec.rr ?? .09), cpt = axisPt(t * limbTot), rd = V3(Math.sin(ang), 0, Math.cos(ang)); o = cpt.clone().addScaledVector(rd, .4); d = rd.clone().negate(); }
    const h = hit(o, d); if (!h) continue;
    const w = 1 - h.u - h.v, nn = V3(), p = V3(), skin = new Map(); let fold = 0;
    for (const [vi, wt] of [[h.a, w], [h.b, h.u], [h.c, h.v]]) { p.x += P[vi * 3] * wt; p.y += P[vi * 3 + 1] * wt; p.z += P[vi * 3 + 2] * wt; nn.x += NRM[vi * 3] * wt; nn.y += NRM[vi * 3 + 1] * wt; nn.z += NRM[vi * 3 + 2] * wt; fold += FD[vi] * wt; for (let q = 0; q < 4; q++) { const bi = SI[vi * 4 + q], bw = SW[vi * 4 + q]; if (bw > 0) skin.set(bi, (skin.get(bi) || 0) + bw * wt); } }
    nn.normalize(); const dd = sdf(u, v), l = lift * sstep(0, ed, Math.max(0, -dd)) + .0012; p.addScaledVector(nn, l);
    const top = [...skin.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4), sum = top.reduce((a, e) => a + e[1], 0) || 1;
    vid[j * (nx + 1) + i] = V.length; V.push({ p, u, v, top, sum, fold });
  }
  const tris = []; const ok = (i, j) => vid[j * (nx + 1) + i] >= 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!(ok(i, j) && ok(i + 1, j) && ok(i, j + 1) && ok(i + 1, j + 1))) continue;
    const cu = -hw + 2 * hw * (i + .5) / nx, cv = -hh + 2 * hh * (j + .5) / ny; if (sdf(cu, cv) > 0) continue;
    const a = vid[j * (nx + 1) + i], b = vid[j * (nx + 1) + i + 1], c = vid[(j + 1) * (nx + 1) + i], d = vid[(j + 1) * (nx + 1) + i + 1];
    if (spec.back || mode === 'leg' ? false : false) tris.push(a, c, b, b, c, d); else tris.push(a, b, c, c, b, d);
  }
  const M = V.length, pos = new Float32Array(M * 3), si = new Uint16Array(M * 4), sw = new Float32Array(M * 4), fold = new Float32Array(M), col = new Float32Array(M * 3).fill(1), uv = new Float32Array(M * 2), pan = new Float32Array(M * 2), seam = new Float32Array(M * 4); for (let k = 0; k < M; k++) seam[k * 4 + 2] = 100;
  const sc = spec.uvScale ?? 1;
  V.forEach((q, k) => { pos[k * 3] = q.p.x; pos[k * 3 + 1] = q.p.y; pos[k * 3 + 2] = q.p.z; q.top.forEach((e, m) => { si[k * 4 + m] = e[0]; sw[k * 4 + m] = e[1] / q.sum; }); fold[k] = q.fold; const ao = 1 - .3 * q.fold; col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = ao; uv[k * 2] = q.p.x * sc; uv[k * 2 + 1] = q.p.y * sc; pan[k * 2] = q.u; pan[k * 2 + 1] = q.v; });
  // (dos triángulos por celda con orientación coherente: si quedaran del revés el material es DoubleSide)
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  geo.setAttribute('aFold', new THREE.BufferAttribute(fold, 1)); geo.setAttribute('aSeam', new THREE.BufferAttribute(seam, 4)); geo.setAttribute('aPanel', new THREE.BufferAttribute(pan, 2)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(tris);
  geo.computeVertexNormals();
  const mesh = new THREE.SkinnedMesh(geo, spec.material); mesh.name = 'garment_' + (spec.name || 'patch'); mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.bind(g.mesh.skeleton, g.mesh.bindMatrix); mesh.userData.rest = pos;
  return { mesh, geo };
}

/* Curva del borde de una sisa: intersección de la prenda (reposo) con la cápsula vertical de radio R. Devuelve puntos ordenados (arco invertido) */
export function armholeEdge(g, seg, R) {
  const P = g.geo.attributes.position.array, I = g.geo.index.array, cx = seg.c.x, cz = seg.c.z, y0 = seg.c.y, h = seg.h;
  const f = (i) => { const y = P[i * 3 + 1], q = clamp(y - y0, 0, h); return Math.hypot(P[i * 3] - cx, y - (y0 + q), P[i * 3 + 2] - cz); };
  const pts = [], seen = new Set();
  for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = I[t + e], b = I[t + (e + 1) % 3], key = a < b ? a + '_' + b : b + '_' + a; if (seen.has(key)) continue; seen.add(key);
    const fa = f(a) - R, fb = f(b) - R; if (fa * fb >= 0) continue; const u = fa / (fa - fb);
    pts.push(V3(P[a * 3] + (P[b * 3] - P[a * 3]) * u, P[a * 3 + 1] + (P[b * 3 + 1] - P[a * 3 + 1]) * u, P[a * 3 + 2] + (P[b * 3 + 2] - P[a * 3 + 2]) * u));
  }
  if (pts.length < 8) return [];
  const cen = V3(cx, pts.reduce((a, p) => a + p.y, 0) / pts.length - .03, cz), sd = Math.sign(cx) || 1;
  pts.sort((a, b) => Math.atan2(a.z - cz, a.y - cen.y) - Math.atan2(b.z - cz, b.y - cen.y));
  // filtro paso bajo para quitar la irregularidad de la malla
  let out = pts; for (let it = 0; it < 11; it++) out = out.map((p, i) => i === 0 || i === out.length - 1 ? p.clone() : out[i - 1].clone().add(out[i + 1]).addScaledVector(p, 2).multiplyScalar(.25));
  return out;
}

/* Tubo con esqueleto: pesos copiados del vértice más cercano de la prenda (se deforma con el cuerpo) */
export function skinnedTube(BD, g, pts, radius, material, closed = false) {
  const curve = new THREE.CatmullRomCurve3(pts, closed, 'centripetal'), n = Math.max(24, pts.length * 2), geo = new THREE.TubeGeometry(curve, n, radius, 8, closed);
  const P = g.geo.attributes.position.array, SI = g.geo.attributes.skinIndex.array, SW = g.geo.attributes.skinWeight.array, TP = geo.attributes.position, M = TP.count, si = new Uint16Array(M * 4), sw = new Float32Array(M * 4), col = new Float32Array(M * 3).fill(1);
  const nv = P.length / 3;
  const K = 8;
  for (let k = 0; k < M; k++) {
    const x = TP.getX(k), y = TP.getY(k), z = TP.getZ(k), near = [];                                   // los K vértices más cercanos, ponderados por distancia inversa → pesos suaves
    for (let i = 0; i < nv; i++) { const d = (P[i * 3] - x) ** 2 + (P[i * 3 + 1] - y) ** 2 + (P[i * 3 + 2] - z) ** 2; if (near.length < K) { near.push([d, i]); near.sort((a, b) => a[0] - b[0]); } else if (d < near[K - 1][0]) { near[K - 1] = [d, i]; near.sort((a, b) => a[0] - b[0]); } }
    const acc = new Map(); for (const [d, i] of near) { const w = 1 / (Math.sqrt(d) + .004); for (let q = 0; q < 4; q++) { const bw = SW[i * 4 + q]; if (bw > 0) acc.set(SI[i * 4 + q], (acc.get(SI[i * 4 + q]) || 0) + bw * w); } }
    const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4), sum = top.reduce((a, e) => a + e[1], 0) || 1;
    top.forEach((e, q) => { si[k * 4 + q] = e[0]; sw[k * 4 + q] = e[1] / sum; });
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('aFold', new THREE.BufferAttribute(new Float32Array(M), 1));
  const mesh = new THREE.SkinnedMesh(geo, material); mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.bind(g.mesh.skeleton, g.mesh.bindMatrix); mesh.name = 'garment_tube';
  return { mesh, geo };
}
