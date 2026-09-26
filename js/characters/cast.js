/* =========================================================
   REPARTO — cuatro personajes, cada uno con una de las equipaciones de referencia.
   Cuerpo, cara y pelo salen de los humanos reales (assets/humans/<model>.glb, generados por
   tools/make_humans.py); aquí solo va lo que los sitúa en la historia.
   ========================================================= */
import { L, SEAT, yawTo } from '../world/layout.js';

export const CAST = {
  gamer:  { key: 'gamer',  model: 'yeray', name: 'Yeray', role: 'el jugador',      color: '#ff4a2b', seed: 1.3, at: { x: SEAT.gamer.x,  z: SEAT.gamer.z,  yaw: Math.PI },        seatY: .45 },
  phone:  { key: 'phone',  model: 'noa',   name: 'Noa',   role: 'el del teléfono', color: '#ff7ab0', seed: 2.6, at: { x: L.rocker.x,     z: L.rocker.z,     yaw: L.rocker.yaw },     seatY: .46 },
  smoker: { key: 'smoker', model: 'malik', name: 'Malik', role: 'el que fuma',     color: '#2f9e5f', seed: 4.1, at: { x: L.greenChair.x, z: L.greenChair.z, yaw: L.greenChair.yaw }, seatY: .53 },
  artist: { key: 'artist', model: 'zuri',  name: 'Zuri',  role: 'la grafitera',    color: '#f3c15a', seed: 5.7, at: { x: SEAT.artist.x,  z: SEAT.artist.z,  yaw: Math.PI / 2 },    seatY: .52 },
};
