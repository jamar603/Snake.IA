import { AXES, add, equals, key, neg, sub } from "../grid.js";

const AXIS_NAMES = ["x", "y", "z"];

// CUBE : les Snakes rampent sur les 6 faces d'un cube plein (l'arène).
// Une cellule de surface est un point entier dont UNE coordonnée vaut min - 1 ou max + 1
// (la couche juste à l'extérieur du bloc) et les deux autres sont dans [min, max].
// Chaque cellule appartient donc à une seule face ; sa normale sort du cube.
//
// Passage d'une face à l'autre : en avançant de `dir` depuis une cellule de normale N,
// si la case visée sort de la face (deux coordonnées hors du bloc), on « tombe » sur la
// face voisine : case = p + dir - N, nouvelle direction = -N, nouvelle normale = dir.
export class CubeWorld {
    constructor(space, arenaSize) {
        this.kind = "cube";
        this.space = space; // espace de coordonnées (taille max + la couche de surface)
        this.setArenaSize(arenaSize);
    }

    setArenaSize(size) {
        const min = (this.space - size) / 2;
        this.arena = { min, max: min + size - 1, size };
        this.adjacency = new Map(); // cache des voisins (la surface change avec la taille)
    }

    // Nombre de cellules jouables (sert à la densité du monde).
    get cellCount() {
        return 6 * this.arena.size * this.arena.size;
    }

    #inside(v) {
        return v >= this.arena.min && v <= this.arena.max;
    }

    isCell(c) {
        if (!Array.isArray(c) || c.length !== 3) return false;
        let outside = 0;
        for (const v of c) {
            if (this.#inside(v)) continue;
            if (v !== this.arena.min - 1 && v !== this.arena.max + 1) return false;
            outside++;
        }
        return outside === 1;
    }

    // Normale sortante de la face de `c`.
    normalAt(c) {
        for (let i = 0; i < 3; i++) {
            if (c[i] < this.arena.min) return AXES[AXIS_NAMES[i]].map((v) => -v + 0);
            if (c[i] > this.arena.max) return [...AXES[AXIS_NAMES[i]]];
        }
        return [0, 1, 0];
    }

    // Axes du plan de la face (les murs et la lame rotative s'y couchent).
    tangentAxes(c) {
        const n = this.normalAt(c);
        return AXIS_NAMES.filter((a) => AXES[a].every((v, i) => v * n[i] === 0));
    }

    normalAxis(c) {
        const n = this.normalAt(c);
        return AXIS_NAMES[n.findIndex((v) => v !== 0)];
    }

    sameFace(a, b) {
        return equals(this.normalAt(a), this.normalAt(b));
    }

    // Un pas depuis `cell` dans la direction `dir` (tangente). Renvoie { cell, dir, normal }.
    step(cell, dir) {
        const normal = this.normalAt(cell);
        const next = add(cell, dir);
        if (this.isCell(next)) return { cell: next, dir, normal };
        // Arête : on passe sur la face voisine.
        return { cell: sub(next, normal), dir: neg(normal), normal: [...dir] };
    }

    // Les 4 voisins d'une cellule (arêtes comprises). Tableau partagé : ne pas le modifier.
    neighbors(c) {
        const k = key(c);
        let out = this.adjacency.get(k);
        if (!out) {
            out = this.#neighbors(c);
            this.adjacency.set(k, out);
        }
        return out;
    }

    #neighbors(c) {
        const n = this.normalAt(c);
        const out = [];
        for (const a of AXIS_NAMES) {
            const d = AXES[a];
            if (d.some((v, i) => v * n[i] !== 0)) continue;
            out.push(this.step(c, d).cell, this.step(c, neg(d)).cell);
        }
        return out;
    }

    // Cases rencontrées tout droit (n pas), en suivant les arêtes.
    ray(cell, dir, n) {
        const cells = [];
        let s = { cell, dir };
        for (let i = 0; i < n; i++) {
            s = this.step(s.cell, s.dir);
            cells.push(s.cell);
        }
        return cells;
    }

    randomCell(rng) {
        const { min, size } = this.arena;
        const axis = Math.floor(rng() * 3);
        const c = [0, 0, 0].map(() => min + Math.floor(rng() * size));
        c[axis] = rng() < 0.5 ? min - 1 : min + size;
        return c;
    }

    // Toutes les cellules (pour les rendus et les tests).
    *cells() {
        const { min, max } = this.arena;
        for (let i = 0; i < 3; i++) {
            for (const side of [min - 1, max + 1]) {
                for (let u = min; u <= max; u++) {
                    for (let v = min; v <= max; v++) {
                        const c = [0, 0, 0];
                        c[i] = side;
                        c[(i + 1) % 3] = u;
                        c[(i + 2) % 3] = v;
                        yield c;
                    }
                }
            }
        }
    }

    // Départs : deux faces opposées, tête vers des directions opposées.
    spawnPoints() {
        const { min, max } = this.arena;
        const mid = Math.floor((min + max) / 2);
        return {
            snake1: { cell: [min + 1, mid, max + 1], dir: [1, 0, 0], up: [0, 0, 1] },
            snake2: { cell: [max - 1, mid, min - 1], dir: [-1, 0, 0], up: [0, 0, -1] },
        };
    }

    // Agrandissement : le bloc grossit, chaque cellule de surface glisse vers l'extérieur
    // le long de sa normale. Les positions relatives sur une face ne changent pas.
    // Renvoie la fonction de transformation (ancienne cellule -> nouvelle).
    expandTo(size) {
        const old = this.arena;
        this.setArenaSize(size);
        const a = this.arena;
        return (c) => c.map((v) => (v < old.min ? a.min - 1 : v > old.max ? a.max + 1 : v));
    }

    // Cellules d'une forme posée sur une face : on garde celles de la face de `center`.
    onFace(center, cells) {
        const n = this.normalAt(center);
        return cells.filter((c) => this.isCell(c) && equals(this.normalAt(c), n));
    }

    describe() {
        return { kind: this.kind, space: this.space, arenaSize: this.arena.size };
    }
}
