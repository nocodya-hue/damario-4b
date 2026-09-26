/* =========================================================
   ZAPATILLAS — ajustadas al pie real de cada personaje
     · suela (exterior + entresuela) extruida sobre la huella real del pie (casco convexo de sus vértices)
     · empeine como cascarón del propio pie (inflado por la normal) → nada atraviesa, todo se dobla con el tobillo
     · puntera, talonera, banda lateral (sub-prendas con relieve), cuello acolchado, lengüeta, ojales y cordones (con lazada)
   ========================================================= */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { fabric } from './fabrics.js';
import { canvasTex, seed } from '../world/materials.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

function hull2(pts) {                                    // casco convexo (cadena monótona), puntos {x,z}
  const P = pts.slice().sort((a, b) => a.x - b.x || a.z - b.z), cr = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of P.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  up.pop(); lo.pop(); return lo.concat(up);              // antihorario en (x, z)
}
function offsetPoly(poly, d) {
  const n = poly.length; return poly.map((p, i) => { const a = poly[(i + n - 1) % n], b = poly[(i + 1) % n]; const e1 = { x: p.x - a.x, z: p.z - a.z }, e2 = { x: b.x - p.x, z: b.z - p.z }; const n1 = { x: e1.z, z: -e1.x }, n2 = { x: e2.z, z: -e2.x }; const l1 = Math.hypot(n1.x, n1.z) || 1, l2 = Math.hypot(n2.x, n2.z) || 1; let nx = n1.x / l1 + n2.x / l2, nz = n1.z / l1 + n2.z / l2; const l = Math.hypot(nx, nz) || 1; return { x: p.x + nx / l * d, z: p.z + nz / l * d }; });
}
function smoothPoly(poly, n) { const c = new THREE.CatmullRomCurve3(poly.map(p => V3(p.x, 0, p.z)), true, 'centripetal'); return c.getSpacedPoints(n).slice(0, n).map(p => ({ x: p.x, z: p.z })); }

/* huella del pie (en reposo, mundo) a partir de los vértices del cuerpo dominados por el pie */
function footprint(c, side) {
  const BD = c.BD, g = 'foot' + side.toUpperCase(), pts = [];
  for (let i = 0; i < BD.n; i++) if (BD.dom[i] === g && BD.pos[i * 3 + 1] < .05) pts.push({ x: BD.pos[i * 3], z: BD.pos[i * 3 + 2] });
  return hull2(pts);
}

function solesGeo(poly, y0, h, bevel) {
  const sh = new THREE.Shape(); poly.forEach((p, i) => i ? sh.lineTo(p.x, -p.z) : sh.moveTo(p.x, -p.z)); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 1, steps: 1 });
  g.rotateX(-Math.PI / 2); g.translate(0, y0, 0); return g;
}

const cyl = (a, b, r, mat, seg = 6) => { const d = b.clone().sub(a), L = d.length(), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, seg, 1), mat); m.position.copy(a).addScaledVector(d, .5); m.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize()); m.castShadow = true; return m; };

function stitchTex(color = '#d8d2c6') { return canvasTex(64, 64, (g, W, H) => { g.fillStyle = color; g.fillRect(0, 0, W, H); }); }



/* recolorea las zonas rojas de la textura de la zapatilla real a azul royal (esquema negro + azul de la referencia) */
const _rc = new Map();
function recolorMap(tex, key, hueFn) {
  if (!tex || !tex.image) return tex; const k = key + (tex.uuid); if (_rc.has(k)) return _rc.get(k);
  const im = tex.image, w = im.width || im.videoWidth, h = im.height || im.videoHeight; if (!w) return tex;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'); g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, w, h), a = d.data;
  for (let i = 0; i < a.length; i += 4) { const r = a[i], gg = a[i + 1], b = a[i + 2]; if (r > 70 && r > gg * 1.5 && r > b * 1.5) { const v = r / 255; a[i] = 255 * v * .11; a[i + 1] = 255 * v * .36; a[i + 2] = 255 * Math.min(1, v * .85 + .1); } }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = tex.colorSpace; t.flipY = tex.flipY; t.wrapS = tex.wrapS; t.wrapT = tex.wrapT; t.anisotropy = 4; t.channel = tex.channel; _rc.set(k, t); return t;
}

