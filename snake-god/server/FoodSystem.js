import { chebyshev, key } from "../shared/grid.js";

// Nourriture : `count` fruits normaux en permanence, plus des fruits spéciaux
// (fruit doré, pluie de nourriture). Les prochaines apparitions sont tirées
// à l'avance pour que le Snake God puisse les voir (information exclusive).
// `variant` : apparence tirée au hasard (pomme, ananas, viande...), purement
// cosmétique, identique pour tous les clients.
export class FoodSystem {
    constructor(grid, count, previewCount = 3, rng = Math.random) {
        this.grid = grid;
        this.rng = rng;
        this.count = count;
        this.previewCount = previewCount;
        this.food = new Map(); // cellKey -> { cell, kind: "normal" | "golden", expiresAt, variant }
        this.lastVariant = 0; // apparence du dernier fruit mangé (pour les effets)
        this.upcoming = []; // prochaines cellules de nourriture normale
    }

    has(cellKey) {
        return this.food.has(cellKey);
    }

    get normalCount() {
        let n = 0;
        for (const f of this.food.values()) if (f.kind === "normal") n++;
        return n;
    }

    // Complète jusqu'à `count` fruits normaux, en puisant dans la file des prochaines apparitions.
    refill(heads = []) {
        const farFromHeads = (c) => heads.every((h) => chebyshev(c, h) > 1);
        this.#fillUpcoming(farFromHeads);
        let guard = 0;
        while (this.normalCount < this.count && guard++ < 50) {
            let cell = this.upcoming.shift();
            // La cellule prévue a pu être occupée entre-temps : on en tire une autre.
            if (!cell || !this.grid.isFree(cell) || !farFromHeads(cell)) cell = this.#draw(farFromHeads);
            if (!cell) return;
            this.food.set(key(cell), { cell, kind: "normal", expiresAt: null, variant: this.#variant() });
            this.#fillUpcoming(farFromHeads);
        }
    }

    #variant() {
        return Math.floor(this.rng() * 1000);
    }

    #draw(accept) {
        return this.grid.findFreeCell((c) => accept(c) && !this.upcoming.some((u) => key(u) === key(c))) ?? this.grid.findFreeCell();
    }

    #fillUpcoming(accept) {
        while (this.upcoming.length < this.previewCount) {
            const c = this.#draw(accept);
            if (!c) return;
            this.upcoming.push(c);
        }
    }

    addSpecial(cell, kind, expiresAt = null) {
        if (!this.grid.isFree(cell)) return false;
        this.food.set(key(cell), { cell, kind, expiresAt, variant: this.#variant() });
        return true;
    }

    // Mange ce qui se trouve sous `cell`. Renvoie le type ("normal", "golden") ou null.
    eat(cell) {
        const k = key(cell);
        const item = this.food.get(k);
        if (!item) return null;
        this.food.delete(k);
        this.lastVariant = item.variant ?? 0;
        return item.kind;
    }

    removeAt(cells) {
        for (const c of cells) this.food.delete(key(c));
    }

    // Retire les fruits spéciaux expirés.
    update(now) {
        for (const [k, f] of this.food) if (f.expiresAt !== null && now >= f.expiresAt) this.food.delete(k);
    }

    remap(move) {
        const items = [...this.food.values()].map((f) => ({ ...f, cell: move(f.cell) }));
        this.food = new Map(items.map((f) => [key(f.cell), f]));
        this.upcoming = this.upcoming.map(move);
    }

    // Liste simple des cellules (utilisée par les IA).
    snapshot() {
        return [...this.food.values()].map((f) => f.cell);
    }

    items() {
        return [...this.food.values()].map((f) => ({ cell: f.cell, kind: f.kind, variant: f.variant ?? 0 }));
    }
}
