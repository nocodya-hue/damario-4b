/* =========================================================
   MOBILIARIO — piezas independientes con su propio volumen
   Sofá en L de lana, sillón mecedora de terciopelo rojo, sillón giratorio verde,
   mesa de centro de cristal en cascada, mueble de nogal para la tele.
   ========================================================= */
import * as THREE from 'three';
import { box, rbox, cyl, sph, group, contact, D2R } from './geo.js';
import { canvasTex } from './materials.js';
import { cushion } from './cushion.js';
import { L, SEAT } from './layout.js';

/* patrón geométrico blanco/negro de los cojines */
function pillowTex(kind = 0) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = kind === 0 ? '#efe6d4' : '#141010'; g.fillRect(0, 0, w, h);
    g.fillStyle = kind === 0 ? '#141010' : '#efe6d4';
    if (kind === 0) { const n = 4, s = w / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.beginPath(); if ((i + j) % 2) { g.moveTo(i * s, j * s); g.lineTo((i + 1) * s, j * s); g.lineTo(i * s, (j + 1) * s); } else { g.moveTo((i + 1) * s, (j + 1) * s); g.lineTo((i + 1) * s, j * s); g.lineTo(i * s, (j + 1) * s); } g.fill(); } }
    else { for (let i = 0; i < 9; i++) { g.fillRect(0, i * 30 + 6, w, 9); } g.fillStyle = '#ff5a14'; g.fillRect(0, 0, w, 6); }
  }, { repeat: true });
}

export function buildSofa(M) {
  const g = group('sofa', L.sofa.x, 0, L.sofa.z, L.sofa.yaw);
  const W = L.sofa.w, D = L.sofa.d, cl = L.sofa.chaise.len, F = M.sofaFabric;
  // frente local = +z (hacia la tele). Con yaw π: +x local = oeste (chaise), -x local = este (brazo y mesita naranja)
  rbox(W, .2, D, .04, M.blackMetal, { parent: g, y: .18, col: 'sofa' });
  rbox(.96, .2, cl, .04, M.blackMetal, { parent: g, x: W / 2 - .48, y: .18, z: D / 2 + cl / 2 - .02, col: 'sofa' });
  for (const [x, z] of [[-W / 2 + .1, -D / 2 + .1], [W / 2 - .1, -D / 2 + .1], [-W / 2 + .1, D / 2 - .1], [W / 2 - .1, D / 2 + cl - .12], [W / 2 - .85, D / 2 + cl - .12]]) cyl(.025, .02, .09, M.blackMetal, { parent: g, x, y: .045, z, seg: 10 });
  cushion(F, W, .8, .26, .1, { puff: .012 }, { parent: g, y: .52, z: -D / 2 + .13, col: 'sofa' });                       // respaldo
  cushion(F, .24, .62, D + .02, .1, { puff: .01 }, { parent: g, x: -W / 2 + .12, y: .43, z: 0, col: 'sofa' });           // brazo este (el que ve la cámara)
  cushion(F, .24, .58, D + cl, .1, { puff: .01 }, { parent: g, x: W / 2 - .12, y: .41, z: cl / 2, col: 'sofa' });        // brazo exterior de la chaise
  const seatW = .76;
  // cojines de asiento con la huella de quien se sienta (glúteos y muslos) en el central
  const seatDents = [{ x: -.10, z: -.02, r: .13, d: .032 }, { x: .10, z: -.02, r: .13, d: .032 }, { x: -.11, z: .27, r: .10, rz: .2, d: .016 }, { x: .11, z: .27, r: .10, rz: .2, d: .016 }];
  cushion(F, seatW, .24, .74, .08, { puff: .022, dents: seatDents }, { parent: g, x: 0, y: .33, z: .12, col: 'sofa', soft: .06 });
  cushion(F, seatW, .24, .74, .08, { puff: .022 }, { parent: g, x: -.76, y: .33, z: .12, col: 'sofa', soft: .028 });
  cushion(F, .7, .24, D * .74, .08, { puff: .022 }, { parent: g, x: .75, y: .33, z: .12, col: 'sofa', soft: .028 });
  cushion(F, .7, .24, cl - .02, .08, { puff: .02 }, { parent: g, x: .75, y: .33, z: D / 2 + cl / 2 - .02, col: 'sofa', soft: .028 });        // chaise
  for (const x of [-.76, .0]) cushion(F, seatW, .44, .22, .09, { puff: .03 }, { parent: g, x, y: .68, z: -.14, rx: -.16, col: 'sofa', soft: .03 });
  cushion(F, .7, .44, .22, .09, { puff: .03 }, { parent: g, x: .75, y: .68, z: -.14, rx: -.16, col: 'sofa', soft: .03 });
  // cojines decorativos desordenados (blanco/negro geométrico como la referencia)
  rbox(.42, .42, .13, .06, new THREE.MeshStandardMaterial({ map: pillowTex(0), roughness: .95 }), { parent: g, x: -W / 2 + .42, y: .66, z: .02, rx: -.3, rz: .18, ry: .25 });
  rbox(.4, .4, .13, .06, new THREE.MeshStandardMaterial({ map: pillowTex(1), roughness: .95 }), { parent: g, x: -W / 2 + .78, y: .62, z: .1, rx: -.25, rz: -.35, ry: -.2 });
  rbox(.44, .3, .14, .07, M.velvetOrange, { parent: g, x: W / 2 - .5, y: .61, z: D / 2 + cl - .5, rx: -.2, rz: .5 });
  rbox(.5, .05, .5, .02, M.velvetPink, { parent: g, x: -W / 2 + .08, y: .74, z: .1, rz: .12, ry: .5 });   // manta sobre el brazo
  contact(W + .5, D + cl + .5, .6, { parent: g, x: .1, z: cl / 2 });
  g.updateMatrixWorld();
  return g;
}

