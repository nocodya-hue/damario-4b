/* =========================================================
   Exterior: ciudad de DÍA vista desde una planta alta
   Cielo azul con cúmulos + tejados y manzanas iluminadas por el sol + rascacielos
   de cristal al fondo con perspectiva atmosférica. Todo en shaders (2 draw calls
   con el suelo de bruma): las ventanas salen del patrón por posición de mundo.
   ========================================================= */
import * as THREE from 'three';
import { seed } from './materials.js';

export const SKY_HAZE = new THREE.Color(0xbcd0e6);
const SUN_DIR = new THREE.Vector3(-.62, .55, -.32).normalize();

export function buildSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uSun: { value: SUN_DIR } },
    vertexShader: `varying vec3 vD; void main(){ vD=normalize(position); vec4 p=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*p; gl_Position.z=gl_Position.w*.9999; }`,
    fragmentShader: /* glsl */`
      varying vec3 vD; uniform float uTime; uniform vec3 uSun;
      float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*n(p); p=p*2.03+7.1; a*=.5; } return s; }
      void main(){
        vec3 d=normalize(vD); float y=clamp(d.y,-.25,1.);
        vec3 zen=vec3(.13,.36,.78), mid=vec3(.36,.62,.93), hor=vec3(.80,.89,.97), low=vec3(.70,.78,.86);
        vec3 c=mix(hor,mid,smoothstep(.0,.28,y)); c=mix(c,zen,smoothstep(.2,.9,y));
        c=mix(low,c,smoothstep(-.25,.02,y));
        float sd=max(dot(d,uSun),0.); c+=vec3(1.,.93,.78)*(pow(sd,8.)*.22+pow(sd,160.)*.9);
        // cúmulos: ruido fractal proyectado al plano del cielo, más cerca del horizonte
        vec2 uv=d.xz/(d.y+.28)*1.15+vec2(uTime*.006,0.);
        float cl=fbm(uv*1.4);
        float m=smoothstep(.46,.78,cl)*smoothstep(.0,.16,y);
        float lit=clamp(.55+.6*fbm(uv*1.4+vec2(.12,.2))-.35*fbm(uv*1.4-vec2(.1,.05)),0.,1.);
        vec3 cc=mix(vec3(.62,.68,.78),vec3(1.,.99,.96),lit);
        c=mix(c,cc,m*.92);
        gl_FragColor=vec4(c*.8,1.);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 20), mat); m.renderOrder = -10; m.frustumCulled = false; m.userData.noMerge = true;
  return m;
}

export function buildCity(q) {
  const N = q.name === 'high' ? 760 : q.name === 'mid' ? 460 : 240, TOWERS = q.name === 'low' ? 10 : 18, rnd = seed(77);
  const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, .5, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uHaze: { value: SKY_HAZE }, uSun: { value: SUN_DIR } },
    vertexShader: `
      attribute float aSeed; attribute float aTower; varying vec3 vW; varying vec3 vN; varying float vS,vDist,vT;
      void main(){ vec4 wp=modelMatrix*instanceMatrix*vec4(position,1.); vW=wp.xyz;
        vec3 sc=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz)); vN=normalize(mat3(instanceMatrix)*(normal/sc));
        vS=aSeed; vT=aTower; vDist=length(wp.xyz); gl_Position=projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uHaze,uSun; varying vec3 vW,vN; varying float vS,vDist,vT;
      float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      void main(){
        vec3 n=normalize(vN);
        float roof=step(.5,n.y);
        float u=abs(n.x)>.5? vW.z : vW.x; float v=vW.y;
        // fachada: ventanas en rejilla (tower = muro cortina de cristal, más fina y azulada)
        vec2 cell=mix(vec2(u/3.4,v/3.4),vec2(u/1.6,v/2.2),vT), id=floor(cell), f=fract(cell);
        float win=mix(step(.18,f.x)*step(f.x,.82)*step(.22,f.y)*step(f.y,.78), step(.06,f.y)*step(f.y,.94), vT);
        // paleta de fachadas: hormigón, crema, ladrillo claro, gris
        vec3 pal=mix(mix(vec3(.72,.70,.66),vec3(.80,.74,.62),fract(vS*5.3)),mix(vec3(.62,.40,.34),vec3(.55,.58,.62),fract(vS*3.1)),step(.5,fract(vS*7.7)));
        vec3 wall=mix(pal,vec3(.34,.48,.62),vT);
        float sun=clamp(dot(n,uSun)*.5+.5,0.,1.), sky=.55+.45*n.y;
        vec3 lightCol=(vec3(1.,.95,.84)*(.3+.75*sun)+vec3(.45,.55,.72)*.3*sky)*.72;
        vec3 glass=mix(vec3(.16,.26,.36),vec3(.55,.72,.86),clamp(.3+.6*h(id+vS*9.)*(.6+.8*sun),0.,1.));
        vec3 col=wall*lightCol;
        float g=win*(1.-roof);
        col=mix(col,glass*(.55+.6*lightCol),g*mix(.8,.95,vT));
        col=mix(col,vec3(.36,.36,.36)*lightCol,roof*.75);
        // franjas de forjado en torres
        col*=1.-vT*.10*step(.9,f.y);
        float fog=1.-exp(-vDist*vDist*.0000058); fog=max(fog,smoothstep(0.,1.,(vDist-90.)/300.)*.18);
        col=mix(col,uHaze*.9,clamp(fog,0.,.9));
        gl_FragColor=vec4(col*.8,1.);
      }`,
  });
  const T = N + TOWERS, inst = new THREE.InstancedMesh(geo, mat, T);
  const seeds = new Float32Array(T), tow = new Float32Array(T), m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < T; i++) {
    const tower = i >= N;
    const a = (rnd() * 2 - 1) * Math.PI * (rnd() < .85 ? .5 : 1.0) + Math.PI;                 // sobre todo hacia el oeste (-x)
    let r, w, d, top;
    if (tower) { r = 150 + rnd() * 170; w = 20 + rnd() * 22; d = 20 + rnd() * 22; top = 55 + rnd() * 105; }
    else { r = 62 + Math.pow(rnd(), 1.4) * 250; w = 14 + rnd() * 30; d = 14 + rnd() * 30; top = r < 120 ? -36 + rnd() * 22 : -32 + rnd() * (24 + Math.min(r * .16, 34)); }
    p.set(Math.cos(a) * r, -52, Math.sin(a) * r);
    if (p.x > -55) p.x = -55 - rnd() * 40;                                                    // corredor despejado ante los ventanales
    s.set(w, top + 52, d); q4.setFromAxisAngle(up, rnd() < .35 ? rnd() * .6 : 0);
    m4.compose(p, q4, s); inst.setMatrixAt(i, m4); seeds[i] = rnd(); tow[i] = tower ? 1 : 0;
  }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  geo.setAttribute('aTower', new THREE.InstancedBufferAttribute(tow, 1));
  inst.frustumCulled = false; inst.userData.noMerge = true;

  // suelo de bruma (calles lejanas) para que no haya vacío bajo el horizonte
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshBasicMaterial({ color: 0x8d979f }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -52; ground.userData.noMerge = true;
  const g = new THREE.Group(); g.add(inst, ground); g.userData.noMerge = true;
  return g;
}
