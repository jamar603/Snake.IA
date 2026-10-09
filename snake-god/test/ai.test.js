import assert from "node:assert/strict";
import { test } from "node:test";
import { DAMAGE } from "../shared/config.js";
import { MATCH_STATUS } from "../shared/protocol.js";
import { GameManager } from "../server/GameManager.js";

function seeded(seed) {
    let s = seed;
    return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

const AI = (name) => ({ name, ai: true });

function run(game, ms) {
    for (let t = 0; t < ms && game.status !== MATCH_STATUS.ENDED; t += game.tickMs) game.tick(game.tickMs);
}

test("un Snake IA seul mange et survit", () => {
    for (const seed of [1, 2, 3]) {
        const game = new GameManager({ rng: seeded(seed), countdownSeconds: 0, matchSeconds: 60, worldEvents: false });
        game.startMatch({ snake1: AI("A") });
        run(game, 60000);
        const s = game.snakes[0];
        assert.equal(s.alive, true, `graine ${seed}`);
        assert.ok(s.growth.eaten >= 8, `graine ${seed} : ${s.growth.eaten} repas`);
        assert.ok(s.health.damageTaken <= DAMAGE.wall, // un choc au plus
            `graine ${seed} : ${s.health.damageTaken} dégâts`);
    }
});

test("le dieu IA utilise ses pouvoirs et blesse les Snakes", () => {
    let damage = 0;
    let used = 0;
    for (const seed of [4, 5, 6]) {
        const game = new GameManager({ rng: seeded(seed), countdownSeconds: 0, matchSeconds: 90 });
        game.startMatch({ snake1: AI("A"), snake2: AI("B"), god: AI("G") });
        run(game, 90000);
        assert.equal(game.status, MATCH_STATUS.ENDED);
        used += Object.values(game.god.used).reduce((a, b) => a + b, 0);
        damage += game.scores.god.damageDealt;
        assert.ok(game.god.used.rotatingWall > 0, `graine ${seed} : pas de mur rotatif`);
    }
    assert.ok(used >= 30, `${used} pouvoirs utilisés`);
    assert.ok(damage >= 2, `${damage} dégâts infligés`);
});

test("l'IA rend la main au joueur", () => {
    const game = new GameManager({ rng: seeded(7), countdownSeconds: 0 });
    game.startMatch({ snake1: { name: "Humain", ai: false }, god: AI("G") });
    assert.equal(game.isAi("snake1"), false);
    game.setAiControl("snake1", true);
    assert.equal(game.isAi("snake1"), true);
    game.setAiControl("snake1", false);
    assert.equal(game.snapshot().snakes[0].ai, false);
});
