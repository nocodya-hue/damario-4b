/* =========================================================
   LAYOUT — única fuente de verdad de posiciones (continuidad absoluta)
   Muebles, luces, personajes y cámara leen de aquí: nada cambia de sitio
   entre planos. Metros. +Y arriba, la sala mira al norte (–Z).
   yaw: rotación Y del grupo; un objeto "mira" hacia (sin yaw, cos yaw) porque
   su frente local es +Z.
   ========================================================= */
export const yawTo = (dx, dz) => Math.atan2(dx, dz);

export const L = {
  tv: { x: .7, y: 1.64, z: -4.52, w: 2.05, h: 1.16 },
  sideboard: { x: .65, z: -4.37, w: 4.7, d: .45, h: .55 },
  sofa: { x: -.8, z: -.98, w: 2.7, d: .98, yaw: Math.PI, seatY: .44, chaise: { side: 1, len: .95 } },
  rug: { x: -.35, z: -2.45, w: 4.3, d: 3.1 },
  coffee: { x: -1.3, z: -2.3, w: 1.25, d: .62, h: .4 },
  sideTable: { x: .98, z: -.95, r: .27, h: .55 },
  rocker: { x: -2.5, z: -3.05, yaw: yawTo(.75, .66) },
  greenChair: { x: 2.3, z: -1.95, yaw: yawTo(-.95, -.05) },
  pendant: { x: -2.95, y: 1.6, z: -2.4 },
  mushroomLamp: { x: -2.55, z: -4.15 },
  twinLamp: { x: -1.88, z: -4.1 },
  monstera: { x: -2.9, z: -4.0 },
  plant2: { x: -2.2, z: -4.02 },
  brassLamp: { x: 2.55, z: -4.37, y: .55 },
  onAir: { x: 1.75, z: -4.4, y: .55 },
  desk: { x: 2.77, z: 2.6, w: .85, len: 1.9, h: .76 },
  stool: { x: 2.1, z: 2.62 },
  notebook: { x: 2.72, y: .775, z: 2.62, w: .42, d: .30 },      // ancho a lo largo de z (lector), alto hacia +x
  deskLamp: { x: 3.02, z: 2.0 },
  windowB: { z: 2.15 }, windowA: { z: -2.15 },
};

/* Asientos/poses de referencia para los personajes */
export const SEAT = {
  gamer: { x: -.8, z: -1.14, y: .45 },            // cojín central del sofá
  phone: { x: L.rocker.x, z: L.rocker.z, y: .36 },
  smoker: { x: L.greenChair.x, z: L.greenChair.z, y: .38 },
  artist: { x: L.stool.x, z: L.stool.z, y: .5 },
};
