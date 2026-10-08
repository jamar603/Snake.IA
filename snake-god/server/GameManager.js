import {
    COUNTDOWN_SECONDS,
    DEFAULT_MAP,
    FOOD_COUNT,
    MAPS,
    MATCH_SECONDS,
    PHASES,
    SKILLS,
    UNLIMITED,
    UPCOMING_FOOD_PREVIEW,
    WORLD_EVENTS,
} from "../shared/config.js";
import { DEFAULT_COSMETICS, evolutionFor, sanitizeCosmetics } from "../shared/cosmetics.js";
import { AXES, chebyshev, equals, key, neg } from "../shared/grid.js";
import { MATCH_STATUS } from "../shared/protocol.js";
import { GodAI } from "./ai/GodAI.js";
import { Navigation } from "./ai/Navigation.js";
import { SnakeAI } from "./ai/SnakeAI.js";
import { DynamicWorldManager } from "./DynamicWorldManager.js";
import { FoodSystem } from "./FoodSystem.js";
import { GodPowerSystem } from "./GodPowerSystem.js";
import { MapManager } from "./MapManager.js";
import { ScoreManager } from "./ScoreManager.js";
import { SnakeController } from "./SnakeController.js";
import { TeleporterSystem } from "./TeleporterSystem.js";
import { TrapSystem } from "./TrapSystem.js";
import { WallSystem } from "./WallSystem.js";
import { WorldEventSystem } from "./WorldEventSystem.js";
import { ZoneSystem } from "./ZoneSystem.js";

// Règles d'une partie : cycle de vie, tick de simulation, collisions, victoire.
// Ne connaît rien du réseau : MultiplayerManager l'appelle et diffuse snapshot().
export class GameManager {
    constructor({
        rng = Math.random,
        map = DEFAULT_MAP, // "cube" (mode principal) ou "world" (terrain plat)
        startSize = null, // taille de départ (sinon la première de la map)
        expansion = true,
        matchSeconds = MATCH_SECONDS,
        countdownSeconds = COUNTDOWN_SECONDS,
        worldEvents = true,
    } = {}) {
        this.rng = rng;
        this.worldEventsEnabled = worldEvents;
        this.startSize = startSize;
        this.setMap(map);
        this.expansionEnabled = expansion;
        this.setDuration(matchSeconds);
        this.countdownMs = countdownSeconds * 1000;
        this.status = MATCH_STATUS.LOBBY;
        this.summary = null;
    }

    // Map de la prochaine partie : "cube" ou "world".
    setMap(kind) {
        this.mapKind = MAPS[kind] ? kind : DEFAULT_MAP;
        const all = MAPS[this.mapKind].sizes;
        const start = this.startSize && all.includes(this.startSize) ? this.startSize : all[0];
        this.sizes = all.filter((s) => s >= start);
    }

    get mapConfig() {
        return MAPS[this.mapKind];
    }

    get size() {
        return this.grid?.space ?? this.mapConfig.space;
    }

    // Durée de la partie en secondes ; 0 (ou null) = illimitée.
    setDuration(seconds) {
        this.matchMs = seconds > 0 ? seconds * 1000 : Infinity;
    }

    get unlimited() {
        return !Number.isFinite(this.matchMs);
    }

    // Partie courte : le dieu se recharge plus vite pour avoir le temps d'agir
    // (x2 en 1 min 30, x1 en 3 min ou en illimité).
    get energyBoost() {
        return this.unlimited ? 1 : Math.min(2, Math.max(1, (UNLIMITED.pacingSeconds * 1000) / this.matchMs));
    }

    // Rythme des phases et des expansions : la durée de la partie, ou 3 min en illimité.
    get pacingMs() {
        return this.unlimited ? UNLIMITED.pacingSeconds * 1000 : this.matchMs;
    }

