import { chime, epiano, mallet, midi, noise, penta, pluck, swell, tone } from "./synth.js";

// Progressions d'accords de septième (fondamentale MIDI + qualité) par ambiance.
// Tout reste en do majeur / la mineur : la mélodie pentatonique tombe toujours juste.
const PROGRESSIONS = {
    calm: [[53, "maj7"], [52, "m7"], [50, "m7"], [48, "maj7"]], // Fa – Mi m – Ré m – Do : balade
    drive: [[57, "m7"], [53, "maj7"], [48, "maj7"], [55, "dom7"]], // La m – Fa – Do – Sol : ça bouge
    dark: [[57, "m7"], [50, "m7"], [53, "maj7"], [52, "m7"]], // La m – Ré m – Fa – Mi m : tension
};
const CHORD = { maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], dom7: [0, 4, 7, 10] };

// Motifs de kalimba (degrés pentatoniques, -1 = silence) : un thème qui revient.
const MOTIFS = [
    [4, -1, -1, 5, -1, 4, 2, -1, -1, -1, 1, -1, 2, -1, -1, -1],
    [2, -1, 4, -1, 5, -1, -1, 7, -1, 5, -1, 4, -1, -1, -1, -1],
    [7, -1, -1, 5, 4, -1, 2, -1, 4, -1, -1, -1, 0, -1, -1, -1],
    [0, -1, 2, -1, 4, -1, 2, 4, -1, 5, -1, 4, -1, -1, -1, -1],
];

// Couches : seuil d'intensité d'entrée. Toutes glissent en fondu.
const LAYERS = {
    keys: 0,
    bass: 0.12,
    kick: 0.2,
    hat: 0.28,
    snare: 0.34,
    melody: 0.42,
    shaker: 0.58,
    counter: 0.7,
    riser: 0.9,
};
// Couches légèrement « pompées » par la grosse caisse : le groove respire.
const PUMPED = ["keys", "bass", "melody", "counter"];

