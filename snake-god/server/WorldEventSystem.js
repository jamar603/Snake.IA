import { WORLD_EVENTS } from "../shared/config.js";
import { add, chebyshev } from "../shared/grid.js";

const TYPES = ["goldenFruit", "foodRain", "meteorShower"];

// Événements du monde, tirés à l'avance. Le prochain (type, lieu, délai) est
// connu du seul Snake God, qui peut aussi le déclencher plus tôt.
export class WorldEventSystem {
    constructor({ grid, food, zones, rng }) {
        this.grid = grid;
        this.food = food;
        this.zones = zones;
        this.rng = rng;
        this.next = null;
        this.history = 0;
    }

    schedule(now) {
        const [min, max] = WORLD_EVENTS.intervalMs;
        const type = TYPES[Math.floor(this.rng() * TYPES.length)];
        this.next = { type, at: now + min + this.rng() * (max - min), cells: this.#pickCells(type) };
    }

    #pickCells(type) {
        if (type === "goldenFruit") return [this.grid.findFreeCell() ?? [0, 0, 0]];
        if (type === "foodRain") {
            const center = this.grid.findFreeCell() ?? [4, 4, 4];
            const cells = [];
            for (let i = 0; i < 40 && cells.length < WORLD_EVENTS.foodRain.count; i++) {
                const c = add(center, [-2, -2, -2].map((v) => v + Math.floor(this.rng() * 5)));
                if (this.grid.inBounds(c) && !cells.some((o) => chebyshev(o, c) === 0)) cells.push(c);
            }
            return cells;
        }
        const cells = [];
        while (cells.length < WORLD_EVENTS.meteorShower.count) cells.push(this.grid.randomCell());
        return cells;
    }

    // Déclenche l'événement prévu s'il est l'heure. Renvoie l'événement exécuté ou null.
    update(now) {
        if (!this.next) this.schedule(now);
        if (now < this.next.at) return null;
        return this.trigger(now);
    }

    trigger(now) {
        const ev = this.next;
        if (!ev) return null;
        if (ev.type === "goldenFruit") {
            const cfg = WORLD_EVENTS.goldenFruit;
            const cell = this.grid.isFree(ev.cells[0]) ? ev.cells[0] : this.grid.findFreeCell();
            if (cell) this.food.addSpecial(cell, "golden", now + cfg.lifetimeMs);
            ev.cells = cell ? [cell] : [];
        } else if (ev.type === "foodRain") {
            ev.cells = ev.cells.filter((c) => this.food.addSpecial(c, "normal"));
        } else {
            const cfg = WORLD_EVENTS.meteorShower;
            this.zones.add(ev.cells, { kind: "meteor", now, warnMs: cfg.warnMs, durationMs: cfg.durationMs });
        }
        this.history++;
        this.schedule(now);
        return ev;
    }

    // Information exclusive du Snake God.
    intel(now) {
        if (!this.next) return null;
        return {
            type: this.next.type,
            label: WORLD_EVENTS[this.next.type].label,
            cells: this.next.cells,
            inMs: Math.max(0, this.next.at - now),
        };
    }
}
