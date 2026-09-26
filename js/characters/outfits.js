/* =========================================================
   VESTUARIO — las cuatro equipaciones de referencia (outfitgrid), una por personaje
     jugador  → sudadera azul desteñida · bermudas carpintero negras · botas altas azul/negro · gorra negra "S"
     teléfono → camiseta blanca de bolsillo · vaquero negro ancho (costuras blancas) · botas blancas · gorra negra con espinas
     fumador  → camisa camuflaje abierta + camiseta blanca · vaquero lavado · cinturón negro · gorra denim "H" · botas beige
     grafitero→ camiseta amarillo fosforito · chaleco utilitario beige · cargo oliva · gorro granate · calcetines · zapatillas oscuras
   Las prendas son cascarones de la anatomía real de cada cuerpo (garments.js): se ajustan a su cuerpo y se doblan con él.
   Bolsillos, solapas, costuras y refuerzos son sub-prendas cosidas con relieve; hebillas, botones, cremalleras y cordones son piezas rígidas
   ancladas al hueso que corresponde. Los logos de marca de las fotos se sustituyen por marcas neutras (parches lisos, letras S/H, espinas).
   ========================================================= */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BodyData, makeGarment, subGarment, conformPatch, armholeEdge, skinnedTube } from './garments.js';
import { fabric, addCreases, verticalFade, ribTexture, seamStitch, withPanel, armholeCut } from './fabrics.js';
import { buildShoes } from './shoes.js';
import { buildCap, buildBeanie } from './headwear.js';
import { canvasTex, seed } from '../world/materials.js';
import { buildNails } from './skin.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
/* UV planares en metros (x,y de reposo) para tubos/cintas: la textura de la prenda continúa sin estirarse a lo largo del tubo */
const planarUV = (geo, k = 1) => { const P = geo.attributes.position, uv = new Float32Array(P.count * 2); for (let i = 0; i < P.count; i++) { uv[i * 2] = (P.getX(i) + P.getZ(i) * .6) * k; uv[i * 2 + 1] = P.getY(i) * k; } geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return geo; };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };


/* Alisa el pecho del cuerpo desnudo (los pezones del modelo base asoman bajo cualquier tela ajustada en los primeros planos).
   Se suaviza la malla en reposo (vértices duplicados de las costuras UV tratados como uno) y se sueldan las normales. */
function flattenChest(human, R) {
  const body = human.meshes.body; if (!body || body.userData.chestFlat) return; body.userData.chestFlat = true;
  const g = body.geometry, P = g.attributes.position, I = g.index; if (!I) return;
  const n = P.count, key = new Map(), grp = new Int32Array(n); let ng = 0;
  for (let i = 0; i < n; i++) { const k = Math.round(P.getX(i) * 500) + ',' + Math.round(P.getY(i) * 500) + ',' + Math.round(P.getZ(i) * 500); let id = key.get(k); if (id === undefined) { id = ng++; key.set(k, id); } grp[i] = id; }
  const nb = Array.from({ length: ng }, () => new Set()), members = Array.from({ length: ng }, () => []);
  for (let i = 0; i < n; i++) members[grp[i]].push(i);
  for (let f = 0; f < I.count; f += 3) { const a = grp[I.getX(f)], b = grp[I.getX(f + 1)], c = grp[I.getX(f + 2)]; nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b); }
  const y0 = R.spine_03.y - .09, y1 = R.spine_03.y + .16, cur = new Float32Array(ng * 3), reg = new Uint8Array(ng);
  for (let k = 0; k < ng; k++) { const i = members[k][0]; cur[k * 3] = P.getX(i); cur[k * 3 + 1] = P.getY(i); cur[k * 3 + 2] = P.getZ(i); const x = cur[k * 3], y = cur[k * 3 + 1], z = cur[k * 3 + 2]; reg[k] = (y > y0 && y < y1 && Math.abs(x) < .19 && z > .02) ? 1 : 0; }
  for (let it = 0; it < 18; it++) { const nx = cur.slice(); for (let k = 0; k < ng; k++) { if (!reg[k]) continue; let sx = 0, sy = 0, sz = 0, c = 0; for (const j of nb[k]) { sx += cur[j * 3]; sy += cur[j * 3 + 1]; sz += cur[j * 3 + 2]; c++; } if (c) { nx[k * 3] = cur[k * 3] * .4 + sx / c * .6; nx[k * 3 + 1] = cur[k * 3 + 1] * .4 + sy / c * .6; nx[k * 3 + 2] = cur[k * 3 + 2] * .4 + sz / c * .6; } } cur.set(nx); }
  for (let k = 0; k < ng; k++) if (reg[k]) for (const i of members[k]) P.setXYZ(i, cur[k * 3], cur[k * 3 + 1], cur[k * 3 + 2]);
  P.needsUpdate = true;
  const N = g.attributes.normal; if (N) { g.computeVertexNormals(); const sum = new Float32Array(ng * 3); for (let i = 0; i < n; i++) { const k = grp[i]; sum[k * 3] += N.getX(i); sum[k * 3 + 1] += N.getY(i); sum[k * 3 + 2] += N.getZ(i); } for (let i = 0; i < n; i++) { const k = grp[i], l = Math.hypot(sum[k * 3], sum[k * 3 + 1], sum[k * 3 + 2]) || 1; N.setXYZ(i, sum[k * 3] / l, sum[k * 3 + 1] / l, sum[k * 3 + 2] / l); } N.needsUpdate = true; }
}