// Musique générative lo-fi / chillhop : tempo, couches, harmonie et mélodie suivent
// l'intensité de la partie (phase, taille des Snakes, danger, fin du timer).
// Swing sur les doubles croches, batterie feutrée, piano électrique et kalimba.
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
        this.filter.Q.value = 0.7;
        this.filter.connect(this.out).connect(this.audio.buses.music);

        // Couleur lo-fi : aigus adoucis en permanence (bande passante d'une vieille cassette).
        this.tape = ctx.createBiquadFilter();
        this.tape.type = "lowpass";
        this.tape.frequency.value = 7500;
        this.tape.Q.value = 0.5;
        this.tape.connect(this.filter);

        // Sidechain doux : un gain commun aux couches mélodiques, creusé à chaque grosse caisse.
        this.duck = ctx.createGain();
        this.duck.connect(this.tape);

        this.layers = {};
        for (const id of Object.keys(LAYERS)) {
            const g = ctx.createGain();
            g.gain.value = 0;
            g.connect(PUMPED.includes(id) ? this.duck : this.tape);
            this.layers[id] = g;
        }
        // Les accords passent dans un filtre qui s'ouvre avec l'intensité.
        this.keysFilter = ctx.createBiquadFilter();
        this.keysFilter.type = "lowpass";
        this.keysFilter.frequency.value = 1400;
        this.keysFilter.connect(this.layers.keys);

        // Envois vers la réverbération et l'écho partagés.
        this.reverb = ctx.createGain();
        this.reverb.gain.value = 0.3;
        this.reverb.connect(this.audio.reverbSend);
        this.echo = ctx.createGain();
        this.echo.gain.value = 0.3;
        this.echo.connect(this.audio.echoSend);
        for (const id of ["keys", "snare", "melody"]) this.layers[id].connect(this.reverb);
        for (const id of ["melody", "counter"]) this.layers[id].connect(this.echo);

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

    // Montée : le filtre se ferme puis s'ouvre (avant une expansion, un changement de phase).
    build(seconds = 2.8) {
        if (!this.out) return;
        const f = this.filter.frequency;
        const t = this.audio.ctx.currentTime;
        f.cancelScheduledValues(t);
        f.setValueAtTime(f.value, t);
        f.exponentialRampToValueAtTime(450, t + 0.3);
        f.exponentialRampToValueAtTime(18000, t + seconds);
    }

    // Impact musical (changement de phase, fin d'expansion) : cymbale douce, basse, carillon.
    hit() {
        if (!this.out) return;
        const ctx = this.audio.ctx;
        const t = ctx.currentTime + 0.02;
        noise(ctx, this.reverb, t, { filterType: "highpass", freq: 5000, attack: 0.02, release: 1.8, gain: 0.07 });
        tone(ctx, this.tape, t, { type: "sine", freq: midi(36), freqEnd: midi(31), release: 1.4, gain: 0.28 });
        chime(ctx, this.reverb, t, { freq: midi(84), release: 1.6, gain: 0.05 });
    }

    get bpm() {
        return 78 + this.level * 34;
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
            const on = this.level >= threshold && (this.mode !== "end" || id === "keys" || id === "melody");
            this.layers[id].gain.setTargetAtTime(on ? 1 : 0, t, 1.4);
        }
        this.keysFilter.frequency.setTargetAtTime(1200 + this.level * 3000, t, 1);

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

    // Creuse légèrement le volume des couches mélodiques à chaque grosse caisse.
    #pump(t, beat) {
        const g = this.duck.gain;
        g.cancelScheduledValues(t);
        g.setValueAtTime(g.value, t);
        g.linearRampToValueAtTime(0.72, t + 0.01);
        g.linearRampToValueAtTime(1, t + beat * 0.6);
    }

    #playStep(step, at) {
        const ctx = this.audio.ctx;
        const mood = this.#mood();
        const prog = PROGRESSIONS[mood];
        const barsPerChord = this.level < 0.3 ? 2 : 1;
        const [root, quality] = prog[Math.floor(this.bar / barsPerChord) % prog.length];
        const chord = CHORD[quality].map((i) => root + i);
        const L = this.layers;
        const lvl = this.level;
        const s16 = 60 / this.bpm / 4;
        const beat = s16 * 4;
        // Swing : les doubles croches paires arrivent en retard, le groove « traîne ».
        const t = step % 2 ? at + s16 * 0.2 : at;

        // Changement d'ambiance : petit carillon d'accueil sur le premier temps.
        if (step === 0 && mood !== this.lastMood) {
            this.lastMood = mood;
            chime(ctx, this.reverb, t, { freq: midi(mood === "dark" ? 81 : 88), release: 1.4, gain: 0.04 });
        }

        // Piano électrique : l'accord, plaqué puis répété en contretemps.
        if (step === 0 && this.bar % barsPerChord === 0) {
            const dur = s16 * 16 * barsPerChord;
            chord.forEach((n, i) => epiano(ctx, this.keysFilter, t + i * 0.012, { freq: midi(n + (n < 52 ? 12 : 0)), hold: dur * 0.5, release: dur * 0.6, gain: 0.05, pan: (i - 1.5) * 0.2 }));
        }
        if (lvl >= 0.3 && step === 10) {
            chord.slice(1).forEach((n) => epiano(ctx, this.keysFilter, t, { freq: midi(n + (n < 52 ? 12 : 0)), hold: s16 * 2, release: s16 * 4, gain: 0.025 }));
        }

        // Basse ronde : fondamentale, quinte, et petites approches quand ça bouge.
        if (this.#active("bass")) {
            const line = lvl >= 0.45 ? { 0: 0, 6: 7, 8: 12, 10: 7, 14: 10 } : { 0: 0, 10: 7 };
            if (line[step] !== undefined) {
                tone(ctx, L.bass, t, { type: "triangle", freq: midi(root - 24 + line[step]), attack: 0.01, hold: s16 * (step === 0 ? 3 : 1.2), release: s16 * 1.5, gain: 0.22, filter: { type: "lowpass", freq: 600 } });
            }
        }

        // Grosse caisse feutrée (boom-bap) + pompe douce.
        if (this.#active("kick")) {
            const pattern = lvl >= 0.55 ? [0, 7, 10] : [0, 10];
            if (pattern.includes(step)) {
                tone(ctx, L.kick, t, { type: "sine", freq: 120, freqEnd: 45, glide: 0.07, attack: 0.002, release: 0.26, gain: 0.5 });
                this.#pump(t, beat);
            }
        }

        // Caisse claire « brossée » sur les temps 2 et 4.
        if (this.#active("snare") && (step === 4 || step === 12)) {
            noise(ctx, L.snare, t, { filterType: "bandpass", freq: 1800, q: 0.8, release: 0.14, gain: 0.12 });
            tone(ctx, L.snare, t, { type: "triangle", freq: 190, freqEnd: 150, release: 0.06, gain: 0.06 });
        }

        // Charleston : croches douces, doubles croches quand ça s'accélère.
        if (this.#active("hat")) {
            const dense = lvl >= 0.66;
            if (dense || step % 2 === 0) {
                noise(ctx, L.hat, t, { filterType: "highpass", freq: 7500, release: step % 4 === 2 ? 0.05 : 0.025, gain: step % 4 === 2 ? 0.045 : 0.025, pan: step % 2 ? 0.25 : -0.25 });
            }
        }

        // Shaker : grain continu, donne de l'élan.
        if (this.#active("shaker") && step % 2 === 1) {
            noise(ctx, L.shaker, t, { filterType: "bandpass", freq: 5500, q: 1.5, attack: 0.01, release: 0.05, gain: 0.03, pan: 0.4 });
        }

        // Mélodie : le thème du jeu à la kalimba.
        if (this.#active("melody")) {
            const motif = MOTIFS[Math.floor(this.bar / 2) % MOTIFS.length];
            const degree = motif[step];
            if (degree >= 0) mallet(ctx, L.melody, t, { freq: midi(penta(72, degree)), ratio: 5.4, release: 0.55, gain: 0.07, pan: -0.15 });
        }

        // Contre-chant de marimba : arpège de l'accord en doubles croches.
        if (this.#active("counter") && step % 2 === 0) {
            const n = chord[(step / 2) % chord.length] + 12;
            mallet(ctx, L.counter, t, { freq: midi(n), ratio: 4, release: 0.18, gain: 0.035, pan: 0.3 });
        }

        // Fin de partie imminente : montée douce toutes les deux mesures.
        if (this.#active("riser") && step === 0 && this.bar % 2 === 0) {
            swell(ctx, L.riser, t, { duration: s16 * 31, freq: 500, freqEnd: 5000, gain: 0.05 });
            pluck(ctx, L.riser, t + s16 * 28, { freq: midi(84), release: 0.3, gain: 0.05 });
        }
    }
}
