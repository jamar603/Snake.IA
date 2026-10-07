import { key } from "../shared/grid.js";

// Zones dangereuses temporaires (pouvoir du dieu, impacts de météores).
// Phase d'avertissement (visible, sans danger), puis phase active (-1 PV).
export class ZoneSystem {
    constructor() {
        this.zones = new Map();
        this.nextId = 1;
    }

    count(kind) {
        let n = 0;
        for (const z of this.zones.values()) if (z.kind === kind) n++;
        return n;
    }

    add(cells, { kind, now, warnMs, durationMs }) {
        const zone = {
            id: this.nextId++,
            kind,
            cells,
            keys: new Set(cells.map(key)),
            activeAt: now + warnMs,
            endsAt: now + warnMs + durationMs,
        };
        this.zones.set(zone.id, zone);
        return zone;
    }

    // Retire les zones terminées. Renvoie les zones qui viennent de s'activer.
    update(now) {
        const activated = [];
        for (const z of [...this.zones.values()]) {
            if (now >= z.endsAt) this.zones.delete(z.id);
            else if (now >= z.activeAt && !z.announced) {
                z.announced = true;
                activated.push(z);
            }
        }
        return activated;
    }

    activeAt(cellKey, now) {
        for (const z of this.zones.values()) if (now >= z.activeAt && z.keys.has(cellKey)) return z;
        return null;
    }

    pendingOrActive(cellKey) {
        for (const z of this.zones.values()) if (z.keys.has(cellKey)) return z;
        return null;
    }

    snapshot(now) {
        return [...this.zones.values()].map((z) => ({
            id: z.id,
            kind: z.kind,
            cells: z.cells,
            active: now >= z.activeAt,
            activeInMs: Math.max(0, z.activeAt - now),
            endsInMs: Math.max(0, z.endsAt - now),
        }));
    }
}