export function dressActor(A, F) {
  flattenChest(A.human, A.human.rest);
  const human = A.human, R = human.rest, BD = new BodyData(human), low = A.q && A.q.name === 'low';
  const c = {
    low,
    A, F, human, R, BD, meshes: [],
    hipY: R.pelvis.y, waistY: R.spine_01.y, chestY: R.spine_03.y, shY: R.upperarm_l.y, neckY: R.neck_01.y, kneeY: R.calf_l.y, ankleY: R.foot_l.y,
    garment(spec) { const g = makeGarment(BD, spec); human.scene.add(g.mesh); c.meshes.push(g.mesh); (c.gars ||= {})[spec.name] = g; return g; },
    conform(g, spec) { if (low) return { mesh: null, geo: null }; const q = conformPatch(BD, g, spec); human.scene.add(q.mesh); c.meshes.push(q.mesh); return q; },
    sub(g, spec) { if (low) return { mesh: null, geo: null }; const s = subGarment(g, spec); human.scene.add(s.mesh); c.meshes.push(s.mesh); return s; },
    /* z de la superficie delantera (o trasera si back) de una prenda en (x,y) de reposo */
    surfZ(g, x, y, back = false, r = .02) { const P = g.geo.attributes.position.array; let best = null; for (let i = 0; i < P.length; i += 3) { if (Math.hypot(P[i] - x, P[i + 1] - y) > r) continue; const z = P[i + 2]; if (best === null || (back ? z < best : z > best)) best = z; } return best; },
    /* geometría suelta lista para materiales de tela: color + aFold */
    prep(geo) { const n = geo.attributes.position.count; geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3)); geo.setAttribute('aFold', new THREE.BufferAttribute(new Float32Array(n), 1)); return geo; },
    /* cuelga un objeto rígido de un hueso; restPos = posición de REPOSO en el mundo del personaje */
    attach(boneName, obj, restPos, rot) { const bone = human.bones[boneName], bw = R[boneName]; obj.position.set(restPos.x - bw.x, restPos.y - bw.y, restPos.z - bw.z); if (rot) obj.rotation.set(rot[0], rot[1], rot[2]); obj.castShadow = obj.receiveShadow = true; bone.add(obj); return obj; },
    /* geometría ya en coordenadas de reposo del mundo → colgada de un hueso sin desplazar */
    world(boneName, obj) { const bone = human.bones[boneName]; obj.position.set(-R[boneName].x, -R[boneName].y, -R[boneName].z); obj.castShadow = obj.receiveShadow = true; bone.add(obj); return obj; },
    box(w, h, d, r, mat) { return new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - .0005, h / 2 - .0005, d / 2 - .0005)), mat); },
    /* tubo cerrado siguiendo el borde de una prenda (cuellos, puños, dobladillos); axis = eje aproximado de la abertura */
    ring(edge, filter, radius, mat, o = {}) {
      const e = edge.filter(filter); if (e.length < 8) return null;
      const pts = e.map(k => k.p.clone()), cen = pts.reduce((a, p) => a.add(p), V3()).divideScalar(pts.length);
      const ax = (o.axis || V3(0, 1, 0)).clone().normalize(), h = Math.abs(ax.y) < .9 ? V3(0, 1, 0) : V3(1, 0, 0), u = h.clone().addScaledVector(ax, -h.dot(ax)).normalize(), w = V3().crossVectors(ax, u);
      const ang = (p) => { const d = p.clone().sub(cen); return o.open ? Math.atan2(d.x, -d.z) : Math.atan2(d.dot(w), d.dot(u)); };
      pts.sort((a, b) => ang(a) - ang(b));
      const cnt = {}; for (const k of e) cnt[k.bone] = (cnt[k.bone] || 0) + 1; const bone = o.bone || Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
      const curve = new THREE.CatmullRomCurve3(pts, !o.open, 'centripetal'); const geo = c.prep(new THREE.TubeGeometry(curve, Math.max(24, pts.length * 2), radius, 8, !o.open)); if (o.planar) planarUV(geo);
      return c.world(bone, new THREE.Mesh(geo, mat));
    },
    /* tubo abierto siguiendo un borde recto de la prenda (cremalleras, tapetas): puntos ordenados por altura */
    edgeLine(edge, filter, radius, mat, o = {}) {
      const pts = edge.filter(filter).map(k => k.p.clone()).sort((a, b) => b.y - a.y); if (pts.length < 4) return null;
      let dd = []; for (const p of pts) if (!dd.length || p.y < dd[dd.length - 1].y - .012) dd.push(p);
      if (o.straight) {                                       // borde recto de tapeta: media por franjas de altura + suavizado (el borde de la malla es ruidoso y parecía un cable)
        const bins = new Map(); for (const p of pts) { const k = Math.round(p.y / .03); const b = bins.get(k) || { s: V3(), n: 0 }; b.s.add(p); b.n++; bins.set(k, b); }
        dd = [...bins.entries()].sort((a, b) => b[0] - a[0]).map(([, b]) => b.s.divideScalar(b.n));
        for (let it = 0; it < 3; it++) dd = dd.map((p, i) => i === 0 || i === dd.length - 1 ? p : p.clone().multiplyScalar(.5).addScaledVector(dd[i - 1], .25).addScaledVector(dd[i + 1], .25));
      }
      const cnt = {}; for (const k of edge.filter(filter)) cnt[k.bone] = (cnt[k.bone] || 0) + 1; const bone = o.bone || Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
      const curve = new THREE.CatmullRomCurve3(dd.map(p => o.push ? p.add(o.push) : p), false, 'centripetal'); const tg = c.prep(new THREE.TubeGeometry(curve, dd.length * 3, radius, 6, false)); if (o.planar) planarUV(tg); return c.world(bone, new THREE.Mesh(tg, mat));
    },
    /* panel rectangular en el tronco: bolsillos, solapas, parches, cinturas (relieve suave; stitch = color del pespunte) */
    panel(g, o) {
      const { cx, cy, hw, hh } = o, lift = o.lift ?? .006, ed = o.edge ?? .012;
      const mat = o.stitch ? withPanel(o.mat, { hw, hh, color: o.stitch, inset: o.inset, double: o.double, dash: o.dash, groove: o.groove }) : o.mat;
      return c.conform(g, { name: o.name, material: mat, mode: 'torso', cx, cy, hw, hh, r: o.r ?? .008, back: !!o.back, lift, edge: ed, uvScale: o.uv ?? 1 });
    },
    /* trabilla de cinturón cosida en el borde superior del pantalón (x,y en reposo; back = espalda) */
    loop(g, x, y, back, mat) { const z = c.surfZ(g, x, y, back, .022); if (z == null) return null; const m = c.box(.013, .05, .007, .002, mat); return c.attach('pelvis', m, V3(x, y, z + (back ? -.003 : .003))); },
    /* longitud del brazo (m) */
    armLen(side = 'l') { return R['upperarm_' + side].distanceTo(R['lowerarm_' + side]) + R['lowerarm_' + side].distanceTo(R['hand_' + side]); },
    /* remache / botón metálico sobre una prenda del tronco en (x,y); back = espalda */
    rivet(g, x, y, back = false, r = .0034, mat) { const z = c.surfZ(g, x, y, back, .022); if (z == null) return null; const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 6), mat || c.std(0xb9b7b0, .28, { metalness: 1 })); m.scale.z = .5; return c.attach(y > c.waistY + .06 ? 'spine_03' : 'pelvis', m, V3(x, y, z + (back ? -.002 : .002))); },
    /* longitud del miembro (m) */
    legLen(side = 'l') { const A3 = BD.axis['leg' + side.toUpperCase()]; return A3[0].distanceTo(A3[1]) + A3[1].distanceTo(A3[2]); },
    /* panel en una pierna (t: [a,b] a lo largo, ang: [centro, semiancho] radianes alrededor) */
    legPanel(g, o) {
      const limb = 'leg' + o.side.toUpperCase(), total = c.legLen(o.side), [ta, tb] = o.t, [ac, aw] = o.ang, lift = o.lift ?? .006, ed = o.edge ?? .012, rr = o.r ?? .09;
      const hw = aw * rr, hh = (tb - ta) * total / 2;
      const mat = o.stitch ? withPanel(o.mat, { hw, hh, color: o.stitch, inset: o.inset, double: o.double, dash: o.dash, groove: o.groove }) : o.mat;
      return c.conform(g, { name: o.name, material: mat, mode: 'leg', limb, ta, tb, ac, aw, rr, hw, hh, r: .009, lift, edge: ed, uvScale: o.uv ?? 1 });
    },
    /* botón redondo cosido: disco con el eje según la normal n */
    button(bone, p, r, mat, n = V3(0, 0, 1)) { if (low) return null; const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, .0028, 14), mat); m.quaternion.setFromUnitVectors(V3(0, 1, 0), n.clone().normalize()); return c.attach(bone, m, p); },
    std(color, rough = .6, o = {}) { return new THREE.MeshStandardMaterial({ color, roughness: rough, envMap: F.env, envMapIntensity: .35, ...o }); },
  };
  if (!low) buildNails(human, BD, F);
  (OUTFITS[A.key] || (() => { }))(c);
  A.garments = c.meshes; A.cloth = c;
  return c;
}