/* ---------- ZAPATILLA REAL (modelo guardado de otro proyecto: assets/props/shoe.glb, 3 colores por KHR_materials_variants) ---------- */
let SHOE = null;
export async function preloadShoeModel(url = 'assets/props/shoe.glb') {
  if (SHOE) return SHOE;
  try {
    const g = await new GLTFLoader().loadAsync(url), meshes = []; g.scene.traverse(m => { if (m.isMesh) meshes.push(m); });
    const ext = (g.userData.gltfExtensions || {}).KHR_materials_variants, names = ext ? ext.variants.map(v => v.name) : [], variants = {};
    for (const v of names) variants[v] = await Promise.all(meshes.map(m => { const mv = (m.userData.gltfExtensions || {}).KHR_materials_variants, vi = names.indexOf(v), map = mv && mv.mappings.find(mp => mp.variants.includes(vi)); return map ? g.parser.getDependency('material', map.material) : m.material; }));
    // ¿hacia qué lado apunta la puntera? el talón es el extremo más alto (cuello + tirador)
    const geo = meshes[0].geometry, P = geo.attributes.position; let hp = 0, hn = 0, np = 0, nn = 0;
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i); if (x > .07) { hp += y; np++; } else if (x < -.07) { hn += y; nn++; } }
    g.userData.toeSign = (hp / Math.max(1, np)) < (hn / Math.max(1, nn)) ? 1 : -1;      // puntera = extremo más bajo
    g.userData.variants = variants; SHOE = g;
  } catch (e) { console.warn('[4B] sin modelo de zapatilla, se usa la procedural', e); }
  return SHOE;
}

function buildModelShoes(c, st) {
  const { R, human } = c, bones = human.bones, out = []; if (c.A) c.A.ankleH += (st.drop ?? .028);      // el pie va dentro del zapato: el tobillo sube lo que baja la suela
  for (const s of ['l', 'r']) {
    const poly = footprint(c, s); if (poly.length < 4) continue;
    const foot = R['foot_' + s];
    // eje del pie por análisis de componentes principales de la huella
    let mx = 0, mz = 0; for (const p of poly) { mx += p.x; mz += p.z; } mx /= poly.length; mz /= poly.length;
    let sxx = 0, szz = 0, sxz = 0; for (const p of poly) { const dx = p.x - mx, dz = p.z - mz; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; }
    const ang = .5 * Math.atan2(2 * sxz, szz - sxx);                                      // ángulo del eje largo respecto a +z
    const ux = Math.sin(ang), uz = Math.cos(ang); let lo = 1e9, hi = -1e9; for (const p of poly) { const t = (p.x - mx) * ux + (p.z - mz) * uz; lo = Math.min(lo, t); hi = Math.max(hi, t); }
    const dirSign = Math.cos(ang) >= 0 ? 1 : -1, yaw = ang + (dirSign < 0 ? Math.PI : 0), len = hi - lo, k = (len * (st.scale ?? 1.10)) / .298;
    const inst = SHOE.scene.clone(true), mats = SHOE.userData.variants[st.variant] || null;
    let mi = 0; inst.traverse(m => { if (m.isMesh) { if (mats) { m.material = mats[mi++ % mats.length]; if (st.recolor) { m.material = m.material.clone(); m.material.map = recolorMap(m.material.map, st.variant); } } m.castShadow = m.receiveShadow = true; m.frustumCulled = false; } });
    const g = new THREE.Group(), pivot = new THREE.Group(); pivot.add(inst); g.add(pivot);
    inst.rotation.y = SHOE.userData.toeSign > 0 ? -Math.PI / 2 : Math.PI / 2;               // puntera → +z
    if (s === 'r') inst.scale.z = -1;                                                       // el modelo es un solo pie: se refleja el otro
    pivot.scale.set(k * (st.wide ?? 1.12), k * (st.tall ?? 1.08), k); pivot.rotation.y = yaw;
    const cen = ((hi + lo) / 2) + (st.shift ?? -.004);                                       // centrado sobre la huella (un pelín hacia atrás: sobra puntera)
    g.position.set(mx + ux * cen, -(st.drop ?? .028), mz + uz * cen).sub(foot); bones['foot_' + s].add(g); out.push(g);      // la suela llega al suelo: el pie queda dentro, por encima de ella
  }
  return out;
}

