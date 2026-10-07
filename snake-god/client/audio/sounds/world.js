import { distortion, midi, noise, tone, vary } from "../synth.js";

// Sons du monde : événements, expansion du cube, changements de phase, fin de partie.
export const WorldSounds = {
    // Expansion, étape 1 : montée de tension (tout le monde l'entend).
    expansionRise(ctx, out, t, { duration = 2.8 } = {}) {
        noise(ctx, out, t, { filterType: "bandpass", freq: 150, freqEnd: 4000, q: 2, attack: duration * 0.85, release: 0.2, gain: 0.22 });
        tone(ctx, out, t, { type: "sawtooth", freq: 55, freqEnd: 220, attack: duration * 0.85, release: 0.2, gain: 0.08, filter: { type: "lowpass", freq: 600, freqEnd: 3000 } });
        // Étape 2 : activation énergétique (pulsations qui accélèrent).
        let at = t + 0.3;
        let gap = 0.32;
        while (at < t + duration - 0.1) {
            tone(ctx, out, at, { type: "square", freq: vary(midi(69), 0.01), release: 0.05, gain: 0.04 });
            at += gap;
            gap = Math.max(0.06, gap * 0.82);
        }
    },

    // Étape 3 : construction des cellules (crépitements cristallins en cascade).
    construction(ctx, out, t, { duration = 1.6 } = {}) {
        for (let i = 0; i < 28; i++) {
            const at = t + Math.random() * duration;
            tone(ctx, out, at, { type: "triangle", freq: vary(midi(84 + Math.floor(Math.random() * 12)), 0.02), release: 0.08, gain: 0.03 });
            noise(ctx, out, at, { filterType: "highpass", freq: 5000, release: 0.02, gain: 0.03 });
        }
    },

    // Étape 4 : impact final, tout le cube résonne.
    expansionImpact(ctx, out, t) {
        const drive = distortion(ctx, 8);
        drive.connect(out);
        tone(ctx, drive, t, { type: "sine", freq: 60, freqEnd: 30, release: 2, gain: 0.4 });
        noise(ctx, out, t, { filterType: "lowpass", freq: 2500, freqEnd: 60, release: 1.6, gain: 0.35 });
        for (const n of [45, 52, 57, 64]) tone(ctx, out, t, { type: "sawtooth", freq: midi(n), attack: 0.01, release: 2.2, gain: 0.04, filter: { type: "lowpass", freq: 1800, freqEnd: 300 } });
    },

    // Changement de phase : gong grave et souffle.
    phase(ctx, out, t, { phase = 2 } = {}) {
        const root = [0, 45, 44, 43, 41][phase] ?? 45;
        for (const r of [1, 2.01, 2.76, 4.07]) tone(ctx, out, t, { type: "sine", freq: midi(root - 12) * r, attack: 0.005, release: 3 / r, gain: 0.18 / r });
        noise(ctx, out, t, { filterType: "bandpass", freq: 200, freqEnd: 2000, q: 1, attack: 0.6, release: 0.8, gain: 0.08 });
    },

    // Météore : sifflement qui tombe (joué à l'annonce de l'impact)...
    meteorFall(ctx, out, t, { duration = 1.4 } = {}) {
        tone(ctx, out, t, { type: "sine", freq: 2400, freqEnd: 300, attack: duration * 0.8, release: 0.2, gain: 0.09 });
        noise(ctx, out, t, { filterType: "bandpass", freq: 4000, freqEnd: 500, q: 4, attack: duration * 0.8, release: 0.2, gain: 0.08 });
    },

    // ... puis explosion.
    explosion(ctx, out, t) {
        tone(ctx, out, t, { type: "sine", freq: vary(80), freqEnd: 30, release: 0.8, gain: 0.5 });
        noise(ctx, out, t, { filterType: "lowpass", freq: vary(3000, 0.2), freqEnd: 80, release: 0.9, gain: 0.45 });
    },

    // Zone qui brûle : grésillement.
    burn(ctx, out, t) {
        noise(ctx, out, t, { filterType: "bandpass", freq: 2500, q: 0.7, attack: 0.05, hold: 0.3, release: 0.4, gain: 0.12 });
    },

    goldenFruit(ctx, out, t) {
        for (const [i, n] of [79, 83, 86, 91].entries()) tone(ctx, out, t + i * 0.12, { type: "sine", freq: midi(n), release: 1, gain: 0.08 });
    },

    foodRain(ctx, out, t) {
        for (let i = 0; i < 10; i++) tone(ctx, out, t + Math.random() * 0.8, { type: "triangle", freq: vary(midi(76 + Math.floor(Math.random() * 10)), 0.02), release: 0.12, gain: 0.05 });
    },

    // Compte à rebours et départ.
    countdown(ctx, out, t, { go = false } = {}) {
        tone(ctx, out, t, { type: "square", freq: go ? midi(81) : midi(69), release: go ? 0.6 : 0.15, gain: 0.08, filter: { type: "lowpass", freq: 3000 } });
        if (go) tone(ctx, out, t, { type: "sine", freq: midi(45), release: 0.8, gain: 0.3 });
    },

    // Fin du timer : cloche.
    timeUp(ctx, out, t) {
        for (const r of [1, 2.4, 3.9]) tone(ctx, out, t, { type: "sine", freq: midi(69) * r, release: 2 / r, gain: 0.15 / r });
    },

    // Victoire des Snakes : fanfare majeure lumineuse.
    victorySnake(ctx, out, t) {
        const seq = [[60, 0], [64, 0.12], [67, 0.24], [72, 0.36], [76, 0.6], [79, 0.6], [84, 0.6]];
        for (const [n, d] of seq) tone(ctx, out, t + d, { type: "sawtooth", freq: midi(n), attack: 0.01, hold: d >= 0.6 ? 0.6 : 0.05, release: d >= 0.6 ? 1.2 : 0.15, gain: 0.06, filter: { type: "lowpass", freq: 3500 } });
        tone(ctx, out, t + 0.6, { type: "sine", freq: midi(48), release: 2, gain: 0.3 });
    },

    // Victoire du Snake God : chœur sombre et grave.
    victoryGod(ctx, out, t) {
        for (const n of [33, 45, 48, 52, 57]) {
            tone(ctx, out, t, { type: "sawtooth", freq: midi(n), detune: vary(6, 1), attack: 0.4, hold: 1, release: 2, gain: 0.05, filter: { type: "lowpass", freq: 1200 } });
        }
        tone(ctx, out, t, { type: "sine", freq: 45, freqEnd: 30, release: 3, gain: 0.45 });
    },

    // Défaite : courte descente douce, pas frustrante.
    defeat(ctx, out, t) {
        [[64, 0], [62, 0.2], [60, 0.4], [57, 0.6]].forEach(([n, d]) => tone(ctx, out, t + d, { type: "triangle", freq: midi(n), release: d === 0.6 ? 1.2 : 0.3, gain: 0.12 }));
    },

    // Élimination d'un joueur : sting court.
    elimination(ctx, out, t) {
        tone(ctx, out, t, { type: "sawtooth", freq: midi(57), attack: 0.01, release: 0.5, gain: 0.06, filter: { type: "lowpass", freq: 2000 } });
        tone(ctx, out, t, { type: "sawtooth", freq: midi(63), attack: 0.01, release: 0.5, gain: 0.05, filter: { type: "lowpass", freq: 2000 } });
    },
};
