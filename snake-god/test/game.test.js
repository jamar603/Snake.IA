import assert from "node:assert/strict";
import { test } from "node:test";
import { MAPS, POWERS, SNAKE, UNLIMITED } from "../shared/config.js";
import { key, rotateQuarter, rotatingWallCells, rotatingWallFits } from "../shared/grid.js";
import { createMap } from "../shared/maps/index.js";
import { MATCH_STATUS } from "../shared/protocol.js";
import { GameManager } from "../server/GameManager.js";
import { SnakeController } from "../server/SnakeController.js";

// Générateur pseudo-aléatoire reproductible.
function seeded(seed = 42) {
    let s = seed;
    return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

// CUBE de départ (7 cases de côté, espace 15) : le bloc va de 4 à 10, la face du dessus est y = 11.
const TOP = 11;
const at = (x, z) => [x, TOP, z];

function newGame(roster = { snake1: "A", snake2: "B", god: "G" }, map = "cube") {
    const game = new GameManager({ rng: seeded(), countdownSeconds: 0, worldEvents: false, map });
    game.startMatch(roster);
    // Monde vide et prévisible pour les tests.
    for (const id of [...game.walls.walls.keys()]) game.walls.remove(id);
    game.food.food.clear();
    game.food.count = 0;
    return game;
}

// Pose le Snake sur la face du dessus, tête en `cell`, vers `dir`.
function place(game, id, cell, dir = [1, 0, 0], length = SNAKE.startLength) {
    const s = game.getSnake(id);
    s.spawn(cell, dir, game.grid.map.normalAt(cell), length);
    return s;
}

test("rotation d'un quart de tour (main droite)", () => {
    assert.deepEqual(rotateQuarter([1, 0, 0], "y"), [0, 0, -1]);
    assert.deepEqual(rotateQuarter([0, 1, 0], "x"), [0, 0, 1]);
    assert.deepEqual(rotateQuarter([1, 0, 0], "z"), [0, 1, 0]);
    assert.deepEqual(rotateQuarter([1, 2, 3], "y", 4), [1, 2, 3]);
});

test("CUBE : chaque cellule a une face, et on fait le tour d'une face à l'autre", () => {
    const cube = createMap("cube");
    const cells = [...cube.cells()];
    assert.equal(cells.length, 6 * 7 * 7);
    assert.equal(new Set(cells.map(key)).size, cells.length, "aucune cellule en double");
    assert.ok(cells.every((c) => cube.isCell(c)));
    // Tout droit, on revient au départ après 4 faces (4 × 7 cases).
    let s = { cell: at(4, 7), dir: [1, 0, 0] };
    const start = key(s.cell);
    const normals = new Set();
    for (let i = 0; i < 28; i++) {
        s = cube.step(s.cell, s.dir);
        assert.ok(cube.isCell(s.cell), `case ${i} jouable`);
        normals.add(key(cube.normalAt(s.cell)));
    }
    assert.equal(key(s.cell), start);
    assert.equal(normals.size, 4);
    // Chaque cellule a exactement 4 voisins (arêtes comprises).
    assert.ok(cells.every((c) => cube.neighbors(c).length === 4 && cube.neighbors(c).every((n) => cube.isCell(n))));
});

test("WORLD : terrain plat, le bord est un mur", () => {
    const flat = createMap("world");
    const size = MAPS.world.sizes[0];
    assert.equal([...flat.cells()].length, size * size);
    const edge = [flat.arena.max, flat.layer, flat.arena.min + 3];
    assert.equal(flat.isCell(flat.step(edge, [1, 0, 0]).cell), false);
});

test("mur rotatif : cellules et place sur une face", () => {
    assert.deepEqual(rotatingWallCells([4, 4, 4], "y", 2, 0), [[2, 4, 4], [3, 4, 4], [4, 4, 4], [5, 4, 4], [6, 4, 4]]);
    assert.deepEqual(rotatingWallCells([4, 4, 4], "y", 2, 1)[0], [4, 4, 6]);
    const cube = createMap("cube");
    const onTop = (c) => cube.isCell(c) && c[1] === TOP;
    assert.equal(rotatingWallFits(at(7, 7), "y", 2, onTop), true);
    assert.equal(rotatingWallFits(at(5, 7), "y", 2, onTop), false);
});

test("virages relatifs du Snake", () => {
    const s = new SnakeController("snake1", "A");
    s.spawn(at(7, 7), [1, 0, 0], [0, 1, 0]);
    s.queueTurn("right");
    s.applyQueuedTurn();
    assert.deepEqual(s.dir, [0, 0, 1]);
    s.queueTurn("left");
    s.applyQueuedTurn();
    assert.deepEqual(s.dir, [1, 0, 0]);
    s.queueTurn("up"); // haut : le nez bascule (filtré hors du Cube 3D par GameManager)
    s.applyQueuedTurn();
    assert.deepEqual(s.dir, [0, 1, 0]);
    assert.deepEqual(s.up, [-1, 0, 0]);
});

test("le Snake passe l'arête tout seul et change de face", () => {
    const game = newGame({ snake1: "A" });
    const s = place(game, "snake1", at(10, 7), [1, 0, 0], 1);
    game.tick(100);
    assert.deepEqual(s.head, [11, 10, 7]);
    assert.deepEqual(s.dir, [0, -1, 0]);
    assert.deepEqual(s.up, [1, 0, 0]);
    assert.equal(s.health.hp, SNAKE.maxHp, "pas de bord sur le cube");
});

test("le Snake avance et grandit en mangeant", () => {
    const game = newGame({ snake1: "A" });
    const s = place(game, "snake1", at(6, 7));
    const target = at(7, 7);
    game.food.food.set(key(target), { cell: target, kind: "normal", expiresAt: null });
    game.tick(100);
    assert.deepEqual(s.head, target);
    assert.equal(s.score, SNAKE.foodPoints);
    game.tick(100);
    assert.equal(s.length, SNAKE.startLength + 1);
});

test("nourriture : apparence tirée au hasard, transmise aux clients et à l'événement", () => {
    const game = newGame({ snake1: "A" });
    game.food.count = 4;
    game.food.refill();
    const items = game.food.items();
    assert.equal(items.length, 4);
    for (const f of items) assert.ok(Number.isInteger(f.variant) && f.variant >= 0, "chaque aliment a une variante");
    const s = place(game, "snake1", at(6, 7));
    const target = at(7, 7);
    game.food.food.set(key(target), { cell: target, kind: "normal", expiresAt: null, variant: 123 });
    game.tick(100);
    const ev = game.events.find((e) => e.type === "foodEaten");
    assert.equal(ev?.variant, 123);
    assert.equal(s.score, SNAKE.foodPoints, "la variante ne change pas les points");
});

test("piège : -1 PV puis disparition", () => {
    const game = newGame({ snake1: "A", god: "G" });
    const s = place(game, "snake1", at(5, 7));
    game.traps.place(at(7, 7));
    game.tick(100);
    game.tick(100);
    assert.equal(s.health.hp, SNAKE.maxHp - 1);
    assert.equal(game.traps.count, 0);
    assert.equal(game.scores.god.damageDealt, 1);
});

test("le dieu ne peut pas piéger à côté d'une tête et paie en énergie", () => {
    const game = newGame({ snake1: "A", god: "G" });
    place(game, "snake1", at(5, 5));
    assert.equal(game.handlePower({ power: "trap", cell: at(6, 5) }).ok, false);
    assert.equal(game.handlePower({ power: "trap", cell: [7, 7, 7] }).ok, false, "dans le bloc : pas une case");
    const before = game.god.energy;
    assert.equal(game.handlePower({ power: "trap", cell: at(9, 9) }).ok, true);
    assert.equal(game.god.energy, before - POWERS.trap.cost);
    assert.equal(game.handlePower({ power: "trap", cell: at(9, 8) }).ok, false, "cooldown");
});

test("mur rotatif : phase 2, couché sur la face, écrase un Snake", () => {
    const game = newGame({ snake1: "A", god: "G" });
    game.god.energy = 100;
    assert.equal(game.handlePower({ power: "rotatingWall", cell: at(7, 7) }).ok, false, "phase 1");
    game.now = game.matchMs * 0.3;
    assert.equal(game.handlePower({ power: "rotatingWall", cell: at(5, 7) }).ok, false, "la lame sortirait de la face");
    const s = place(game, "snake1", at(7, 5), [0, 0, -1]);
    const wall = game.walls.addRotating(at(7, 7), "y", 2, 100, game.now);
    assert.ok(wall.cells.every((c) => c[1] === TOP));
    game.tick(100); // la lame pivote et balaie [7, 11, 5]
    assert.equal(s.health.hp, SNAKE.maxHp - 1);
    assert.equal(s.alive, true);
});

test("WORLD : le bord blesse et fait réapparaître", () => {
    const game = newGame({ snake1: "A" }, "world");
    const map = game.grid.map;
    const s = place(game, "snake1", [map.arena.max, map.layer, map.arena.min + 4]);
    game.tick(100);
    assert.equal(s.health.maxHp, MAPS.world.snakeHp);
    assert.equal(s.health.hp, s.health.maxHp - 1);
    assert.equal(s.length, SNAKE.startLength);
    assert.ok(map.isCell(s.head));
});

test("le dieu gagne quand tous les Snakes sont éliminés", () => {
    const game = newGame({ snake1: "A", god: "G" });
    for (let i = 0; i < SNAKE.maxHp; i++) {
        const s = place(game, "snake1", at(6, 7));
        s.health.invulnerableUntil = 0;
        game.walls.addStatic([at(7, 7)], { kind: "pillar" });
        game.tick(100);
        for (const id of [...game.walls.walls.keys()]) game.walls.remove(id);
    }
    assert.equal(game.getSnake("snake1").alive, false);
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

test("démolition : ouvre un passage", () => {
    const game = newGame({ snake1: "A", god: "G" });
    game.walls.addStatic([at(9, 9), at(9, 10)], { kind: "pillar" });
    assert.equal(game.handlePower({ power: "demolish", cell: at(8, 8) }).ok, false, "pas de mur ici");
    assert.equal(game.handlePower({ power: "demolish", cell: at(9, 10) }).ok, true);
    assert.equal(game.walls.isWall(key(at(9, 9))), false);
});

test("zone dangereuse : sur la face, avertissement puis -1 PV", () => {
    const game = newGame({ snake1: "A", god: "G" });
    const s = place(game, "snake1", at(5, 7));
    game.now = game.matchMs * 0.6; // phase 3
    game.god.energy = 100;
    const r = game.handlePower({ power: "dangerZone", cell: at(8, 7) });
    assert.equal(r.ok, true);
    assert.ok(r.event.cells.every((c) => c[1] === TOP), "dalle couchée sur la face");
    game.tick(100); // la zone n'est pas encore active
    assert.equal(s.health.hp, SNAKE.maxHp);
    game.tick(1200);
    game.tick(100);
    assert.equal(s.health.hp, SNAKE.maxHp - 1);
});

test("téléporteur : sortie sûre sur une autre face, la tête ressort de l'autre côté", () => {
    const game = newGame({ snake1: "A", god: "G" });
    const s = place(game, "snake1", at(5, 7));
    game.now = game.matchMs * 0.3;
    game.god.energy = 100;
    const r = game.handlePower({ power: "teleporter", cell: at(8, 7) });
    assert.equal(r.ok, true);
    const [entry, exit] = r.event.cells;
    assert.notDeepEqual(game.grid.map.normalAt(exit), game.grid.map.normalAt(entry));
    game.tick(100);
    game.tick(100);
    game.tick(100);
    assert.deepEqual(s.head, exit);
    assert.ok(s.dir.every((v, i) => v * s.up[i] === 0), "direction couchée sur la face de sortie");
});

test("événement du monde : le dieu le voit et peut le déclencher", () => {
    const game = new GameManager({ rng: seeded(3), countdownSeconds: 0 });
    game.startMatch({ snake1: "A", god: "G" });
    const intel = game.godIntel();
    assert.ok(intel.nextEvent.inMs > 0);
    assert.equal(intel.upcomingFood.length, 3);
    assert.ok(intel.nextEvent.cells.every((c) => game.grid.map.isCell(c)));
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
    const s = place(game, "snake1", at(6, 7));
    game.food.addSpecial(at(7, 7), "golden", 99999);
    game.tick(100);
    assert.equal(s.score, 50);
    assert.equal(s.growth.pending, 3);
    assert.equal(s.health.hp, SNAKE.maxHp, "déjà au maximum : pas de soin au-delà");
});

test("CUBE qui grandit : tout glisse avec la surface, rien n'apparaît sur un Snake", () => {
    const game = new GameManager({ rng: seeded(9), countdownSeconds: 0, worldEvents: false });
    game.startMatch({ snake1: { name: "A", ai: true }, snake2: { name: "B", ai: true } });
    assert.equal(game.grid.arena.size, 7);
    // Un Snake à cheval sur une arête au moment de l'expansion.
    const s = place(game, "snake1", [11, 10, 7], [0, -1, 0], 1);
    s.body = [[11, 10, 7], at(10, 7), at(9, 7)];
    game.traps.place(at(6, 6));
    const fresh = game.expansion.apply(game, 9);
    const map = game.grid.map;
    assert.equal(map.arena.size, 9);
    assert.ok(s.body.every((c) => map.isCell(c)), "corps sur la nouvelle surface");
    assert.equal(s.body.length, 3);
    for (let i = 1; i < s.body.length; i++) {
        assert.ok(map.neighbors(s.body[i - 1]).some((n) => key(n) === key(s.body[i])), "corps continu");
    }
    assert.ok(map.isCell(game.traps.snapshot()[0]));
    // Les nouvelles cases naissent aux arêtes ; seul le corps recollé peut y passer, jamais un obstacle.
    assert.ok(fresh.length > 0 && fresh.every((c) => map.isCell(c)));
    const bodyKeys = new Set(game.snakes.flatMap((sn) => sn.body.map(key)));
    assert.ok(![...game.walls.cellIndex.keys(), ...game.traps.snapshot().map(key)].some((k) => bodyKeys.has(k)), "aucun obstacle sous un Snake");
});

test("le monde grandit tout seul : annonce, puis nouvelle taille et obstacles loin des têtes", () => {
    for (const mapKind of ["cube", "volume", "world"]) {
        const game = new GameManager({ rng: seeded(9), countdownSeconds: 0, worldEvents: false, map: mapKind });
        game.startMatch({ snake1: { name: "A", ai: true }, snake2: { name: "B", ai: true } });
        const sizes = MAPS[mapKind].sizes;
        let start = null;
        let complete = null;
        for (let i = 0; i < 600 && !complete; i++) {
            for (const ev of game.tick(100)) {
                if (ev.type === "expansionStart") start ??= ev;
                if (ev.type === "expansionComplete") complete = ev;
            }
        }
        assert.equal(start.toSize, sizes[1], mapKind);
        assert.equal(game.grid.arena.size, sizes[1], mapKind);
        const heads = game.snakes.filter((sn) => sn.alive).map((sn) => sn.head);
        assert.ok(complete.cells.every((c) => game.grid.map.isCell(c)), mapKind);
        assert.ok(game.snakes.every((sn) => sn.body.every((c) => game.grid.map.isCell(c))), mapKind);
        assert.ok(heads.length > 0);
    }
});

test("le dieu peut forcer l'expansion", () => {
    const game = newGame({ snake1: "A", god: "G" });
    game.now = game.matchMs * 0.3;
    game.god.energy = 100;
    assert.equal(game.handlePower({ power: "expand" }).ok, true);
    assert.equal(game.handlePower({ power: "expand" }).ok, false, "déjà en cours");
});

test("durée : illimitée jusqu'à la longueur cible, sinon fin au timer", () => {
    let game = newGame({ snake1: "A" });
    game.setDuration(0);
    assert.equal(game.snapshot().timeLeftMs, null);
    game.now = 10 * 60 * 1000; // 10 min : rien ne s'arrête
    game.tick(game.tickMs);
    assert.notEqual(game.status, MATCH_STATUS.ENDED);
    place(game, "snake1", at(7, 7), [1, 0, 0], UNLIMITED.winLength);
    game.tick(game.tickMs);
    assert.equal(game.status, MATCH_STATUS.ENDED);
    assert.equal(game.summary.winner, "snakes");

    game = newGame({ snake1: "A" });
    game.setDuration(90);
    game.now = 90000 - 10;
    game.tick(game.tickMs);
    assert.equal(game.status, MATCH_STATUS.ENDED);
});

test("compétences : sprint, bouclier et phase", () => {
    // Sprint : deux cases par tick.
    let game = newGame({ snake1: "A" });
    let s = place(game, "snake1", at(5, 7), [1, 0, 0], 1);
    assert.equal(game.handleSkill("snake1", "sprint"), true);
    assert.equal(game.handleSkill("snake1", "sprint"), false, "recharge");
    game.tick(game.tickMs);
    assert.deepEqual(s.head, at(7, 7));
    assert.ok(game.events.some((e) => e.type === "skillUsed" && e.skill === "sprint"), "événement reçu hors tick, envoyé au tick suivant");

    // Bouclier : le choc contre un mur ne coûte pas de PV.
    game = newGame({ snake1: "A" });
    s = place(game, "snake1", at(5, 7), [1, 0, 0], 1);
    game.walls.addStatic([at(6, 7)], { kind: "pillar" });
    game.handleSkill("snake1", "shield");
    game.tick(game.tickMs);
    assert.equal(s.health.hp, SNAKE.maxHp);
    assert.ok(game.events.some((e) => e.type === "shieldBlocked"));

    // Phase : traverse le mur sans dégât.
    game = newGame({ snake1: "A" });
    s = place(game, "snake1", at(5, 7), [1, 0, 0], 1);
    game.walls.addStatic([at(6, 7)], { kind: "pillar" });
    game.handleSkill("snake1", "phase");
    game.tick(game.tickMs);
    game.tick(game.tickMs);
    assert.deepEqual(s.head, at(7, 7));
    assert.equal(s.health.hp, SNAKE.maxHp);
});

test("CUBE 3D (classique) : on vole dans le volume, haut et bas, le bord blesse", () => {
    const game = newGame({ snake1: "A" }, "volume");
    const map = game.grid.map;
    const mid = (map.arena.min + map.arena.max) / 2;
    const s = place(game, "snake1", [mid, mid, mid], [1, 0, 0], 1);
    s.up = [0, 1, 0];
    game.handleTurn("snake1", "up");
    game.tick(100);
    assert.deepEqual(s.head, [mid, mid + 1, mid], "monte");
    assert.deepEqual(s.dir, [0, 1, 0]);
    // Bord du volume : -1 PV et réapparition.
    const t = place(game, "snake1", [map.arena.max, mid, mid], [1, 0, 0], 1);
    t.up = [0, 1, 0];
    game.tick(100);
    assert.equal(t.health.hp, t.health.maxHp - 1);
    assert.ok(map.isCell(t.head));
    assert.equal(t.dir.reduce((a, v, i) => a + v * t.up[i], 0), 0, "haut perpendiculaire à la direction");
    // Haut / bas ignorés sur le cube de surface.
    const cube = newGame({ snake1: "A" });
    const c = place(cube, "snake1", at(6, 7), [1, 0, 0], 1);
    cube.handleTurn("snake1", "up");
    cube.tick(100);
    assert.deepEqual(c.head, at(7, 7));
});

test("parties IA complètes : les Snakes restent toujours sur la map", () => {
    for (const mapKind of ["cube", "volume", "world"]) {
        const game = new GameManager({ rng: seeded(21), countdownSeconds: 0, map: mapKind, matchSeconds: 60 });
        game.startMatch({ snake1: { name: "A", ai: true }, snake2: { name: "B", ai: true }, god: { name: "G", ai: true } });
        while (game.status !== MATCH_STATUS.ENDED) {
            game.tick(game.tickMs);
            for (const sn of game.snakes) assert.ok(sn.body.every((c) => game.grid.map.isCell(c)), `${mapKind} ${key(sn.head ?? [0, 0, 0])}`);
            for (const w of game.walls.walls.values()) assert.ok(w.cells.every((c) => game.grid.map.isCell(c)), `${mapKind} mur`);
        }
    }
});
