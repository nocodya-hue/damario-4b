/* Ensambla el mundo estático + sus animaciones ambientales */
import * as THREE from 'three';
import { buildMats } from './mats.js';
import { buildRoom } from './room.js';
import { buildSky, buildCity } from './city.js';
import { Lighting } from './lighting.js';
import { TVScreen } from './tv.js';
import { L } from './layout.js';
import { ROOM } from './room.js';
import * as FUR from './furniture.js';
import * as LAMP from './lamps.js';
import * as DEC from './decor.js';
import * as PROP from './props.js';
import { Graffiti } from '../fx/graffiti.js';
import { bake } from './bake.js';
import { collectColliders } from './colliders.js';
import { buildExtras } from './extras.js';
import { buildFacade, SWAY } from './facade.js';

export function buildWorld(F, q, scene, opts = {}) {
  const M = buildMats(F);
  const world = { M, dyn: [] };
  scene.background = new THREE.Color(0xa8c4e8);
  const sky = buildSky(); scene.add(sky);
  const city = buildCity(q); scene.add(city);
  const facade = buildFacade(q); scene.add(facade);
  const tv = new TVScreen(q);
  const graffiti = new Graffiti(q);
  const room = new THREE.Group(); room.name = 'interior';
  const add = (o) => { room.add(o); return o; };

  add(buildRoom(M, q));
  const sofa = add(FUR.buildSofa(M));
  const rocker = add(FUR.buildRocker(M));
  const green = add(FUR.buildGreenChair(M));
  add(FUR.buildCoffeeTable(M));
  const unit = add(FUR.buildTvUnit(M, tv.mat));
  add(LAMP.buildTwinLamp(M)); add(LAMP.buildMushroomLamp(M)); add(LAMP.buildPleatedTable(M)); add(LAMP.buildBrassLamp(M)); add(LAMP.buildDeskLamp(M));
  const pendant = add(LAMP.buildPendant(M));
  add(DEC.buildRug(M));
  add(DEC.buildPlant(M, { x: L.monstera.x, z: L.monstera.z, kind: 'monstera', count: q.name === 'low' ? 9 : 15, scale: 1.25, potR: .3, seedN: 5 }));
  add(DEC.buildPlant(M, { x: L.plant2.x, z: L.plant2.z, kind: 'rubber', count: q.name === 'low' ? 7 : 11, scale: .95, potR: .2, seedN: 11 }));
  const gallery = add(DEC.buildGallery(M));
  add(DEC.buildMural(M)); add(DEC.buildShelf(M)); add(DEC.buildSkate(M));
  add(DEC.buildCurtain(M, ROOM.z0 + 1.0, q)); add(DEC.buildCurtain(M, ROOM.z1 - .95, q));
  add(buildExtras(M, q, world.dyn));
  const desk = add(PROP.buildDesk(M, graffiti.mat));
  const clutter = add(PROP.buildClutter(M));
  // ON AIR
  { const g = new THREE.Group(); g.position.set(L.onAir.x, L.onAir.y, L.onAir.z);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(.34, .1, .06), [M.blackPlastic, M.blackPlastic, M.blackPlastic, M.blackPlastic, new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: DEC_ON_AIR(), emissiveIntensity: 2.2 }), M.blackPlastic]);
    sign.position.y = .05; sign.castShadow = true; g.add(sign); room.add(g); }
  for (const [n, o] of [['sofa', sofa], ['rocker', rocker], ['green', green], ['tvUnit', unit], ['desk', desk]]) if (opts.slots?.has(n)) o.userData.noMerge = true;   // hay .glb definitivo: no se fusiona
  world.colliders = collectColliders(room);          // cajas de colisión (antes de fusionar la geometría)
  const saved = bake(room); world.bakedSaved = saved;
  scene.add(room);
  world.room = room; world.sky = sky; world.city = city; world.tv = tv; world.graffiti = graffiti; world.unit = unit; world.desk = desk; world.sofa = sofa; world.rocker = rocker; world.green = green; world.clutter = clutter;

  world.lighting = new Lighting(scene, q);
  const clock = gallery.userData.clock, leaf = room.children[0].userData.leaf;
  const gc = green.userData.seat, rb = rocker.userData.body;
  world.update = (t, dt) => {
    DEC.WIND.value = t;
    sky.material.uniforms.uTime.value = t; facade.userData.mat.uniforms.uTime.value = t; SWAY.value = t; facade.userData.update?.(t);
    tv.update(dt, t);
    world.lighting.update(t, tv.color, tv.lum);
    if (leaf) leaf.rotation.y = -105 * Math.PI / 180 + Math.sin(t * .55) * .045 + Math.sin(t * 1.3) * .012;
    if (clock) { const d = new Date(); const s = d.getSeconds() + d.getMilliseconds() / 1000, m = d.getMinutes() + s / 60, h = d.getHours() % 12 + m / 60; const [hh, mh, sh] = clock.userData.hands; hh.rotation.z = -h / 12 * Math.PI * 2; mh.rotation.z = -m / 60 * Math.PI * 2; sh.rotation.z = -Math.floor(s) / 60 * Math.PI * 2; }
    pendant.rotation.z = Math.sin(t * .7) * .006; pendant.rotation.x = Math.cos(t * .55) * .004;
    for (const f of world.dyn) f(t, dt, world.camera);
  };
  return world;
}

function DEC_ON_AIR() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 80; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 80); g.fillStyle = '#ff2a1a'; g.font = "800 58px 'Bricolage Grotesque',Arial Black,sans-serif"; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ON AIR', 128, 44);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