/* ------------------------------------------------------------------ texturas de prenda */
function camoTex() {
  return canvasTex(512, 512, (g, W, H) => {
    g.fillStyle = '#8c8058'; g.fillRect(0, 0, W, H); const r = seed(41);
    const leaf = (x, y, s, col, a) => { g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = col; g.beginPath(); g.moveTo(0, -s); g.bezierCurveTo(s * .62, -s * .5, s * .5, s * .4, 0, s); g.bezierCurveTo(-s * .5, s * .4, -s * .62, -s * .5, 0, -s); g.fill(); g.restore(); };
    const cols = ['#5b4828', '#3e5828', '#26331c', '#7f7040', '#657f34'];
    for (let i = 0; i < 52; i++) { const x = r() * W, y = r() * H, s = 20 + r() * 40, col = cols[Math.floor(r() * cols.length)], a = r() * 6.28; for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) leaf(x + dx, y + dy, s, col, a); }
    g.strokeStyle = 'rgba(40,30,15,.55)'; g.lineWidth = 5; for (let i = 0; i < 10; i++) { const x = r() * W, y = r() * H; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 60, y + (r() - .5) * 80, x + 130, y + (r() - .5) * 60); g.stroke(); }
  }, { repeat: true });
}
function braidTex() { return canvasTex(128, 32, (g, W, H) => { g.fillStyle = '#5b3521'; g.fillRect(0, 0, W, H); g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 3; for (let x = -32; x < W + 32; x += 12) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 32, H); g.stroke(); g.beginPath(); g.moveTo(x + 32, 0); g.lineTo(x, H); g.stroke(); } g.strokeStyle = 'rgba(255,220,180,.25)'; g.lineWidth = 1.5; for (let x = -32; x < W + 32; x += 12) { g.beginPath(); g.moveTo(x + 4, 0); g.lineTo(x + 36, H); g.stroke(); } }, { repeat: true }); }

const collarFn = (collar, k = .05) => (x) => collar + Math.max(0, Math.abs(x) - k) * 1.4;

