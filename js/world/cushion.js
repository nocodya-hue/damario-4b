/* =========================================================
   CUSHION — cojines modelados de verdad: caja subdividida y redondeada, abombada,
   con huellas de asiento (hundimiento) y botones de capitoné. La geometría sale ya con la
   deformación de quien se sienta: el cuerpo descansa en un hueco real del cojín.
   ========================================================= */
import * as THREE from 'three';
import { worldUV } from './materials.js';

const gauss = (d2, r) => Math.exp(-d2 / (r * r));

/* opts: seg (m por segmento), puff (abombado central), dents [{x,z,r,d, rz?}] hundimientos en la cara superior,
   tufts {nx,nz,d,r,face:'top'|'front'} botones capitoné, sag (hundimiento general del centro) */
export function cushionGeo(w, h, d, r, o = {}) {
  const seg = o.seg || .03, sx = Math.max(4, Math.ceil(w / seg)), sy = Math.max(3, Math.ceil(h / seg)), sz = Math.max(4, Math.ceil(d / seg));
  const g = new THREE.BoxGeometry(w, h, d, sx, sy, sz), P = g.attributes.position;
  const ix = w / 2 - r, iy = h / 2 - r, iz = d / 2 - r, v = new THREE.Vector3(), q = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i);
    q.set(Math.max(-ix, Math.min(ix, v.x)), Math.max(-iy, Math.min(iy, v.y)), Math.max(-iz, Math.min(iz, v.z))); n.copy(v).sub(q);
    if (n.lengthSq() > 1e-12) { n.normalize(); v.copy(q).addScaledVector(n, r); }
    const top = Math.max(0, v.y / (h / 2)), fx = 1 - Math.pow(v.x / (w / 2), 2), fz = 1 - Math.pow(v.z / (d / 2), 2);
    if (o.puff) v.y += o.puff * Math.max(0, fx) * Math.max(0, fz) * (top > 0 ? top : top * .3);
    if (o.puffFront && v.z > 0) v.z += o.puffFront * Math.max(0, fx) * Math.max(0, 1 - Math.pow(v.y / (h / 2), 2)) * (v.z / (d / 2));
    if (o.dents && v.y > 0) for (const t of o.dents) { const dd = ((v.x - t.x) ** 2) + (((v.z - t.z) * (t.rz ? t.r / t.rz : 1)) ** 2); v.y -= t.d * gauss(dd, t.r) * top; }
    if (o.tufts) { const tf = o.tufts;
      if (tf.face === 'front' ? v.z > 0 : v.y > 0) for (let a = 0; a < tf.nx; a++) for (let b = 0; b < tf.nz; b++) {
        const cx = -w / 2 + w * (a + .5 + ((b % 2) ? .5 : 0) * (tf.stagger ?? 1)) / tf.nx, cz = -(tf.face === 'front' ? h : d) / 2 + (tf.face === 'front' ? h : d) * (b + .5) / tf.nz;
        const ux = v.x - cx, uz = (tf.face === 'front' ? v.y : v.z) - cz, dd = ux * ux + uz * uz;
        const dep = tf.d * gauss(dd, tf.r) * (tf.face === 'front' ? Math.max(0, v.z / (d / 2)) : top);
        if (tf.face === 'front') v.z -= dep; else v.y -= dep;
      } }
    P.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return worldUV(g, o.uv || 1);
}

export function cushion(mat, w, h, d, r, o = {}, mo = {}) {
  const m = new THREE.Mesh(cushionGeo(w, h, d, r, o), mat);
  m.position.set(mo.x || 0, mo.y || 0, mo.z || 0); if (mo.rx) m.rotation.x = mo.rx; if (mo.ry) m.rotation.y = mo.ry; if (mo.rz) m.rotation.z = mo.rz;
  m.castShadow = true; m.receiveShadow = true; if (mo.col) m.userData.col = mo.col; if (mo.soft) m.userData.soft = mo.soft;
  m.geometry.userData.box = [w, h, d];
  if (mo.parent) mo.parent.add(m); return m;
}
