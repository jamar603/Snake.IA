import { GOD, POWERS } from "../shared/config.js";
import { chebyshev, dangerZoneCells, key, rotatingWallCells, rotatingWallFits, straightWallCells } from "../shared/grid.js";

const VALID_AXES = ["x", "y", "z"];

// Ressource World Energy, cooldowns et exécution des pouvoirs du Snake God.
// `world` : { grid, walls, traps, zones, events, teleporters, snakes(), expand(now) }.
// Toutes les formes (murs, lames, dalles) se posent sur la face de la case visée.
export class GodPowerSystem {
    constructor(world) {
        this.world = world;
        this.energy = GOD.startEnergy;
        this.readyAt = Object.fromEntries(Object.keys(POWERS).map((id) => [id, 0]));
        this.used = Object.fromEntries(Object.keys(POWERS).map((id) => [id, 0]));
    }

    get map() {
        return this.world.grid.map;
    }

    regenerate(dtMs, energyPerSec) {
        this.energy = Math.min(GOD.maxEnergy, this.energy + (energyPerSec * dtMs) / 1000);
    }

    isUnlocked(powerId, phase) {
        return POWERS[powerId].phase <= phase;
    }

    // Valide puis exécute un pouvoir. Renvoie { ok, error?, event? }.
    use(request, now, phase) {
        const { power: powerId, cell, axis } = request ?? {};
        const power = POWERS[powerId];
        if (!power) return { ok: false, error: "Pouvoir inconnu." };
        if (!this.isUnlocked(powerId, phase))
            return { ok: false, error: `${power.label} se débloque en phase ${power.phase}.` };
        if (now < this.readyAt[powerId]) return { ok: false, error: `${power.label} en recharge.` };
        if (this.energy < power.cost) return { ok: false, error: "World Energy insuffisante." };
        if (power.needsCell !== false && (!isCell(cell) || !this.map.isCell(cell)))
            return { ok: false, error: "Vise une case de la map." };

        const handler = this.#handlers[powerId];
        const ax = VALID_AXES.includes(axis) ? axis : null;
        const error = handler.validate.call(this, power, cell, ax, now);
        if (error) return { ok: false, error };

        this.energy -= power.cost;
        this.readyAt[powerId] = now + power.cooldownMs;
        this.used[powerId]++;
        const event = handler.execute.call(this, power, cell, ax, now);
        return { ok: true, event };
    }

