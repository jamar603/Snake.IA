import { inBounds, key } from "../shared/grid.js";

// Le cube : dimensions, tirage de cellules et requêtes d'occupation.
// Les systèmes (murs, pièges, nourriture, Snakes) s'enregistrent comme
// "occupants" pour que la recherche de cellule libre reste centralisée.
export class WorldGrid {
    constructor(size, rng = Math.random) {
        this.size = size;
        this.rng = rng;
        this.occupants = []; // fonctions (cellKey) => boolean
    }

    addOccupant(fn) {
        this.occupants.push(fn);
    }

    inBounds(cell) {
        return inBounds(cell, this.size);
    }

    isFree(cell) {
        if (!this.inBounds(cell)) return false;
        const k = key(cell);
        return !this.occupants.some((occupied) => occupied(k));
    }

    randomCell() {
        const r = () => Math.floor(this.rng() * this.size);
        return [r(), r(), r()];
    }

    // Cellule libre aléatoire qui respecte `accept` (sinon null).
    findFreeCell(accept = () => true, attempts = 400) {
        for (let i = 0; i < attempts; i++) {
            const c = this.randomCell();
            if (this.isFree(c) && accept(c)) return c;
        }
        return null;
    }
}
