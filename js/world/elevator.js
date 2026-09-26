/* =========================================================
   ASCENSOR — cabina para la escena final (fundido en negro → los cuatro esperando a que baje una planta)
   Vive lejos de todo lo demás (ELEV) y solo se muestra cuando la historia llega ahí.
   Cabina: 1.9 m de ancho × 1.6 m de fondo × 2.4 m de alto, puertas en el lado +z (la gente mira hacia +z).
     · paredes de acero cepillado con juntas, espejo en el fondo, pasamanos, suelo de terrazo oscuro, panel LED en el techo
     · botonera con luz, indicador de planta sobre las puertas (número + flecha), puertas correderas
     · al otro lado de las puertas: rellano cálido (luz naranja de la pizzería de abajo) con el número de planta
   set(f): f∈[0,1] = progreso de la secuencia (puertas cerrándose, bajada, llegada y apertura) → estado visual
   ========================================================= */
import * as THREE from 'three';
import { posterTex, flyerTex, zineTex, cardTex } from './brand.js';

export const ELEV = { x: 0, y: 150, z: 0, W: 1.9, D: 1.6, H: 2.4 };
export const E = (x, y, z) => [ELEV.x + x, ELEV.y + y, ELEV.z + z];

const canvasTex = (w, h, draw, o = {}) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (o.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };

