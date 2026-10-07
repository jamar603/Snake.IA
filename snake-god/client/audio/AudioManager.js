import { impulse } from "./synth.js";

// Catégories sonores. Les quatre familles d'effets passent par le bus "sfx".
export const AUDIO_CATEGORIES = {
    music: { label: "Musique", parent: "master" },
    ambient: { label: "Ambiance", parent: "master" },
    voice: { label: "Voix (annonceur)", parent: "master" },
    sfx: { label: "Effets sonores", parent: "master" },
    snake: { label: "Sons des Snakes", parent: "sfx" },
    god: { label: "Sons du Snake God", parent: "sfx" },
    world: { label: "Sons du monde", parent: "sfx" },
    ui: { label: "Interface", parent: "sfx" },
};

export const AUDIO_DEFAULTS = {
    volume: { master: 0.8, music: 0.55, sfx: 0.85, ambient: 0.5, voice: 0.8 },
    enabled: { music: true, ambient: true, voice: true, sfx: true, snake: true, god: true, world: true, ui: true },
};

// Moteur audio : contexte Web Audio, bus par catégorie (volume + coupure),
// réverbération partagée et audio spatial 3D (auditeur = caméra).
export class AudioManager {
    constructor(settings) {
        this.settings = settings;
        this.ctx = null;
        this.buses = {};
        this.listeners = [];
        // Le navigateur exige une interaction avant de jouer du son.
        const unlock = () => {
            this.#init();
            if (this.ctx?.state === "suspended") this.ctx.resume();
        };
        for (const ev of ["pointerdown", "keydown", "touchstart"]) window.addEventListener(ev, unlock, { capture: true });
        settings.addEventListener("change", () => this.applySettings());
    }

    get ready() {
        return !!this.ctx && this.ctx.state === "running";
    }

    get now() {
        return this.ctx?.currentTime ?? 0;
    }

    // Appelé quand l'audio devient disponible (pour démarrer musique et ambiance).
    onReady(fn) {
        if (this.ctx) fn(this);
        else this.listeners.push(fn);
    }

    #init() {
        if (this.ctx) return;
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        this.ctx = ctx;

        // Limiteur final : évite la saturation quand beaucoup de sons se superposent.
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -10;
        limiter.knee.value = 6;
        limiter.ratio.value = 8;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.2;
        limiter.connect(ctx.destination);

        this.buses.master = ctx.createGain();
        this.buses.master.connect(limiter);
        for (const id of Object.keys(AUDIO_CATEGORIES)) this.buses[id] = ctx.createGain();
        for (const [id, cat] of Object.entries(AUDIO_CATEGORIES)) this.buses[id].connect(this.buses[cat.parent]);

        // Réverbération partagée (envoi) : grands espaces, pouvoirs du dieu.
        this.reverb = ctx.createConvolver();
        this.reverb.buffer = impulse(ctx, 3.2, 2.2);
        this.reverbSend = ctx.createGain();
        this.reverbSend.gain.value = 0.6;
        this.reverbSend.connect(this.reverb).connect(this.buses.master);

        this.applySettings();
        for (const fn of this.listeners) fn(this);
        this.listeners = [];
    }

    applySettings() {
        if (!this.ctx) return;
        const a = this.settings.get("audio") ?? AUDIO_DEFAULTS;
        const vol = { ...AUDIO_DEFAULTS.volume, ...a.volume };
        const on = { ...AUDIO_DEFAULTS.enabled, ...a.enabled };
        const t = this.ctx.currentTime;
        this.buses.master.gain.setTargetAtTime(vol.master, t, 0.05);
        for (const id of Object.keys(AUDIO_CATEGORIES)) {
            const v = (vol[id] ?? 1) * (on[id] ? 1 : 0);
            this.buses[id].gain.setTargetAtTime(v, t, 0.05);
        }
    }

    // Sortie pour un son : bus de catégorie, éventuellement spatialisé et réverbéré.
    // Renvoie le nœud dans lequel brancher le son, ou null si l'audio n'est pas prêt.
    output(category, { position = null, reverb = 0, gain = 1 } = {}) {
        if (!this.ctx) return null;
        const ctx = this.ctx;
        const input = ctx.createGain();
        input.gain.value = gain;
        let node = input;
        if (position) {
            const p = ctx.createPanner();
            p.panningModel = "HRTF";
            p.distanceModel = "inverse";
            p.refDistance = 4;
            p.rolloffFactor = 0.9;
            p.positionX.value = position.x;
            p.positionY.value = position.y;
            p.positionZ.value = position.z;
            node.connect(p);
            node = p;
        }
        node.connect(this.buses[category] ?? this.buses.sfx);
        if (reverb > 0) {
            const send = ctx.createGain();
            send.gain.value = reverb;
            node.connect(send).connect(this.reverbSend);
        }
        // Nettoyage : déconnecte le graphe une fois le son terminé.
        setTimeout(() => input.disconnect(), 8000);
        return input;
    }

    // Joue une "recette" sonore : fn(ctx, out, t) qui fabrique le son.
    play(category, recipe, opts = {}) {
        const out = this.output(category, opts);
        if (!out) return;
        recipe(this.ctx, out, this.ctx.currentTime + (opts.delay ?? 0) + 0.005);
    }

    // L'auditeur suit la caméra : la direction des sons correspond à l'écran.
    updateListener(camera) {
        if (!this.ctx) return;
        const l = this.ctx.listener;
        const p = camera.position;
        const f = camera.getWorldDirection((this.tmpDir ??= camera.position.clone()));
        const u = camera.up;
        if (l.positionX) {
            const t = this.ctx.currentTime;
            l.positionX.setTargetAtTime(p.x, t, 0.02);
            l.positionY.setTargetAtTime(p.y, t, 0.02);
            l.positionZ.setTargetAtTime(p.z, t, 0.02);
            l.forwardX.setTargetAtTime(f.x, t, 0.02);
            l.forwardY.setTargetAtTime(f.y, t, 0.02);
            l.forwardZ.setTargetAtTime(f.z, t, 0.02);
            l.upX.setTargetAtTime(u.x, t, 0.02);
            l.upY.setTargetAtTime(u.y, t, 0.02);
            l.upZ.setTargetAtTime(u.z, t, 0.02);
        } else {
            l.setPosition(p.x, p.y, p.z);
            l.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
        }
    }

    // Annonceur : synthèse vocale du navigateur, sur le bus "voix" (volume et coupure).
    say(text) {
        const a = this.settings.get("audio") ?? AUDIO_DEFAULTS;
        const on = { ...AUDIO_DEFAULTS.enabled, ...a.enabled };
        const vol = { ...AUDIO_DEFAULTS.volume, ...a.volume };
        if (!on.voice || !window.speechSynthesis) return;
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "fr-FR";
        u.rate = 1.05;
        u.pitch = 0.6; // voix grave, solennelle
        u.volume = Math.min(1, vol.voice * vol.master);
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
    }
}
