import { chime, getNoise, midi, penta } from "./synth.js";

// Ambiance continue : brise douce, craquements de vinyle et carillons à vent rares.
// La brise s'ouvre avec l'intensité ; un bourdon grave n'apparaît que quand le monde
// approche de sa taille maximale (la tension monte sans casser le côté chill).
export class Ambient {
    constructor(audio) {
        this.audio = audio;
        this.intensity = 0;
    }

    start() {
        const ctx = this.audio.ctx;
        if (this.out || !ctx) return;
        this.out = ctx.createGain();
        this.out.gain.value = 0;
        this.out.gain.setTargetAtTime(1, ctx.currentTime, 2);
        this.out.connect(this.audio.buses.ambient);

        // Brise : bruit filtré dont la fréquence ondule lentement.
        const wind = ctx.createBufferSource();
        wind.buffer = getNoise(ctx);
        wind.loop = true;
        this.windFilter = ctx.createBiquadFilter();
        this.windFilter.type = "bandpass";
        this.windFilter.frequency.value = 500;
        this.windFilter.Q.value = 0.8;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.06;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 200;
        lfo.connect(lfoGain).connect(this.windFilter.frequency);
        this.windGain = ctx.createGain();
        this.windGain.gain.value = 0.04;
        wind.connect(this.windFilter).connect(this.windGain).connect(this.out);
        wind.start();
        lfo.start();

        // Vinyle : craquements aléatoires très discrets (bruit coupé en impulsions).
        this.crackle = ctx.createBufferSource();
        this.crackle.buffer = crackleBuffer(ctx);
        this.crackle.loop = true;
        const crackleFilter = ctx.createBiquadFilter();
        crackleFilter.type = "highpass";
        crackleFilter.frequency.value = 2500;
        this.crackleGain = ctx.createGain();
        this.crackleGain.gain.value = 0.05;
        this.crackle.connect(crackleFilter).connect(this.crackleGain).connect(this.out);
        this.crackle.start();

        // Bourdon : deux sinus graves légèrement désaccordés, silencieux au début.
        this.droneGain = ctx.createGain();
        this.droneGain.gain.value = 0;
        for (const f of [55, 55.4, 82.5]) {
            const o = ctx.createOscillator();
            o.frequency.value = f;
            o.connect(this.droneGain);
            o.start();
        }
        this.droneGain.connect(this.out);

        // Carillons à vent : quelques notes pentatoniques de temps en temps.
        const ring = () => {
            if (ctx.state === "running" && this.intensity < 0.7) {
                const t = ctx.currentTime + 0.05;
                const count = 1 + Math.floor(Math.random() * 3);
                for (let i = 0; i < count; i++) {
                    chime(ctx, this.out, t + i * (0.15 + Math.random() * 0.2), {
                        freq: midi(penta(84, Math.floor(Math.random() * 7))),
                        release: 2.2,
                        gain: 0.012,
                        pan: Math.random() * 1.6 - 0.8,
                    });
                }
            }
            this.chimeTimer = setTimeout(ring, 7000 + Math.random() * 9000);
        };
        this.chimeTimer = setTimeout(ring, 4000);
    }

    // intensity : 0..1 ; worldFill : 0..1 (taille du monde / taille maximale).
    update(intensity, worldFill) {
        this.intensity = intensity;
        if (!this.out) return;
        const t = this.audio.ctx.currentTime;
        this.windFilter.frequency.setTargetAtTime(400 + intensity * 900, t, 2);
        this.windGain.gain.setTargetAtTime(0.03 + intensity * 0.04, t, 2);
        this.droneGain.gain.setTargetAtTime(worldFill > 0.6 ? (worldFill - 0.6) * 0.12 : 0, t, 2);
    }
}

// Deux secondes de craquements : silence parsemé de petits clics d'amplitude variable.
function crackleBuffer(ctx) {
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
        if (Math.random() < 0.0007) d[i] = (Math.random() * 2 - 1) * (0.3 + Math.random() * 0.7);
    }
    return buf;
}
