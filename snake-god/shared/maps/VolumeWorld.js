import { AXES, add, inBounds, key, neg } from "../grid.js";

const UP = [0, 1, 0];
const DIRECTIONS = [AXES.x, neg(AXES.x), AXES.y, neg(AXES.y), AXES.z, neg(AXES.z)];

// CUBE 3D (version classique) : les Snakes se déplacent DANS le volume du cube, avec
// quatre virages relatifs à la tête (gauche, droite, haut, bas). Le bord du cube est un mur.
// Même interface que CubeWorld et FlatWorld ; il n'y a pas de face : `normalAt` renvoie
// le haut du monde (les objets restent droits, les météores tombent du ciel).
export class VolumeWorld {
    constructor(space, arenaSize) {
        this.kind = "volume";
        this.space = space;
        this.setArenaSize(arenaSize);
    }

    setArenaSize(size) {
        const min = (this.space - size) / 2;
        this.arena = { min, max: min + size - 1, size };
        this.adjacency = new Map();
    }

    get cellCount() {
        return this.arena.size ** 3;
    }

    isCell(c) {
        return Array.isArray(c) && c.length === 3 && inBounds(c, this.arena);
    }

    normalAt() {
        return [...UP];
    }

    // Toutes les directions sont possibles pour un mur dans le volume.
    tangentAxes() {
        return ["x", "y", "z"];
    }

    normalAxis() {
        return "y";
    }

    sameFace() {
        return true;
    }

    // Un pas tout droit. `normal` absente : le Snake garde son propre « haut ».
    step(cell, dir) {
        return { cell: add(cell, dir), dir, normal: null };
    }

    neighbors(c) {
        const k = key(c);
        let out = this.adjacency.get(k);
        if (!out) {
            out = DIRECTIONS.map((d) => add(c, d)).filter((n) => this.isCell(n));
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
        const r = () => min + Math.floor(rng() * size);
        return [r(), r(), r()];
    }

    *cells() {
        const { min, max } = this.arena;
        for (let x = min; x <= max; x++) for (let y = min; y <= max; y++) for (let z = min; z <= max; z++) yield [x, y, z];
    }

    // Départs : couloirs différents, pas de choc frontal dès le départ (version classique).
    spawnPoints() {
        const { min, max } = this.arena;
        return {
            snake1: { cell: [min, min + 1, min + 1], dir: [1, 0, 0], up: [...UP] },
            snake2: { cell: [max, max - 1, max - 1], dir: [-1, 0, 0], up: [...UP] },
        };
    }

    // Le volume grandit autour de son centre : les cellules existantes ne bougent pas.
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
