import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { worldPieces } from "./assets.js";
import { CUBE_GAP } from "./coords.js";
import { glowTexture, moonTexture, runeRingTexture } from "./textures.js";

// Île de blender/build_island.py : socle prévu pour le plus grand cube, entouré
// d'une bande d'herbe de MARGIN cases où poussent les décors.
const MARGIN = 2.4;
const ISLAND_GRID = 13; // taille pour laquelle blender/build_island.py dessine l'île
const MAX_TILES = 29 * 29; // le plus grand terrain WORLD
const PROPS = ["TreeTeal", "Pine", "Bush", "TreePink", "Rock", "Lantern", "Crate", "Bush"];
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

// Courbe « ease-out » forte (cubic-bezier(0.23, 1, 0.32, 1) approchée) : réponse immédiate.
const easeOut = (t) => 1 - Math.pow(1 - t, 4);
// Hachage stable : même arène, même décor.
const hash = (a, b) => {
    const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return s - Math.floor(s);
};

// Décor de Blender ramené vers un gris violacé (une seule fois : les clones partagent les matériaux),
// pour que l'île reste un fond et ne concurrence ni les Snakes ni l'interface.
const MUTE = 0.45;
function mutePalette(pieces) {
    const seen = new Set();
    const grey = new THREE.Color();
    for (const [name, piece] of Object.entries(pieces)) {
        if (name === "Trap") continue; // danger : lisible avant tout
        piece.traverse?.((o) => {
            for (const m of [o.material].flat()) {
                // Les parties lumineuses (veines, lanternes, mines) gardent leur couleur : elles signalent.
                if (!m?.color || seen.has(m) || m.emissive?.getHex()) continue;
                seen.add(m);
                const l = m.color.r * 0.2126 + m.color.g * 0.7152 + m.color.b * 0.0722;
                m.color.lerp(grey.setRGB(l * 0.92, l * 0.86, l * 1.08), MUTE).multiplyScalar(0.9);
            }
        });
    }
}

