/* =========================================================
   4B — punto de entrada
   Renderer → Materiales → Mundo → Cámara/Scroll → Bucle
   ========================================================= */
import * as THREE from 'three';
import { pickQuality, Governor } from './core/quality.js';
import { Post } from './core/post.js';
import { CameraRig } from './core/cameraRig.js';
import { ScrollTimeline, StoryClock } from './core/scroll.js';
import { Materials } from './world/materials.js';
import { buildWorld } from './world/index.js';
import { CAMERA_KEYS, TIMELINE } from './story/script.js';
import { Shots } from './story/shots.js';
import { ElevatorScene } from './story/elevatorScene.js';
import { buildCast } from './characters/index.js';
import { Dust } from './fx/dust.js';
import { Director, Subtitles } from './story/director.js';
import { AudioEngine } from './core/audio.js';
import { HUD } from './ui/hud.js';
import { AssetSlots } from './core/assetSlots.js';
import { CartaFlow } from './ui/carta.js';
import { brandFonts } from './world/brand.js';
import { BrandNav } from './ui/brandnav.js';

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';      // al recargar siempre se empieza desde el principio (fuera del edificio): el progreso virtual del scroll arranca en 0
const params = new URLSearchParams(location.search);
const q = pickQuality();
const $ = (s) => document.querySelector(s);
const canvas = $('#gl');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, alpha: false });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;      // las sombras se recalculan cada 3 fotogramas (no en todos): cuesta 3× menos y no se nota
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, .05, 700);
let dpr = Math.min(devicePixelRatio || 1, q.dpr);

const loaderEl = $('#loader'), barEl = $('#loaderBar'), txtEl = $('#loaderTxt');
const setLoad = (p, t) => { barEl.style.width = (p * 100).toFixed(0) + '%'; if (t) txtEl.textContent = t; };

