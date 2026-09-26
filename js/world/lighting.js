/* =========================================================
   ILUMINACIÓN — mezcla de cuatro fuentes (como la referencia)
   1. Luz de ciudad/atardecer por los ventanales (sol bajo con sombras + cielo azul)
   2. Lámparas de la habitación (globos, seta roja, latón, plisada, foco de mesa)
   3. La televisión: cambia de color con el juego e ilumina la cara del jugador
   4. Decorativas: péndulo rojo, falso techo con lavado rojo/rosa
   Haces volumétricos con polvo: solo en los ventanales.
   ========================================================= */
import * as THREE from 'three';
import { L } from './layout.js';
import { ROOM } from './room.js';

export class Lighting {
  constructor(scene, q) {
    this.scene = scene; this.q = q; this.points = []; this.t = 0;

    // cielo azul de la hora azul: ambiente frío desde arriba/oeste, rebote cálido del suelo
    this.hemi = new THREE.HemisphereLight(0xbcd2f4, 0x9a8676, 1.15); scene.add(this.hemi);

    // último sol: rayos anaranjados que cruzan la sala y proyectan la retícula de los ventanales
    const sun = this.sun = new THREE.DirectionalLight(0xfff0dc, 1.5);
    sun.position.set(-14, 9.5, 3.2); sun.target.position.set(0, .3, -.9);
    sun.castShadow = q.shadowLights > 0; sun.shadow.mapSize.set(Math.min(q.shadow * 2, 2048), Math.min(q.shadow * 2, 2048));   // 4096² costaba una barbaridad por fotograma
    const sc = sun.shadow.camera; sc.left = -7; sc.right = 7; sc.top = 6; sc.bottom = -6; sc.near = 4; sc.far = 34;
    sun.shadow.bias = -.0004; sun.shadow.normalBias = .03; sun.shadow.radius = 4;
    scene.add(sun, sun.target);

    // foco cenital cálido sobre la zona de estar (sombras de contacto de los personajes)
    if (q.shadowLights > 1) {
      const sp = this.key = new THREE.SpotLight(0xffd2a0, 34, 11, .95, 1, 2);
      sp.position.set(-.3, 3.4, -.4); sp.target.position.set(-.4, .3, -1.9);
      sp.castShadow = true; sp.shadow.mapSize.set(Math.min(q.shadow, 1024), Math.min(q.shadow, 1024)); sp.shadow.bias = -.0003; sp.shadow.normalBias = .02; sp.shadow.radius = 5;
      scene.add(sp, sp.target);
    }

    // luces puntuales por prioridad (según nivel de calidad)
    const defs = [
      { id: 'tv',       c: 0xff6aa8, i: 11, d: 7.5, p: [L.tv.x, L.tv.y - .1, L.tv.z + .45], pri: 0 },
      { id: 'pendant',  c: 0xff4a24, i: 6.5, d: 4, p: [L.pendant.x + .1, L.pendant.y, L.pendant.z], pri: 1 },
      { id: 'desk',     c: 0xffb066, i: 8, d: 3.8, p: [L.deskLamp.x - .1, 1.28, L.deskLamp.z + .15], pri: 2 },
      { id: 'twin',     c: 0xffc78d, i: 8, d: 3.6, p: [L.twinLamp.x, 1.05, L.twinLamp.z + .25], pri: 3 },
      { id: 'brass',    c: 0xffab55, i: 8,  d: 3.8, p: [L.brassLamp.x, .98, L.brassLamp.z + .2], pri: 4 },
      { id: 'pleated',  c: 0xffd28c, i: 7,  d: 3.4, p: [L.sideTable.x, .9, L.sideTable.z], pri: 5 },
      { id: 'mushroom', c: 0xff5a36, i: 4.5, d: 3.6, p: [L.mushroomLamp.x, 1.55, L.mushroomLamp.z + .3], pri: 6 },
      { id: 'soffit',   c: 0xff3040, i: 1.2, d: 3.2, p: [ROOM.x0 + .6, ROOM.h - .55, -1.6], pri: 7 },
    ].sort((a, b) => a.pri - b.pri).slice(0, q.pointLights);
    for (const d of defs) {
      const l = new THREE.PointLight(d.c, d.i, d.d, 2); l.position.set(...d.p); l.userData = { base: d.i, id: d.id, seed: Math.random() * 10 };
      scene.add(l); this.points.push(l); this[d.id] = l;
    }
    this._buildShafts(scene);
  }

  _buildShafts(scene) {
    const dir = new THREE.Vector3().subVectors(this.sun.target.position, this.sun.position).normalize();
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(1, .93, .8) }, uAmt: { value: this.q.name === 'low' ? .04 : .06 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: /* glsl */`
        varying vec2 vUv; uniform float uTime,uAmt; uniform vec3 uColor;
        float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
        float n(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
        void main(){
          float across=smoothstep(0.,.28,vUv.y)*smoothstep(1.,.72,vUv.y);
          float along=smoothstep(0.,.07,vUv.x)*pow(1.-vUv.x,1.6);
          float dust=.62+.38*n(vec2(vUv.x*7.-uTime*.05,vUv.y*3.+uTime*.03));
          gl_FragColor=vec4(uColor,across*along*dust*uAmt);
        }`,
    });
    this.shaftMat = mat;
    const up = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3().crossVectors(dir, up).normalize(), up2 = new THREE.Vector3().crossVectors(right, dir).normalize();
    const mk = (zc, y, w, len) => {
      for (const ang of [0, Math.PI / 2]) {
        const g = new THREE.PlaneGeometry(len, w); g.translate(len / 2, 0, 0);       // u a lo largo del haz
        const m = new THREE.Mesh(g, mat);
        const wd = ang ? right : up2, basis = new THREE.Matrix4().makeBasis(dir, wd, new THREE.Vector3().crossVectors(dir, wd));
        m.setRotationFromMatrix(basis);
        m.position.set(ROOM.x0 + .1, y, zc); m.renderOrder = 5; m.userData.noMerge = true; m.frustumCulled = false;
        scene.add(m);
      }
    };
    const bw = 3.1 / 3;
    for (const zc of [L.windowB.z - bw, L.windowB.z, L.windowB.z + bw, L.windowA.z - bw, L.windowA.z, L.windowA.z + bw]) mk(zc, 1.5, .85, 8.5);
  }

  /* tvColor: THREE.Color, luminance 0..1 */
  update(t, tvColor, tvLum = .6) {
    this.t = t;
    this.shaftMat.uniforms.uTime.value = t;
    for (const l of this.points) {
      const s = l.userData.seed, b = l.userData.base;
      if (l.userData.id === 'tv') {                                      // la luz de la tele sigue al juego con inercia (sin parpadeo rápido sobre la alfombra)
        const dt = Math.min(.1, Math.max(0, t - (this._tvT ?? t))); this._tvT = t; const k = 1 - Math.exp(-dt * 2.2);
        (this._tvC ||= tvColor.clone()).lerp(tvColor, k); this._tvL = (this._tvL ?? tvLum) + (tvLum - (this._tvL ?? tvLum)) * k;
        l.color.copy(this._tvC); l.intensity = b * (.55 + this._tvL * .9);
      }
      else if (l.userData.id === 'pendant') l.intensity = b * (1 + Math.sin(t * .9 + s) * .03);
      else l.intensity = b * (1 + Math.sin(t * 1.3 + s) * .012 + Math.sin(t * 9.7 + s * 3) * .006);
    }
  }
}
