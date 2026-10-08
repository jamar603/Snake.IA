import { chebyshev, cross, key, neg, rotatingWallCells } from "../../shared/grid.js";

// Vue du monde partagée par les IA : cellules bloquées et cellules dangereuses
// à un instant donné. Les IA lisent le même état que celui envoyé aux joueurs.
export class Navigation {
    constructor(game) {
        this.game = game;
        this.map = game.grid.map; // topologie : voisins et passage des arêtes
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
        const sweep = game.mapConfig?.aiSweepDanger ?? [90, 12];
        for (const w of game.walls.walls.values()) {
            if (w.kind !== "rotating") continue;
            const imminent = w.nextRotateAt - game.now <= game.tickMs * 4;
            for (const c of rotatingWallCells(w.pivot, w.axis, w.arm, w.turns + 1)) this.#addDanger(c, imminent ? sweep[0] : sweep[1]);
        }
        for (const z of game.zones.zones.values()) for (const c of z.cells) this.#addDanger(c, 80);
        this.food = game.food.snapshot();
    }

    #addDanger(cell, cost) {
        const k = key(cell);
        this.danger.set(k, (this.danger.get(k) ?? 0) + cost);
    }

    isOpen(cell) {
        return this.map.isCell(cell) && !this.blocked.has(key(cell));
    }

    dangerAt(cell) {
        return this.danger.get(key(cell)) ?? 0;
    }

    // Distance (en cases) jusqu'à la nourriture la plus proche, en évitant les pièges.
    // Renvoie { dist, path } ou null. Un seul parcours en largeur par tick, lancé depuis
    // toutes les nourritures à la fois (champ de distances), puis lu directement.
    pathToFood(start, maxDepth = 40) {
        const field = this.#foodField();
        let d = field.get(key(start));
        if (d === undefined || d > maxDepth) return null;
        const path = [start];
        let c = start;
        while (d > 0) {
            c = this.map.neighbors(c).find((n) => field.get(key(n)) === d - 1);
            if (!c) break;
            path.push(c);
            d--;
        }
        return { dist: path.length - 1, path };
    }

    #foodField() {
        if (this.field) return this.field;
        const field = new Map();
        let frontier = [];
        for (const f of this.food) {
            if (field.has(key(f))) continue;
            field.set(key(f), 0);
            frontier.push(f);
        }
        for (let depth = 1; frontier.length && depth <= 40; depth++) {
            const next = [];
            for (const c of frontier) {
                for (const n of this.map.neighbors(c)) {
                    const nk = key(n);
                    if (field.has(nk) || !this.isOpen(n) || this.traps.has(nk)) continue;
                    field.set(nk, depth);
                    next.push(n);
                }
            }
            frontier = next;
        }
        this.field = field;
        return field;
    }

    // Nombre de cases accessibles depuis `start` (plafonné) : évite de s'enfermer.
    space(start, limit) {
        if (!this.isOpen(start)) return 0;
        const seen = new Set([key(start)]);
        const stack = [start];
        while (stack.length && seen.size < limit) {
            const c = stack.pop();
            for (const n of this.map.neighbors(c)) {
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

// Les 3 mouvements possibles d'un Snake (tout droit, gauche, droite) avec la case et la
// direction obtenues sur la map (passage d'arête compris).
export function snakeMoves(snake, map) {
    const right = cross(snake.dir, snake.up);
    const moves = [
        { turn: null, dir: snake.dir },
        { turn: "right", dir: right },
        { turn: "left", dir: neg(right) },
    ];
    // Cube 3D : haut et bas en plus (version classique).
    if (map.kind === "volume") moves.push({ turn: "up", dir: snake.up }, { turn: "down", dir: neg(snake.up) });
    return moves.map((m) => ({ ...m, step: map.step(snake.head, m.dir) }));
}
