import { WORLD } from "../shared/config.js";
import { chebyshev, key } from "../shared/grid.js";

// Monde dynamique : la map passe à la taille suivante selon le temps, la longueur des
// Snakes, la place disponible et la progression du match. L'expansion est annoncée,
// puis appliquée après `warnMs` (animation de construction côté client).
//
// Règle d'équité : une nouvelle zone n'apparaît jamais sur un Snake. Sur le CUBE, le bloc
// grossit et tout ce qui est en surface glisse vers l'extérieur avec lui (les Snakes ne
// changent pas de place relative) ; les nouvelles cases naissent aux arêtes. Sur WORLD,
// le terrain s'étend sur ses bords. Les nouveaux obstacles restent loin des têtes.
export class DynamicWorldManager {
    constructor(sizes, { enabled = true } = {}) {
        this.sizes = sizes;
        this.stage = 0;
        this.enabled = enabled;
        this.pending = null; // { fromSize, toSize, completeAt, reason }
    }

    get size() {
        return this.sizes[this.stage];
    }

    get isMax() {
        return this.stage >= this.sizes.length - 1;
    }

    // Raison de l'expansion (pour l'annonce) ou null si rien ne la justifie encore.
    #reason({ progress, totalLength, density }) {
        const i = this.stage;
        if (progress < WORLD.minProgress[i]) return null;
        if (progress >= WORLD.timeThresholds[i]) return "time";
        if (totalLength >= WORLD.lengthThresholds[i]) return "growth";
        if (density >= WORLD.densityThreshold) return "density";
        return null;
    }

    // Le Snake God force la prochaine expansion (pouvoir « Expansion »).
    force(now) {
        if (!this.enabled || this.isMax || this.pending) return null;
        this.pending = { fromSize: this.size, toSize: this.sizes[this.stage + 1], completeAt: now + WORLD.warnMs, reason: "god" };
        return { type: "start", ...this.pending, inMs: WORLD.warnMs };
    }

    // Renvoie { type: "start", ... } à l'annonce et { type: "complete", ... } à la fin.
    update(now, metrics) {
        if (this.pending) {
            if (now < this.pending.completeAt) return null;
            const done = this.pending;
            this.pending = null;
            this.stage++;
            return { type: "complete", fromSize: done.fromSize, toSize: done.toSize, reason: done.reason };
        }
        if (!this.enabled || this.isMax) return null;
        const reason = this.#reason(metrics);
        if (!reason) return null;
        this.pending = { fromSize: this.size, toSize: this.sizes[this.stage + 1], completeAt: now + WORLD.warnMs, reason };
        return { type: "start", ...this.pending, inMs: WORLD.warnMs };
    }

    // Applique la nouvelle taille à toute la partie. `game` expose map, snakes, walls,
    // traps, food, zones, teleporters, worldEvents. Renvoie la liste des nouvelles cellules.
    apply(game, toSize) {
        const map = game.grid.map;
        const before = new Set([...map.cells()].map(key));
        const move = map.expandTo(toSize);
        const remap = (cells) => cells.map(move);

        for (const s of game.snakes) {
            if (!s.body.length) continue;
            s.body = this.#reconnect(map, remap(s.body), s.body.length);
            s.up = map.normalAt(s.head);
        }
        game.walls.remap(move);
        game.traps.remap(move);
        game.food.remap(move);
        game.zones.remap(move);
        game.teleporters.remap(move);
        game.worldEvents.remap(move);

        // Nouvelles cellules : celles qui n'existaient pas (après transformation des anciennes).
        const moved = new Set([...before].map((k) => key(move(k.split(",").map(Number)))));
        return [...map.cells()].filter((c) => !moved.has(key(c)));
    }

    // Sur le CUBE, un corps à cheval sur une arête se retrouve coupé par la nouvelle rangée :
    // on recolle les morceaux par le plus court chemin, puis on garde la même longueur.
    #reconnect(map, body, length) {
        const out = [body[0]];
        for (let i = 1; i < body.length; i++) {
            const prev = out.at(-1);
            const cur = body[i];
            if (chebyshev(prev, cur) > 1 && !map.neighbors(prev).some((n) => key(n) === key(cur))) {
                out.push(...this.#bridge(map, prev, cur));
            }
            out.push(cur);
        }
        return out.slice(0, length);
    }

    // Chemin court (cases intermédiaires seulement) entre deux cellules, sur la surface.
    #bridge(map, from, to) {
        const target = key(to);
        const prev = new Map([[key(from), null]]);
        let frontier = [from];
        for (let depth = 0; depth < 6 && frontier.length; depth++) {
            const next = [];
            for (const c of frontier) {
                for (const n of map.neighbors(c)) {
                    const k = key(n);
                    if (prev.has(k)) continue;
                    prev.set(k, c);
                    if (k === target) {
                        const path = [];
                        for (let p = c; p && key(p) !== key(from); p = prev.get(key(p))) path.unshift(p);
                        return path;
                    }
                    next.push(n);
                }
            }
            frontier = next;
        }
        return [];
    }

    snapshot(now) {
        if (!this.pending) return null;
        return {
            fromSize: this.pending.fromSize,
            toSize: this.pending.toSize,
            inMs: Math.max(0, this.pending.completeAt - now),
            reason: this.pending.reason,
        };
    }
}
