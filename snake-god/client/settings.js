import { DEFAULT_COSMETICS, sanitizeCosmetics } from "/shared/cosmetics.js";
import { AUDIO_DEFAULTS } from "./audio/AudioManager.js";

const SETTINGS_KEY = "snakegod.settings";
const PROFILE_KEY = "snakegod.profile";

export const QUALITY = {
    low: { label: "Basse", pixelRatio: 1, shadows: false, bloom: false, particles: 0.4 },
    medium: { label: "Moyenne", pixelRatio: 1.25, shadows: true, bloom: true, particles: 0.7 },
    high: { label: "Haute", pixelRatio: 2, shadows: true, bloom: true, particles: 1 },
};

export const DEFAULT_SETTINGS = {
    quality: "high",
    bloom: true,
    cameraDistance: 1, // multiplicateur de la caméra à la troisième personne
    fov: 62,
    screenShake: true,
    showHelp: true,
    matchDuration: 90, // secondes, 0 = illimitée (solo, démonstration, salons créés)
    audio: AUDIO_DEFAULTS, // volumes et coupures par catégorie
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
        this.values = { ...DEFAULT_SETTINGS, audio: structuredClone(AUDIO_DEFAULTS) };
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
