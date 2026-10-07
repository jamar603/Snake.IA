import { midi, noise, tone, vary } from "../synth.js";

// Sons d'interface : discrets, nets, cohérents avec l'univers (cristal, énergie).
export const UISounds = {
    hover(ctx, out, t) {
        tone(ctx, out, t, { type: "sine", freq: vary(midi(88), 0.01), release: 0.04, gain: 0.025 });
    },
    click(ctx, out, t) {
        tone(ctx, out, t, { type: "triangle", freq: midi(76), release: 0.06, gain: 0.08 });
        tone(ctx, out, t + 0.03, { type: "triangle", freq: midi(83), release: 0.08, gain: 0.06 });
    },
    back(ctx, out, t) {
        tone(ctx, out, t, { type: "triangle", freq: midi(79), release: 0.06, gain: 0.07 });
        tone(ctx, out, t + 0.03, { type: "triangle", freq: midi(72), release: 0.08, gain: 0.06 });
    },
    confirm(ctx, out, t) {
        for (const [i, n] of [72, 79, 84].entries()) tone(ctx, out, t + i * 0.05, { type: "sine", freq: midi(n), release: 0.25, gain: 0.08 });
    },
    error(ctx, out, t) {
        tone(ctx, out, t, { type: "square", freq: 160, release: 0.12, gain: 0.05, filter: { type: "lowpass", freq: 900 } });
    },
    transition(ctx, out, t) {
        noise(ctx, out, t, { filterType: "bandpass", freq: 300, freqEnd: 3000, q: 1.5, attack: 0.2, release: 0.2, gain: 0.12 });
    },
};
