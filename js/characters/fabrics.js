/* =========================================================
   FABRICS — materiales de tela con detalle extremo
   Tejidos reales (Poly Haven CC0: denim, algodón, lana, nailon) + shaders:
     · degradado/desteñido por altura (sudadera)
     · arrugas dinámicas en articulaciones (aFold × uCrease)
     · pelusa/sheen de algodón y fibra fina (micro-normal)
   ========================================================= */
import * as THREE from 'three';
import { canvasTex, seed } from '../world/materials.js';

export const CREASE = { value: 0 };          // uniform global de arrugas (lo actualiza el actor)

/* arrugas: desplaza a lo largo de la normal en vértices con aFold, con ruido de baja/alta frecuencia */
export function addCreases(mat, amp = .012, freq = 34) {
  amp *= .62;      // el desplazamiento completo dejaba vetas dentadas y pálidas en la axila (visto en Yeray): pliegues más suaves
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev && prev(sh, r);
    sh.uniforms.uCrease = CREASE;
    sh.vertexShader = 'attribute float aFold; uniform float uCrease; varying float vFold; varying vec3 vRestP;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vFold=aFold; vRestP=position;
        float cn=sin(position.x*${freq.toFixed(1)}+position.y*${(freq * .8).toFixed(1)})*sin(position.z*${(freq * .9).toFixed(1)}-position.y*${(freq * 1.3).toFixed(1)})+.5*sin(position.y*${(freq * 2.7).toFixed(1)}+position.x*${(freq * 1.9).toFixed(1)});
        transformed += objectNormal * max(cn, 0.0) * ${amp.toFixed(4)} * aFold * uCrease;`);
    sh.fragmentShader = 'varying float vFold; varying vec3 vRestP;\n' + sh.fragmentShader;
  };
  mat.customProgramCacheKey = () => 'crease' + amp + freq + (mat.userData.tag || '');
  return mat;
}

/* mezcla vertical entre dos colores según la altura de reposo: sudadera desteñida */
export function verticalFade(mat, y0, y1, dark, light, mottle = .08) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev && prev(sh, r);
    sh.uniforms.uFade = { value: new THREE.Vector4(y0, y1, mottle, 0) }; sh.uniforms.uDark = { value: new THREE.Color(dark) }; sh.uniforms.uLight = { value: new THREE.Color(light) };
    sh.fragmentShader = 'uniform vec4 uFade; uniform vec3 uDark,uLight;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      { float t=smoothstep(uFade.x,uFade.y,vRestP.y); float n=sin(vRestP.x*60.+vRestP.z*44.)*sin(vRestP.y*52.-vRestP.x*30.)*.5+.5;
        vec3 tint=mix(uDark,uLight,clamp(t+(n-.5)*uFade.z,0.,1.)); float lum=dot(diffuseColor.rgb,vec3(.333));
        diffuseColor.rgb=tint*(.55+lum*.9); }`);
  };
  mat.customProgramCacheKey = () => 'vfade' + y0 + y1 + dark + light;
  return mat;
}

/* tela con PBR real + sheen de fibra */
export function fabric(F, name, o = {}) {
  const m = F.pbr(name, { ext: o.ext || 'jpg', size: o.size || .2, rot: o.rot || 0, color: o.color ?? 0xffffff, normal: o.normal ?? 1, rough: o.rough ?? 1 });
  const p = new THREE.MeshPhysicalMaterial({ map: m.map, normalMap: m.normalMap, roughnessMap: m.roughnessMap, normalScale: m.normalScale, color: m.color, roughness: o.rough ?? 1, metalness: o.metal ?? 0, side: THREE.DoubleSide, vertexColors: true,
    sheen: o.sheen ?? .6, sheenRoughness: .5, sheenColor: new THREE.Color(o.sheenColor ?? 0xffffff), envMapIntensity: o.env ?? .3 });
  p.envMap = F.env; p.userData.tag = name;
  if (o.emissive) { p.emissive = new THREE.Color(o.emissive); p.emissiveIntensity = o.emissiveI ?? .1; }
  return p;
}

