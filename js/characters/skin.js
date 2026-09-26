/* =========================================================
   PIEL Y OJOS — detalle de superficie procedural sobre el cuerpo real
     · microrrelieve de poros (ruido 3D en coordenadas de reposo → normal por derivadas) y "tacto" de piel de melocotón (sheen)
     · pliegues de nudillos, falanges y muñeca (líneas perpendiculares a cada dedo) con oscurecimiento y relieve
     · arrugas de expresión (frente, patas de gallo, surco nasogeniano, ojeras) que crecen con la expresión
     · manchas de color de baja frecuencia + rubor en mejillas/nariz/orejas; leve brillo graso (clearcoat)
     · uñas (láminas curvas con lúnula y borde libre) ancladas a la falange distal y ajustadas a la malla
     · ojos: esclerótica cálida con venas y sombra de párpado, iris con anillo límbico, córnea húmeda
   ========================================================= */
import * as THREE from 'three';
import { canvasTex, seed } from '../world/materials.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const NJ = 30;

const GLSL_NOISE = `
float h31(vec3 p){ p=fract(p*.3183099+.1); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vn(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z); }
`;

export function makeSkin(human, F, baseMat) {
  const R = human.rest, H = human.H, hb = human.b.head;
  // puntos de pliegue: articulaciones de los dedos y muñeca (posición y dirección del hueso, en reposo)
  const J = [], D = [];
  const dirOf = (a, b) => R[b].clone().sub(R[a]).normalize();
  for (const s of ['l', 'r']) {
    for (const f of ['index', 'middle', 'ring', 'pinky']) {
      J.push(R[`${f}_02_${s}`].clone()); D.push(dirOf(`${f}_01_${s}`, `${f}_02_${s}`));
      J.push(R[`${f}_03_${s}`].clone()); D.push(dirOf(`${f}_02_${s}`, `${f}_03_${s}`));
      J.push(R[`${f}_01_${s}`].clone()); D.push(dirOf(`hand_${s}`, `${f}_01_${s}`));
    }
    J.push(R[`thumb_02_${s}`].clone()); D.push(dirOf(`thumb_01_${s}`, `thumb_02_${s}`));
    J.push(R[`thumb_03_${s}`].clone()); D.push(dirOf(`thumb_02_${s}`, `thumb_03_${s}`));
    J.push(R[`hand_${s}`].clone()); D.push(dirOf(`lowerarm_${s}`, `hand_${s}`));
  }
  while (J.length < NJ) { J.push(V3(0, -9, 0)); D.push(V3(0, 1, 0)); }
  const hp = hb.getWorldPosition(V3());
  const U = {
    uJ: { value: J.slice(0, NJ) }, uD: { value: D.slice(0, NJ) },
    uHandL: { value: R.hand_l.clone() }, uHandR: { value: R.hand_r.clone() },
    uHead: { value: new THREE.Vector4(hp.x, hp.y, hp.z, 1) }, uFace: { value: new THREE.Vector4(H.ey, H.hd, H.hw, 0) },
    uWr: { value: new THREE.Vector4(0, 0, 0, 0) },        // x = frente (cejas arriba), y = sonrisa (patas de gallo/nasogeniano), z = ceño, w = tensión
    uSkinTone: { value: new THREE.Color(0xffffff) },
  };
  const m = new THREE.MeshPhysicalMaterial({
    map: baseMat.map, color: baseMat.color.clone(), roughness: .52, metalness: 0, sheen: .22, sheenRoughness: .5, sheenColor: new THREE.Color(0xd9a08c),
    clearcoat: .1, clearcoatRoughness: .42, envMap: F?.env || null, envMapIntensity: .5, specularIntensity: .6,
  });
  m.name = 'skin'; m.userData.kind = 'skin'; m.skinUniforms = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'varying vec3 vRestP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vRestP=position;');
    sh.fragmentShader = `varying vec3 vRestP; uniform vec3 uJ[${NJ}], uD[${NJ}], uHandL, uHandR; uniform vec4 uHead, uFace, uWr; uniform vec3 uSkinTone;
${GLSL_NOISE}
float lineAt(float d,float w){ return exp(-d*d/(w*w)); }
// altura de relieve (m·k) y oscurecimiento de pliegues
vec2 skinHeight(vec3 p,float pf){
  float h=0., dark=0.;
  // poros y textura fina (más marcada en manos y cara)
  float pore=vn(p*820.)*.6+vn(p*1900.)*.4; h+= (pore-.5)*.22*pf;
  float macro=vn(p*95.); h+=(macro-.5)*.14*(.4+.6*pf);
  // pliegues de dedos
  float dl=length(p-uHandL), dr=length(p-uHandR);
  if(min(dl,dr)<.13){
    for(int i=0;i<${NJ};i++){ vec3 d=p-uJ[i]; float al=dot(d,uD[i]); vec3 pp=d-uD[i]*al; float r=length(pp);
      if(r<.032){ float fade=1.-smoothstep(.014,.030,r);
        float w=lineAt(al,.0011)+.65*lineAt(abs(al)-.0038,.0009)+.4*lineAt(abs(al)-.0076,.0008);
        float wob=.6+.4*vn(p*260.); h-= w*fade*wob*1.5; dark+=w*fade*wob*.38; } }
  }
  // arrugas faciales (espacio de cabeza): sólo cerca de la cabeza
  vec3 q=p-uHead.xyz; if(q.y>-.09&&q.y<.20&&abs(q.x)<.12&&q.z>-.02){
    float ey=uFace.x;
    // frente: líneas horizontales entre las cejas y la línea del pelo
    float fm=smoothstep(ey+.028,ey+.04,q.y)*(1.-smoothstep(ey+.085,ey+.105,q.y))*(1.-smoothstep(.05,.075,abs(q.x)));
    float fw=sin(q.y*560.+vn(vec3(q.x*30.,0.,0.))*3.)*.5+.5; float fl=smoothstep(.66,1.,fw);
    h-= fm*fl*(.06+uWr.x*.9+uWr.w*.25); dark+=fm*fl*(.02+uWr.x*.13);
    // ceño (11): dos surcos verticales entre las cejas
    float gm=(1.-smoothstep(.0,.028,abs(abs(q.x)-.009)))*smoothstep(ey+.005,ey+.02,q.y)*(1.-smoothstep(ey+.035,ey+.05,q.y));
    h-= gm*uWr.z*1.6; dark+=gm*uWr.z*.35;
    // patas de gallo: abanico desde el extremo del ojo
    vec3 e=q-vec3(sign(q.x)*.058,ey-.002,q.z);
    float ang=atan(e.y,abs(e.x)); float rr=length(e.xy);
    float cw=(1.-smoothstep(.016,.034,rr))*smoothstep(.006,.012,rr);
    float cl=smoothstep(.7,1.,sin(ang*26.)*.5+.5); float ext=step(.05,abs(q.x));
    h-= cw*cl*ext*(.035+uWr.y*.75); dark+=cw*cl*ext*uWr.y*.09;
    // surco nasogeniano: arco de la aleta nasal a la comisura
    vec2 nl=vec2(abs(q.x)-.033,q.y-(ey-.048)); float dn=abs(length(nl-vec2(-.010,.006))-.028)-0.; float nm=step(.028,abs(q.x))*step(q.y,ey-.03)*step(ey-.085,q.y);
    h-= nm*lineAt(dn,.0035)*(.07+uWr.y*.8); dark+=nm*lineAt(dn,.004)*(.03+uWr.y*.14);
    // ojeras / párpado inferior
    vec2 ue=vec2(abs(q.x)-.028,q.y-(ey-.012)); float uo=lineAt(length(ue*vec2(.7,1.))-.017,.005)*step(q.y,ey-.004); dark+=uo*.10;
  }
  return vec2(h,dark);
}
` + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  float pf=1.-smoothstep(.5,2.2,length(vViewPosition)); vec2 sk=skinHeight(vRestP,pf);
  { vec3 q=vRestP-uHead.xyz; float ey=uFace.x; float onFace=step(-.09,q.y)*step(q.y,.2)*step(q.z,.14)*step(-.02,q.z);
    float blot=vn(vRestP*38.)*.6+vn(vRestP*11.)*.4;
    vec3 warm=diffuseColor.rgb*vec3(1.035,.985,.965); diffuseColor.rgb=mix(diffuseColor.rgb,warm,clamp((blot-.4)*1.6,0.,1.)*.5);
    // rubor: mejillas, punta de nariz, orejas
    float ch=exp(-(pow(abs(q.x)-.052,2.)+pow(q.y-(ey-.032),2.))/.00075)*onFace; float ns=exp(-(pow(q.x,2.)+pow(q.y-(ey-.05),2.))/.0006)*onFace*step(.06,q.z);
    diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.09,.92,.9),clamp(ch*.5+ns*.6,0.,1.)*.75);
    // nudillos/dorso de la mano algo más oscuros y enrojecidos
    float hd=min(length(vRestP-uHandL),length(vRestP-uHandR)); diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.9,.8,.76),(1.-smoothstep(.07,.13,hd))*.35*clamp(sk.y*3.,0.,1.));
  }
  diffuseColor.rgb*=1.-clamp(sk.y,0.,.5);`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  { float fr=pow(1.-clamp(dot(normal,normalize(vViewPosition)),0.,1.),3.); totalEmissiveRadiance += diffuseColor.rgb*vec3(.22,.05,.02)*fr*(.55+.45*pf); }`).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  { vec2 dH=vec2(dFdx(sk.x),dFdy(sk.x)); vec3 sigmaX=dFdx(-vViewPosition), sigmaY=dFdy(-vViewPosition); vec3 R1=cross(sigmaY,normal), R2=cross(normal,sigmaX);
    float fDet=dot(sigmaX,R1)*faceDirection; vec3 vGrad=sign(fDet)*(dH.x*R1+dH.y*R2); normal=normalize(abs(fDet)*normal-vGrad*.0007); }`);
  };
  m.customProgramCacheKey = () => 'skin3';
  return m;
}

/* -------- uñas: láminas curvas ajustadas a la falange distal -------- */
function nailTexture(base = '#d6a397', lunula = '#e6cbc2') {
  return canvasTex(64, 96, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, base); gr.addColorStop(.85, base); gr.addColorStop(1, '#f5ede8'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = lunula; g.beginPath(); g.ellipse(W / 2, 8, W * .33, 14, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(235,222,214,.75)'; g.fillRect(0, H - 8, W, 8);
    g.strokeStyle = 'rgba(120,70,60,.18)'; g.lineWidth = 1; for (let x = 8; x < W; x += 6) { g.beginPath(); g.moveTo(x, 10); g.lineTo(x, H - 8); g.stroke(); }
  }, {});
}
export function buildNails(human, BD, F) {
  const R = human.rest, bones = human.bones, skel = BD.bones, out = [];
  const tex = nailTexture(); const mat = new THREE.MeshPhysicalMaterial({ map: tex, color: 0xd8cfca, roughness: .5, clearcoat: .2, clearcoatRoughness: .3, envMap: F?.env || null, envMapIntensity: .12, transparent: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const idx = (n) => skel.findIndex(b => b.name === n);
  for (const s of ['l', 'r']) {
    const palm = human.hand[s].palmRest.clone().normalize(), dors = palm.clone().negate();
    for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
      const bn = `${f}_03_${s}`, bi = idx(bn); if (bi < 0) continue;
      const p2 = R[`${f}_02_${s}`], p3 = R[bn]; const dir = p3.clone().sub(p2).normalize();
      // vértices del dedo distal
      const pts = [];
      for (let i = 0; i < BD.n; i++) { let w = 0; for (let k = 0; k < 4; k++) if (BD.si[i * 4 + k] === bi) w += BD.sw[i * 4 + k]; if (w > .5) pts.push(V3(BD.pos[i * 3], BD.pos[i * 3 + 1], BD.pos[i * 3 + 2])); }
      if (pts.length < 6) continue;
      let tip = -1e9; for (const p of pts) tip = Math.max(tip, p.dot(dir));
      const at = tip - .0072; let top = null, topD = -1e9, lat = [1e9, -1e9];
      const side = V3().crossVectors(dir, dors).normalize();
      for (const p of pts) { if (Math.abs(p.dot(dir) - at) < .0045) { const d = p.dot(dors); if (d > topD) { topD = d; top = p.clone(); } } if (Math.abs(p.dot(dir) - at) < .006) { const sv = p.dot(side); lat = [Math.min(lat[0], sv), Math.max(lat[1], sv)]; } }
      if (!top) continue;
      const width = Math.min(.0135, (lat[1] - lat[0]) * .78 || .01), len = f === 'thumb' ? .0125 : f === 'pinky' ? .0095 : .0113;
      // marco local: x = lado, y = normal dorsal, z = hacia la punta
      const geo = new THREE.PlaneGeometry(width, len, 8, 8); const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i); const t = x / (width / 2); pos.setZ(i, -(t * t) * .0022 + Math.max(0, y / len) * .0007); }
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mat); mesh.name = 'nail_' + bn;
      const basis = new THREE.Matrix4().makeBasis(side, dir, dors); mesh.quaternion.setFromRotationMatrix(basis);
      // el plano (x,y) mira +z en local → z local = dorsal; convertir a coordenadas del hueso
      const centre = top.clone().addScaledVector(dir, -.0012).addScaledVector(dors, .0004);
      mesh.position.copy(centre).sub(R[bn]); mesh.castShadow = true; mesh.receiveShadow = true;
      bones[bn].add(mesh); out.push(mesh);
    }
  }
  return out;
}


/* normales suaves por posición (el pelo del modelo base trae caras planas con aristas duras) */
function weldNormals(geo) {
  if (geo.userData.welded) return; geo.userData.welded = true; geo.computeVertexNormals();
  const P = geo.attributes.position, N = geo.attributes.normal, key = new Map(), sum = [];
  const ids = new Int32Array(P.count);
  for (let i = 0; i < P.count; i++) { const k = Math.round(P.getX(i) * 4000) + ',' + Math.round(P.getY(i) * 4000) + ',' + Math.round(P.getZ(i) * 4000); let id = key.get(k); if (id === undefined) { id = sum.length; key.set(k, id); sum.push([0, 0, 0]); } ids[i] = id; const a = sum[id]; a[0] += N.getX(i); a[1] += N.getY(i); a[2] += N.getZ(i); }
  for (let i = 0; i < P.count; i++) { const a = sum[ids[i]], l = Math.hypot(a[0], a[1], a[2]) || 1; N.setXYZ(i, a[0] / l, a[1] / l, a[2] / l); } N.needsUpdate = true;
}
/* capas de hebras: copias infladas del pelo con alfa de ruido vertical (efecto "fur shells") → volumen, hebras sueltas y borde suave */
function hairShells(human, o, base) {
  const topY = human.b.head.getWorldPosition(new THREE.Vector3()).y + human.H.cy + human.H.hh * .5;
  const q = human.q?.name || 'high', n = q === 'high' ? 6 : q === 'mid' ? 3 : 0; if (!n || !o.parent) return;
  for (let i = 1; i <= n; i++) {
    const t = i / n, m = new THREE.MeshStandardMaterial({ map: base.map, alphaMap: base.alphaMap, color: base.color.clone().multiplyScalar(.5 + .4 * t), roughness: .5, metalness: 0, side: THREE.DoubleSide, alphaTest: .35, envMap: base.envMap, envMapIntensity: .2 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uShell = { value: t }; sh.uniforms.uTop = { value: topY };
      sh.vertexShader = 'uniform float uShell, uTop; varying vec3 vHP;\n' + sh.vertexShader.replace('#include <skinning_vertex>', '#include <skinning_vertex>\n vHP=position; transformed += normalize(objectNormal) * uShell * .0042 * (1.-smoothstep(uTop-.02,uTop+.02,position.y));');
      sh.fragmentShader = 'uniform float uShell; varying vec3 vHP;\nfloat hh(vec3 p){ p=fract(p*.3183099+.1); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }\nfloat hv(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f); return mix(mix(mix(hh(i),hh(i+vec3(1,0,0)),f.x),mix(hh(i+vec3(0,1,0)),hh(i+vec3(1,1,0)),f.x),f.y),mix(mix(hh(i+vec3(0,0,1)),hh(i+vec3(1,0,1)),f.x),mix(hh(i+vec3(0,1,1)),hh(i+vec3(1,1,1)),f.x),f.y),f.z); }\n' +
        sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n { float st=hv(vec3(vHP.x*520.,vHP.y*46.,vHP.z*520.))*.65+hv(vec3(vHP.x*1100.,vHP.y*90.,vHP.z*1100.))*.35; if(st<uShell*.9+.02) discard; diffuseColor.rgb*=.7+.3*st; }');
    };
    m.customProgramCacheKey = () => 'hairshell';
    const sm = o.isSkinnedMesh ? new THREE.SkinnedMesh(o.geometry, m) : new THREE.Mesh(o.geometry, m);
    sm.name = 'hairshell' + i; sm.position.copy(o.position); sm.quaternion.copy(o.quaternion); sm.scale.copy(o.scale); sm.frustumCulled = false; sm.castShadow = false; sm.receiveShadow = false; sm.userData.noMerge = true;
    o.parent.add(sm); if (o.isSkinnedMesh) sm.bind(o.skeleton, o.bindMatrix);
  }
}

/* -------- ojos y cara: sclera/iris/córnea/cejas/pestañas -------- */
export function refineFace(human, F) {
  const eyeTex = (kind) => canvasTex(512, 256, (g, W, H) => {
    // esclerótica cálida con venas y sombra hacia los bordes, iris con anillo límbico y fibras
    const sc = g.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, W * .5); sc.addColorStop(0, '#f0e7de'); sc.addColorStop(.7, '#e6d9cd'); sc.addColorStop(1, '#c9a79b'); g.fillStyle = sc; g.fillRect(0, 0, W, H);
    const r = seed(13); g.strokeStyle = 'rgba(190,80,70,.35)'; g.lineWidth = 1.2;
    for (let i = 0; i < 40; i++) { let x = r() < .5 ? r() * 90 : W - r() * 90, y = H * (.3 + r() * .4); g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (W / 2 - x) * .08 + (r() - .5) * 10; y += (r() - .5) * 12; g.lineTo(x, y); } g.stroke(); }
  }, {});
  human.scene.traverse(o => {
    if (!o.isMesh || !o.material) return; const k = o.material.userData?.kind || o.material.name;
    if (k === 'hair') { const old = o.material; const m = new THREE.MeshPhysicalMaterial({ map: old.map, alphaMap: old.alphaMap, color: old.color, roughness: .45, metalness: 0, side: THREE.DoubleSide, alphaTest: .35, transparent: false, sheen: 1, sheenRoughness: .35, sheenColor: new THREE.Color(0x6a5a4a), anisotropy: .7, envMap: F?.env || null, envMapIntensity: .22, specularIntensity: .8 }); m.name = 'hair'; m.userData.kind = 'hair'; o.material = m; weldNormals(o.geometry); hairShells(human, o, m); }
    if (k === 'eyelashes') { o.material.color.set(0x0a0806); o.material.roughness = .5; }
    if (k === 'eyebrows') { o.material.roughness = .7; }
    if (k === 'eye') { o.material.color.set(0xd6cbc0); o.material.roughness = .22; }
    if (k === 'teeth') { const t = o.material; t.color.set(0xdcd0ba); t.roughness = .34; t.envMapIntensity = .25; }
    if (k === 'tongue') { const t = o.material; t.color.multiplyScalar(.92); t.roughness = .3; }
    if (k === 'cornea') { const c = o.material; c.roughness = .04; c.opacity = .07; c.envMapIntensity = .7; }
  });
}
