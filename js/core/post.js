/* =========================================================
   Postproceso — "menos efectos, mejor ejecutados"
   RenderPass (HDR + MSAA + depth) → CameraFX (profundidad de campo + motion blur
   por movimiento real de cámara) → Bloom sutil → Output (ACES) → Grade
   (viñeta, cromatismo en bordes, grano, curva de color).
   ========================================================= */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const CAMERA_FX = {
  uniforms: {
    tDiffuse: { value: null }, tDepth: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uNear: { value: .05 }, uFar: { value: 120 },
    uFocus: { value: 4 }, uAperture: { value: 0 }, uMaxBlur: { value: 14 },
    uRot: { value: new THREE.Vector2() },      // px de desplazamiento por rotación de cámara
    uTrans: { value: new THREE.Vector2() },    // px·m de desplazamiento por traslación (se divide por profundidad)
    uMB: { value: 0 }, uTime: { value: 0 },
    uAO: { value: 0 }, uAOR: { value: .32 }, uTan: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse, tDepth; uniform vec2 uRes, uRot, uTrans; uniform float uNear,uFar,uFocus,uAperture,uMaxBlur,uMB,uTime,uAO,uAOR; uniform vec2 uTan;
    varying vec2 vUv;
    float lin(float d){ float z=d*2.-1.; return 2.*uNear*uFar/(uFar+uNear-z*(uFar-uNear)); }
    float coc(float dist){ return clamp(uAperture*abs(dist-uFocus)/max(dist,.05),0.,1.)*uMaxBlur; }
    float hash(vec2 p){ return fract(sin(dot(p,vec2(41.3,289.1)))*43758.5453); }
    void main(){
      vec2 px=1./uRes;
      float d0=lin(texture2D(tDepth,vUv).r);
      float c0=coc(d0);
      vec3 col=texture2D(tDiffuse,vUv).rgb;
      float ang0=hash(vUv*uRes+uTime)*6.2831;
      // --- profundidad de campo: gather en disco (Vogel) ponderado por CoC de cada muestra ---
      if(uAperture>0.0001){
        vec3 acc=col; float wsum=1.;
        const int N=22;
        for(int i=0;i<N;i++){
          float fi=float(i)+.5, r=sqrt(fi/float(N)), th=fi*2.39996+ang0;
          vec2 off=vec2(cos(th),sin(th))*r;
          float rad=max(c0,0.);
          // desenfoque en primer plano: usa el mayor CoC entre centro y muestra
          vec2 uv=vUv+off*rad*px;
          float ds=lin(texture2D(tDepth,uv).r);
          float cs=coc(ds);
          float reach=r*rad;                       // distancia en px del muestreo
          float w=(ds<d0)? 1.0 : smoothstep(reach-1.,reach+1.,cs+.001);  // fondo no sangra sobre lo enfocado
          if(c0<.6) w*= smoothstep(0.,1.,cs/max(reach,.5));
          acc+=texture2D(tDiffuse,uv).rgb*w; wsum+=w;
        }
        col=acc/wsum;
      }
      // --- motion blur: velocidad por píxel = rotación + traslación/profundidad ---
      if(uMB>0.001){
        vec2 v=(uRot+uTrans/max(d0,.3))*uMB;
        float m=length(v); if(m>36.) v*=36./m;
        vec3 acc=col; float ws=1.;
        for(int i=1;i<=7;i++){
          float t=(float(i)/7.-.5)*2.;
          vec2 uv=vUv+v*t*px*.5;
          acc+=texture2D(tDiffuse,uv).rgb*(1.-.06*float(i)); ws+=(1.-.06*float(i));
        }
        col=mix(col,acc/ws,clamp(m*.35,0.,1.));
      }
      // --- oclusión ambiental en espacio de pantalla (solo profundidad): oscurece pliegues, contactos y esquinas (cuello, axilas, bajo el mentón, pie/suelo) ---
      if(uAO>.001 && d0<14.){
        float pxr=uAOR/(2.*uTan.y*d0)*uRes.y;                    // radio del kernel en píxeles a esta profundidad
        pxr=clamp(pxr,3.,uRes.y*.09);
        float occ=0.; const int NA=14;
        for(int i=0;i<NA;i++){
          float fi=float(i)+.5, r=sqrt(fi/float(NA)), th=fi*2.39996+ang0;
          vec2 uv=vUv+vec2(cos(th),sin(th))*r*pxr*px;
          float dz=d0-lin(texture2D(tDepth,uv).r);                // >0: la muestra está más cerca de la cámara que este punto
          occ+=smoothstep(.012,.05,dz)*(1.-smoothstep(uAOR*.6,uAOR*1.6,dz));
        }
        occ/=float(NA); col*=1.-clamp(occ*uAO*1.6,0.,.62);
      }
      gl_FragColor=vec4(col,1.);
    }`,
};

class CameraFXPass extends Pass {
  constructor() {
    super();
    this.material = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(CAMERA_FX.uniforms), vertexShader: CAMERA_FX.vertexShader, fragmentShader: CAMERA_FX.fragmentShader, depthTest: false, depthWrite: false });
    this.fsQuad = new FullScreenQuad(this.material);
    this.uniforms = this.material.uniforms;
  }
  setSize(w, h) { this.uniforms.uRes.value.set(w, h); }
  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.tDepth.value = readBuffer.depthTexture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.fsQuad.render(renderer);
  }
  dispose() { this.material.dispose(); this.fsQuad.dispose(); }
}

const GRADE = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uGrain: { value: .05 }, uVig: { value: .42 }, uCA: { value: .0012 }, uFade: { value: 0 }, uCut: { value: 0 }, uSharp: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime,uGrain,uVig,uCA,uFade,uCut,uSharp; uniform vec2 uRes; varying vec2 vUv;
    float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
    void main(){
      vec2 c=vUv-.5; float r2=dot(c,c);
      vec2 ca=c*uCA*(r2*4.+.15);
      vec3 col=vec3(texture2D(tDiffuse,vUv+ca).r,texture2D(tDiffuse,vUv).g,texture2D(tDiffuse,vUv-ca).b);
      if(uSharp>.001){                                                  // micro-contraste: máscara de enfoque solo en luminancia (realza poros, costuras y tejido sin halos de color)
        vec2 q=1./uRes; vec3 n=texture2D(tDiffuse,vUv+vec2(q.x,0.)).rgb+texture2D(tDiffuse,vUv-vec2(q.x,0.)).rgb+texture2D(tDiffuse,vUv+vec2(0.,q.y)).rgb+texture2D(tDiffuse,vUv-vec2(0.,q.y)).rgb;
        float dl=dot(col-n*.25,vec3(.2126,.7152,.0722)); col+=clamp(dl,-.06,.06)*uSharp*(1.-uFade); }
      if(uCut>.002){                                                    // golpe de corte: zoom radial + cromatismo + destello que se apaga en ~0.25 s
        vec3 acc=vec3(0.); for(int i=0;i<7;i++){ float k=float(i)/6.; vec2 o=c*uCut*.05*k; acc+=vec3(texture2D(tDiffuse,vUv-o*1.08).r,texture2D(tDiffuse,vUv-o).g,texture2D(tDiffuse,vUv-o*.92).b); }
        col=mix(col,acc/7.,clamp(uCut*1.4,0.,1.)); col*=1.+.10*uCut; }
      // curva de color: sombras cálidas ligeramente levantadas, medios crema, altas luces neutras
      float l=dot(col,vec3(.2126,.7152,.0722));
      col=mix(col,col*vec3(.95,1.0,1.06),(1.-smoothstep(0.,.32,l))*.55);          // sombras hacia el teal
      col=mix(col,col*vec3(1.05,1.0,.93),smoothstep(.45,1.,l)*.7);                // luces altas cálidas (naranja/teal de cine)
      col=mix(vec3(l),col,1.07);
      col=col*col*(3.-2.*col)*.35+col*.65;           // S suave
      // viñeta
      float v=smoothstep(.9,.18,length(c*vec2(1.,.88)));
      col*=mix(1.-uVig,1.,v);
      // grano de película (más visible en sombras)
      float g=hash(vUv*uRes+fract(uTime)*97.)-.5;
      col+=g*uGrain*(1.-l*.6);
      // fundido a negro limpio: solo se apaga la luz (sin desaturar, sin gamma turbia, sin iris): la imagen conserva su color hasta desaparecer
      col*=1.-uFade;
      gl_FragColor=vec4(col,1.);
    }`,
};

export class Post {
  constructor(renderer, scene, camera, q) {
    this.renderer = renderer; this.q = q;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const depthTexture = new THREE.DepthTexture(size.x, size.y);
    depthTexture.type = THREE.UnsignedIntType;
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.msaa, depthTexture, depthBuffer: true });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.fx = new CameraFXPass();
    this.fx.uniforms.uNear.value = camera.near; this.fx.uniforms.uFar.value = camera.far;
    this.fx.enabled = q.dof || q.motionBlur;
    this.composer.addPass(this.fx);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), .34, .62, .92);
    this.bloom.enabled = q.bloom;
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GRADE);
    this.grade.renderToScreen = true;
    this.composer.addPass(this.grade);
  }
  setSize(w, h, dpr) {
    this.composer.setPixelRatio(dpr); this.composer.setSize(w, h);
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.fx.setSize(s.x, s.y); this.grade.uniforms.uRes.value.set(s.x, s.y);
  }
  render(dt, t, cam) {
    this.fx.uniforms.uTime.value = t % 10;
    this.grade.uniforms.uTime.value = t;
    this.composer.render(dt);
  }
}
