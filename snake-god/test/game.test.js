import assert from "node:assert/strict";
import { test } from "node:test";
import { POWERS, SNAKE } from "../shared/config.js";
import { rotateQuarter, rotatingWallCells, rotatingWallFits } from "../shared/grid.js";
import { MATCH_STATUS } from "../shared/protocol.js";
import { GameManager } from "../server/GameManager.js";
import { SnakeController } from "../server/SnakeController.js";

// Générateur pseudo-aléatoire reproductible.
function seeded(seed = 42) {
    let s = seed;
    return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

function newGame(roster = { snake1: "A", snake2: "B", god: "G" }) {
    const game = new GameManager({ rng: seeded(), countdownSeconds: 0, worldEvents: false });
    game.startMatch(roster);
    // Monde vide et prévisible pour les tests.
    for (const id of [...game.walls.walls.keys()]) game.walls.remove(id);
    game.food.food.clear();
    game.food.count = 0;
    return game;
}

test("rotation d'un quart de tour (main droite)", () => {
    assert.deepEqual(rotateQuarter([1, 0, 0], "y"), [0, 0, -1]);
    assert.deepEqual(rotateQuarter([0, 1, 0], "x"), [0, 0, 1]);
    assert.deepEqual(rotateQuarter([1, 0, 0], "z"), [0, 1, 0]);
    assert.deepEqual(rotateQuarter([1, 2, 3], "y", 4), [1, 2, 3]);
});

test("mur rotatif : cellules et place dans le cube", () => {
    assert.deepEqual(rotatingWallCells([4, 4, 4], "y", 2, 0), [[2, 4, 4], [3, 4, 4], [4, 4, 4], [5, 4, 4], [6, 4, 4]]);
    assert.deepEqual(rotatingWallCells([4, 4, 4], "y", 2, 1)[0], [4, 4, 6]);
    assert.equal(rotatingWallFits([4, 4, 4], "y", 2, 9), true);
    assert.equal(rotatingWallFits([1, 4, 4], "y", 2, 9), false);
});

test("virages relatifs du Snake", () => {
    const s = new SnakeController("snake1", "A");
    s.spawn([4, 4, 4], [1, 0, 0], [0, 1, 0]);
    s.queueTurn("up");
    s.applyQueuedTurn();
    assert.deepEqual(s.dir, [0, 1, 0]);
    assert.deepEqual(s.up, [-1, 0, 0]);
    s.queueTurn("down");
    s.applyQueuedTurn();
    assert.deepEqual(s.dir, [1, 0, 0]);
    s.queueTurn("right");
    s.applyQueuedTurn();
    assert.deepEqual(s.dir, [0, 0, 1]);
});

test("le Snake avance et grandit en mangeant", () => {
    const game = newGame({ snake1: "A" });
    const s = game.getSnake("snake1");
    const target = [s.head[0] + 1, s.head[1], s.head[2]];
    game.food.food.set(target.join(","), { cell: target, kind: "normal", expiresAt: null });
    game.tick(100);
    assert.deepEqual(s.head, target);
    assert.equal(s.score, SNAKE.foodPoints);
    game.tick(100);
    assert.equal(s.length, SNAKE.startLength + 1);
});

test("piège : -1 PV puis disparition", () => {
    const game = newGame({ snake1: "A", god: "G" });
    const s = game.getSnake("snake1");
    const cell = [s.head[0] + 2, s.head[1], s.head[2]];
    game.traps.place(cell);
    game.tick(100);
    game.tick(100);
    assert.equal(s.health.hp, SNAKE.maxHp - 1);
    assert.equal(game.traps.count, 0);
    assert.equal(game.scores.god.damageDealt, 1);
});

test("le dieu ne peut pas piéger à côté d'une tête et paie en énergie", () => {
    const game = newGame({ snake1: "A", god: "G" });
    const s = game.getSnake("snake1");
    const near = game.handlePower({ power: "trap", cell: [s.head[0] + 1, s.head[1], s.head[2]] });
    assert.equal(near.ok, false);
    const before = game.god.energy;
    const ok = game.handlePower({ power: "trap", cell: [7, 7, 7] });
    assert.equal(ok.ok, true);
    assert.equal(game.god.energy, before - POWERS.trap.cost);
    assert.equal(game.handlePower({ power: "trap", cell: [7, 7, 6] }).ok, false, "cooldown");
});

test("mur rotatif bloqué en phase 1, disponible en phase 2", () => {
    const game = newGame({ snake1: "A", god: "G" });
    game.god.energy = 100;
    assert.equal(game.handlePower({ power: "rotatingWall", cell: [4, 4, 4], axis: "y" }).ok, false);
    game.now = game.matchMs * 0.3;
    assert.equal(game.handlePower({ power: "rotatingWall", cell: [4, 2, 4], axis: "y" }).ok, true);
});

test("un mur rotatif qui écrase un Snake lui retire 1 PV", () => {
    const game = newGame({ snake1: "A", god: "G" });
    const s = game.getSnake("snake1");
    s.spawn([4, 4, 2], [0, 0, -1], [0, 1, 0]); // va vers le bord, sur le passage du mur
    const wall = game.walls.addRotating([4, 4, 4], "y", 2, 100, 0);
    assert.deepEqual(wall.cells[0], [2, 4, 4]);
    game.tick(100); // le mur pivote : sa barre passe par [4,4,2]
    assert.equal(s.health.hp, SNAKE.maxHp - 1);
    assert.equal(s.alive, true);
});

test("le bord du cube blesse et fait réapparaître", () => {
    const game = newGame({ snake1: "A" });
    const s = game.getSnake("snake1");
    s.spawn([8, 4, 4], [1, 0, 0], [0, 1, 0]);
    game.tick(100);
    assert.equal(s.health.hp, SNAKE.maxHp - 1);
    assert.equal(s.length, SNAKE.startLength);
});

test("le dieu gagne quand tous les Snakes sont éliminés", () => {
    const game = newGame({ snake1: "A", god: "G" });
    const s = game.getSnake("snake1");
    for (let i = 0; i < SNAKE.maxHp; i++) {
        s.health.invulnerableUntil = 0;
        s.spawn([8, 4, 4], [1, 0, 0], [0, 1, 0]);
        game.tick(100);
    }
    assert.equal(s.alive, false);
    assert.equal(game.status, MATCH_STATUS.ENDED);
    assert.equal(game.summary.winner, "god");
});

test("les Snakes gagnent s'ils survivent jusqu'au bout", () => {
    const game = newGame({ snake1: "A", god: "G" });
    game.now = game.matchMs - 50;
    game.tick(100);
    assert.equal(game.status, MATCH_STATUS.ENDED);
    assert.equal(game.summary.winner, "snakes");
    assert.ok(game.summary.snakes[0].score >= SNAKE.survivalBonus);
});

test("démolition : ouvre un passage dans un mur", () => {
    const game = newGame({ snake1: "A", god: "G" });
    game.walls.addStatic([[6, 6, 6], [6, 7, 6]], { kind: "pillar" });
    assert.equal(game.handlePower({ power: "demolish", cell: [5, 5, 5] }).ok, false, "pas de mur ici");
    assert.equal(game.handlePower({ power: "demolish", cell: [6, 7, 6] }).ok, true);
    assert.equal(game.walls.isWall("6,6,6"), false);
});

test("zone dangereuse : avertissement puis -1 PV", () => {
    const game = newGame({ snake1: "A", god: "G" });
    const s = game.getSnake("snake1");
    game.now = game.matchMs * 0.6; // phase 3
    game.god.energy = 100;
    const ahead = [s.head[0] + 3, s.head[1], s.head[2]];
    assert.equal(game.handlePower({ power: "dangerZone", cell: ahead, axis: "x" }).ok, true);
    game.tick(100); // la zone n'est pas encore active
    assert.equal(s.health.hp, SNAKE.maxHp);
    game.tick(1200);
    game.tick(100);
    assert.equal(s.health.hp, SNAKE.maxHp - 1);
});

test("événement du monde : le dieu le voit et peut le déclencher", () => {
    const game = new GameManager({ rng: seeded(3), countdownSeconds: 0 });
    game.startMatch({ snake1: "A", god: "G" });
    const intel = game.godIntel();
    assert.ok(intel.nextEvent.inMs > 0);
    assert.equal(intel.upcomingFood.length, 3);
    game.now = game.matchMs * 0.3; // phase 2 : déclenchement débloqué
    game.god.energy = 100;
    const type = intel.nextEvent.type;
    const r = game.handlePower({ power: "triggerEvent" });
    assert.equal(r.ok, true);
    assert.equal(r.event.event, type);
    assert.notEqual(game.worldEvents.next, null, "un nouvel événement est préparé");
});

test("fruit doré : 50 points et 3 segments", () => {
    const game = newGame({ snake1: "A" });
    const s = game.getSnake("snake1");
    const target = [s.head[0] + 1, s.head[1], s.head[2]];
    game.food.addSpecial(target, "golden", 99999);
    game.tick(100);
    assert.equal(s.score, 50);
    assert.equal(s.growth.pending, 3);
});
