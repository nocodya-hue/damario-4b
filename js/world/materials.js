/* =========================================================
   Materiales y texturas
   Texturas PBR reales (Poly Haven, CC0) + texturas procedurales (canvas).
   UV siempre en METROS (worldUV) para que el ladrillo, la madera y la tela
   tengan la misma densidad de texel en cualquier pieza.
   ========================================================= */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const TEX_DIR = 'assets/tex/';

/* Proyecta UV desde la posición local según el eje dominante de la normal (unidades = metros) */
export function worldUV(geo, scale = 1, offset = [0, 0]) {
  geo.computeVertexNormals && !geo.attributes.normal && geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u * scale + offset[0]; uv[i * 2 + 1] = v * scale + offset[1];
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.userData.wuv = true;
  return geo;
}

export function canvasTex(w, h, draw, opt = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opt.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = opt.aniso || 4;
  if (opt.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.userData = { canvas: c, ctx: g };
  return t;
}

export class Materials {
  constructor(q, manager) {
    this.q = q; this.loader = new THREE.TextureLoader(manager); this.cache = new Map();
    this.env = null; this.envIntensity = .45;
  }

  /* entorno neutro (sala de estudio) para reflejos: el color lo ponen las luces de la escena */
  async loadEnv(renderer) {
    const pm = new THREE.PMREMGenerator(renderer);
    this.env = pm.fromScene(new RoomEnvironment(), .04).texture; pm.dispose();
    return this.env;
  }

  /* textura de fichero; repeat = 1/tamaño_en_metros */
  tex(file, { srgb = true, size = 1, rot = 0 } = {}) {
    const key = file + '|' + size + '|' + rot + '|' + srgb;
    if (this.cache.has(key)) return this.cache.get(key);
    const t = this.loader.load(TEX_DIR + file);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / size, 1 / size);
    if (rot) { t.center.set(.5, .5); t.rotation = rot; }
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = this.q.aniso;
    this.cache.set(key, t); return t;
  }

  /* conjunto PBR: name_Diffuse/_Rough/_nor_gl */
  pbr(name, o = {}) {
    const size = o.size || 1, rot = o.rot || 0, ext = o.ext || 'webp';
    const m = new THREE.MeshStandardMaterial({
      map: this.tex((o.diffuse || name) + '_Diffuse.' + ext, { size, rot }),
      roughnessMap: this.tex(name + '_Rough.' + ext, { srgb: false, size, rot }),
      normalMap: this.tex(name + '_nor_gl.' + ext, { srgb: false, size, rot }),
      normalScale: new THREE.Vector2(o.normal ?? 1, o.normal ?? 1),
      color: new THREE.Color(o.color ?? 0xffffff), roughness: o.rough ?? 1, metalness: o.metal ?? 0,
    });
    return this._env(m, o.env);
  }

  std(o = {}) { return this._env(new THREE.MeshStandardMaterial(o), o.env); }
  phys(o = {}) { return this._env(new THREE.MeshPhysicalMaterial(o), o.env); }
  _env(m, k) { if (this.env) { m.envMap = this.env; m.envMapIntensity = k ?? this.envIntensity; } return m; }
  /* material emisivo (lámparas, pantallas) */
  glow(color, intensity = 2, o = {}) { return new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(color), emissiveIntensity: intensity, roughness: .6, ...o }); }
}

export const rnd = (() => { let s = 1337; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })();
export function seed(n) { let s = n | 0 || 1; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
