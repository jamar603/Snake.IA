import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { AXES, add, inBounds, key, rotatingWallCells, rotatingWallOffsets } from "/shared/grid.js";
import { cellToWorld, vec } from "./coords.js";
import { worldPieces } from "./assets.js";
import { PHASE_COLORS } from "./Environment.js";
import { circuitTextures, glowTexture, hazardTexture } from "./textures.js";

const QUARTER = Math.PI / 2;
const tmp = new THREE.Vector3();

// Partie visuelle du monde : cadre du cube, murs, pièges, nourriture, zones,
// météores et aperçus réservés au Snake God. Anime les transitions entre ticks.
export class WorldController {
    constructor(scene, size) {
        this.scene = scene;
        this.size = size;
        this.root = new THREE.Group();
        scene.add(this.root);
        this.walls = new Map(); // id -> vue
        this.traps = new Map(); // cellKey -> groupe
        this.food = new Map(); // cellKey -> groupe
        this.zones = new Map(); // id -> vue
        this.blocked = new Set();
        this.foodKeys = new Set();
        this.frameColor = PHASE_COLORS[1].clone();
        this.#buildMaterials();
        this.setArena(7);
        this.#buildIntel();
        // Cadre en pierre de Blender dès qu'il est chargé (sinon arêtes lumineuses simples).
        worldPieces.then((pieces) => {
            if (!pieces?.FrameBeam) return;
            this.pieces = pieces;
            pieces.FrameBeam.traverse((o) => {
                if (o.material?.name === "FrameGlow") this.frameGlowMat = o.material;
            });
            // Veines discrètes : le bloom suffit à les faire briller sans éblouir.
            if (this.frameGlowMat) this.frameGlowMat.emissiveIntensity = 0.7;
            pieces.FrameCorner.traverse((o) => {
                if (o.material?.name === "FrameGlow") o.material = this.frameGlowMat;
            });
            const scale = this.frame.scale.x;
            this.#buildFrame(this.arenaSize);
            this.frame.scale.setScalar(scale);
        });
    }