    // roster : { snake1?, snake2?, god? } avec pour chaque rôle un nom (humain)
    // ou { name, ai: true }. Un rôle absent n'existe pas dans la partie.
    startMatch(rawRoster) {
        const roster = {};
        for (const [role, v] of Object.entries(rawRoster)) {
            if (v) roster[role] = typeof v === "string" ? { name: v, ai: false } : v;
        }
        this.aiRoles = new Set(Object.keys(roster).filter((r) => roster[r].ai));
        this.grid = new MapManager(this.mapKind, this.rng, this.sizes[0]);
        this.expansion = new DynamicWorldManager(this.sizes, { enabled: this.expansionEnabled });
        this.walls = new WallSystem();
        this.traps = new TrapSystem();
        this.teleporters = new TeleporterSystem();
        this.food = new FoodSystem(this.grid, this.mapConfig.foodBySize[this.sizes[0]] ?? FOOD_COUNT, UPCOMING_FOOD_PREVIEW, this.rng);
        this.zones = new ZoneSystem();
        this.worldEvents = new WorldEventSystem({ grid: this.grid, food: this.food, zones: this.zones, rng: this.rng });
        this.scores = new ScoreManager();
        this.snakes = [];
        this.godName = roster.god?.name ?? null;
        this.now = 0; // temps de jeu écoulé (ms), hors compte à rebours
        this.countdownLeft = this.countdownMs;
        this.tickCount = 0;
        this.events = [];
        this.queued = []; // événements reçus entre deux ticks (pouvoirs, compétences)
        this.inTick = false;
        this.summary = null;

        this.grid.addOccupant((k) => this.walls.isWall(k));
        this.grid.addOccupant((k) => this.traps.has(k));
        this.grid.addOccupant((k) => this.food.has(k));
        this.grid.addOccupant((k) => this.teleporters.has(k));
        this.grid.addOccupant((k) => this.#snakeCells().has(k));

        // Départs éloignés (faces opposées du cube, coins opposés du terrain).
        const spawns = this.grid.map.spawnPoints();
        for (const id of ["snake1", "snake2"]) {
            if (!roster[id]) continue;
            const s = new SnakeController(id, roster[id].name, this.mapConfig.snakeHp);
            s.cosmetics = sanitizeCosmetics(roster[id].cosmetics, DEFAULT_COSMETICS[id]);
            s.spawn(spawns[id].cell, spawns[id].dir, spawns[id].up);
            this.snakes.push(s);
        }

        this.god = new GodPowerSystem({
            grid: this.grid,
            walls: this.walls,
            traps: this.traps,
            zones: this.zones,
            events: this.worldEvents,
            teleporters: this.teleporters,
            maxRotatingWalls: this.mapConfig.maxRotatingWalls,
            snakes: () => this.snakes,
            canExpand: () => this.expansionEnabled && !this.expansion.isMax && !this.expansion.pending,
            expand: (now) => this.#announceExpansion(this.expansion.force(now)),
        });

        this.snakeAIs = new Map(this.snakes.map((s) => [s.id, new SnakeAI(s, this.rng)]));
        this.godAI = roster.god ? new GodAI(this, this.rng) : null;

        this.#placePillars(this.mapConfig.pillarsBySize[this.sizes[0]] ?? 0);
        this.food.refill(this.snakes.map((s) => s.head));
        if (this.worldEventsEnabled) this.worldEvents.schedule(0);
        this.status = this.countdownMs > 0 ? MATCH_STATUS.COUNTDOWN : MATCH_STATUS.PLAYING;
    }

    // Obstacles fixes : cristaux (CUBE) ou rochers et ruines de 1 à 3 cases (WORLD).
    // `among` : seulement parmi ces cellules (les nouvelles zones d'une expansion).
    // Jamais à moins de 3 cases d'une tête, ni devant elle.
    #placePillars(count, among = null) {
        const heads = this.snakes.filter((s) => s.alive && s.body.length);
        const allowed = among && new Set(among.map(key));
        const safe = (c) =>
            this.grid.isFree(c) &&
            heads.every((s) => chebyshev(c, s.head) > 2 && !this.grid.map.ray(s.head, s.dir, 4).some((r) => key(r) === key(c))) &&
            (!allowed || allowed.has(key(c)));
        const placed = [];
        for (let i = 0; i < count; i++) {
            const base = this.grid.findFreeCell(safe, among ? 800 : 400);
            if (!base) break;
            let cells = [base];
            if (this.grid.kind === "volume") {
                // Colonne de cristal de 2 cases, comme dans la version classique.
                const top = [base[0], base[1] + 1, base[2]];
                if (safe(top)) cells.push(top);
            } else if (this.grid.kind === "world") {
                // Ruine : un petit mur couché sur le terrain.
                const axis = AXES[this.rng() < 0.5 ? "x" : "z"];
                const len = 1 + Math.floor(this.rng() * 3);
                for (let k = 1; k < len; k++) {
                    const next = this.grid.map.step(cells.at(-1), axis).cell;
                    if (!safe(next)) break;
                    cells.push(next);
                }
            }
            this.walls.addStatic(cells, { kind: "pillar" });
            placed.push(...cells);
        }
        return placed;
    }