/* Sillón mecedora de terciopelo rojo (junto a la ventana) */
export function buildRocker(M) {
  const root = group('rocker', L.rocker.x, 0, L.rocker.z, L.rocker.yaw);
  const c = group('rockerBody', 0, 0, 0, 0, root);
  const V = M.velvetRed;
  cushion(V, .66, .16, .62, .07, { puff: .03, dents: [{ x: -.1, z: -.08, r: .12, d: .03 }, { x: .1, z: -.08, r: .12, d: .03 }, { x: -.1, z: .2, r: .1, rz: .18, d: .014 }, { x: .1, z: .2, r: .1, rz: .18, d: .014 }], tufts: { nx: 3, nz: 3, d: .006, r: .04, stagger: 1 } }, { parent: c, y: .38, z: .02, col: 'rocker', soft: .05 });   // asiento capitoné
  cushion(V, .66, .64, .17, .07, { puff: .035, tufts: { nx: 4, nz: 5, d: .012, r: .045, face: 'front', stagger: 1 } }, { parent: c, y: .7, z: -.3, rx: -.32, col: 'rocker', soft: .03 });   // respaldo curvo acolchado
  cushion(V, .13, .34, .56, .06, { puff: .012 }, { parent: c, x: -.34, y: .55, z: -.02, col: 'rocker' });                         // brazos
  cushion(V, .13, .34, .56, .06, { puff: .012 }, { parent: c, x: .34, y: .55, z: -.02, col: 'rocker' });
  rbox(.4, .13, .17, .06, V, { parent: c, y: .96, z: -.4, rx: -.32 });                          // reposacabezas
  // trineos mecedores de varilla negra
  const mk = (x) => {
    const pts = []; for (let i = 0; i <= 20; i++) { const a = (i / 20 - .5) * 1.1, R = 1.5; pts.push(new THREE.Vector3(x, .015 + R * (1 - Math.cos(a)) * .5, R * Math.sin(a) * .5 * 1.0)); }
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, .011, 8), M.blackMetal); tube.castShadow = true; c.add(tube);
    for (const z of [-.28, .3]) { const legs = new THREE.Mesh(new THREE.CylinderGeometry(.011, .011, .3, 8), M.blackMetal); legs.position.set(x, .2, z); legs.rotation.x = z < 0 ? .12 : -.12; legs.castShadow = true; c.add(legs); }
  };
  mk(-.28); mk(.28);
  const bar = cyl(.01, .01, .56, M.blackMetal, { parent: c, y: .1, z: 0, seg: 8, wuv: false }); bar.rotation.z = Math.PI / 2;
  contact(.9, 1.0, .55, { parent: root });
  root.userData.body = c; root.userData.dynamic = 'rocker';
  return root;
}

