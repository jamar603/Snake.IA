import { bitcrush, distortion, fm, midi, noise, pick, supersaw, swell, tone, vary } from "../synth.js";

// Sons des Snakes : arcade sci-fi, courts et lisibles. Chaque son varie
// (hauteur, timbre, panoramique) pour ne jamais lasser.
export const SnakeSounds = {
    // Déplacement : "tic" feutré, alterné gauche / droite, presque subliminal.
    move(ctx, out, t, { alt = false } = {}) {
        noise(ctx, out, t, { filterType: "bandpass", freq: vary(alt ? 1100 : 850, 0.08), q: 3, release: 0.035, gain: 0.5, pan: alt ? 0.15 : -0.15 });
    },

    // Manger : "pickup" FM brillant. `combo` fait monter la note (repas enchaînés).
    eat(ctx, out, t, { combo = 0 } = {}) {
        const base = 76 + Math.min(combo, 7) * 2;
        fm(ctx, out, t, { freq: midi(base), ratio: 2, index: 2.5, indexEnd: 0.1, release: 0.18, gain: 0.16 });
        fm(ctx, out, t + 0.055, { freq: midi(base + pick([5, 7, 12])), ratio: 3, index: 2, indexEnd: 0.1, release: 0.28, gain: 0.13 });
        noise(ctx, out, t, { filterType: "highpass", freq: 6000, release: 0.06, gain: 0.06 });
        tone(ctx, out, t, { type: "sine", freq: 180, freqEnd: 90, release: 0.08, gain: 0.12 }); // petite "bouchée"
    },

    // Fruit doré : accord de cloches FM + scintillement montant.
    golden(ctx, out, t) {
        for (const [i, n] of [76, 79, 83, 88, 91].entries()) {
            fm(ctx, out, t + i * 0.05, { freq: midi(n), ratio: 3.5, index: 3, indexEnd: 0.2, release: 0.9, gain: 0.08, pan: (i - 2) * 0.25 });
        }
        swell(ctx, out, t, { duration: 0.35, freq: 3000, freqEnd: 12000, gain: 0.05 });
    },

    // Récupération de PV : accord chaud qui s'élève, comme une recharge.
    heal(ctx, out, t) {
        supersaw(ctx, out, t, { freq: midi(64), voices: 3, attack: 0.08, release: 0.6, gain: 0.07, filter: { type: "lowpass", freq: 900, freqEnd: 4000, time: 0.5 } });
        for (const [i, n] of [64, 68, 71, 76].entries()) fm(ctx, out, t + i * 0.07, { freq: midi(n + 12), ratio: 2, index: 1.5, release: 0.5, gain: 0.06 });
    },

    // Croissance : bulle grave qui gonfle.
    grow(ctx, out, t) {
        tone(ctx, out, t, { type: "sine", freq: vary(95), freqEnd: 190, attack: 0.02, release: 0.14, gain: 0.14 });
    },

    // Évolution : balayage qui s'ouvre + accord supersaw triomphant + éclats.
    evolve(ctx, out, t) {
        swell(ctx, out, t, { duration: 0.45, freq: 400, freqEnd: 8000, gain: 0.12 });
        for (const n of [57, 64, 69, 73]) {
            supersaw(ctx, out, t + 0.45, { freq: midi(n), voices: 5, attack: 0.005, hold: 0.3, release: 1, gain: 0.07, filter: { type: "lowpass", freq: 6000, freqEnd: 1200 } });
        }
        tone(ctx, out, t + 0.45, { type: "sine", freq: midi(33), release: 1.2, gain: 0.35 });
        for (let i = 0; i < 6; i++) fm(ctx, out, t + 0.5 + i * 0.06, { freq: midi(88 + i * 2), ratio: 3, index: 2, release: 0.2, gain: 0.04, pan: Math.random() * 2 - 1 });
    },

    // Perte de PV : glitch numérique + choc sourd + souffle.
    hurt(ctx, out, t) {
        const crush = bitcrush(ctx, 5);
        crush.connect(out);
        tone(ctx, crush, t, { type: "sawtooth", freq: vary(700, 0.15), freqEnd: 90, release: 0.22, gain: 0.14 });
        tone(ctx, crush, t + 0.06, { type: "square", freq: vary(300, 0.15), freqEnd: 60, release: 0.12, gain: 0.08 });
        tone(ctx, out, t, { type: "sine", freq: 95, freqEnd: 38, release: 0.28, gain: 0.34 });
        noise(ctx, out, t, { filterType: "lowpass", freq: 2200, freqEnd: 300, release: 0.18, gain: 0.16 });
    },

    // Collision : impact mat + craquement.
    collision(ctx, out, t) {
        const drive = distortion(ctx, 10);
        drive.connect(out);
        tone(ctx, drive, t, { type: "sine", freq: vary(80), freqEnd: 34, release: 0.22, gain: 0.3 });
        noise(ctx, out, t, { filterType: "bandpass", freq: vary(1800, 0.2), q: 0.8, release: 0.08, gain: 0.22 });
    },

    // Réapparition : matérialisation (balayage montant + reflets FM).
    respawn(ctx, out, t) {
        swell(ctx, out, t, { duration: 0.25, freq: 1500, freqEnd: 9000, gain: 0.06 });
        for (let i = 0; i < 4; i++) fm(ctx, out, t + 0.2 + i * 0.04, { freq: midi(79 + i * 3), ratio: 2, index: 1.5, release: 0.15, gain: 0.05 });
    },

    // Mort : effondrement numérique, chute grave et souffle.
    death(ctx, out, t) {
        const crush = bitcrush(ctx, 4);
        crush.connect(out);
        tone(ctx, crush, t, { type: "sawtooth", freq: 440, freqEnd: 30, attack: 0.005, release: 1.1, gain: 0.12 });
        tone(ctx, out, t, { type: "sine", freq: 70, freqEnd: 24, release: 1.3, gain: 0.45 });
        noise(ctx, out, t, { filterType: "lowpass", freq: 4000, freqEnd: 80, release: 1.2, gain: 0.25 });
        for (let i = 0; i < 5; i++) tone(ctx, crush, t + 0.1 + i * 0.09, { type: "square", freq: vary(1200 - i * 180, 0.1), release: 0.04, gain: 0.04 });
    },

    // Piège déclenché : déclic métallique FM puis explosion courte.
    trapHit(ctx, out, t) {
        fm(ctx, out, t, { freq: 1900, ratio: 1.41, index: 6, indexEnd: 1, release: 0.06, gain: 0.12 });
        noise(ctx, out, t + 0.03, { filterType: "lowpass", freq: 3000, freqEnd: 200, release: 0.35, gain: 0.3 });
        tone(ctx, out, t + 0.03, { type: "sine", freq: 110, freqEnd: 40, release: 0.3, gain: 0.3 });
    },

    // Danger tout proche : battement de cœur discret.
    heartbeat(ctx, out, t, { strength = 1 } = {}) {
        tone(ctx, out, t, { type: "sine", freq: 58, freqEnd: 40, attack: 0.01, release: 0.16, gain: 0.32 * strength });
        tone(ctx, out, t + 0.2, { type: "sine", freq: 52, freqEnd: 38, attack: 0.01, release: 0.2, gain: 0.22 * strength });
    },
};
