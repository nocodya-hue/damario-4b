/* =========================================================
   POLVO en suspensión — solo se ve dentro de los haces de luz de los ventanales
   (y con un leve brillo cerca de las lámparas). Un Points, todo en el shader.
   ========================================================= */
import * as THREE from 'three';
import { ROOM } from '../world/room.js';
import { L } from '../world/layout.js';

export class Dust {
  constructor(n = 300) {
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = ROOM.x0 + Math.random() * (ROOM.x1 - ROOM.x0); pos[i * 3 + 1] = .2 + Math.random() * 3; pos[i * 3 + 2] = ROOM.z0 + Math.random() * (ROOM.z1 - ROOM.z0); seed[i] = Math.random() * 100; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const bw = 3.1 / 3, bays = [L.windowB.z - bw, L.windowB.z, L.windowB.z + bw, L.windowA.z - bw, L.windowA.z, L.windowA.z + bw];
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uScale: { value: 800 }, uBays: { value: bays }, uMin: { value: new THREE.Vector3(ROOM.x0, .1, ROOM.z0) }, uSize: { value: new THREE.Vector3(ROOM.x1 - ROOM.x0, 3.2, ROOM.z1 - ROOM.z0) } },
      vertexShader: `attribute float aSeed; uniform float uTime,uScale; uniform vec3 uMin,uSize; uniform float uBays[6]; varying float vB;
        void main(){ vec3 p=position; float t=uTime*.03;
          p.x=uMin.x+mod(p.x-uMin.x+t*.6*(.5+fract(aSeed*3.1))+sin(uTime*.2+aSeed)*.2,uSize.x); p.y=uMin.y+mod(p.y-uMin.y+t*.15*(.5+fract(aSeed*7.))+sin(uTime*.25+aSeed*2.)*.1,uSize.y); p.z=uMin.z+mod(p.z-uMin.z+sin(uTime*.15+aSeed*1.7)*.15,uSize.z);
          // distancia al eje del haz más cercano (bajan del ventanal con pendiente suave hacia el este)
          float bm=9.; for(int i=0;i<6;i++){ float zc=uBays[i]-(p.x+3.3)*.05; float yc=1.5-(p.x+3.3)*.18; float d=length(vec2(p.z-zc,(p.y-yc)*.55)); bm=min(bm,d); }
          vB=smoothstep(.62,.0,bm)*smoothstep(-3.3,-2.6,p.x)*(1.-smoothstep(1.5,3.3,p.x));
          vec4 mv=modelViewMatrix*vec4(p,1.); gl_PointSize=(.012+fract(aSeed*5.)*.012)*uScale/max(-mv.z,.1); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying float vB; void main(){ vec2 c=gl_PointCoord-.5; float r=length(c)*2.; if(r>1.) discard; gl_FragColor=vec4(vec3(1.,.9,.72),smoothstep(1.,0.,r)*(.05+vB*.75)); }`,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 7; this.points.userData.noMerge = true;
  }
  update(t, viewportH, fov) { this.mat.uniforms.uTime.value = t; this.mat.uniforms.uScale.value = viewportH / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2)); }
}
