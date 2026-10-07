import { distortion, midi, noise, tone, vary } from "../synth.js";

// Identité sonore du Snake God : graves profonds, harmoniques étranges, réverbération.
// Chaque pouvoir a une signature reconnaissable les yeux fermés.
export const GodSounds = {
    // Piège : verrou métallique + note grave "armée".
    trap(ctx, out, t) {
        tone(ctx, out, t, { type: "square", freq: 1800, release: 0.03, gain: 0.1 });
        tone(ctx, out, t + 0.04, { type: "square", freq: 1200, release: 0.03, gain: 0.08 });
        tone(ctx, out, t + 0.06, { type: "sine", freq: vary(midi(45), 0.02), release: 0.5, gain: 0.25 });
    },

    // Mur : bloc de pierre qui s'élève + bourdonnement d'énergie.
    wall(ctx, out, t) {
        noise(ctx, out, t, { filterType: "lowpass", freq: 400, freqEnd: 1200, attack: 0.15, release: 0.25, gain: 0.3 });
        tone(ctx, out, t, { type: "sawtooth", freq: 55, attack: 0.1, release: 0.5, gain: 0.12, filter: { type: "lowpass", freq: 400 } });
        tone(ctx, out, t + 0.3, { type: "sine", freq: 80, freqEnd: 40, release: 0.2, gain: 0.35 });
    },

    // Mur rotatif posé : servomoteur + charge d'énergie.
    rotatingWall(ctx, out, t) {
        tone(ctx, out, t, { type: "sawtooth", freq: 90, freqEnd: 360, attack: 0.05, hold: 0.25, release: 0.2, gain: 0.08, filter: { type: "bandpass", freq: 800, q: 4 } });
        tone(ctx, out, t + 0.1, { type: "square", freq: 45, attack: 0.02, release: 0.6, gain: 0.08, filter: { type: "lowpass", freq: 300 } });
        noise(ctx, out, t, { filterType: "bandpass", freq: 3000, freqEnd: 600, q: 6, release: 0.5, gain: 0.08 });
    },

    // Rotation d'un mur : souffle balayé + cliquetis mécanique.
    rotate(ctx, out, t) {
        noise(ctx, out, t, { filterType: "bandpass", freq: 400, freqEnd: 2500, q: 2, attack: 0.15, release: 0.25, gain: 0.18 });
        for (let i = 0; i < 3; i++) tone(ctx, out, t + i * 0.07, { type: "square", freq: vary(700, 0.1), release: 0.02, gain: 0.05 });
    },

    // Démolition : craquement et éboulis.
    demolish(ctx, out, t) {
        noise(ctx, out, t, { filterType: "highpass", freq: 2000, release: 0.05, gain: 0.3 });
        noise(ctx, out, t + 0.03, { filterType: "lowpass", freq: 1800, freqEnd: 150, release: 0.7, gain: 0.35 });
        for (let i = 0; i < 6; i++) noise(ctx, out, t + 0.1 + i * vary(0.06, 0.4), { filterType: "bandpass", freq: vary(1200, 0.4), q: 3, release: 0.05, gain: 0.08 });
    },

    // Déclenchement d'événement : basse profonde + impact + longue réverbération.
    trigger(ctx, out, t) {
        const drive = distortion(ctx, 12);
        drive.connect(out);
        tone(ctx, drive, t, { type: "sine", freq: 70, freqEnd: 28, attack: 0.01, release: 1.6, gain: 0.38 });
        noise(ctx, out, t, { filterType: "lowpass", freq: 900, freqEnd: 80, release: 1.2, gain: 0.3 });
        for (const n of [33, 40, 45]) tone(ctx, out, t, { type: "sawtooth", freq: midi(n), attack: 0.02, release: 1.8, gain: 0.05, filter: { type: "lowpass", freq: 700 } });
    },

    // Zone dangereuse : sirène pulsée grave.
    zone(ctx, out, t) {
        for (let i = 0; i < 3; i++) {
            tone(ctx, out, t + i * 0.22, { type: "square", freq: 220, freqEnd: 150, release: 0.16, gain: 0.08, filter: { type: "lowpass", freq: 900 } });
        }
    },

    // Refus d'un pouvoir (énergie, recharge...) : buzz bref.
    denied(ctx, out, t) {
        tone(ctx, out, t, { type: "square", freq: 110, release: 0.12, gain: 0.08, filter: { type: "lowpass", freq: 600 } });
    },

    // Vision divine : nouvelle révélation (cloche cristalline et souffle mystique).
    intel(ctx, out, t) {
        for (const [i, n] of [81, 88, 93].entries()) {
            tone(ctx, out, t + i * 0.09, { type: "sine", freq: midi(n), release: 0.9, gain: 0.09 });
            tone(ctx, out, t + i * 0.09, { type: "sine", freq: midi(n) * 2.76, release: 0.3, gain: 0.02 }); // harmonique de cloche
        }
        noise(ctx, out, t, { filterType: "bandpass", freq: 5000, q: 8, attack: 0.2, release: 0.6, gain: 0.03 });
    },
};
