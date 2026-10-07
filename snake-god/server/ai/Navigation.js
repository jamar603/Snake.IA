import { add, chebyshev, cross, inBounds, key, neg, rotatingWallCells } from "../../shared/grid.js";

export const DIRECTIONS = [
    [1, 0, 0], [-1, 0, 0],
    [0, 1, 0], [0, -1, 0],
    [0, 0, 1], [0, 0, -1],
];

// Vue du monde partagée par les IA : cellules bloquées et cellules dangereuses
// à un instant donné. Les IA lisent le même état que celui envoyé aux joueurs.
export class Navigation {
    constructor(game) {
        this.game = game;
        this.size = game.grid.arena; // bornes de l'arène actuelle
        this.blocked = new Set();
        this.danger = new Map(); // cellKey -> coût
        this.traps = new Set();
        this.food = [];

        for (const k of game.walls.cellIndex.keys()) this.blocked.add(k);
        for (const s of game.snakes) {
            if (!s.alive) continue;
            // La queue se libère au prochain déplacement (sauf si le Snake grandit).
            const cells = s.willGrow() ? s.body : s.body.slice(0, -1);
            for (const c of cells) this.blocked.add(key(c));
        }
        for (const c of game.traps.snapshot()) {
            this.traps.add(key(c));
            this.#addDanger(c, 60);
        }
        // Mur rotatif : comme un joueur, on ne voit venir que le prochain quart de tour,
        // et seulement quand il est imminent.
        for (const w of game.walls.walls.values()) {
            if (w.kind !== "rotating") continue;
            const imminent = w.nextRotateAt - game.now <= game.tickMs * 4;
            for (const c of rotatingWallCells(w.pivot, w.axis, w.arm, w.turns + 1)) this.#addDanger(c, imminent ? 40 : 3);
        }
        for (const z of game.zones.zones.values()) for (const c of z.cells) this.#addDanger(c, 80);
        this.food = game.food.snapshot();
    }

    #addDanger(cell, cost) {
        const k = key(cell);
        this.danger.set(k, (this.danger.get(k) ?? 0) + cost);
    }

    isOpen(cell) {
        return inBounds(cell, this.size) && !this.blocked.has(key(cell));
    }

    dangerAt(cell) {
        return this.danger.get(key(cell)) ?? 0;
    }

    // Distance (en cases) jusqu'à la nourriture la plus proche, en évitant les pièges.
    // Renvoie { dist, path } ou null.
    pathToFood(start, maxDepth = 40) {
        const foodKeys = new Set(this.food.map(key));
        if (!foodKeys.size) return null;
        const prev = new Map([[key(start), null]]);
        let frontier = [start];
        for (let depth = 0; depth <= maxDepth && frontier.length; depth++) {
            const next = [];
            for (const c of frontier) {
                const k = key(c);
                if (foodKeys.has(k)) return { dist: depth, path: unwind(prev, c) };
                for (const d of DIRECTIONS) {
                    const n = add(c, d);
                    const nk = key(n);
                    if (prev.has(nk) || !this.isOpen(n) || this.traps.has(nk)) continue;
                    prev.set(nk, c);
                    next.push(n);
                }
            }
            frontier = next;
        }
        return null;
    }

    // Nombre de cases accessibles depuis `start` (plafonné) : évite de s'enfermer.
    space(start, limit) {
        if (!this.isOpen(start)) return 0;
        const seen = new Set([key(start)]);
        const stack = [start];
        while (stack.length && seen.size < limit) {
            const c = stack.pop();
            for (const d of DIRECTIONS) {
                const n = add(c, d);
                const nk = key(n);
                if (seen.has(nk) || !this.isOpen(n)) continue;
                seen.add(nk);
                stack.push(n);
            }
        }
        return seen.size;
    }

    // Têtes adverses : une case voisine d'une tête risque le choc frontal.
    nearEnemyHead(cell, self) {
        return this.game.snakes.some((s) => s !== self && s.alive && s.body.length && chebyshev(s.head, cell) <= 1);
    }
}

// Les 5 mouvements possibles d'un Snake (pas de demi-tour) et le virage associé.
export function snakeMoves(snake) {
    const right = cross(snake.dir, snake.up);
    return [
        { turn: null, dir: snake.dir },
        { turn: "right", dir: right },
        { turn: "left", dir: neg(right) },
        { turn: "up", dir: snake.up },
        { turn: "down", dir: neg(snake.up) },
    ];
}

function unwind(prev, end) {
    const path = [];
    for (let c = end; c; c = prev.get(key(c))) path.push(c);
    return path.reverse();
}
