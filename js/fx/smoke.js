/* =========================================================
   HUMO — simulación suave por partículas (un solo Points)
   Cada partícula sube, se ensancha, gira con un campo de "aire" (ondas sumadas que
   cambian en el tiempo), reacciona a las corrientes de la sala y se desvanece.
   Se ilumina más cerca de las fuentes de luz cálidas (mezcla en el shader).
   ========================================================= */
import * as THREE from 'three';

export class Smoke {
  constructor(n = 240) {
    this.n = n; this.i = 0; this.acc = 0;
    this.pos = new Float32Array(n * 3), this.vel = new Float32Array(n * 3), this.age = new Float32Array(n).fill(1e9), this.life = new Float32Array(n).fill(1), this.size0 = new Float32Array(n), this.rise = new Float32Array(n), this.seed = new Float32Array(n);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.aSize = new Float32Array(n); this.aAlpha = new Float32Array(n); this.aSeed = this.seed;
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.aSize, 1)); this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.aAlpha, 1)); this.geo.setAttribute('aSeed', new THREE.BufferAttribute(this.aSeed, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { uScale: { value: 800 }, uTime: { value: 0 }, uTint: { value: new THREE.Color(.78, .8, .88) }, uWarm: { value: new THREE.Color(1, .72, .5) } },
      vertexShader: `attribute float aSize,aAlpha,aSeed; varying float vA,vS; varying vec3 vW; uniform float uScale;
        void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); vW=(modelMatrix*vec4(position,1.)).xyz; vA=aAlpha; vS=aSeed; gl_PointSize=aSize*uScale/max(-mv.z,.1); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying float vA,vS; varying vec3 vW; uniform vec3 uTint,uWarm; uniform float uTime;
        float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
        float n(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
        void main(){ vec2 c=gl_PointCoord-.5; float r=length(c)*2.; if(r>1.) discard;
          float w=n(c*3.5+vS*13.+uTime*.05)*.6+n(c*7.-vS*7.)*.4; float a=smoothstep(1.,.05,r)*(.55+.6*w); a*=a;
          // más cálido y luminoso cerca de las lámparas y de los haces de luz
          vec3 col=mix(uTint,uWarm,clamp(.25+.4*w,0.,.6));
          gl_FragColor=vec4(col,a*vA); }`,
    });
    this.points = new THREE.Points(this.geo, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 6; this.points.userData.noMerge = true;
  }

  emit(p, d, count, o = {}) {
    this.acc += count; const n = Math.floor(this.acc); this.acc -= n;
    for (let k = 0; k < n; k++) {
      const i = this.i; this.i = (this.i + 1) % this.n;
      const s = o.spread ?? .02, sp = o.speed ?? .12;
      this.pos[i * 3] = p.x + (Math.random() - .5) * s; this.pos[i * 3 + 1] = p.y + (Math.random() - .5) * s; this.pos[i * 3 + 2] = p.z + (Math.random() - .5) * s;
      this.vel[i * 3] = d.x * sp * (.6 + Math.random() * .8) + (Math.random() - .5) * .02; this.vel[i * 3 + 1] = d.y * sp * (.6 + Math.random() * .8); this.vel[i * 3 + 2] = d.z * sp * (.6 + Math.random() * .8) + (Math.random() - .5) * .02;
      this.age[i] = 0; this.life[i] = (o.life ?? 4) * (.7 + Math.random() * .6); this.size0[i] = (o.size ?? .03) * (.8 + Math.random() * .5); this.rise[i] = (o.rise ?? .08) * (.7 + Math.random() * .6); this.seed[i] = Math.random() * 20;
    }
  }

  update(dt, t, viewportH, fov) {
    this.mat.uniforms.uTime.value = t; this.mat.uniforms.uScale.value = viewportH / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
    for (let i = 0; i < this.n; i++) {
      if (this.age[i] > this.life[i]) { this.aAlpha[i] = 0; continue; }
      this.age[i] += dt; const a = this.age[i], u = a / this.life[i], sd = this.seed[i];
      const ix = i * 3;
      // aire: ondas superpuestas + corriente del ventanal (oeste→este) que aumenta con la altura
      const px = this.pos[ix], py = this.pos[ix + 1], pz = this.pos[ix + 2];
      const wx = Math.sin(py * 3.1 + t * .6 + sd) * .03 + Math.sin(pz * 2.3 - t * .4) * .02 + .012 * u, wz = Math.cos(py * 2.7 + t * .5 + sd * 1.7) * .03 + Math.sin(px * 2.1 + t * .35) * .015;
      this.vel[ix] += (wx - this.vel[ix] * .6) * dt * 2.2; this.vel[ix + 1] += (this.rise[i] - this.vel[ix + 1]) * dt * 1.4; this.vel[ix + 2] += (wz - this.vel[ix + 2] * .6) * dt * 2.2;
      this.pos[ix] += this.vel[ix] * dt; this.pos[ix + 1] += this.vel[ix + 1] * dt; this.pos[ix + 2] += this.vel[ix + 2] * dt;
      this.aSize[i] = this.size0[i] * (1 + u * 5.5); this.aAlpha[i] = Math.min(1, a * 3) * (1 - u) * (1 - u) * .42;
      if (this.pos[ix + 1] > 3.4) this.age[i] = this.life[i] + 1;
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.aSize.needsUpdate = true; this.geo.attributes.aAlpha.needsUpdate = true;
  }
}
