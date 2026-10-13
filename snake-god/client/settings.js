import { DEFAULT_COSMETICS, sanitizeCosmetics } from "/shared/cosmetics.js";
import { AUDIO_DEFAULTS } from "./audio/AudioManager.js";

const SETTINGS_KEY = "snakegod.settings";
const PROFILE_KEY = "snakegod.profile";

export const QUALITY = {
    low: { label: "Basse", pixelRatio: 1, shadows: false, shadowMap: 1024, bloom: false, ao: false, msaa: 0, particles: 0.4 },
    medium: { label: "Moyenne", pixelRatio: 1.25, shadows: true, shadowMap: 1024, bloom: true, ao: false, msaa: 2, particles: 0.7 },
    high: { label: "Haute", pixelRatio: 2, shadows: true, shadowMap: 2048, bloom: true, ao: true, msaa: 4, particles: 1 },
};

// Ordre des niveaux : la baisse automatique descend d'un cran dans cette liste.
export const QUALITY_LEVELS = ["low", "medium", "high"];

export const DEFAULT_SETTINGS = {
    quality: null, // null : choisie au premier lancement selon la carte graphique (detectQuality)
    qualityAuto: true, // false dès que le joueur choisit une qualité : plus de baisse automatique
    bloom: true,
    cameraDistance: 1, // multiplicateur de la caméra à la troisième personne
    fov: 62,
    screenShake: true,
    showHelp: true,
    matchDuration: 90, // secondes, 0 = illimitée (solo, démonstration, salons créés)
    matchMap: "cube", // "cube" (mode principal) ou "world" (terrain plat, plus accessible)
    audio: AUDIO_DEFAULTS, // volumes et coupures par catégorie
    vibration: true, // vibrations de la manette (si le navigateur les gère)
    bindings: {}, // raccourcis remappés : { keys: { action: [...] }, pad: { action: [...] } }
};

// Paramètres et profil du joueur, gardés dans le navigateur.
export class Settings extends EventTarget {
    constructor() {
        super();
        const saved = read(SETTINGS_KEY) ?? {};
        this.values = { ...DEFAULT_SETTINGS, ...saved };
        this.values.audio = {
            volume: { ...AUDIO_DEFAULTS.volume, ...saved.audio?.volume },
            enabled: { ...AUDIO_DEFAULTS.enabled, ...saved.audio?.enabled },
        };
        if (!QUALITY[this.values.quality]) this.values.quality = detectQuality();
        const p = read(PROFILE_KEY) ?? {};
        this.profile = {
            name: typeof p.name === "string" ? p.name : "",
            cosmetics: sanitizeCosmetics(p.cosmetics, DEFAULT_COSMETICS.snake1),
        };
    }

    // Réglage audio : setAudio("volume", "music", 0.5) ou setAudio("enabled", "god", false).
    setAudio(group, id, value) {
        const audio = structuredClone(this.values.audio);
        audio[group][id] = value;
        this.set("audio", audio);
    }

    get(key) {
        return this.values[key];
    }

    get quality() {
        return QUALITY[this.values.quality] ?? QUALITY.high;
    }

    set(key, value) {
        this.values[key] = value;
        write(SETTINGS_KEY, this.values);
        this.dispatchEvent(new CustomEvent("change", { detail: { key, value } }));
    }

    reset() {
        this.values = { ...DEFAULT_SETTINGS, audio: structuredClone(AUDIO_DEFAULTS), quality: detectQuality() };
        write(SETTINGS_KEY, this.values);
        this.dispatchEvent(new CustomEvent("change", { detail: {} }));
    }

    setProfile(patch) {
        this.profile = {
            name: patch.name ?? this.profile.name,
            cosmetics: sanitizeCosmetics({ ...this.profile.cosmetics, ...patch.cosmetics }, this.profile.cosmetics),
        };
        write(PROFILE_KEY, this.profile);
        this.dispatchEvent(new CustomEvent("profile", { detail: this.profile }));
    }
}

// Qualité de départ selon la carte graphique : rendu logiciel en Basse, puce intégrée
// (portable, PC de bureau sans carte dédiée) en Moyenne, carte dédiée en Haute.
export function detectQuality() {
    let gpu = "";
    try {
        const gl = document.createElement("canvas").getContext("webgl2") ?? document.createElement("canvas").getContext("webgl");
        if (!gl) return "low";
        const info = gl.getExtension("WEBGL_debug_renderer_info");
        gpu = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
        gl.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
        return "medium";
    }
    if (/swiftshader|llvmpipe|software|basic render/i.test(gpu)) return "low";
    if ((navigator.deviceMemory ?? 8) <= 4) return "low";
    if (/intel|uhd|iris|radeon\(tm\) graphics|vega \d+ graphics|mali|adreno|powervr|apple/i.test(gpu)) return "medium";
    return "high";
}

function read(key) {
    try {
        return JSON.parse(localStorage.getItem(key));
    } catch {
        return null;
    }
}

function write(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        /* stockage indisponible : réglages perdus au rechargement */
    }
}
