import * as THREE from "three";

// Textures procédurales (dessinées dans un canvas) : pas de fichiers à charger.
const cache = new Map();

function canvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return [c, c.getContext("2d")];
}

function toTexture(c, { repeat = false, color = true } = {}) {
    const t = new THREE.CanvasTexture(c);
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
}

const hex = (n) => `#${n.toString(16).padStart(6, "0")}`;

function mixColor(a, b, t) {
    const c = (shift) => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t);
    return (c(16) << 16) | (c(8) << 8) | c(0);
}

// Pseudo-aléatoire stable : la même peau donne toujours la même texture.
function seeded(seed) {
    let s = seed;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

// Peau d'un Snake : `map` (couleur) + `emissiveMap` (parties lumineuses).
// u = le long du corps (se répète), v = tour du corps (0 et 1 = dos, 0.5 = ventre).
export function snakeSkinTextures(skin) {
    const id = `skin:${skin.pattern}:${skin.primary}`;
    if (cache.has(id)) return cache.get(id);
    const W = 256;
    const H = 256;
    const [cm, g] = canvas(W, H);
    const [ce, e] = canvas(W, H);
    const rand = seeded(skin.primary % 100000 + 7);

    // Dos foncé (haut et bas du canvas, qui se rejoignent) -> flancs -> ventre clair au milieu.
    const back = hex(mixColor(skin.secondary, skin.primary, 0.45));
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, back);
    grad.addColorStop(0.25, hex(skin.primary));
    grad.addColorStop(0.75, hex(skin.primary));
    grad.addColorStop(1, back);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    e.fillStyle = "#000";
    e.fillRect(0, 0, W, H);

    const glow = hex(skin.glow);
    const dark = hex(mixColor(skin.secondary, skin.primary, 0.2));
    g.lineCap = e.lineCap = "round";

    switch (skin.pattern) {
        case "scales": {
            const s = 32;
            for (let row = 0; row < H / (s / 2) + 1; row++) {
                for (let col = -1; col < W / s + 1; col++) {
                    const x = col * s + (row % 2 ? s / 2 : 0);
                    const y = row * (s / 2);
                    g.strokeStyle = "rgba(0,0,0,0.35)";
                    g.lineWidth = 2;
                    g.beginPath();
                    g.arc(x, y, s / 2, 0, Math.PI);
                    g.stroke();
                    e.strokeStyle = glow;
                    e.globalAlpha = y < H * 0.45 ? 0.55 : 0.15;
                    e.lineWidth = 1.5;
                    e.beginPath();
                    e.arc(x, y + 1, s / 2 - 2, 0.2, Math.PI - 0.2);
                    e.stroke();
                }
            }
            break;
        }
        case "cracks": {
            g.globalAlpha = 0.55;
            g.fillStyle = dark;
            g.fillRect(0, 0, W, H * 0.6);
            g.globalAlpha = 1;
            for (let i = 0; i < 26; i++) {
                let x = rand() * W;
                let y = rand() * H * 0.7;
                const pts = [[x, y]];
                for (let k = 0; k < 6; k++) {
                    x += (rand() - 0.5) * 50;
                    y += (rand() - 0.3) * 30;
                    pts.push([x, y]);
                }
                for (const [ctx, color, width] of [[g, hex(skin.primary), 5], [e, glow, 3]]) {
                    ctx.strokeStyle = color;
                    ctx.lineWidth = width;
                    ctx.globalAlpha = 1;
                    ctx.beginPath();
                    pts.forEach(([px, py], j) => (j ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
                    ctx.stroke();
                }
            }
            break;
        }
        case "stripes": {
            for (let i = -2; i < 8; i++) {
                const x = i * 48;
                g.fillStyle = dark;
                g.beginPath();
                g.moveTo(x, 0);
                g.lineTo(x + 22, 0);
                g.lineTo(x + 22 + 60, H * 0.62);
                g.lineTo(x + 60, H * 0.62);
                g.fill();
                e.strokeStyle = glow;
                e.lineWidth = 3;
                e.beginPath();
                e.moveTo(x + 24, 0);
                e.lineTo(x + 84, H * 0.62);
                e.stroke();
            }
            break;
        }
        case "runes": {
            g.globalAlpha = 0.25;
            g.fillStyle = dark;
            g.fillRect(0, 0, W, H);
            g.globalAlpha = 1;
            for (let i = 0; i < 14; i++) {
                const cx = (i % 7) * 37 + 18;
                const cy = i < 7 ? 40 : 110;
                e.strokeStyle = glow;
                e.lineWidth = 2.5;
                e.beginPath();
                for (let k = 0; k < 4; k++) {
                    const a = rand() * Math.PI * 2;
                    const r = 6 + rand() * 9;
                    e.moveTo(cx, cy);
                    e.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
                }
                e.arc(cx, cy, 11, 0, Math.PI * 2);
                e.stroke();
            }
            break;
        }
        case "diamonds": {
            const s = 42;
            for (let x = 0; x <= W + s; x += s) {
                for (let y = 0; y <= H * 0.7; y += s) {
                    g.fillStyle = dark;
                    g.beginPath();
                    g.moveTo(x, y - s / 2.6);
                    g.lineTo(x + s / 3.2, y);
                    g.lineTo(x, y + s / 2.6);
                    g.lineTo(x - s / 3.2, y);
                    g.fill();
                    e.fillStyle = glow;
                    e.beginPath();
                    e.arc(x, y, 3, 0, Math.PI * 2);
                    e.fill();
                }
            }
            break;
        }
        case "spots": {
            g.globalAlpha = 0.5;
            g.fillStyle = dark;
            g.fillRect(0, 0, W, H * 0.6);
            g.globalAlpha = 1;
            for (let i = 0; i < 40; i++) {
                const x = rand() * W;
                const y = rand() * H * 0.68;
                const r = 3 + rand() * 7;
                g.fillStyle = hex(skin.primary);
                g.beginPath();
                g.arc(x, y, r + 2, 0, Math.PI * 2);
                g.fill();
                const rg = e.createRadialGradient(x, y, 0, x, y, r + 3);
                rg.addColorStop(0, glow);
                rg.addColorStop(1, "rgba(0,0,0,0)");
                e.fillStyle = rg;
                e.beginPath();
                e.arc(x, y, r + 3, 0, Math.PI * 2);
                e.fill();
            }
            break;
        }
    }
    // Ventre : bande claire et peu lumineuse.
    const belly = g.createLinearGradient(0, H * 0.3, 0, H * 0.7);
    belly.addColorStop(0, "rgba(0,0,0,0)");
    belly.addColorStop(0.5, hex(skin.belly));
    belly.addColorStop(1, "rgba(0,0,0,0)");
    g.globalAlpha = 0.85;
    g.fillStyle = belly;
    g.fillRect(0, H * 0.3, W, H * 0.4);
    // Écailles ventrales transversales.
    g.globalAlpha = 0.25;
    g.strokeStyle = hex(skin.secondary);
    g.lineWidth = 2;
    for (let x = 0; x < W; x += 16) {
        g.beginPath();
        g.moveTo(x, H * 0.38);
        g.lineTo(x, H * 0.62);
        g.stroke();
    }
    g.globalAlpha = 1;
    e.globalAlpha = 0.85;
    e.fillStyle = "#000";
    e.fillRect(0, H * 0.36, W, H * 0.28);
    e.globalAlpha = 1;

    const result = { map: toTexture(cm, { repeat: true }), emissiveMap: toTexture(ce, { repeat: true }) };
    cache.set(id, result);
    return result;
}

// Halo doux (sprites lumineux, particules).
export function glowTexture() {
    if (cache.has("glow")) return cache.get("glow");
    const [c, g] = canvas(64, 64);
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const t = toTexture(c);
    cache.set("glow", t);
    return t;
}

// Bloc d'obsidienne parcouru de circuits lumineux (murs du dieu).
export function circuitTextures(color = "#b36bff") {
    const id = `circuit:${color}`;
    if (cache.has(id)) return cache.get(id);
    const [cm, g] = canvas(128, 128);
    const [ce, e] = canvas(128, 128);
    const rand = seeded(1234);
    const grad = g.createLinearGradient(0, 0, 128, 128);
    grad.addColorStop(0, "#1b1530");
    grad.addColorStop(1, "#0a0814");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    e.fillStyle = "#000";
    e.fillRect(0, 0, 128, 128);
    e.strokeStyle = color;
    e.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
        let x = Math.floor(rand() * 8) * 16 + 8;
        let y = Math.floor(rand() * 8) * 16 + 8;
        e.beginPath();
        e.moveTo(x, y);
        for (let k = 0; k < 4; k++) {
            if (rand() < 0.5) x += (rand() < 0.5 ? -1 : 1) * 16;
            else y += (rand() < 0.5 ? -1 : 1) * 16;
            e.lineTo(x, y);
        }
        e.stroke();
        e.fillStyle = color;
        e.fillRect(x - 3, y - 3, 6, 6);
    }
    // Liseré lumineux sur les bords du bloc.
    e.strokeStyle = color;
    e.lineWidth = 5;
    e.strokeRect(2, 2, 124, 124);
    const result = { map: toTexture(cm), emissiveMap: toTexture(ce) };
    cache.set(id, result);
    return result;
}

// Anneau de runes du socle sous le cube.
export function runeRingTexture() {
    if (cache.has("runes")) return cache.get("runes");
    const S = 512;
    const [c, g] = canvas(S, S);
    const rand = seeded(99);
    g.translate(S / 2, S / 2);
    g.strokeStyle = "#c48cff";
    g.lineWidth = 3;
    for (const r of [240, 222, 160, 150]) {
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.stroke();
    }
    for (let i = 0; i < 36; i++) {
        g.save();
        g.rotate((i / 36) * Math.PI * 2);
        g.translate(0, -191);
        g.lineWidth = 2.5;
        g.beginPath();
        for (let k = 0; k < 3; k++) {
            const x1 = (rand() - 0.5) * 18;
            const y1 = (rand() - 0.5) * 22;
            g.moveTo(x1, y1);
            g.lineTo((rand() - 0.5) * 18, (rand() - 0.5) * 22);
        }
        g.stroke();
        g.restore();
    }
    for (let i = 0; i < 6; i++) {
        g.save();
        g.rotate((i / 6) * Math.PI * 2);
        g.beginPath();
        g.moveTo(0, -150);
        g.lineTo(0, -60);
        g.stroke();
        g.restore();
    }
    const t = toTexture(c);
    cache.set("runes", t);
    return t;
}

// Hachures d'avertissement (zones dangereuses).
export function hazardTexture() {
    if (cache.has("hazard")) return cache.get("hazard");
    const [c, g] = canvas(64, 64);
    g.fillStyle = "#000";
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = "#fff";
    g.lineWidth = 9;
    for (let i = -64; i < 128; i += 22) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i + 64, 64);
        g.stroke();
    }
    const t = toTexture(c, { repeat: true });
    cache.set("hazard", t);
    return t;
}
