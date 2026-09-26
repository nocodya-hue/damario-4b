/* =========================================================
   PROPS — los objetos que hacen que ALLÍ viva alguien
   Mando, latas, revistas, zapatillas, mochila, cables, sprays, vinilos, auriculares…
   ========================================================= */
import * as THREE from 'three';
import { box, rbox, cyl, sph, group, contact } from './geo.js';
import { canvasTex, seed } from './materials.js';
import { L, SEAT } from './layout.js';
import { ROOM } from './room.js';

/* materiales sin textura en caché: objetos del mismo color comparten material y se fusionan en un solo draw call */
const _mc = new Map();
const std = (o) => { if (o.map) return new THREE.MeshStandardMaterial(o); const k = JSON.stringify(o); if (!_mc.has(k)) _mc.set(k, new THREE.MeshStandardMaterial(o)); return _mc.get(k); };

/* Mando estilo consola (diseño genérico propio: sin logos) */
export function buildPad(M, color = 0xdcdcdc, accent = 0x1a1a1a) {
  const g = new THREE.Group(); g.name = 'pad';
  const body = std({ color, roughness: .45 }), dark = std({ color: accent, roughness: .4 });
  rbox(.155, .036, .09, .014, body, { parent: g, y: 0, seg: 3 });
  for (const s of [-1, 1]) { const grip = rbox(.05, .032, .085, .016, dark, { parent: g, x: s * .062, y: -.006, z: .046, seg: 3 }); grip.rotation.y = s * -.28; }
  rbox(.06, .012, .028, .005, dark, { parent: g, y: .02, z: -.008 });                                    // panel táctil
  for (const [x, z] of [[-.04, .026], [.04, .026]]) { cyl(.011, .011, .01, dark, { parent: g, x, y: .022, z, seg: 12 }); sph(.0105, dark, { parent: g, x, y: .028, z, w: 10, h: 6 }); }
  const btnCols = [0x3ff2c0, 0xff4a6a, 0x6aa8ff, 0xffd24a];
  [[.05, -.008], [.068, .006], [.05, .02], [.032, .006]].forEach(([x, z], i) => cyl(.005, .005, .006, std({ color: btnCols[i], roughness: .4 }), { parent: g, x: x + .0, y: .021, z: z - .004, seg: 10 }));
  for (const [x, z] of [[-.052, -.012], [-.052, .012]]) box(.012, .006, .006, dark, { parent: g, x, y: .021, z });
  g.userData.buttons = g.children.slice(-4);
  g.userData.triggers = [-1, 1].map(sx => { const t = rbox(.038, .014, .022, .007, dark, { parent: g, x: sx * .052, y: .014, z: -.046, seg: 2 }); t.rotation.x = -.25; return t; });     // gatillos en el borde superior delantero: los índices descansan encima
  box(.062, .0025, .0035, std({ color: 0x1a2a55, emissive: 0x2f6bff, emissiveIntensity: 2.2, roughness: .3 }), { parent: g, x: 0, y: .0192, z: -.0405 });      // barra de luz
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/* Lata genérica (bebida energética ficticia) */
function canTex(c1, c2) {
  return canvasTex(128, 128, (g, W, H) => { g.fillStyle = c1; g.fillRect(0, 0, W, H); g.fillStyle = c2; g.beginPath(); g.moveTo(0, H * .3); g.lineTo(W, H * .5); g.lineTo(W, H * .75); g.lineTo(0, H * .55); g.fill(); g.fillStyle = '#fff'; g.font = '800 30px Arial'; g.fillText('NEON', 10, 46); }, { repeat: true });
}
export function buildCan(M, c1 = '#1a1a1a', c2 = '#ff4a2b') {
  const g = new THREE.Group();
  cyl(.033, .033, .12, std({ map: canTex(c1, c2), roughness: .3, metalness: .7, envMapIntensity: 1 }), { parent: g, y: .06, seg: 20 });
  cyl(.031, .033, .008, M.chrome, { parent: g, y: .124, seg: 20 }); cyl(.033, .031, .006, M.chrome, { parent: g, y: .003, seg: 20 });
  return g;
}

/* Bote de spray */
export function buildSpray(M, col = 0xff4a2b) {
  const g = new THREE.Group(), m = std({ color: col, roughness: .35, metalness: .5 });
  cyl(.033, .033, .17, m, { parent: g, y: .1, seg: 20 });
  cyl(.033, .026, .03, M.chrome, { parent: g, y: .2, seg: 20 });
  cyl(.03, .03, .05, std({ color: 0x141414, roughness: .5 }), { parent: g, y: .24, seg: 16 });
  box(.012, .014, .016, M.chrome, { parent: g, y: .27, z: .012 });
  cyl(.033, .033, .02, M.chrome, { parent: g, y: .012, seg: 20 });
  return g;
}

/* Revista / libro con portada procedural */
function coverTex(i) {
  const r = seed(400 + i), cols = ['#ff4a2b', '#ff8a3d', '#2f9e5f', '#ff7ab0', '#141010', '#f3c15a', '#efe4d0'];
  return canvasTex(128, 176, (g, W, H) => { g.fillStyle = cols[i % cols.length]; g.fillRect(0, 0, W, H); g.fillStyle = cols[(i + 3) % cols.length]; g.beginPath(); g.arc(W * .5, H * .5, W * .3, 0, 7); g.fill(); g.fillStyle = '#141010'; g.fillRect(10, 12, W - 20, 12); g.fillStyle = '#efe4d0'; g.fillRect(10, H - 22, W * .5, 6); });
}
export function buildMag(M, i, w = .21, h = .28, t = .006) {
  const g = new THREE.Group();
  const cover = new THREE.MeshStandardMaterial({ map: coverTex(i), roughness: .6 }), pages = M.paper;
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, t, h), [pages, pages, cover, pages, pages, pages]); b.castShadow = b.receiveShadow = true; g.add(b);
  return g;
}

