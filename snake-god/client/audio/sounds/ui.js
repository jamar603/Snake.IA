import { mallet, midi, noise, pop, vary, wood } from "../synth.js";

// Sons d'interface : bulles et bois, doux et nets.
export const UISounds = {
    hover(ctx, out, t) {
        wood(ctx, out, t, { freq: vary(1800, 0.03), gain: 0.025 });
    },
    click(ctx, out, t) {
        pop(ctx, out, t, { freq: vary(520, 0.04), to: 1.8, release: 0.07, gain: 0.12 });
    },
    back(ctx, out, t) {
        pop(ctx, out, t, { freq: 700, to: 0.6, release: 0.08, gain: 0.1 });
    },
    confirm(ctx, out, t) {
        mallet(ctx, out, t, { freq: midi(72), ratio: 4, release: 0.25, gain: 0.1 });
        mallet(ctx, out, t + 0.07, { freq: midi(79), ratio: 4, release: 0.4, gain: 0.1 });
    },
    error(ctx, out, t) {
        pop(ctx, out, t, { freq: 240, to: 0.75, release: 0.12, gain: 0.1 });
        pop(ctx, out, t + 0.09, { freq: 200, to: 0.75, release: 0.12, gain: 0.08 });
    },
    transition(ctx, out, t) {
        noise(ctx, out, t, { filterType: "bandpass", freq: 600, freqEnd: 2400, q: 1.2, attack: 0.14, release: 0.18, gain: 0.05 });
    },
};