    #buildMaterials() {
        const circuit = circuitTextures("#c47dff");
        this.mats = {
            crystal: new THREE.MeshStandardMaterial({
                color: 0x6f86d8,
                emissive: 0x23307a,
                emissiveIntensity: 0.8,
                roughness: 0.12,
                metalness: 0.1,
                transparent: true,
                opacity: 0.88,
                flatShading: true,
            }),
            crystalCore: new THREE.MeshBasicMaterial({ color: 0x9fc0ff }),
            blade: new THREE.MeshStandardMaterial({ color: 0x2a0d3d, emissive: 0xff4fe0, emissiveIntensity: 1.1, metalness: 0.7, roughness: 0.25 }),
            pivot: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff6bf0, emissiveIntensity: 2 }),
            mine: new THREE.MeshStandardMaterial({ color: 0x2b0710, metalness: 0.8, roughness: 0.3, emissive: 0x40000a }),
            mineCore: new THREE.MeshStandardMaterial({ color: 0xff2a4a, emissive: 0xff1030, emissiveIntensity: 2.2 }),
            fruit: new THREE.MeshStandardMaterial({ color: 0x8dff5a, emissive: 0x3dff2a, emissiveIntensity: 0.9, roughness: 0.25 }),
            golden: new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0xffa31a, emissiveIntensity: 1.4, metalness: 0.8, roughness: 0.2 }),
            leaf: new THREE.MeshStandardMaterial({ color: 0x2fbf5a, emissive: 0x0b4d1e, side: THREE.DoubleSide }),
            circuit,
        };
        this.geo = {
            cell: new RoundedBoxGeometry(0.94, 0.94, 0.94, 3, 0.1),
            fruit: new THREE.SphereGeometry(0.24, 24, 16),
            leaf: new THREE.ConeGeometry(0.08, 0.22, 4),
            mineBody: new THREE.IcosahedronGeometry(0.2, 0),
            mineSpike: new THREE.ConeGeometry(0.05, 0.22, 6),
            mineCore: new THREE.SphereGeometry(0.1, 12, 8),
        };
        this.glowMat = (color, opacity = 0.6) =>
            new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
    }

    // Cadre de l'arène (arêtes, coins, grille des faces, points des cellules, sol).
    // Reconstruit à chaque expansion ; le groupe est ensuite animé vers sa nouvelle taille.
    #buildFrame(n) {
        if (this.frame) this.root.remove(this.frame);
        const frame = new THREE.Group();
        this.frame = frame;
        this.root.add(frame);
        const half = n / 2;
        this.edgeMat ??= new THREE.MeshBasicMaterial({ color: this.frameColor });
        const edgeGeo = new THREE.CylinderGeometry(0.035, 0.035, n, 8);
        const corners = [-half, half];
        const stone = this.pieces;
        // Arête : poutre de pierre (étirée entre deux coins) ou simple tube lumineux.
        const edge = () => {
            if (!stone) return new THREE.Mesh(edgeGeo, this.edgeMat);
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
        // Nœuds d'énergie aux coins.
        this.cornerSprites = [];
        for (const x of corners)
            for (const y of corners)
                for (const z of corners) {
                    const node = stone ? stone.FrameCorner.clone() : new THREE.Mesh(new THREE.OctahedronGeometry(0.16), this.edgeMat);
                    node.position.set(x, y, z);
                    const glow = new THREE.Sprite(this.glowMat(this.frameColor, stone ? 0.45 : 0.7));
                    glow.scale.setScalar(stone ? 1 : 1.3);
                    glow.position.copy(node.position);
                    this.cornerSprites.push(glow);
                    frame.add(node, glow);
                }

        // Grille légère sur les faces : repères de profondeur.
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
        this.gridMat ??= new THREE.LineBasicMaterial({ color: 0x6d7cff, transparent: true, opacity: 0.12, depthWrite: false });
        frame.add(new THREE.LineSegments(gridGeo, this.gridMat));

        // Un point par cellule : on lit la profondeur à l'intérieur du cube.
        const dots = [];
        const o = (n - 1) / 2;
        for (let x = 0; x < n; x++)
            for (let y = 0; y < n; y++)
                for (let z = 0; z < n; z++) dots.push(x - o, y - o, z - o);
        const dotGeo = new THREE.BufferGeometry();
        dotGeo.setAttribute("position", new THREE.Float32BufferAttribute(dots, 3));
        frame.add(
            new THREE.Points(
                dotGeo,
                new THREE.PointsMaterial({ color: 0x9fb0ff, size: 0.07, map: glowTexture(), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })
            )
        );

        // Sol vitré du cube (une seule face : invisible depuis dessous).
        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(n, n),
            new THREE.MeshStandardMaterial({ color: 0x10132a, metalness: 0.6, roughness: 0.25, transparent: true, opacity: 0.35 })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -half - 0.01;
        floor.receiveShadow = true;
        frame.add(floor);
    }

    // ---------- Expansion du monde ----------
    get floorY() {
        return -this.arenaSize / 2;
    }

    // Change la taille de l'arène. Animée : le cadre part de l'ancienne taille.
    setArena(size, animate = false) {
        if (size === this.arenaSize && this.frame) return;
        const previous = this.arenaSize ?? size;
        this.arenaSize = size;
        this.#buildFrame(size);
        this.frameAnim = animate ? { from: previous / size, t: 0 } : null;
        this.frame.scale.setScalar(animate ? previous / size : 1);
        this.#endConstruction();
    }

    // Annonce : cadre fantôme à la nouvelle taille et cellules qui se matérialisent.
    startExpansion(fromSize, toSize, durationMs) {
        this.#endConstruction(true);
        const group = new THREE.Group();
        const ghost = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxGeometry(toSize, toSize, toSize)),
            new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 })
        );
        group.add(ghost);
        // Une cellule lumineuse par nouvelle case de la couche extérieure.
        const cells = [];
        const half = (toSize - 1) / 2;
        const oldHalf = (fromSize - 1) / 2;
        for (let x = -half; x <= half; x++)
            for (let y = -half; y <= half; y++)
                for (let z = -half; z <= half; z++) {
                    if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) <= oldHalf) continue;
                    cells.push(new THREE.Vector3(x, y, z));
                }
        const mat = new THREE.MeshBasicMaterial({ color: 0xc9a6ff, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false });
        const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.86, 0.86, 0.86), mat, cells.length);
        mesh.frustumCulled = false;
        const zero = new THREE.Matrix4().makeScale(0, 0, 0);
        for (let i = 0; i < cells.length; i++) mesh.setMatrixAt(i, zero);
        // Les cellules les plus proches de l'ancien cadre apparaissent en premier.
        const delays = cells.map(
            (c) => ((Math.max(Math.abs(c.x), Math.abs(c.y), Math.abs(c.z)) - oldHalf - 1) / Math.max(1, half - oldHalf - 1)) * 0.45 + Math.random() * 0.3
        );
        group.add(mesh);
        this.root.add(group);
        this.construction = { group, ghost, mesh, mat, cells, delays, t: 0, duration: durationMs / 1000, fading: false };
    }

    // Fin de la construction : les cellules lumineuses s'estompent (ou disparaissent d'un coup).
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
            c.mat.opacity = Math.max(0, c.fade) * 0.5;
            c.ghost.material.opacity = Math.max(0, c.fade) * 0.4;
            if (c.fade <= 0) {
                this.root.remove(c.group);
                c.mesh.geometry.dispose();
                this.construction = null;
            }
            return;
        }
        c.t += dt / c.duration;
        c.ghost.material.opacity = 0.25 + 0.25 * Math.abs(Math.sin(time / 140));
        const m = new THREE.Matrix4();
        c.cells.forEach((p, i) => {
            const k = Math.min(1, Math.max(0, (c.t - c.delays[i]) * 4));
            const flicker = k > 0 && k < 1 ? 0.7 + 0.3 * Math.sin(time / 30 + i) : 1;
            m.makeScale(k * flicker, k * flicker, k * flicker).setPosition(p);
            c.mesh.setMatrixAt(i, m);
        });
        c.mesh.instanceMatrix.needsUpdate = true;
        c.mat.opacity = 0.2 + 0.3 * Math.min(1, c.t);
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
        this.#syncIntel(state.intel);
        this.elapsedMs = state.elapsedMs;
        this.stateTime = time;
    }

    // ---------- Murs ----------
    #syncWalls(walls, time) {
        const seen = new Set();
        this.blocked.clear();
        for (const w of walls) {
            seen.add(w.id);
            for (const c of w.cells) this.blocked.add(key(c));
            let view = this.walls.get(w.id);
            if (!view) {
                view = this.#createWall(w, time);
                this.walls.set(w.id, view);
            }
            view.data = w;
            if (w.kind === "rotating") {
                view.targetQuat.setFromAxisAngle(vec(AXES[w.axis]), w.turns * QUARTER);
                if (view.sweepTurns !== w.turns) this.#placeSweep(view, w);
            }
        }
        for (const [id, view] of this.walls) {
            if (seen.has(id)) continue;
            this.root.remove(view.group);
            if (view.rod) this.root.remove(view.rod);
            if (view.sweep) this.root.remove(view.sweep);
            this.walls.delete(id);
        }
    }

    #createWall(w, time) {
        const group = new THREE.Group();
        const view = { group, targetQuat: new THREE.Quaternion(), bornAt: time, data: w, materials: [] };

        if (w.kind === "pillar") {
            // Colonne de cristal, un seul prisme sur toute sa hauteur.
            const ys = w.cells.map((c) => c[1]);
            const height = Math.max(...ys) - Math.min(...ys) + 1;
            const base = cellToWorld(w.cells.find((c) => c[1] === Math.min(...ys)), this.size);
            const crystal = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.44, height - 0.06, 6), this.mats.crystal);
            crystal.position.set(base.x, base.y - 0.5 + height / 2, base.z);
            crystal.castShadow = true;
            const tip = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.3, 6), this.mats.crystal);
            tip.position.set(base.x, base.y - 0.5 + height + 0.1, base.z);
            const core = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, height - 0.2, 6), this.mats.crystalCore);
            core.position.copy(crystal.position);
            group.add(crystal, tip, core);
            // Le groupe grandit depuis le centre de la colonne.
            group.position.copy(crystal.position);
            for (const c of group.children) c.position.sub(group.position);
        } else if (w.kind === "rotating") {
            // Lame d'énergie qui pivote autour d'un axe visible.
            cellToWorld(w.pivot, this.size, group.position);
            const offsets = rotatingWallOffsets(w.axis, w.arm);
            const dir = vec(offsets.at(-1)).normalize();
            const axisVec = vec(AXES[w.axis]);
            const len = offsets.length - 0.08;
            // Lame : longue selon `dir`, plate selon l'axe de rotation, épaisse selon le 3e axe.
            const thick = new THREE.Vector3().crossVectors(axisVec, dir);
            const basis = new THREE.Matrix4().makeBasis(dir, thick, axisVec);
            const blade = new THREE.Mesh(new RoundedBoxGeometry(len, 0.86, 0.6, 3, 0.14), this.mats.blade);
            blade.quaternion.setFromRotationMatrix(basis);
            blade.castShadow = true;
            const edgeGlow = new THREE.Mesh(new THREE.BoxGeometry(len + 0.04, 0.9, 0.08), new THREE.MeshBasicMaterial({ color: 0xff8af2 }));
            edgeGlow.quaternion.copy(blade.quaternion);
            const pivot = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 14), this.mats.pivot);
            group.add(blade, edgeGlow, pivot);
            const rod = new THREE.Group();
            const rodMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8), new THREE.MeshBasicMaterial({ color: 0xf3d4ff }));
            rodMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axisVec);
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 8, 40), new THREE.MeshBasicMaterial({ color: 0xff8af2 }));
            ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axisVec);
            rod.add(rodMesh, ring);
            rod.position.copy(group.position);
            view.rod = rod;
            view.ring = ring;
            this.root.add(rod);
            view.targetQuat.setFromAxisAngle(axisVec, w.turns * QUARTER);
            group.quaternion.copy(view.targetQuat);
            // Avertissement : les cases du prochain quart de tour rougissent juste avant.
            view.sweepMat = new THREE.MeshBasicMaterial({ color: 0xff4fe0, map: hazardTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
            view.sweep = new THREE.Group();
            this.root.add(view.sweep);
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
        group.scale.setScalar(0.01);
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
            const m = new THREE.Mesh(this.sweepGeo ??= new THREE.BoxGeometry(0.9, 0.9, 0.9), view.sweepMat);
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
            s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
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

    // ---------- Zones dangereuses et météores ----------
    #syncZones(zones, time) {
        const seen = new Set();
        for (const z of zones) {
            seen.add(z.id);
            let view = this.zones.get(z.id);
            if (!view) {
                view = this.#createZone(z, time);
                this.zones.set(z.id, view);
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
            // Une météore tombe vers chaque cellule ciblée.
            for (const c of z.cells) {
                const target = cellToWorld(c, this.size);
                const rock = new THREE.Mesh(
                    new THREE.DodecahedronGeometry(0.28, 0),
                    new THREE.MeshStandardMaterial({ color: 0x3a1a0a, emissive: 0xff5a1a, emissiveIntensity: 1.6, flatShading: true })
                );
                const glow = new THREE.Sprite(this.glowMat(0xff7a2e, 0.9));
                glow.scale.setScalar(1.4);
                rock.add(glow);
                const from = target.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 14, (Math.random() - 0.5) * 6));
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
                m.rotation.x = -Math.PI / 2;
            } else m = new THREE.Mesh(new THREE.OctahedronGeometry(ev.type === "goldenFruit" ? 0.35 : 0.2), this.intelEventMat);
            cellToWorld(c, this.size, m.position);
            this.intelGroup.add(m);
        }
    }

    // ---------- Requêtes ----------
    freeRun(head, dir, snakeCells) {
        let c = add(head, dir);
        let run = 0;
        while (inBounds(c, this.arena ?? this.size) && !this.blocked.has(key(c)) && !snakeCells.has(key(c))) {
            run++;
            c = add(c, dir);
        }
        return run;
    }

    foodAhead(head, dir, range = 2) {
        let c = head;
        for (let i = 0; i < range; i++) {
            c = add(c, dir);
            if (this.foodKeys.has(key(c))) return true;
        }
        return false;
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
            // ses pointes sortent et sa rune brûle : on le voit venir.
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
        for (const g of this.food.values()) {
            const t = time / 1000 + g.userData.phase;
            g.position.y = g.userData.base.y + Math.sin(t * 2.6) * 0.07;
            g.rotation.y = t * 0.9;
            g.scale.setScalar(Math.min(1, (time - g.userData.bornAt) / 300) * (g.userData.golden ? 1.25 : 1));
            if (g.userData.ring) g.userData.ring.rotation.x = t * 2;
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
                m.rotation.y = time / 900 + i;
                m.scale.setScalar(1 + 0.12 * Math.sin(time / 260 + i));
            });
        }
    }

    clear() {
        for (const view of this.walls.values()) {
            this.root.remove(view.group);
            if (view.rod) this.root.remove(view.rod);
            if (view.sweep) this.root.remove(view.sweep);
        }
        for (const m of [...this.traps.values(), ...this.food.values()]) this.root.remove(m);
        for (const v of this.zones.values()) this.root.remove(v.group);
        this.walls.clear();
        this.traps.clear();
        this.food.clear();
        this.zones.clear();
        this.blocked.clear();
        this.intelGroup.clear();
        this.intelKey = "";
        this.intelGroup.visible = false;
    }
}

function easeOutBack(t) {
    const c = 1.7;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}
