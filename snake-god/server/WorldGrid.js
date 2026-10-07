import { arenaFor, inBounds, key } from "../shared/grid.js";

// Le cube : dimensions, tirage de cellules et requêtes d'occupation.
// Les systèmes (murs, pièges, nourriture, Snakes) s'enregistrent comme
// "occupants" pour que la recherche de cellule libre reste centralisée.
export class WorldGrid {
    // `size` : espace de coordonnées ; l'arène jouable (centrée) peut être plus petite.
    constructor(size, rng = Math.random, arenaSize = size) {
        this.size = size;
        this.rng = rng;
        this.setArenaSize(arenaSize);
        this.occupants = []; // fonctions (cellKey) => boolean
    }

    addOccupant(fn) {
        this.occupants.push(fn);
    }

    setArenaSize(arenaSize) {
        this.arena = arenaFor(arenaSize, this.size);
    }

    get volume() {
        return this.arena.size ** 3;
    }

    inBounds(cell) {
        return inBounds(cell, this.arena);
    }

    isFree(cell) {
        if (!this.inBounds(cell)) return false;
        const k = key(cell);
        return !this.occupants.some((occupied) => occupied(k));
    }

    randomCell() {
        const r = () => this.arena.min + Math.floor(this.rng() * this.arena.size);
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
