// Apparence des Snakes : espèces (skins), accessoires, traînées et paliers d'évolution.
// Purement visuel : le serveur ne fait que valider et relayer ces choix.

export const SKINS = {
    neon: {
        name: "Néon",
        description: "Écailles cyan électriques.",
        primary: 0x22e6ff,
        secondary: 0x063a7a,
        glow: 0x8ff8ff,
        belly: 0xc8fbff,
        eye: 0xfff35c,
        pattern: "scales",
    },
    magma: {
        name: "Magma",
        description: "Peau de roche fendue de lave.",
        primary: 0xff7a1a,
        secondary: 0x3a0800,
        glow: 0xffc04d,
        belly: 0xffd9a8,
        eye: 0xfff1a8,
        pattern: "cracks",
    },
    venom: {
        name: "Venin",
        description: "Rayures toxiques fluorescentes.",
        primary: 0x7dff4d,
        secondary: 0x0f3a14,
        glow: 0xe2ff6b,
        belly: 0xe9ffd0,
        eye: 0xff3355,
        pattern: "stripes",
    },
    spectre: {
        name: "Spectre",
        description: "Corps translucide gravé de runes.",
        primary: 0xc9b8ff,
        secondary: 0x2a1a5e,
        glow: 0xf0e6ff,
        belly: 0xffffff,
        eye: 0x6bfff0,
        pattern: "runes",
    },
    royal: {
        name: "Royal",
        description: "Or massif et losanges sombres.",
        primary: 0xffcf3d,
        secondary: 0x4a2200,
        glow: 0xfff2a8,
        belly: 0xfff4d0,
        eye: 0x4dd2ff,
        pattern: "diamonds",
    },
    abyss: {
        name: "Abysse",
        description: "Créature des profondeurs, taches bioluminescentes.",
        primary: 0x2b5cff,
        secondary: 0x040a2e,
        glow: 0xb06bff,
        belly: 0x9fb8ff,
        eye: 0xff4df0,
        pattern: "spots",
    },
};

export const ACCESSORIES = {
    none: { name: "Aucun" },
    horns: { name: "Cornes" },
    crown: { name: "Couronne" },
    crest: { name: "Crête" },
    visor: { name: "Visière" },
};

export const TRAILS = {
    sparks: { name: "Étincelles" },
    embers: { name: "Braises" },
    stardust: { name: "Poussière d'étoiles" },
    none: { name: "Aucune" },
};

// Le Snake évolue en grandissant : nouvelles parties du corps et effets.
export const EVOLUTIONS = [
    { tier: 1, minLength: 0, name: "Éclosion" },
    { tier: 2, minLength: 7, name: "Chasseur" }, // nageoires dorsales
    { tier: 3, minLength: 13, name: "Prédateur" }, // veines lumineuses, cornes d'énergie
    { tier: 4, minLength: 21, name: "Légende" }, // aura et halo
];

export function evolutionFor(length) {
    let current = EVOLUTIONS[0];
    for (const e of EVOLUTIONS) if (length >= e.minLength) current = e;
    return current;
}

export const DEFAULT_COSMETICS = {
    snake1: { skin: "neon", accessory: "none", trail: "sparks" },
    snake2: { skin: "magma", accessory: "horns", trail: "embers" },
};

// Garde uniquement des valeurs connues.
export function sanitizeCosmetics(c, fallback = DEFAULT_COSMETICS.snake1) {
    const pick = (v, table, def) => (typeof v === "string" && table[v] ? v : def);
    return {
        skin: pick(c?.skin, SKINS, fallback.skin),
        accessory: pick(c?.accessory, ACCESSORIES, fallback.accessory),
        trail: pick(c?.trail, TRAILS, fallback.trail),
    };
}
