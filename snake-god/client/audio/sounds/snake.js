import { chime, mallet, midi, noise, penta, pluck, pop, tone, vary, wood } from "../synth.js";

// Sons des Snakes : arcade « cozy », ronds et rebondissants. Chaque son varie
// (hauteur, timbre, panoramique) pour ne jamais lasser.
const ROOT = 72; // do5 : registre clair, agréable à répéter

export const SnakeSounds = {
    // Déplacement : « toc » de bois feutré, alterné gauche / droite, presque subliminal.
    move(ctx, out, t, { alt = false } = {}) {
        wood(ctx, out, t, { freq: vary(alt ? 1250 : 1050, 0.04), gain: 0.05, pan: alt ? 0.15 : -0.15 });
    },

    // Manger : bouchée selon l'aliment + note de marimba qui monte avec le combo
    // (gamme pentatonique : un enchaînement de repas joue une petite mélodie).
    eat(ctx, out, t, { combo = 0, flavor = "crunch" } = {}) {
        const step = Math.min(combo, 9);
        switch (flavor) {
            case "crunch": // pomme, carotte : croquant
                noise(ctx, out, t, { filterType: "bandpass", freq: vary(3200, 0.15), q: 1.5, release: 0.05, gain: 0.16 });
                noise(ctx, out, t + 0.035, { filterType: "bandpass", freq: vary(2400, 0.15), q: 1.5, release: 0.04, gain: 0.1 });
                break;
            case "juicy": // ananas : éclaboussure
                pop(ctx, out, t, { freq: vary(500), to: 2.4, release: 0.08, gain: 0.16 });
                noise(ctx, out, t + 0.01, { filterType: "highpass", freq: 5000, release: 0.08, gain: 0.06 });
                break;
            case "chomp": // viande : grosse bouchée grave
                tone(ctx, out, t, { type: "sine", freq: vary(170), freqEnd: 90, release: 0.12, gain: 0.22 });
                noise(ctx, out, t, { filterType: "lowpass", freq: 900, release: 0.08, gain: 0.12 });
                break;
            case "squish": // champignon : boing mou
                tone(ctx, out, t, { type: "sine", freq: vary(260), freqEnd: 520, glide: 0.06, release: 0.14, gain: 0.14, vibrato: 60 });
                break;
            default: // cerises, raisin : petite bulle
                pop(ctx, out, t, { freq: vary(600), to: 1.8, release: 0.07, gain: 0.18 });
        }
        mallet(ctx, out, t + 0.03, { freq: midi(penta(ROOT, step)), ratio: 4, release: 0.4, gain: 0.13 });
        if (step >= 3) mallet(ctx, out, t + 0.09, { freq: midi(penta(ROOT, step + 2)), ratio: 5.4, release: 0.35, gain: 0.07, pan: 0.3 });
    },

    // Fruit doré : arpège de kalimba et carillon, comme un trésor.
    golden(ctx, out, t) {
        [0, 2, 4, 5, 7].forEach((s, i) => mallet(ctx, out, t + i * 0.055, { freq: midi(penta(ROOT, s)), ratio: 5.4, release: 0.6, gain: 0.1, pan: (i - 2) * 0.25 }));
        chime(ctx, out, t + 0.3, { freq: midi(ROOT + 24), release: 1.4, gain: 0.05 });
        noise(ctx, out, t, { filterType: "highpass", freq: 7000, attack: 0.15, release: 0.4, gain: 0.03 });
    },

    // Récupération de PV : accord chaud qui s'élève, doux.
    heal(ctx, out, t) {
        [0, 4, 7, 12].forEach((n, i) => pluck(ctx, out, t + i * 0.06, { freq: midi(60 + n), release: 0.7, gain: 0.08, cutoff: 3000 }));
        chime(ctx, out, t + 0.25, { freq: midi(84), release: 0.9, gain: 0.04 });
    },

    // Croissance : petite bulle grave qui gonfle.
    grow(ctx, out, t) {
        pop(ctx, out, t, { freq: vary(150), to: 1.6, release: 0.12, gain: 0.12 });
    },

    // Évolution : arpège joyeux qui monte puis accord de fanfare douce.
    evolve(ctx, out, t) {
        [0, 1, 2, 3, 4, 5, 6, 7].forEach((s, i) => mallet(ctx, out, t + i * 0.045, { freq: midi(penta(ROOT - 12, s)), ratio: 4, release: 0.3, gain: 0.08, pan: (i / 7 - 0.5) * 0.8 }));
        for (const n of [60, 64, 67, 72]) pluck(ctx, out, t + 0.4, { freq: midi(n), release: 1.2, gain: 0.07, cutoff: 3500 });
        tone(ctx, out, t + 0.4, { type: "sine", freq: midi(48), release: 1, gain: 0.18 });
        chime(ctx, out, t + 0.45, { freq: midi(96), release: 1.5, gain: 0.04 });
    },

    // Perte de PV : « bonk » de dessin animé (choc + note qui retombe).
    hurt(ctx, out, t) {
        tone(ctx, out, t, { type: "sine", freq: vary(420, 0.1), freqEnd: 140, glide: 0.18, release: 0.22, gain: 0.22 });
        tone(ctx, out, t, { type: "square", freq: vary(210, 0.1), freqEnd: 70, glide: 0.18, release: 0.18, gain: 0.04, filter: { type: "lowpass", freq: 1200 } });
        wood(ctx, out, t, { freq: 500, gain: 0.18 });
    },

    // Collision : « boing » mat, rebond élastique.
    collision(ctx, out, t) {
        tone(ctx, out, t, { type: "sine", freq: vary(110), freqEnd: 55, release: 0.2, gain: 0.26 });
        tone(ctx, out, t + 0.02, { type: "sine", freq: vary(300), freqEnd: 180, release: 0.25, gain: 0.08, vibrato: 90 });
    },

    // Réapparition : glissando léger vers le haut (« tadaa » discret).
    respawn(ctx, out, t) {
        [0, 2, 4].forEach((s, i) => mallet(ctx, out, t + i * 0.06, { freq: midi(penta(ROOT, s + 5)), ratio: 5.4, release: 0.25, gain: 0.06 }));
        noise(ctx, out, t, { filterType: "bandpass", freq: 2000, attack: 0.12, release: 0.1, gain: 0.04 });
    },

    // Mort : « wah-wah » descendant, triste mais pas frustrant.
    death(ctx, out, t) {
        [0, -1, -2, -4].forEach((s, i) => {
            const last = i === 3;
            tone(ctx, out, t + i * 0.22, { type: "triangle", freq: midi(penta(60, s)), freqEnd: last ? midi(penta(60, s)) * 0.7 : null, vibrato: last ? 40 : 0, attack: 0.01, hold: last ? 0.3 : 0.08, release: last ? 0.6 : 0.12, gain: 0.12, filter: { type: "lowpass", freq: 1600 } });
        });
        tone(ctx, out, t, { type: "sine", freq: 80, freqEnd: 40, release: 0.9, gain: 0.15 });
    },

    // Piège déclenché : son propre à chaque modèle (catalog.js).
    trapHit(ctx, out, t, { kind = "RuneMine" } = {}) {
        switch (kind) {
            case "JawTrap": // mâchoires : clac métallique double
                noise(ctx, out, t, { filterType: "highpass", freq: 3000, release: 0.03, gain: 0.25 });
                tone(ctx, out, t, { type: "square", freq: 900, freqEnd: 300, release: 0.05, gain: 0.05 });
                noise(ctx, out, t + 0.05, { filterType: "bandpass", freq: 1800, q: 3, release: 0.06, gain: 0.15 });
                break;
            case "SpikeTrap": // pointes : « shling »
                noise(ctx, out, t, { filterType: "bandpass", freq: 4000, freqEnd: 8000, q: 4, release: 0.15, gain: 0.14 });
                chime(ctx, out, t, { freq: 1500, release: 0.25, gain: 0.04 });
                break;
            case "FireTrap": // feu : « fwoosh »
                noise(ctx, out, t, { filterType: "lowpass", freq: 600, freqEnd: 3500, attack: 0.04, release: 0.35, gain: 0.22 });
                noise(ctx, out, t + 0.05, { filterType: "bandpass", freq: 1800, q: 0.7, release: 0.3, gain: 0.08 });
                break;
            case "TeslaTrap": // tesla : zap électrique
                tone(ctx, out, t, { type: "sawtooth", freq: 1400, freqEnd: 200, release: 0.12, gain: 0.05, vibrato: 400 });
                for (let i = 0; i < 4; i++) noise(ctx, out, t + i * 0.03, { filterType: "highpass", freq: 4000, release: 0.02, gain: 0.1 });
                break;
            case "SawTrap": // scie : vrombissement qui monte
                tone(ctx, out, t, { type: "sawtooth", freq: 180, freqEnd: 520, release: 0.25, gain: 0.06, filter: { type: "bandpass", freq: 1500, q: 3 } });
                noise(ctx, out, t, { filterType: "bandpass", freq: 3500, q: 2, release: 0.2, gain: 0.08 });
                break;
            default: // mine : pouf
                pop(ctx, out, t, { freq: 200, to: 0.4, release: 0.2, gain: 0.25 });
                noise(ctx, out, t, { filterType: "lowpass", freq: 2200, freqEnd: 200, release: 0.3, gain: 0.2 });
        }
        tone(ctx, out, t + 0.02, { type: "sine", freq: 120, freqEnd: 50, release: 0.22, gain: 0.2 });
    },

    // Danger tout proche : battement de cœur doux.
    heartbeat(ctx, out, t, { strength = 1 } = {}) {
        tone(ctx, out, t, { type: "sine", freq: 62, freqEnd: 44, attack: 0.01, release: 0.14, gain: 0.26 * strength });
        tone(ctx, out, t + 0.19, { type: "sine", freq: 55, freqEnd: 40, attack: 0.01, release: 0.18, gain: 0.18 * strength });
    },
};
