/* =========================================================
   LÁMPARAS — cada una es una fuente de luz visible (bombilla emisiva + PointLight en lighting.js)
   ========================================================= */
import * as THREE from 'three';
import { box, cyl, sph, group, contact } from './geo.js';
import { L } from './layout.js';
import { ROOM } from './room.js';

const lathe = (pts, seg = 40) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const mesh = (geo, mat, parent, o = {}) => { const m = new THREE.Mesh(geo, mat); m.castShadow = o.cast !== false; m.receiveShadow = o.receive !== false; if (o.x || o.y || o.z) m.position.set(o.x || 0, o.y || 0, o.z || 0); if (parent) parent.add(m); return m; };

/* lámpara de pie de la referencia: base en el suelo, dos varillas finas hasta un aro y el orbe rojo brillante colgando en medio */
export function buildPendant(M) {
  const g = group('pendant', L.pendant.x, 0, L.pendant.z);
  const y = L.pendant.y, top = 2.55;
  cyl(.15, .16, .025, M.chrome, { parent: g, y: .0125, seg: 32 });
  for (const s of [-1, 1]) { cyl(.006, .006, top, M.chrome, { parent: g, x: s * .05, y: top / 2, seg: 6, wuv: false, cast: false }); }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.05, .006, 6, 20), M.chrome); ring.position.y = top; ring.rotation.x = Math.PI / 2; g.add(ring);
  // orbe rojo brillante, con las varillas abrazándolo (pequeño lazo alrededor)
  const orb = sph(.22, M.redGloss, { parent: g, y, w: 40, h: 28 });
  sph(.19, M.bulbRed, { parent: g, y, w: 24, h: 16, cast: false, receive: false });
  const loop = new THREE.Mesh(new THREE.TorusGeometry(.225, .006, 6, 36), M.chrome); loop.position.y = y; g.add(loop);
  const hang = new THREE.Mesh(new THREE.TorusGeometry(.225, .006, 6, 36), M.chrome); hang.position.y = y; hang.rotation.y = Math.PI / 2; g.add(hang);
  g.userData.dynamic = 'pendant'; g.userData.orb = orb;
  return g;
}

/* lámpara de pie de dos globos opalinos apilados */
export function buildTwinLamp(M) {
  const g = group('twinLamp', L.twinLamp.x, 0, L.twinLamp.z);
  cyl(.16, .17, .025, M.chrome, { parent: g, y: .0125, seg: 32 });
  cyl(.014, .014, 1.3, M.chrome, { parent: g, y: .66, seg: 10, wuv: false });
  for (const y of [.62, 1.02]) { sph(.17, M.opal, { parent: g, y, cast: false }); cyl(.05, .05, .02, M.chrome, { parent: g, y: y - .16, seg: 16 }); }
  contact(.7, .7, .45, { parent: g });
  return g;
}

/* lámpara de pie "seta" roja */
export function buildMushroomLamp(M) {
  const g = group('mushroomLamp', L.mushroomLamp.x, 0, L.mushroomLamp.z);
  cyl(.14, .15, .03, M.blackMetal, { parent: g, y: .015, seg: 28 });
  cyl(.011, .011, 1.42, M.lacquerRed, { parent: g, y: .74, seg: 10, wuv: false });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(.26, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), M.lacquerRed); dome.position.y = 1.44; dome.scale.y = .7; dome.castShadow = true; dome.material.side = THREE.DoubleSide; g.add(dome);
  const bulb = sph(.07, M.bulbRed, { parent: g, y: 1.45, cast: false });
  contact(.6, .6, .4, { parent: g });
  return g;
}

/* mesita cilíndrica naranja de anillos + lámpara plisada */
export function buildPleatedTable(M) {
  const g = group('sideTable', L.sideTable.x, 0, L.sideTable.z);
  const { r, h } = L.sideTable, n = 5, ph = h / n;
  for (let i = 0; i < n; i++) cyl(r, r, ph - .012, M.lacquerOrange, { parent: g, y: ph * (i + .5), seg: 40, col: 'sideTable' });
  cyl(r + .004, r + .004, .02, M.lacquerOrange, { parent: g, y: h + .008, seg: 40 });
  // pie cerámico + pantalla plisada tipo champiñón
  mesh(lathe([[.001, 0], [.045, .01], [.055, .08], [.03, .16], [.001, .17]], 20), M.ceramicWhite, g, { y: h + .018 });
  const pts = []; for (let i = 0; i <= 30; i++) { const t = i / 30, pl = 1 + .05 * Math.sin(i * 3.4 + 1) * 0; pts.push([.06 + t * .12, t * .2]); }
  const shadeGeo = new THREE.LatheGeometry([[.0, .0], [.06, .0], [.12, .06], [.16, .16], [.17, .2]].map(([a, b]) => new THREE.Vector2(a, b)), 48);
  // plisado: modula el radio por ángulo
  const p = shadeGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 + .045 * Math.cos(a * 24); p.setX(i, x * k); p.setZ(i, z * k); } shadeGeo.computeVertexNormals();
  const shade = mesh(shadeGeo, new THREE.MeshStandardMaterial({ color: 0xfff0d6, emissive: 0xffc98a, emissiveIntensity: 1.3, roughness: .9, side: THREE.DoubleSide }), g, { y: h + .16 });
  sph(.03, M.bulbWarm, { parent: g, y: h + .2, cast: false });
  contact(.8, .8, .5, { parent: g });
  return g;
}

/* lámpara de mesa de latón */
export function buildBrassLamp(M) {
  const g = group('brassLamp', L.brassLamp.x, L.brassLamp.y, L.brassLamp.z);
  cyl(.06, .07, .015, M.brass, { parent: g, y: .0075, seg: 24 });
  cyl(.008, .008, .2, M.brass, { parent: g, y: .11, seg: 8, wuv: false });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(.12, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), M.brass); dome.position.y = .3; dome.castShadow = true; dome.material.side = THREE.DoubleSide; g.add(dome);
  sph(.03, M.bulbWarm, { parent: g, y: .3, cast: false });
  return g;
}

/* flexo articulado del escritorio del grafitero */
export function buildDeskLamp(M) {
  const g = group('deskLamp', L.deskLamp.x, L.desk.h, L.deskLamp.z);
  cyl(.08, .09, .02, M.blackMetal, { parent: g, y: .01, seg: 24 });
  const pts = [[0, 0, 0], [0, .35, 0], [-.05, .55, 0], [-.22, .62, .0]].map(a => new THREE.Vector3(...a));
  const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, .01, 8), M.blackMetal); tube.castShadow = true; g.add(tube);
  const head = group('head', -.22, .62, 0, 0, g);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(.08, .12, 24, 1, true), M.blackMetal); cone.material = M.blackMetal.clone(); cone.material.side = THREE.DoubleSide; cone.rotation.z = Math.PI / 2 * .0; cone.rotation.x = Math.PI; cone.position.y = -.02; cone.castShadow = true; head.add(cone);
  sph(.035, M.bulbWarm, { parent: head, y: -.06, cast: false });
  head.rotation.z = .35;
  return g;
}
