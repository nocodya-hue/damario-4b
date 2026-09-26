/* =========================================================
   DECORACIÓN — alfombra, plantas vivas, pósters, reloj, mural, estantes, cortinas
   Todo lo que se mueve (plantas, cortinas) lo hace en el vertex shader: 0 coste de CPU.
   ========================================================= */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, rbox, cyl, sph, group, contact } from './geo.js';
import { canvasTex, seed } from './materials.js';
import { L } from './layout.js';
import { ROOM } from './room.js';

export const WIND = { value: 0 };   // uniform compartido: tiempo del viento

/* ---------- alfombra: bandas + tablero, como la referencia ---------- */
export function buildRug(M) {
  const { x, z, w, d } = L.rug;
  const g = group('rug', x, 0, z);
  const tex = canvasTex(1024, 744, (c, W, H) => {
    c.fillStyle = '#efe7d6'; c.fillRect(0, 0, W, H);
    // bandas (mitad norte)
    c.fillStyle = '#131010'; const bh = H * .5; let y = 0, i = 0; while (y < bh) { const t = 22 + (i % 3) * 14; if (i % 2 === 0) c.fillRect(0, y, W, t); y += t; i++; }
    // tablero (mitad sur)
    const n = 10, sx = W / n, sy = (H - bh) / 4;
    for (let a = 0; a < n; a++) for (let b = 0; b < 4; b++) if ((a + b) % 2 === 0) { c.fillStyle = '#131010'; c.fillRect(a * sx, bh + b * sy, sx, sy); }
    // fibra de lana
    const r = seed(5); for (let k = 0; k < 9000; k++) { c.fillStyle = `rgba(${r() < .5 ? '0,0,0' : '255,255,255'},${.03 + r() * .05})`; c.fillRect(r() * W, r() * H, 2 + r() * 5, 1); }
  }, { repeat: false, aniso: 8 });
  const wool = M.sofaFabric.normalMap.clone(); wool.repeat.set(w / .55, d / .55); wool.wrapS = wool.wrapT = THREE.RepeatWrapping; wool.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, normalMap: wool, normalScale: new THREE.Vector2(.55, .55), envMapIntensity: .3, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const top = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); top.rotation.x = -Math.PI / 2; top.position.y = .0185; top.receiveShadow = true; top.userData.noMerge = true; g.add(top);
  const edge = box(w + .01, .0155, d + .01, M.rubber, { parent: g, y: .00775, cast: false });   // su cara superior queda 3 mm por debajo del tapiz (antes coplanar → parpadeo)
  return g;
}

/* ---------- plantas (mallas fusionadas + viento en el shader) ---------- */
function leafTex(kind) {
  return canvasTex(256, 256, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#245a2a'; g.fillRect(0, 0, 12, 12);                              // parche opaco para los peciolos
    g.save(); g.translate(W * .5, H * .98);
    const shape = kind === 'monstera'
      ? (c) => { c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(-W * .62, -H * .08, -W * .56, -H * .7, 0, -H * .95); c.bezierCurveTo(W * .56, -H * .7, W * .62, -H * .08, 0, 0); }
      : (c) => { c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(-W * .32, -H * .1, -W * .3, -H * .8, 0, -H * .96); c.bezierCurveTo(W * .3, -H * .8, W * .32, -H * .1, 0, 0); };
    shape(g); const gr = g.createLinearGradient(0, 0, 0, -H); gr.addColorStop(0, kind === 'monstera' ? '#22602d' : '#3b1a1c'); gr.addColorStop(1, kind === 'monstera' ? '#3f9a4c' : '#2a6a38'); g.fillStyle = gr; g.fill();
    g.strokeStyle = 'rgba(210,240,190,.55)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -H * .93); g.stroke();
    g.lineWidth = 1.2; g.strokeStyle = 'rgba(200,235,180,.35)';
    for (let i = 1; i < 9; i++) { const y = -H * i * .1; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(0, y); g.quadraticCurveTo(s * W * .18, y - H * .05, s * W * .42 * Math.sin(Math.PI * i / 10 + .3), y - H * .12); g.stroke(); } }
    if (kind === 'monstera') {                                                      // fenestraciones: cortes desde el borde
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
      for (let i = 1; i < 8; i++) for (const s of [-1, 1]) { const y = -H * (.12 + i * .1); g.beginPath(); g.moveTo(s * W * .5, y - 5); g.lineTo(s * W * .12, y - H * .045); g.lineTo(s * W * .5, y + 9); g.closePath(); g.fill(); }
      for (const s of [-1, 1]) for (let i = 1; i < 4; i++) { g.beginPath(); g.ellipse(s * W * .2, -H * (.22 + i * .17), 5, 9, s * .5, 0, 7); g.fill(); }
    }
    g.restore();
  }, { aniso: 4 });
}