/* Zapatilla robusta genérica (para el suelo; los personajes llevan las suyas) */
export function buildSneakerProp(M, body = 0xefe6d4, accent = 0xff4a2b) {
  const g = new THREE.Group(), bm = std({ color: body, roughness: .7 }), am = std({ color: accent, roughness: .6 }), sole = std({ color: 0xf4efe6, roughness: .8 });
  rbox(.115, .045, .3, .02, sole, { parent: g, y: .022, seg: 3 });
  const up = rbox(.105, .075, .24, .03, bm, { parent: g, y: .08, z: -.01, seg: 3 });
  rbox(.1, .095, .12, .04, bm, { parent: g, y: .095, z: -.09, seg: 3 });
  rbox(.106, .06, .11, .03, am, { parent: g, y: .07, z: .09, seg: 3 });
  const tongue = rbox(.07, .1, .02, .01, bm, { parent: g, y: .12, z: .0, rx: -.5 }); void up; void tongue;
  for (let i = 0; i < 4; i++) box(.07, .004, .008, std({ color: 0xfaf6ee }), { parent: g, y: .125 - i * .008, z: .025 + i * .022, rx: -.6 });
  return g;
}

/* ---------- escritorio del grafitero ---------- */
export function buildDesk(M, pageMat) {
  const g = group('desk', L.desk.x, 0, L.desk.z);
  const { w, len, h } = L.desk;
  box(w, .04, len, M.deskWood, { parent: g, y: h - .02, col: 'desk' });
  for (const [x, z] of [[-w / 2 + .05, -len / 2 + .06], [w / 2 - .05, -len / 2 + .06], [-w / 2 + .05, len / 2 - .06], [w / 2 - .05, len / 2 - .06]]) box(.05, h - .04, .05, M.blackMetal, { parent: g, x, y: (h - .04) / 2, z });
  box(w - .1, .03, .04, M.blackMetal, { parent: g, y: .3, z: -len / 2 + .06 }); box(w - .1, .03, .04, M.blackMetal, { parent: g, y: .3, z: len / 2 - .06 });
  // marcas de uso: manchas de pintura en la mesa
  const paint = std({ color: 0xff4a2b, roughness: .7 }); for (const [x, z, r, c] of [[-.2, .55, .05, 0xff4a2b], [.1, -.65, .04, 0x2f9e5f], [-.25, -.2, .035, 0xff7ab0]]) { const m = cyl(r, r, .002, std({ color: c, roughness: .8 }), { parent: g, x, y: h + .001, z, seg: 16, cast: false }); }
  contact(w + .6, len + .6, .5, { parent: g });

  // libreta grande abierta
  const nb = group('notebook', L.notebook.x - L.desk.x, L.notebook.y - 0, L.notebook.z - L.desk.z, -Math.PI / 2, g);
  const pw = L.notebook.w, ph = L.notebook.d;
  rbox(pw + .03, .012, ph + .03, .004, std({ color: 0x1d1a18, roughness: .8 }), { parent: nb, y: -.004 });          // tapa
  rbox(pw, .01, ph, .002, M.paper, { parent: nb, y: .004 });                                                       // bloque de hojas
  const page = new THREE.Mesh(new THREE.PlaneGeometry(pw - .01, ph - .01), pageMat); page.rotation.x = -Math.PI / 2; page.position.y = .0095; page.receiveShadow = true; nb.add(page);
  // espiral
  for (let i = 0; i < 16; i++) cyl(.0025, .0025, .014, M.chrome, { parent: nb, x: -pw / 2 - .006, z: -ph / 2 + .02 + i * (ph - .04) / 15, y: .006, seg: 6 }).rotation.x = Math.PI / 2;
  nb.userData.page = page; g.userData.notebook = nb;

  // bibliotecas de sprays, rotuladores, lápices, auriculares y latas
  const cols = [0xff4a2b, 0xff8a3d, 0x2f9e5f, 0xff7ab0, 0x141414, 0xf3c15a, 0x3ff2c0];
  cols.forEach((c, i) => { const s = buildSpray(M, c); s.position.set(-.26 + (i % 4) * .075, h, -.78 - Math.floor(i / 4) * .09 + (i > 4 ? .0 : 0)); g.add(s); if (i === 2 || i === 5) { s.rotation.z = Math.PI / 2; s.position.y = h + .034; s.position.x += .05; s.rotation.y = i * 1.3; } });
  const cup = cyl(.04, .035, .1, std({ color: 0x1d1d1d, roughness: .5, metalness: .6 }), { parent: g, x: -.28, y: h + .05, z: .78, seg: 20 });
  for (let i = 0; i < 6; i++) { const p = cyl(.004, .004, .16 + (i % 3) * .02, std({ color: cols[i], roughness: .5 }), { parent: g, x: -.28 + Math.sin(i) * .02, y: h + .13, z: .78 + Math.cos(i * 2) * .02, seg: 6 }); p.rotation.z = Math.sin(i * 2.1) * .28; p.rotation.x = Math.cos(i * 1.7) * .22; }
  const can1 = buildCan(M, '#1a1a1a', '#3ff2c0'); can1.position.set(.28, h, .55); g.add(can1);
  const can2 = buildCan(M, '#ff8a3d', '#141010'); can2.position.set(.3, h + .006, 0.72); can2.rotation.set(Math.PI / 2, 0, .8); g.add(can2);
  const pencase = rbox(.22, .04, .08, .015, std({ color: 0x2b2b2b, roughness: .8 }), { parent: g, x: .25, y: h + .02, z: -.35, ry: .3 });
  // hojas sueltas y bocetos
  for (let i = 0; i < 4; i++) box(.2, .002, .28, M.paper, { parent: g, x: .2 + i * .01, y: h + .002 + i * .0018, z: .3 + i * .03, ry: .3 * (i - 1.5), cast: false });
  // auriculares
  const hp = group('headphones', .05, h + .02, -.55, .5, g);
  const band = new THREE.Mesh(new THREE.TorusGeometry(.085, .01, 8, 24, Math.PI), M.blackMetal); band.rotation.z = 0; band.position.y = .085; hp.add(band);
  for (const s of [-1, 1]) rbox(.03, .09, .075, .014, std({ color: 0x141414, roughness: .5 }), { parent: hp, x: s * .085, y: .06 });
  hp.rotation.x = -.0; hp.rotation.z = 1.35; hp.position.y = h + .1;
  // taburete
  const st = group('stool', L.stool.x - L.desk.x, 0, L.stool.z - L.desk.z, 0, g);
  cyl(.17, .16, .05, M.velvetOrange, { parent: st, y: .49, seg: 28, col: 'stool' });
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + .4; const leg = cyl(.014, .012, .5, M.blackMetal, { parent: st, x: Math.sin(a) * .13, z: Math.cos(a) * .13, y: .25, seg: 8, wuv: false }); leg.rotation.set(Math.cos(a) * .12, 0, -Math.sin(a) * .12); }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.13, .008, 8, 24), M.blackMetal); ring.rotation.x = Math.PI / 2; ring.position.y = .2; st.add(ring);
  return g;
}

