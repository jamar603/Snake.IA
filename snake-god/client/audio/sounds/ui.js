import { fm, midi, noise, swell, tone, vary } from "../synth.js";

// Sons d'interface : verre et énergie, discrets et nets.
export const UISounds = {
    hover(ctx, out, t) {
        fm(ctx, out, t, { freq: vary(midi(91), 0.01), ratio: 2, index: 1, release: 0.04, gain: 0.03 });
    },
    click(ctx, out, t) {
        fm(ctx, out, t, { freq: midi(79), ratio: 2, index: 2, release: 0.07, gain: 0.08 });
        noise(ctx, out, t, { filterType: "highpass", freq: 7000, release: 0.015, gain: 0.04 });
    },
    back(ctx, out, t) {
        fm(ctx, out, t, { freq: midi(79), ratio: 2, index: 1.5, release: 0.06, gain: 0.07 });
        fm(ctx, out, t + 0.04, { freq: midi(72), ratio: 2, index: 1.5, release: 0.08, gain: 0.06 });
    },
    confirm(ctx, out, t) {
        for (const [i, n] of [72, 79, 84].entries()) fm(ctx, out, t + i * 0.05, { freq: midi(n), ratio: 2, index: 1.8, release: 0.3, gain: 0.07 });
        tone(ctx, out, t, { type: "sine", freq: midi(48), release: 0.3, gain: 0.12 });
    },
    error(ctx, out, t) {
        fm(ctx, out, t, { freq: 180, ratio: 1.5, index: 3, release: 0.14, gain: 0.06 });
    },
    transition(ctx, out, t) {
        swell(ctx, out, t, { duration: 0.35, freq: 400, freqEnd: 5000, gain: 0.08 });
    },
};
