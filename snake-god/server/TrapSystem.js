import { key } from "../shared/grid.js";

// Pièges posés par le Snake God : dégâts légers (DAMAGE.trap) puis disparition.
export class TrapSystem {
    constructor() {
        this.traps = new Map(); // cellKey -> cell
        this.triggered = 0;
    }

    has(cellKey) {
        return this.traps.has(cellKey);
    }

    get count() {
        return this.traps.size;
    }

    place(cell) {
        this.traps.set(key(cell), cell);
    }

    remove(cell) {
        return this.traps.delete(key(cell));
    }

    // Déclenche le piège sous `cell` s'il existe. Renvoie true si déclenché.
    trigger(cell) {
        if (!this.remove(cell)) return false;
        this.triggered++;
        return true;
    }

    remap(move) {
        const cells = [...this.traps.values()].map(move);
        this.traps = new Map(cells.map((c) => [key(c), c]));
    }

    snapshot() {
        return [...this.traps.values()];
    }
}
