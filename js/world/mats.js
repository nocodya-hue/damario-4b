/* Catálogo de materiales del salón: cada material responde distinto a la luz */
import * as THREE from 'three';
import { canvasTex } from './materials.js';

export function buildMats(F) {
  const M = {};
  // --- arquitectura ---
  M.brick = F.pbr('red_brick', { size: 1.1, color: 0xc9a79c, normal: 1.4 });
  M.brickWhite = F.pbr('red_brick', { diffuse: 'brick_white', size: 1.1, color: 0xf2ebe0, normal: 1.6, rough: 1 });
  M.concrete = F.pbr('concrete_layers', { size: 2.2, color: 0xf0eae2, normal: 1.1 });
  M.concreteDark = F.pbr('concrete_layers', { size: 2.2, color: 0xe9e0d2, normal: 1.1 });
  M.plaster = F.pbr('concrete_wall_008', { size: 2.6, color: 0x9d979e, normal: .8 });
  M.plasterWarm = F.pbr('concrete_wall_008', { size: 2.6, color: 0xd8c9b6, normal: .6 });
  M.floor = F.pbr('rectangular_parquet', { size: 1.6, color: 0xc0a58a, normal: .9 });
  M.ceiling = F.pbr('concrete_layers', { size: 2.6, color: 0xe4ded6, normal: 1 });
  M.steel = F.std({ color: 0x141312, roughness: .42, metalness: .85 });
  M.steelBrushed = F.std({ color: 0x9a9a98, roughness: .38, metalness: 1 });
  M.duct = F.pbr('corrugated_iron', { size: .5, rot: Math.PI / 2, color: 0xd8dade, metal: 1, rough: .75, normal: 1.4 });
  M.blackPlastic = F.std({ color: 0x0c0c0c, roughness: .35, metalness: .1 });
  M.glass = F.phys({ color: 0xcfe2f2, roughness: .03, metalness: 0, transparent: true, opacity: .07, envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide });
  M.glassThick = F.phys({ color: 0xdcecf4, roughness: .02, metalness: 0, transparent: true, opacity: .18, envMapIntensity: 1.8, depthWrite: false, clearcoat: 1, side: THREE.DoubleSide });
  // --- maderas ---
  M.walnut = F.pbr('black_walnut_veneer_02', { size: 1.1, color: 0x8a5f3e, rough: .9, normal: .6 });
  M.walnutDark = F.pbr('black_walnut_veneer_02', { size: 1.1, color: 0x4a2f20, rough: .95, normal: .6 });
  M.deskWood = F.pbr('wooden_planks', { size: 1.2, color: 0xc9a074, normal: 1 });
  M.plank = F.pbr('brown_planks_09', { size: 1.4, color: 0xb59a7c, normal: 1 });
  // --- telas ---
  M.sofaFabric = F.pbr('poly_wool_herringbone', { size: .55, color: 0xd8ced4, normal: 1.1, rough: 1 });
  M.velvetRed = F.pbr('velour_velvet', { diffuse: 'velvet_gray', size: .35, color: 0xb2101c, normal: .6 });
  M.velvetGreen = F.pbr('velour_velvet', { diffuse: 'velvet_gray', size: .35, color: 0x0f7a44, normal: .6 });
  M.velvetOrange = F.pbr('velour_velvet', { diffuse: 'velvet_gray', size: .35, color: 0xff6a1a, normal: .6 });
  M.velvetPink = F.pbr('velour_velvet', { diffuse: 'velvet_gray', size: .35, color: 0xe8579a, normal: .6 });
  // velvet: brillo de tela en los bordes
  for (const k of ['velvetRed', 'velvetGreen', 'velvetOrange', 'velvetPink']) { const m = M[k]; m.roughness = 1; }
  // --- pintura brillante / lacados ---
  M.lacquerOrange = F.phys({ color: 0xff5a14, roughness: .28, metalness: 0, clearcoat: .8, clearcoatRoughness: .2 });
  M.lacquerRed = F.phys({ color: 0xd3210f, roughness: .25, clearcoat: 1, clearcoatRoughness: .12 });
  M.redGloss = F.phys({ color: 0xff2a10, roughness: .12, clearcoat: 1, clearcoatRoughness: .05, emissive: 0x330500, emissiveIntensity: .6 });
  M.cream = F.std({ color: 0xe9dcc4, roughness: .55 });
  M.brass = F.std({ color: 0xc9994a, roughness: .28, metalness: 1 });
  M.chrome = F.std({ color: 0xdcdcdc, roughness: .12, metalness: 1 });
  M.blackMetal = F.std({ color: 0x1a1a1a, roughness: .5, metalness: .8 });
  M.ceramicWhite = F.phys({ color: 0xf2eee4, roughness: .25, clearcoat: .6 });
  M.terracotta = F.std({ color: 0xa9563a, roughness: .85 });
  M.potWhite = F.phys({ color: 0xf1ede6, roughness: .32, clearcoat: .5 });
  M.soil = F.std({ color: 0x241810, roughness: 1 });
  M.leaf = F.std({ color: 0x1f5a2c, roughness: .55, side: THREE.DoubleSide });
  M.paper = F.std({ color: 0xf1ead8, roughness: .95 });
  M.rubber = F.std({ color: 0x141414, roughness: .8 });
  M.cable = F.std({ color: 0x111111, roughness: .6 });
  M.candle = F.phys({ color: 0xfff1d4, roughness: .5, emissive: 0xffc88a, emissiveIntensity: .2 });
  // --- luces visibles ---
  M.bulbWarm = F.glow(0xffc27a, 3.2, { color: 0xffe2b8 });
  M.bulbRed = F.glow(0xff3a1a, 3.4, { color: 0xff5a30 });
  M.opal = new THREE.MeshPhysicalMaterial({ color: 0xfff4e4, emissive: 0xffd9a8, emissiveIntensity: 1.6, roughness: .35, transmission: 0, clearcoat: .5 });
  M.neonRed = F.glow(0xff2418, 3.6, { color: 0xff4030 });
  return M;
}
