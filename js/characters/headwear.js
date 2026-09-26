/* =========================================================
   GORRAS Y GORRO — medidos sobre la cabeza real (human.H, espacio del hueso 'head')
     · copa de 6 paneles (elipsoide con costuras y pespuntes en textura + normal de tejido), botón, ojales, cierre trasero
     · visera curvada con grosor, borde y sombra propia
     · logo bordado como calcomanía sobre parche esférico (letra S, H, espinas) con relieve (bumpMap)
     · gorro de punto con canalé y puño doblado
   ========================================================= */
import * as THREE from 'three';
import { canvasTex, seed } from '../world/materials.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/* textura de copa: color base + costuras verticales entre paneles + pespunte doble + grano de tela */
function crownTex(color, seam, panels = 6, o = {}) {
  return canvasTex(1024, 512, (g, W, H) => {
    g.fillStyle = color; g.fillRect(0, 0, W, H);
    const r = seed(o.seed || 5); for (let i = 0; i < 26000; i++) { g.fillStyle = `rgba(${r() < .5 ? '255,255,255' : '0,0,0'},${r() * .035})`; g.fillRect(r() * W, r() * H, 1, 1 + r() * 2); }
    for (let k = 0; k < panels; k++) {
      const x = k * W / panels;
      g.fillStyle = 'rgba(0,0,0,.42)'; g.fillRect(x - 2, 0, 4, H);
      g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(x + 2, 0, 3, H); g.fillRect(x - 5, 0, 3, H);
      g.strokeStyle = seam; g.lineWidth = 1.3; g.setLineDash([7, 5]);
      for (const dx of [-9, 9]) { g.beginPath(); g.moveTo(x + dx, 0); g.lineTo(x + dx, H); g.stroke(); }
      g.setLineDash([]);
    }
    if (o.rim) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, H - 26, W, 3); g.strokeStyle = seam; g.setLineDash([7, 5]); for (const dy of [-10, -20]) { g.beginPath(); g.moveTo(0, H + dy); g.lineTo(W, H + dy); g.stroke(); } g.setLineDash([]); }
  }, { repeat: true });
}

/* bordado: dibuja el logo sobre lienzo transparente; devuelve {map, bump} */
function embroidery(kind, col, dark) {
  const W = 256, H = 192, draw = (g, fill, stroke) => {
    g.clearRect(0, 0, W, H); g.lineJoin = 'round'; g.lineCap = 'round';
    if (kind === 'S' || kind === 'H') {
      g.font = '900 150px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 12; g.strokeStyle = stroke; g.strokeText(kind, W / 2, H / 2 + 6); g.fillStyle = fill; g.fillText(kind, W / 2, H / 2 + 6);
    } else {                                            // espinas: rama con pinchos
      g.strokeStyle = fill; g.fillStyle = fill; g.lineWidth = 9;
      const vine = (y0, s) => { g.beginPath(); g.moveTo(10, y0); for (let x = 10; x <= W - 10; x += 8) g.lineTo(x, y0 + Math.sin(x / 18 * s) * 16); g.stroke(); for (let x = 22; x < W - 14; x += 24) { const y = y0 + Math.sin(x / 18 * s) * 16, d = Math.cos(x / 18 * s) > 0 ? -1 : 1; g.beginPath(); g.moveTo(x - 5, y); g.lineTo(x + 3, y + d * 30); g.lineTo(x + 8, y); g.fill(); } };
      vine(H * .42, 1); vine(H * .68, 1.15);
      g.lineWidth = 3; g.strokeStyle = stroke; g.stroke();
    }
  };
  const map = canvasTex(W, H, (g) => {
    draw(g, col, dark);
    // hilos: líneas diagonales que aclaran/oscurecen dentro de la forma
    g.globalCompositeOperation = 'source-atop'; for (let i = -H; i < W; i += 3) { g.strokeStyle = i % 6 ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.18)'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + H, H); g.stroke(); } g.globalCompositeOperation = 'source-over';
  });
  const bump = canvasTex(W, H, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H); draw(g, '#fff', '#888');
    g.globalCompositeOperation = 'source-atop'; for (let i = -H; i < W; i += 3) { g.strokeStyle = i % 6 ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.35)'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + H, H); g.stroke(); } g.globalCompositeOperation = 'source-over';
  }, { linear: true });
  return { map, bump };
}

