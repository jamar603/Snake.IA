import * as THREE from "three";

// Conversion cellule de grille -> position 3D (le cube est centré sur l'origine).
export function cellToWorld(cell, size, out = new THREE.Vector3()) {
    const o = (size - 1) / 2;
    return out.set(cell[0] - o, cell[1] - o, cell[2] - o);
}

export function worldToCell(v, size) {
    const o = (size - 1) / 2;
    return [Math.round(v.x + o), Math.round(v.y + o), Math.round(v.z + o)];
}

export const vec = (a) => new THREE.Vector3(a[0], a[1], a[2]);

// CUBE : vide entre le dessous du cube et l'île (la face du bas est jouable).
export const CUBE_GAP = 3;
