# Modelos definitivos (opcionales)

Deja aquí los `.glb` finales; si existen, `js/core/assetSlots.js` los carga en segundo plano
y sustituyen a las piezas procedurales en la misma posición.

    furniture/sofa.glb  rocker.glb  green-chair.glb  tv-unit.glb  desk.glb
    characters/yeray.glb  noa.glb  malik.glb  zuri.glb

- Origen en el suelo, frente hacia +Z, unidades en metros.
- Exportar con Draco (geometría) y KTX2/Basis (texturas) para que pesen poco.
- Personajes: esqueleto con los huesos `hips, spine, chest, neck, head, uArmL, lArmL, uArmR, lArmR, thighL, shinL, thighR, shinR`.

Después añade el nombre del slot a `manifest.json`, p. ej. `{ "slots": ["sofa", "gamer"] }`.
