import { distortion, midi, noise, supersaw, swell, tone } from "./synth.js";

// Progressions d'accords (fondamentale MIDI + qualité) par ambiance.
const PROGRESSIONS = {
    calm: [[45, "m"], [41, "M"], [48, "M"], [43, "M"]], // La m – Fa – Do – Sol : exploration
    drive: [[45, "m"], [41, "M"], [43, "M"], [40, "M"]], // La m – Fa – Sol – Mi : croissance / danger
    dark: [[45, "m"], [46, "M"], [41, "M"], [40, "M"]], // La m – Si♭ – Fa – Mi : chaos
};
const TRIAD = { m: [0, 3, 7], M: [0, 4, 7] };
const SCALE = [0, 2, 3, 5, 7, 8, 10]; // La mineur naturel

// Motifs mélodiques (degrés de la gamme, -1 = silence) : la musique a un thème
// reconnaissable qui revient, au lieu d'une simple boucle.
const MOTIFS = [
    [4, -1, 3, -1, 2, -1, 0, -1, 2, -1, -1, 3, 4, -1, -1, -1],
    [7, -1, 6, 4, -1, 4, 3, -1, 2, -1, 3, -1, 4, -1, -1, -1],
    [0, -1, 2, 3, -1, 4, -1, 7, 6, -1, 4, -1, 3, -1, 2, -1],
    [4, 4, -1, 7, -1, 6, -1, 4, 3, -1, 2, -1, 0, -1, -1, -1],
];

// Couches : seuil d'intensité d'entrée. Toutes glissent en fondu.
const LAYERS = {
    pad: 0,
    arp: 0.08,
    sub: 0.2,
    kick: 0.3,
    hat: 0.38,
    bass: 0.45,
    clap: 0.5,
    lead: 0.62,
    perc: 0.8,
    riser: 0.9,
};
// Couches "pompées" par la grosse caisse (sidechain), signature du genre.
const PUMPED = ["pad", "arp", "sub", "bass", "lead"];

