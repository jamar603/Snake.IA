import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { AXES, key, rotatingWallCells, rotatingWallOffsets } from "/shared/grid.js";
import { createMap } from "/shared/maps/index.js";
import { worldPieces } from "./assets.js";
import { CUBE_GAP, cellToWorld, vec } from "./coords.js";
import { PHASE_COLORS } from "./Environment.js";
import { circuitTextures, glowTexture, hazardTexture } from "./textures.js";

const QUARTER = Math.PI / 2;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const tmp = new THREE.Vector3();

// Partie visuelle de la map : CUBE (bloc plein, dalles sur les 6 faces, cadre de pierre)
// ou WORLD (bordure du terrain ; le sol est dessiné par Environment), puis murs, pièges,
// nourriture, zones, météores, téléporteurs et aperçus réservés au Snake God.
// Tout objet posé sur la map est orienté selon la normale de sa face.
export class WorldController {
    constructor(scene, size, map = createMap("cube", 7)) {
        this.scene = scene;
        this.size = size;
        this.map = map;
        this.root = new THREE.Group();
        scene.add(this.root);
        this.walls = new Map(); // id -> vue
        this.traps = new Map(); // cellKey -> groupe
        this.food = new Map(); // cellKey -> groupe
        this.zones = new Map(); // id -> vue
        this.portals = new Map(); // id -> vue
        this.blocked = new Set();
        this.foodKeys = new Set();
        this.frameColor = PHASE_COLORS[1].clone();
        this.#buildMaterials();
        this.setArena(map.arena.size);
        this.#buildIntel();
        // Pièces de Blender dès qu'elles sont chargées (cadre de pierre, dalles, mines).
        worldPieces.then((pieces) => {
            if (!pieces?.FrameBeam) return;
            this.pieces = pieces;
            pieces.FrameBeam.traverse((o) => {
                if (o.material?.name === "FrameGlow") this.frameGlowMat = o.material;
            });
            // Veines discrètes : le bloom suffit à les faire briller sans éblouir.
            if (this.frameGlowMat) this.frameGlowMat.emissiveIntensity = 0.6;
            pieces.FrameCorner.traverse((o) => {
                if (o.material?.name === "FrameGlow") o.material = this.frameGlowMat;
            });
            this.#rebuildFrame();
        });
    }

