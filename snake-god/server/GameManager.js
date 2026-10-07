import {
    COUNTDOWN_SECONDS,
    FOOD_COUNT,
    GRID_SIZE,
    MATCH_SECONDS,
    PHASES,
    STARTING_PILLARS,
    UPCOMING_FOOD_PREVIEW,
    WORLD_EVENTS,
} from "../shared/config.js";
import { DEFAULT_COSMETICS, evolutionFor, sanitizeCosmetics } from "../shared/cosmetics.js";
import { AXES, add, chebyshev, cross, equals, key } from "../shared/grid.js";
import { MATCH_STATUS } from "../shared/protocol.js";
import { GodAI } from "./ai/GodAI.js";
import { Navigation } from "./ai/Navigation.js";
import { SnakeAI } from "./ai/SnakeAI.js";
import { FoodSystem } from "./FoodSystem.js";
import { GodPowerSystem } from "./GodPowerSystem.js";
import { ScoreManager } from "./ScoreManager.js";
import { SnakeController } from "./SnakeController.js";
import { TrapSystem } from "./TrapSystem.js";
import { WallSystem } from "./WallSystem.js";
import { WorldEventSystem } from "./WorldEventSystem.js";
import { WorldGrid } from "./WorldGrid.js";
import { ZoneSystem } from "./ZoneSystem.js";

const DIRECTIONS = [
    [1, 0, 0], [-1, 0, 0],
    [0, 1, 0], [0, -1, 0],
    [0, 0, 1], [0, 0, -1],
];

// Règles d'une partie : cycle de vie, tick de simulation, collisions, victoire.
// Ne connaît rien du réseau : MultiplayerManager l'appelle et diffuse snapshot().
export class GameManager {
    constructor({
        rng = Math.random,
        size = GRID_SIZE,
        matchSeconds = MATCH_SECONDS,
        countdownSeconds = COUNTDOWN_SECONDS,
        worldEvents = true,
    } = {}) {
        this.rng = rng;
        this.worldEventsEnabled = worldEvents;
        this.size = size;
        this.matchMs = matchSeconds * 1000;
        this.countdownMs = countdownSeconds * 1000;
        this.status = MATCH_STATUS.LOBBY;
        this.summary = null;
    }

    // roster : { snake1?, snake2?, god? } avec pour chaque rôle un nom (humain)
    // ou { name, ai: true }. Un rôle absent n'existe pas dans la partie.
    startMatch(rawRoster) {
        const roster = {};
        for (const [role, v] of Object.entries(rawRoster)) {
            if (v) roster[role] = typeof v === "string" ? { name: v, ai: false } : v;
        }
        this.aiRoles = new Set(Object.keys(roster).filter((r) => roster[r].ai));
        this.grid = new WorldGrid(this.size, this.rng);
        this.walls = new WallSystem();
        this.traps = new TrapSystem();
        this.food = new FoodSystem(this.grid, FOOD_COUNT, UPCOMING_FOOD_PREVIEW);
        this.zones = new ZoneSystem();
        this.worldEvents = new WorldEventSystem({ grid: this.grid, food: this.food, zones: this.zones, rng: this.rng });
        this.scores = new ScoreManager();
        this.snakes = [];
        this.godName = roster.god?.name ?? null;
        this.now = 0; // temps de jeu écoulé (ms), hors compte à rebours
        this.countdownLeft = this.countdownMs;
        this.tickCount = 0;
        this.events = [];
        this.summary = null;

        this.grid.addOccupant((k) => this.walls.isWall(k));
        this.grid.addOccupant((k) => this.traps.has(k));
        this.grid.addOccupant((k) => this.food.has(k));
        this.grid.addOccupant((k) => this.snakes.some((s) => s.body.some((c) => key(c) === k)));

        // Couloirs différents : pas de choc frontal dès le départ.
        const lo = 2;
        const hi = this.size - 3;
        const spawns = {
            snake1: { cell: [1, lo, lo], dir: [1, 0, 0] },
            snake2: { cell: [this.size - 2, hi, hi], dir: [-1, 0, 0] },
        };
        for (const id of ["snake1", "snake2"]) {
            if (!roster[id]) continue;
            const s = new SnakeController(id, roster[id].name);
            s.cosmetics = sanitizeCosmetics(roster[id].cosmetics, DEFAULT_COSMETICS[id]);
            s.spawn(spawns[id].cell, spawns[id].dir, [0, 1, 0]);
            this.snakes.push(s);
        }

        this.god = new GodPowerSystem({
            grid: this.grid,
            walls: this.walls,
            traps: this.traps,
            zones: this.zones,
            events: this.worldEvents,
            snakes: () => this.snakes,
        });

        this.snakeAIs = new Map(this.snakes.map((s) => [s.id, new SnakeAI(s, this.rng)]));
        this.godAI = roster.god ? new GodAI(this, this.rng) : null;

        this.#placePillars();
        this.food.refill(this.snakes.map((s) => s.head));
        if (this.worldEventsEnabled) this.worldEvents.schedule(0);
        this.status = this.countdownMs > 0 ? MATCH_STATUS.COUNTDOWN : MATCH_STATUS.PLAYING;
    }