/* canvas: costuras de pespunte, bandas de canalé, etc. */
export function ribTexture(color = '#1c4cc0', n = 6) {
  return canvasTex(128, 128, (c, W, H) => { c.fillStyle = color; c.fillRect(0, 0, W, H); for (let x = 0; x < W; x += W / n) { const g = c.createLinearGradient(x, 0, x + W / n, 0); g.addColorStop(0, 'rgba(0,0,0,.35)'); g.addColorStop(.5, 'rgba(255,255,255,.08)'); g.addColorStop(1, 'rgba(0,0,0,.35)'); c.fillStyle = g; c.fillRect(x, 0, W / n, H); } }, { repeat: true });
}

/* costuras analíticas (pespuntes) sobre prendas: usa el atributo aSeam = (ángulo, distancia a lo largo/altura, radio)
   lines: [{ kind:'ang', at:rad, off:m, color, dash:m }   costura longitudinal (dos hileras a ±off del centro)
            { kind:'lev', at:m,  off:m, color, dash:m }]  costura circular a la altura/distancia 'at' */
export function seamStitch(mat, lines) {
  const prev = mat.onBeforeCompile;
  const key = JSON.stringify(lines);
  const f = (n) => Number(n).toFixed(5);
  let frag = '';
  for (const L of lines) {
    const col = new THREE.Color(L.color || '#f4f0e4'), c3 = `vec3(${f(col.r)},${f(col.g)},${f(col.b)})`, off = L.off ?? .0035, dash = L.dash ?? .0042;
    if (L.kind === 'ang') frag += `{ float a=vSeam.x-(${f(L.at)}); float d=abs(atan(sin(a),cos(a)))*vSeam.z; float rows=1.-smoothstep(.0007,.0015,abs(d-${f(off)})); ${L.single ? 'rows=1.-smoothstep(.0007,.0015,d);' : ''} float dm=step(fract(vSeam.y/${f(dash)}),.62); float groove=1.-smoothstep(.0004,.0018,d); float on=${L.on === 'limb' ? 'vSeam.w' : L.on === 'torso' ? '(1.-vSeam.w)' : '1.'}; diffuseColor.rgb=mix(diffuseColor.rgb,${c3},rows*dm*.92*on); diffuseColor.rgb*=1.-.4*groove*on*${Number(L.groove ?? 1).toFixed(3)}; }\n`;
    else frag += `{ float d=abs(vSeam.y-(${f(L.at)})); float arc=vSeam.x*vSeam.z; float dm=step(fract(arc/${f(dash)}),.62); float rows=1.-smoothstep(.0007,.0015,abs(d-${f(off)})); ${L.single ? 'rows=1.-smoothstep(.0007,.0015,d);' : ''} float groove=1.-smoothstep(.0004,.0018,d); float on=${L.on === 'limb' ? 'vSeam.w' : L.on === 'torso' ? '(1.-vSeam.w)' : '1.'}; diffuseColor.rgb=mix(diffuseColor.rgb,${c3},rows*dm*.92*on); diffuseColor.rgb*=1.-.4*groove*on*${Number(L.groove ?? 1).toFixed(3)}; }\n`;
  }
  mat.onBeforeCompile = (sh, r) => {
    prev && prev(sh, r);
    sh.vertexShader = 'attribute vec4 aSeam; varying vec4 vSeam;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vSeam=aSeam;');
    sh.fragmentShader = 'varying vec4 vSeam;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n' + frag);
  };
  const pk = mat.customProgramCacheKey ? mat.customProgramCacheKey() : ''; mat.customProgramCacheKey = () => pk + 'seam' + key;
  return mat;
}

