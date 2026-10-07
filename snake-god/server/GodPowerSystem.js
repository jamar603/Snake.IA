import { GOD, POWERS } from "../shared/config.js";
import {
    chebyshev,
    dangerZoneCells,
    inBounds,
    key,
    rotatingWallCells,
    rotatingWallFits,
    straightWallCells,
} from "../shared/grid.js";

const VALID_AXES = ["x", "y", "z"];

// Ressource World Energy, cooldowns et exécution des pouvoirs du Snake God.
// `world` donne accès aux systèmes du monde : { grid, walls, traps, zones, events, snakes() }.
export class GodPowerSystem {
    constructor(world) {
        this.world = world;
        this.energy = GOD.startEnergy;
        this.readyAt = Object.fromEntries(Object.keys(POWERS).map((id) => [id, 0]));
        this.used = Object.fromEntries(Object.keys(POWERS).map((id) => [id, 0]));
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
        if (power.needsCell !== false && (!isCell(cell) || !inBounds(cell, this.world.grid.size)))
            return { ok: false, error: "Cellule hors du cube." };

        const handler = this.#handlers[powerId];
        const ax = VALID_AXES.includes(axis) ? axis : "y";
        const error = handler.validate.call(this, power, cell, ax);
        if (error) return { ok: false, error };

        this.energy -= power.cost;
        this.readyAt[powerId] = now + power.cooldownMs;
        this.used[powerId]++;
        const event = handler.execute.call(this, power, cell, ax, now);
        return { ok: true, event };
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
                return this.#checkCells(straightWallCells(cell, axis, power.length));
            },
            execute(power, cell, axis, now) {
                const cells = straightWallCells(cell, axis, power.length);
                this.world.walls.addStatic(cells, { kind: "wall", expiresAt: now + power.lifetimeMs });
                return { type: "wallPlaced", cells };
            },
        },
        rotatingWall: {
            validate(power, cell, axis) {
                if (this.world.walls.count("rotating") >= power.maxActive)
                    return "Trop de murs rotatifs actifs.";
                if (!rotatingWallFits(cell, axis, power.arm, this.world.grid.size))
                    return "Le mur rotatif doit pouvoir tourner dans le cube.";
                return this.#checkCells(rotatingWallCells(cell, axis, power.arm, 0));
            },
            execute(power, cell, axis, now) {
                const wall = this.world.walls.addRotating(cell, axis, power.arm, power.rotateEveryMs, now);
                return { type: "wallPlaced", cells: wall.cells };
            },
        },
        demolish: {
            validate(power, cell) {
                return this.world.walls.isWall(key(cell)) ? null : "Vise un mur ou un pilier.";
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
                const cells = dangerZoneCells(cell, axis, power.radius, this.world.grid.size);
                this.world.zones.add(cells, { kind: "danger", now, warnMs: power.warnMs, durationMs: power.durationMs });
                return { type: "zoneCreated", cells };
            },
        },
    };

    // Cellules libres et pas collées à une tête (pas de piège "impossible à éviter").
    #checkCells(cells) {
        const heads = this.world
            .snakes()
            .filter((s) => s.alive)
            .map((s) => s.head);
        for (const c of cells) {
            if (!inBounds(c, this.world.grid.size)) return "Hors du cube.";
            if (!this.world.grid.isFree(c)) return "Cellule occupée.";
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