function swayMat(tex, tint) {
  const m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: .5, side: THREE.DoubleSide, roughness: .5, color: tint, envMapIntensity: .6, emissive: 0x0c3a14, emissiveIntensity: .5 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = WIND;
    sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float hgt=max(transformed.y-.25,0.);
      float ph=transformed.x*2.3+transformed.z*1.7;
      transformed.x+=sin(uWind*1.1+ph)*.018*hgt*hgt + sin(uWind*2.7+ph*2.)*.006*hgt;
      transformed.z+=cos(uWind*.9+ph*1.3)*.014*hgt*hgt;
      transformed.y-=abs(sin(uWind*1.1+ph))*.004*hgt;`);
  };
  return m;
}

export function buildPlant(M, { x, z, kind = 'monstera', count = 12, scale = 1, potR = .27, seedN = 3, mergeDetail = 1 }) {
  const g = group('plant_' + kind, x, 0, z), r = seed(seedN);
  const pot = cyl(potR, potR * .78, potR * 1.5, M.potWhite, { parent: g, y: potR * .75, seg: 28 });
  cyl(potR * 1.04, potR * 1.04, .05, M.potWhite, { parent: g, y: potR * 1.5, seg: 28 });
  cyl(potR * .95, potR * .95, .02, M.soil, { parent: g, y: potR * 1.5 + .02, seg: 24, cast: false });
  const tex = leafTex(kind), mat = swayMat(tex, kind === 'monstera' ? 0xffffff : 0xffffff);
  const geos = [];
  const Lw = kind === 'monstera' ? .48 : .28, Lh = kind === 'monstera' ? .46 : .44;
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, out = .12 + r() * .42 * scale, up = (.3 + r() * .5) * scale + potR + .2;
    const base = new THREE.Vector3(Math.cos(a) * .05, potR * 1.5, Math.sin(a) * .05);
    const tip = new THREE.Vector3(Math.cos(a) * out, up, Math.sin(a) * out);
    const mid = new THREE.Vector3(Math.cos(a) * out * .35, up * .65, Math.sin(a) * out * .35);
    const curve = new THREE.CatmullRomCurve3([base, mid, tip]);
    const stem = new THREE.TubeGeometry(curve, 8, .0115 * scale, 6); const suv = stem.attributes.uv; for (let k = 0; k < suv.count; k++) suv.setXY(k, .02, .02); geos.push(stem);
    // hoja
    const s = (.7 + r() * .55) * scale, seg = 6;
    const lg = new THREE.PlaneGeometry(Lw * s, Lh * s, seg, seg); lg.translate(0, Lh * s / 2, 0);
    const p = lg.attributes.position; for (let k = 0; k < p.count; k++) { const yy = p.getY(k) / (Lh * s), xx = p.getX(k) / (Lw * s); p.setZ(k, -yy * yy * .18 * s + Math.abs(xx) * Math.abs(xx) * .2 * s); }
    lg.computeVertexNormals();
    const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-(.35 + r() * .6) - .2, -a + Math.PI / 2, (r() - .5) * .5, 'YXZ'));
    // orienta la hoja hacia fuera del tallo y algo hacia arriba
    const eu = new THREE.Euler(0, 0, 0, 'YXZ'); eu.y = -Math.PI / 2 - a + (r() - .5) * .45; eu.x = -(.85 + r() * .5); q.setFromEuler(eu);
    m4.compose(tip, q, new THREE.Vector3(1, 1, 1)); lg.applyMatrix4(m4); geos.push(lg);
  }
  const merged = mergeGeometries(geos.map(gg => { gg.deleteAttribute('normal'); return gg.toNonIndexed ? gg.toNonIndexed() : gg; }));
  merged.computeVertexNormals();
  const plant = new THREE.Mesh(merged, mat); plant.castShadow = true; plant.receiveShadow = true; plant.userData.noMerge = true; g.add(plant);
  contact(potR * 3, potR * 3, .5, { parent: g });
  return g;
}

/* ---------- pósters originales generados a mano en canvas ---------- */
const PAL = ['#ff4a2b', '#ff8a3d', '#2f9e5f', '#ff7ab0', '#efe4d0', '#141010', '#c92f1d', '#f3c15a'];
function posterTex(i, w, h) {
  const r = seed(100 + i * 17);
  return canvasTex(256, Math.round(256 * h / w), (g, W, H) => {
    const bg = ['#efe4d0', '#ff7ab0', '#2f9e5f', '#ff8a3d', '#efe4d0', '#141010'][i % 6]; g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const cols = PAL.filter(c => c !== bg);
    const style = i % 4;
    if (style === 0) { for (let k = 0; k < 4; k++) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.beginPath(); g.arc(W * (.25 + r() * .5), H * (.2 + r() * .45), W * (.12 + r() * .22), 0, 7); g.fill(); } g.fillStyle = '#141010'; g.beginPath(); g.moveTo(0, H * .7); g.bezierCurveTo(W * .3, H * .45, W * .6, H * .95, W, H * .6); g.lineTo(W, H * .75); g.lineTo(0, H * .85); g.fill(); }
    else if (style === 1) { for (let k = 0; k < 6; k++) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(r() * W * .6, r() * H * .6, W * (.2 + r() * .35), H * (.08 + r() * .25)); } g.strokeStyle = '#141010'; g.lineWidth = 6; g.beginPath(); g.arc(W * .5, H * .4, W * .28, .3, 4.7); g.stroke(); }
    else if (style === 2) { g.fillStyle = cols[1]; g.beginPath(); g.moveTo(W * .1, H * .8); g.bezierCurveTo(W * .1, H * .1, W * .9, H * .1, W * .9, H * .8); g.fill(); g.fillStyle = cols[3]; g.beginPath(); g.arc(W * .5, H * .42, W * .16, 0, 7); g.fill(); g.fillStyle = '#141010'; for (let k = 0; k < 5; k++) g.fillRect(W * .12, H * (.62 + k * .05), W * .76, 3); }
    else { for (let k = 0; k < 9; k++) { g.fillStyle = cols[k % cols.length]; g.fillRect(0, k * H * .09, W, H * .05); } g.fillStyle = '#efe4d0'; g.beginPath(); g.arc(W * .5, H * .4, W * .22, 0, 7); g.fill(); g.fillStyle = '#141010'; g.beginPath(); g.arc(W * .5, H * .4, W * .12, 0, 7); g.fill(); }
    const titles = ['NOCHE 87', 'SALA 04', 'BEAT TAPE', 'ELECTRO', 'MOVIE NIGHT', 'LOOP', 'CITY POP', 'RADIO', 'VHS CLUB', 'NEON', 'B-SIDE', 'PLAY'];
    g.fillStyle = bg === '#141010' ? '#efe4d0' : '#141010'; g.font = `800 ${Math.round(W * .13)}px 'Bricolage Grotesque',Arial,sans-serif`; g.textAlign = 'center'; g.fillText(titles[i % titles.length], W / 2, H - H * .07);
    g.font = `500 ${Math.round(W * .05)}px 'DM Mono',monospace`; g.fillText('— 4B ARCHIVE —', W / 2, H - H * .015);
  }, { aniso: 4 });
}

export function buildGallery(M) {
  const g = group('gallery');
  const z = ROOM.z0 + .02;
  const items = [
    [.45, 2.82, .42, .56], [1.0, 2.72, .3, .4], [1.5, 2.86, .34, .44],
    [2.1, 2.5, .5, .68], [2.72, 2.78, .44, .58], [3.1, 2.36, .34, .46],
    [2.15, 1.7, .36, .48], [2.68, 1.6, .4, .54], [3.1, 1.5, .3, .4],
  ];
  items.forEach(([x, y, w, h], i) => {
    const p = group('poster' + i, x, y, z + .012, (i % 3 - 1) * .006, g);
    p.rotation.z = (i % 4 - 1.5) * .006;
    box(w + .04, h + .04, .03, M.blackPlastic, { parent: p });
    const art = new THREE.Mesh(new THREE.PlaneGeometry(w - .02, h - .02), new THREE.MeshStandardMaterial({ map: posterTex(i, w, h), roughness: .8, envMapIntensity: .3 }));
    art.position.z = .0155; art.receiveShadow = true; p.add(art);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w - .02, h - .02), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: .06, roughness: .02, envMapIntensity: 1.5, depthWrite: false }));
    glass.position.z = .017; glass.userData.noMerge = true; p.add(glass);
  });
  // reloj retro naranja
  const clock = group('clock', 1.95, 2.98, ROOM.z0 + .05, 0, g); clock.userData.dynamic = 'clock';
  const disc = cyl(.15, .15, .05, M.lacquerOrange, { parent: clock, seg: 40 }); disc.rotation.x = Math.PI / 2;
  const face = cyl(.125, .125, .01, M.cream, { parent: clock, z: .026, seg: 40 }); face.rotation.x = Math.PI / 2;
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; box(.006, i % 3 ? .014 : .024, .004, M.blackPlastic, { parent: clock, x: Math.sin(a) * .1, y: Math.cos(a) * .1, z: .034, rz: -a }); }
  const hand = (len, w, col) => { const hnd = box(w, len, .004, col, { parent: clock, z: .04 + (len > .09 ? .002 : 0), cast: false }); hnd.geometry.translate(0, len / 2, 0); return hnd; };
  clock.userData.hands = [hand(.07, .008, M.blackPlastic), hand(.1, .006, M.blackPlastic), hand(.11, .003, M.lacquerRed)];
  g.userData.clock = clock;
  return g;
}

/* ---------- mural del grafitero (pared este) ---------- */
export function buildMural(M) {
  const tex = canvasTex(1024, 512, (g, W, H) => {
    g.fillStyle = '#d6cfc4'; g.fillRect(0, 0, W, H);
    const r = seed(31);
    // restos de capas anteriores
    for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(${[255, 138, 61].map(v => v * (.6 + r() * .4)).join(',')},.12)`; g.fillRect(r() * W, r() * H, 60 + r() * 220, 30 + r() * 80); }
    // formas grandes
    const blob = (x, y, rx, ry, c) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, r() * 3, 0, 7); g.fill(); };
    blob(200, 250, 180, 130, '#ff7ab0'); blob(470, 190, 200, 110, '#ff8a3d'); blob(780, 280, 210, 150, '#2f9e5f'); blob(330, 380, 120, 70, '#141010'); blob(650, 120, 90, 60, '#ff4a2b');
    // tag central en letras burbuja
    g.font = "900 250px 'Bricolage Grotesque',Arial Black,sans-serif"; g.textAlign = 'center'; g.lineJoin = 'round';
    g.lineWidth = 34; g.strokeStyle = '#141010'; g.strokeText('4B', 512, 330); g.lineWidth = 14; g.strokeStyle = '#efe4d0'; g.strokeText('4B', 512, 330); g.fillStyle = '#ff4a2b'; g.fillText('4B', 512, 330);
    // chorreones
    g.fillStyle = '#ff4a2b'; for (let i = 0; i < 9; i++) { const x = 400 + i * 28, h = 24 + r() * 70; g.fillRect(x, 332, 5, h); g.beginPath(); g.arc(x + 2.5, 332 + h, 4.5, 0, 7); g.fill(); }
    // detalles: estrellas y flechas
    g.strokeStyle = '#141010'; g.lineWidth = 5; for (let i = 0; i < 8; i++) { const x = 60 + r() * 900, y = 40 + r() * 420; g.beginPath(); g.moveTo(x - 12, y); g.lineTo(x + 12, y); g.moveTo(x, y - 12); g.lineTo(x, y + 12); g.stroke(); }
    // grano de spray
    for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(0,0,0,${r() * .06})`; g.fillRect(r() * W, r() * H, 1.5, 1.5); }
  }, { aniso: 8 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.8), new THREE.MeshStandardMaterial({ map: tex, roughness: .95, envMapIntensity: .35 }));
  m.rotation.y = -Math.PI / 2; m.position.set(ROOM.x1 - .005, 2.15, 2.55); m.receiveShadow = true;
  return m;
}

/* ---------- estante de discos y skate ---------- */
export function buildShelf(M) {
  const g = group('shelf', ROOM.x1 - .16, 1.3, L.desk.z + .05);
  box(.3, .04, 1.55, M.walnut, { parent: g });
  box(.03, .3, .3, M.blackMetal, { parent: g, x: .13, y: -.16, z: -.6 }); box(.03, .3, .3, M.blackMetal, { parent: g, x: .13, y: -.16, z: .6 });
  const r = seed(9), cols = ['#ff4a2b', '#ff8a3d', '#2f9e5f', '#ff7ab0', '#efe4d0', '#141010', '#f3c15a'];
  for (let i = 0; i < 14; i++) { const c = cols[Math.floor(r() * cols.length)]; box(.02, .3, .3, new THREE.MeshStandardMaterial({ color: c, roughness: .8 }), { parent: g, x: .05, y: .17, z: -.7 + i * .045 + r() * .01, rz: (i > 11 ? .12 : 0), ry: 0 }); }
  // altavoz pequeño
  rbox(.16, .26, .18, .02, M.blackPlastic, { parent: g, x: -.02, y: .15, z: .48 }); cyl(.055, .055, .01, M.rubber, { parent: g, x: -.115, y: .12, z: .48, seg: 20 }).rotation.z = Math.PI / 2;
  return g;
}

export function buildSkate(M) {
  const g = group('skate', ROOM.x1 - .22, .0, 4.05, -.28);
  g.rotation.z = -.0; g.rotation.x = 0;
  const deck = rbox(.21, .8, .02, .01, new THREE.MeshStandardMaterial({ map: canvasTex(64, 256, (c, W, H) => { c.fillStyle = '#ff4a2b'; c.fillRect(0, 0, W, H); c.fillStyle = '#efe4d0'; c.beginPath(); c.arc(W / 2, H * .5, W * .3, 0, 7); c.fill(); c.fillStyle = '#141010'; c.fillRect(0, H * .9, W, 6); }), roughness: .5 }), { parent: g, y: .44, x: 0, rz: 0 });
  g.rotation.z = .18; g.position.y = 0; deck.position.y = .42;
  for (const y of [.14, .7]) { box(.16, .02, .05, M.chrome, { parent: g, y: y - .03 + .02, x: 0 }); for (const s of [-1, 1]) cyl(.028, .028, .03, M.rubber, { parent: g, x: s * .085, y: y - .03, seg: 16 }).rotation.z = Math.PI / 2; }
  return g;
}

/* ---------- cortinas de gasa con oleaje (vertex shader) ---------- */
export function buildCurtain(M, z, q) {
  const w = .95, h = 2.95, sx = 22, sy = 40;
  const geo = new THREE.PlaneGeometry(w, h, Math.min(sx, q.curtain), sy);
  const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin(x * 18) * .035); }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xf1e4d2, roughness: .95, transparent: true, opacity: .58, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: .4 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = WIND;
    sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float k=(1.-(position.y+${(h / 2).toFixed(2)})/${h.toFixed(2)});
      transformed.z+=(sin(uWind*.8+position.x*3.+position.y*1.4)*.05+sin(uWind*1.7+position.y*2.)*.02)*k*(.5+.5*sin(uWind*.31));
      transformed.x+=sin(uWind*.6+position.y*1.9)*.03*k;`);
  };
  const g = group('curtain', ROOM.x0 + .16, h / 2 + .1, z);
  const m = new THREE.Mesh(geo, mat); m.rotation.y = Math.PI / 2; m.userData.noMerge = true; m.renderOrder = 3; g.add(m);
  box(.03, .03, w + .1, M.blackMetal, { parent: g, y: h / 2 + .02, x: .0 });
  return g;
}
