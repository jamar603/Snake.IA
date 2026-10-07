import { distortion, fm, midi, noise, supersaw, swell, tone, vary } from "../synth.js";
import { braam } from "./god.js";

// Sons du monde : expansion du cube, phases, événements, compte à rebours, fin de partie.
export const WorldSounds = {
    // Expansion, étapes 1 et 2 : montée de tension et pulsations d'activation qui accélèrent.
    expansionRise(ctx, out, t, { duration = 2.8 } = {}) {
        swell(ctx, out, t, { duration: duration * 0.95, freq: 150, freqEnd: 6000, gain: 0.2 });
        supersaw(ctx, out, t, { freq: midi(45), voices: 5, attack: duration * 0.9, release: 0.1, gain: 0.06, filter: { type: "lowpass", freq: 300, freqEnd: 5000 } });
        tone(ctx, out, t, { type: "sawtooth", freq: midi(33), freqEnd: midi(45), attack: duration * 0.9, release: 0.1, gain: 0.06, filter: { type: "lowpass", freq: 400 } });
        let at = t + 0.3;
        let gap = 0.34;
        let n = 69;
        while (at < t + duration - 0.1) {
            fm(ctx, out, at, { freq: midi(n), ratio: 2, index: 2, release: 0.06, gain: 0.05, pan: Math.sin(at * 9) * 0.6 });
            at += gap;
            gap = Math.max(0.055, gap * 0.82);
            n = Math.min(93, n + 1);
        }
    },

    // Étape 3 : construction des cellules (grains numériques dispersés en stéréo).
    construction(ctx, out, t, { duration = 1.6 } = {}) {
        for (let i = 0; i < 34; i++) {
            const at = t + Math.random() * duration;
            fm(ctx, out, at, { freq: vary(midi(84 + Math.floor(Math.random() * 12)), 0.02), ratio: 2.5, index: 2, release: 0.06, gain: 0.035, pan: Math.random() * 2 - 1 });
            noise(ctx, out, at, { filterType: "highpass", freq: 6000, release: 0.015, gain: 0.03, pan: Math.random() * 2 - 1 });
        }
    },

    // Étape 4 : impact final, tout le cube résonne (braam + sub + cymbale).
    expansionImpact(ctx, out, t) {
        braam(ctx, out, t, { root: 33, duration: 2.2, gain: 0.08 });
        const drive = distortion(ctx, 8);
        drive.connect(out);
        tone(ctx, drive, t, { type: "sine", freq: 60, freqEnd: 28, release: 1.8, gain: 0.26 });
        noise(ctx, out, t, { filterType: "highpass", freq: 4500, freqEnd: 2500, release: 2.2, gain: 0.1 });
        noise(ctx, out, t, { filterType: "lowpass", freq: 2000, freqEnd: 60, release: 1.2, gain: 0.25 });
    },

    // Changement de phase : braam plus ou moins sombre selon la phase.
    phase(ctx, out, t, { phase = 2 } = {}) {
        const root = [0, 33, 33, 32, 31][phase] ?? 33;
        swell(ctx, out, t, { duration: 0.4, freq: 300, freqEnd: 4000, gain: 0.1 });
        braam(ctx, out, t + 0.4, { root, duration: 1.8, gain: 0.07 + phase * 0.01 });
        tone(ctx, out, t + 0.4, { type: "sine", freq: midi(root), release: 1.6, gain: 0.3 });
    },

    // Météore : sifflement qui tombe.
    meteorFall(ctx, out, t, { duration = 1.4 } = {}) {
        tone(ctx, out, t, { type: "sine", freq: 2800, freqEnd: 250, attack: duration * 0.85, release: 0.15, gain: 0.08, vibrato: 30 });
        noise(ctx, out, t, { filterType: "bandpass", freq: 5000, freqEnd: 400, q: 4, attack: duration * 0.85, release: 0.15, gain: 0.09 });
    },

    // Explosion : boum grave, souffle et crépitements.
    explosion(ctx, out, t) {
        const drive = distortion(ctx, 12);
        drive.connect(out);
        tone(ctx, drive, t, { type: "sine", freq: vary(85), freqEnd: 28, release: 0.8, gain: 0.28 });
        noise(ctx, out, t, { filterType: "lowpass", freq: vary(4000, 0.2), freqEnd: 90, release: 0.9, gain: 0.4 });
        for (let i = 0; i < 6; i++) noise(ctx, out, t + 0.05 + Math.random() * 0.5, { filterType: "highpass", freq: 3000, release: 0.02, gain: 0.06, pan: Math.random() * 2 - 1 });
    },

    // Zone qui brûle : grésillement électrique.
    burn(ctx, out, t) {
        noise(ctx, out, t, { filterType: "bandpass", freq: 2800, q: 0.7, attack: 0.04, hold: 0.3, release: 0.35, gain: 0.12 });
        fm(ctx, out, t, { freq: 110, ratio: 7.1, index: 4, attack: 0.04, hold: 0.25, release: 0.3, gain: 0.04 });
    },

    goldenFruit(ctx, out, t) {
        for (const [i, n] of [79, 83, 86, 91].entries()) fm(ctx, out, t + i * 0.11, { freq: midi(n), ratio: 3.5, index: 3, release: 1, gain: 0.07, pan: (i - 1.5) * 0.4 });
    },

    foodRain(ctx, out, t) {
        for (let i = 0; i < 10; i++) {
            fm(ctx, out, t + Math.random() * 0.8, { freq: vary(midi(76 + Math.floor(Math.random() * 10)), 0.02), ratio: 2, index: 1.5, release: 0.12, gain: 0.05, pan: Math.random() * 2 - 1 });
        }
    },

    // Compte à rebours : bips synthétiques, "go" = accord supersaw + basse.
    countdown(ctx, out, t, { go = false } = {}) {
        if (!go) {
            fm(ctx, out, t, { freq: midi(69), ratio: 2, index: 1.5, release: 0.18, gain: 0.1 });
            return;
        }
        for (const n of [57, 64, 69, 72]) supersaw(ctx, out, t, { freq: midi(n), voices: 5, release: 0.8, gain: 0.06, filter: { type: "lowpass", freq: 6000, freqEnd: 1500 } });
        tone(ctx, out, t, { type: "sine", freq: midi(33), release: 0.9, gain: 0.35 });
    },

    // Fin du timer : cloche FM.
    timeUp(ctx, out, t) {
        fm(ctx, out, t, { freq: midi(69), ratio: 3.5, index: 5, indexEnd: 0.2, release: 2.2, gain: 0.15 });
        fm(ctx, out, t, { freq: midi(57), ratio: 2, index: 2, release: 2, gain: 0.08 });
    },

    // Victoire des Snakes : fanfare synthwave (accords supersaw en montée).
    victorySnake(ctx, out, t) {
        const chords = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [57, 61, 64, 69]];
        chords.forEach((c, i) => {
            const at = t + i * 0.28;
            const last = i === chords.length - 1;
            for (const n of c) supersaw(ctx, out, at, { freq: midi(n), voices: 5, hold: last ? 0.8 : 0.12, release: last ? 1.5 : 0.15, gain: 0.06, filter: { type: "lowpass", freq: 5000, freqEnd: 1500 } });
            tone(ctx, out, at, { type: "sine", freq: midi(c[0] - 24), release: last ? 1.6 : 0.25, gain: 0.25 });
        });
        for (let i = 0; i < 8; i++) fm(ctx, out, t + 0.9 + i * 0.05, { freq: midi(81 + i * 2), ratio: 3, index: 2, release: 0.3, gain: 0.04, pan: Math.random() * 2 - 1 });
    },

    // Victoire du Snake God : braam sombre et chœur grave.
    victoryGod(ctx, out, t) {
        braam(ctx, out, t, { root: 33, duration: 3, gain: 0.09 });
        for (const n of [45, 48, 52, 57]) supersaw(ctx, out, t + 0.3, { freq: midi(n), voices: 3, attack: 0.6, hold: 1, release: 2, gain: 0.04, filter: { type: "lowpass", freq: 1400 } });
        tone(ctx, out, t, { type: "sine", freq: 45, freqEnd: 30, release: 3, gain: 0.4 });
    },

    // Défaite : descente douce, claire mais pas frustrante.
    defeat(ctx, out, t) {
        [[64, 0], [62, 0.22], [60, 0.44], [57, 0.66]].forEach(([n, d]) =>
            fm(ctx, out, t + d, { freq: midi(n), ratio: 2, index: 1.2, release: d === 0.66 ? 1.4 : 0.35, gain: 0.1 })
        );
        supersaw(ctx, out, t + 0.66, { freq: midi(45), voices: 3, attack: 0.3, release: 1.6, gain: 0.04, filter: { type: "lowpass", freq: 900 } });
    },

    // Élimination d'un joueur : sting dissonant court.
    elimination(ctx, out, t) {
        for (const n of [57, 63]) supersaw(ctx, out, t, { freq: midi(n), voices: 3, release: 0.6, gain: 0.05, filter: { type: "lowpass", freq: 2500, freqEnd: 600 } });
        tone(ctx, out, t, { type: "sine", freq: midi(33), release: 0.6, gain: 0.25 });
    },
};
