// Coût d'un tick serveur (partie IA complète, sans réseau), et ce qui coûte dans les pires ticks.
// Usage : node test/perf.mjs
import { GameManager } from "../server/GameManager.js";

for (const map of ["cube", "world"]) {
    const g = new GameManager({ countdownSeconds: 0, map, matchSeconds: 90 });
    g.startMatch({ snake1: { name: "A", ai: true }, snake2: { name: "B", ai: true }, god: { name: "G", ai: true } });
    // Chronomètre les pouvoirs demandés par le dieu IA (validation comprise).
    const powerMs = {};
    const handlePower = g.handlePower.bind(g);
    g.handlePower = (req) => {
        const t = performance.now();
        const r = handlePower(req);
        powerMs[req.power] = (powerMs[req.power] ?? 0) + performance.now() - t;
        return r;
    };
    let worst = 0;
    let worstEvents = "";
    let total = 0;
    let n = 0;
    while (g.status !== "ended") {
        const t = performance.now();
        g.tick(g.tickMs);
        g.snapshot();
        const d = performance.now() - t;
        if (d > worst) {
            worst = d;
            worstEvents = g.events.map((e) => e.type).join(", ");
        }
        total += d;
        n++;
    }
    console.log(`${map} : ${(total / n).toFixed(2)} ms par tick en moyenne, pire ${worst.toFixed(1)} ms (${worstEvents})`);
    console.log("   pouvoirs (ms au total) :", Object.fromEntries(Object.entries(powerMs).map(([k, v]) => [k, Math.round(v)])));
}
