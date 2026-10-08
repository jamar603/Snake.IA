import { key, rotatingWallCells } from "../shared/grid.js";

// Tous les murs du cube : piliers de départ, murs temporaires du dieu
// et murs rotatifs. Un index cellule -> mur permet des tests rapides.
export class WallSystem {
    constructor() {
        this.walls = new Map();
        this.cellIndex = new Map();
        this.nextId = 1;
    }

    isWall(cellKey) {
        return this.cellIndex.has(cellKey);
    }

    count(kind) {
        let n = 0;
        for (const w of this.walls.values()) if (w.kind === kind) n++;
        return n;
    }

    addStatic(cells, { kind = "wall", expiresAt = null } = {}) {
        return this.#add({ kind, cells, expiresAt });
    }

    addRotating(pivot, axis, arm, rotateEveryMs, now) {
        return this.#add({
            kind: "rotating",
            pivot,
            axis,
            arm,
            turns: 0,
            rotateEveryMs,
            nextRotateAt: now + rotateEveryMs,
            cells: rotatingWallCells(pivot, axis, arm, 0),
        });
    }

    #add(wall) {
        wall.id = this.nextId++;
        this.walls.set(wall.id, wall);
        this.#index(wall);
        return wall;
    }

    #index(wall) {
        for (const c of wall.cells) this.cellIndex.set(key(c), wall.id);
    }

    #unindex(wall) {
        for (const c of wall.cells) {
            const k = key(c);
            if (this.cellIndex.get(k) === wall.id) this.cellIndex.delete(k);
        }
    }

    remove(id) {
        const wall = this.walls.get(id);
        if (!wall) return;
        this.#unindex(wall);
        this.walls.delete(id);
    }

    // Fait avancer les murs dans le temps. Renvoie les événements produits :
    // { type: "rotate", wall, cells } et { type: "expire", wall }.
    update(now) {
        const events = [];
        for (const wall of [...this.walls.values()]) {
            if (wall.expiresAt !== null && wall.expiresAt !== undefined && now >= wall.expiresAt) {
                this.remove(wall.id);
                events.push({ type: "expire", wall });
                continue;
            }
            if (wall.kind !== "rotating" || now < wall.nextRotateAt) continue;

            wall.nextRotateAt = now + wall.rotateEveryMs;
            const turns = wall.turns + 1;
            const cells = rotatingWallCells(wall.pivot, wall.axis, wall.arm, turns);
            // Un mur rotatif ne traverse pas les autres murs : il reste bloqué ce tour-ci.
            const blocked = cells.some((c) => {
                const owner = this.cellIndex.get(key(c));
                return owner !== undefined && owner !== wall.id;
            });
            if (blocked) continue;

            this.#unindex(wall);
            wall.turns = turns;
            wall.cells = cells;
            this.#index(wall);
            events.push({ type: "rotate", wall, cells });
        }
        return events;
    }

    // Agrandissement du monde : les murs suivent la surface.
    remap(move) {
        this.cellIndex.clear();
        for (const w of this.walls.values()) {
            w.cells = w.cells.map(move);
            if (w.pivot) w.pivot = move(w.pivot);
            this.#index(w);
        }
    }

    snapshot() {
        return [...this.walls.values()].map((w) => ({
            id: w.id,
            kind: w.kind,
            cells: w.cells,
            pivot: w.pivot,
            axis: w.axis,
            arm: w.arm,
            turns: w.turns,
            expiresAt: w.expiresAt ?? null,
            nextRotateAt: w.nextRotateAt ?? null, // mur rotatif : le client prévient avant le quart de tour
        }));
    }
}
