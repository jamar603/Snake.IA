import { GOD, SNAKE } from "../shared/config.js";

// Points en cours de partie et récapitulatif final.
export class ScoreManager {
    constructor() {
        this.god = { score: 0, damageDealt: 0, eliminations: 0 };
    }

    onFoodEaten(snake, points = SNAKE.foodPoints) {
        snake.score += points;
    }

    // `byGod` : dégât causé par un piège ou un mur du dieu.
    onSnakeDamaged(snake, byGod) {
        if (!byGod) return;
        this.god.damageDealt++;
        this.god.score += GOD.damagePoints;
    }

    onSnakeEliminated(snake, byGod) {
        if (!byGod) return;
        this.god.eliminations++;
        this.god.score += GOD.eliminationPoints;
    }

    // Bonus de fin de partie puis tableau final.
    finalize({ snakes, winner, durationMs, trapsTriggered, godName }) {
        for (const s of snakes) {
            s.score += s.length * SNAKE.lengthPoints;
            if (s.alive) s.score += SNAKE.survivalBonus;
        }
        if (winner === "god") this.god.score += GOD.victoryBonus;

        return {
            winner,
            durationMs,
            trapsTriggered,
            snakes: snakes.map((s) => ({
                id: s.id,
                name: s.name,
                cosmetics: s.cosmetics,
                score: s.score,
                length: s.length,
                alive: s.alive,
                hp: s.health.hp,
                foodEaten: s.growth.eaten,
                damageTaken: s.health.damageTaken,
                trapsTriggered: s.trapsTriggered,
                survivalMs: s.alive ? durationMs : s.diedAt,
            })),
            god: { name: godName, ...this.god },
        };
    }
}
