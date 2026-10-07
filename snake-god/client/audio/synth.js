// Briques de synthèse sonore (Web Audio API). Tous les sons du jeu sont
// fabriqués à partir de ces primitives : pas de fichiers audio à charger.
// Style visé : arcade sci-fi / darksynth (FM cristallin, supersaw, sub, glitch).

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
    param.setValueAtTime(peak, t + attack + Math.max(0, hold));
    param.exponentialRampToValueAtTime(0.0001, t + attack + Math.max(0, hold) + release);
    return t + attack + Math.max(0, hold) + release;
}

// Sortie avec panoramique stéréo optionnel (-1 gauche, 1 droite).
function panned(ctx, out, pan) {
    if (pan === null || pan === undefined || !ctx.createStereoPanner) return out;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(out);
    return p;
}

// Filtre avec enveloppe : s'ouvre à `freq` puis se referme vers `freqEnd`.
function filtered(ctx, src, t, end, filter) {
    if (!filter) return src;
    const f = ctx.createBiquadFilter();
    f.type = filter.type ?? "lowpass";
    f.frequency.setValueAtTime(filter.freq, t);
    if (filter.freqEnd) f.frequency.exponentialRampToValueAtTime(filter.freqEnd, filter.time ? t + filter.time : end);
    f.Q.value = filter.q ?? 1;
    src.connect(f);
    return f;
}

// Oscillateur avec enveloppe, glissement, vibrato, filtre et panoramique.
export function tone(ctx, out, t, {
    type = "sine",
    freq = 440,
    freqEnd = null,
    glide = null,
    detune = 0,
    vibrato = 0, // profondeur en cents
    attack = 0.005,
    hold = 0,
    release = 0.2,
    gain = 0.3,
    filter = null, // { type, freq, freqEnd, q, time }
    pan = null,
} = {}) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.detune.value = detune;
    const end = t + attack + Math.max(0, hold) + release;
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), glide ? t + glide : end);
    if (vibrato) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 5.5;
        const depth = ctx.createGain();
        depth.gain.value = vibrato;
        lfo.connect(depth).connect(osc.detune);
        lfo.start(t);
        lfo.stop(end + 0.05);
    }
    const g = ctx.createGain();
    filtered(ctx, osc, t, end, filter).connect(g).connect(panned(ctx, out, pan));
    envelope(g.gain, t, { attack, hold, release, peak: gain });
    osc.start(t);
    osc.stop(end + 0.05);
    return end;
}

// Synthèse FM : timbres cristallins, cloches, métal. L'indice de modulation
// peut décroître (attaque brillante qui s'adoucit).
export function fm(ctx, out, t, {
    freq = 440,
    freqEnd = null,
    ratio = 2,
    index = 3,
    indexEnd = 0.2,
    attack = 0.003,
    hold = 0,
    release = 0.4,
    gain = 0.2,
    pan = null,
} = {}) {
    const end = t + attack + Math.max(0, hold) + release;
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    car.frequency.setValueAtTime(freq, t);
    mod.frequency.setValueAtTime(freq * ratio, t);
    if (freqEnd) {
        car.frequency.exponentialRampToValueAtTime(freqEnd, end);
        mod.frequency.exponentialRampToValueAtTime(freqEnd * ratio, end);
    }
    modGain.gain.setValueAtTime(freq * index, t);
    modGain.gain.exponentialRampToValueAtTime(Math.max(0.01, freq * indexEnd), end);
    mod.connect(modGain).connect(car.frequency);
    const g = ctx.createGain();
    car.connect(g).connect(panned(ctx, out, pan));
    envelope(g.gain, t, { attack, hold, release, peak: gain });
    car.start(t);
    mod.start(t);
    car.stop(end + 0.05);
    mod.stop(end + 0.05);
    return end;
}

// Supersaw : plusieurs dents de scie désaccordées et étalées en stéréo.
export function supersaw(ctx, out, t, { freq = 220, voices = 5, spread = 22, width = 0.8, gain = 0.15, ...rest } = {}) {
    let end = t;
    for (let i = 0; i < voices; i++) {
        const k = voices === 1 ? 0 : (i / (voices - 1)) * 2 - 1;
        end = tone(ctx, out, t, { type: "sawtooth", freq, detune: k * spread, pan: k * width, gain: gain / Math.sqrt(voices), ...rest });
    }
    return end;
}

// Bruit filtré (souffles, impacts, cymbales, frottements).
export function noise(ctx, out, t, {
    filterType = "bandpass",
    freq = 1000,
    freqEnd = null,
    q = 1,
    attack = 0.005,
    hold = 0,
    release = 0.3,
    gain = 0.3,
    pan = null,
} = {}) {
    const src = ctx.createBufferSource();
    src.buffer = getNoise(ctx);
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq, t);
    const end = t + attack + Math.max(0, hold) + release;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, end);
    f.Q.value = q;
    const g = ctx.createGain();
    src.connect(f).connect(g).connect(panned(ctx, out, pan));
    envelope(g.gain, t, { attack, hold, release, peak: gain });
    src.start(t, Math.random() * 1.5);
    src.stop(end + 0.05);
    return end;
}

// Montée inversée ("reverse swell") : le son enfle puis se coupe net, avant un impact.
export function swell(ctx, out, t, { duration = 0.6, freq = 800, freqEnd = 4000, gain = 0.15, pan = null } = {}) {
    const src = ctx.createBufferSource();
    src.buffer = getNoise(ctx);
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 2;
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + duration);
    g.gain.linearRampToValueAtTime(0, t + duration + 0.02);
    src.connect(f).connect(g).connect(panned(ctx, out, pan));
    src.start(t);
    src.stop(t + duration + 0.05);
    return t + duration;
}

// Réponse impulsionnelle synthétique pour la réverbération (salle immense, stéréo).
export function impulse(ctx, seconds = 3, decay = 2.5) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
}

// Saturation douce (basses puissantes, impacts).
export function distortion(ctx, amount = 20) {
    const ws = ctx.createWaveShaper();
    const n = 1025; // impair : l'entrée 0 donne exactement 0 (pas de composante continue)
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
    }
    ws.curve = curve;
    ws.oversample = "2x";
    return ws;
}

// Réduction de résolution : son "glitch" numérique (dégâts, erreurs).
export function bitcrush(ctx, steps = 6) {
    const ws = ctx.createWaveShaper();
    const n = 1025;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        curve[i] = Math.round(x * steps) / steps;
    }
    ws.curve = curve;
    return ws;
}
