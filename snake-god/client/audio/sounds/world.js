import { chime, fm, mallet, midi, noise, penta, pluck, pop, swell, tone, vary, wood } from "../synth.js";
import { braam } from "./god.js";

// Sons du monde : expansion du cube, phases, événements, compte à rebours, fin de partie.
// Ton général : jeu de plateau magique, plus « boîte à musique » que film catastrophe.
export const WorldSounds = {
    // Expansion, étapes 1 et 2 : glissando de harpe qui accélère et monte.
    expansionRise(ctx, out, t, { duration = 2.8 } = {}) {
        swell(ctx, out, t, { duration: duration * 0.95, freq: 300, freqEnd: 4000, gain: 0.08 });
        tone(ctx, out, t, { type: "triangle", freq: midi(48), freqEnd: midi(60), attack: duration * 0.9, release: 0.1, gain: 0.05, filter: { type: "lowpass", freq: 1200 } });
        let at = t + 0.2;
        let gap = 0.3;
        let step = 0;
        while (at < t + duration - 0.1) {
            pluck(ctx, out, at, { freq: midi(penta(60, step)), release: 0.3, gain: 0.06, pan: Math.sin(at * 9) * 0.6 });
            at += gap;
            gap = Math.max(0.05, gap * 0.85);
            step = Math.min(14, step + 1);
        }
    },

    // Étape 3 : construction des cellules (petits « tocs » et tintements dispersés).
    construction(ctx, out, t, { duration = 1.6 } = {}) {
        for (let i = 0; i < 26; i++) {
            const at = t + Math.random() * duration;
            if (i % 3) wood(ctx, out, at, { freq: vary(1100, 0.3), gain: 0.04, pan: Math.random() * 2 - 1 });
            else mallet(ctx, out, at, { freq: midi(penta(72, Math.floor(Math.random() * 8))), ratio: 5.4, release: 0.2, gain: 0.035, pan: Math.random() * 2 - 1 });
        }
    },

    // Étape 4 : le monde a grandi (gong doux + accord lumineux).
    expansionImpact(ctx, out, t) {
        fm(ctx, out, t, { freq: midi(43), ratio: 1.41, index: 3, indexEnd: 0.1, release: 2.4, gain: 0.12 });
        for (const n of [60, 64, 67, 71, 74]) pluck(ctx, out, t, { freq: midi(n), release: 1.6, gain: 0.05, cutoff: 3500 });
        tone(ctx, out, t, { type: "sine", freq: 70, freqEnd: 45, release: 1.2, gain: 0.25 });
        chime(ctx, out, t + 0.1, { freq: midi(96), release: 1.8, gain: 0.04 });
    },

    // Changement de phase : accord qui change de couleur, plus grave à chaque phase.
    phase(ctx, out, t, { phase = 2 } = {}) {
        const root = [0, 48, 46, 45, 43][phase] ?? 48;
        swell(ctx, out, t, { duration: 0.35, freq: 400, freqEnd: 3000, gain: 0.06 });
        braam(ctx, out, t + 0.35, { root: root - 12, duration: 1.4, gain: 0.04 + phase * 0.008 });
        for (const n of [0, 7, 12, 16]) pluck(ctx, out, t + 0.35, { freq: midi(root + n), release: 1.4, gain: 0.05 });
    },

    // Météore : sifflement de dessin animé qui tombe.
    meteorFall(ctx, out, t, { duration = 1.4 } = {}) {
        tone(ctx, out, t, { type: "sine", freq: 2200, freqEnd: 300, attack: duration * 0.85, release: 0.12, gain: 0.07, vibrato: 25 });
    },

    // Explosion : « boum » feutré et rond.
    explosion(ctx, out, t) {
        tone(ctx, out, t, { type: "sine", freq: vary(110), freqEnd: 38, release: 0.6, gain: 0.3 });
        noise(ctx, out, t, { filterType: "lowpass", freq: vary(2400, 0.2), freqEnd: 120, release: 0.6, gain: 0.28 });
        for (let i = 0; i < 4; i++) wood(ctx, out, t + 0.08 + Math.random() * 0.35, { freq: vary(500, 0.4), gain: 0.05, pan: Math.random() * 2 - 1 });
    },

    // Zone qui brûle : grésillement doux.
    burn(ctx, out, t) {
        noise(ctx, out, t, { filterType: "bandpass", freq: 3000, q: 0.8, attack: 0.04, hold: 0.25, release: 0.3, gain: 0.08 });
        for (let i = 0; i < 5; i++) noise(ctx, out, t + Math.random() * 0.5, { filterType: "highpass", freq: 5000, release: 0.015, gain: 0.05, pan: Math.random() - 0.5 });
    },

    // Fruit doré annoncé : boîte à musique.
    goldenFruit(ctx, out, t) {
        [4, 5, 7, 9].forEach((s, i) => mallet(ctx, out, t + i * 0.1, { freq: midi(penta(72, s)), ratio: 5.4, release: 0.8, gain: 0.07, pan: (i - 1.5) * 0.4 }));
    },

    // Pluie de nourriture : gouttes qui rebondissent.
    foodRain(ctx, out, t) {
        for (let i = 0; i < 10; i++) {
            pop(ctx, out, t + Math.random() * 0.8, { freq: midi(penta(72, Math.floor(Math.random() * 8))), to: 1.5, release: 0.08, gain: 0.06, pan: Math.random() * 2 - 1 });
        }
    },

    // Compte à rebours : blocs de bois ; « go » = accord joyeux.
    countdown(ctx, out, t, { go = false } = {}) {
        if (!go) {
            wood(ctx, out, t, { freq: 880, gain: 0.16 });
            return;
        }
        for (const n of [60, 64, 67, 72]) pluck(ctx, out, t, { freq: midi(n), release: 0.7, gain: 0.08, cutoff: 4000 });
        mallet(ctx, out, t, { freq: midi(84), ratio: 4, release: 0.5, gain: 0.1 });
        tone(ctx, out, t, { type: "sine", freq: midi(36), release: 0.5, gain: 0.25 });
    },

    // Fin du timer : cloche.
    timeUp(ctx, out, t) {
        chime(ctx, out, t, { freq: midi(81), release: 2, gain: 0.1 });
        fm(ctx, out, t, { freq: midi(57), ratio: 2, index: 1.5, release: 1.6, gain: 0.06 });
    },

    // Victoire des Snakes : petite fanfare enjouée (marimba + accords).
    victorySnake(ctx, out, t) {
        const melody = [[0, 0], [2, 0.12], [4, 0.24], [7, 0.36], [4, 0.5], [7, 0.62], [12, 0.78]];
        for (const [n, d] of melody) mallet(ctx, out, t + d, { freq: midi(72 + n), ratio: 4, release: n === 12 ? 1 : 0.25, gain: 0.11 });
        [[60, 64, 67], [65, 69, 72], [67, 71, 74], [72, 76, 79]].forEach((c, i) => {
            for (const n of c) pluck(ctx, out, t + i * 0.26, { freq: midi(n - 12), release: i === 3 ? 1.4 : 0.3, gain: 0.05 });
        });
        chime(ctx, out, t + 0.8, { freq: midi(96), release: 1.6, gain: 0.05 });
    },

    // Victoire du Snake God : thème de méchant farceur (mineur, malicieux, pas angoissant).
    victoryGod(ctx, out, t) {
        [[57, 0], [60, 0.18], [63, 0.36], [62, 0.54], [57, 0.8]].forEach(([n, d], i) =>
            pluck(ctx, out, t + d, { freq: midi(n - 12), release: i === 4 ? 1.4 : 0.25, gain: 0.12, cutoff: 1800 })
        );
        braam(ctx, out, t + 0.8, { root: 33, duration: 2, gain: 0.05 });
        chime(ctx, out, t + 0.8, { freq: midi(81), release: 1.6, gain: 0.05 });
    },

    // Défaite : petite descente douce.
    defeat(ctx, out, t) {
        [[67, 0], [65, 0.22], [64, 0.44], [60, 0.66]].forEach(([n, d], i) =>
            mallet(ctx, out, t + d, { freq: midi(n), ratio: 4, release: i === 3 ? 1.2 : 0.3, gain: 0.1 })
        );
        pluck(ctx, out, t + 0.66, { freq: midi(48), release: 1.4, gain: 0.06 });
    },

    // Élimination d'un joueur : « boup-boup » descendant.
    elimination(ctx, out, t) {
        pop(ctx, out, t, { freq: 520, to: 0.6, release: 0.15, gain: 0.14 });
        pop(ctx, out, t + 0.16, { freq: 390, to: 0.5, release: 0.25, gain: 0.12 });
    },
};
