import { WORLD } from "../shared/config.js";

// Croissance du monde : l'arène passe à la taille suivante quand le temps,
// la longueur des Snakes ou la densité du monde l'exigent. L'expansion est
// annoncée, puis appliquée après `warnMs` (le temps de l'animation de construction).
export class WorldExpansionSystem {
    constructor(sizes, { enabled = true } = {}) {
        this.sizes = sizes;
        this.stage = 0;
        this.enabled = enabled;
        this.pending = null; // { fromSize, toSize, completeAt }
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