/* Sillón giratorio verde, mullido, semirrecostado (fumador) */
export function buildGreenChair(M) {
  const root = group('greenChair', L.greenChair.x, 0, L.greenChair.z, L.greenChair.yaw);
  const swivel = group('swivel', 0, 0, 0, 0, root);
  const V = M.velvetGreen;
  // base estrella + columna
  cyl(.045, .05, .3, M.chrome, { parent: swivel, y: .21, seg: 16 });
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2, arm = box(.34, .03, .05, M.blackMetal, { parent: swivel, y: .05, x: Math.sin(a) * .18, z: Math.cos(a) * .18 }); arm.rotation.y = a + Math.PI / 2; cyl(.025, .025, .035, M.rubber, { parent: swivel, x: Math.sin(a) * .35, z: Math.cos(a) * .35, y: .02, seg: 10 }); }
  const seat = group('seat', 0, 0, 0, 0, swivel);
  cushion(V, .8, .22, .76, .1, { puff: .04, dents: [{ x: -.12, z: -.12, r: .14, d: .034 }, { x: .12, z: -.12, r: .14, d: .034 }, { x: -.12, z: .2, r: .11, rz: .2, d: .016 }, { x: .12, z: .2, r: .11, rz: .2, d: .016 }], tufts: { nx: 3, nz: 3, d: .008, r: .05 } }, { parent: seat, y: .42, z: .04, col: 'green', soft: .07 });   // cojín asiento
  cushion(V, .78, .66, .26, .12, { puff: .05, tufts: { nx: 4, nz: 5, d: .018, r: .05, face: 'front' } }, { parent: seat, y: .74, z: -.3, rx: -.28, col: 'green', soft: .04 });          // respaldo mullido con botones
  cushion(V, .16, .3, .62, .08, { puff: .02 }, { parent: seat, x: -.4, y: .56, z: -.02, col: 'green' });                         // brazos
  cushion(V, .16, .3, .62, .08, { puff: .02 }, { parent: seat, x: .4, y: .56, z: -.02, col: 'green' });
  cushion(V, .66, .18, .2, .08, { puff: .02 }, { parent: seat, y: .32, z: .38 });                                   // labio frontal
  contact(1.0, 1.0, .55, { parent: root });
  root.userData.seat = seat; root.userData.dynamic = 'greenChair';
  return root;
}

/* Mesa de centro de cristal en cascada */
export function buildCoffeeTable(M) {
  const g = group('coffee', L.coffee.x, 0, L.coffee.z, .04);
  const { w, d, h } = L.coffee;
  box(w, .035, d, M.glassThick, { parent: g, y: h, cast: true, col: 'coffee' });
  box(w, .006, d, M.glass, { parent: g, y: h - .02 });                           // canto verdoso del cristal (segunda lámina)
  const sideMat = new THREE.MeshPhysicalMaterial({ color: 0xa9d4c4, roughness: .05, transparent: true, opacity: .32, envMapIntensity: 1.6, depthWrite: false, clearcoat: 1 });
  box(.035, h, d, sideMat, { parent: g, x: -w / 2 + .02, y: h / 2 });
  box(.035, h, d, sideMat, { parent: g, x: w / 2 - .02, y: h / 2 });
  contact(w + .5, d + .5, .4, { parent: g });
  return g;
}

/* Mueble de nogal + tele + barra de sonido.
   Igual que la referencia: cajones de nogal a la izquierda, hueco abierto negro con estantes
   bajo la tele, cajones de nogal a la derecha y zócalo negro. */
