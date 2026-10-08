import { MAPS } from "../config.js";
import { CubeWorld } from "./CubeWorld.js";
import { FlatWorld } from "./FlatWorld.js";
import { VolumeWorld } from "./VolumeWorld.js";

export { CubeWorld, FlatWorld, VolumeWorld };

// Crée la topologie d'une map ("cube", "volume" ou "world"). `arenaSize` : taille de départ.
// Côté client, `createMap(state.map.kind, state.map.arenaSize)` reconstruit la même topologie.
export function createMap(kind, arenaSize) {
    const cfg = MAPS[kind] ?? MAPS.cube;
    const size = arenaSize ?? cfg.sizes[0];
    if (kind === "world") return new FlatWorld(cfg.space, size);
    if (kind === "volume") return new VolumeWorld(cfg.space, size);
    return new CubeWorld(cfg.space, size);
}
