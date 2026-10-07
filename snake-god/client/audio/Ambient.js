import { getNoise } from "./synth.js";

// Ambiance continue : vent cosmique et bourdon grave. Le vent s'ouvre avec
// l'intensité ; le bourdon gronde quand le monde approche de sa taille maximale.
export class Ambient {
    constructor(audio) {
        this.audio = audio;
    }

    start() {
        const ctx = this.audio.ctx;
        if (this.out || !ctx) return;
        this.out = ctx.createGain();
        this.out.gain.value = 0;
        this.out.gain.setTargetAtTime(1, ctx.currentTime, 2);
        this.out.connect(this.audio.buses.ambient);

        // Vent : bruit filtré dont la fréquence ondule lentement.
        const wind = ctx.createBufferSource();
        wind.buffer = getNoise(ctx);
        wind.loop = true;
        this.windFilter = ctx.createBiquadFilter();
        this.windFilter.type = "bandpass";
        this.windFilter.frequency.value = 400;
        this.windFilter.Q.value = 1.2;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.07;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 180;
        lfo.connect(lfoGain).connect(this.windFilter.frequency);
        this.windGain = ctx.createGain();
        this.windGain.gain.value = 0.07;
        wind.connect(this.windFilter).connect(this.windGain).connect(this.out);
        wind.start();
        lfo.start();

        // Bourdon : deux sinus graves légèrement désaccordés (battements lents).
        this.droneGain = ctx.createGain();
        this.droneGain.gain.value = 0.04;
        for (const f of [55, 55.4, 82.5]) {
            const o = ctx.createOscillator();
            o.frequency.value = f;
            o.connect(this.droneGain);
            o.start();
        }
        this.droneGain.connect(this.out);
    }

    // intensity : 0..1 ; worldFill : 0..1 (taille du monde / taille maximale).
    update(intensity, worldFill) {
        if (!this.out) return;
        const t = this.audio.ctx.currentTime;
        this.windFilter.frequency.setTargetAtTime(300 + intensity * 1400, t, 2);
        this.windGain.gain.setTargetAtTime(0.05 + intensity * 0.06, t, 2);
        this.droneGain.gain.setTargetAtTime(0.03 + worldFill * worldFill * 0.07, t, 2);
    }
}