async function boot() {
  const mgr = new THREE.LoadingManager();
  let done = 0, total = 0;
  const texReady = new Promise(res => { mgr.onLoad = res; });
  mgr.onProgress = (u, i, t) => { done = i; total = t; setLoad(.1 + .6 * (i / Math.max(t, 1))); };
  setLoad(.05, 'Cargando materiales');
  const F = new Materials(q, mgr);
  await F.loadEnv(renderer);
  const slots = await AssetSlots.probe();
  await brandFonts();                                   // fuentes de la marca (Da Mario) para los carteles dibujados en canvas
  const world = buildWorld(F, q, scene, { slots }); world.camera = camera;
  setLoad(.72, 'Vistiendo a los personajes');
  const cast = await buildCast(F, q, scene, world); world.cast = cast;
  await Promise.race([texReady, new Promise(r => setTimeout(r, 6000))]);
  setLoad(.85, 'Montando la cámara');

  const rig = new CameraRig(camera, CAMERA_KEYS, { parallax: q.name === 'high' ? 1 : .5 });
  const scroll = new ScrollTimeline($('#scrollspace'));
  const post = new Post(renderer, scene, camera, q);
  const audio = new AudioEngine(), hud = new HUD({ audio, scroll });
  const spotEl = $('#spot'), _sv = new THREE.Vector3(), SPOT_PTS = [[.3, -3.9], [.3, 3.9], [3.0, -3.9], [3.0, 3.9]], sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const clock0 = new StoryClock(TIMELINE), nudge = $('#nudge'); let lastMove = 0, lastP = 0;
  const director = new Director({ actors: cast.actors, subs: new Subtitles($('#sub')), audio, clock: clock0, rig });
  clock0.rig = rig; window.__clock = clock0; window.__audio = audio;
  const carta = new CartaFlow({ renderer, tl: TIMELINE });
  new BrandNav({ carta });                               // barra de Da Mario sobre el edificio: atajo directo a la web de la pizzería
  const elev = new ElevatorScene({ cast, scene, F, q, audio, rig, timeline: TIMELINE }); window.__elev = elev;
  const shots = new Shots(cast.actors, TIMELINE); rig.dyn = (p, out) => shots.sample(p, out);
  const dust = new Dust(q.dust); scene.add(dust.points);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; if (reduced) { rig.parallax = 0; q.motionBlur = false; }

  const resize = () => {
    renderer.setPixelRatio(dpr); renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    post.setSize(innerWidth, innerHeight, dpr);
  };
  resize(); addEventListener('resize', resize);
  /* Robustez de presentación: al volver a mostrarse la pestaña (o el panel) el lienzo WebGL puede quedarse en negro hasta que el compositor lo repinta;
     se fuerza el repintado y, si el navegador pierde el contexto GPU, se recupera solo. */
  { const cv = renderer.domElement, kick = () => { if (document.hidden) return; cv.style.visibility = 'hidden'; void cv.offsetHeight; cv.style.visibility = ''; resize(); };
    document.addEventListener('visibilitychange', kick); addEventListener('pageshow', kick); addEventListener('focus', kick);
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); }, false);
    cv.addEventListener('webglcontextrestored', () => { location.reload(); }, false); }
  addEventListener('pointermove', e => rig.setMouse(e.clientX / innerWidth * 2 - 1, e.clientY / innerHeight * 2 - 1), { passive: true });

  const gov = new Governor(q, (lv) => { dpr = Math.max(.75, dpr * .85); q.ssao = false; if (lv >= 2) post.bloom.enabled = false; if (lv >= 3) post.fx.enabled = false; resize(); });

  if (params.has('p')) { rig.p = +params.get('p'); rig.lock(+params.get('p')); }
  window.__S = { cast, THREE, scene, camera, renderer, rig, scroll, world, post, q, free: false, lock: (p) => { rig.p = p; rig.lock(p); },
    /* cámara libre para depurar: __S.cam([x,y,z],[x,y,z],fov) */
    cam: (pos, look, fov = 50, ap = 0) => { const S = window.__S; S.free = true; camera.position.set(...pos); camera.up.set(0, 1, 0); camera.lookAt(...look); camera.fov = fov; camera.updateProjectionMatrix(); rig.ap = ap; } };

  /* Precalentamiento: compila los materiales y sube geometrías/texturas de TODO el mundo (ascensor incluido) mientras se ve la pantalla de carga.
     Sin esto, la primera vez que se veía cada zona (p. ej. el ascensor: ~2,4 s) el navegador se paraba a compilar justo en pleno scroll. */
  setLoad(.9, 'Preparando materiales');
  { const elevG = scene.getObjectByName('elevator'), ev = elevG ? elevG.visible : false; if (elevG) elevG.visible = true;
    const culled = []; scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine) && o.frustumCulled) { o.frustumCulled = false; culled.push(o); } });
    try { await Promise.race([renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 8000))]); } catch (e) { /* sin compileAsync o tardó demasiado: se compilará al verlo */ }      // con tope de 8 s: nunca deja la carga colgada
    try { renderer.shadowMap.needsUpdate = true; renderer.render(scene, camera); } catch (e) { /* ignorar */ }
    culled.forEach((o) => { o.frustumCulled = true; }); if (elevG) elevG.visible = ev; renderer.shadowMap.needsUpdate = true; }
  setLoad(1, 'Listo');
  await new Promise(r => setTimeout(r, 250));
  loaderEl.classList.add('is-done');
  // modelos definitivos opcionales (si existen en assets/models): carga en segundo plano
  new AssetSlots(renderer, q).applyAll(scene, cast, slots).then(l => { if (l.length) console.info('[4B] modelos definitivos:', l.join(', ')); });

  // ---- mirada libre 360°: arrastrar con el ratón (o flechas) gira la cámara en cualquier dirección; doble clic / R recentra ----
  { const gl = renderer.domElement, hint = document.getElementById('lookhint'); let down = null, shown = false, seen = false;
    const skip = (e) => e.target.closest && e.target.closest('button,a,input,.next');
    addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' || e.button !== 0 || skip(e)) return; down = { x: e.clientX, y: e.clientY, moved: 0 }; });
    addEventListener('pointermove', (e) => { if (!down) return; const dx = e.clientX - down.x, dy = e.clientY - down.y; down.x = e.clientX; down.y = e.clientY; down.moved += Math.abs(dx) + Math.abs(dy); if (down.moved > 4) { gl.classList.add('is-look'); rig.lookDrag(dx, dy); if (hint) { hint.classList.remove('is-on'); seen = true; } } });
    const up = () => { down = null; gl.classList.remove('is-look'); };
    addEventListener('pointerup', up); addEventListener('pointercancel', up); addEventListener('blur', up);
    addEventListener('dblclick', (e) => { if (!skip(e)) rig.lookReset(); });
    addEventListener('keydown', (e) => { if (e.target && /input|textarea/i.test(e.target.tagName)) return; const k = e.key; if (k === 'ArrowLeft') rig.lookDrag(-26, 0); else if (k === 'ArrowRight') rig.lookDrag(26, 0); else if (k === 'ArrowUp' && e.shiftKey) rig.lookDrag(0, -20); else if (k === 'ArrowDown' && e.shiftKey) rig.lookDrag(0, 20); else if (k === 'r' || k === 'R') rig.lookReset(); });
    setTimeout(() => { if (hint && !seen) { hint.classList.add('is-on'); shown = true; setTimeout(() => hint.classList.remove('is-on'), 9000); } }, 6000);
  }
  const clock = new THREE.Clock(); let t = 0, shadowN = 0;
  const step = (dt, draw = true) => {
    t += dt;
    if ((shadowN++ % 3) === 0) renderer.shadowMap.needsUpdate = true;
    const pStory = clock0.update(dt, scroll.p, scroll.jump); if (Math.abs(scroll.p - lastP) > 1e-5) { lastP = scroll.p; lastMove = t; }
    if (!window.__S.free) rig.update(dt, pStory, t);
    /* inicio: arco de luz anclado a las ventanas del loft (donde están los protagonistas); el resto de la imagen y los bordes, más oscuros. Se apaga al entrar. */
    if (spotEl) {
      const on = pStory < .07 && !window.__S.free;
      if (on) {
        camera.updateMatrixWorld(); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, ok = true;
        for (const [yy, zz] of SPOT_PTS) { _sv.set(-3.668, yy, zz).project(camera); if (_sv.z > 1 || _sv.z < -1) { ok = false; break; } const px = (_sv.x * .5 + .5) * innerWidth, py = (-_sv.y * .5 + .5) * innerHeight; x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); }
        if (ok) { const st = spotEl.style; st.setProperty('--sx', ((x0 + x1) / 2).toFixed(0) + 'px'); st.setProperty('--sy', ((y0 + y1) / 2).toFixed(0) + 'px'); st.setProperty('--rx', Math.max(170, (x1 - x0) / 2 * 1.3).toFixed(0) + 'px'); st.setProperty('--ry', Math.max(120, (y1 - y0) / 2 * 1.9).toFixed(0) + 'px'); }
      }
      spotEl.style.setProperty('--o', (on ? 1 - sst(.0, .05, pStory) : 0).toFixed(3));
    }
    // aviso "sigue bajando": la historia ya te alcanzó, la frase terminó y llevas un rato sin mover el scroll
    if (nudge) { const show = !clock0.catching && pStory > TIMELINE.P0 - .005 && pStory < .999 && t - lastMove > 3.4 && (!director.active || t > director.active.end + .8); nudge.classList.toggle('is-on', show); }
    const fadeV = elev.update(rig.p, dt, t); carta.update(pStory, clock0.gate, elev.active);      // fundido orgánico + escena del ascensor
    world.update(t, dt);
    // el graffiti se construye con el scroll: del descubrimiento (.72) a "terminado" (.89)
    world.graffiti.set(Math.min(1, Math.max(0, (rig.p - TIMELINE.P0 - .06) / (TIMELINE.OUT0 - TIMELINE.P0 - .12))));
    director.update(t, rig.p);
    cast.update(t, dt, { h: innerHeight * dpr, fov: camera.fov, p: rig.p, cam: camera.position, camera });
    dust.update(t, innerHeight * dpr, camera.fov);
    hud.update(rig.p);
    audio.update(t, cast.env, camera, scroll.vel);
    post.fx.uniforms.uFocus.value = rig.focus;
    post.fx.uniforms.uAperture.value = q.dof ? rig.ap * .9 : 0;      // el fundido a negro no desenfoca la imagen
    { const sub = $('#sub'); if (sub) sub.style.opacity = fadeV > .01 ? Math.max(0, 1 - fadeV * 10) : ''; }      // el subtítulo se apaga en cuanto empieza el fundido
    post.grade.uniforms.uFade.value = fadeV; post.fx.enabled = q.dof || q.motionBlur || fadeV > .001;
    post.fx.uniforms.uRot.value.copy(rig.fxRot); post.fx.uniforms.uTrans.value.copy(rig.fxTrans);
    post.fx.uniforms.uMB.value = q.motionBlur ? .5 : 0;
    { const th = Math.tan(camera.fov * Math.PI / 360); post.fx.uniforms.uTan.value.set(th * camera.aspect, th); post.fx.uniforms.uAO.value = q.ssao && !window.__noAO ? .55 : 0; post.grade.uniforms.uSharp.value = window.__sharp ? 5.5 : 0; post.fx.enabled = post.fx.enabled || q.ssao; }
    post.grade.uniforms.uCut.value = reduced ? 0 : rig.cutPulse; rig.cutPulse = Math.max(0, rig.cutPulse - dt * 4.2);
    if (draw) { post.render(dt, t, camera); gov.tick(dt); }
  };
  const loop = () => step(Math.min(clock.getDelta(), 1 / 15));
  renderer.setAnimationLoop(loop); carta.bind({ loop, scroll, clock });      // la web de la pizzería puede devolver al ascensor: se reanuda este bucle

  /* ---- VALIDACIÓN AUTOMÁTICA de anatomía: recorre la historia fotograma a fotograma SIN dibujar y mide el estado final del esqueleto.
     __anatAudit({ from, to, seconds, dt })  → por personaje: violaciones (fotogramas), peor caso, e intervenciones del solver ---- */
  window.__anatAudit = (o = {}) => new Promise((resolve) => {
    const dtS = o.dt ?? 1 / 30, acts = Object.entries(cast.actors), sp = scroll.p;
    const speech = TIMELINE.beats.reduce((a, b) => a + b.dur + TIMELINE.GAP, 0);
    const from = o.from ?? 0, to = o.to ?? 1, seconds = o.seconds ?? speech * 1.06 + 22, n = Math.max(2, Math.round(seconds / dtS));
    for (const [, A] of acts) { A.anat.resetStats(); A.anat.audit = true; }
    scroll.jump = true;      // la auditoría dirige la historia por posición (no por gestos de scroll)
    let i = 0;
    const chunk = () => {
      for (const end = Math.min(n, i + 90); i < end; i++) {
        const u = i / (n - 1);
        scroll.p = u < .06 ? from + (TIMELINE.P0 - from) * (u / .06) : TIMELINE.P0 + (to - TIMELINE.P0) * ((u - .06) / .94);      // entrada rápida y luego el recorrido completo a ritmo de habla
        step(dtS, false);
        for (const [, A] of acts) for (const k in A.anat.lastViol) { const r = (A.anat.stats.pr ||= {})[k] ||= [9, -9]; r[0] = Math.min(r[0], +scroll.p.toFixed(3)); r[1] = Math.max(r[1], +scroll.p.toFixed(3)); }
      }
      if (i < n) return setTimeout(chunk, 0);
      const res = {}; for (const [k, A] of acts) { A.anat.audit = false; const S = A.anat.stats; res[k] = { frames: S.frames, violaciones: S.viol, peorCaso: Object.fromEntries(Object.entries(S.worst).map(([a, b]) => [a, +b.toFixed(2)])), intervenciones: S.fix, enTopeArticular: S.limit, rangoP: S.pr }; }
      scroll.jump = false; scroll.p = sp; window.__anatResult = res; resolve(res);
    };
    chunk();
  });
  window.__S.step = step;
}
boot().catch(e => { console.error(e); txtEl.textContent = 'Error: ' + e.message; });
