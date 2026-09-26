/* =========================================================
   Calidad adaptativa
   Tres niveles según dispositivo (o ?q=low|mid|high). Todo lo que cuesta
   (sombras, luces, DOF, partículas, detalle de manos, resolución de texturas)
   sale de aquí, de modo que ningún módulo decide por su cuenta.
   ========================================================= */
const TIERS = {
  high: { name: 'high', dpr: 1.35, shadow: 2048, shadowLights: 2, pointLights: 8, msaa: 2, bloom: true, dof: true, motionBlur: true,
          smoke: 260, dust: 420, fingers: true, aniso: 8, texScale: 1, curtain: 28, plants: 1, hair: 1, merge: true, ssao: true },
  mid:  { name: 'mid', dpr: 1.4, shadow: 1024, shadowLights: 1, pointLights: 5, msaa: 2, bloom: true, dof: true, motionBlur: false,
          smoke: 140, dust: 220, fingers: true, aniso: 4, texScale: 1, curtain: 18, plants: .7, hair: .7, merge: true, ssao: false },
  low:  { name: 'low', dpr: 1.0, shadow: 512, shadowLights: 1, pointLights: 3, msaa: 0, bloom: true, dof: false, motionBlur: false,
          smoke: 70, dust: 90, fingers: false, aniso: 2, texScale: .5, curtain: 10, plants: .5, hair: .45, merge: true, ssao: false },
};

export function pickQuality() {
  const q = new URLSearchParams(location.search).get('q');
  if (q && TIERS[q]) return { ...TIERS[q] };
  const ua = navigator.userAgent || '';
  const touch = matchMedia('(pointer:coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 700;
  const mem = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 8;
  let tier = 'high';
  if (touch && small) tier = 'low';
  else if (touch || /iPad|Tablet/i.test(ua) || mem <= 4 || cores <= 4) tier = 'mid';
  // GPU integrada muy limitada
  try {
    const c = document.createElement('canvas'), gl = c.getContext('webgl2');
    if (!gl) tier = 'low';
    else {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const r = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
      if (/SwiftShader|llvmpipe|Software/i.test(r)) tier = 'low';
    }
  } catch (e) { tier = 'low'; }
  return { ...TIERS[tier] };
}

/* Degradación dinámica: si los fotogramas se alargan, baja el DPR y apaga extras */
export class Governor {
  constructor(q, apply) { this.q = q; this.apply = apply; this.acc = 0; this.n = 0; this.cool = 1; this.level = 0; }
  tick(dt) {
    if (dt > .5) return;
    this.acc += dt; this.n++;
    if (this.acc < 2) return;
    const avg = this.acc / this.n; this.acc = 0; this.n = 0;
    if (this.cool > 0) { this.cool--; return; }
    if (avg > 1 / 34 && this.level < 3) { this.level++; this.cool = 2; this.apply(this.level); }
  }
}