function domeGeo(rx, ry, rz, slopeBack, tilt = 0, seg = [64, 24]) {
  const g = new THREE.SphereGeometry(1, seg[0], seg[1], 0, Math.PI * 2, 0, Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const rim = 1 - clamp(y / .28, 0, 1);                                       // 1 en el borde, 0 arriba
    const back = clamp(-z * .9 + .1, 0, 1);
    y = y * ry - slopeBack * rim * back - tilt * z * rim;                       // el borde baja por detrás
    p.setXYZ(i, x * rx, y, z * rz);
  }
  g.computeVertexNormals(); return g;
}

function brimGeo(rx, rz, ext, yb, droop, span = 1.38, thick = .0038) {
  const nA = 48, nR = 8, pos = [], uv = [], idx = [];
  const P = (a, r, top) => {
    const e = ext * (1 - Math.pow(Math.abs(a) / span, 2.6)) + .012, bx = rx * Math.sin(a), bz = rz * Math.cos(a), nx = Math.sin(a) / rx, nz = Math.cos(a) / rz, nl = Math.hypot(nx, nz);
    const d = r * e; const x = bx + nx / nl * d, z = bz + nz / nl * d;
    const y = yb - .004 - d * droop - Math.pow(Math.sin(a), 2) * .016 * r + (top ? thick : 0);
    return [x, y, z];
  };
  for (const top of [true, false]) for (let i = 0; i <= nA; i++) for (let j = 0; j <= nR; j++) { const a = (i / nA * 2 - 1) * span, r = j / nR; pos.push(...P(a, r, top)); uv.push(i / nA, r); }
  const row = nR + 1, off = (nA + 1) * row;
  for (const base of [0, off]) for (let i = 0; i < nA; i++) for (let j = 0; j < nR; j++) { const a = base + i * row + j, b = a + row, c = a + 1, d = b + 1; if (base === 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, c, b, d); }
  for (let i = 0; i < nA; i++) { const a = i * row + nR, b = a + row, c = a + off, d = b + off; idx.push(a, b, c, c, b, d); }     // canto
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

/* o: { color, seam, logo:'S'|'H'|'thorns', logoCol, logoDark, tex (nombre normal), flat } */
/* volumen del pelo (espacio de cabeza) por encima de la altura y0: {ymax, hx, zmin, zmax} */
function hairBounds(human, y0) {
  const hair = human.meshes.hair, hb = human.b.head; if (!hair) return null;
  const P = hair.geometry.attributes.position, v = V3(), o = human.rest.head;                      // geometría en espacio de reposo; huesos sin rotación en reposo
  let ymax = -1e9, hx = 0, zmin = 1e9, zmax = -1e9;
  for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).sub(o); if (v.y < y0) continue; ymax = Math.max(ymax, v.y); hx = Math.max(hx, Math.abs(v.x)); zmin = Math.min(zmin, v.z); zmax = Math.max(zmax, v.z); }
  return ymax > -1e8 ? { ymax, hx, zmin, zmax } : null;
}

/* cráneo real: vértices del cuerpo dominados por el hueso de la cabeza por encima de y0 (espacio de cabeza, en reposo) */
function skullBounds(human, y0) {
  const body = human.meshes.body, g = body.geometry, P = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, hi = body.skeleton.bones.indexOf(human.b.head), o = human.rest.head, v = V3();
  let ymax = -1e9, hx = 0, zmin = 1e9, zmax = -1e9;
  for (let i = 0; i < P.count; i++) { let w = 0; for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === hi) w += sw.getComponent(i, k); if (w < .5) continue; v.fromBufferAttribute(P, i).sub(o); if (v.y < y0) continue; ymax = Math.max(ymax, v.y); hx = Math.max(hx, Math.abs(v.x)); zmin = Math.min(zmin, v.z); zmax = Math.max(zmax, v.z); }
  return { ymax, hx, zmin, zmax };
}

/* mete en el elipsoide (0,yb,cz; rx,ry,rz) los vértices del pelo que lo sobresalgan por encima del borde (el pelo real bajo una gorra queda aplastado) */
function compressHair(human, yb, cz, rx, ry, rz) {
  const hair = human.meshes.hair; if (!hair || hair.userData.compressed === 'cap') return; const P = hair.geometry.attributes.position, o = human.rest.head, v = V3();
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i).sub(o); if (v.y < yb - .012) continue;
    const dy = Math.max(v.y - yb, 0), e = (v.x / rx) ** 2 + (dy / ry) ** 2 + ((v.z - cz) / rz) ** 2;
    if (e > 1) { const k = 1 / Math.sqrt(e); v.x *= k; v.z = cz + (v.z - cz) * k; v.y = yb + dy * k; P.setXYZ(i, v.x + o.x, v.y + o.y, v.z + o.z); }
  }
  P.needsUpdate = true; hair.geometry.computeVertexNormals(); hair.userData.compressed = 'cap';
}