    // Axe d'un mur : couché sur la face (axe tangent), sinon le premier axe tangent.
    #wallAxis(cell, axis) {
        const tangents = this.map.tangentAxes(cell);
        return tangents.includes(axis) ? axis : tangents[0];
    }

    // Axe d'une lame ou d'une dalle : la normale de la face, ou l'axe choisi dans le Cube 3D.
    #shapeAxis(cell, axis) {
        return this.map.kind === "volume" ? axis ?? "y" : this.map.normalAxis(cell);
    }

    #onFace(cell) {
        return (c) => this.map.isCell(c) && this.map.sameFace(c, cell);
    }

    #handlers = {
        trap: {
            validate(power, cell) {
                if (this.world.traps.count >= power.maxActive) return "Trop de pièges actifs.";
                return this.#checkCells([cell]);
            },
            execute(power, cell) {
                this.world.traps.place(cell);
                return { type: "trapPlaced", cells: [cell] };
            },
        },
        wall: {
            validate(power, cell, axis) {
                if (this.world.walls.count("wall") >= power.maxActive) return "Trop de murs actifs.";
                const cells = straightWallCells(cell, this.#wallAxis(cell, axis), power.length);
                if (!cells.every(this.#onFace(cell))) return "Le mur dépasse de la face.";
                return this.#checkCells(cells);
            },
            execute(power, cell, axis, now) {
                const cells = straightWallCells(cell, this.#wallAxis(cell, axis), power.length);
                this.world.walls.addStatic(cells, { kind: "wall", expiresAt: now + power.lifetimeMs });
                return { type: "wallPlaced", cells };
            },
        },
        rotatingWall: {
            validate(power, cell, ax) {
                const max = this.world.maxRotatingWalls ?? power.maxActive;
                if (this.world.walls.count("rotating") >= max) return "Trop de murs rotatifs actifs.";
                const axis = this.#shapeAxis(cell, ax);
                if (!rotatingWallFits(cell, axis, power.arm, this.#onFace(cell))) return "La lame doit pouvoir tourner sur la face.";
                return this.#checkCells(rotatingWallCells(cell, axis, power.arm, 0));
            },
            execute(power, cell, axis, now) {
                const wall = this.world.walls.addRotating(cell, this.#shapeAxis(cell, axis), power.arm, power.rotateEveryMs, now);
                return { type: "wallPlaced", cells: wall.cells };
            },
        },
        demolish: {
            validate(power, cell) {
                return this.world.walls.isWall(key(cell)) ? null : "Vise un mur ou un obstacle.";
            },
            execute(power, cell) {
                const walls = this.world.walls;
                const wall = walls.walls.get(walls.cellIndex.get(key(cell)));
                walls.remove(wall.id);
                return { type: "wallDemolished", cells: wall.cells };
            },
        },
        triggerEvent: {
            validate() {
                return this.world.events.next ? null : "Aucun événement en préparation.";
            },
            execute(power, cell, axis, now) {
                const ev = this.world.events.trigger(now);
                return { type: "worldEvent", event: ev.type, cells: ev.cells, forced: true };
            },
        },
        dangerZone: {
            validate(power) {
                if (this.world.zones.count("danger") >= power.maxActive) return "Trop de zones actives.";
                return null;
            },
            execute(power, cell, axis, now) {
                const cells = dangerZoneCells(cell, this.#shapeAxis(cell, axis), power.radius, this.#onFace(cell));
                this.world.zones.add(cells, { kind: "danger", now, warnMs: power.warnMs, durationMs: power.durationMs });
                return { type: "zoneCreated", cells };
            },
        },
        teleporter: {
            validate(power, cell) {
                if (this.world.teleporters.count >= power.maxActive) return "Trop de téléporteurs actifs.";
                const error = this.#checkCells([cell]);
                if (error) return error;
                return this.#teleporterExit(cell) ? null : "Pas de sortie sûre pour ce portail.";
            },
            execute(power, cell, axis, now) {
                const exit = this.#teleporterExit(cell);
                this.world.teleporters.add(cell, exit, now + power.lifetimeMs);
                return { type: "teleporterPlaced", cells: [cell, exit] };
            },
        },
        expand: {
            validate(power, cell, axis, now) {
                return this.world.canExpand() ? null : "Le monde est déjà à sa taille maximale (ou s'agrandit déjà).";
            },
            execute(power, cell, axis, now) {
                const ev = this.world.expand(now);
                return { type: "godExpand", cells: [], toSize: ev?.toSize };
            },
        },
    };

    // Sortie d'un téléporteur : case libre, loin de toutes les têtes, avec une voie libre
    // devant elle (on ne pose jamais un Snake face à un mur). Sur le cube : une autre face.
    #teleporterExit(entry) {
        const map = this.map;
        const heads = this.world.snakes().filter((s) => s.alive && s.body.length).map((s) => s.head);
        const grid = this.world.grid;
        const prev = this.cachedExit;
        if (prev && prev.entry === key(entry) && grid.isFree(prev.cell)) return prev.cell;
        const cell = grid.findFreeCell((c) => {
            if (chebyshev(c, entry) < 4 || heads.some((h) => chebyshev(h, c) < 4)) return false;
            if (map.kind === "cube" && map.sameFace(c, entry)) return false;
            return map.tangentAxes(c).some((a) => {
                const d = [0, 0, 0];
                d["xyz".indexOf(a)] = 1;
                return grid.freeRun(c, d, 3) >= 3 || grid.freeRun(c, d.map((v) => -v + 0), 3) >= 3;
            });
        });
        this.cachedExit = cell ? { entry: key(entry), cell } : null;
        return cell;
    }

    // Cellules libres et pas collées à une tête (pas de piège "impossible à éviter").
    #checkCells(cells) {
        const heads = this.world
            .snakes()
            .filter((s) => s.alive)
            .map((s) => s.head);
        for (const c of cells) {
            if (!this.map.isCell(c)) return "Hors de la map.";
            if (!this.world.grid.isFree(c) || this.world.teleporters.has(key(c))) return "Cellule occupée.";
            if (heads.some((h) => chebyshev(h, c) <= 1)) return "Trop près d'un Snake.";
        }
        return null;
    }

    snapshot(now, phase) {
        const powers = {};
        for (const [id, p] of Object.entries(POWERS)) {
            powers[id] = {
                unlocked: this.isUnlocked(id, phase),
                cooldownLeft: Math.max(0, this.readyAt[id] - now),
                cooldownMs: p.cooldownMs,
            };
        }
        return { energy: this.energy, maxEnergy: GOD.maxEnergy, powers };
    }
}

function isCell(c) {
    return Array.isArray(c) && c.length === 3 && c.every(Number.isInteger);
}
