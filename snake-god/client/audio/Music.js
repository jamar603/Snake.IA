import { midi, noise, tone } from "./synth.js";

// Progressions d'accords par ambiance (fondamentale MIDI, accord majeur ou mineur).
const PROGRESSIONS = {
    calm: [[45, "m"], [41, "M"], [48, "M"], [43, "M"]], // La m – Fa – Do – Sol : exploration
    tense: [[45, "m"], [50, "m"], [40, "M"], [45, "m"]], // La m – Ré m – Mi – La m : danger
    chaos: [[45, "m"], [46, "M"], [45, "m"], [40, "M"]], // La m – Si♭ – La m – Mi : chaos (phrygien)
};
const TRIAD = { m: [0, 3, 7], M: [0, 4, 7] };

// Couches musicales : chacune s'active au-dessus d'un seuil d'intensité.
// Les volumes glissent doucement : jamais de coupure brutale.
const LAYERS = {
    pad: 0,
    bass: 0.18,
    kick: 0.3,
    hat: 0.42,
    arp: 0.48,
    snare: 0.55,
    lead: 0.82,
};

// Musique générative et dynamique : tempo, couches et harmonie suivent
// l'intensité de la partie (phase, taille des Snakes, danger, fin du timer).
export class Music {
    constructor(audio) {
        this.audio = audio;
        this.target = 0.1;
        this.level = 0.1;
        this.step = 0;
        this.bar = 0;
        this.started = false;
        this.mode = "menu";
    }

    start() {
        if (this.started || !this.audio.ctx) return;
        const ctx = this.audio.ctx;
        this.started = true;
        this.out = ctx.createGain();
        this.out.gain.value = 0;
        this.out.gain.setTargetAtTime(0.9, ctx.currentTime, 1.5); // fondu d'entrée
        this.out.connect(this.audio.buses.music);
        this.layers = {};
        for (const id of Object.keys(LAYERS)) {
            const g = ctx.createGain();
            g.gain.value = 0;
            g.connect(this.out);
            this.layers[id] = g;
        }
        // Le pad passe dans un filtre qui s'ouvre avec l'intensité.
        this.padFilter = ctx.createBiquadFilter();
        this.padFilter.type = "lowpass";
        this.padFilter.frequency.value = 700;
        this.padFilter.connect(this.layers.pad);
        this.reverbSend = ctx.createGain();
        this.reverbSend.gain.value = 0.35;
        this.out.connect(this.reverbSend).connect(this.audio.reverbSend);
        this.nextTime = ctx.currentTime + 0.1;
        this.timer = setInterval(() => this.#schedule(), 25);
    }

    // 0 = calme, 1 = tension maximale.
    setIntensity(x) {
        this.target = Math.max(0, Math.min(1, x));
    }

    // Coupe le rythme (fin de partie) ou le relance.
    setMode(mode) {
        this.mode = mode;
        if (!this.out) return;
        const t = this.audio.ctx.currentTime;
        this.out.gain.setTargetAtTime(mode === "silent" ? 0.0001 : mode === "end" ? 0.35 : 0.9, t, mode === "silent" ? 0.3 : 1.2);
    }

    get bpm() {
        return 80 + this.level * 62;
    }

    #mood() {
        if (this.level >= 0.85) return "chaos";
        if (this.level >= 0.55) return "tense";
        return "calm";
    }

    #schedule() {
        const ctx = this.audio.ctx;
        if (ctx.state !== "running") return;
        this.level += (this.target - this.level) * 0.02;
        const t = ctx.currentTime;
        for (const [id, threshold] of Object.entries(LAYERS)) {
            const on = this.level >= threshold && (this.mode !== "end" || id === "pad");
            this.layers[id].gain.setTargetAtTime(on ? 1 : 0, t, 1.4);
        }
        this.padFilter.frequency.setTargetAtTime(500 + this.level * 2800, t, 1);

