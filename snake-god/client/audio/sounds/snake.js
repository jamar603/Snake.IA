import { distortion, midi, noise, pick, tone, vary } from "../synth.js";

// Sons des Snakes : courts, toujours légèrement différents (hauteur, timbre, rythme).
export const SnakeSounds = {
    // Déplacement : petit "tic" feutré, alterné, à peine audible.
    move(ctx, out, t, { alt = false } = {}) {
        noise(ctx, out, t, { filterType: "bandpass", freq: vary(alt ? 900 : 700, 0.1), q: 2, release: 0.05, gain: 0.3 });
    },

    // Manger : arpège montant joyeux (3 variantes de gamme).
    eat(ctx, out, t) {
        const base = pick([72, 74, 76, 79]);
        const steps = pick([[0, 4, 7], [0, 5, 9], [0, 3, 7, 12]]);
        steps.forEach((s, i) => {
            tone(ctx, out, t + i * 0.045, { type: "triangle", freq: vary(midi(base + s), 0.01), release: 0.12, gain: 0.16 });
        });
        noise(ctx, out, t, { filterType: "highpass", freq: 3000, release: 0.05, gain: 0.08 });
    },

    // Fruit doré : accord scintillant + cloche.
    golden(ctx, out, t) {
        for (const [i, n] of [72, 76, 79, 84, 88].entries()) {
            tone(ctx, out, t + i * 0.05, { type: "sine", freq: midi(n), release: 0.6, gain: 0.12 });
            tone(ctx, out, t + i * 0.05, { type: "triangle", freq: midi(n + 12), release: 0.25, gain: 0.04 });
        }
    },

    // Récupération de PV : accord chaud qui monte et scintille.
    heal(ctx, out, t) {
        for (const [i, n] of [64, 68, 71, 76].entries()) tone(ctx, out, t + i * 0.06, { type: "sine", freq: midi(n), attack: 0.02, release: 0.5, gain: 0.1 });
        noise(ctx, out, t, { filterType: "bandpass", freq: 2000, freqEnd: 8000, q: 3, attack: 0.3, release: 0.3, gain: 0.04 });
    },

    // Croissance (un segment) : petit souffle grave.
    grow(ctx, out, t) {
        tone(ctx, out, t, { type: "sine", freq: vary(110), freqEnd: 165, attack: 0.02, release: 0.18, gain: 0.12 });
    },

    // Évolution : fanfare montante et brillante.
    evolve(ctx, out, t) {
        const notes = [60, 64, 67, 72, 76, 79, 84];
        notes.forEach((n, i) => {
            tone(ctx, out, t + i * 0.07, { type: "sawtooth", freq: midi(n), release: 0.35, gain: 0.07, filter: { type: "lowpass", freq: 3000, q: 1 } });
        });
        tone(ctx, out, t + 0.5, { type: "sine", freq: midi(48), attack: 0.05, release: 1.2, gain: 0.25 });
        noise(ctx, out, t, { filterType: "bandpass", freq: 800, freqEnd: 9000, q: 2, attack: 0.5, release: 0.3, gain: 0.08 });
    },

    // Perte de PV : zap descendant saturé + choc sourd.
    hurt(ctx, out, t) {
        const drive = distortion(ctx, 30);
        drive.connect(out);
        tone(ctx, drive, t, { type: "square", freq: vary(520, 0.12), freqEnd: 70, release: 0.3, gain: 0.12 });
        tone(ctx, out, t, { type: "sine", freq: 90, freqEnd: 40, release: 0.25, gain: 0.32 });
        noise(ctx, out, t, { filterType: "lowpass", freq: 1500, release: 0.15, gain: 0.2 });
    },

    // Collision (mur, bord) : impact mat.
    collision(ctx, out, t) {
        noise(ctx, out, t, { filterType: "lowpass", freq: vary(700), freqEnd: 120, release: 0.2, gain: 0.35 });
        tone(ctx, out, t, { type: "sine", freq: vary(70), freqEnd: 35, release: 0.2, gain: 0.4 });
    },

    // Réapparition : scintillement qui se matérialise.
    respawn(ctx, out, t) {
        for (let i = 0; i < 5; i++) tone(ctx, out, t + i * 0.04, { type: "sine", freq: vary(midi(84 - i * 3), 0.02), release: 0.15, gain: 0.05 });
        noise(ctx, out, t, { filterType: "bandpass", freq: 6000, freqEnd: 1500, q: 3, release: 0.3, gain: 0.06 });
    },

    // Mort : longue chute grave et souffle.
    death(ctx, out, t) {
        tone(ctx, out, t, { type: "sawtooth", freq: 330, freqEnd: 40, attack: 0.01, release: 1.4, gain: 0.18, filter: { type: "lowpass", freq: 2000, freqEnd: 150 } });
        tone(ctx, out, t, { type: "sine", freq: 60, freqEnd: 25, release: 1.2, gain: 0.5 });
        noise(ctx, out, t, { filterType: "lowpass", freq: 3000, freqEnd: 100, release: 1.3, gain: 0.3 });
    },

    // Piège déclenché (côté victime) : clic métallique puis explosion courte.
    trapHit(ctx, out, t) {
        tone(ctx, out, t, { type: "square", freq: 2400, release: 0.02, gain: 0.12 });
        noise(ctx, out, t + 0.03, { filterType: "lowpass", freq: 2500, freqEnd: 200, release: 0.35, gain: 0.35 });
    },

    // Danger tout proche : battement de cœur discret.
    heartbeat(ctx, out, t, { strength = 1 } = {}) {
        tone(ctx, out, t, { type: "sine", freq: 55, freqEnd: 40, attack: 0.01, release: 0.16, gain: 0.35 * strength });
        tone(ctx, out, t + 0.2, { type: "sine", freq: 50, freqEnd: 38, attack: 0.01, release: 0.2, gain: 0.25 * strength });
    },
};