/* ---------- objetos desordenados del salón ---------- */
export function buildClutter(M) {
  const g = group('clutter');
  // mesa de centro: revistas, vela, taza, mando, mando a distancia, bandeja
  const ct = L.coffee, top = ct.h + .02;
  const tray = rbox(.38, .02, .26, .01, M.walnutDark, { parent: g, x: ct.x + .18, y: top + .01, z: ct.z + .05, ry: .1 });
  const cup = cyl(.038, .032, .08, M.ceramicWhite, { parent: g, x: ct.x + .1, y: top + .06, z: ct.z + .02, seg: 20 });
  const cnd = cyl(.04, .04, .07, M.glassThick, { parent: g, x: ct.x + .26, y: top + .055, z: ct.z + .08, seg: 20 }); cyl(.032, .032, .04, M.candle, { parent: g, x: ct.x + .26, y: top + .045, z: ct.z + .08, seg: 16 }); sph(.008, M.bulbWarm, { parent: g, x: ct.x + .26, y: top + .075, z: ct.z + .08, w: 8, h: 6, cast: false });
  for (let i = 0; i < 4; i++) { const m = buildMag(M, i, .22, .29, .007); m.position.set(ct.x - .3, top + .004 + i * .0075, ct.z - .04); m.rotation.y = .3 + i * .18 - .3; g.add(m); }
  const book = buildMag(M, 5, .18, .24, .03); book.position.set(ct.x - .26, top + .05, ct.z - .02); book.rotation.y = .5; g.add(book);
  const pad = buildPad(M, 0xefefef, 0x1a1a1a); pad.position.set(ct.x - .05, top + .022, ct.z + .18); pad.rotation.set(0, -.6, .02); g.add(pad); g.userData.padProp = pad;
  const rem = rbox(.04, .014, .16, .006, M.blackPlastic, { parent: g, x: ct.x + .0, y: top + .009, z: ct.z - .14, ry: .4 });
  const c1 = buildCan(M, '#1a1a1a', '#ff8a3d'); c1.position.set(ct.x + .48, top, ct.z - .16); g.add(c1);
  const c2 = buildCan(M, '#1a1a1a', '#3ff2c0'); c2.position.set(ct.x - .5, top + .004, ct.z + .2); c2.rotation.set(Math.PI / 2, 0, -.6); g.add(c2);
  // zapatillas en el suelo, cerca del sofá y de la mecedora
  const s1 = buildSneakerProp(M, 0xefe6d4, 0xff4a2b); s1.position.set(-2.35, .0, -1.85); s1.rotation.y = .5; g.add(s1);
  const s2 = buildSneakerProp(M, 0xefe6d4, 0xff4a2b); s2.position.set(-2.12, .0, -1.75); s2.rotation.set(0, -.3, Math.PI / 2); s2.position.y = .06; g.add(s2);
  const s3 = buildSneakerProp(M, 0x1b1b1b, 0x2f9e5f); s3.position.set(.95, 0, .3); s3.rotation.y = 2.4; g.add(s3);
  const s4 = buildSneakerProp(M, 0x1b1b1b, 0x2f9e5f); s4.position.set(1.15, 0, .4); s4.rotation.y = 2.9; g.add(s4);
  // mochila
  const bp = group('backpack', -2.72, 0, 1.0, .5, g);
  rbox(.32, .46, .2, .07, M.velvetGreen, { parent: bp, y: .23, z: 0, rx: -.08 }); rbox(.26, .2, .07, .03, M.velvetGreen, { parent: bp, y: .16, z: .13, rx: -.08 });
  box(.3, .02, .02, M.blackPlastic, { parent: bp, y: .34, z: .105 }); for (const s of [-1, 1]) box(.04, .3, .012, M.blackPlastic, { parent: bp, x: s * .1, y: .27, z: -.108 });
  contact(.6, .5, .5, { parent: bp });
  // taburete auxiliar + cenicero junto al sillón verde
  const sx = 2.12, sz = -2.7;
  const stl = group('ashStool', sx, 0, sz, 0, g);
  cyl(.19, .19, .04, M.walnut, { parent: stl, y: .42, seg: 28, col: 'ashStool' });
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; const l = cyl(.013, .011, .42, M.blackMetal, { parent: stl, x: Math.sin(a) * .13, z: Math.cos(a) * .13, y: .21, seg: 8, wuv: false }); l.rotation.set(Math.cos(a) * .1, 0, -Math.sin(a) * .1); }
  cyl(.06, .05, .022, M.ceramicWhite, { parent: stl, x: .04, y: .453, z: .0, seg: 24 });
  const lighter = rbox(.022, .06, .012, .004, std({ color: 0xff4a2b, roughness: .3, metalness: .4 }), { parent: stl, x: -.09, y: .47, z: .06, rz: 1.4, ry: .5 });
  const c3 = buildCan(M, '#1a1a1a', '#ff4a2b'); c3.position.set(-.06, .44, -.08); stl.add(c3);
  contact(.6, .6, .5, { parent: stl });
  // vinilos apoyados en el mueble de la tele
  const cols = ['#ff4a2b', '#efe4d0', '#2f9e5f', '#141010', '#ff7ab0'];
  cols.forEach((c, i) => { const v = box(.31, .31, .005, std({ color: c, roughness: .7 }), { parent: g, x: -1.05 + i * .012, y: .16 + .0, z: -4.12 + i * .012, rx: -.12, ry: .0 }); v.position.x = -.85 - i * .0; v.position.y = .17; v.position.z = -4.02 + i * .012; v.rotation.x = -.12 - i * .004; v.position.x = -0.98 + i * .02; });
  // auriculares del sofá, cable de la consola
  const hp = group('sofaHeadphones', -1.95, .69, -.72, .6, g);
  const band = new THREE.Mesh(new THREE.TorusGeometry(.085, .01, 8, 24, Math.PI), M.blackMetal); band.position.y = .0; band.rotation.z = 0; hp.add(band);
  for (const s of [-1, 1]) rbox(.03, .09, .075, .014, std({ color: 0xf0f0f0, roughness: .4 }), { parent: hp, x: s * .085, y: -.02 });
  hp.rotation.set(1.1, .6, .1);
  // cables: consola → tele (visto desde el frente) y alargador por el suelo
  const cab = (pts, r = .006) => { const t = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), 40, r, 6), M.cable); t.castShadow = true; g.add(t); return t; };
  cab([[1.45, .012, -4.18], [1.6, .01, -3.9], [1.9, .01, -3.75], [2.4, .01, -3.9], [3.1, .01, -3.6]]);
  cab([[-.3, .012, -4.18], [-.5, .01, -3.85], [-1.1, .01, -3.5], [-2.0, .01, -3.3]], .005);
  cab([[.35, .012, -4.2], [.2, .01, -3.98], [-.2, .01, -3.9]], .005);
  return g;
}
