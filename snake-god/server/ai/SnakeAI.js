import { AI } from "../../shared/config.js";
import { equals } from "../../shared/grid.js";
import { snakeMoves } from "./Navigation.js";

// IA d'un Snake : à chaque tick, elle choisit un des 3 mouvements possibles
// (tout droit, gauche, droite) comme un joueur, via les mêmes virages.
// Priorités : ne pas se cogner, ne pas s'enfermer, éviter pièges et murs rotatifs,
// puis aller vers la nourriture.
export class SnakeAI {
    constructor(snake, rng = Math.random) {
        this.snake = snake;
        this.rng = rng;
    }

    decide(nav) {
        const s = this.snake;
        if (!s.alive || !s.body.length) return;
        s.turnQueue = [];
        // Moment d'inattention : pas de réaction ce tick-ci.
        if (this.rng() < AI.snakeMistakeChance) return;
        let best = null;
        for (const move of snakeMoves(s, nav.map)) {
            const score = this.#score(move, nav);
            if (!best || score > best.score) best = { ...move, score };
        }
        if (best.turn) s.queueTurn(best.turn);
        this.#useSkills(best, nav);
    }

    // Compétences, comme un joueur : Phase pour sortir d'une impasse, Bouclier face à
    // un danger imminent, Sprint pour attraper une nourriture proche en ligne droite.
    #useSkills(best, nav) {
        const s = this.snake;
        const game = nav.game;
        const now = game.now;
        const ready = (id) => s.skills.isReady(id, now);
        const next = best.step.cell;
        if (best.score <= -1000 && ready("phase")) {
            game.handleSkill(s.id, "phase");
        } else if ((best.score <= -400 || nav.dangerAt(next) >= 40) && ready("shield")) {
            game.handleSkill(s.id, "shield");
        } else if (ready("sprint") && best.score > 0) {
            const food = nav.pathToFood(next, 6);
            if (food && food.dist >= 2 && this.rng() < 0.5) game.handleSkill(s.id, "sprint");
        }
    }

    #score(move, nav) {
        const s = this.snake;
        const { dir } = move;
        const cell = move.step.cell;
        if (!nav.isOpen(cell)) return -10000;

        let score = 0;
        // Espace libre : rester dans une zone assez grande pour son corps (plafonné : voir AI).
        const needed = Math.min(s.length + 4, AI.spaceNeededMax);
        const space = nav.space(cell, needed * 2);
        if (space < needed) score -= 400 + (needed - space) * 20;

        score -= nav.dangerAt(cell);
        if (nav.nearEnemyHead(cell, s)) score -= s.health.isInvulnerable(nav.game.now) ? 0 : 35;

        const food = nav.pathToFood(cell);
        score += food ? 30 - food.dist * 2 : 0;

        // Éviter de foncer vers un mur proche : on garde des options.
        if (!nav.isOpen(nav.map.step(cell, move.step.dir).cell)) score -= 4;
        if (equals(dir, s.dir)) score += 1; // un joueur ne zigzague pas sans raison
        return score + this.rng() * 2;
    }
}
