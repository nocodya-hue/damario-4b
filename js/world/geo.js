/* Helpers de geometría: todo con UV en metros, sombras por defecto */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { worldUV } from './materials.js';

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const D2R = Math.PI / 180;

function finish(geo, mat, o) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(o.x || 0, o.y || 0, o.z || 0);
  if (o.rx) m.rotation.x = o.rx; if (o.ry) m.rotation.y = o.ry; if (o.rz) m.rotation.z = o.rz;
  m.castShadow = o.cast !== false; m.receiveShadow = o.receive !== false; if (o.col) m.userData.col = o.col; if (o.soft) m.userData.soft = o.soft;
  if (o.parent) o.parent.add(m);
  return m;
}
export function box(w, h, d, mat, o = {}) { return finish(worldUV(new THREE.BoxGeometry(w, h, d), o.uv || 1), mat, o); }
export function rbox(w, h, d, r, mat, o = {}) {
  const g = new RoundedBoxGeometry(w, h, d, o.seg || 4, r);
  return finish(worldUV(g, o.uv || 1), mat, o);
}
export function cyl(rt, rb, h, mat, o = {}) {
  const g = new THREE.CylinderGeometry(rt, rb, h, o.seg || 24, 1, !!o.open);
  return finish(o.wuv === false ? g : worldUV(g, o.uv || 1), mat, o);
}
export function sph(r, mat, o = {}) {
  const g = new THREE.SphereGeometry(r, o.w || 32, o.h || 20);
  if (o.sx || o.sy || o.sz) g.scale(o.sx || 1, o.sy || 1, o.sz || 1);
  return finish(g, mat, o);
}
export function scaleUV(geo, su, sv) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); uv.needsUpdate = true; return geo; }
export function group(name, x = 0, y = 0, z = 0, ry = 0, parent) { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); g.rotation.y = ry; if (parent) parent.add(g); return g; }
export function shadowOn(obj, cast = true, receive = true) { obj.traverse(c => { if (c.isMesh) { c.castShadow = cast; c.receiveShadow = receive; } }); return obj; }

/* Lámina de "sombra de contacto" (falso AO) bajo muebles y objetos */
let _blob;
export function contact(w, d, strength = .55, o = {}) {
  if (!_blob) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 8, 64, 64, 62); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(.55, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128); _blob = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: _blob, transparent: true, opacity: strength, depthWrite: false, color: o.color ?? 0x000000, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.rotation.x = -Math.PI / 2; m.position.set(o.x || 0, (o.y ?? 0) + .004, o.z || 0); if (o.ry) m.rotation.z = o.ry; m.renderOrder = 1; m.userData.noMerge = true;
  if (o.parent) o.parent.add(m); return m;
}
