import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Pièces du décor modélisées dans Blender (blender/build_island.py), chargées une fois.
// Résout { Island, Tile, TreeTeal, ..., FrameBeam, FrameCorner, Islet }, ou null si
// le fichier manque : chaque utilisateur garde alors son rendu simple.
export const worldPieces = new GLTFLoader()
    .loadAsync("/assets/island.glb")
    .then((gltf) => {
        const pieces = {};
        gltf.scene.traverse((o) => {
            if (o.isMesh) o.castShadow = o.receiveShadow = true;
        });
        for (const child of gltf.scene.children) pieces[child.name] = child;
        return pieces;
    })
    .catch((err) => {
        console.warn("Décor introuvable, rendu simple utilisé :", err);
        return null;
    });
