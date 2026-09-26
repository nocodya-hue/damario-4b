/* =========================================================
   ASSET SLOTS — huecos para sustituir lo procedural por modelos definitivos
   Todo lo que hoy se genera por código tiene aquí un "slot" con la ruta donde dejar
   el .glb final. Si el archivo existe, se carga en segundo plano (Draco + KTX2, cuando
   procede) y sustituye a la pieza procedural, respetando su posición: la continuidad
   de la escena no cambia. Si no existe, no pasa nada.

   Muebles/objetos: el .glb se coloca en el mismo origen (suelo, centro de la pieza, frente +Z).
   Personajes: el .glb debe traer un esqueleto con los huesos del rig (hips, spine, chest, neck,
   head, uArmL, lArmL, uArmR, lArmR, thighL, shinL, thighR, shinR); el actor conserva IK,
   mirada y comportamientos y solo cambia la malla (ver Actor.swapBody).
   ========================================================= */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

export const SLOTS = {
  sofa:   { url: 'assets/models/furniture/sofa.glb',       find: 'sofa' },
  rocker: { url: 'assets/models/furniture/rocker.glb',     find: 'rocker' },
  green:  { url: 'assets/models/furniture/green-chair.glb', find: 'greenChair' },
  tvUnit: { url: 'assets/models/furniture/tv-unit.glb',    find: 'tvUnit' },
  desk:   { url: 'assets/models/furniture/desk.glb',       find: 'desk' },
  gamer:  { url: 'assets/models/characters/yeray.glb',     actor: 'gamer' },
  phone:  { url: 'assets/models/characters/noa.glb',       actor: 'phone' },
  smoker: { url: 'assets/models/characters/malik.glb',     actor: 'smoker' },
  artist: { url: 'assets/models/characters/zuri.glb',      actor: 'artist' },
};

export class AssetSlots {
  constructor(renderer, q) {
    this.loader = new GLTFLoader();
    this.draco = new DRACOLoader().setDecoderPath('vendor/three/addons/libs/draco/gltf/'); this.loader.setDRACOLoader(this.draco);
    this.ktx2 = new KTX2Loader().setTranscoderPath('vendor/three/addons/libs/basis/').detectSupport(renderer); this.loader.setKTX2Loader(this.ktx2);
    this.q = q; this.loaded = [];
  }
  /* Qué slots tienen archivo: se lee de assets/models/manifest.json ({ "slots": ["sofa", "gamer", …] }).
     Una sola petición, sin 404 en consola, y antes de construir el mundo (las piezas sustituibles no se fusionan en el bake). */
  static async probe() {
    try { const r = await fetch('assets/models/manifest.json', { cache: 'no-cache' }); if (!r.ok) return new Set(); const j = await r.json(); return new Set((j.slots || []).filter(n => SLOTS[n])); } catch { return new Set(); }
  }

  /* se llama con el mundo ya en pantalla; carga en segundo plano y sin bloquear el scroll */
  async applyAll(scene, cast, present = new Set()) {
    for (const [name, s] of Object.entries(SLOTS)) {
      if (!present.has(name)) continue;
      if (this.q.name === 'low' && s.actor) continue;                    // en móvil los personajes se quedan procedurales
      try {
        const gltf = await this.loader.loadAsync(s.url);
        gltf.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        if (s.find) { const g = scene.getObjectByName(s.find); if (g) { const c = gltf.scene; c.position.copy(g.position); c.rotation.copy(g.rotation); g.parent.add(c); g.visible = false; this.loaded.push(name); } }
        else if (s.actor && cast.actors[s.actor]?.swapBody) { cast.actors[s.actor].swapBody(gltf); this.loaded.push(name); }
      } catch (e) { console.warn('[assetSlots]', name, e.message); }
    }
    return this.loaded;
  }
}
