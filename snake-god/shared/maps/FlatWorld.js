import { AXES, add, key, neg } from "../grid.js";

const UP = [0, 1, 0];

// WORLD : grand terrain plat. Les cellules jouables sont sur une seule couche (y = layer),
// x et z dans l'arène. Le bord du terrain est un mur (pas de passage d'un côté à l'autre).
// Même interface que CubeWorld : le reste du jeu ne connaît que cette interface.
export class FlatWorld {
    constructor(space, arenaSize) {
        this.kind = "world";
        this.space = space;
        this.layer = 0; // le sol, en bas de l'espace de coordonnées
        this.setArenaSize(arenaSize);
    }

    setArenaSize(size) {
        const min = (this.space - size) / 2;
        this.arena = { min, max: min + size - 1, size };
        this.adjacency = new Map(); // cache des voisins
    }

    get cellCount() {
        return this.arena.size * this.arena.size;
    }

    #inside(v) {
        return v >= this.arena.min && v <= this.arena.max;
    }

    isCell(c) {
        return Array.isArray(c) && c.length === 3 && c[1] === this.layer && this.#inside(c[0]) && this.#inside(c[2]);
    }

    normalAt() {
        return [...UP];
    }

    tangentAxes() {
        return ["x", "z"];
    }

    normalAxis() {
        return "y";
    }

    sameFace() {
        return true;
    }

    // Un pas tout droit. Hors du terrain : la case renvoyée n'est pas jouable (choc au bord).
    step(cell, dir) {
        return { cell: add(cell, dir), dir, normal: [...UP] };
    }

    // Voisins sur le terrain (tableau partagé : ne pas le modifier).
    neighbors(c) {
        const k = key(c);
        let out = this.adjacency.get(k);
        if (!out) {
            out = [AXES.x, neg(AXES.x), AXES.z, neg(AXES.z)].map((d) => add(c, d)).filter((n) => this.isCell(n));
            this.adjacency.set(k, out);
        }
        return out;
    }

    ray(cell, dir, n) {
        const cells = [];
        let c = cell;
        for (let i = 0; i < n; i++) {
            c = add(c, dir);
            cells.push(c);
        }
        return cells;
    }

    randomCell(rng) {
        const { min, size } = this.arena;
        return [min + Math.floor(rng() * size), this.layer, min + Math.floor(rng() * size)];
    }

    *cells() {
        const { min, max } = this.arena;
        for (let x = min; x <= max; x++) for (let z = min; z <= max; z++) yield [x, this.layer, z];
    }

    // Départs : deux coins opposés, face à face en diagonale.
    spawnPoints() {
        const { min, max } = this.arena;
        return {
            snake1: { cell: [min + 2, this.layer, min + 3], dir: [1, 0, 0], up: [...UP] },
            snake2: { cell: [max - 2, this.layer, max - 3], dir: [-1, 0, 0], up: [...UP] },
        };
    }

    // Le terrain grandit sur ses bords : les cellules existantes ne bougent pas.
    expandTo(size) {
        this.setArenaSize(size);
        return (c) => c;
    }

    onFace(center, cells) {
        return cells.filter((c) => this.isCell(c));
    }

    describe() {
        return { kind: this.kind, space: this.space, arenaSize: this.arena.size };
    }
}
