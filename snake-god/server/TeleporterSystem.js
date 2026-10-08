import { key } from "../shared/grid.js";

// Téléporteurs posés par le Snake God : deux portails liés. Une tête qui entre dans l'un
// ressort par l'autre. Ils disparaissent après `expiresAt`.
export class TeleporterSystem {
    constructor() {
        this.pairs = new Map(); // id -> { id, a, b, expiresAt }
        this.index = new Map(); // cellKey -> { pair, exit }
        this.nextId = 1;
    }

    get count() {
        return this.pairs.size;
    }

    has(cellKey) {
        return this.index.has(cellKey);
    }

    add(a, b, expiresAt) {
        const pair = { id: this.nextId++, a, b, expiresAt };
        this.pairs.set(pair.id, pair);
        this.#reindex();
        return pair;
    }

    // Sortie du portail sous `cell`, ou null.
    exitFor(cell) {
        return this.index.get(key(cell))?.exit ?? null;
    }

    #reindex() {
        this.index.clear();
        for (const p of this.pairs.values()) {
            this.index.set(key(p.a), { pair: p, exit: p.b });
            this.index.set(key(p.b), { pair: p, exit: p.a });
        }
    }

    // Retire les paires expirées. Renvoie leurs cellules (pour l'effet de fermeture).
    update(now) {
        const closed = [];
        for (const p of [...this.pairs.values()]) {
            if (now < p.expiresAt) continue;
            this.pairs.delete(p.id);
            closed.push(p.a, p.b);
        }
        if (closed.length) this.#reindex();
        return closed;
    }

    remap(move) {
        for (const p of this.pairs.values()) {
            p.a = move(p.a);
            p.b = move(p.b);
        }
        this.#reindex();
    }

    snapshot(now) {
        return [...this.pairs.values()].map((p) => ({ id: p.id, a: p.a, b: p.b, endsInMs: Math.max(0, p.expiresAt - now) }));
    }
}