export function buildCap(c, o) {
  const { F, human } = c, H = human.H, hb = human.bones.head;
  const yb = H.ey + .030, sk = skullBounds(human, yb - .01);
  // gorra ceñida: elipsoide justo por fuera del cráneo real (+8 mm); el pelo que sobresalga se aplasta dentro
  const m = .008, rx = sk.hx + m, ry = sk.ymax + m - yb, cz = (sk.zmin + sk.zmax) / 2 + .004, rz = (sk.zmax - sk.zmin) / 2 + m + .010;
  compressHair(human, yb, cz, rx - .003, ry - .003, rz - .003);
  const norm = F.tex('cotton_jersey_nor_gl.jpg', { srgb: false, size: .03 });
  const crownM = new THREE.MeshStandardMaterial({ map: crownTex(o.color, o.seam || '#8a8a90', 6, { seed: o.seed }), normalMap: norm, normalScale: new THREE.Vector2(.6, .6), roughness: .92, envMap: F.env, envMapIntensity: .25, side: THREE.DoubleSide });
  const group = new THREE.Group(); group.name = 'cap';
  const crown = new THREE.Mesh(domeGeo(rx, ry, rz, .022, .008), crownM); crown.position.set(0, yb, cz); crown.rotation.y = 0; crown.castShadow = crown.receiveShadow = true; group.add(crown);
  // banda interior (forro) para que no se vea el pelo por el borde
  const lin = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, .016, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 1, side: THREE.DoubleSide })); lin.scale.set(rx * .985, 1, rz * .985); lin.position.set(0, yb - .006, cz); group.add(lin);
  // visera
  const brimM = new THREE.MeshStandardMaterial({ color: o.brim ?? o.color, roughness: .55, normalMap: norm, normalScale: new THREE.Vector2(.3, .3), envMap: F.env, envMapIntensity: .3, side: THREE.DoubleSide });
  const brim = new THREE.Mesh(brimGeo(rx * .96, rz * .96, o.flat ? .056 : .056, yb, o.flat ? .16 : .2, 1.0), brimM); brim.position.set(0, 0, cz); brim.castShadow = brim.receiveShadow = true; group.add(brim);
  const under = new THREE.Mesh(brimGeo(rx * .96, rz * .96, o.flat ? .056 : .056, yb - .0006, o.flat ? .16 : .2, 1.0, .0), new THREE.MeshStandardMaterial({ color: o.under ?? 0x2b2b2e, roughness: .9, side: THREE.BackSide })); under.position.copy(brim.position); group.add(under);
  // botón + ojales
  const btn = new THREE.Mesh(new THREE.SphereGeometry(.0085, 12, 8), crownM.clone()); btn.material.map = null; btn.material.color.set(o.color); btn.scale.set(1, .6, 1); btn.position.set(0, yb + ry - .002, cz); group.add(btn);
  const eyeM = new THREE.MeshStandardMaterial({ color: o.eyelet ?? 0x1b1b1d, roughness: .4, metalness: .5 });
  for (let k = 0; k < 6; k++) { const a = (k + .5) / 6 * Math.PI * 2, u = .74; const e = new THREE.Mesh(new THREE.SphereGeometry(.0034, 8, 6), eyeM); e.scale.set(1, 1, .5); const s = Math.sin(Math.PI / 2 * u); e.position.set(Math.sin(a) * rx * .5 * (1 + 0), yb + ry * .86, cz + Math.cos(a) * rz * .5); e.position.set(Math.sin(a) * rx * Math.sin(1.1) * .995, yb + ry * Math.cos(1.1) * .995, cz + Math.cos(a) * rz * Math.sin(1.1) * .995); e.lookAt(e.position.clone().multiplyScalar(2)); group.add(e); }
  // cierre trasero (snapback)
  const strap = new THREE.Mesh(new THREE.BoxGeometry(.05, .03, .006), new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: .5 })); strap.position.set(0, yb + .002, cz - rz * .985); group.add(strap);
  // logo bordado
  if (o.logo) {
    const em = embroidery(o.logo, o.logoCol || '#f2f2ee', o.logoDark || '#111');
    const lm = new THREE.MeshStandardMaterial({ map: em.map, bumpMap: em.bump, bumpScale: 1.6, transparent: true, alphaTest: .35, roughness: .85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, envMap: F.env, envMapIntensity: .08, color: 0xcfcfcf });
    const sh = o.logoSize || 1;
    const patch = new THREE.SphereGeometry(1, 28, 16, Math.PI / 2 - .3 * sh, .6 * sh, .92, .42 * sh); const pp = patch.attributes.position;
    for (let i = 0; i < pp.count; i++) { let x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i); const rim = 1 - clamp(y / .28, 0, 1), back = clamp(-z * .9 + .1, 0, 1); y = y * ry - .02 * rim * back - .06 * z * rim; pp.setXYZ(i, x * (rx + .0012), y + .0002, z * (rz + .0012)); }
    patch.computeVertexNormals(); const lg = new THREE.Mesh(patch, lm); lg.position.set(0, yb, cz); lg.renderOrder = 2; group.add(lg);
  }
  group.rotation.x = -.05;                                            // la gorra va algo echada hacia atrás: se ven los ojos
  hb.add(group); group.position.set(0, .004, -.004); c.headwear = group; return group;
}

