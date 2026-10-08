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

const MAX_VOICES = 18; // départs de sons par quart de seconde, au plus

// Moteur audio : contexte Web Audio, bus par catégorie (volume + coupure),
// réverbération partagée et audio spatial 3D (auditeur = caméra).
export class AudioManager {
    constructor(settings) {
        this.settings = settings;
        this.ctx = null;
        this.buses = {};
        this.listeners = [];
        this.recent = new Map(); // recette -> dernier départ (anti-doublon)
        this.starts = []; // départs récents (limite de voix)
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

        // Chaîne master : compression "glue", couleur (graves ronds, aigus brillants), limiteur.
        const glue = ctx.createDynamicsCompressor();
        glue.threshold.value = -18;
        glue.knee.value = 10;
        glue.ratio.value = 2.5;
        glue.attack.value = 0.02;
        glue.release.value = 0.25;
        const lowShelf = ctx.createBiquadFilter();
        lowShelf.type = "lowshelf";
        lowShelf.frequency.value = 90;
        lowShelf.gain.value = 2.5;
        const highShelf = ctx.createBiquadFilter();
        highShelf.type = "highshelf";
        highShelf.frequency.value = 7000;
        highShelf.gain.value = 2;
        // Limiteur final : évite la saturation quand beaucoup de sons se superposent.
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -10;
        limiter.knee.value = 6;
        limiter.ratio.value = 8;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.2;
        glue.connect(lowShelf).connect(highShelf).connect(limiter).connect(ctx.destination);

        this.buses.master = ctx.createGain();
        this.buses.master.connect(glue);
        for (const id of Object.keys(AUDIO_CATEGORIES)) this.buses[id] = ctx.createGain();
        for (const [id, cat] of Object.entries(AUDIO_CATEGORIES)) this.buses[id].connect(this.buses[cat.parent]);

        // Réverbération partagée (envoi) : grands espaces, pouvoirs du dieu.
        this.reverb = ctx.createConvolver();
        this.reverb.buffer = impulse(ctx, 2.2, 2.8); // pièce chaleureuse plutôt que cathédrale
        this.reverbSend = ctx.createGain();
        this.reverbSend.gain.value = 0.6;
        this.reverbSend.connect(this.reverb).connect(this.buses.master);

        // Écho stéréo "ping-pong" partagé (envoi) : arpèges, pickups, signatures du dieu.
        this.echoSend = ctx.createGain();
        const left = ctx.createDelay(2);
        const right = ctx.createDelay(2);
        left.delayTime.value = 0.28;
        right.delayTime.value = 0.28;
        const feedback = ctx.createGain();
        feedback.gain.value = 0.38;
        const tone = ctx.createBiquadFilter();
        tone.type = "lowpass";
        tone.frequency.value = 3800;
        const merger = ctx.createChannelMerger(2);
        this.echoSend.connect(left);
        left.connect(tone).connect(right);
        right.connect(feedback).connect(left);
        left.connect(merger, 0, 0);
        right.connect(merger, 0, 1);
        const echoOut = ctx.createGain();
        echoOut.gain.value = 0.5;
        merger.connect(echoOut).connect(this.buses.master);
        this.echoDelays = [left, right];

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
    // `echo` : envoi vers l'écho stéréo ; `reverb` : envoi vers la réverbération.
    output(category, { position = null, reverb = 0, echo = 0, gain = 1, hrtf = false } = {}) {
        if (!this.ctx) return null;
        const ctx = this.ctx;
        const input = ctx.createGain();
        input.gain.value = gain;
        let node = input;
        if (position) {
            const p = ctx.createPanner();
            // HRTF (convolution par oreille) coûte cher : réservé aux sons qui le demandent.
            p.panningModel = hrtf ? "HRTF" : "equalpower";
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
        if (echo > 0) {
            const send = ctx.createGain();
            send.gain.value = echo;
            node.connect(send).connect(this.echoSend);
        }
        // Nettoyage : déconnecte le graphe une fois le son terminé.
        setTimeout(() => input.disconnect(), 8000);
        return input;
    }

    // Cale l'écho sur le tempo de la musique (croche pointée).
    setTempo(bpm) {
        if (!this.echoDelays) return;
        const time = (60 / bpm) * 0.75;
        for (const d of this.echoDelays) d.delayTime.setTargetAtTime(time, this.ctx.currentTime, 0.5);
    }

    // Joue une "recette" sonore : fn(ctx, out, t) qui fabrique le son.
    // Garde-fous : rien quand l'onglet est caché (sinon les sons accumulés partent tous au
    // retour), pas deux fois la même recette en moins de 40 ms (même délai), et au plus
    // MAX_VOICES départs par quart de seconde (les sons d'interface et de pas sautent d'abord).
    play(category, recipe, opts = {}) {
        if (!this.ctx || this.ctx.state !== "running" || document.hidden) return;
        const now = performance.now();
        const id = opts.id ?? recipe;
        const dedupeKey = `${opts.delay ?? 0}`;
        const last = this.recent.get(id);
        if (last && last.key === dedupeKey && now - last.at < 40) return;
        this.recent.set(id, { at: now, key: dedupeKey });
        if (this.recent.size > 200) this.recent.clear();
        while (this.starts.length && now - this.starts[0] > 250) this.starts.shift();
        const busy = this.starts.length;
        if (busy >= MAX_VOICES || (busy >= MAX_VOICES * 0.6 && (category === "ui" || opts.minor))) return;
        this.starts.push(now);
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