    #buildMaterials() {
        const circuit = circuitTextures("#e07bff");
        this.mats = {
            crystal: new THREE.MeshStandardMaterial({
                color: 0x7f6fb0,
                emissive: 0x1c1433,
                emissiveIntensity: 0.8,
                roughness: 0.12,
                metalness: 0.1,
                transparent: true,
                opacity: 0.88,
                flatShading: true,
            }),
            crystalCore: new THREE.MeshBasicMaterial({ color: 0xd9c8ff }),
            ruin: new THREE.MeshStandardMaterial({ color: 0x6f6880, roughness: 0.85 }),
            moss: new THREE.MeshStandardMaterial({ color: 0x2d5a42, roughness: 0.9 }),
            blade: new THREE.MeshStandardMaterial({ color: 0x22102c, emissive: 0xe07bff, emissiveIntensity: 1.2, metalness: 0.7, roughness: 0.25 }),
            pivot: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf0b8ff, emissiveIntensity: 2 }),
            mine: new THREE.MeshStandardMaterial({ color: 0x2b0710, metalness: 0.8, roughness: 0.3, emissive: 0x40000a }),
            mineCore: new THREE.MeshStandardMaterial({ color: 0xff2a4a, emissive: 0xff1030, emissiveIntensity: 2.2 }),
            fruit: new THREE.MeshStandardMaterial({ color: 0x8dff5a, emissive: 0x3dff2a, emissiveIntensity: 0.9, roughness: 0.25 }),
            golden: new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0xffa31a, emissiveIntensity: 1.4, metalness: 0.8, roughness: 0.2 }),
            leaf: new THREE.MeshStandardMaterial({ color: 0x2fbf5a, emissive: 0x0b4d1e, side: THREE.DoubleSide }),
            circuit,
        };
        this.geo = {
            cell: new RoundedBoxGeometry(0.94, 0.94, 0.94, 3, 0.1),
            ruin: new RoundedBoxGeometry(0.92, 1.1, 0.92, 2, 0.12),
            fruit: new THREE.SphereGeometry(0.24, 24, 16),
            leaf: new THREE.ConeGeometry(0.08, 0.22, 4),
            mineBody: new THREE.IcosahedronGeometry(0.2, 0),
            mineSpike: new THREE.ConeGeometry(0.05, 0.22, 6),
            mineCore: new THREE.SphereGeometry(0.1, 12, 8),
            portalRing: new THREE.TorusGeometry(0.4, 0.06, 10, 40),
            portalDisc: new THREE.CircleGeometry(0.38, 32),
        };
        this.glowMat = (color, opacity = 0.6) =>
            new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
    }

    // ---------- Map ----------
    // Nouvelle map (début de partie, retour au menu) : topologie et espace de coordonnées.
    setMap(map, size) {
        this.map = map;
        this.size = size;
        this.arenaSize = null;
        this.setArena(map.arena.size);
    }

    #rebuildFrame() {
        const scale = this.frame?.scale.x ?? 1;
        this.#buildFrame(this.arenaSize);
        this.frame.scale.setScalar(scale);
    }

    // Centre du monde : le cube est centré sur l'origine ; le terrain plat est en bas.
    get center() {
        return this.map.kind === "world" ? new THREE.Vector3(0, this.floorY, 0) : new THREE.Vector3();
    }

    #buildFrame(n) {
        if (this.frame) this.root.remove(this.frame);
        const frame = new THREE.Group();
        this.frame = frame;
        this.root.add(frame);
        this.cornerSprites = [];
        this.edgeMat ??= new THREE.MeshBasicMaterial({ color: this.frameColor });
        if (this.map.kind === "world") this.#buildBorder(frame, n);
        else this.#buildCube(frame, n, this.map.kind === "volume");
    }

    // CUBE : cube de verre (le Snake God voit les Snakes sur toutes les faces, même derrière),
    // grille lumineuse sur chaque face pour lire les cases, un point par case, arêtes de pierre.
    // CUBE 3D (`volume`) : la version classique, sans bloc ; un point par cellule du volume
    // pour lire la profondeur, et un sol vitré.
    #buildCube(frame, n, volume = false) {
        const half = n / 2;
        this.glassMat ??= new THREE.MeshStandardMaterial({
            color: 0x150f22,
            metalness: 0.6,
            roughness: 0.25,
            transparent: true,
            opacity: 0.22,
            depthWrite: false,
        });
        if (volume) {
            const floor = new THREE.Mesh(new THREE.PlaneGeometry(n, n), this.glassMat);
            floor.rotation.x = -Math.PI / 2;
            floor.position.y = -half - 0.01;
            floor.receiveShadow = true;
            frame.add(floor);
        } else {
            const glass = new THREE.Mesh(new THREE.BoxGeometry(n - 0.02, n - 0.02, n - 0.02), this.glassMat);
            glass.renderOrder = -1; // dessiné avant les objets transparents posés dessus
            frame.add(glass);
        }

        // Grille sur les 6 faces (lignes entre les cases).
        const pts = [];
        for (let i = 0; i <= n; i++) {
            const t = -half + i;
            for (const s of [-half, half]) {
                pts.push(t, -half, s, t, half, s, -half, t, s, half, t, s);
                pts.push(s, t, -half, s, t, half, s, -half, t, s, half, t);
                pts.push(t, s, -half, t, s, half, -half, s, t, half, s, t);
            }
        }
        const gridGeo = new THREE.BufferGeometry();
        gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
        this.gridMat ??= new THREE.LineBasicMaterial({ color: 0xb9a6ff, transparent: true, opacity: 0.24, depthWrite: false });
        frame.add(new THREE.LineSegments(gridGeo, this.gridMat));

        // Un point lumineux au centre de chaque case jouable, posé sur sa face.
        const dots = [];
        const p = new THREE.Vector3();
        for (const c of this.map.cells()) {
            cellToWorld(c, this.size, p);
            if (!volume) p.addScaledVector(vec(this.map.normalAt(c)), -0.48);
            dots.push(p.x, p.y, p.z);
        }
        const dotGeo = new THREE.BufferGeometry();
        dotGeo.setAttribute("position", new THREE.Float32BufferAttribute(dots, 3));
        this.dotMat ??= new THREE.PointsMaterial({ color: 0xd2c4ff, size: 0.08, map: glowTexture(), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
        frame.add(new THREE.Points(dotGeo, this.dotMat));

        const stone = this.pieces;
        const corners = [-half, half];
        const edge = () => {
            if (!stone) return new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, n, 8), this.edgeMat);
            const beam = stone.FrameBeam.clone();
            beam.scale.set(1, n - 0.3, 1);
            return beam;
        };
        for (const a of corners) {
            for (const b of corners) {
                const ex = edge();
                ex.rotation.z = Math.PI / 2;
                ex.position.set(0, a, b);
                const ey = edge();
                ey.position.set(a, 0, b);
                const ez = edge();
                ez.rotation.x = Math.PI / 2;
                ez.position.set(a, b, 0);
                frame.add(ex, ey, ez);
            }
        }
        for (const x of corners)
            for (const y of corners)
                for (const z of corners) {
                    const node = stone ? stone.FrameCorner.clone() : new THREE.Mesh(new THREE.OctahedronGeometry(0.16), this.edgeMat);
                    node.position.set(x, y, z);
                    const glow = new THREE.Sprite(this.glowMat(this.frameColor, 0.38));
                    glow.position.copy(node.position);
                    this.cornerSprites.push(glow);
                    frame.add(node, glow);
                }
    }

    // WORLD : murets de pierre tout autour du terrain (le sol est l'île d'Environment).
    #buildBorder(frame, n) {
        const half = n / 2;
        const y = this.floorY + 0.12;
        const stone = this.pieces;
        const wall = (length) => {
            if (!stone) return new THREE.Mesh(new THREE.BoxGeometry(0.16, length, 0.16), this.edgeMat);
            const beam = stone.FrameBeam.clone();
            beam.scale.set(1.6, length, 1.6);
            return beam;
        };
        for (const s of [-half, half]) {
            const a = wall(n);
            a.rotation.z = Math.PI / 2;
            a.position.set(0, y, s);
            const b = wall(n);
            b.rotation.x = Math.PI / 2;
            b.position.set(s, y, 0);
            frame.add(a, b);
        }
        for (const x of [-half, half])
            for (const z of [-half, half]) {
                const node = stone ? stone.FrameCorner.clone() : new THREE.Mesh(new THREE.OctahedronGeometry(0.16), this.edgeMat);
                node.position.set(x, y + 0.1, z);
                node.scale.setScalar(1.4);
                const glow = new THREE.Sprite(this.glowMat(this.frameColor, 0.38));
                glow.position.copy(node.position);
                this.cornerSprites.push(glow);
                frame.add(node, glow);
            }
    }

    // ---------- Expansion du monde ----------
    // Hauteur du sol : le terrain plat, ou le dessus de l'île sous le cube.
    get floorY() {
        if (this.map.kind === "world") return cellToWorld([0, this.map.layer, 0], this.size).y - 0.5;
        if (this.map.kind === "volume") return -this.arenaSize / 2;
        return -this.arenaSize / 2 - CUBE_GAP;
    }

    // Change la taille de l'arène. Animée : le cadre part de l'ancienne taille.
    setArena(size, animate = false) {
        if (size === this.arenaSize && this.frame) return;
        const previous = this.arenaSize ?? size;
        this.map.setArenaSize(size);
        this.arenaSize = size;
        this.#buildFrame(size);
        this.frameAnim = animate ? { from: previous / size, t: 0 } : null;
        if (this.map.kind === "world") this.frameAnim = null; // le terrain s'étend sur place
        this.frame.scale.setScalar(this.frameAnim ? previous / size : 1);
        this.#endConstruction();
    }

    // Annonce : contour fantôme à la future taille, qui pulse jusqu'à l'expansion.
    startExpansion(fromSize, toSize, durationMs) {
        this.#endConstruction(true);
        const flat = this.map.kind === "world";
        const geo = flat ? new THREE.BoxGeometry(toSize, 0.05, toSize) : new THREE.BoxGeometry(toSize, toSize, toSize);
        const ghost = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }));
        if (flat) ghost.position.y = this.floorY + 0.1;
        const group = new THREE.Group();
        group.add(ghost);
        this.root.add(group);
        this.construction = { group, ghost, t: 0, duration: durationMs / 1000, fading: false };
    }

    #endConstruction(now = false) {
        const c = this.construction;
        if (!c) return;
        if (now) {
            this.root.remove(c.group);
            this.construction = null;
            return;
        }
        c.fading = true;
        c.fade = 1;
    }

    #updateConstruction(dt, time) {
        const c = this.construction;
        if (!c) return;
        if (c.fading) {
            c.fade -= dt * 1.4;
            c.ghost.material.opacity = Math.max(0, c.fade) * 0.4;
            if (c.fade <= 0) {
                this.root.remove(c.group);
                this.construction = null;
            }
            return;
        }
        c.t += dt / c.duration;
        // Le contour pulse de plus en plus vite à l'approche de l'expansion.
        c.ghost.material.opacity = 0.25 + 0.3 * Math.abs(Math.sin(time / (160 - Math.min(1, c.t) * 100)));
    }

    // Aperçus réservés au Snake God : prochaines nourritures et prochain événement.
    #buildIntel() {
        this.intelGroup = new THREE.Group();
        this.intelGroup.visible = false;
        this.root.add(this.intelGroup);
        this.intelMat = new THREE.MeshBasicMaterial({ color: 0xd9c2ff, transparent: true, opacity: 0.35, wireframe: true, depthWrite: false });
        this.intelEventMat = new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.5, wireframe: true, depthWrite: false });
        this.intelMeteorMat = new THREE.MeshBasicMaterial({ color: 0xff5a3d, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
        this.intelKey = "";
    }

    setPhase(phase) {
        this.frameTarget = PHASE_COLORS[phase] ?? PHASE_COLORS[1];
    }

    applyState(state, time) {
        this.arena = state.arena;
        if (state.arena && state.arena.size !== this.arenaSize) this.setArena(state.arena.size, state.arena.size > this.arenaSize);
        this.#syncWalls(state.walls, time);
        this.#syncCells(this.traps, state.traps.map((c) => ({ cell: c, kind: "trap" })), (it) => this.#createTrap(it), time);
        this.#syncCells(this.food, state.food, (it) => this.#createFood(it), time);
        this.foodKeys = new Set(state.food.map((f) => key(f.cell)));
        this.#syncZones(state.zones ?? [], time);
        this.#syncPortals(state.teleporters ?? [], time);
        this.#syncIntel(state.intel);
        this.elapsedMs = state.elapsedMs;
        this.stateTime = time;
    }

    #normal(cell) {
        return vec(this.map.normalAt(cell));
    }

    // ---------- Murs ----------
    #syncWalls(walls, time) {
        const seen = new Set();
        this.blocked.clear();
        for (const w of walls) {
            const id = `${w.id}:${key(w.cells[0])}`; // une expansion du cube déplace les murs : on les recrée
            seen.add(id);
            for (const c of w.cells) this.blocked.add(key(c));
            let view = this.walls.get(id);
            if (!view) {
                view = this.#createWall(w, time);
                this.walls.set(id, view);
            }
            view.data = w;
            if (w.kind === "rotating") {
                view.targetQuat.setFromAxisAngle(vec(AXES[w.axis]), w.turns * QUARTER);
                if (view.sweepTurns !== w.turns) this.#placeSweep(view, w);
            }
        }
        for (const [id, view] of this.walls) {
            if (seen.has(id)) continue;
            this.#removeWall(view);
            this.walls.delete(id);
        }
    }

    #removeWall(view) {
        this.root.remove(view.group);
        if (view.rod) this.root.remove(view.rod);
        if (view.sweep) this.root.remove(view.sweep);
    }

    #createWall(w, time) {
        const group = new THREE.Group();
        const view = { group, targetQuat: new THREE.Quaternion(), bornAt: time, data: w, materials: [] };

        if (w.kind === "rotating") {
            // Lame d'énergie couchée sur la face, qui pivote autour d'un axe visible.
            cellToWorld(w.pivot, this.size, group.position);
            const offsets = rotatingWallOffsets(w.axis, w.arm);
            const dir = vec(offsets.at(-1)).normalize();
            const axisVec = vec(AXES[w.axis]);
            const len = offsets.length - 0.08;
            const thick = new THREE.Vector3().crossVectors(axisVec, dir);
            const basis = new THREE.Matrix4().makeBasis(dir, thick, axisVec);
            const blade = new THREE.Mesh(new RoundedBoxGeometry(len, 0.6, 0.86, 3, 0.14), this.mats.blade);
            blade.quaternion.setFromRotationMatrix(basis);
            blade.castShadow = true;
            const edgeGlow = new THREE.Mesh(new THREE.BoxGeometry(len + 0.04, 0.08, 0.9), new THREE.MeshBasicMaterial({ color: 0xe07bff }));
            edgeGlow.quaternion.copy(blade.quaternion);
            const pivot = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 14), this.mats.pivot);
            group.add(blade, edgeGlow, pivot);
            // Axe de rotation : il sort de la face, comme un clou.
            const rod = new THREE.Group();
            const normal = this.#normal(w.pivot);
            const rodMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 8), new THREE.MeshBasicMaterial({ color: 0xe6dcff }));
            rodMesh.quaternion.setFromUnitVectors(Y_AXIS, normal);
            rodMesh.position.copy(normal).multiplyScalar(0.2);
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 8, 40), new THREE.MeshBasicMaterial({ color: 0xe07bff }));
            ring.quaternion.setFromUnitVectors(Z_AXIS, normal);
            ring.position.copy(normal).multiplyScalar(0.55);
            rod.add(rodMesh, ring);
            rod.position.copy(group.position);
            view.rod = rod;
            view.ring = ring;
            this.root.add(rod);
            view.targetQuat.setFromAxisAngle(axisVec, w.turns * QUARTER);
            group.quaternion.copy(view.targetQuat);
            view.sweepMat = new THREE.MeshBasicMaterial({ color: 0xff4d4d, map: hazardTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
            view.sweep = new THREE.Group();
            this.root.add(view.sweep);
        } else if (w.kind === "pillar") {
            // Obstacle fixe : cristal planté dans la face (CUBE), ruine moussue (WORLD).
            const center = new THREE.Vector3();
            for (const c of w.cells) center.add(cellToWorld(c, this.size));
            group.position.copy(center.divideScalar(w.cells.length));
            for (const c of w.cells) {
                const normal = this.#normal(c);
                const base = cellToWorld(c, this.size).sub(group.position).addScaledVector(normal, -0.5);
                const q = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, normal);
                if (this.map.kind === "world") {
                    const stone = new THREE.Mesh(this.geo.ruin, this.mats.ruin);
                    stone.position.copy(base).addScaledVector(normal, 0.55);
                    stone.rotation.y = (c[0] * 7 + c[2] * 3) % 4 * 0.08;
                    const moss = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.12, 0.94), this.mats.moss);
                    moss.position.copy(base).addScaledVector(normal, 1.12);
                    stone.castShadow = stone.receiveShadow = true;
                    group.add(stone, moss);
                } else {
                    const crystal = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.95, 6), this.mats.crystal);
                    crystal.quaternion.copy(q);
                    crystal.position.copy(base).addScaledVector(normal, 0.48);
                    crystal.castShadow = true;
                    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.32, 6), this.mats.crystal);
                    tip.quaternion.copy(q);
                    tip.position.copy(base).addScaledVector(normal, 1.11);
                    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 6), this.mats.crystalCore);
                    core.quaternion.copy(q);
                    core.position.copy(crystal.position);
                    group.add(crystal, tip, core);
                }
            }
        } else {
            // Monolithe d'obsidienne parcouru de circuits (mur du dieu).
            const mat = new THREE.MeshStandardMaterial({
                map: this.mats.circuit.map,
                emissiveMap: this.mats.circuit.emissiveMap,
                emissive: 0xffffff,
                emissiveIntensity: 1.2,
                metalness: 0.5,
                roughness: 0.3,
                transparent: true,
            });
            view.materials.push(mat);
            const center = new THREE.Vector3();
            for (const c of w.cells) center.add(cellToWorld(c, this.size));
            group.position.copy(center.divideScalar(w.cells.length));
            for (const c of w.cells) {
                const m = new THREE.Mesh(this.geo.cell, mat);
                cellToWorld(c, this.size, m.position).sub(group.position);
                m.castShadow = m.receiveShadow = true;
                group.add(m);
            }
        }
        group.scale.setScalar(0.6);
        this.root.add(group);
        return view;
    }

    // Cases que balaiera le prochain quart de tour (hors cases déjà occupées par la lame).
    #placeSweep(view, w) {
        view.sweepTurns = w.turns;
        view.sweep.clear();
        const now = new Set(w.cells.map(key));
        for (const c of rotatingWallCells(w.pivot, w.axis, w.arm, w.turns + 1)) {
            if (now.has(key(c))) continue;
            const m = new THREE.Mesh((this.sweepGeo ??= new THREE.BoxGeometry(0.9, 0.9, 0.9)), view.sweepMat);
            cellToWorld(c, this.size, m.position);
            view.sweep.add(m);
        }
    }

    // ---------- Pièges et nourriture ----------
    #createTrap() {
        if (this.pieces?.Trap) return this.#createStoneTrap();
        const g = new THREE.Group();
        g.add(new THREE.Mesh(this.geo.mineBody, this.mats.mine));
        const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 1, 1], [-1, -1, 1], [1, -1, -1], [-1, 1, -1]];
        for (const d of dirs) {
            const s = new THREE.Mesh(this.geo.mineSpike, this.mats.mine);
            const v = vec(d).normalize();
            s.quaternion.setFromUnitVectors(Y_AXIS, v);
            s.position.copy(v.multiplyScalar(0.22));
            g.add(s);
        }
        const core = new THREE.Mesh(this.geo.mineCore, this.mats.mineCore);
        const glow = new THREE.Sprite(this.glowMat(0xff2040, 0.55));
        glow.scale.setScalar(1.1);
        g.add(core, glow);
        g.userData.glow = glow;
        return g;
    }

    // Mine runique (Blender) : rune rouge propre à chaque piège pour réagir à la proximité.
    #createStoneTrap() {
        const g = new THREE.Group();
        const mine = this.pieces.Trap.clone();
        let rune = null;
        mine.traverse((o) => {
            if (o.material?.name === "TrapGlow") {
                o.material = o.material.clone();
                rune = o.material;
            }
        });
        const glow = new THREE.Sprite(this.glowMat(0xff2040, 0.45));
        glow.scale.setScalar(1.1);
        g.add(mine, glow);
        g.userData.glow = glow;
        g.userData.mine = mine;
        g.userData.rune = rune;
        return g;
    }

    // Le Snake du joueur : les pièges proches s'éveillent (lisibilité du danger).
    setFocus(position) {
        this.focus = position;
    }

    // Piège déclenché : on le retire tout de suite (l'explosion prend le relais).
    triggerTrap(cell) {
        const k = key(cell) + "trap";
        const g = this.traps.get(k);
        if (!g) return;
        this.root.remove(g);
        this.traps.delete(k);
    }

    #createFood(item) {
        const golden = item.kind === "golden";
        const g = new THREE.Group();
        const fruit = new THREE.Mesh(this.geo.fruit, golden ? this.mats.golden : this.mats.fruit);
        fruit.scale.set(1, 0.92, 1);
        fruit.castShadow = true;
        const leaf = new THREE.Mesh(this.geo.leaf, this.mats.leaf);
        leaf.position.set(0.06, 0.25, 0);
        leaf.rotation.z = -0.6;
        leaf.scale.z = 0.3;
        const glow = new THREE.Sprite(this.glowMat(golden ? 0xffc23d : 0x7dff5a, golden ? 0.9 : 0.5));
        glow.scale.setScalar(golden ? 2 : 1.2);
        g.add(fruit, leaf, glow);
        if (golden) {
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.025, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffe08a }));
            g.add(ring);
            g.userData.ring = ring;
        }
        g.userData.golden = golden;
        return g;
    }

    #syncCells(map, items, create, time) {
        const seen = new Set();
        for (const it of items) {
            const k = key(it.cell) + (it.kind ?? "");
            seen.add(k);
            if (map.has(k)) continue;
            const obj = create(it);
            cellToWorld(it.cell, this.size, obj.position);
            obj.userData.base = obj.position.clone();
            obj.userData.normal = this.#normal(it.cell);
            obj.userData.bornAt = time;
            obj.userData.phase = Math.random() * Math.PI * 2;
            this.root.add(obj);
            map.set(k, obj);
        }
        for (const [k, obj] of map) {
            if (seen.has(k)) continue;
            this.root.remove(obj);
            map.delete(k);
        }
    }

    // ---------- Téléporteurs ----------
    // Deux portails par paire : anneau qui tourne et disque lumineux, couchés sur leur face.
    #syncPortals(pairs, time) {
        const seen = new Set();
        for (const p of pairs) {
            const id = `${p.id}:${key(p.a)}`;
            seen.add(id);
            let view = this.portals.get(id);
            if (!view) {
                view = this.#createPortalPair(p, time);
                this.portals.set(id, view);
            }
            view.data = p;
            view.stateTime = time;
        }
        for (const [id, view] of this.portals) {
            if (seen.has(id)) continue;
            this.root.remove(view.group);
            this.portals.delete(id);
        }
    }

    #createPortalPair(p, time) {
        const group = new THREE.Group();
        const hue = 0.5 + ((p.id * 0.13) % 0.25); // chaque paire a sa couleur (cyan -> violet)
        const color = new THREE.Color().setHSL(hue, 0.9, 0.6);
        const portals = [p.a, p.b].map((cell) => {
            const normal = this.#normal(cell);
            const portal = new THREE.Group();
            cellToWorld(cell, this.size, portal.position).addScaledVector(normal, -0.38);
            portal.quaternion.setFromUnitVectors(Z_AXIS, normal);
            const ring = new THREE.Mesh(this.geo.portalRing, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, metalness: 0.4, roughness: 0.3 }));
            const disc = new THREE.Mesh(
                this.geo.portalDisc,
                new THREE.MeshBasicMaterial({ map: glowTexture(), color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
            );
            disc.position.z = 0.02;
            const glow = new THREE.Sprite(this.glowMat(color, 0.5));
            glow.scale.setScalar(1.6);
            glow.position.z = 0.3;
            portal.add(ring, disc, glow);
            group.add(portal);
            return { portal, ring, disc };
        });
        this.root.add(group);
        return { group, portals, bornAt: time, data: p, stateTime: time };
    }

    // ---------- Zones dangereuses et météores ----------
    #syncZones(zones, time) {
        const seen = new Set();
        for (const z of zones) {
            const id = `${z.id}:${key(z.cells[0])}`;
            seen.add(id);
            let view = this.zones.get(id);
            if (!view) {
                view = this.#createZone(z, time);
                this.zones.set(id, view);
            }
            view.data = z;
            view.stateTime = time;
        }
        for (const [id, view] of this.zones) {
            if (seen.has(id)) continue;
            this.root.remove(view.group);
            this.zones.delete(id);
        }
    }

    #createZone(z, time) {
        const group = new THREE.Group();
        const meteor = z.kind === "meteor";
        const mat = new THREE.MeshBasicMaterial({
            color: meteor ? 0xff7a2e : 0xff2e4d,
            map: hazardTexture(),
            transparent: true,
            opacity: 0.3,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
        });
        const box = new THREE.BoxGeometry(0.98, 0.98, 0.98);
        for (const c of z.cells) {
            const m = new THREE.Mesh(box, mat);
            cellToWorld(c, this.size, m.position);
            group.add(m);
        }
        const view = { group, mat, data: z, stateTime: time, meteors: [] };
        if (meteor) {
            // Une météore tombe vers chaque case ciblée, depuis le ciel de sa face.
            for (const c of z.cells) {
                const target = cellToWorld(c, this.size);
                const normal = this.#normal(c);
                const rock = new THREE.Mesh(
                    new THREE.DodecahedronGeometry(0.28, 0),
                    new THREE.MeshStandardMaterial({ color: 0x3a1a0a, emissive: 0xff5a1a, emissiveIntensity: 1.6, flatShading: true })
                );
                const glow = new THREE.Sprite(this.glowMat(0xff7a2e, 0.9));
                glow.scale.setScalar(1.4);
                rock.add(glow);
                const drift = new THREE.Vector3().randomDirection().projectOnPlane(normal).multiplyScalar(3);
                const from = target.clone().addScaledVector(normal, 13).add(drift);
                rock.position.copy(from);
                group.add(rock);
                view.meteors.push({ rock, from, target });
            }
        }
        this.root.add(group);
        return view;
    }

    // ---------- Intel du dieu ----------
    #syncIntel(intel) {
        const keyStr = intel ? JSON.stringify([intel.upcomingFood, intel.nextEvent?.type, intel.nextEvent?.cells]) : "";
        this.intelGroup.visible = !!intel;
        if (keyStr === this.intelKey) return;
        this.intelKey = keyStr;
        this.intelGroup.clear();
        if (!intel) return;
        intel.upcomingFood.forEach((c, i) => {
            const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22 - i * 0.03, 1), this.intelMat);
            cellToWorld(c, this.size, m.position);
            this.intelGroup.add(m);
        });
        const ev = intel.nextEvent;
        if (!ev) return;
        for (const c of ev.cells) {
            let m;
            if (ev.type === "meteorShower") {
                m = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.42, 4), this.intelMeteorMat);
                m.quaternion.setFromUnitVectors(Z_AXIS, this.#normal(c));
            } else m = new THREE.Mesh(new THREE.OctahedronGeometry(ev.type === "goldenFruit" ? 0.35 : 0.2), this.intelEventMat);
            cellToWorld(c, this.size, m.position);
            this.intelGroup.add(m);
        }
    }

    // ---------- Requêtes ----------
    // Cases libres tout droit (en suivant les arêtes du cube).
    freeRun(head, dir, snakeCells, limit = 16) {
        let run = 0;
        let s = { cell: head, dir };
        while (run < limit) {
            s = this.map.step(s.cell, s.dir);
            const k = key(s.cell);
            if (!this.map.isCell(s.cell) || this.blocked.has(k) || snakeCells.has(k)) break;
            run++;
        }
        return run;
    }

    foodAhead(head, dir, range = 2) {
        return this.map.ray(head, dir, range).some((c) => this.foodKeys.has(key(c)));
    }

    // Vue Snake : un mur collé à la caméra devient translucide.
    setCameraFade(position) {
        this.fadeFrom = position;
    }

    // ---------- Animation ----------
    update(time, dt) {
        const gameNow = (this.elapsedMs ?? 0) + (time - (this.stateTime ?? time));
        if (this.frameTarget) this.frameColor.lerp(this.frameTarget, 1 - Math.exp(-dt * 2));
        if (this.frameAnim) {
            const f = this.frameAnim;
            f.t = Math.min(1, f.t + dt / 0.7);
            this.frame.scale.setScalar(f.from + (1 - f.from) * easeOutBack(f.t));
            if (f.t >= 1) this.frameAnim = null;
        }
        this.#updateConstruction(dt, time);
        this.edgeMat.color.copy(this.frameColor);
        this.frameGlowMat?.emissive.copy(this.frameColor);
        for (const s of this.cornerSprites) s.material.color.copy(this.frameColor);

        for (const view of this.walls.values()) {
            const g = view.group;
            // Apparition : 320 ms depuis 60 % avec un léger dépassement (jamais depuis zéro).
            const grow = Math.min(1, (time - view.bornAt) / 320);
            g.scale.setScalar(0.6 + 0.4 * easeOutBack(grow));
            if (view.data.kind === "rotating") {
                g.quaternion.rotateTowards(view.targetQuat, dt * 6);
                view.rod.scale.setScalar(0.6 + 0.4 * grow);
                view.ring.rotation.z += dt * 3;
                // 700 ms avant le quart de tour : les cases balayées s'allument de plus en plus vite.
                const left = view.data.nextRotateAt != null ? view.data.nextRotateAt - gameNow : Infinity;
                const warn = left < 700 ? 1 - Math.max(0, left) / 700 : 0;
                view.sweepMat.opacity = warn * (0.25 + 0.25 * Math.abs(Math.sin(time / (90 - warn * 50))));
            }
            const left = view.data.expiresAt != null ? view.data.expiresAt - gameNow : Infinity;
            let opacity = left < 3000 ? 0.4 + 0.45 * Math.abs(Math.sin(time / 110)) : 1;
            if (this.fadeFrom && view.materials.length) {
                let near = Infinity;
                for (const m of g.children) near = Math.min(near, m.getWorldPosition(tmp).distanceTo(this.fadeFrom));
                if (near < 2.6) opacity = Math.min(opacity, 0.15 + 0.85 * Math.max(0, (near - 1) / 1.6));
            }
            for (const mat of view.materials) {
                mat.opacity = opacity;
                mat.emissiveIntensity = 1 + 0.35 * Math.sin(time / 300 + view.data.id);
            }
        }
        for (const g of this.traps.values()) {
            const t = time / 1000 + g.userData.phase;
            // Éveil : 0 loin du Snake du joueur, 1 à une case. Le piège tourne plus vite,
            // grossit et sa rune brûle : on le voit venir.
            const dist = this.focus ? g.position.distanceTo(this.focus) : Infinity;
            const target = Math.max(0, Math.min(1, (3.5 - dist) / 2.5));
            g.userData.alert = (g.userData.alert ?? 0) + (target - (g.userData.alert ?? 0)) * Math.min(1, dt * 8);
            const alert = g.userData.alert;
            g.userData.spin = (g.userData.spin ?? 0) + dt * (0.8 + alert * 4);
            g.rotation.set(g.userData.spin * 0.6, g.userData.spin, 0);
            // Apparition : 200 ms ease-out depuis 70 % (jamais depuis zéro).
            const born = Math.min(1, (time - g.userData.bornAt) / 200);
            const enter = 0.7 + 0.3 * (1 - Math.pow(1 - born, 3));
            const beat = 1 + (0.05 + alert * 0.1) * Math.sin(t * (6 + alert * 10));
            g.scale.setScalar(enter * beat * (1 + alert * 0.15));
            g.userData.glow.material.opacity = 0.3 + 0.25 * (0.5 + 0.5 * Math.sin(t * 7)) + alert * 0.4;
            if (g.userData.rune) g.userData.rune.emissiveIntensity = 3 + alert * 6;
        }
        const spin = new THREE.Quaternion();
        for (const g of this.food.values()) {
            const t = time / 1000 + g.userData.phase;
            const n = g.userData.normal;
            // Le fruit flotte au-dessus de sa face et tourne autour de sa normale.
            g.position.copy(g.userData.base).addScaledVector(n, Math.sin(t * 2.6) * 0.07);
            g.quaternion.setFromUnitVectors(Y_AXIS, n).multiply(spin.setFromAxisAngle(Y_AXIS, t * 0.9));
            g.scale.setScalar(Math.min(1, (time - g.userData.bornAt) / 300) * (g.userData.golden ? 1.25 : 1));
            if (g.userData.ring) g.userData.ring.rotation.x = t * 2;
        }
        for (const view of this.portals.values()) {
            const left = view.data.endsInMs - (time - view.stateTime);
            // Ouverture : 300 ms ease-out depuis 50 % ; clignote dans ses 3 dernières secondes.
            const open = Math.min(1, (time - view.bornAt) / 300);
            const scale = 0.5 + 0.5 * (1 - Math.pow(1 - open, 3));
            const flicker = left < 3000 ? 0.45 + 0.55 * Math.abs(Math.sin(time / 120)) : 1;
            for (const p of view.portals) {
                p.ring.rotation.z += dt * 2.4;
                p.disc.rotation.z -= dt * 1.2;
                p.portal.scale.setScalar(scale * (1 + 0.05 * Math.sin(time / 200)));
                p.disc.material.opacity = 0.8 * flicker;
            }
        }
        for (const view of this.zones.values()) {
            const z = view.data;
            const activeIn = z.activeInMs - (time - view.stateTime);
            const active = activeIn <= 0;
            view.mat.opacity = active ? 0.55 + 0.2 * Math.sin(time / 50) : 0.15 + 0.2 * Math.abs(Math.sin(time / 120));
            for (const m of view.meteors) {
                const t = Math.min(1, Math.max(0, 1 - activeIn / 1500));
                m.rock.position.lerpVectors(m.from, m.target, t * t);
                m.rock.visible = !active;
                m.rock.rotation.x += dt * 5;
            }
        }
        if (this.intelGroup.visible) {
            this.intelGroup.children.forEach((m, i) => {
                if (m.geometry.type !== "RingGeometry") m.rotation.y = time / 900 + i;
                m.scale.setScalar(1 + 0.12 * Math.sin(time / 260 + i));
            });
        }
    }

    clear() {
        for (const view of this.walls.values()) this.#removeWall(view);
        for (const m of [...this.traps.values(), ...this.food.values()]) this.root.remove(m);
        for (const v of [...this.zones.values(), ...this.portals.values()]) this.root.remove(v.group);
        this.walls.clear();
        this.traps.clear();
        this.food.clear();
        this.zones.clear();
        this.portals.clear();
        this.blocked.clear();
        this.intelGroup.clear();
        this.intelKey = "";
        this.intelGroup.visible = false;
        this.#endConstruction(true);
    }
}

function easeOutBack(t) {
    const c = 1.7;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}
