// Simulation d'équilibrage : parties complètes IA contre IA, sans réseau.
// Usage : node test/balance.mjs [nombre de parties] [durée en s, 0 = illimitée] [cube | world]
import { MATCH_STATUS } from "../shared/protocol.js";
import { GameManager } from "../server/GameManager.js";

function seeded(seed) {
    let s = seed;
    return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

const games = Number(process.argv[2]) || 40;
const duration = process.argv[3] != null ? Number(process.argv[3]) : undefined;
const map = process.argv[4] ?? "cube";
const AI = (name) => ({ name, ai: true });
const stats = { god: 0, snakes: 0, endMs: 0, damage: 0, survivors: 0, length: 0, power: {}, cause: {} };

for (let seed = 1; seed <= games; seed++) {
    const game = new GameManager({ rng: seeded(seed * 97), countdownSeconds: 0, matchSeconds: duration, map });
    game.startMatch({ snake1: AI("A"), snake2: AI("B"), god: AI("G") });
    let t = 0;
    while (game.status !== MATCH_STATUS.ENDED && t < 400000) {
        game.tick(game.tickMs);
        t += game.tickMs;
        for (const ev of game.snapshot().events ?? []) {
            if (ev.type === "damage") stats.cause[ev.cause] = (stats.cause[ev.cause] ?? 0) + 1;
        }
    }
    const godWon = game.snakes.every((s) => !s.alive);
    stats[godWon ? "god" : "snakes"]++;
    stats.endMs += t;
    stats.damage += game.scores.god.damageDealt;
    stats.survivors += game.snakes.filter((s) => s.alive).length;
    stats.length += game.snakes.reduce((a, s) => a + s.body.length, 0) / 2;
    for (const [k, v] of Object.entries(game.god.used)) stats.power[k] = (stats.power[k] ?? 0) + v;
}

const avg = (v) => (v / games).toFixed(1);
console.log(`${games} parties (${map})`);
console.log(`Victoires dieu ${stats.god} (${Math.round((stats.god / games) * 100)} %), Snakes ${stats.snakes}`);
console.log(`Durée moyenne ${avg(stats.endMs / 1000)} s, dégâts du dieu ${avg(stats.damage)}, survivants ${avg(stats.survivors)}, longueur ${avg(stats.length)}`);
console.log("Pouvoirs / partie :", Object.fromEntries(Object.entries(stats.power).map(([k, v]) => [k, avg(v)])));
console.log("Causes de dégâts / partie :", Object.fromEntries(Object.entries(stats.cause).map(([k, v]) => [k, avg(v)])));