        while (this.nextTime < t + 0.12) {
            this.#playStep(this.step, this.nextTime);
            this.nextTime += 60 / this.bpm / 4; // une double croche
            this.step = (this.step + 1) % 16;
            if (this.step === 0) this.bar++;
        }
    }

    #active(id) {
        return this.layers[id].gain.value > 0.01 || this.level >= LAYERS[id];
    }

    #playStep(step, t) {
        const ctx = this.audio.ctx;
        const prog = PROGRESSIONS[this.#mood()];
        const barsPerChord = this.level < 0.3 ? 2 : 1;
        const [root, quality] = prog[Math.floor(this.bar / barsPerChord) % prog.length];
        const chord = TRIAD[quality].map((i) => root + i);
        const L = this.layers;
        const lvl = this.level;
        const stepDur = 60 / this.bpm / 4;

        // Pad : accord tenu, voix légèrement désaccordées.
        if (step === 0 && this.bar % barsPerChord === 0) {
            const dur = stepDur * 16 * barsPerChord;
            for (const n of chord) {
                for (const det of [-8, 8]) {
                    tone(ctx, this.padFilter, t, { type: "sawtooth", freq: midi(n + 12), detune: det, attack: 0.8, hold: dur - 0.8, release: 1.6, gain: 0.035 });
                }
            }
            tone(ctx, this.padFilter, t, { type: "sine", freq: midi(root), attack: 0.6, hold: dur - 0.6, release: 1.5, gain: 0.08 });
        }

        // Basse : de plus en plus dense.
        if (this.#active("bass")) {
            const pattern = lvl >= 0.8 ? [0, 2, 4, 6, 8, 10, 12, 14] : lvl >= 0.5 ? [0, 3, 6, 8, 11, 14] : [0, 8];
            if (pattern.includes(step)) {
                const octave = lvl >= 0.8 && step % 4 === 2 ? 12 : 0;
                tone(ctx, L.bass, t, {
                    type: "sawtooth",
                    freq: midi(root - 12 + octave),
                    attack: 0.005,
                    release: stepDur * (lvl >= 0.8 ? 1.6 : 3),
                    gain: 0.16,
                    filter: { type: "lowpass", freq: 260 + lvl * 700, q: 6, freqEnd: 120 },
                });
            }
        }

        // Grosse caisse.
        if (this.#active("kick")) {
            const pattern = lvl >= 0.85 ? [0, 4, 8, 12, 14] : lvl >= 0.55 ? [0, 4, 8, 12] : [0, 8];
            if (pattern.includes(step)) tone(ctx, L.kick, t, { type: "sine", freq: 150, freqEnd: 42, glide: 0.09, attack: 0.002, release: 0.28, gain: 0.55 });
        }

        // Charleston.
        if (this.#active("hat")) {
            const every = lvl >= 0.75 ? 1 : 2;
            if (step % every === 0) {
                const accent = step % 4 === 2 ? 1 : 0.55;
                noise(ctx, L.hat, t, { filterType: "highpass", freq: 7500, release: 0.035, gain: 0.07 * accent });
            }
        }

        // Caisse claire.
        if (this.#active("snare")) {
            const pattern = lvl >= 0.85 ? [4, 12, 15] : [4, 12];
            if (pattern.includes(step)) {
                const ghost = step === 15 ? 0.4 : 1;
                noise(ctx, L.snare, t, { filterType: "bandpass", freq: 1900, q: 0.8, release: 0.16, gain: 0.22 * ghost });
                tone(ctx, L.snare, t, { type: "triangle", freq: 190, freqEnd: 140, release: 0.09, gain: 0.12 * ghost });
            }
        }

        // Arpège : notes de l'accord, une octave au-dessus.
        if (this.#active("arp")) {
            const every = lvl >= 0.75 ? 1 : 2;
            if (step % every === 0) {
                const seq = [0, 1, 2, 1, 0, 2, 1, 2];
                const n = chord[seq[(step / every) % seq.length]] + 24;
                tone(ctx, L.arp, t, {
                    type: "square",
                    freq: midi(n),
                    release: stepDur * 1.6,
                    gain: 0.035,
                    filter: { type: "lowpass", freq: 1200 + lvl * 2500, q: 2 },
                });
            }
        }

        // Tension finale : ostinato aigu et montées de bruit.
        if (this.#active("lead")) {
            const n = root + (step % 2 ? 24 : 12) + (step >= 8 ? 1 : 0);
            tone(ctx, L.lead, t, {
                type: "sawtooth",
                freq: midi(n),
                release: stepDur * 0.9,
                gain: 0.03,
                filter: { type: "lowpass", freq: 900 + (step / 16) * 3500, q: 4 },
            });
            if (step === 0 && this.bar % 2 === 1) {
                noise(ctx, L.lead, t, { filterType: "bandpass", freq: 300, freqEnd: 6000, q: 3, attack: stepDur * 14, release: 0.1, gain: 0.08 });
            }
        }
    }
}
