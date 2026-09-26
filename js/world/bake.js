/* =========================================================
   BAKE — fusiona la geometría estática por material (menos draw calls)
   Solo toca mallas simples: no SkinnedMesh, InstancedMesh, con morph, marcadas
   noMerge, ni las que cuelgan de un grupo animado (userData.dynamic).
   ========================================================= */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function bake(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map(), rem = [];
  const isDyn = (o) => { for (let p = o; p; p = p.parent) if (p.userData && (p.userData.dynamic || p.userData.noMerge)) return true; return false; };
  root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || isDyn(o)) return;
    const geo = o.geometry; if (!geo.attributes.position || !geo.attributes.normal || Array.isArray(o.material)) return;
    if (geo.morphAttributes && Object.keys(geo.morphAttributes).length) return;
    const key = o.material.uuid + '|' + o.castShadow + '|' + o.receiveShadow + '|' + o.renderOrder;
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, ro: o.renderOrder, items: [] });
    buckets.get(key).items.push(o); rem.push(o);
  });
  let saved = 0;
  for (const b of buckets.values()) {
    if (b.items.length < 2) continue;
    const geos = b.items.map((o) => {
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv') g.deleteAttribute(n);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.applyMatrix4(o.matrixWorld); return g;
    });
    const m = mergeGeometries(geos, false); if (!m) continue;
    const mesh = new THREE.Mesh(m, b.mat); mesh.castShadow = b.cast; mesh.receiveShadow = b.recv; mesh.renderOrder = b.ro; mesh.name = 'baked';
    root.add(mesh); saved += b.items.length - 1;
    for (const o of b.items) { o.parent.remove(o); o.geometry.dispose(); }
    geos.forEach(g => g.dispose());
  }
  return saved;
}

/* Igual que bake() pero en el espacio LOCAL de root (para piezas que se mueven como un todo: zapatillas, accesorios) */
export function bakeLocal(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), buckets = new Map(), rel = new THREE.Matrix4();
  root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || Array.isArray(o.material) || !o.geometry.attributes.normal) return;
    const key = o.material.uuid + '|' + o.castShadow; if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, items: [] }); buckets.get(key).items.push(o);
  });
  for (const b of buckets.values()) {
    const geos = b.items.map((o) => { const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv') g.deleteAttribute(n); if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); rel.multiplyMatrices(inv, o.matrixWorld); g.applyMatrix4(rel); return g; });
    const m = mergeGeometries(geos, false); if (!m) continue;
    const mesh = new THREE.Mesh(m, b.mat); mesh.castShadow = b.cast; mesh.receiveShadow = true; root.add(mesh);
    for (const o of b.items) o.parent.remove(o);
  }
}