    #announceExpansion(ev) {
        if (ev?.type === "start") {
            this.events.push({ type: "expansionStart", fromSize: ev.fromSize, toSize: ev.toSize, inMs: ev.inMs, reason: ev.reason });
        }
        return ev;
    }

    // Le monde grandit avec le temps, la taille des Snakes et sa densité.
    #updateExpansion() {
        const alive = this.snakes.filter((s) => s.alive);
        const totalLength = alive.reduce((n, s) => n + s.length, 0);
        const density = (this.walls.cellIndex.size + totalLength) / this.grid.volume;
        const ev = this.expansion.update(this.now, { progress: this.now / this.pacingMs, totalLength, density });
        if (!ev) return;
        if (ev.type === "start") return this.#announceExpansion(ev);
        // Tout glisse avec la surface (CUBE) ou le terrain s'étend (WORLD) : jamais sur un Snake.
        const fresh = this.expansion.apply(this, ev.toSize);
        this.food.count = this.mapConfig.foodBySize[ev.toSize] ?? this.food.count;
        const pillars = this.#placePillars(this.mapConfig.pillarsBySize[ev.toSize] ?? 0, fresh);
        this.events.push({ type: "expansionComplete", fromSize: ev.fromSize, toSize: ev.toSize, cells: pillars });
    }

    get phase() {
        const progress = this.now / this.pacingMs;
        let current = PHASES[0];
        for (const p of PHASES) if (progress >= p.from) current = p;
        return current;
    }

    get tickMs() {
        return this.phase.tickMs;
    }

    get timeLeftMs() {
        return this.unlimited ? null : Math.max(0, this.matchMs - this.now);
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
        // Haut / bas : seulement dans le volume du Cube 3D.
        if ((turn === "up" || turn === "down") && this.grid?.kind !== "volume") return;
        if (snake?.alive && this.status !== MATCH_STATUS.ENDED) snake.queueTurn(turn);
    }

    handlePower(request) {
        if (this.status !== MATCH_STATUS.PLAYING) return { ok: false, error: "La partie n'a pas commencé." };
        const result = this.god.use(request, this.now, this.phase.id);
        if (result.ok) this.#emit({ ...result.event, power: request.power });
        return result;
    }

    // Compétence d'un Snake (Sprint, Bouclier, Phase). Renvoie true si elle part.
    handleSkill(role, id) {
        const snake = this.getSnake(role);
        if (this.status !== MATCH_STATUS.PLAYING || !snake?.alive || !SKILLS[id]) return false;
        if (!snake.skills.use(id, this.now)) return false;
        this.#emit({ type: "skillUsed", skill: id, snake: snake.id, cells: [snake.head] });
        return true;
    }

    // Hors tick (message d'un joueur), l'événement attend le prochain tick : sinon
    // il serait effacé avant d'être envoyé.
    #emit(event) {
        (this.inTick ? this.events : this.queued).push(event);
    }

    // Avance la simulation de `dtMs`. Renvoie les événements du tick (pour les effets visuels).
    tick(dtMs) {
        this.events = this.queued ?? [];
        this.queued = [];
        this.inTick = true;
        try {
            return this.#tick(dtMs);
        } finally {
            this.inTick = false;
        }
    }

    #tick(dtMs) {
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

        this.god.regenerate(dtMs, this.phase.energyPerSec * this.energyBoost);
        // La vue de navigation du dieu IA n'est construite que lorsqu'il va agir.
        if (this.godAI && this.isAi("god") && this.now >= this.godAI.nextActionAt) this.godAI.update(new Navigation(this));
        this.#updateWalls();
        this.#updateTeleporters();
        this.#updateWorld();
        this.#updateExpansion();
        this.#moveSnakes();
        this.food.refill(this.snakes.filter((s) => s.alive).map((s) => s.head));
        this.#checkEnd();
        return this.events;
    }

    #updateTeleporters() {
        const closed = this.teleporters.update(this.now);
        if (closed.length) this.events.push({ type: "teleporterClosed", cells: closed });
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
                if (s.alive && !this.#phasing(s) && s.body.some((c) => crushed.has(key(c)))) this.#hitSnake(s, "crushed", true);
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
        this.#step(alive);
        // Sprint : un second pas dans le même tick (virage en attente compris).
        const sprinting = this.snakes.filter((s) => s.alive && s.skills.isActive("sprint", this.now));
        const aiSprinting = sprinting.filter((s) => this.isAi(s.id));
        if (aiSprinting.length) {
            const nav = new Navigation(this);
            for (const s of aiSprinting) this.snakeAIs.get(s.id).decide(nav);
        }
        for (const s of sprinting) s.applyQueuedTurn();
        if (sprinting.length) this.#step(sprinting);
    }

    // Cases occupées par les corps, recalculées seulement quand un corps a changé.
    // Un corps change toujours par sa tête, sa queue, sa longueur ou un nouveau tableau
    // (avancée, téléporteur, réapparition, expansion) : comparer ces références suffit.
    // Avant : chaque requête d'occupation reconstruisait la clé de chaque segment
    // (jusqu'à 400 essais × 1 000 segments pour placer une nourriture).
    #snakeCells() {
        const sig = this.snakes.flatMap((s) => [s.body, s.body.length, s.body[0], s.body[s.body.length - 1]]);
        const cache = this.bodyCache;
        if (cache && cache.sig.length === sig.length && cache.sig.every((v, i) => v === sig[i])) return cache.cells;
        const cells = new Set();
        for (const sn of this.snakes) for (const c of sn.body) cells.add(key(c));
        this.bodyCache = { sig, cells };
        return cells;
    }

    // Phase : le Snake traverse murs, pièges et corps (pas les bords).
    #phasing(s) {
        return s.skills.isActive("phase", this.now);
    }

    // Un pas de déplacement pour `movers` (les autres Snakes restent des obstacles).
    #step(movers) {
        const alive = this.snakes.filter((s) => s.alive);
        // Occupation des corps au prochain tick : la queue d'un Snake qui ne grandit pas se libère.
        const occupancy = new Map();
        for (const s of alive) {
            if (s.health.isInvulnerable(this.now) || this.#phasing(s)) continue; // un Snake "fantôme" ne bloque personne
            const moving = movers.includes(s);
            const cells = !moving || s.willGrow() ? s.body : s.body.slice(0, -1);
            for (const c of cells) occupancy.set(key(c), (occupancy.get(key(c)) ?? 0) + 1);
        }

        // Prochaine case : la map gère le passage d'une face à l'autre (direction et normale).
        const plans = movers.filter((s) => s.alive).map((s) => {
            const move = this.grid.map.step(s.head, s.dir);
            return { snake: s, next: move.cell, move, hit: null };
        });
        for (const p of plans) {
            const k = key(p.next);
            const phasing = this.#phasing(p.snake);
            const ghost = p.snake.health.isInvulnerable(this.now) || phasing;
            if (!this.grid.inBounds(p.next)) p.hit = { cause: "boundary", byGod: false };
            else if (phasing) continue;
            else if (this.walls.isWall(k)) {
                const wall = this.walls.walls.get(this.walls.cellIndex.get(k));
                p.hit = { cause: "wall", byGod: wall.kind !== "pillar" };
            } else if (!ghost && occupancy.has(k)) p.hit = { cause: "snake", byGod: false };
        }
        // Collision frontale : deux têtes sur la même case.
        for (const a of plans) {
            for (const b of plans) {
                if (a === b || a.hit) continue;
                const ghost = [a.snake, b.snake].some((s) => s.health.isInvulnerable(this.now) || this.#phasing(s));
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
            s.dir = p.move.dir;
            s.up = p.move.normal ?? s.up; // Cube 3D : le Snake garde son propre « haut »
            this.#teleport(s);
            if (!s.health.isInvulnerable(this.now) && !this.#phasing(s) && this.traps.trigger(s.head)) {
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
                this.events.push({ type: "foodEaten", cells: [s.head], snake: s.id, golden, variant: this.food.lastVariant });
                // Le fruit doré soigne : +1 PV.
                if (golden && s.health.heal(WORLD_EVENTS.goldenFruit.heal)) this.events.push({ type: "healed", cells: [s.head], snake: s.id, hp: s.health.hp });
                const tier = evolutionFor(s.length + s.growth.pending);
                if (tier.tier > tierBefore) this.events.push({ type: "evolved", snake: s.id, tier: tier.tier, name: tier.name, cells: [s.head] });
            }
        }
    }

    // Portail : la tête ressort par l'autre bout, face à une voie libre si sa direction
    // ne colle pas à la face de sortie. Un portail dont la sortie est occupée ne marche pas.
    #teleport(s) {
        const entry = s.head;
        const exit = this.teleporters.exitFor(entry);
        if (!exit) return;
        const k = key(exit);
        if (this.walls.isWall(k) || this.#snakeCells().has(k)) return;
        const map = this.grid.map;
        s.body[0] = exit;
        if (map.kind !== "volume") {
            const normal = map.normalAt(exit);
            if (s.dir.some((v, i) => v * normal[i] !== 0)) s.dir = this.#bestDir(exit);
            s.up = normal;
        }
        this.events.push({ type: "teleported", cells: [entry, exit], snake: s.id });
    }

    // Direction tangente avec la plus longue voie libre depuis `cell`.
    #bestDir(cell) {
        let best = null;
        for (const a of this.grid.map.tangentAxes(cell)) {
            for (const d of [AXES[a], neg(AXES[a])]) {
                const run = this.grid.freeRun(cell, d);
                if (!best || run > best.run) best = { dir: d, run };
            }
        }
        return best.dir;
    }

    // Choc qui bloque le Snake : dégât (si pas invulnérable) puis réapparition ailleurs.
    #hitSnake(snake, cause, byGod) {
        this.#damage(snake, cause, byGod);
        if (snake.alive) this.#respawn(snake);
    }

    #damage(snake, cause, byGod) {
        const cell = snake.head;
        if (snake.health.isInvulnerable(this.now)) return;
        // Bouclier : encaisse le coup à la place des PV, puis courte invulnérabilité.
        if (snake.skills.isActive("shield", this.now)) {
            snake.skills.end("shield");
            snake.health.invulnerableUntil = this.now + 600;
            this.events.push({ type: "shieldBlocked", cells: [cell], snake: snake.id, cause });
            return;
        }
        if (!snake.health.damage(this.now)) return;
        this.events.push({ type: "damage", cells: [cell], snake: snake.id, cause, byGod: !!byGod });
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
            const dir = this.#bestDir(cell);
            const run = this.grid.freeRun(cell, dir);
            if (!best || run > best.run) best = { cell, dir, run };
            if (best.run >= 4) break;
        }
        const cell = best?.cell ?? this.grid.findFreeCell() ?? this.grid.randomCell();
        const dir = best?.dir ?? this.#bestDir(cell);
        const up = this.grid.kind === "volume" ? perpendicular(dir) : this.grid.map.normalAt(cell);
        snake.spawn(cell, dir, up, length);
        this.events.push({ type: "respawn", cells: [cell], snake: snake.id });
    }

    #checkEnd() {
        if (this.snakes.length > 0 && this.snakes.every((s) => !s.alive)) return this.#end("god");
        if (this.now >= this.matchMs) return this.#end(this.snakes.some((s) => s.alive) ? "snakes" : "god");
        // Illimité : les Snakes gagnent quand l'un d'eux atteint la longueur cible.
        if (this.unlimited && this.snakes.some((s) => s.alive && s.length >= UNLIMITED.winLength)) return this.#end("snakes");
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
            timeLeftMs: this.timeLeftMs, // null en partie illimitée
            durationMs: this.unlimited ? null : this.matchMs,
            winLength: this.unlimited ? UNLIMITED.winLength : null,
            elapsedMs: this.now,
            countdownMs: Math.max(0, this.countdownLeft),
            size: this.size, // espace de coordonnées de la map
            map: this.grid.describe(), // { kind, space, arenaSize } : le client recrée la topologie
            arena: this.grid.arena,
            expansion: this.expansion.snapshot(this.now),
            snakes: this.snakes.map((s) => ({ ...s.snapshot(this.now), ai: this.isAi(s.id) })),
            walls: this.walls.snapshot(),
            traps: this.traps.snapshot(),
            food: this.food.items(),
            zones: this.zones.snapshot(this.now),
            teleporters: this.teleporters.snapshot(this.now),
            god: { name: this.godName, ai: this.isAi("god"), score: this.scores.god.score, ...this.god.snapshot(this.now, phase.id) },
            events: this.events,
        };
    }
}

// Un « haut » perpendiculaire à dir (Cube 3D : orientation après une réapparition).
function perpendicular(dir) {
    return dir[1] === 0 ? [0, 1, 0] : [1, 0, 0];
}
