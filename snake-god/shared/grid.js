// Outils de grille partagés. Une cellule ou une direction est un tableau [x, y, z]
// d'entiers. Le serveur et le client utilisent exactement les mêmes calculs.

export const AXES = {
    x: [1, 0, 0],
    y: [0, 1, 0],
    z: [0, 0, 1],
};

// `+ 0` transforme -0 en 0 : les comparaisons et clés restent stables.
const n0 = (v) => v + 0;

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, k) => [n0(a[0] * k), n0(a[1] * k), n0(a[2] * k)];
export const neg = (a) => [n0(-a[0]), n0(-a[1]), n0(-a[2])];
export const equals = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
export const cross = (a, b) => [
    n0(a[1] * b[2] - a[2] * b[1]),
    n0(a[2] * b[0] - a[0] * b[2]),
    n0(a[0] * b[1] - a[1] * b[0]),
];
export const key = (c) => `${c[0]},${c[1]},${c[2]}`;
export const chebyshev = (a, b) =>
    Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));

// `bounds` : un nombre (cube 0..size-1) ou une arène { min, max } (bornes incluses).
export function inBounds(c, bounds) {
    const min = typeof bounds === "number" ? 0 : bounds.min;
    const max = typeof bounds === "number" ? bounds - 1 : bounds.max;
    return c[0] >= min && c[1] >= min && c[2] >= min && c[0] <= max && c[1] <= max && c[2] <= max;
}

// Arène de `size` cellules centrée dans l'espace de coordonnées `maxSize`.
// Le monde grandit sans décaler les coordonnées existantes.
export function arenaFor(size, maxSize) {
    const min = (maxSize - size) / 2;
    return { min, max: min + size - 1, size };
}

// Rotation d'un quart de tour (règle de la main droite) autour d'un axe, `turns` fois.
export function rotateQuarter(v, axis, turns = 1) {
    let [x, y, z] = v;
    const count = ((turns % 4) + 4) % 4;
    for (let i = 0; i < count; i++) {
        if (axis === "x") [y, z] = [-z, y];
        else if (axis === "y") [x, z] = [z, -x];
        else [x, y] = [-y, x];
    }
    return [n0(x), n0(y), n0(z)];
}

// Direction initiale de la barre d'un mur rotatif (perpendiculaire à l'axe).
export const ROTATING_BAR_DIR = {
    x: [0, 1, 0],
    y: [1, 0, 0],
    z: [0, 1, 0],
};

export function rotatingWallOffsets(axis, arm) {
    const dir = ROTATING_BAR_DIR[axis];
    const offsets = [];
    for (let i = -arm; i <= arm; i++) offsets.push(scale(dir, i));
    return offsets;
}

export function rotatingWallCells(pivot, axis, arm, turns) {
    return rotatingWallOffsets(axis, arm).map((o) => add(pivot, rotateQuarter(o, axis, turns)));
}

// `accept` : fonction (cellule) -> booléen (ex. « sur la même face »), ou des bornes.
const acceptor = (accept) => (typeof accept === "function" ? accept : (c) => inBounds(c, accept));

// Un mur rotatif doit rester dans la map dans ses 4 orientations.
export function rotatingWallFits(pivot, axis, arm, accept) {
    const ok = acceptor(accept);
    for (let t = 0; t < 4; t++) {
        for (const c of rotatingWallCells(pivot, axis, arm, t)) {
            if (!ok(c)) return false;
        }
    }
    return true;
}

// Cellules d'un mur droit centré sur `center`, orienté selon `axis`.
export function straightWallCells(center, axis, length) {
    const dir = AXES[axis];
    const half = Math.floor(length / 2);
    const cells = [];
    for (let i = -half; i < length - half; i++) cells.push(add(center, scale(dir, i)));
    return cells;
}

// Dalle carrée centrée sur `center`, perpendiculaire à `axis`, coupée aux bords de la face.
export function dangerZoneCells(center, axis, radius, accept) {
    const ok = acceptor(accept);
    const [u, v] = Object.keys(AXES).filter((a) => a !== axis).map((a) => AXES[a]);
    const cells = [];
    for (let i = -radius; i <= radius; i++) {
        for (let j = -radius; j <= radius; j++) {
            const c = add(center, add(scale(u, i), scale(v, j)));
            if (ok(c)) cells.push(c);
        }
    }
    return cells;
}
