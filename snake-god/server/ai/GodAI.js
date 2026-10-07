import { AI, POWERS } from "../../shared/config.js";
import { add, chebyshev, cross, rotatingWallFits, scale } from "../../shared/grid.js";

import { DIRECTIONS } from "./Navigation.js";

const AXIS_OF = (dir) => (dir[0] ? "x" : dir[1] ? "y" : "z");

// IA du Snake God : vise un Snake, prédit son chemin (vers la nourriture ou tout droit)
// et pose ses pouvoirs dessus. Elle passe par game.handlePower, donc mêmes règles,
// même énergie et mêmes cooldowns qu'un joueur humain.
export class GodAI {
    constructor(game, rng = Math.random) {
        this.game = game;
        this.rng = rng;
        this.nextActionAt = AI.godFirstActionMs;
    }

    update(nav) {
        const game = this.game;
        if (game.now < this.nextActionAt) return;
        const [min, max] = AI.godThinkMs;
        const tempo = AI.godPhaseTempo[game.phase.id] ?? 1;
        this.nextActionAt = game.now + (min + this.rng() * (max - min)) * tempo; // temps de réaction "humain"

        const targets = game.snakes.filter((s) => s.alive && s.body.length);
        if (!targets.length) return;
        // Préférence : le Snake le plus fragile, sinon le meilleur score.
        targets.sort((a, b) => a.health.hp - b.health.hp || b.score - a.score);
        const target = this.rng() < 0.7 ? targets[0] : targets[Math.floor(this.rng() * targets.length)];

        const energy = game.god.energy;
        const rotUnlocked = game.god.isUnlocked("rotatingWall", game.phase.id);
        // En phase 2+, garde parfois de l'énergie pour un mur rotatif.
        const saving = rotUnlocked && energy < POWERS.rotatingWall.cost && this.rng() < 0.5;

        const plans = [];
        if (rotUnlocked && energy >= POWERS.rotatingWall.cost) plans.push(() => this.#rotatingWall(target));
        if (game.god.isUnlocked("dangerZone", game.phase.id)) plans.push(() => this.#zoneAhead(target));
        // Information exclusive : déclenche les météores quand un Snake est dessous.
        if (this.#meteorsWouldHit()) plans.unshift(Object.assign(() => this.#use("triggerEvent"), { priority: true }));
        if (!saving) {
            plans.push(() => this.#trapOnPath(target, nav), () => this.#wallAhead(target));
            if (this.rng() < 0.3) plans.push(() => this.#trapNearFood(target, nav));
        }
        const first = plans[0]?.priority ? plans.shift() : null;
        shuffle(plans, this.rng);
        if (first) plans.unshift(first);
        for (const plan of plans) if (plan()) return;
    }

    #meteorsWouldHit() {
        const next = this.game.worldEvents?.next;
        if (next?.type !== "meteorShower" || !this.game.god.isUnlocked("triggerEvent", this.game.phase.id)) return false;
        return this.game.snakes.some((s) => s.alive && s.body.length && next.cells.some((c) => chebyshev(c, s.head) <= 1));
    }

    // Dalle dangereuse en travers de la route.
    #zoneAhead(target) {
        const center = add(target.head, scale(target.dir, 3));
        return this.#use("dangerZone", center, AXIS_OF(target.dir));
    }

    #use(power, cell, axis) {
        return this.game.handlePower({ power, cell, axis }).ok;
    }

    // Piège sur le chemin probable du Snake : vers sa nourriture, ou tout droit.
    #trapOnPath(target, nav) {
        const toFood = nav.pathToFood(target.head)?.path ?? [];
        const candidates = [...toFood.slice(2, 5), ...this.#straight(target, 4).slice(2)];
        for (const c of candidates) if (this.#use("trap", c)) return true;
        return false;
    }

    // Piège posé juste à côté d'une nourriture convoitée.
    #trapNearFood(target, nav) {
        const food = nav.pathToFood(target.head)?.path.at(-1);
        if (!food) return false;
        for (const d of DIRECTIONS) if (this.#use("trap", add(food, d))) return true;
        return false;
    }

    // Mur en travers de la route, 3 cases devant la tête.
    #wallAhead(target) {
        const center = add(target.head, scale(target.dir, 3));
        const perpendicular = [AXIS_OF(target.up), AXIS_OF(cross(target.dir, target.up))];
        shuffle(perpendicular, this.rng);
        return perpendicular.some((axis) => this.#use("wall", center, axis));
    }

    // Mur rotatif près de la route du Snake : son balayage coupe le passage.
    #rotatingWall(target) {
        const size = this.game.grid.arena;
        const arm = POWERS.rotatingWall.arm;
        const axes = ["y", "x", "z"];
        shuffle(axes, this.rng);
        for (const dist of [3, 4, 2, 5]) {
            const center = add(target.head, scale(target.dir, dist));
            for (const axis of axes) {
                for (const offset of [[0, 0, 0], ...DIRECTIONS]) {
                    const pivot = add(center, offset);
                    if (!rotatingWallFits(pivot, axis, arm, size)) continue;
                    if (chebyshev(pivot, target.head) < 2) continue;
                    if (this.#use("rotatingWall", pivot, axis)) return true;
                }
            }
        }
        return false;
    }

    #straight(target, n) {
        const cells = [target.head];
        for (let i = 1; i <= n; i++) cells.push(add(target.head, scale(target.dir, i)));
        return cells;
    }
}

function shuffle(list, rng) {
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
}
