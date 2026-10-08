import { chime, distortion, fm, mallet, midi, noise, pluck, pop, supersaw, swell, tone, vary, wood } from "../synth.js";

// « Braam » grave adouci : accord de dents de scie filtré qui s'ouvre (gros moments seulement).
function braam(ctx, out, t, { root = 33, duration = 1.6, gain = 0.1 } = {}) {
    const drive = distortion(ctx, 3);
    drive.connect(out);
    for (const n of [root, root + 7, root + 12]) {
        supersaw(ctx, drive, t, { freq: midi(n), voices: 3, spread: 12, attack: 0.05, hold: duration * 0.3, release: duration * 0.7, gain, filter: { type: "lowpass", freq: 220, freqEnd: 1400, time: duration * 0.35 } });
    }
}

// Identité sonore du Snake God : un magicien farceur. Graves ronds, carillons
// espiègles, bois et métal légers. Chaque pouvoir est reconnaissable les yeux fermés.
export const GodSounds = {
    // Piège : « clic-clac » de mécanisme puis petit tintement malicieux.
    trap(ctx, out, t) {
        wood(ctx, out, t, { freq: 1400, gain: 0.12 });
        wood(ctx, out, t + 0.06, { freq: 1050, gain: 0.1 });
        chime(ctx, out, t + 0.1, { freq: midi(vary(86, 0.01)), release: 0.5, gain: 0.04 });
    },

    // Mur : bloc de pierre qui tombe (« pouf » grave + poussière).
    wall(ctx, out, t) {
        tone(ctx, out, t, { type: "sine", freq: 150, freqEnd: 55, release: 0.25, gain: 0.3 });
        noise(ctx, out, t, { filterType: "lowpass", freq: 900, freqEnd: 150, release: 0.3, gain: 0.18 });
        wood(ctx, out, t, { freq: 320, gain: 0.12 });
    },

    // Mur rotatif posé : ressort qu'on remonte puis « tchac ».
    rotatingWall(ctx, out, t) {
        for (let i = 0; i < 5; i++) wood(ctx, out, t + i * 0.06, { freq: 900 + i * 120, gain: 0.06 });
        tone(ctx, out, t + 0.34, { type: "sine", freq: 220, freqEnd: 110, release: 0.2, gain: 0.2 });
        noise(ctx, out, t + 0.34, { filterType: "highpass", freq: 3000, release: 0.05, gain: 0.12 });
    },

    // Rotation d'une lame : « whoosh » balayé.
    rotate(ctx, out, t) {
        noise(ctx, out, t, { filterType: "bandpass", freq: 400, freqEnd: 2600, q: 2, attack: 0.15, release: 0.2, gain: 0.16 });
        wood(ctx, out, t + 0.32, { freq: 700, gain: 0.08 });
    },

    // Démolition : éboulis de petits cailloux.
    demolish(ctx, out, t) {
        tone(ctx, out, t, { type: "sine", freq: 120, freqEnd: 45, release: 0.3, gain: 0.25 });
        for (let i = 0; i < 7; i++) wood(ctx, out, t + 0.04 + i * vary(0.05, 0.4), { freq: vary(600, 0.4), gain: 0.07, pan: Math.random() - 0.5 });
        noise(ctx, out, t, { filterType: "lowpass", freq: 1500, freqEnd: 200, release: 0.4, gain: 0.12 });
    },

    // Déclenchement d'un événement : montée magique, gong et accord grave.
    trigger(ctx, out, t) {
        swell(ctx, out, t, { duration: 0.5, freq: 400, freqEnd: 3000, gain: 0.1 });
        braam(ctx, out, t + 0.5, { root: 36, duration: 1.6, gain: 0.06 });
        fm(ctx, out, t + 0.5, { freq: midi(48), ratio: 1.41, index: 3, indexEnd: 0.2, release: 2, gain: 0.12 });
        tone(ctx, out, t + 0.5, { type: "sine", freq: 65, freqEnd: 45, release: 1.4, gain: 0.3 });
    },

    // Zone dangereuse : sirène douce qui ondule (deux notes).
    zone(ctx, out, t) {
        for (let i = 0; i < 3; i++) {
            tone(ctx, out, t + i * 0.22, { type: "triangle", freq: midi(i % 2 ? 74 : 79), attack: 0.02, release: 0.18, gain: 0.07, vibrato: 30 });
        }
        tone(ctx, out, t, { type: "sine", freq: midi(43), attack: 0.05, release: 0.6, gain: 0.12 });
    },

    // Refus d'un pouvoir : petit « bop » étouffé.
    denied(ctx, out, t) {
        pop(ctx, out, t, { freq: 220, to: 0.7, release: 0.1, gain: 0.12 });
    },

    // Vision divine : carillon mystérieux qui scintille.
    intel(ctx, out, t) {
        [88, 91, 95].forEach((n, i) => chime(ctx, out, t + i * 0.1, { freq: midi(n), release: 1, gain: 0.05, pan: (i - 1) * 0.5 }));
        pluck(ctx, out, t, { freq: midi(64), release: 0.8, gain: 0.05 });
        mallet(ctx, out, t + 0.3, { freq: midi(76), ratio: 5.4, release: 0.5, gain: 0.05 });
    },
};

export { braam };