/* st: { high, upper, overlay, accent, laces, tongue, mid, out, tex, ext, texSize, normal, chunky, strap } */
export function buildShoes(c, st) {
  if (st.model && SHOE) return buildModelShoes(c, st);
  const { F, R, human, BD } = c, out = [];
  const fab = (color, o = {}) => { const m = fabric(F, st.tex || 'brown_leather', { ext: st.ext || 'jpg', size: st.texSize || .12, normal: st.normal ?? .8, rough: st.rough ?? .7, color, sheen: 0, env: st.env ?? .5, ...o }); return m; };
  const std = (color, rough = .6, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, envMap: F.env, envMapIntensity: .4, side: THREE.DoubleSide, ...o });
  const upperM = fab(st.upper), overlayM = fab(st.overlay ?? st.upper), tongueM = fab(st.tongue ?? st.upper);
  const midM = std(st.mid ?? 0xf1efe8, .55, { side: THREE.FrontSide }), outM = std(st.out ?? 0x1a1a1a, .8, { side: THREE.FrontSide }), lacesM = std(st.laces ?? 0xf2f0ea, .8), accentM = std(st.accent ?? st.overlay ?? st.upper, .6);
  const PAD = st.pad ?? 0, t0 = st.high ? .865 : .955, sole = st.chunky ? .04 : .03;
  for (const s of ['l', 'r']) {
    const sx = s === 'l' ? 1 : -1, foot = R['foot_' + s], ball = R['ball_' + s], bones = human.bones;
    // ---- cascarón del empeine ----
    const upper = c.garment({ name: 'shoe_' + s, material: upperM, legs: { sides: [s], t0, nrmFrom: .985, nrmSpan: .035, infl: (t) => (st.high ? (t < 1 ? .012 : .011) : (t < 1 ? .009 : .010)) + PAD }, smooth: 2, uvScale: 1.5 });      // pad: zapatilla más gruesa y alisada (tapa la separación de los dedos)
    out.push(upper);
    // ---- suela sobre la huella real ----
    let poly = footprint(c, s);
    const outline = smoothPoly(offsetPoly(poly, .014 + PAD * .8), 64), inner = smoothPoly(offsetPoly(poly, .010 + PAD * .8), 64);
    const outsole = new THREE.Mesh(solesGeo(outline, -sole, sole * .38, .0022), [outM, outM]);
    const midsole = new THREE.Mesh(solesGeo(inner, -sole * .62, sole * .62, .003), [midM, midM]);
    for (const m of [outsole, midsole]) { m.castShadow = m.receiveShadow = true; m.position.set(-foot.x, -foot.y, -foot.z); bones['foot_' + s].add(m); }
    // ---- refuerzos con relieve ----
    const bz = ball.z, az = foot.z, fx = foot.x, lat = (x) => (x - fx) * sx;
    c.sub(upper, { name: 'toe_' + s, material: overlayM, uvScale: 1.5, pick: (x, y, z) => z > bz + .035 && y < .065, lift: (x, y, z) => .0035 * clamp((z - bz - .03) / .02, 0, 1) + .0008 });
    c.sub(upper, { name: 'heel_' + s, material: overlayM, uvScale: 1.5, pick: (x, y, z) => z < az - .025 && y < (st.high ? .16 : .11) && y > .02, lift: (x, y, z) => .0035 * clamp((az - .025 - z) / .02, 0, 1) + .0008 });
    c.sub(upper, { name: 'band_' + s, material: accentM, uvScale: 1.5, pick: (x, y, z) => lat(x) > .012 && z > az - .03 && z < bz - .015 && y > .028 + (bz - z) * .12 && y < .066 + (bz - z) * .18 + (st.high ? .035 : 0), lift: () => .0028 });
    c.sub(upper, { name: 'bandi_' + s, material: accentM, uvScale: 1.5, pick: (x, y, z) => lat(x) < -.012 && z > az - .03 && z < bz - .015 && y > .028 + (bz - z) * .12 && y < .066 + (bz - z) * .18 + (st.high ? .035 : 0), lift: () => .0028 });
    // ---- cuello acolchado (aro en el borde del tobillo) ----
    const ring = upper.edge.filter(e => e.info.part === 'leg' && e.info.side === s).map(e => e.p);
    if (ring.length > 8 && !st.covered) {
      const cx = ring.reduce((a, p) => a + p.x, 0) / ring.length, cz = ring.reduce((a, p) => a + p.z, 0) / ring.length; ring.sort((a, b) => Math.atan2(a.x - cx, a.z - cz) - Math.atan2(b.x - cx, b.z - cz));
      const curve = new THREE.CatmullRomCurve3(ring, true, 'centripetal'); const tg = new THREE.TubeGeometry(curve, 48, st.high ? .0125 : .011, 8, true);
      const tm = new THREE.Mesh(tg, overlayM.clone()); tm.castShadow = tm.receiveShadow = true; tm.position.set(-R['calf_' + s].x, -R['calf_' + s].y, -R['calf_' + s].z); bones['calf_' + s].add(tm);
      // lengüeta que asoma por delante del cuello
      const topY = Math.max(...ring.map(p => p.y)), frontZ = Math.max(...ring.map(p => p.z));
      const tg2 = c.box(.052, st.high ? .07 : .05, .016, .008, tongueM); c.attach('calf_' + s, tg2, V3(cx, topY - .005 + .016, frontZ + .002), [-.28, 0, 0]);
      // aro de tela interior visible (forro): un anillo más oscuro dentro
      const lin = new THREE.Mesh(new THREE.TorusGeometry(.036, .006, 6, 20), std(0x18181a, .95)); lin.rotation.x = Math.PI / 2; c.attach('calf_' + s, lin, V3(cx, topY - .006, cz - .002));
    }
    // ---- cordones: ojales + cruces sobre el empeine y el frente del tobillo ----
    const topOf = (x, z) => { let best = -1, P = upper.geo.attributes.position.array; for (let i = 0; i < P.length; i += 3) if (Math.hypot(P[i] - x, P[i + 2] - z) < .014 && P[i + 1] > best) best = P[i + 1]; return best; };
    const frontOf = (x, y) => c.surfZ(upper, x, y, false, .016);
    const path = [];                                             // puntos del centro del pie: empeine → frente del tobillo
    const zA = az + .045, zB = bz - .01, nA = 4;
    for (let i = 0; i <= nA; i++) { const z = zB + (zA - zB) * (i / nA), y = topOf(fx, z); if (y > 0) path.push({ z, y: y + .004, mode: 'top' }); }
    if (st.high && !st.covered) { const yA = path.length ? path[path.length - 1].y : .12; for (let i = 1; i <= 3; i++) { const y = yA + i * .026; const z = frontOf(fx, y); if (z !== null) path.push({ z: z + .004, y, mode: 'front' }); } }
    const eyes = st.covered ? [] : path.map(p => { const w = .019; const at = (x) => p.mode === 'top' ? V3(x, topOf(x, p.z) + .003, p.z) : V3(x, p.y, (frontOf(x, p.y) ?? p.z) + .003); return { mode: p.mode, a: at(fx - sx * w), b: at(fx + sx * w) }; });
    const add = (mesh, bone) => { mesh.castShadow = true; mesh.position.sub(R[bone]); bones[bone].add(mesh); return mesh; };
    const bn = (mode) => mode === 'front' ? 'calf_' + s : 'foot_' + s;
    const eyeletM = std(st.eyelet ?? 0xb9b6ae, .3, { metalness: .8 });
    for (const e of eyes) for (const pt of [e.a, e.b]) { const rm = new THREE.Mesh(new THREE.TorusGeometry(.0042, .0013, 5, 10), eyeletM); rm.position.copy(pt); if (e.mode === 'top') rm.rotation.x = -Math.PI / 2 + .3; add(rm, bn(e.mode)); }
    const lc = (a, b) => { const mid = a.clone().add(b).multiplyScalar(.5).add(V3(0, .0035, .003)); return new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 6, .0026, 5); };
    for (let i = 0; i < eyes.length - 1; i++) { const m = eyes[i + 1].mode; for (const [pa, pb] of [[eyes[i].a, eyes[i + 1].b], [eyes[i].b, eyes[i + 1].a]]) { const mk = new THREE.Mesh(lc(pa, pb), lacesM); add(mk, bn(m)); } }
    if (eyes.length) {                                           // lazada
      const e = eyes[eyes.length - 1], top = e.a.clone().add(e.b).multiplyScalar(.5).add(V3(0, .006, .004)), bone = bn(e.mode);
      for (const k of [-1, 1]) { const lp = new THREE.Mesh(new THREE.TorusGeometry(.017, .0026, 5, 14, Math.PI * 1.7), lacesM); lp.scale.set(1, .7, 1); lp.position.copy(top).add(V3(k * .017, 0, 0)); lp.rotation.set(.5, 0, k * 1.1); add(lp, bone); }
      for (const k of [-1, 1]) add(cyl(top, top.clone().add(V3(k * .028, -.002, .03)), .0024, lacesM), bone);
    }
  }
  return out;
}