function brushedTex() {
  return canvasTex(256, 256, (g, W, H) => { g.fillStyle = '#8a8d92'; g.fillRect(0, 0, W, H); for (let i = 0; i < 1800; i++) { const x = Math.random() * W, l = 20 + Math.random() * 120, a = Math.random() * .12; g.fillStyle = Math.random() < .5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`; g.fillRect(x, Math.random() * H, 1, l); } }, { repeat: true });
}
function terrazzoTex() {
  return canvasTex(256, 256, (g, W, H) => { g.fillStyle = '#26282c'; g.fillRect(0, 0, W, H); const cols = ['#3d4046', '#575a61', '#1a1b1e', '#6b5b4a', '#8a8f96']; for (let i = 0; i < 420; i++) { g.fillStyle = cols[i % cols.length]; g.beginPath(); g.ellipse(Math.random() * W, Math.random() * H, 1 + Math.random() * 4, 1 + Math.random() * 3, Math.random() * 3, 0, 7); g.fill(); } }, { repeat: true });
}

export function buildElevator(F, q) {
  const G = new THREE.Group(); G.name = 'elevator'; G.position.set(ELEV.x, ELEV.y, ELEV.z); G.userData.noMerge = true; G.visible = false;
  const { W, D, H } = ELEV, env = F?.env || null;
  const brushed = brushedTex(); brushed.repeat.set(2, 1.2);
  const steel = new THREE.MeshStandardMaterial({ color: 0xb4c9bb, metalness: .93, roughness: .34, bumpMap: brushed, bumpScale: .55, envMap: env, envMapIntensity: .8 });
  const steelDark = new THREE.MeshStandardMaterial({ color: 0x5c6a62, metalness: .9, roughness: .45, envMap: env, envMapIntensity: .6 });
  const steelRail = new THREE.MeshStandardMaterial({ color: 0xc9d8cd, metalness: 1, roughness: .22, envMap: env, envMapIntensity: 1 });
  const tile = canvasTex(256, 256, (g, W2, H2) => { g.fillStyle = '#0f1c1a'; g.fillRect(0, 0, W2, H2); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const v = 34 + ((i * 7 + j * 13) % 5) * 5; g.fillStyle = `rgb(${v - 8},${v + 10},${v + 4})`; g.fillRect(i * 64 + 2, j * 64 + 2, 60, 60); } for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * .05})`; g.fillRect(Math.random() * W2, Math.random() * H2, 2, 2); } }, { repeat: true });
  tile.repeat.set(3, 3);
  const floorM = new THREE.MeshStandardMaterial({ map: tile, roughness: .3, metalness: .15, envMap: env, envMapIntensity: .5 });
  if (F?.tex) { const o = { size: 1 / 3 }; Object.assign(floorM, { map: F.tex('floor_tile_Diffuse.webp', o), normalMap: F.tex('floor_tile_nor_gl.webp', { ...o, srgb: false }), roughnessMap: F.tex('floor_tile_Rough.webp', { ...o, srgb: false }), roughness: 1 }); floorM.normalScale.set(1.4, 1.4); }   // gres horneado en Blender (tools/bake_textures.py): baldosas biseladas con junta hundida
  const ceilM = new THREE.MeshStandardMaterial({ color: 0xa9b5ad, roughness: .85 });
  const lightM = new THREE.MeshBasicMaterial({ color: 0xb9c4bb, toneMapped: false });
  const add = (geo, mat, x, y, z, cast = false) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = false; m.receiveShadow = false; m.userData.noMerge = true; G.add(m); return m; };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  // suelo, techo, paredes (acero cepillado en paneles, como en la referencia)
  add(B(W, .08, D), floorM, 0, -.04, 0); add(B(W, .08, D), ceilM, 0, H + .04, 0);
  add(B(.06, H, D), steel, -W / 2 - .03, H / 2, 0); add(B(.06, H, D), steel, W / 2 + .03, H / 2, 0);
  add(B(W, H, .06), steel, 0, H / 2, -D / 2 - .03);
  // póster luminoso de la pizzería (marquesina de ascensor) en la pared derecha + tablón con flyers en la izquierda
  { const glow = canvasTex(128, 128, (g, w2, h2) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.5, 'rgba(255,255,255,.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w2, h2); });
    const fm = new THREE.MeshStandardMaterial({ color: 0x1b1f1d, metalness: .8, roughness: .4 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(.05, 1.30, .90), fm); frame.position.set(W / 2 - .03, 1.52, .40); frame.userData.noMerge = true; G.add(frame);
    const art = new THREE.Mesh(new THREE.PlaneGeometry(.80, 1.20), new THREE.MeshBasicMaterial({ map: posterTex(), color: 0xf0ece2, toneMapped: false })); art.rotation.y = -Math.PI / 2; art.position.set(W / 2 - .057, 1.52, .40); art.userData.noMerge = true; G.add(art);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.9), new THREE.MeshBasicMaterial({ map: glow, color: 0xff6a3a, transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); halo.rotation.y = -Math.PI / 2; halo.position.set(W / 2 - .07, 1.52, .40); halo.userData.noMerge = true; G.add(halo);
    const cork = new THREE.Mesh(new THREE.BoxGeometry(.02, .42, .58), new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: .95 })); cork.position.set(-W / 2 + .012, 1.5, .28); cork.userData.noMerge = true; G.add(cork);
    for (const [tx, w2, h2, z, y, rz] of [[flyerTex(), .16, .23, .40, 1.52, .06], [zineTex(0), .13, .18, .20, 1.46, -.09], [cardTex(true), .10, .058, .30, 1.62, .04]]) { const n = new THREE.Mesh(new THREE.PlaneGeometry(w2, h2), new THREE.MeshBasicMaterial({ map: tx, color: 0xb8b2a6, toneMapped: false })); n.rotation.set(0, Math.PI / 2, rz); n.position.set(-W / 2 + .024, y, z); n.userData.noMerge = true; G.add(n); } }
  const seam = (w, h, d, x, y, z) => add(B(w, h, d), steelDark, x, y, z);
  for (const x of [-.32, .32]) seam(.012, H - .12, .012, x, H / 2 - .02, -D / 2 + .004);                        // fondo: tres paneles
  for (const sx of [-1, 1]) { seam(.012, H - .12, .012, sx * (W / 2 - .004), H / 2 - .02, .0); seam(.012, H - .12, .012, sx * (W / 2 - .004), H / 2 - .02, -.5); }
  const screw = new THREE.MeshStandardMaterial({ color: 0x2c332f, metalness: .8, roughness: .4 });
  for (const x of [-.32, .32, 0]) for (const y of [1.8, 1.15]) for (const dx of [-.06, .06]) if (x !== 0 || dx) add(new THREE.CylinderGeometry(.005, .005, .006, 8), screw, x + dx, y, -D / 2 + .004).rotation.x = Math.PI / 2;
  // zócalo y dos barandas planas a media altura en las tres paredes (la de arriba, ancha, hace de defensa)
  for (const [y, h, d] of [[.07, .14, .03], [.56, .07, .05], [.93, .11, .06]]) {
    for (const sx of [-1, 1]) add(B(d, h, D - .02), h > .1 ? steelRail : steelDark, sx * (W / 2 - d / 2), y, 0);
    add(B(W - .02 - d * 2, h, d), h > .1 ? steelRail : steelDark, 0, y, -D / 2 + d / 2);
  }
  // techo: gran panel fluorescente empotrado (marco oscuro) + halo verdoso que baña la pared de fondo
  add(B(1.55, .03, .9), steelDark, 0, H + .0, -.15); add(B(1.45, .02, .8), lightM, 0, H - .012, -.15);
  const halo = add(new THREE.PlaneGeometry(1.5, 1.2), new THREE.MeshBasicMaterial({ color: 0xdfffe4, transparent: true, opacity: .09, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), 0, H - .7, -D / 2 + .012);
  halo.userData.noMerge = true;
  const halo2 = add(new THREE.PlaneGeometry(1.7, .9), new THREE.MeshBasicMaterial({ color: 0xc8ffd6, transparent: true, opacity: .035, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), 0, H - .38, -D / 2 + .014);

  // pared frontal: marco de puertas, cabecero con indicador y botonera
  const doorW = 1.0, side = (W - doorW) / 2;
  for (const sx of [-1, 1]) add(B(side, H, .08), steel, sx * (doorW / 2 + side / 2), H / 2, D / 2);
  add(B(doorW, .34, .08), steel, 0, H - .17, D / 2);
  const panel = add(B(.14, .46, .02), steelDark, W / 2 - .13, 1.15, D / 2 - .05);
  for (let i = 0; i < 6; i++) add(new THREE.CylinderGeometry(.018, .018, .012, 16), new THREE.MeshStandardMaterial({ color: 0x33363b, emissive: i === 1 ? 0xffb35a : 0x000000, emissiveIntensity: i === 1 ? 2 : 0, metalness: .6, roughness: .3 }), W / 2 - .13, 1.31 - i * .065, D / 2 - .038).rotation.x = Math.PI / 2;
  // indicador de planta sobre las puertas
  const ind = document.createElement('canvas'); ind.width = 256; ind.height = 128; const ig = ind.getContext('2d'); const indTex = new THREE.CanvasTexture(ind); indTex.colorSpace = THREE.SRGBColorSpace;
  const drawInd = (floor, arrow, blink) => { ig.fillStyle = '#0a0606'; ig.fillRect(0, 0, 256, 128); ig.fillStyle = 'rgba(255,60,30,.14)'; ig.fillRect(6, 6, 244, 116);
    ig.font = "800 96px 'Arial Black',Impact,monospace"; ig.textAlign = 'center'; ig.textBaseline = 'middle'; ig.shadowColor = '#ff3a1a'; ig.shadowBlur = 18; ig.fillStyle = '#ff5533'; ig.fillText(String(floor), 150, 68);
    if (arrow) { ig.globalAlpha = blink ? .35 : 1; ig.beginPath(); ig.moveTo(52, 42); ig.lineTo(92, 42); ig.lineTo(72, 84); ig.closePath(); ig.fill(); ig.globalAlpha = 1; } ig.shadowBlur = 0; indTex.needsUpdate = true; };
  drawInd(4, false, false);
  const indM = add(new THREE.PlaneGeometry(.36, .18), new THREE.MeshBasicMaterial({ map: indTex, toneMapped: false }), 0, H - .17, D / 2 - .045); indM.rotation.y = Math.PI;
  const indGlow = add(new THREE.PlaneGeometry(.9, .5), new THREE.MeshBasicMaterial({ color: 0xff3a1a, transparent: true, opacity: .07, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), 0, H - .17, D / 2 - .06); indGlow.rotation.y = Math.PI;

  // puertas correderas (dos hojas)
  const doorL = add(B(doorW / 2, H - .34, .05), steel, -doorW / 4, (H - .34) / 2, D / 2 - .01), doorR = add(B(doorW / 2, H - .34, .05), steel, doorW / 4, (H - .34) / 2, D / 2 - .01);
  for (const d of [doorL, doorR]) { const s = new THREE.Mesh(B(.008, H - .5, .06), steelDark); s.position.set(d === doorL ? doorW / 4 - .01 : -doorW / 4 + .01, 0, 0); s.userData.noMerge = true; d.add(s); }

  // rellano al otro lado: pared cálida, suelo y cartel con el número de planta
  const glow = canvasTex(256, 256, (g, W2, H2) => { const gr = g.createLinearGradient(0, 0, 0, H2); gr.addColorStop(0, '#ff9d4a'); gr.addColorStop(1, '#c8552a'); g.fillStyle = gr; g.fillRect(0, 0, W2, H2); for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * .06})`; g.fillRect(Math.random() * W2, Math.random() * H2, 2, 30 + Math.random() * 60); } });
  const hall = new THREE.Group(); hall.name = 'hall'; G.add(hall);
  const wallH = new THREE.Mesh(new THREE.PlaneGeometry(4, H), new THREE.MeshBasicMaterial({ map: glow, toneMapped: false })); wallH.position.set(0, H / 2, D / 2 + 1.6); wallH.rotation.y = Math.PI; hall.add(wallH);
  const floorH = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.7), new THREE.MeshStandardMaterial({ map: tile, roughness: .4, emissive: 0x552208, emissiveIntensity: .6 })); floorH.rotation.x = -Math.PI / 2; floorH.position.set(0, 0, D / 2 + .8); hall.add(floorH);
  const sign = document.createElement('canvas'); sign.width = 256; sign.height = 128; const sg = sign.getContext('2d'); sg.fillStyle = '#2b1710'; sg.fillRect(0, 0, 256, 128); sg.fillStyle = '#ffe1b0'; sg.font = "800 92px 'Arial Black',Impact,sans-serif"; sg.textAlign = 'center'; sg.textBaseline = 'middle'; sg.fillText('3', 128, 68); const signTex = new THREE.CanvasTexture(sign); signTex.colorSpace = THREE.SRGBColorSpace;
  const signM = new THREE.Mesh(new THREE.PlaneGeometry(.5, .25), new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false })); signM.position.set(1.1, 1.75, D / 2 + 1.59); signM.rotation.y = Math.PI; hall.add(signM);
  const hallGlow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ color: 0xffa050, transparent: true, opacity: .0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); hallGlow.position.set(0, 1.2, D / 2 + .2); hallGlow.rotation.y = Math.PI; hall.add(hallGlow);

  // luces: cálida de techo + relleno de la luz del rellano cuando se abren las puertas
  const key = new THREE.PointLight(0xe6ffe8, q?.name === 'low' ? .8 : 1.5, 6.5, 2); key.position.set(0, H - .2, -.62); G.add(key);
  const back = new THREE.PointLight(0xfff0dc, q?.name === 'low' ? 1.4 : 2.4, 4.2, 2); back.position.set(0, 1.85, .42); G.add(back);      // relleno hacia el fondo, junto a las puertas: ilumina a los dos que quedan detrás
  const back2 = new THREE.PointLight(0xdff2ff, q?.name === 'low' ? 0 : 1.4, 3.6, 2); back2.position.set(.5, 1.5, .1); G.add(back2);
  const spill = new THREE.PointLight(0xff9a48, 0, 5, 2); spill.position.set(0, 1.3, D / 2 + .5); G.add(spill);

  let lastFloor = 4, lastArrow = false, lastBlink = false;
  const api = {
    group: G, key, spill, doorOpen: 1, floor: 4,
    /* f: 0..1 progreso de la secuencia. Puertas abiertas al inicio → se cierran → bajada (indicador 4 → 3) → llegada (ding) → puertas abiertas */
    set(f, t = 0) {
      const ss = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
      const open = 1 - ss(.12, .30, f) + ss(.78, .93, f) * (f > .5 ? 1 : 0), o = Math.min(1, Math.max(0, open)); this.doorOpen = o;
      doorL.position.x = -doorW / 4 - o * doorW * .48; doorR.position.x = doorW / 4 + o * doorW * .48;
      const moving = f > .42 && f < .76, floor = f < .68 ? 4 : 3, arrow = moving || (f > .38 && f < .8), blink = Math.floor(t * 2.2) % 2 === 0 && moving;
      if (floor !== lastFloor || arrow !== lastArrow || blink !== lastBlink) { drawInd(floor, arrow, blink); lastFloor = floor; lastArrow = arrow; lastBlink = blink; } this.floor = floor;
      hallGlow.material.opacity = o * .22; spill.intensity = o * 2.6; hall.visible = o > .02;
      indGlow.material.opacity = .05 + .03 * Math.sin(t * 3);
    },
  };
  api.set(0);
  return api;
}
