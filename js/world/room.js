/* =========================================================
   ARQUITECTURA — loft urbano
   Sala de 6,6 × 9,2 m, techo de 3,5 m. Mira al norte (–Z) hacia la tele.
     Oeste (x=-3.3): ladrillo visto + dos grandes ventanales de acero negro
     Norte (z=-4.6): tabique gris malva con la tele y la galería de pósters,
                     esquina de ladrillo pintado a la cal + pilastra de hormigón
     Este  (x= 3.3): hormigón visto, conducto espiral, estantes, mural
     Techo: hormigón, viga de canto, falso techo bajo la ventana con focos, conductos
   ========================================================= */
import * as THREE from 'three';
import { box, cyl, group, scaleUV, D2R } from './geo.js';

export const ROOM = { x0: -3.3, x1: 3.3, z0: -4.6, z1: 4.6, h: 3.5 };
export const WIN = { y0: .55, y1: 3.05, tr: 2.35 };   // antepecho, dintel, travesaño

export function buildRoom(M, q) {
  const R = group('room');
  const T = .35;                                    // grosor de muro
  const { x0, x1, z0, z1, h } = ROOM;

  // ---------- suelo y techo ----------
  box(x1 - x0 + .2, .2, z1 - z0 + .2, M.floor, { y: -.1, parent: R, cast: false });
  box(x1 - x0 + .2, .3, z1 - z0 + .2, M.ceiling, { y: h + .15, parent: R, cast: false });

  // ---------- muro oeste (ladrillo + ventanales) ----------
  const wx = x0 - T / 2;
  box(T, WIN.y0, z1 - z0, M.brick, { x: wx, y: WIN.y0 / 2, parent: R });                              // antepecho
  box(T, h - WIN.y1, z1 - z0, M.concrete, { x: wx, y: (WIN.y1 + h) / 2, parent: R });                   // dintel
  const pier = (za, zb, mat) => box(T, WIN.y1 - WIN.y0, zb - za, mat, { x: wx, y: (WIN.y0 + WIN.y1) / 2, z: (za + zb) / 2, parent: R });
  pier(z0, -3.7, M.brick); pier(-.6, .6, M.brickWhite); pier(3.7, z1, M.brick);
  // fachada exterior: continúa por encima, debajo y a los lados de la sala
  const fx = x0 - T / 2;
  box(T, 71, 30, M.concreteDark, { x: fx, y: -24.5, z: z0 - 15, parent: R });
  box(T, 71, 30, M.concreteDark, { x: fx, y: -24.5, z: z1 + 15, parent: R });
  box(T, 60, z1 - z0, M.concreteDark, { x: fx, y: -30, z: 0, parent: R });         // por debajo (hasta la calle)
  box(T, 8, z1 - z0, M.concreteDark, { x: fx, y: h + 4, z: 0, parent: R });         // por encima (hasta la azotea)
  box(T + .5, .35, 30 * 2 + z1 - z0, M.concrete, { x: fx - .1, y: h + 8.17, z: 0, parent: R });   // albardilla de la azotea

  // ventanales de acero
  const frame = (zc, wdt, bays, casementBay) => {
    const g = group('window', wx, 0, zc, 0, R), y0 = WIN.y0, y1 = WIN.y1, hh = y1 - y0, fw = .06, fd = .1;
    const bar = (w, hgt, x, y, z) => box(w, hgt, fd, M.steel, { parent: g, x, y, z, cast: true }).rotation.set(0, Math.PI / 2, 0);
    // jambas (barras verticales a lo largo de z → se giran: w es el ancho en z)
    const vb = (z) => box(fd, hh, fw, M.steel, { parent: g, y: y0 + hh / 2, z });
    const hb = (y) => box(fd, fw, wdt, M.steel, { parent: g, y, z: 0 });
    hb(y0 + fw / 2); hb(y1 - fw / 2); hb(WIN.tr);
    vb(-wdt / 2 + fw / 2); vb(wdt / 2 - fw / 2);
    const bw = wdt / bays;
    for (let i = 1; i < bays; i++) vb(-wdt / 2 + bw * i);
    // vidrios
    for (let i = 0; i < bays; i++) {
      const zc2 = -wdt / 2 + bw * (i + .5);
      const gTop = new THREE.Mesh(new THREE.PlaneGeometry(bw - fw, y1 - WIN.tr - fw), M.glass); gTop.rotation.y = Math.PI / 2; gTop.position.set(0, (y1 + WIN.tr) / 2, zc2); g.add(gTop);
      if (i !== casementBay) { const gl = new THREE.Mesh(new THREE.PlaneGeometry(bw - fw, WIN.tr - y0 - fw), M.glass); gl.rotation.y = Math.PI / 2; gl.position.set(0, (WIN.tr + y0) / 2, zc2); g.add(gl); }
    }
    return { g, bw };
  };
  frame(-2.15, 3.1, 3, -1);                                        // ventanal A (norte), cerrado
  const B = frame(2.15, 3.1, 3, 1);                                // ventanal B (sur), hoja central abierta
  // hoja abierta: marco + vidrio, con bisagra en la jamba sur de la calle central
  const leaf = group('casement', wx, 0, 2.15 + B.bw / 2 - .03, -105 * D2R, R);
  const lw = B.bw - .08, lh = WIN.tr - WIN.y0 - .1;
  const lm = group('leafPivot', 0, 0, 0, 0, leaf);
  const lz = -lw / 2;
  box(.04, lh, .05, M.steel, { parent: lm, y: WIN.y0 + .05 + lh / 2, z: 0 }); box(.04, lh, .05, M.steel, { parent: lm, y: WIN.y0 + .05 + lh / 2, z: -lw });
  box(.04, .05, lw, M.steel, { parent: lm, y: WIN.y0 + .07, z: lz }); box(.04, .05, lw, M.steel, { parent: lm, y: WIN.y0 + .05 + lh, z: lz });
  const lg = new THREE.Mesh(new THREE.PlaneGeometry(lw, lh), M.glass); lg.rotation.y = Math.PI / 2; lg.position.set(0, WIN.y0 + .05 + lh / 2, lz); lm.add(lg);
  box(.07, .03, .16, M.chrome, { parent: lm, y: WIN.y0 + .05 + lh / 2, z: -lw + .1 });   // manilla
  leaf.userData.dynamic = 'casement'; R.userData.leaf = leaf;

  // ---------- muro norte ----------
  const nz = z0 - T / 2;
  box(x1 - x0 + .1, h, T, M.plaster, { z: nz, y: h / 2, parent: R });                                       // tabique general
  box(1.0, h, .04, M.brickWhite, { x: x0 + .5, y: h / 2, z: z0 + .02, parent: R });                         // ladrillo a la cal (esquina)
  box(.5, h, .22, M.concrete, { x: -2.05, y: h / 2, z: z0 + .11, parent: R });                              // pilastra de hormigón
  box(x1 - x0 + .1, .1, .03, M.blackPlastic, { z: z0 + .015, y: .05, parent: R });                          // rodapié negro

  // ---------- muro este ----------
  const ex = x1 + T / 2;
  box(T, h, z1 - z0 + .1, M.concrete, { x: ex, y: h / 2, parent: R });
  box(.06, h - .1, .04, M.concreteDark, { x: x1 - .03, y: h / 2, z: 0, parent: R });   // junta de encofrado
  // ---------- muro sur ----------
  box(x1 - x0 + .1, h, T, M.plasterWarm, { z: z1 + T / 2, y: h / 2, parent: R });

  // ---------- techo: viga, falso techo con focos, conductos ----------
  box(x1 - x0, .5, .45, M.concrete, { y: h - .25, z: .05, parent: R });                                     // viga de canto
  box(.95, .45, z1 - z0 - .1, M.plasterWarm, { x: x0 + .475, y: h - .225, parent: R });   // falso techo junto al ventanal
  R.userData.soffitY = h - .45;
  // focos empotrados (visibles)
  for (let i = 0; i < 5; i++) cyl(.055, .055, .02, M.bulbWarm, { parent: R, x: x0 + .55, y: h - .45 - .011, z: -4 + i * 2, seg: 16, cast: false, receive: false });
  // foco de carril negro (el cubo del rincón)
  const trk = group('track', -2.1, h, -.55, 0, R);
  box(.02, .02, 1.6, M.blackPlastic, { parent: trk, y: -.03 }).rotation.y = 0;
  box(.13, .13, .13, M.blackPlastic, { parent: trk, y: -.33, x: 0, z: .1 });
  cyl(.007, .007, .28, M.blackPlastic, { parent: trk, y: -.16, z: .1, seg: 6, wuv: false });
  const spotLens = cyl(.045, .045, .01, M.bulbWarm, { parent: trk, y: -.40, z: .1, seg: 16, cast: false });
  // conducto espiral (este) y bandeja de cables
  const duct = cyl(.21, .21, z1 - z0 - .1, M.duct, { parent: R, x: 2.45, y: h - .38, z: 0, seg: 28, wuv: false });
  duct.rotation.x = Math.PI / 2;
  scaleUV(duct.geometry, 1.32, z1 - z0);
  for (const z of [-3.6, -1.3, 1.0, 3.3]) { const b = cyl(.225, .225, .06, M.steelBrushed, { parent: R, x: 2.45, y: h - .38, z, seg: 28, wuv: false }); b.rotation.x = Math.PI / 2; box(.03, .3, .03, M.steelBrushed, { parent: R, x: 2.45, y: h - .18, z }); }
  // codo y salida del conducto contra el muro norte
  const elbow = cyl(.21, .21, .6, M.duct, { parent: R, x: 2.45, y: h - .38, z: z0 + .3, seg: 28, wuv: false });
  elbow.rotation.x = Math.PI / 2;
  // conducto negro corrido a lo largo de la viga (paralelo al ventanal), como en la referencia
  cyl(.035, .035, z1 - z0, M.blackPlastic, { parent: R, x: x0 + 1.05, y: h - .5, z: 0, seg: 12, wuv: false }).rotation.x = Math.PI / 2;
  for (const z of [-3.5, -1.5, .5, 2.5]) box(.03, .12, .03, M.blackPlastic, { parent: R, x: x0 + 1.05, y: h - .44, z });
  // zócalo del ladrillo (junta con el suelo) — baseboards oeste
  box(.03, .08, z1 - z0, M.blackPlastic, { x: x0 + .015, y: .04, parent: R });

  // ---------- luces de la habitación: correcciones de material según lado ----------
  return R;
}