/* gorro de punto con puño doblado */
export function buildBeanie(c, o) {
  const { F, human } = c, H = human.H, hb = human.bones.head;
  const yb = H.ey + .034, hairB = hairBounds(human, yb);
  let cz = H.cz - .004, rx = Math.min(H.hw * .9, .08) + .012, rz = H.hd + .012, ry = (H.cy + H.hh + .028) - yb;
  if (hairB) { rx = Math.min(Math.max(rx, hairB.hx + .008), .11); ry = Math.max(ry, hairB.ymax + .010 - yb); const zc = (hairB.zmin + hairB.zmax) / 2, zr = (hairB.zmax - hairB.zmin) / 2 + .010; if (zr > rz) { rz = zr; cz = zc; } }
  const knit = canvasTex(256, 256, (g, W, H2) => {
    g.fillStyle = o.color; g.fillRect(0, 0, W, H2);
    for (let x = 0; x < W; x += 8) { const gr = g.createLinearGradient(x, 0, x + 8, 0); gr.addColorStop(0, 'rgba(0,0,0,.35)'); gr.addColorStop(.5, 'rgba(255,255,255,.10)'); gr.addColorStop(1, 'rgba(0,0,0,.35)'); g.fillStyle = gr; g.fillRect(x, 0, 8, H2); }
    const r = seed(9); for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(${r() < .5 ? '255,255,255' : '0,0,0'},${r() * .05})`; g.fillRect(r() * W, r() * H2, 1, 3); }
  }, { repeat: true }); knit.repeat.set(6, 1);
  const m = new THREE.MeshStandardMaterial({ map: knit, roughness: 1, normalMap: F.tex('cotton_jersey_nor_gl.jpg', { srgb: false, size: .015 }), normalScale: new THREE.Vector2(.9, .9), envMap: F.env, envMapIntensity: .15, side: THREE.DoubleSide });
  const group = new THREE.Group(); group.name = 'beanie';
  const dg = domeGeo(rx + .004, ry * 1.12, rz + .003, .035, .0);
  { const P = dg.attributes.position, ryy = ry * 1.12;                        // gorro de punto: la corona se hunde hacia atrás (caída), se ensancha un poco y tiene arrugas suaves
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), h = clamp(y / ryy, 0, 1), sl = h * h, a = Math.atan2(x, z);
      const wr = .0016 * h * (Math.sin(a * 6 + h * 4) + .6 * Math.sin(a * 11 - h * 7));
      P.setXYZ(i, x * (1 + .05 * Math.sin(Math.PI * Math.min(1, h * 1.15))) + wr, y * (1 - .05 * sl), z - .03 * sl * (1 - .6 * Math.tanh(z / .05)) + wr * .5); }
    dg.computeVertexNormals(); }
  m.color.multiplyScalar(.55);
  const dome = new THREE.Mesh(dg, m); dome.position.set(0, yb, cz); dome.castShadow = dome.receiveShadow = true; group.add(dome);
  // puño: aro grueso siguiendo el borde (algo más bajo por detrás)
  const pts = []; for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2, back = clamp(-Math.cos(a) * .9 + .1, 0, 1); pts.push(V3(Math.sin(a) * (rx + .002), yb - .01 - .03 * back, cz + Math.cos(a) * (rz + .002))); }
  const cuffT = knit.clone(); cuffT.needsUpdate = true; cuffT.repeat.set(1, 6); cuffT.rotation = Math.PI / 2;
  const cuff = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 72, .018, 12, true), m.clone()); cuff.material.map = cuffT; cuff.scale.set(1, 1.05, 1); cuff.castShadow = cuff.receiveShadow = true; group.add(cuff);
  hb.add(group); c.headwear = group; return group;
}
