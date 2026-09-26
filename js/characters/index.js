/* Construye el reparto (humanos reales), sus comportamientos y el humo */
import * as THREE from 'three';
import { CAST } from './cast.js';
import { Actor } from './actor.js';
import { setupGamer, setupPhone, setupSmoker, setupArtist } from './behaviors.js';
import { Smoke } from '../fx/smoke.js';
import { L } from '../world/layout.js';
import { BodyColliders } from '../world/colliders.js';
import { dressActor } from './outfits.js';
import { preloadShoeModel } from './shoes.js';
import { CREASE } from './fabrics.js';
CREASE.value = 1;
const VP = new THREE.Matrix4(), FR = new THREE.Frustum(), S = new THREE.Sphere();

export async function buildCast(F, q, scene, world) {
  const keys = Object.keys(CAST);
  await preloadShoeModel();
  const list0 = await Promise.all(keys.map(k => Actor.create(CAST[k], F, q)));
  const actors = {};
  keys.forEach((k, i) => { const A = list0[i], spec = CAST[k]; A.place(spec.at.x, spec.at.z, spec.at.yaw); scene.add(A.root); actors[k] = A; dressActor(A, F); });
  const smoke = new Smoke(q.smoke); scene.add(smoke.points);
  // luz de relleno suave sobre cada cara (sin sombras): los ventanales las dejan a contraluz
  for (const A of Object.values(actors)) if (q.name === 'high') { const l = new THREE.PointLight(0xffe0c0, 2.6, 2.8, 2); l.position.set(0, 1.5, .95); A.root.add(l); A.fill = l; }
  // luces de contorno de color (magenta del neón/TV, cian de la ventana): separan a cada personaje del fondo y dan el toque cine
  if (q.name !== 'low') { const RIM = { gamer: 0xff3fa4, phone: 0x4fd6ff, smoker: 0xff5a8a, artist: 0x35e0c8 };
    for (const [k, A] of Object.entries(actors)) { const l = new THREE.PointLight(RIM[k], q.name === 'high' ? 1.05 : .75, 4.2, 2); l.position.set(k === 'gamer' || k === 'artist' ? .95 : -.95, 1.75, -1.35); A.root.add(l); A.rim = l; } }
  const M = world.M, C = world.colliders;
  actors.gamer.colliders = new BodyColliders(C, ['sofa', 'coffee', 'sideTable']);
  actors.phone.colliders = new BodyColliders(C, ['rocker', 'coffee']);
  actors.smoker.colliders = new BodyColliders(C, ['green', 'ashStool']);
  actors.artist.colliders = new BodyColliders(C, ['stool', 'desk']);
  actors.gamer.behavior = setupGamer(actors.gamer, world, scene, M);
  actors.phone.behavior = setupPhone(actors.phone, world, scene, M);
  actors.smoker.behavior = setupSmoker(actors.smoker, world, scene, M, smoke);
  actors.artist.behavior = setupArtist(actors.artist, world, scene, M);
  const env = { tv: world.tv, actors, graffiti: world.graffiti, rockerBody: world.rocker.userData.body, greenSeat: world.green.userData.seat, allowStand: true,
    screenCenter: new THREE.Vector3(L.tv.x, L.tv.y, L.tv.z + .1), pencilLevel: 0 };
  const list = Object.values(actors);
  // precalentamiento: los muelles arrancan ya en su sitio (nada "vuela" en el primer fotograma)
  for (const A of list) A.anat.warm = true;
  for (let i = 0; i < 90; i++) for (const A of list) A.update(i / 30, 1 / 30, env);
  for (const A of list) A.anat.timeJump(false);      // el calentamiento no es un fotograma visible: no se audita y la pose se recoloca sin inercia
  return {
    actors, list, smoke, env,
    /* Los personajes que no se ven (fuera del encuadre) o están lejos se actualizan a menor frecuencia acumulando el tiempo:
       el coste de IK + anatomía (1–2,6 ms cada uno) ya no se paga para los cuatro en cada fotograma. Cerca de la cámara siempre se actualizan. */
    update(t, dt, view) {
      env.p = view.p ?? 0; env.cam = view.cam; const cam = view.camera;
      if (cam) { cam.updateMatrixWorld(); VP.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse.copy(cam.matrixWorld).invert()); FR.setFromProjectionMatrix(VP); }
      for (const A of list) {
        A._acc = (A._acc || 0) + dt; let period = 1;
        if (cam) { S.center.copy(A.root.position); S.center.y += .9; S.radius = 1.6; const d = S.center.distanceTo(view.cam); if (d > 2.6) { const inView = FR.intersectsSphere(S); period = inView ? (d > 9 ? 3 : 1) : 4; } }
        A._skip = (A._skip || 0) + 1; if (A._skip >= period) { A._skip = 0; A.update(t, A._acc, env); A._acc = 0; }
      }
      smoke.update(dt, t, view.h, view.fov);
    },
  };
}
