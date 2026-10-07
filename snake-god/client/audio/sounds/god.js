import { distortion, fm, midi, noise, supersaw, swell, tone, vary } from "../synth.js";

// "Braam" cinématique : pile de dents de scie graves dont le filtre s'ouvre.
function braam(ctx, out, t, { root = 33, duration = 1.6, gain = 0.1 } = {}) {
    const drive = distortion(ctx, 6);
    drive.connect(out);
    for (const n of [root, root + 7, root + 12]) {
        supersaw(ctx, drive, t, { freq: midi(n), voices: 3, spread: 14, attack: 0.03, hold: duration * 0.3, release: duration * 0.7, gain, filter: { type: "lowpass", freq: 250, freqEnd: 2200, time: duration * 0.35 } });
    }
}

// Identité sonore du Snake God : graves profonds, métal FM, braams cinématiques,
// montées inversées. Chaque pouvoir est reconnaissable les yeux fermés.
export const GodSounds = {
    // Piège : verrou métallique FM + ronronnement "armé".
    trap(ctx, out, t) {
        fm(ctx, out, t, { freq: 1400, ratio: 1.41, index: 8, indexEnd: 0.5, release: 0.09, gain: 0.12 });
        fm(ctx, out, t + 0.05, { freq: 900, ratio: 1.41, index: 6, indexEnd: 0.5, release: 0.07, gain: 0.08 });
        tone(ctx, out, t + 0.07, { type: "sawtooth", freq: midi(33), attack: 0.02, release: 0.5, gain: 0.08, filter: { type: "lowpass", freq: 600, freqEnd: 150 } });
    },

    // Mur : surgissement de pierre + choc grave + énergie.
    wall(ctx, out, t) {
        swell(ctx, out, t, { duration: 0.22, freq: 200, freqEnd: 1500, gain: 0.12 });
        noise(ctx, out, t + 0.2, { filterType: "lowpass", freq: 1200, freqEnd: 120, release: 0.4, gain: 0.3 });
        tone(ctx, out, t + 0.2, { type: "sine", freq: 85, freqEnd: 38, release: 0.35, gain: 0.4 });
        fm(ctx, out, t + 0.2, { freq: midi(57), ratio: 0.5, index: 4, indexEnd: 0.5, release: 0.5, gain: 0.05 });
    },

    // Mur rotatif posé : servomoteur qui monte + charge d'énergie + clank.
    rotatingWall(ctx, out, t) {
        tone(ctx, out, t, { type: "sawtooth", freq: 70, freqEnd: 420, attack: 0.05, hold: 0.3, release: 0.15, gain: 0.07, filter: { type: "bandpass", freq: 900, q: 5 } });
        fm(ctx, out, t + 0.45, { freq: 220, ratio: 1.41, index: 10, indexEnd: 1, release: 0.25, gain: 0.12 });
        tone(ctx, out, t + 0.45, { type: "sine", freq: 70, freqEnd: 40, release: 0.4, gain: 0.35 });
    },

    // Rotation d'une lame : "whoosh" balayé + cliquetis mécanique.
    rotate(ctx, out, t) {
        noise(ctx, out, t, { filterType: "bandpass", freq: 300, freqEnd: 3500, q: 2.5, attack: 0.18, release: 0.22, gain: 0.2 });
        for (let i = 0; i < 3; i++) fm(ctx, out, t + 0.2 + i * 0.05, { freq: vary(600, 0.1), ratio: 1.41, index: 5, release: 0.03, gain: 0.05 });
    },

    // Démolition : craquement, effondrement, éboulis.
    demolish(ctx, out, t) {
        noise(ctx, out, t, { filterType: "highpass", freq: 2500, release: 0.04, gain: 0.3 });
        tone(ctx, out, t, { type: "sine", freq: 100, freqEnd: 30, release: 0.5, gain: 0.35 });
        noise(ctx, out, t + 0.02, { filterType: "lowpass", freq: 2000, freqEnd: 150, release: 0.7, gain: 0.3 });
        for (let i = 0; i < 7; i++) noise(ctx, out, t + 0.12 + i * vary(0.06, 0.4), { filterType: "bandpass", freq: vary(1400, 0.4), q: 3, release: 0.05, gain: 0.07, pan: Math.random() - 0.5 });
    },

    // Déclenchement d'événement (pouvoir puissant) : montée inversée, braam, basse profonde.
    trigger(ctx, out, t) {
        swell(ctx, out, t, { duration: 0.5, freq: 200, freqEnd: 3000, gain: 0.15 });
        braam(ctx, out, t + 0.5, { root: 33, duration: 2, gain: 0.09 });
        tone(ctx, out, t + 0.5, { type: "sine", freq: 62, freqEnd: 26, release: 1.8, gain: 0.45 });
        noise(ctx, out, t + 0.5, { filterType: "lowpass", freq: 1200, freqEnd: 60, release: 1.4, gain: 0.25 });
    },

    // Zone dangereuse : alarme FM pulsée.
    zone(ctx, out, t) {
        for (let i = 0; i < 3; i++) {
            fm(ctx, out, t + i * 0.2, { freq: 330, freqEnd: 220, ratio: 0.5, index: 3, indexEnd: 1, release: 0.15, gain: 0.08 });
        }
        tone(ctx, out, t, { type: "sawtooth", freq: midi(33), attack: 0.05, release: 0.6, gain: 0.06, filter: { type: "lowpass", freq: 400 } });
    },

    // Refus d'un pouvoir (énergie, recharge...) : petit "bip" grave étouffé.
    denied(ctx, out, t) {
        fm(ctx, out, t, { freq: 140, ratio: 1.5, index: 2, release: 0.12, gain: 0.08 });
    },

    // Vision divine : montée inversée cristalline puis cloche FM, mystérieuse.
    intel(ctx, out, t) {
        swell(ctx, out, t, { duration: 0.3, freq: 2000, freqEnd: 10000, gain: 0.04 });
        for (const [i, n] of [81, 88, 93].entries()) {
            fm(ctx, out, t + 0.3 + i * 0.1, { freq: midi(n), ratio: 3.5, index: 4, indexEnd: 0.2, release: 1.1, gain: 0.07, pan: (i - 1) * 0.5 });
        }
    },
};

export { braam };