    #placePillars() {
        const heads = this.snakes.map((s) => s.head);
        for (let i = 0; i < STARTING_PILLARS; i++) {
            const base = this.grid.findFreeCell((c) => heads.every((h) => chebyshev(c, h) > 2));
            if (!base) return;
            const top = add(base, [0, 1, 0]);
            const cells = this.grid.isFree(top) ? [base, top] : [base];
            this.walls.addStatic(cells, { kind: "pillar" });
        }
    }

    get phase() {
        const progress = this.now / this.matchMs;
        let current = PHASES[0];
        for (const p of PHASES) if (progress >= p.from) current = p;
        return current;
    }

    get tickMs() {
        return this.phase.tickMs;
    }

    get timeLeftMs() {
        return Math.max(0, this.matchMs - this.now);
    }

    // L'IA prend (ou rend) le contrôle d'un rôle, par exemple quand un joueur se déconnecte.
    setAiControl(role, on) {
        if (!this.aiRoles) return;
        if (on) this.aiRoles.add(role);
        else this.aiRoles.delete(role);
    }

    isAi(role) {
        return this.aiRoles?.has(role) ?? false;
    }

    getSnake(id) {
        return this.snakes?.find((s) => s.id === id) ?? null;
    }

    handleTurn(role, turn) {
        const snake = this.getSnake(role);
        if (snake?.alive && this.status !== MATCH_STATUS.ENDED) snake.queueTurn(turn);
    }

    handlePower(request) {
        if (this.status !== MATCH_STATUS.PLAYING) return { ok: false, error: "La partie n'a pas commencé." };
        const result = this.god.use(request, this.now, this.phase.id);
        if (result.ok) this.events.push({ ...result.event, power: request.power });
        return result;
    }

    // Avance la simulation de `dtMs`. Renvoie les événements du tick (pour les effets visuels).
    tick(dtMs) {
        this.events = [];
        if (this.status === MATCH_STATUS.COUNTDOWN) {
            this.countdownLeft -= dtMs;
            if (this.countdownLeft <= 0) this.status = MATCH_STATUS.PLAYING;
            return this.events;
        }
        if (this.status !== MATCH_STATUS.PLAYING) return this.events;

        const previousPhase = this.phase.id;
        this.now += dtMs;
        this.tickCount++;
        if (this.phase.id !== previousPhase) this.events.push({ type: "phase", phase: this.phase.id });

        this.god.regenerate(dtMs, this.phase.energyPerSec);
        if (this.godAI && this.isAi("god")) this.godAI.update(new Navigation(this));
        this.#updateWalls();
        this.#updateWorld();
        this.#moveSnakes();
        this.food.refill(this.snakes.filter((s) => s.alive).map((s) => s.head));
        this.#checkEnd();
        return this.events;
    }

    #updateWalls() {
        for (const ev of this.walls.update(this.now)) {
            if (ev.type === "expire") {
                this.events.push({ type: "wallExpired", cells: ev.wall.cells });
                continue;
            }
            // Le mur rotatif écrase tout sur son passage.
            this.events.push({ type: "wallRotated", wallId: ev.wall.id, cells: ev.cells });
            const crushed = new Set(ev.cells.map(key));
            for (const c of ev.cells) this.traps.remove(c);
            this.food.removeAt(ev.cells);
            for (const s of this.snakes) {
                if (s.alive && s.body.some((c) => crushed.has(key(c)))) this.#hitSnake(s, "crushed", true);
            }
        }
    }

    // Fruits spéciaux, zones dangereuses et événements du monde.
    #updateWorld() {
        this.food.update(this.now);
        for (const z of this.zones.update(this.now)) {
            this.events.push({ type: "zoneActive", kind: z.kind, cells: z.cells });
        }
        if (!this.worldEventsEnabled) return;
        const ev = this.worldEvents.update(this.now);
        if (ev) this.events.push({ type: "worldEvent", event: ev.type, cells: ev.cells });
    }

    #moveSnakes() {
        const alive = this.snakes.filter((s) => s.alive);
        const aiSnakes = alive.filter((s) => this.isAi(s.id));
        if (aiSnakes.length) {
            const nav = new Navigation(this);
            for (const s of aiSnakes) this.snakeAIs.get(s.id).decide(nav);
        }
        for (const s of alive) s.applyQueuedTurn();

        // Occupation des corps au prochain tick : la queue d'un Snake qui ne grandit pas se libère.
        const occupancy = new Map();
        for (const s of alive) {
            if (s.health.isInvulnerable(this.now)) continue; // un Snake "fantôme" ne bloque personne
            const cells = s.willGrow() ? s.body : s.body.slice(0, -1);
            for (const c of cells) occupancy.set(key(c), (occupancy.get(key(c)) ?? 0) + 1);
        }

        const plans = alive.map((s) => ({ snake: s, next: s.nextHead(), hit: null }));
        for (const p of plans) {
            const k = key(p.next);
            const ghost = p.snake.health.isInvulnerable(this.now);
            if (!this.grid.inBounds(p.next)) p.hit = { cause: "boundary", byGod: false };
            else if (this.walls.isWall(k)) {
                const wall = this.walls.walls.get(this.walls.cellIndex.get(k));
                p.hit = { cause: "wall", byGod: wall.kind !== "pillar" };
            } else if (!ghost && occupancy.has(k)) p.hit = { cause: "snake", byGod: false };
        }
        // Collision frontale : deux têtes sur la même case.
        for (const a of plans) {
            for (const b of plans) {
                if (a === b || a.hit) continue;
                const ghost = a.snake.health.isInvulnerable(this.now) || b.snake.health.isInvulnerable(this.now);
                if (!ghost && equals(a.next, b.next)) a.hit = { cause: "headOn", byGod: false };
            }
        }

        for (const p of plans) {
            const s = p.snake;
            if (p.hit) {
                this.#hitSnake(s, p.hit.cause, p.hit.byGod);
                continue;
            }
            s.advance(p.next);
            if (!s.health.isInvulnerable(this.now) && this.traps.trigger(s.head)) {
                s.trapsTriggered++;
                this.events.push({ type: "trapTriggered", cells: [s.head], snake: s.id });
                this.#damage(s, "trap", true);
            }
            if (s.alive && !s.health.isInvulnerable(this.now) && this.zones.activeAt(key(s.head), this.now)) {
                this.#damage(s, "zone", true);
            }
            const eaten = s.alive ? this.food.eat(s.head) : null;
            if (eaten) {
                const tierBefore = evolutionFor(s.length + s.growth.pending).tier;
                const golden = eaten === "golden";
                s.growth.feed(golden ? WORLD_EVENTS.goldenFruit.growth : 1);
                this.scores.onFoodEaten(s, golden ? WORLD_EVENTS.goldenFruit.points : undefined);
                this.events.push({ type: "foodEaten", cells: [s.head], snake: s.id, golden });
                const tier = evolutionFor(s.length + s.growth.pending);
                if (tier.tier > tierBefore) this.events.push({ type: "evolved", snake: s.id, tier: tier.tier, name: tier.name, cells: [s.head] });
            }
        }
    }

    // Choc qui bloque le Snake : dégât (si pas invulnérable) puis réapparition ailleurs.
    #hitSnake(snake, cause, byGod) {
        this.#damage(snake, cause, byGod);
        if (snake.alive) this.#respawn(snake);
    }

    #damage(snake, cause, byGod) {
        const cell = snake.head;
        if (!snake.health.damage(this.now)) return;
        this.events.push({ type: "damage", cells: [cell], snake: snake.id, cause });
        this.scores.onSnakeDamaged(snake, byGod);
        if (snake.health.dead) {
            snake.eliminate(this.now);
            this.scores.onSnakeEliminated(snake, byGod);
            this.events.push({ type: "eliminated", cells: [cell], snake: snake.id });
        }
    }

    // Réapparition loin des autres têtes, face à la plus longue ligne libre.
    #respawn(snake) {
        const length = snake.body.length;
        snake.body = []; // libère ses propres cellules pendant la recherche
        const others = this.snakes.filter((s) => s !== snake && s.alive).map((s) => s.head);
        let best = null;
        for (let i = 0; i < 60; i++) {
            const cell = this.grid.findFreeCell((c) => others.every((h) => chebyshev(c, h) >= 3));
            if (!cell) break;
            for (const dir of DIRECTIONS) {
                const run = this.#freeRun(cell, dir);
                if (!best || run > best.run) best = { cell, dir, run };
            }
            if (best.run >= 4) break;
        }
        const cell = best?.cell ?? this.grid.findFreeCell() ?? [0, 0, 0];
        const dir = best?.dir ?? [1, 0, 0];
        snake.spawn(cell, dir, perpendicular(dir), length);
        this.events.push({ type: "respawn", cells: [cell], snake: snake.id });
    }

    #freeRun(cell, dir) {
        let run = 0;
        let c = add(cell, dir);
        while (run < this.size && this.grid.isFree(c)) {
            run++;
            c = add(c, dir);
        }
        return run;
    }

    #checkEnd() {
        if (this.snakes.length > 0 && this.snakes.every((s) => !s.alive)) return this.#end("god");
        if (this.now >= this.matchMs) return this.#end(this.snakes.some((s) => s.alive) ? "snakes" : "god");
    }

    #end(winner) {
        this.status = MATCH_STATUS.ENDED;
        this.summary = this.scores.finalize({
            snakes: this.snakes,
            winner,
            durationMs: this.now,
            trapsTriggered: this.traps.triggered,
            godName: this.godName,
        });
        this.summary.god.powersUsed = { ...this.god.used };
        this.summary.worldEvents = this.worldEvents.history;
        this.events.push({ type: "end", winner });
    }

    // Information exclusive du Snake God : prochain événement et prochaines apparitions.
    godIntel() {
        if (!this.snakes) return null;
        return {
            nextEvent: this.worldEventsEnabled ? this.worldEvents.intel(this.now) : null,
            upcomingFood: this.food.upcoming,
        };
    }

    snapshot() {
        if (!this.snakes) return null;
        const phase = this.phase;
        return {
            status: this.status,
            tick: this.tickCount,
            tickMs: phase.tickMs,
            phase: phase.id,
            phaseName: phase.name,
            timeLeftMs: this.timeLeftMs,
            elapsedMs: this.now,
            countdownMs: Math.max(0, this.countdownLeft),
            size: this.size,
            snakes: this.snakes.map((s) => ({ ...s.snapshot(this.now), ai: this.isAi(s.id) })),
            walls: this.walls.snapshot(),
            traps: this.traps.snapshot(),
            food: this.food.items(),
            zones: this.zones.snapshot(this.now),
            god: { name: this.godName, ai: this.isAi("god"), score: this.scores.god.score, ...this.god.snapshot(this.now, phase.id) },
            events: this.events,
        };
    }
}

function perpendicular(dir) {
    const candidate = dir[1] === 0 ? AXES.y : AXES.x;
    return cross(cross(dir, candidate), dir);
}
