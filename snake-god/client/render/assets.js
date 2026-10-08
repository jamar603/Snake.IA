import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const loader = new GLTFLoader();

// Charge un .glb de pièces nommées. Résout { Nom: objet }, ou null si le fichier
// manque : chaque utilisateur garde alors son rendu simple.
function loadPieces(url, label) {
    return loader
        .loadAsync(url)
        .then((gltf) => {
            const pieces = {};
            gltf.scene.traverse((o) => {
                if (o.isMesh) o.castShadow = o.receiveShadow = true;
            });
            for (const child of gltf.scene.children) pieces[child.name] = child;
            return pieces;
        })
        .catch((err) => {
            console.warn(`${label} introuvable, rendu simple utilisé :`, err);
            return null;
        });
}

// Décor (blender/build_island.py) : { Island, Tile, TreeTeal, ..., FrameBeam, FrameCorner, Islet, Trap }.
export const worldPieces = loadPieces("/assets/island.glb", "Décor");

// Nourriture et pièges (blender/build_props.py) : { Apple, ..., GoldenApple, SpikeTrap, JawTrap, SawTrap }.
export const propPieces = loadPieces("/assets/props.glb", "Accessoires");