const OUTFITS = {
  /* ===== Yeray: sudadera azul desteñida + bermudas carpintero ===== */
  gamer(c) {
    const { F, R } = c, hemY = c.hipY - .13, collar = c.neckY - .04;
    const inflT = (y) => .036 + .008 * sstep(c.waistY, c.chestY, y) - .008 * sstep(c.shY - .06, c.shY + .04, y);
    const inflA = (t) => .022 + .012 * Math.sin(Math.PI * clamp(t * 1.05, 0, 1)) - .014 * sstep(.86, .985, t);
    const PIH = Math.PI / 2, HT = '#1a3f9a';
    const hoodM = addCreases(verticalFade(seamStitch(fabric(F, 'jogging_melange', { size: .45, normal: 2, sheen: .28, sheenColor: 0x6f90e0, color: 0xdddddd }), [
      { kind: 'ang', at: PIH, color: HT, on: 'torso', single: true, groove: .8 }, { kind: 'ang', at: -PIH, color: HT, on: 'torso', single: true, groove: .8 },
      { kind: 'ang', at: 0, color: HT, on: 'limb', single: true, groove: .9 }, { kind: 'ang', at: Math.PI, color: HT, on: 'limb', single: true, groove: .9 }]), hemY, c.shY + .12, '#0d2a7c', '#345cbb', .12), .016, 26);
    const hoodie = c.garment({ name: 'hoodie', drape: { y0: hemY, h: .38, amp: .008, n: 6, phase: .4 }, material: hoodM, torso: { y0: hemY, collarY: collarFn(collar, .055), infl: inflT }, arms: { sides: ['l', 'r'], t1: .985, infl: inflA }, smooth: 3 });
    const ribM = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: ribTexture('#153c9c'), roughness: 1, sheen: .8, sheenColor: new THREE.Color(0x4f76d0), side: THREE.DoubleSide, vertexColors: true, envMap: F.env, envMapIntensity: .25 });
    c.garment({ name: 'ribhem', material: ribM, torso: { y0: hemY, y1: hemY + .075, infl: (y) => inflT(y) + .004 }, smooth: 1, uvScale: 6 });
    c.garment({ name: 'ribcuff', material: ribM, arms: { sides: ['l', 'r'], t0: .905, t1: .99, infl: (t) => inflA(t) + .004 }, smooth: 1, uvScale: 6 });
    c.panel(hoodie, { name: 'kangaroo', mat: hoodM, cx: 0, cy: hemY + .175, hw: .155, hh: .09, lift: .007, edge: .02 });
    c.ring(hoodie.edge, e => e.info.collar, .011, ribM);
    // capucha caída sobre la espalda
    const zAvg = hoodie.collarPts.reduce((a, q) => a + q.z, 0) / hoodie.collarPts.length;
    const back = hoodie.collarPts.filter(p => p.z < zAvg + .02).sort((a, b) => a.x - b.x);
    if (back.length > 4) {
      // capucha caída: bolsa de tela doble que sigue la espalda (parche paramétrico: ancho en la nuca, se estrecha y se redondea abajo;
      // abultada en el centro, con hendidura de costura central y el borde inferior curvado hacia arriba por los lados)
      const yTop = back.reduce((q, p) => q + p.y, 0) / back.length + .006, zTop = Math.min(...back.map(p => p.z)), nu = 28, nv = 18, len = .215, wTop = .13, wBot = .085;
      const P = [], UV = [], COL = [], I = [], lerp = (a, b, t) => a + (b - a) * t;
      for (let j = 0; j <= nv; j++) {
        const v = j / nv, y0 = yTop - v * len;
        for (let i = 0; i <= nu; i++) {
          const u = i / nu * 2 - 1, w = lerp(wTop, wBot, Math.pow(v, 1.1)), x = u * w;
          const bulge = Math.pow(Math.sin(Math.PI * clamp(v * 1.12, 0, 1)), .75) * Math.pow(1 - u * u, .5);
          const seam = Math.exp(-Math.pow(u / .05, 2)), fold = .004 * Math.sin(u * 9 + v * 4) * bulge;
          const y = y0 + u * u * .05 * Math.pow(v, 2.2);
          const zb = c.surfZ(hoodie, x, y, true, .04) ?? (zTop - v * .02);
          const off = .012 + .046 * bulge - .0045 * seam * bulge + fold;
          P.push(x, y, zb - off); UV.push(x + (zb - off) * .6, y);
          const ao = 1 - .16 * Math.pow(v, 2.5) - .1 * seam * bulge - .06 * (1 - bulge);
          COL.push(ao, ao, ao);
        }
      }
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c2 = a + nu + 1, d = c2 + 1; I.push(a, b, c2, b, d, c2); }
      const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); hg.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
      hg.setAttribute('color', new THREE.Float32BufferAttribute(COL, 3)); hg.setAttribute('aFold', new THREE.BufferAttribute(new Float32Array(P.length / 3), 1)); hg.setIndex(I); hg.computeVertexNormals();
      c.world('spine_03', new THREE.Mesh(hg, hoodM));
    }
    // cordones con herretes
    const cordM = c.std(0xc9c7bf, .9), aglet = c.std(0x1a1a1a, .4, { metalness: .6 });
    for (const sd of [1, -1]) {
      const x = sd * .04, z0 = c.surfZ(hoodie, x, collar - .02, false, .03) ?? .1, z1 = c.surfZ(hoodie, x, collar - .17, false, .03) ?? .12;
      const cg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(x, collar - .015, z0 + .006), V3(x * 1.1, collar - .07, (z0 + z1) / 2 + .008), V3(x * 1.05, collar - .17, z1 + .008)]), 14, .0035, 6);
      c.world('spine_03', new THREE.Mesh(cg, cordM)); c.attach('spine_03', new THREE.Mesh(new THREE.CylinderGeometry(.0055, .0055, .022, 8), aglet), V3(x * 1.05, collar - .18, z1 + .008));
    }
    // bermudas carpintero de sarga negra
    const TH = '#7a7a84', PI2 = Math.PI / 2, LL = c.legLen('l');
    const den = addCreases(seamStitch(fabric(F, 'denim_fabric_04', { size: .32, color: 0x18181c, normal: 1.8, sheen: 0 }), [
      { kind: 'ang', at: PI2, color: TH, on: 'limb' }, { kind: 'ang', at: -PI2, color: TH, on: 'limb' },
      { kind: 'lev', at: LL * .58 - .028, color: TH, on: 'limb', off: .0035 }, { kind: 'lev', at: c.waistY + .035, color: TH, on: 'torso', off: .004 }]), .018, 30);
    const shorts = c.garment({ name: 'shorts', material: den, torso: { y1: c.waistY + .045, infl: (y) => .022 + .006 * sstep(c.hipY - .1, c.waistY, y) }, legs: { sides: ['l', 'r'], t1: .58, infl: (t, ang) => .022 + .022 * sstep(.05, .38, t) - .006 * sstep(.45, .58, t) + .004 * Math.sin(ang * 5 + t * 30) * sstep(.3, .58, t) }, smooth: 3 });
    for (const sd of [1, -1]) c.panel(shorts, { name: 'bpocket' + sd, mat: den, cx: sd * .075, cy: c.hipY - .01, hw: .058, hh: .052, back: true, lift: .005, stitch: TH });
    c.panel(shorts, { name: 'fly', mat: den, cx: 0, cy: c.hipY - .01, hw: .016, hh: .1, lift: .0025, stitch: TH, inset: .004 });
    const cargo = (side, t0, t1, ang, w, ln, lift = .009) => { const d = side === 'l' ? 1 : -1; c.legPanel(shorts, { name: ln, side, t: [t0, t1], ang: [ang * d, w], mat: den, lift, edge: .02, stitch: TH, double: true }); };
    cargo('l', .13, .36, 1.15, .42, 'cargoL'); cargo('l', .075, .14, 1.15, .40, 'flapL', .012);   // bolsillo de carga (muslo izquierdo)
    cargo('r', .12, .30, -1.5, .18, 'rule');                                                     // bolsillo de metro (derecho, estrecho)
    const loop = c.std(0x111114, .8), zw = c.BD.zcAt(c.waistY);
    for (const x of [-.1, -.045, .045, .1]) c.attach('pelvis', c.box(.012, .05, .006, .002, loop), V3(x, c.waistY + .02, zw + (Math.abs(x) < .05 ? .108 : .092)));
    c.button('pelvis', V3(0, c.waistY + .01, zw + .112), .009, c.std(0x9a9aa2, .3, { metalness: .9 }), V3(0, 0, 1));
    // remaches en las esquinas de los bolsillos, ojales metálicos de los cordones
    for (const sd of [1, -1]) for (const dx of [-.05, .05]) c.rivet(shorts, sd * .075 + dx, c.hipY - .01 + .043, true);
    for (const sd of [1, -1]) { const x = sd * .04, z0 = c.surfZ(hoodie, x, collar - .02, false, .03) ?? .1; const ring = new THREE.Mesh(new THREE.TorusGeometry(.0058, .0016, 6, 14), c.std(0xa5a8b2, .3, { metalness: 1 })); c.attach('spine_03', ring, V3(x, collar - .012, z0 + .004)); }
    // calcetines blancos acanalados (asoman por encima de la zapatilla)
    { const sockM = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 1, side: THREE.DoubleSide, vertexColors: true, envMap: F.env, envMapIntensity: .2, map: ribTexture('#f6f6f2', 10) });
      for (const s of ['l', 'r']) { const sock = c.garment({ name: 'sock_' + s, material: sockM, legs: { sides: [s], t0: .80, infl: () => .003 }, smooth: 1, uvScale: 10 }); c.ring(sock.edge, e => e.info.part === 'leg' && e.info.side === s && e.info.t < .86, .005, sockM); } }
    buildHeadwearAndShoes(c, { cap: { color: '#0e0e10', seam: '#54545c', logo: 'S', logoCol: '#f2f2ee', logoDark: '#0a0a0a', flat: true, under: 0x1e1e22 },
      shoes: { model: true, variant: 'midnight', scale: 1.25, shift: -.014, drop: .012, tall: 1.32, wide: 1.26, high: true, tex: 'brown_leather', upper: 0x101216, overlay: 0x14335e, accent: 0x1c4fb0, mid: 0xf2f0e8, out: 0x17181b, laces: 0x2657c2, tongue: 0x1b4aa8, eyelet: 0xa5a8b2 } });
  },

  /* ===== Noa: camiseta blanca de bolsillo + vaquero negro ancho de costuras blancas ===== */
  phone(c) {
    const { F, R } = c, hemY = c.hipY - .085, collar = c.neckY - .045;
    const TT = '#a9a7a0', AL = c.armLen('l');
    const teeM = addCreases(seamStitch(fabric(F, 'cotton_jersey', { size: .30, rot: Math.PI / 2, color: 0xe8e8e6, normal: 2.2, sheen: .3 }), [
      { kind: 'ang', at: Math.PI / 2, color: TT, on: 'torso', single: true, groove: .6 }, { kind: 'ang', at: -Math.PI / 2, color: TT, on: 'torso', single: true, groove: .6 },
      { kind: 'lev', at: hemY + .022, color: TT, on: 'torso' }, { kind: 'lev', at: AL * .40 - .022, color: TT, on: 'limb' }]), .012, 30);
    const tee = c.garment({ name: 'tee', drape: { y0: hemY, h: .45, amp: .008, n: 6, phase: .3 }, relax: 30, relaxX: .17, material: teeM, torso: { nrmFrom: c.waistY - .02, nrmSpan: .12, nrmMax: .75, y0: hemY, collarY: collarFn(collar), infl: (y) => .036 + .026 * sstep(c.waistY, c.chestY, y) - .030 * sstep(c.chestY + .04, c.shY + .04, y) }, arms: { sides: ['l', 'r'], t1: .40, infl: (t) => .022 + .012 * sstep(.1, .38, t) }, smooth: 6 });
    c.ring(tee.edge, e => e.info.collar, .0075, teeM);
    c.panel(tee, { name: 'pocket', mat: teeM, cx: .085, cy: c.chestY + .075, hw: .05, hh: .052, lift: .004, stitch: '#d9d6cd', inset: .004, groove: .5 });
    c.panel(tee, { name: 'label', mat: c.std(0x0a0a0a, .5, { vertexColors: true }), cx: .085, cy: c.chestY + .100, hw: .012, hh: .008, lift: .0065, edge: .004 });
    // vaquero negro crudo, ancho, con pespuntes blancos (costuras analíticas en el shader + pespuntes de bolsillo)
    const WH = '#f4f0e4', PI2 = Math.PI / 2, LL = c.legLen('l');
    const den = addCreases(seamStitch(fabric(F, 'denim_fabric_04', { size: .32, color: 0x040406, normal: 2, sheen: 0 }), [
      { kind: 'ang', at: PI2, color: WH, on: 'limb' }, { kind: 'ang', at: -PI2, color: WH, on: 'limb' },
      { kind: 'lev', at: LL * 1.03 - .03, color: WH, on: 'limb', off: .0035 }, { kind: 'lev', at: c.waistY + .0, color: WH, on: 'torso', off: .004 }, { kind: 'lev', at: c.waistY - .022, color: WH, on: 'torso', off: .0035, single: true }]), .026, 24);
    const infl = (t, ang) => .026 + .02 * sstep(.1, .5, t) + .026 * sstep(.5, .95, t) + .012 * sstep(.86, 1.02, t) * (.5 + .5 * Math.sin(ang * 5 + t * 55));
    const jeans = c.garment({ name: 'jeans', material: den, torso: { y1: c.waistY + .02, infl: (y) => .016 + .006 * sstep(c.hipY - .12, c.waistY, y) }, legs: { sides: ['l', 'r'], t1: 1.03, infl }, smooth: 3 });
    for (const sd of [1, -1]) {
      c.panel(jeans, { name: 'bp' + sd, mat: den, cx: sd * .072, cy: c.hipY - .02, hw: .058, hh: .052, back: true, lift: .005, stitch: WH, double: true });
      const side = sd > 0 ? 'l' : 'r';
      c.legPanel(jeans, { name: 'fpock' + side, side, t: [.02, .12], ang: [.78 * sd, .16], mat: den, lift: .002, edge: .01, stitch: WH });
    }
    c.panel(jeans, { name: 'fly', mat: den, cx: 0, cy: c.hipY - .01, hw: .016, hh: .1, lift: .0025, stitch: WH, inset: .004 });
    c.panel(jeans, { name: 'lpatch', mat: c.std(0x9a6a44, .8, { vertexColors: true }), cx: -.075, cy: c.waistY - .035, hw: .028, hh: .014, back: true, lift: .0055, edge: .006, stitch: '#3a2414', inset: .003 });
    c.button('pelvis', V3(0, c.waistY + .003, c.BD.zcAt(c.waistY) + .098), .01, c.std(0xbdbdc4, .3, { metalness: .9 }), V3(0, 0, 1));
    for (const sd of [1, -1]) for (const dx of [-.05, .05]) c.rivet(jeans, sd * .072 + dx, c.hipY - .02 + .045, true);
    c.rivet(jeans, 0, c.hipY - .01 - .1, false, .0038);
    for (const [x, back] of [[.1, false], [.05, true], [-.05, true], [-.1, false], [.16, false], [-.16, false]]) c.loop(jeans, x, c.waistY - .008, back, c.std(0x0a0a0c, .8));
    buildHeadwearAndShoes(c, { cap: { color: '#101012', seam: '#6c6c72', logo: 'thorns', logoCol: '#e9e6dc', logoDark: '#0c0c0c', logoSize: 1.0, flat: true, under: 0x202024 },
      shoes: { high: true, covered: true, tex: 'brown_leather', upper: 0xf1f0ec, overlay: 0xe9edf0, accent: 0xdadde0, mid: 0xf3efe4, out: 0xe8e2d2, laces: 0x101012, tongue: 0xf1f0ec, eyelet: 0xc7c9cf } });
  },

  /* ===== Malik: camisa de camuflaje abierta + camiseta blanca + vaquero lavado ===== */
  smoker(c) {
    const { F, R } = c, hemY = c.hipY - .12, collar = c.neckY - .045;
    const TT = '#9c9a92', AL = c.armLen('l');
    const teeM = addCreases(seamStitch(fabric(F, 'cotton_jersey', { size: .30, rot: Math.PI / 2, color: 0xe6e4de, normal: 2.2, sheen: .3 }), [
      { kind: 'ang', at: Math.PI / 2, color: TT, on: 'torso', single: true, groove: .6 }, { kind: 'ang', at: -Math.PI / 2, color: TT, on: 'torso', single: true, groove: .6 },
      { kind: 'lev', at: c.hipY - .07 + .022, color: TT, on: 'torso' }, { kind: 'lev', at: AL * .38 - .022, color: TT, on: 'limb' }]), .012, 30);
    const tee = c.garment({ name: 'tee', drape: { y0: c.hipY - .07, h: .5, amp: .010, n: 5, phase: 1.9 }, relax: 30, relaxX: .17, material: teeM, torso: { nrmFrom: c.waistY - .02, nrmSpan: .12, nrmMax: .75, y0: c.hipY - .07, collarY: collarFn(collar), infl: (y) => .034 + .010 * sstep(c.waistY - .02, c.chestY + .05, y) - .012 * sstep(c.shY - .06, c.shY + .03, y) }, arms: { sides: ['l', 'r'], t1: .38, infl: (t) => .022 + .01 * sstep(.1, .35, t) }, smooth: 6 });
    c.ring(tee.edge, e => e.info.collar, .0075, teeM);
    const camoMap = camoTex(); camoMap.repeat.set(1 / .5, 1 / .5);
    const camoM0 = fabric(F, 'terlenka', { size: .30, color: 0x9a9a92, normal: 1.4, sheen: .1 }); camoM0.map = camoMap;
    const CT = '#2a2814', PIs = Math.PI / 2;
    const camoM = addCreases(seamStitch(camoM0, [
      { kind: 'ang', at: PIs, color: CT, on: 'torso', groove: .8 }, { kind: 'ang', at: -PIs, color: CT, on: 'torso', groove: .8 },
      { kind: 'ang', at: 0, color: CT, on: 'limb', single: true, groove: .8 }, { kind: 'ang', at: Math.PI, color: CT, on: 'limb', single: true, groove: .8 },
      { kind: 'lev', at: hemY + .022, color: CT, on: 'torso' }]), .018, 26);
    const dark = c.std(0x33301c, .9, { side: THREE.DoubleSide, vertexColors: true });
    const gapW = (y) => .038 + .075 * sstep(collar - .01, collar - .2, y);
    const shirt = c.garment({ name: 'overshirt', drape: { y0: hemY, h: .35, amp: .012, n: 6, phase: 2.2 }, material: camoM, torso: { y0: hemY, collarY: collarFn(collar + .01, .06), gap: gapW, gapMinZ: -.02, infl: (y) => .046 + .008 * sstep(c.waistY, c.chestY, y) - .004 * sstep(c.shY - .05, c.shY + .04, y) }, arms: { sides: ['l', 'r'], t1: .60, infl: (t) => .038 + .014 * Math.sin(Math.PI * clamp(t * 1.4, 0, 1) * .8) }, smooth: 3 });
    // (cuello de la camisa: el propio borde del cascarón; un tubo abierto se retorcía)                                                     // cuello
    c.garment({ name: 'cuffroll', material: camoM, arms: { sides: ['l', 'r'], t0: .545, t1: .605, infl: (t) => .038 + .014 * Math.sin(Math.PI * clamp(t * 1.4, 0, 1) * .8) + .013 }, smooth: 1, uvScale: 1 });   // mangas remangadas (banda con el mismo esqueleto)
    for (const sd of [1, -1]) {                                                                              // bolsillos de pecho con solapa y botón
      c.panel(shirt, { name: 'cp' + sd, mat: camoM, cx: sd * .152, cy: c.chestY + .09, hw: .03, hh: .042, lift: .005, stitch: '#2a2814', inset: .004 });
      c.panel(shirt, { name: 'cpf' + sd, mat: camoM, cx: sd * .152, cy: c.chestY + .138, hw: .032, hh: .016, lift: .009, edge: .008, stitch: '#2a2814', inset: .0035 });
    }
    // tapeta con botones blancos a lo largo de los bordes de la abertura
    const btnM = c.std(0xd9d3c2, .55);
    for (const sd of [1, -1]) c.edgeLine(shirt.edge, e => e.info.gapIn && Math.sign(e.p.x) === sd, .0065, camoM, { planar: true, straight: true });
    // el borde real de la abertura queda más afuera que gapW (el inflado del tejido lo desplaza): se mide sobre la malla y los botones van sobre la tapeta, no sobre la camiseta
    const gapX = (y, sd) => { let s = 0, n = 0; for (const e of shirt.edge) if (e.info.gapIn && Math.sign(e.p.x) === sd && Math.abs(e.p.y - y) < .03) { s += e.p.x; n++; } return n ? s / n : sd * (gapW(y) + .045); };
    const holeM = c.std(0x14120a, .9);
    for (let i = 0; i < 6; i++) for (const sd of [1, -1]) { const y = collar - .09 - i * .085, x = gapX(y, sd) + sd * .02, z = c.surfZ(shirt, x, y, false, .02);
      if (z == null) continue;
      if (sd < 0) c.button('spine_03', V3(x, y, z + .003), .0062, btnM, V3(0, 0, 1));                 // botones en la tapeta derecha del portador
      else c.attach('spine_03', new THREE.Mesh(new THREE.BoxGeometry(.012, .0026, .0016), holeM), V3(x, y, z + .0022)); }   // ojales en la izquierda
    c.ring(shirt.edge, e => e.info.collar, .0115, camoM, { planar: true });                                                  // cuello de camisa (banda gruesa alrededor del cuello)
    // vaquero de lavado claro, corte recto
    const GT = '#d3a95a', PI2 = Math.PI / 2, LL = c.legLen('l');
    const denM = addCreases(seamStitch(fabric(F, 'denim_fabric_04', { size: .32, color: 0xc4d2e4, normal: 1.8, sheen: 0 }), [
      { kind: 'ang', at: PI2, color: GT, on: 'limb' }, { kind: 'ang', at: -PI2, color: GT, on: 'limb' },
      { kind: 'lev', at: LL * 1.02 - .03, color: GT, on: 'limb', off: .0035 }, { kind: 'lev', at: c.waistY - .008, color: GT, on: 'torso', off: .004, single: true }]), .02, 30);
    const jeans = c.garment({ name: 'jeans', material: denM, torso: { y1: c.waistY + .02, infl: (y) => .019 + .006 * sstep(c.hipY - .12, c.waistY, y) }, legs: { sides: ['l', 'r'], t1: 1.02, noFoot: true, infl: (t, ang) => .020 + .012 * sstep(.15, .6, t) + .006 * sstep(.6, 1, t) + .005 * Math.sin(ang * 6 + t * 50) * sstep(.86, 1.02, t) }, smooth: 3 });
    for (const sd of [1, -1]) c.panel(jeans, { name: 'bpm' + sd, mat: denM, cx: sd * .075, cy: c.hipY - .02, hw: .058, hh: .052, back: true, lift: .005, stitch: GT, double: true });
    for (const side of ['l', 'r']) { const d = side === 'l' ? 1 : -1; c.legPanel(jeans, { name: 'fp' + side, side, t: [.02, .12], ang: [.78 * d, .16], mat: denM, lift: .002, edge: .01, stitch: GT }); }
    c.panel(jeans, { name: 'fly', mat: denM, cx: 0, cy: c.hipY - .01, hw: .016, hh: .1, lift: .0025, stitch: GT, inset: .004 });
    // cinturón negro (tubo sobre el borde superior del vaquero: borde limpio) con hebilla y parche tostado
    const beltM = c.std(0x0d0d0f, .5), topSel = (e) => e.info.part === 'torso' && e.info.y > c.waistY + .012;
    c.ring(jeans.edge, topSel, .0135, beltM, { scale: null });
    const bzz = c.surfZ(jeans, 0, c.waistY + .02, false, .03) ?? c.BD.zcAt(c.waistY) + .1;
    c.attach('pelvis', c.box(.036, .028, .008, .002, c.std(0xb8b8be, .25, { metalness: 1 })), V3(.004, c.waistY + .012, bzz + .018));
    const pz = c.surfZ(jeans, -.09, c.waistY + .012, false, .03) ?? bzz - .01;
    c.attach('pelvis', c.box(.05, .03, .007, .003, c.std(0x9b7250, .75)), V3(-.09, c.waistY + .012, pz + .017), [0, -.25, 0]);
    for (const sd of [1, -1]) for (const dx of [-.05, .05]) c.rivet(jeans, sd * .075 + dx, c.hipY - .02 + .045, true, .0034, c.std(0xc9a25a, .3, { metalness: 1 }));
    for (const sd of [1, -1]) { c.rivet(shirt, sd * .152, c.chestY + .134, false, .0046, c.std(0xf1eee6, .45)); }
    c.rivet(jeans, 0, c.hipY - .01 - .1, false, .0038, c.std(0xc9a25a, .3, { metalness: 1 }));
    for (const [x, back] of [[.11, false], [.06, true], [-.06, true], [-.11, false]]) c.loop(jeans, x, c.waistY - .012, back, c.std(0x9fb6d2, .8));
    // calcetines grises acanalados bajo las zapatillas (tapan la piel del tobillo y del pie dentro del zapato)
    { const sockM = new THREE.MeshStandardMaterial({ color: 0x8b8d92, roughness: 1, side: THREE.DoubleSide, vertexColors: true, envMap: F.env, envMapIntensity: .2, map: ribTexture('#b9bbc0', 10) });
      for (const s of ['l', 'r']) c.garment({ name: 'sock_' + s, material: sockM, legs: { sides: [s], t0: .80, infl: () => .003 }, smooth: 1, uvScale: 10 }); }
    buildHeadwearAndShoes(c, { cap: { color: '#1f3a66', seam: '#7f9ac4', logo: 'H', logoCol: '#48b25a', logoDark: '#12301a', flat: true, under: 0x162a4c },
      shoes: { model: true, variant: 'street', scale: 1.25, shift: -.014, drop: .012, tall: 1.32, wide: 1.26, high: true, covered: true, tex: 'cotton_jersey', pad: .016, upper: 0x8f8a80, overlay: 0x5d4c3a, accent: 0x3f4c3c, mid: 0xf4f0e6, out: 0x2b2a28, laces: 0xe9dcc0, tongue: 0x8f8a80, eyelet: 0x8a7a5a, texSize: .05, normal: 1.1 } });
  },

  /* ===== Zuri: camiseta fosforito + chaleco utilitario beige + cargo oliva + trenzado + calcetines ===== */
  artist(c) {
    const { F, R } = c, hemY = c.hipY - .05, collar = c.neckY - .045;
    const TT = '#a7c400', AL = c.armLen('l');
    const teeM = addCreases(seamStitch(fabric(F, 'cotton_jersey', { size: .30, rot: Math.PI / 2, color: 0xf0ff10, normal: 2, sheen: .3, emissive: 0x7a9a00, emissiveI: .3 }), [
      { kind: 'ang', at: Math.PI / 2, color: TT, on: 'torso', single: true, groove: .6 }, { kind: 'ang', at: -Math.PI / 2, color: TT, on: 'torso', single: true, groove: .6 },
      { kind: 'lev', at: hemY + .022, color: TT, on: 'torso' }, { kind: 'lev', at: AL * .42 - .022, color: TT, on: 'limb' }]), .012, 30);
    const tee = c.garment({ name: 'tee', drape: { y0: hemY, h: .42, amp: .008, n: 6, phase: 3.1 }, relax: 30, relaxX: .17, material: teeM, torso: { nrmFrom: c.waistY - .02, nrmSpan: .12, nrmMax: .75, y0: hemY, collarY: collarFn(collar), infl: (y) => .014 + .022 * sstep(c.waistY - .02, c.chestY + .05, y) - .012 * sstep(c.shY - .06, c.shY + .03, y) }, arms: { sides: ['l', 'r'], t1: .42, infl: (t) => .022 + .01 * sstep(.1, .38, t) }, smooth: 3 });
    c.ring(tee.edge, e => e.info.collar, .0075, teeM);
    // pantalón cargo oliva, ligeramente corto
    const OT = '#3f4326', PI2 = Math.PI / 2, LL = c.legLen('l');
    const olive = addCreases(seamStitch(fabric(F, 'denim_fabric_04', { size: .32, color: 0x6b7042, normal: 1.6, sheen: 0 }), [
      { kind: 'ang', at: PI2, color: OT, on: 'limb' }, { kind: 'ang', at: -PI2, color: OT, on: 'limb' },
      { kind: 'lev', at: LL * .90 - .03, color: OT, on: 'limb', off: .0035 }, { kind: 'lev', at: c.waistY - .008, color: OT, on: 'torso', off: .004, single: true }]), .022, 28);
    const cargo = c.garment({ name: 'cargo', material: olive, torso: { y1: c.waistY + .02, infl: (y) => .018 + .006 * sstep(c.hipY - .12, c.waistY, y) }, legs: { sides: ['l', 'r'], t1: .90, infl: (t, ang) => .024 + .020 * sstep(.1, .5, t) + .010 * sstep(.5, .9, t) + .005 * Math.sin(ang * 5 + t * 38) * sstep(.5, .9, t) }, smooth: 3 });
    for (const side of ['l', 'r']) { const d = side === 'l' ? 1 : -1;
      c.legPanel(cargo, { name: 'cg' + side, side, t: [.14, .40], ang: [1.2 * d, .44], mat: olive, lift: .011, edge: .022, stitch: OT, double: true });
      c.legPanel(cargo, { name: 'cgf' + side, side, t: [.085, .15], ang: [1.2 * d, .42], mat: olive, lift: .014, edge: .01, stitch: OT, inset: .0035 });
      c.button('thigh_' + side, V3(R['thigh_' + side].x + d * .11, c.hipY - .22, .11), .0085, c.std(0x2f321c, .5), V3(d, 0, .4)); }
    for (const sd of [1, -1]) c.panel(cargo, { name: 'bpo' + sd, mat: olive, cx: sd * .075, cy: c.hipY - .02, hw: .058, hh: .052, back: true, lift: .005, stitch: OT, double: true });
    // calcetines blancos largos entre el bajo del pantalón y la zapatilla
    const sockT = ribTexture('#f6f6f2', 10);
    const sockM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide, vertexColors: true, envMap: F.env, envMapIntensity: .2, map: sockT });
    for (const s of ['l', 'r']) { const sock = c.garment({ name: 'sock_' + s, material: sockM, legs: { sides: [s], t0: .86, t1: 1.0, infl: () => .006 }, smooth: 1, uvScale: 10 }); c.ring(sock.edge, e => e.info.part === 'leg' && e.info.side === s && e.info.t < .9, .0055, sockM); }
    // chaleco utilitario beige de nailon
    const NT = '#3a3222';
    const armR = R.upperarm_l.distanceTo(R.lowerarm_l) * .40, AHY = -.01, AHH = .17;
    const ahSeg = (sd) => ({ c: V3(R['upperarm_' + sd].x + (sd === 'l' ? .04 : -.04), R['upperarm_' + sd].y + AHY, R['upperarm_' + sd].z), h: AHH });
    const nylon = armholeCut(addCreases(seamStitch(fabric(F, 'terlenka', { size: .30, color: 0xc9ab78, normal: 1.3, sheen: .3, rough: .8 }), [
      { kind: 'ang', at: Math.PI / 2, color: NT, on: 'torso', groove: .8 }, { kind: 'ang', at: -Math.PI / 2, color: NT, on: 'torso', groove: .8 },
      { kind: 'lev', at: c.hipY - .07 + .02, color: NT, on: 'torso' }, { kind: 'lev', at: c.neckY - .04 + .022, color: NT, on: 'torso', single: true },
      { kind: 'ang', at: Math.PI, color: NT, on: 'torso', groove: .7 }, { kind: 'ang', at: Math.PI * .72, color: NT, on: 'torso', single: true, groove: .5 }, { kind: 'ang', at: -Math.PI * .72, color: NT, on: 'torso', single: true, groove: .5 },
      { kind: 'lev', at: c.shY - .17, color: NT, on: 'torso', off: .0045 }, { kind: 'lev', at: c.waistY + .02, color: NT, on: 'torso', single: true }]), .012, 22), [{ ...ahSeg('l'), R: armR }, { ...ahSeg('r'), R: armR }]);
    const tape = c.std(0x2b2a26, .8, { vertexColors: true, side: THREE.DoubleSide });
    // chaleco cerrado con cremallera (abertura en V sólo en los últimos 7 cm), sisas limpias (cápsula alrededor del brazo) y cuello alto de tela
    const vTop = collar - .075, gapW = (y) => y > vTop ? .004 + .03 * sstep(vTop, collar + .01, y) : 0;
    const vest = c.garment({ name: 'vest', material: nylon, torso: { y0: c.hipY - .025, y1: c.neckY - .005, noNeck: true, legAbove: c.hipY - .1, collarY: collarFn(collar + .012, .055), gap: gapW, gapMinZ: -.02,
      infl: (y) => .040 + .020 * (1 - sstep(c.hipY - .06, c.waistY + .04, y)) + .016 * sstep(c.waistY, c.chestY, y) - .008 * sstep(c.shY - .05, c.shY + .03, y) }, smooth: 4 });
    const bindM = c.std(0x2f2b20, .8, { vertexColors: true, side: THREE.DoubleSide });
    // ribete de las sisas: tubo con esqueleto siguiendo la intersección exacta del chaleco con el corte
    for (const sd of ['l', 'r']) { const pts = armholeEdge(vest, ahSeg(sd), armR); if (pts.length > 8) { const t = skinnedTube(c.BD, vest, pts, .0072, bindM); c.human.scene.add(t.mesh); c.meshes.push(t.mesh); } }
    // ribete del escote (tubo abierto siguiendo el borde superior; el frente queda abierto en V)
    c.ring(vest.edge, e => e.info.collar, .0095, nylon, { open: true });

    const VT = '#2e2a1c';
    for (const sd of [1, -1]) {
      c.edgeLine(vest.edge, e => e.info.gapIn && Math.sign(e.p.x) === sd, .003, tape);
      c.panel(vest, { name: 'cpk' + sd, mat: nylon, cx: sd * .088, cy: c.chestY + .085, hw: .042, hh: .046, lift: .006, stitch: VT });
      c.panel(vest, { name: 'cpkf' + sd, mat: nylon, cx: sd * .088, cy: c.chestY + .133, hw: .044, hh: .019, lift: .0105, edge: .008, stitch: VT, inset: .0035 });
      c.panel(vest, { name: 'lpk' + sd, mat: nylon, cx: sd * .115, cy: c.chestY - .12, hw: .058, hh: .062, lift: .009, edge: .014, stitch: VT, double: true });
      c.panel(vest, { name: 'lpkf' + sd, mat: nylon, cx: sd * .115, cy: c.chestY - .062, hw: .06, hh: .022, lift: .0135, edge: .008, stitch: VT, inset: .0035 });
    }
    c.panel(vest, { name: 'zipc', mat: tape, cx: 0, cy: (c.hipY - .025 + vTop) / 2, hw: .0055, hh: (vTop - (c.hipY - .025)) / 2, lift: .0035, r: .0025, edge: .003 });
    // anilla en D y etiqueta neutra
    const dz = c.surfZ(vest, .075, c.chestY + .02, false, .02) ?? .12;
    c.attach('spine_03', new THREE.Mesh(new THREE.TorusGeometry(.011, .0022, 6, 14, Math.PI * 1.75), c.std(0x141414, .35, { metalness: .85 })), V3(.075, c.chestY + .02, dz + .004), [0, .35, 0]);
    c.panel(vest, { name: 'tag', mat: c.std(0xe9e6de, .7, { vertexColors: true }), cx: -.075, cy: c.chestY + .045, hw: .013, hh: .01, lift: .005, edge: .004 });
    // cinturón trenzado marrón + cola
    const bt = braidTex(); bt.repeat.set(9, 1);
    const braid = new THREE.MeshStandardMaterial({ map: bt, roughness: .55, envMap: F.env, envMapIntensity: .4 });
    c.ring(cargo.edge, e => e.info.part === 'torso' && e.info.y > c.waistY + .012, .0105, braid);
    for (const [x, back] of [[.1, false], [.05, true], [-.05, true], [-.1, false]]) c.loop(cargo, x, c.waistY - .01, back, c.std(0x5b6038, .85));
    const bz = c.BD.zcAt(c.waistY) + .118;
    c.attach('pelvis', c.box(.034, .03, .008, .003, c.std(0xb9b7ae, .3, { metalness: 1 })), V3(.05, c.waistY + .003, bz));
    c.world('pelvis', new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(.075, c.waistY + .004, bz - .004), V3(.09, c.waistY - .07, bz - .012), V3(.09, c.waistY - .14, bz - .018)]), 12, .0085, 6), braid));
    // cadena fina al cuello
    c.world('spine_03', new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(-.058, c.neckY - .05, .01), V3(-.05, c.neckY - .10, .08), V3(0, c.neckY - .155, .112), V3(.05, c.neckY - .10, .08), V3(.058, c.neckY - .05, .01)]), 32, .0026, 5), c.std(0xd5d8dc, .2, { metalness: 1 })));
    // automáticos de las solapas y cursores de las cremalleras
    const snap = c.std(0x1a1a1a, .35, { metalness: .8 });
    for (const sd of [1, -1]) { c.rivet(vest, sd * .088, c.chestY + .132, false, .0055, snap); c.rivet(vest, sd * .115, c.chestY - .06, false, .006, snap);
      if (sd === 1) for (const zy of [vTop + .006, c.hipY - .025 + .03]) { const zz = c.surfZ(vest, 0, zy, false, .03); if (zz != null) c.attach(zy > c.waistY + .06 ? 'spine_03' : 'pelvis', c.box(.011, .024, .005, .0015, c.std(0x9c9a94, .3, { metalness: 1 })), V3(0, zy, zz + .006)); }
    }
    for (const side of ['l', 'r']) for (const dx of [-.05, .05]) c.rivet(cargo, (side === 'l' ? 1 : -1) * .075 + dx, c.hipY - .02 + .043, true, .0034, c.std(0x3a3d22, .35, { metalness: .8 }));
    buildHeadwearAndShoes(c, { beanie: { color: '#4d0d1f' },
      shoes: { model: true, variant: 'midnight', scale: 1.15, shift: -.012, drop: .01, tall: 1.3, wide: 1.2, high: false, chunky: true, tex: 'terlenka', upper: 0x3a2224, overlay: 0x24262e, accent: 0xc8f000, mid: 0x2e3038, out: 0x16171a, laces: 0x1a1a1c, tongue: 0x24262e, eyelet: 0x8a8c94, texSize: .06, normal: .6, rough: .55 } });
  },
};

function buildHeadwearAndShoes(c, o) {
  if (o.cap) buildCap(c, o.cap);
  if (o.beanie) buildBeanie(c, o.beanie);
  if (o.shoes) buildShoes(c, o.shoes);
}