/* pespunte rectangular de bolsillo/parche: aPanel = (u,v) en metros desde el centro; hw,hh = semiancho/alto (uniformes por material) */
export function panelStitch(mat, o) {
  const prev = mat.onBeforeCompile, col = new THREE.Color(o.color || '#f4f0e4'), inset = o.inset ?? .0055, dash = o.dash ?? .0042, hwv = o.hw, hhv = o.hh, groove = o.groove ?? 1, dbl = o.double ? 1 : 0;
  mat.onBeforeCompile = (sh, r) => {
    prev && prev(sh, r);
    sh.uniforms.uPanel = { value: new THREE.Vector2(hwv, hhv) }; sh.uniforms.uThread = { value: col };
    sh.vertexShader = 'attribute vec2 aPanel; varying vec2 vPanel;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vPanel=aPanel;');
    sh.fragmentShader = 'uniform vec2 uPanel; uniform vec3 uThread; varying vec2 vPanel;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      { vec2 q=uPanel-abs(vPanel); float d=min(q.x,q.y);
        float arc=(q.x<q.y)?vPanel.y:vPanel.x; float dm=step(fract(arc/${dash.toFixed(5)}),.62);
        float row=1.-smoothstep(.0007,.0015,abs(d-${inset.toFixed(5)})); ${dbl ? `row=max(row,1.-smoothstep(.0007,.0015,abs(d-${(inset * 2).toFixed(5)})));` : ''}
        float edge=1.-smoothstep(.0004,.0022,d);
        diffuseColor.rgb=mix(diffuseColor.rgb,uThread,row*dm*step(0.,d)*.92); diffuseColor.rgb*=1.-.45*edge*${groove.toFixed(2)}; }`);
  };
  const pk = mat.customProgramCacheKey ? mat.customProgramCacheKey() : ''; mat.customProgramCacheKey = () => pk + 'panel' + dash + inset + dbl + groove;
  return mat;
}

/* variante de un material con pespunte de panel propio (uniformes por bolsillo) */
export function withPanel(mat, o) { const m = mat.clone(); m.onBeforeCompile = mat.onBeforeCompile; m.customProgramCacheKey = mat.customProgramCacheKey; m.userData = { ...mat.userData }; return panelStitch(m, o); }

/* Sisas recortadas por shader: se descartan los fragmentos dentro de una cápsula vertical (en espacio de reposo) alrededor de cada hombro.
   El borde queda liso a cualquier distancia (no depende de la resolución de la malla). cuts: [{ c: Vector3 (extremo inferior), h: altura, R }] (2 máx.) */
export function armholeCut(mat, cuts) {
  const prev = mat.onBeforeCompile, U = cuts.map(k => new THREE.Vector4(k.c.x, k.c.y, k.c.z, k.R)), H = cuts.map(k => k.h);
  mat.onBeforeCompile = (sh, r) => {
    prev && prev(sh, r);
    sh.uniforms.uAhA = { value: U[0] }; sh.uniforms.uAhB = { value: U[1] || new THREE.Vector4(0, -9, 0, 0) }; sh.uniforms.uAhH = { value: new THREE.Vector2(H[0], H[1] ?? 0) };
    sh.vertexShader = 'varying vec3 vAhP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vAhP=position;');
    sh.fragmentShader = 'varying vec3 vAhP; uniform vec4 uAhA,uAhB; uniform vec2 uAhH;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      { float qa=clamp(vAhP.y-uAhA.y,0.,uAhH.x); if(length(vAhP-vec3(uAhA.x,uAhA.y+qa,uAhA.z))<uAhA.w) discard;
        float qb=clamp(vAhP.y-uAhB.y,0.,uAhH.y); if(length(vAhP-vec3(uAhB.x,uAhB.y+qb,uAhB.z))<uAhB.w) discard; }`);
  };
  const pk = mat.customProgramCacheKey ? mat.customProgramCacheKey() : ''; mat.customProgramCacheKey = () => pk + 'ahcut';
  return mat;
}
