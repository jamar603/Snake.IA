// Catalogue des aliments et des pièges (modèles de blender/build_props.py).
// Partagé par le rendu (modèle, couleur des particules) et le son (saveur).
// Purement cosmétique : le gameplay ne dépend jamais de la variante.

export const FOOD_KINDS = [
    { model: "Apple", color: 0xff4a4a, flavor: "crunch" },
    { model: "Pineapple", color: 0xffc93c, flavor: "juicy" },
    { model: "Meat", color: 0xe0764f, flavor: "chomp" },
    { model: "Cherries", color: 0xff3d6e, flavor: "pop" },
    { model: "Carrot", color: 0xff9a2e, flavor: "crunch" },
    { model: "Mushroom", color: 0xff6b7d, flavor: "squish" },
    { model: "Grapes", color: 0xa77bff, flavor: "pop" },
];
export const GOLDEN_FOOD = { model: "GoldenApple", color: 0xffd34d, flavor: "golden" };

// `variant` est tiré par le serveur (FoodSystem) : même aliment pour tous les joueurs.
export function foodKind({ golden = false, kind, variant = 0 } = {}) {
    if (golden || kind === "golden") return GOLDEN_FOOD;
    return FOOD_KINDS[Math.abs(variant) % FOOD_KINDS.length];
}

// Pièges : même règle pour tous (-1 PV), apparence tirée de la case (stable, identique partout).
// RuneMine est la mine historique (blender/build_island.py).
export const TRAP_KINDS = ["SpikeTrap", "JawTrap", "SawTrap", "RuneMine"];

export function trapKind(cell) {
    let h = 2166136261;
    for (const v of cell) h = Math.imul(h ^ (v + 1031), 16777619);
    return TRAP_KINDS[(h >>> 0) % TRAP_KINDS.length];
}
