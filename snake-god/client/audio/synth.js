// Briques de synthèse sonore (Web Audio API). Tous les sons du jeu sont
// fabriqués à partir de ces primitives : pas de fichiers audio à charger.

let noiseBuffer = null;

export function getNoise(ctx) {
    if (noiseBuffer?.sampleRate === ctx.sampleRate) return noiseBuffer;
    const len = ctx.sampleRate * 2;
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return noiseBuffer;
}

// Petite variation aléatoire (±pct) : un même son n'est jamais identique.
export const vary = (x, pct = 0.08) => x * (1 + (Math.random() * 2 - 1) * pct);
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// Enveloppe attaque / maintien / relâche sur un paramètre de gain.
export function envelope(param, t, { attack = 0.005, hold = 0, release = 0.2, peak = 1, from = 0 } = {}) {
    param.cancelScheduledValues(t);
    param.setValueAtTime(from, t);
    param.linearRampToValueAtTime(peak, t + attack);
    param.setValueAtTime(peak, t + attack + hold);
    param.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    return t + attack + hold + release;
}

// Oscillateur avec enveloppe et glissement de fréquence optionnel.
export function tone(ctx, out, t, {
    type = "sine",
    freq = 440,
    freqEnd = null,
    glide = null,
    detune = 0,
    attack = 0.005,
    hold = 0,
    release = 0.2,
    gain = 0.3,
    filter = null, // { type, freq, q, freqEnd }
} = {}) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.detune.value = detune;
    const end = t + attack + hold + release;
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), glide ? t + glide : end);
    const g = ctx.createGain();
    let node = osc;
    if (filter) {
        const f = ctx.createBiquadFilter();
        f.type = filter.type ?? "lowpass";
        f.frequency.setValueAtTime(filter.freq, t);
        if (filter.freqEnd) f.frequency.exponentialRampToValueAtTime(filter.freqEnd, end);
        f.Q.value = filter.q ?? 1;
        osc.connect(f);
        node = f;
    }
    node.connect(g).connect(out);
    envelope(g.gain, t, { attack, hold, release, peak: gain });
    osc.start(t);
    osc.stop(end + 0.05);
    return end;
}

// Bruit filtré (souffles, impacts, frottements).
export function noise(ctx, out, t, {
    filterType = "bandpass",
    freq = 1000,
    freqEnd = null,
    q = 1,
    attack = 0.005,
    hold = 0,
    release = 0.3,
    gain = 0.3,
} = {}) {
    const src = ctx.createBufferSource();
    src.buffer = getNoise(ctx);
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq, t);
    const end = t + attack + hold + release;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, end);
    f.Q.value = q;
    const g = ctx.createGain();
    src.connect(f).connect(g).connect(out);
    envelope(g.gain, t, { attack, hold, release, peak: gain });
    src.start(t, Math.random() * 1.5);
    src.stop(end + 0.05);
    return end;
}

// Réponse impulsionnelle synthétique pour la réverbération (salle immense).
export function impulse(ctx, seconds = 3, decay = 2.5) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
}

// Saturation douce (basse puissante, dégâts).
export function distortion(ctx, amount = 20) {
    const ws = ctx.createWaveShaper();
    const n = 1025; // impair : l'entrée 0 donne exactement 0 (pas de composante continue)
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
    }
    ws.curve = curve;
    return ws;
}
