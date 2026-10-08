import { key } from "../shared/grid.js";
import { createMap } from "../shared/maps/index.js";

// La map de la partie (CUBE ou WORLD) : topologie, tirage de cellules et occupation.
// Les systèmes (murs, pièges, nourriture, Snakes) s'enregistrent comme "occupants"
// pour que la recherche de cellule libre reste centralisée.
export class MapManager {
    constructor(kind, rng = Math.random, arenaSize) {
        this.map = createMap(kind, arenaSize);
        this.kind = this.map.kind;
        this.rng = rng;
        this.occupants = []; // fonctions (cellKey) => boolean
    }

    get space() {
        return this.map.space;
    }

    get arena() {
        return this.map.arena;
    }

    // Nombre de cellules jouables (densité du monde).
    get volume() {
        return this.map.cellCount;
    }

    addOccupant(fn) {
        this.occupants.push(fn);
    }

    inBounds(cell) {
        return this.map.isCell(cell);
    }

    isFree(cell) {
        if (!this.map.isCell(cell)) return false;
        const k = key(cell);
        return !this.occupants.some((occupied) => occupied(k));
    }

    randomCell() {
        return this.map.randomCell(this.rng);
    }

    // Cellule libre aléatoire qui respecte `accept` (sinon null).
    findFreeCell(accept = () => true, attempts = 400) {
        for (let i = 0; i < attempts; i++) {
            const c = this.randomCell();
            if (this.isFree(c) && accept(c)) return c;
        }
        return null;
    }

    // Nombre de cases libres tout droit depuis `cell` (en suivant les arêtes du cube).
    freeRun(cell, dir, limit = 12) {
        let run = 0;
        let s = { cell, dir };
        while (run < limit) {
            s = this.map.step(s.cell, s.dir);
            if (!this.isFree(s.cell)) break;
            run++;
        }
        return run;
    }

    describe() {
        return this.map.describe();
    }
}