export function buildTvUnit(M, tvScreenMat) {
  const g = group('tvUnit', L.sideboard.x, 0, L.sideboard.z);
  const { w, d, h } = L.sideboard;
  const X0 = -w / 2, cubL = 1.85, cubW = 1.1;                      // hueco abierto: de X0+cubL a X0+cubL+cubW
  box(w, .05, d, M.walnut, { parent: g, y: h - .025 });                                        // tapa
  box(w - .02, .06, d - .02, M.blackMetal, { parent: g, y: .03 });                             // zócalo negro
  const drawers = (x0, x1) => {
    const bw = x1 - x0; box(bw, h - .11, d - .02, M.walnut, { parent: g, x: (x0 + x1) / 2, y: (h - .11) / 2 + .06 });
    const n = Math.round(bw / .9), dw = bw / n;
    for (let i = 0; i < n; i++) { const x = x0 + dw * (i + .5);
      box(dw - .02, h - .16, .018, M.walnut, { parent: g, x, y: h / 2 + .005, z: d / 2 - .005 });
      box(dw * .55, .012, .012, M.blackMetal, { parent: g, x, y: h - .12, z: d / 2 + .008 }); }
  };
  drawers(X0, X0 + cubL); drawers(X0 + cubL + cubW, w / 2);
  // hueco abierto negro con dos estantes y cosas dentro
  const cx = X0 + cubL + cubW / 2, dark = M.blackPlastic;
  box(cubW, h - .11, .02, dark, { parent: g, x: cx, y: h / 2 + .03, z: -d / 2 + .02 });
  box(.025, h - .11, d - .02, dark, { parent: g, x: cx - cubW / 2 + .0125, y: h / 2 + .03 }); box(.025, h - .11, d - .02, dark, { parent: g, x: cx + cubW / 2 - .0125, y: h / 2 + .03 });
  box(cubW, .025, d - .02, dark, { parent: g, x: cx, y: h * .53 }); box(cubW, .025, d - .02, dark, { parent: g, x: cx, y: .075 });
  const con = rbox(.3, .05, .22, .01, M.blackPlastic, { parent: g, x: cx - .25, y: .11, z: 0 });                               // consola
  box(.28, .004, .003, M.bulbWarm, { parent: g, x: cx - .25, y: .11, z: .112, cast: false, receive: false });
  box(.22, .028, .16, M.paper, { parent: g, x: cx + .22, y: .0925 + .0, z: 0, ry: .1 });                                       // libros
  rbox(.14, .07, .1, .02, M.ceramicWhite, { parent: g, x: cx + .2, y: h * .53 + .05, z: 0 });
  // TV de pared
  const tv = group('tv', L.tv.x - L.sideboard.x, L.tv.y, L.tv.z - L.sideboard.z, 0, g);
  rbox(L.tv.w, L.tv.h, .045, .012, M.blackPlastic, { parent: tv, cast: true });
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(L.tv.w - .022, L.tv.h - .022), tvScreenMat); scr.position.z = .0235; tv.add(scr);
  // barra de sonido
  rbox(1.5, .06, .09, .02, M.blackPlastic, { parent: g, x: L.tv.x - L.sideboard.x, y: h + .03, z: -.02 });
  box(1.45, .03, .002, M.rubber, { parent: g, x: L.tv.x - L.sideboard.x, y: h + .03, z: .026 });
  // objetos sobre el mueble: libros y cuenco negro
  rbox(.26, .04, .19, .008, M.paper, { parent: g, x: X0 + 1.55, y: h + .02, z: -.02, ry: .1 }); rbox(.2, .03, .15, .008, M.blackPlastic, { parent: g, x: X0 + 1.55, y: h + .055, z: -.02, ry: -.2 });
  cyl(.06, .05, .03, M.blackPlastic, { parent: g, x: X0 + 1.57, y: h + .09, z: -.02, seg: 24 });
  contact(w + .4, d + .7, .5, { parent: g, z: .15 });
  g.userData.screen = scr;
  return g;
}