// Musique générative darksynth : tempo, couches, harmonie et mélodie suivent
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
        this.lastMood = "calm";
    }

    start() {
        if (this.started || !this.audio.ctx) return;
        const ctx = this.audio.ctx;
        this.started = true;

        // Sortie : filtre global (montées / fin de partie) -> volume -> bus musique.
        this.out = ctx.createGain();
        this.out.gain.value = 0;
        this.out.gain.setTargetAtTime(0.85, ctx.currentTime, 1.5); // fondu d'entrée
        this.filter = ctx.createBiquadFilter();
        this.filter.type = "lowpass";
        this.filter.frequency.value = 18000;
        this.filter.Q.value = 0.8;
        this.filter.connect(this.out).connect(this.audio.buses.music);

        // Sidechain : un gain commun aux couches mélodiques, creusé à chaque grosse caisse.
        this.duck = ctx.createGain();
        this.duck.connect(this.filter);

        this.layers = {};
        for (const id of Object.keys(LAYERS)) {
            const g = ctx.createGain();
            g.gain.value = 0;
            g.connect(PUMPED.includes(id) ? this.duck : this.filter);
            this.layers[id] = g;
        }
        // Le pad passe dans un filtre qui s'ouvre avec l'intensité.
        this.padFilter = ctx.createBiquadFilter();
        this.padFilter.type = "lowpass";
        this.padFilter.frequency.value = 900;
        this.padFilter.Q.value = 2;
        this.padFilter.connect(this.layers.pad);
        // Saturation de la basse.
        this.bassDrive = distortion(ctx, 4);
        this.bassDrive.connect(this.layers.bass);

        // Envois vers la réverbération et l'écho partagés.
        this.reverb = ctx.createGain();
        this.reverb.gain.value = 0.3;
        this.reverb.connect(this.audio.reverbSend);
        this.echo = ctx.createGain();
        this.echo.gain.value = 0.35;
        this.echo.connect(this.audio.echoSend);
        for (const id of ["pad", "clap", "lead"]) this.layers[id].connect(this.reverb);
        for (const id of ["arp", "lead"]) this.layers[id].connect(this.echo);

        this.nextTime = ctx.currentTime + 0.1;
        this.timer = setInterval(() => this.#schedule(), 25);
    }

    // 0 = calme, 1 = tension maximale.
    setIntensity(x) {
        this.target = Math.max(0, Math.min(1, x));
    }

    setMode(mode) {
        this.mode = mode;
        if (!this.out) return;
        const t = this.audio.ctx.currentTime;
        this.out.gain.setTargetAtTime(mode === "silent" ? 0.0001 : mode === "end" ? 0.45 : 0.85, t, mode === "silent" ? 0.3 : 1.2);
        this.filter.frequency.setTargetAtTime(mode === "end" ? 1200 : 18000, t, 1);
    }

    // Montée : le filtre se ferme puis s'ouvre sur 2 mesures (avant une expansion).
    build(seconds = 2.8) {
        if (!this.out) return;
        const f = this.filter.frequency;
        const t = this.audio.ctx.currentTime;
        f.cancelScheduledValues(t);
        f.setValueAtTime(f.value, t);
        f.exponentialRampToValueAtTime(350, t + 0.3);
        f.exponentialRampToValueAtTime(18000, t + seconds);
    }

    // Impact musical (changement de phase, fin d'expansion) : cymbale + basse profonde.
    hit() {
        if (!this.out) return;
        const ctx = this.audio.ctx;
        const t = ctx.currentTime + 0.02;
        noise(ctx, this.filter, t, { filterType: "highpass", freq: 5000, freqEnd: 3000, release: 2.2, gain: 0.12 });
        noise(ctx, this.reverb, t, { filterType: "highpass", freq: 4000, release: 2.5, gain: 0.1 });
        tone(ctx, this.filter, t, { type: "sine", freq: midi(33), freqEnd: midi(28), release: 1.8, gain: 0.35 });
    }

    get bpm() {
        return 92 + this.level * 56;
    }

    #mood() {
        if (this.level >= 0.82) return "dark";
        if (this.level >= 0.45) return "drive";
        return "calm";
    }

    #schedule() {
        const ctx = this.audio.ctx;
        if (ctx.state !== "running") return;
        this.level += (this.target - this.level) * 0.02;
        const t = ctx.currentTime;
        for (const [id, threshold] of Object.entries(LAYERS)) {
            const on = this.level >= threshold && (this.mode !== "end" || id === "pad" || id === "arp");
            this.layers[id].gain.setTargetAtTime(on ? 1 : 0, t, 1.4);
        }
        this.padFilter.frequency.setTargetAtTime(700 + this.level * 3200, t, 1);

        while (this.nextTime < t + 0.12) {
            this.#playStep(this.step, this.nextTime);
            this.nextTime += 60 / this.bpm / 4; // une double croche
            this.step = (this.step + 1) % 16;
            if (this.step === 0) {
                this.bar++;
                this.audio.setTempo(this.bpm);
            }
        }
    }

    #active(id) {
        return this.layers[id].gain.value > 0.01 || this.level >= LAYERS[id];
    }

    #note(root, degree, octave = 0) {
        const d = ((degree % 7) + 7) % 7;
        return root + SCALE[d] + 12 * (Math.floor(degree / 7) + octave);
    }

    // Creuse le volume des couches mélodiques à chaque grosse caisse ("pompe").
    #pump(t, beat) {
        const g = this.duck.gain;
        g.cancelScheduledValues(t);
        g.setValueAtTime(g.value, t);
        g.linearRampToValueAtTime(0.32, t + 0.01);
        g.linearRampToValueAtTime(1, t + beat * 0.55);
    }

    #playStep(step, t) {
        const ctx = this.audio.ctx;
        const mood = this.#mood();
        const prog = PROGRESSIONS[mood];
        const barsPerChord = this.level < 0.3 ? 2 : 1;
        const chordIndex = Math.floor(this.bar / barsPerChord) % prog.length;
        const [root, quality] = prog[chordIndex];
        const chord = TRIAD[quality].map((i) => root + i);
        const L = this.layers;
        const lvl = this.level;
        const s16 = 60 / this.bpm / 4;
        const beat = s16 * 4;

        // Changement d'ambiance : cymbale d'accueil sur le premier temps.
        if (step === 0 && mood !== this.lastMood) {
            this.lastMood = mood;
            noise(ctx, this.filter, t, { filterType: "highpass", freq: 6000, release: 1.6, gain: 0.1 });
        }

        // Pad supersaw : accord tenu, large en stéréo.
        if (step === 0 && this.bar % barsPerChord === 0) {
            const dur = s16 * 16 * barsPerChord;
            for (const n of chord) supersaw(ctx, this.padFilter, t, { freq: midi(n + 12), voices: 5, spread: 18, attack: 0.5, hold: dur - 0.5, release: 1.4, gain: 0.1 });
            tone(ctx, this.padFilter, t, { type: "triangle", freq: midi(chord[0] + 24), attack: 0.6, hold: dur - 0.6, release: 1.2, gain: 0.03 });
        }

        // Arpège "pluck" à l'écho : croches au calme, doubles croches ensuite.
        if (this.#active("arp")) {
            const every = lvl >= 0.5 ? 1 : 2;
            if (step % every === 0) {
                const pattern = [0, 1, 2, 3, 2, 1, 0, 2];
                const idx = pattern[(step / every) % pattern.length];
                const n = idx === 3 ? chord[0] + 12 : chord[idx];
                tone(ctx, L.arp, t, {
                    type: "sawtooth",
                    freq: midi(n + 24),
                    release: s16 * 1.8,
                    gain: 0.06,
                    filter: { type: "lowpass", freq: 1500 + lvl * 3500, freqEnd: 400, q: 6, time: s16 * 1.5 },
                    pan: step % 4 < 2 ? -0.35 : 0.35,
                });
            }
        }

        // Sub-basse : la fondamentale sur les temps forts.
        if (this.#active("sub") && (step === 0 || step === 8)) {
            tone(ctx, L.sub, t, { type: "sine", freq: midi(root - 12), attack: 0.01, hold: s16 * 6, release: s16 * 2, gain: 0.32 });
        }

        // Grosse caisse (corps + clic) + pompe du sidechain.
        if (this.#active("kick")) {
            const pattern = lvl >= 0.55 ? [0, 4, 8, 12] : [0, 8];
            const extra = lvl >= 0.9 && this.bar % 2 === 1 ? [14] : [];
            if (pattern.includes(step) || extra.includes(step)) {
                tone(ctx, L.kick, t, { type: "sine", freq: 165, freqEnd: 44, glide: 0.08, attack: 0.001, release: 0.32, gain: 0.7 });
                noise(ctx, L.kick, t, { filterType: "highpass", freq: 3500, release: 0.012, gain: 0.25 });
                this.#pump(t, beat);
            }
        }

        // Charleston : fermé sur les contretemps, ouvert aux niveaux élevés.
        if (this.#active("hat")) {
            const sixteenths = lvl >= 0.72;
            if (sixteenths || step % 2 === 0) {
                const offbeat = step % 4 === 2;
                const open = offbeat && lvl >= 0.6;
                noise(ctx, L.hat, t, {
                    filterType: "highpass",
                    freq: open ? 7000 : 8500,
                    release: open ? 0.16 : 0.03,
                    gain: (offbeat ? 0.09 : 0.045) * (open ? 0.8 : 1),
                    pan: step % 2 ? 0.25 : -0.25,
                });
            }
        }

        // Basse roulante (galop synthwave) ; basse "reese" sombre en mode chaos.
        if (this.#active("bass")) {
            const gallop = [2, 3, 6, 7, 10, 11, 14, 15];
            if (gallop.includes(step)) {
                const n = root - 12 + (step === 15 && this.bar % 2 ? 12 : 0);
                const dark = mood === "dark";
                for (const det of dark ? [-14, 14] : [0]) {
                    tone(ctx, this.bassDrive, t, {
                        type: "sawtooth",
                        freq: midi(n),
                        detune: det,
                        release: s16 * 0.9,
                        gain: dark ? 0.11 : 0.15,
                        filter: { type: "lowpass", freq: 300 + lvl * 1500, freqEnd: 150, q: 5, time: s16 },
                    });
                }
            }
        }

        // Clap : trois éclats de bruit rapprochés, sur les temps 2 et 4.
        if (this.#active("clap") && (step === 4 || step === 12)) {
            for (let i = 0; i < 3; i++) {
                noise(ctx, L.clap, t + i * 0.011, { filterType: "bandpass", freq: 1500, q: 1.2, release: i === 2 ? 0.18 : 0.02, gain: 0.25 });
            }
            tone(ctx, L.clap, t, { type: "triangle", freq: 220, freqEnd: 160, release: 0.08, gain: 0.08 });
        }

        // Mélodie : le thème du jeu, joué par un lead chantant.
        if (this.#active("lead")) {
            const motif = MOTIFS[Math.floor(this.bar / 2) % MOTIFS.length];
            const degree = motif[step];
            if (degree >= 0) {
                const n = this.#note(45, degree, 1);
                const len = motif[step + 1] === -1 ? s16 * 1.8 : s16 * 0.9;
                tone(ctx, L.lead, t, { type: "sawtooth", freq: midi(n + 12), vibrato: 12, attack: 0.01, hold: len, release: 0.15, gain: 0.05, filter: { type: "lowpass", freq: 2600, q: 2 } });
                tone(ctx, L.lead, t, { type: "square", freq: midi(n), detune: 6, attack: 0.01, hold: len, release: 0.15, gain: 0.025, filter: { type: "lowpass", freq: 1800 } });
            }
        }

        // Roulements de toms en fin de phrase (toutes les 4 mesures).
        if (this.#active("perc") && this.bar % 4 === 3 && step >= 12) {
            const f = [180, 150, 120, 95][step - 12];
            tone(ctx, L.perc, t, { type: "sine", freq: f, freqEnd: f * 0.6, release: 0.22, gain: 0.35 });
            noise(ctx, L.perc, t, { filterType: "bandpass", freq: f * 4, q: 1, release: 0.05, gain: 0.06 });
        }

        // Fin de partie imminente : montées de tension en boucle.
        if (this.#active("riser") && step === 0 && this.bar % 2 === 0) {
            swell(ctx, L.riser, t, { duration: s16 * 31, freq: 300, freqEnd: 7000, gain: 0.1 });
            tone(ctx, L.riser, t, { type: "sawtooth", freq: midi(57), freqEnd: midi(69), attack: s16 * 30, release: 0.05, gain: 0.03, filter: { type: "lowpass", freq: 3000 } });
        }
    }
}