// Couleur dominante du monde à chaque phase : la tension se lit dans la lumière.
export const PHASE_COLORS = {
    1: new THREE.Color(0x9d6bff),
    2: new THREE.Color(0xe07bff),
    3: new THREE.Color(0xff9a3c),
    4: new THREE.Color(0xff4d4d),
};

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// Ciel : dégradé, nébuleuse et étoiles calculés dans le shader.
const SKY_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uTint;
varying vec3 vDir;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
float noise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float n = mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                  mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
    return n;
}
float fbm(vec3 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.1; a *= 0.5; } return v; }
void main() {
    vec3 d = normalize(vDir);
    float h = d.y * 0.5 + 0.5;
    // Nuit violette profonde, plus claire en haut.
    vec3 col = mix(vec3(0.016, 0.01, 0.032), vec3(0.075, 0.05, 0.15), smoothstep(0.3, 1.0, h));
    float neb = fbm(d * 2.4 + vec3(uTime * 0.01, 0.0, 0.0));
    float neb2 = fbm(d * 4.0 - vec3(0.0, uTime * 0.008, 0.0));
    col += uTint * pow(neb, 3.0) * 0.22;
    col += vec3(0.42, 0.3, 0.75) * pow(neb2, 4.0) * 0.18;
    // Ligne d'horizon fine : repère d'instrument.
    col += vec3(0.06, 0.04, 0.11) * exp(-abs(d.y) * 18.0);
    vec3 sp = floor(d * 380.0);
    float star = step(0.9984, hash(sp));
    float tw = 0.6 + 0.4 * sin(uTime * 2.0 + hash(sp + 3.0) * 30.0);
    col += vec3(0.93, 0.9, 1.0) * star * tw * 0.85;
    gl_FragColor = vec4(col, 1.0);
}`;

// Décor autour du cube : ciel, socle runique, poussières flottantes, lumières.
export class Environment {
    constructor(scene, size) {
        this.scene = scene;
        this.size = size;
        this.tint = PHASE_COLORS[1].clone();
        this.targetTint = this.tint.clone();

        this.sky = new THREE.Mesh(
            new THREE.SphereGeometry(90, 32, 16),
            new THREE.ShaderMaterial({
                vertexShader: SKY_VERT,
                fragmentShader: SKY_FRAG,
                side: THREE.BackSide,
                depthWrite: false,
                fog: false,
                uniforms: { uTime: { value: 0 }, uTint: { value: this.tint } },
            })
        );
        scene.add(this.sky);

        const base = -size / 2 - 0.9;
        this.platform = new THREE.Group();
        this.platform.position.y = base;
        const disc = new THREE.Mesh(
            new THREE.CylinderGeometry(size * 0.95, size * 1.05, 0.5, 64),
            new THREE.MeshStandardMaterial({ color: 0x130f1c, metalness: 0.6, roughness: 0.35 })
        );
        disc.receiveShadow = true;
        this.platform.add(disc);
        this.runes = new THREE.Mesh(
            new THREE.CircleGeometry(size * 0.92, 64),
            new THREE.MeshBasicMaterial({
                map: runeRingTexture(),
                color: this.tint,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            })
        );
        this.runes.rotation.x = -Math.PI / 2;
        this.runes.position.y = 0.26;
        this.platform.add(this.runes);
        scene.add(this.platform);

        // Lucioles autour du monde : chaudes près de l'île, froides au loin.
        const n = 500;
        const pos = new Float32Array(n * 3);
        const col = new Float32Array(n * 3);
        const warm = new THREE.Color(0xeee9ff);
        const cool = new THREE.Color(0x9d7bff);
        const c = new THREE.Color();
        for (let i = 0; i < n; i++) {
            const k = Math.random();
            const r = size * (0.8 + k * 2.2);
            const a = Math.random() * Math.PI * 2;
            pos.set([Math.cos(a) * r, (Math.random() - 0.4) * size * 2.2, Math.sin(a) * r], i * 3);
            c.copy(warm).lerp(cool, Math.min(1, k * 1.6));
            col.set([c.r, c.g, c.b], i * 3);
        }
        const dustGeo = new THREE.BufferGeometry();
        dustGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        dustGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
        this.dust = new THREE.Points(
            dustGeo,
            new THREE.PointsMaterial({
                size: 0.14,
                map: glowTexture(),
                vertexColors: true,
                transparent: true,
                opacity: 0.45,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            })
        );
        scene.add(this.dust);

        // Lune en croissant, loin derrière le monde.
        this.moon = new THREE.Group();
        const moonSprite = (map, opacity, scale) => {
            const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: 0xe6dcff, transparent: true, opacity, fog: false, depthWrite: false }));
            s.scale.setScalar(scale);
            return s;
        };
        this.moon.add(moonSprite(glowTexture(), 0.16, 22), moonSprite(moonTexture(), 1, 7));
        this.moon.position.set(-38, 30, -50);
        scene.add(this.moon);
        this.islets = [];

        scene.add(new THREE.HemisphereLight(0xcdbfff, 0x150d24, 1.05));
        this.key = new THREE.DirectionalLight(0xf6f0ff, 2.2);
        this.key.position.set(7, 15, 9);
        this.key.castShadow = true;
        this.key.shadow.mapSize.set(1024, 1024);
        Object.assign(this.key.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 60 });
        this.key.shadow.bias = -0.0008;
        scene.add(this.key);
        const rim = new THREE.DirectionalLight(0xa98bff, 1.2);
        rim.position.set(-10, 4, -12);
        scene.add(rim);
        // Lueur venue de sous le monde : la présence du Snake God.
        this.godLight = new THREE.PointLight(this.tint, 45, 30, 1.6);
        this.godLight.position.set(0, base - 1, 0);
        scene.add(this.godLight);

        scene.fog = new THREE.FogExp2(0x0b0814, 0.018);

        this.props = []; // décors posés autour du cube
        this.leaving = []; // décors de l'arène précédente, en train de partir
        this.#loadIsland();
    }

    // Charge l'île ; en attendant (ou si le fichier manque), le disque runique reste seul.
    async #loadIsland() {
        const pieces = await worldPieces;
        if (!pieces) return;
        mutePalette(pieces);

        this.island = pieces.Island;
        this.island.castShadow = false;
        this.platform.add(this.island);
        this.platform.children[0].visible = false; // ancien disque
        this.runes.position.y = 0.08; // gravé dans les dalles

        // Dalles : une par cellule du sol, toutes dans un seul InstancedMesh.
        const tile = pieces.Tile;
        this.tiles = new THREE.InstancedMesh(tile.geometry, tile.material, MAX_TILES);
        this.tiles.receiveShadow = true;
        this.tiles.count = 0;
        this.platform.add(this.tiles);
        this.tileCells = []; // { x, z, bornAt }

        // Lanterne : un halo chaud sur la lampe, que le bloom prolonge.
        const lantern = pieces.Lantern;
        const halo = new THREE.Sprite(
            new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffb347, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        halo.position.y = 1.74;
        halo.scale.setScalar(1.4);
        lantern.add(halo);

        // Îlots flottants au loin, chacun avec un arbre : le monde continue au-delà du cube.
        for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2 + hash(i, 1) * 0.5;
            const r = 24 + hash(i, 2) * 12;
            const islet = pieces.Islet.clone();
            islet.position.set(Math.cos(a) * r, -8 + hash(i, 3) * 14, Math.sin(a) * r);
            islet.scale.setScalar(0.9 + hash(i, 4) * 1.1);
            islet.rotation.y = hash(i, 5) * 6;
            const tree = pieces[["TreeTeal", "TreePink", "Pine"][i % 3]].clone();
            tree.scale.setScalar(0.8);
            islet.add(tree);
            islet.traverse((o) => (o.castShadow = false));
            islet.userData.baseY = islet.position.y;
            this.scene.add(islet);
            this.islets.push(islet);
        }

        this.templates = pieces;
        this.terraces = new THREE.Group();
        this.platform.add(this.terraces);
        this.layoutSize = null;
        this.#layout(this.arenaTarget ?? this.size, false);
    }

    // Place dalles et décors pour une arène de `n` cases. `animate` : les nouvelles dalles
    // montent du sol en vague depuis l'ancien bord, les décors repoussent un par un.
    #layout(n, animate) {
        if (!this.templates || n === this.layoutSize) return;
        const previous = this.layoutSize ?? 0;
        this.layoutSize = n;
        const now = performance.now();
        const motion = animate && !reducedMotion.matches;

        // Dalles : on garde celles de l'ancienne arène, on ajoute la couronne extérieure.
        const o = (n - 1) / 2;
        const oldHalf = (previous - 1) / 2;
        const cells = [];
        for (let x = 0; x < n; x++)
            for (let z = 0; z < n; z++) {
                const ring = Math.max(Math.abs(x - o), Math.abs(z - o));
                const kept = previous && ring <= oldHalf;
                const delay = motion && !kept ? (ring - oldHalf) * 70 + hash(x, z) * 60 : 0;
                cells.push({ x: x - o, z: z - o, bornAt: kept || !motion ? -Infinity : now + delay });
            }
        this.tileCells = cells;
        this.tiles.count = cells.length;
        this.#updateTiles(now);

        // Décors : les anciens partent vite, les nouveaux poussent avec un léger décalage.
        for (const p of this.props) p.leaveAt = now;
        this.leaving.push(...this.props);
        if (!motion) this.#flushLeaving();
        this.props = [];
        const edge = n / 2 + 1.15;
        const perSide = Math.max(3, Math.round((2 * edge) / 1.7));
        let i = 0;
        for (let side = 0; side < 4; side++) {
            for (let k = 0; k < perSide; k++) {
                const r = hash(side + n, k);
                if (r < 0.18) continue; // trous : le décor respire
                const t = -edge + ((k + 0.5) / perSide) * 2 * edge + (r - 0.5) * 0.5;
                const inward = (hash(k, side * 7 + n) - 0.5) * 0.8;
                const d = edge + inward;
                const [x, z] = [[t, -d], [d, t], [-t, d], [-d, -t]][side];
                const name = PROPS[Math.floor(hash(k * 3 + side, n) * PROPS.length)];
                const obj = this.templates[name].clone();
                obj.position.set(x, 0, z);
                obj.rotation.y = hash(x, z) * Math.PI * 2;
                obj.userData.size = 0.85 + hash(z, x) * 0.3;
                obj.userData.bornAt = motion ? now + 120 + i * 35 : -Infinity;
                obj.userData.flicker = hash(i, n) * 10;
                if (name === "Lantern") obj.children[0].material = obj.children[0].material.clone();
                this.platform.add(obj);
                this.props.push(obj);
                i++;
            }
        }
        this.#updateProps(now);
        this.#buildTerraces(n);
    }

    // WORLD : terrasses de pierre et d'herbe aux quatre coins du terrain (relief),
    // chacune couronnée d'un arbre. Hors du terrain de jeu : purement décoratives.
    #buildTerraces(n) {
        this.terraces.clear();
        if (this.mapKind !== "world") return;
        this.terraceMats ??= {
            grass: new THREE.MeshStandardMaterial({ color: 0x2d5a42, roughness: 0.9 }),
            stone: new THREE.MeshStandardMaterial({ color: 0x4c4560, roughness: 0.85 }),
        };
        const d = n / 2 + 1.6;
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz], i) => {
            const levels = 2 + (i % 2);
            for (let l = 0; l < levels; l++) {
                const w = 3.2 - l * 0.9;
                const step = new THREE.Mesh(new RoundedBoxGeometry(w, 0.9, w, 2, 0.15), this.terraceMats.stone);
                step.position.set(sx * (d + 0.4 - l * 0.25), 0.45 + l * 0.9, sz * (d + 0.4 - l * 0.25));
                const top = new THREE.Mesh(new RoundedBoxGeometry(w + 0.08, 0.2, w + 0.08, 2, 0.08), this.terraceMats.grass);
                top.position.copy(step.position).add(new THREE.Vector3(0, 0.5, 0));
                step.castShadow = step.receiveShadow = top.receiveShadow = true;
                this.terraces.add(step, top);
            }
            const tree = this.templates[["TreeTeal", "Pine", "TreePink", "Pine"][i]].clone();
            tree.position.set(sx * (d + 0.4 - (levels - 1) * 0.25), levels * 0.9 + 0.1, sz * (d + 0.4 - (levels - 1) * 0.25));
            this.terraces.add(tree);
        });
    }

    // Map de la partie. CUBE : l'île flotte sous le cube. WORLD : l'île est le terrain,
    // ses dalles sont les cases jouables. `floorY` : hauteur du sol (dessus des dalles).
    setMap(kind, floorY) {
        this.mapKind = kind;
        this.flatFloor = floorY;
        this.runes.visible = kind !== "world";
        const r = kind === "world" ? 19 : 11;
        Object.assign(this.key.shadow.camera, { left: -r, right: r, top: r, bottom: -r, far: 80 });
        this.key.shadow.camera.updateProjectionMatrix();
        this.layoutSize = null;
        if (this.arenaTarget) this.#layout(this.arenaTarget, false);
    }

    #flushLeaving() {
        for (const p of this.leaving) this.platform.remove(p);
        this.leaving = [];
    }

    #updateTiles(now) {
        if (!this.tiles) return;
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const p = new THREE.Vector3();
        const s = new THREE.Vector3(1, 1, 1);
        const up = new THREE.Vector3(0, 1, 0);
        let busy = false;
        this.tileCells.forEach((c, i) => {
            // 420 ms, montée depuis l'herbe : la dalle naît du sol, jamais de nulle part.
            const t = Math.min(1, Math.max(0, (now - c.bornAt) / 420));
            if (t < 1) busy = true;
            const k = easeOut(t);
            p.set(c.x, -0.35 * (1 - k) + (hash(c.x, c.z) - 0.5) * 0.03, c.z);
            q.setFromAxisAngle(up, (hash(c.z, c.x) - 0.5) * 0.06);
            s.setScalar(0.9 + 0.1 * k);
            this.tiles.setMatrixAt(i, m.compose(p, q, s));
        });
        this.tiles.instanceMatrix.needsUpdate = true;
        this.tilesBusy = busy;
    }

    #updateProps(now) {
        for (const p of this.props) {
            // Entrée : 380 ms ease-out, depuis 60 % de la taille (pas depuis zéro).
            const t = Math.min(1, Math.max(0, (now - p.userData.bornAt) / 380));
            p.visible = t > 0;
            p.scale.setScalar(p.userData.size * (0.6 + 0.4 * easeOut(t)));
        }
        // Sortie plus rapide que l'entrée : 160 ms.
        this.leaving = this.leaving.filter((p) => {
            const t = Math.min(1, (now - p.leaveAt) / 160);
            p.scale.setScalar(p.userData.size * (1 - 0.4 * t));
            p.position.y = -0.3 * t * t;
            if (t < 1) return true;
            this.platform.remove(p);
            return false;
        });
    }

    // Le socle suit la taille de l'arène (animé dans update).
    setArena(size) {
        const grew = this.arenaTarget != null && size > this.arenaTarget;
        this.arenaTarget = size;
        this.#layout(size, grew);
    }

    setPhase(phase) {
        this.targetTint.copy(PHASE_COLORS[phase] ?? PHASE_COLORS[1]);
    }

    setShadows(on, mapSize = 1024) {
        this.key.castShadow = on;
        if (this.key.shadow.mapSize.x === mapSize) return;
        this.key.shadow.mapSize.set(mapSize, mapSize);
        this.key.shadow.map?.dispose(); // recréée à la bonne taille au prochain rendu
        this.key.shadow.map = null;
    }

    // Reflets : un ciel miniature (dégradé violet + panneaux aux positions des lumières)
    // précalculé en env map. Sans lui, métal, cristaux et or ne reflètent que du noir.
    buildReflections(renderer) {
        const env = new THREE.Scene();
        const geo = new THREE.SphereGeometry(10, 32, 16);
        const top = new THREE.Color(0x4a3580), bottom = new THREE.Color(0x07050d);
        const pos = geo.attributes.position;
        const col = new Float32Array(pos.count * 3);
        const c = new THREE.Color();
        for (let i = 0; i < pos.count; i++) {
            c.lerpColors(bottom, top, THREE.MathUtils.smoothstep(pos.getY(i) / 10, -0.4, 0.8)).toArray(col, i * 3);
        }
        geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
        env.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
        // Panneaux lumineux : couleur > 1 = lumière HDR, d'où des reflets nets sur les matériaux brillants.
        const panel = (color, power, x, y, z, w, h) => {
            const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power) }));
            m.position.set(x, y, z).setLength(9);
            m.lookAt(0, 0, 0);
            env.add(m);
        };
        panel(0xf6f0ff, 6, 7, 15, 9, 5, 3); // lumière principale
        panel(0xa98bff, 4, -10, 4, -12, 7, 2); // contre-jour
        panel(0xffb347, 2, 12, 1, -6, 3, 1.5); // reflet chaud des lanternes
        panel(0x7a3cff, 3, 0, -10, 0, 8, 8); // lueur du Snake God par-dessous
        const pmrem = new THREE.PMREMGenerator(renderer);
        this.scene.environment = pmrem.fromScene(env, 0.03).texture;
        this.scene.environmentIntensity = 0.55;
        pmrem.dispose();
        env.traverse((o) => (o.geometry?.dispose(), o.material?.dispose()));
    }

    update(time, dt) {
        this.tint.lerp(this.targetTint, 1 - Math.exp(-dt * 1.5));
        if (this.arenaTarget) {
            this.arenaSize ??= this.size;
            this.arenaSize += (this.arenaTarget - this.arenaSize) * (1 - Math.exp(-dt * 3));
            const k = this.arenaSize / ISLAND_GRID;
            this.platform.children[0].scale.set(k, 1, k);
            this.runes.scale.setScalar(this.island ? k * 0.62 : k);
            // CUBE : l'île flotte sous le cube, assez bas pour qu'on joue sur la face du dessous.
            // WORLD : le dessus des dalles est le sol du terrain.
            const floor =
                this.mapKind === "world" ? this.flatFloor : -this.arenaSize / 2 - (this.mapKind === "volume" ? 0.06 : CUBE_GAP);
            this.platform.position.y = floor - 0.06;
            this.godLight.position.y = this.platform.position.y - 1;
            if (this.island) {
                const w = (this.arenaSize / 2 + MARGIN) / (ISLAND_GRID / 2 + MARGIN);
                this.island.scale.set(w, 1, w);
            }
        }
        if (this.island) {
            const now = performance.now();
            if (this.tilesBusy) this.#updateTiles(now);
            this.#updateProps(now);
            for (const p of this.props) {
                if (p.name !== "Lantern") continue;
                const halo = p.children[0];
                halo.material.opacity = 0.5 + 0.08 * Math.sin(time / 260 + p.userData.flicker);
            }
        }
        this.sky.material.uniforms.uTime.value = time / 1000;
        this.runes.rotation.z += dt * 0.05;
        this.dust.rotation.y += dt * 0.015;
        // Îlots : lente houle, chacun à son rythme (décoratif, jamais dans le champ de jeu).
        this.islets.forEach((islet, i) => {
            islet.position.y = islet.userData.baseY + Math.sin(time / 2200 + i * 1.7) * 0.35;
        });
        this.godLight.color.copy(this.tint);
        this.runes.material.color.copy(this.tint);
        this.godLight.intensity = 32 + Math.sin(time / 700) * 8;
    }
}
