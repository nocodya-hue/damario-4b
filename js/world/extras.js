/* =========================================================
   EXTRAS — detalles de habitación (no venían en la referencia; están para dar vida y calidez al salón)
     · neón "4B" en el muro este, sobre el sillón verde (parpadeo eléctrico sutil)
     · guirnalda de bombillas cálidas a lo largo del muro este (titilan suavemente)
     · dos baldas flotantes con libros, cactus, planta colgante y una cámara instantánea
     · puf de terciopelo junto al ventanal
     · sobre la mesa de centro: vela con llama viva y taza humeante
     · caja de vinilos junto al sofá
   Lo que se anima lo hace por material (emisivo) o con planos ligeros; no hay luces nuevas (coste cero de sombras).
   ========================================================= */
import * as THREE from 'three';
import { box, rbox, cyl, sph, group, contact } from './geo.js';
import { canvasTex, seed } from './materials.js';
import { L } from './layout.js';
import { ROOM } from './room.js';
import { zineTex, flyerTex, cardTex } from './brand.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function glowTex(inner = 'rgba(255,255,255,.9)') {
  return canvasTex(128, 128, (g, W, H) => { const gr = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2); gr.addColorStop(0, inner); gr.addColorStop(.35, 'rgba(255,255,255,.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); });
}

/* neón: tipografía gruesa dibujada como tubo (trazo de color + núcleo blanco + resplandor) */
function neonTex(text, col) {
  return canvasTex(768, 384, (g, W, H) => {
    g.clearRect(0, 0, W, H); g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = "900 250px 'Arial Black',Impact,sans-serif"; g.lineJoin = 'round';
    g.shadowColor = col; g.shadowBlur = 46; g.strokeStyle = col; g.lineWidth = 16; g.strokeText(text, W / 2, H / 2 + 8);
    g.shadowBlur = 14; g.strokeStyle = col; g.lineWidth = 14; g.strokeText(text, W / 2, H / 2 + 8);
    g.shadowBlur = 0; g.strokeStyle = '#fff3ea'; g.lineWidth = 5; g.strokeText(text, W / 2, H / 2 + 8);
  });
}

export function buildExtras(M, q, dyn) {
  const G = new THREE.Group(); G.name = 'extras';
  const X1 = ROOM.x1, hi = q.name === 'low' ? 0 : 1;

  /* ---------- neón sobre el sillón verde ---------- */
  {
    const g = group('neon', X1 - .03, 2.38, L.greenChair.z - .1, -Math.PI / 2, G);
    const mat = new THREE.MeshBasicMaterial({ map: neonTex('4B', '#ff4f8b'), transparent: true, toneMapped: false, depthWrite: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, .55), mat); m.userData.noMerge = true; m.renderOrder = 2; g.add(m);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6), new THREE.MeshBasicMaterial({ map: glowTex(), color: 0xff3a7a, transparent: true, opacity: .34, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    halo.position.z = -.012; halo.userData.noMerge = true; halo.renderOrder = 1; g.add(halo);
    // cable y anclajes
    box(.02, .02, .02, M.blackMetal, { parent: g, x: -.5, y: -.27, z: .01 }); box(.02, .02, .02, M.blackMetal, { parent: g, x: .5, y: -.27, z: .01 });
    dyn.push((t, dt, cam) => { const f = .93 + .07 * Math.sin(t * 9) * Math.sin(t * 2.3) - (Math.sin(t * .37) > .985 ? .35 : 0), k = cam ? Math.min(1, Math.max(0, (cam.position.x + 4.8) / 1.4)) : 1;   // k: se apaga mientras la cámara está fuera del edificio (no se ve un «4B» a través de la ventana)
      mat.opacity = Math.max(.35, f) * k; halo.material.opacity = (.3 * f + .05) * k; });
  }

  /* ---------- guirnalda de bombillas ---------- */
  {
    const z0 = -3.9, z1 = 1.25, y = 2.98, drop = .32, n = q.name === 'low' ? 12 : 22;
    const pts = []; for (let i = 0; i <= 40; i++) { const u = i / 40; pts.push(V3(X1 - .06, y - drop * 4 * u * (1 - u), z0 + (z1 - z0) * u)); }
    const curve = new THREE.CatmullRomCurve3(pts);
    const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 60, .0028, 5), M.cable); wire.castShadow = false; G.add(wire);
    const bulbM = new THREE.MeshBasicMaterial({ color: 0xffd394, toneMapped: false }), glowM = new THREE.MeshBasicMaterial({ map: glowTex(), color: 0xffb35a, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const bg = new THREE.SphereGeometry(.019, 10, 8), cap = new THREE.CylinderGeometry(.008, .011, .018, 8), pg = new THREE.PlaneGeometry(.2, .2);
    const glows = [];
    for (let i = 0; i < n; i++) {
      const u = (i + .5) / n, p = curve.getPoint(u), b = new THREE.Mesh(bg, bulbM); b.position.copy(p).add(V3(-.002, -.03, 0)); G.add(b);
      const c = new THREE.Mesh(cap, M.blackMetal); c.position.copy(p).add(V3(0, -.012, 0)); G.add(c);
      if (hi) { const s = new THREE.Mesh(pg, glowM.clone()); s.position.copy(b.position).add(V3(-.02, 0, 0)); s.rotation.y = -Math.PI / 2; s.userData.noMerge = true; s.userData.ph = i * 1.7; s.renderOrder = 2; G.add(s); glows.push(s); }
    }
    dyn.push((t) => { for (const s of glows) s.material.opacity = .42 + .16 * Math.sin(t * 1.3 + s.userData.ph) + .05 * Math.sin(t * 3.1 + s.userData.ph * 2); });
  }

  /* ---------- baldas flotantes con objetos ---------- */
  {
    const shelfZ = -2.2, rr = seed(23), cols = ['#2f9e5f', '#ff7ab0', '#efe4d0', '#141010', '#ff4a2b', '#3a5fc4', '#f3c15a'];
    for (const [y, len] of [[1.55, 1.15], [2.05, .9]]) {
      const s = group('wallShelf', X1 - .11, y, shelfZ, 0, G);
      box(.22, .035, len, M.walnut, { parent: s });
      box(.05, .04, .04, M.blackMetal, { parent: s, x: .08, y: -.035, z: -len * .35 }); box(.05, .04, .04, M.blackMetal, { parent: s, x: .08, y: -.035, z: len * .35 });
      // libros apilados y de pie
      let zz = -len / 2 + .07;
      for (let i = 0; i < (y < 1.8 ? 7 : 4); i++) { const c = cols[Math.floor(rr() * cols.length)], th = .022 + rr() * .02, h = .17 + rr() * .07; box(.15, h, th, new THREE.MeshStandardMaterial({ color: c, roughness: .8 }), { parent: s, x: 0, y: .0175 + h / 2, z: zz + th / 2 }); zz += th + .003; }
      if (y < 1.8) {                                                    // pila horizontal + cactus
        for (let i = 0; i < 3; i++) box(.17 - i * .012, .03, .21 - i * .01, new THREE.MeshStandardMaterial({ color: cols[i + 1], roughness: .8 }), { parent: s, x: 0, y: .0175 + .015 + i * .031, z: len * .12, ry: (i - 1) * .1 });
        const px = 0, pz = len * .36; cyl(.045, .035, .06, M.terracotta, { parent: s, x: px, y: .0175 + .03, z: pz, seg: 14 }); cyl(.03, .03, .012, M.soil, { parent: s, x: px, y: .0175 + .062, z: pz, seg: 12 });
        const cm = new THREE.MeshStandardMaterial({ color: 0x3f8a4a, roughness: .7 }); sph(.032, cm, { parent: s, x: px, y: .0175 + .11, z: pz, sy: 1.8, w: 14, h: 10 }); sph(.017, cm, { parent: s, x: px + .03, y: .0175 + .105, z: pz, sy: 1.5 }); sph(.014, cm, { parent: s, x: px - .028, y: .0175 + .12, z: pz, sy: 1.6 });
      } else {                                                          // cámara instantánea y vela
        const cx = 0, cz = len * .18; rbox(.11, .085, .06, .012, new THREE.MeshStandardMaterial({ color: 0xefe6d4, roughness: .5 }), { parent: s, x: cx, y: .0175 + .043, z: cz, ry: .3 });
        cyl(.024, .024, .03, M.blackPlastic, { parent: s, x: cx + .0, y: .0175 + .05, z: cz + .04, seg: 14 }).rotation.x = Math.PI / 2;
        box(.08, .012, .05, new THREE.MeshStandardMaterial({ color: 0xff4a2b, roughness: .6 }), { parent: s, x: cx, y: .0175 + .088, z: cz, ry: .3 });
      }
    }
    // planta colgante de la balda alta
    { const hp = group('hangPlant', X1 - .26, 2.5, shelfZ - .5, 0, G);
      cyl(.006, .006, .5, M.blackMetal, { parent: hp, y: .24, seg: 5 }); cyl(.075, .05, .09, M.terracotta, { parent: hp, seg: 14 });
      const lm = new THREE.MeshStandardMaterial({ color: 0x3e8f4b, roughness: .65, side: THREE.DoubleSide });
      for (let i = 0; i < 16; i++) { const a = i / 16 * 6.28, l = .12 + rr() * .3, m = new THREE.Mesh(new THREE.PlaneGeometry(.05, .085), lm); m.position.set(Math.cos(a) * .06, .04 - l * (.4 + rr() * .6), Math.sin(a) * .06); m.rotation.set(.3 * Math.cos(a), a, .1); hp.add(m); const st = cyl(.0025, .0025, l * .9, new THREE.MeshStandardMaterial({ color: 0x2f6f3a }), { parent: hp, x: Math.cos(a) * .045, y: .04 - l * .45, z: Math.sin(a) * .045, seg: 4 }); st.rotation.set(.1 * Math.sin(a), 0, .1 * Math.cos(a)); }
    }
  }

  /* ---------- puf junto al ventanal oeste ---------- */
  {
    const g = group('beanbag', ROOM.x0 + .95, 0, 1.0, .6, G);
    const bm = M.velvetPink; const b = sph(.5, bm, { parent: g, y: .27, sx: 1, sy: .58, sz: 1, w: 36, h: 24 }); b.userData.col = null;
    sph(.34, bm, { parent: g, y: .5, x: -.06, sx: 1, sy: .55, sz: 1, w: 28, h: 18 });
    box(.18, .012, .02, M.blackMetal, { parent: g, y: .53, x: .18, z: .0 });
    contact(1.3, 1.3, .5, { parent: g });
  }

  /* ---------- mesa de centro: vela + taza con vapor ---------- */
  {
    const tz = L.coffee.z, tx = L.coffee.x, top = L.coffee.h;
    const cg = group('candle', tx + .32, top, tz + .12, 0, G);
    cyl(.045, .045, .075, new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: .3, transparent: true, opacity: .75 }), { parent: cg, y: .0375, seg: 20 });
    cyl(.038, .038, .05, M.candle ?? M.cream, { parent: cg, y: .028, seg: 20 });
    cyl(.0016, .0016, .014, M.blackMetal, { parent: cg, y: .085, seg: 4 });
    const flameM = new THREE.MeshBasicMaterial({ color: 0xffc36a, toneMapped: false, transparent: true, opacity: .95 });
    const flame = new THREE.Mesh(new THREE.SphereGeometry(.011, 10, 8), flameM); flame.scale.set(.7, 1.9, .7); flame.position.y = .1; flame.userData.noMerge = true; cg.add(flame);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(.35, .35), new THREE.MeshBasicMaterial({ map: glowTex(), color: 0xff9a3a, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    halo.position.y = .11; halo.userData.noMerge = true; halo.renderOrder = 2; cg.add(halo);
    dyn.push((t, dt, cam) => { const f = 1 + .12 * Math.sin(t * 13) + .08 * Math.sin(t * 27 + 1); flame.scale.set(.7 * (1 - (f - 1) * .5), 1.9 * f, .7); flame.position.x = Math.sin(t * 5) * .0012; halo.material.opacity = .42 + .12 * (f - 1) * 4; if (cam) halo.quaternion.copy(cam.quaternion); });
    // taza
    const mg = group('mug', tx - .35, top, tz - .1, .5, G);
    cyl(.042, .038, .09, new THREE.MeshStandardMaterial({ color: 0xff7a3a, roughness: .35 }), { parent: mg, y: .045, seg: 20 });
    cyl(.036, .036, .004, new THREE.MeshStandardMaterial({ color: 0x2a140a, roughness: .2 }), { parent: mg, y: .088, seg: 20 });
    const hnd = new THREE.Mesh(new THREE.TorusGeometry(.024, .006, 8, 14, Math.PI * 1.2), new THREE.MeshStandardMaterial({ color: 0xff7a3a, roughness: .35 })); hnd.position.set(.05, .05, 0); hnd.rotation.z = -Math.PI * .6; mg.add(hnd);
    if (hi) {
      const sm = new THREE.MeshBasicMaterial({ map: glowTex('rgba(255,255,255,.5)'), transparent: true, opacity: .0, depthWrite: false, toneMapped: false, color: 0xfff1e6 }), steam = [];
      for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.PlaneGeometry(.09, .09), sm.clone()); s.userData.noMerge = true; s.userData.ph = i / 4; s.renderOrder = 3; mg.add(s); steam.push(s); }
      dyn.push((t, dt, cam) => { for (const s of steam) { const u = (t * .22 + s.userData.ph) % 1; s.position.set(Math.sin(u * 6 + s.userData.ph * 9) * .012, .1 + u * .22, Math.cos(u * 5) * .01); s.scale.setScalar(.6 + u * 1.8); s.material.opacity = Math.sin(u * Math.PI) * .28; if (cam) s.quaternion.copy(cam.quaternion); } });
    }
  }

  /* ---------- mesa de centro: fanzines «4B», el flyer de una pizzería que nadie ha mirado y tarjetas (mockups de papelería) ---------- */
  {
    const tz = L.coffee.z, tx = L.coffee.x, top = L.coffee.h;
    const paper = (map, r = .85) => new THREE.MeshStandardMaterial({ map, roughness: r, envMapIntensity: .25 });
    const sideM = new THREE.MeshStandardMaterial({ color: 0xece2cc, roughness: .9 });
    const slab = (w, h, d, topMap, x, y, z, ry) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [sideM, sideM, paper(topMap), sideM, sideM, sideM]); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; G.add(m); return m; };
    slab(.20, .012, .27, zineTex(0), tx + .02, top + .006, tz + .17, .32); slab(.19, .010, .26, zineTex(1), tx + .015, top + .017, tz + .172, .05);       // dos fanzines apilados
    slab(.16, .0012, .226, flyerTex(), tx - .02, top + .0008, tz - .17, -.42);                                                                                 // flyer de la carta suelto
    slab(.085, .0008, .05, cardTex(false), tx - .20, top + .0006, tz + .16, .8); slab(.085, .0008, .05, cardTex(true), tx - .19, top + .0016, tz + .155, .55);   // tarjetas
  }

  /* ---------- caja de vinilos junto al sofá ---------- */
  {
    const g = group('crate', L.sideTable.x + .55, 0, L.sideTable.z + .15, -.35, G);
    const w = M.walnutDark ?? M.walnut;
    box(.42, .03, .34, w, { parent: g, y: .015 }); box(.42, .3, .02, w, { parent: g, y: .17, z: .16 }); box(.42, .3, .02, w, { parent: g, y: .17, z: -.16 }); box(.02, .3, .34, w, { parent: g, y: .17, x: .2 }); box(.02, .3, .34, w, { parent: g, y: .17, x: -.2 });
    const r = seed(31), cs = ['#ff4a2b', '#efe4d0', '#2f9e5f', '#141010', '#ff7ab0', '#3a5fc4', '#f3c15a'];
    for (let i = 0; i < 12; i++) box(.3, .3, .006, new THREE.MeshStandardMaterial({ color: cs[Math.floor(r() * cs.length)], roughness: .8 }), { parent: g, y: .21, x: 0, z: -.145 + i * .026, rx: .0, ry: 1.5708 + (i > 9 ? .0 : 0), rz: -.06 * (i > 8 ? 1 : 0) });
    contact(.7, .6, .45, { parent: g });
  }
  /* ---------- rayos de luz solar entrando por los ventanales (planos aditivos cruzados, con polvo en suspensión ya existente) ---------- */
  if (hi) {
    const tex = canvasTex(64, 256, (g, W, H) => { const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      const v = g.createLinearGradient(0, 0, 0, H); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(.12, 'rgba(0,0,0,.0)'); v.addColorStop(.75, 'rgba(0,0,0,.55)'); v.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = v; g.fillRect(0, 0, W, H); });
    const dir = V3(.62, -.55, .32).normalize(), mat = new THREE.MeshBasicMaterial({ map: tex, color: 0xffd9a0, transparent: true, opacity: .03, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const r = seed(77), sg = new THREE.Group(); sg.name = 'shafts'; sg.userData.noMerge = true;
    for (const zc of [L.windowA.z, L.windowB.z]) for (let i = 0; i < 4; i++) {
      const len = 5.5 + r() * 2.5, w = .35 + r() * .5, y0 = 1.0 + r() * 1.9, z0 = zc + (r() - .5) * 2.6;
      for (const rot of [0, Math.PI / 2]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), mat); m.userData.noMerge = true; m.renderOrder = 4;
        const c = V3(ROOM.x0 + .1, y0, z0).addScaledVector(dir, len / 2); m.position.copy(c);
        const up = dir.clone().negate(), side = V3(0, 0, 1).cross(up).normalize(); if (side.lengthSq() < .01) side.set(1, 0, 0);
        const nrm = V3().crossVectors(side, up).normalize(); if (rot) nrm.crossVectors(nrm, up).normalize();
        m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V3().crossVectors(up, nrm).normalize(), up, nrm)); sg.add(m); }
    }
    G.add(sg);
    dyn.push((t) => { mat.opacity = .026 + .008 * Math.sin(t * .35) + .005 * Math.sin(t * .9 + 2); });      // los rayos "respiran" con las nubes
  }

  return G;
}
