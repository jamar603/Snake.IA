import * as THREE from "three";
import { POWERS, POWER_IDS } from "/shared/config.js";
import { chebyshev, dangerZoneCells, key, rotatingWallCells, rotatingWallFits, straightWallCells } from "/shared/grid.js";
import { createMap } from "/shared/maps/index.js";
import { propPieces, worldPieces } from "../render/assets.js";
import { trapModelFor } from "../render/catalog.js";
import { cellToWorld, vec, worldToCell } from "../render/coords.js";
import { hazardTexture } from "../render/textures.js";

const VALID = 0xb36bff;
const INVALID = 0xff3b5c;
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

// Contrôles du Snake God : choix du pouvoir, clic direct sur la surface visée (une face du
// CUBE ou le terrain WORLD), aperçu fantôme couché sur la face, envoi au serveur (qui valide).
// R change l'orientation des murs (les deux directions de la face).
// Manette : le stick gauche déplace un viseur à l'écran, actions de l'InputManager pour le reste.
// CUBE 3D (version classique) : on vise sur une couche horizontale (↑ ↓ ou Maj + molette),
// R choisit l'axe (x, y, z) des murs, des lames et des dalles.
export class GodController extends EventTarget {
    constructor({ scene, camera, canvas, size, net, map = createMap("cube") }) {
        super();
        this.scene = scene;
        this.camera = camera;
        this.canvas = canvas;
        this.size = size;
        this.map = map;
        this.net = net;
        this.enabled = false;
        this.power = "trap";
        this.axisIndex = 0; // index dans les axes de la face visée
        this.hoverCell = null;
        this.state = null;
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        this.downAt = null;
        this.hint = { ok: true, reason: "" };
        this.layer = 0;

        this.#buildCursor();
        this.#buildPadCursor();
        this.#buildLayer();
        this.#buildGhost();
        this.#bindInput();
        // Aperçu du piège : le vrai modèle qui apparaîtra sur la case visée, en fantôme.
        this.trapGhosts = {}; // modèle -> objet fantôme
        const addGhosts = (pieces, names) => {
            for (const name of names) {
                const src = name === "RuneMine" ? pieces?.Trap : pieces?.[name];
                if (!src) continue;
                const g = src.clone(true);
                g.traverse((o) => {
                    if (o.isMesh) o.material = this.ghostMat;
                });
                g.visible = false;
                g.userData.flat = name !== "RuneMine";
                this.trapGhosts[name] = g;
                this.ghost.add(g);
            }
        };
        worldPieces.then((pieces) => addGhosts(pieces, ["RuneMine"]));
        propPieces.then((pieces) => addGhosts(pieces, ["SpikeTrap", "JawTrap", "SawTrap", "FireTrap", "TeslaTrap"]));
    }

    // Axe des murs, couché sur la face visée.
    get axis() {
        const axes = this.hoverCell ? this.map.tangentAxes(this.hoverCell) : ["x", "z"];
        return axes[this.axisIndex % axes.length];
    }

    // Plan de la couche visée (Cube 3D) et fil vers le sol pour situer la profondeur.
    #buildLayer() {
        this.layerGroup = new THREE.Group();
        this.layerGroup.visible = false;
        this.scene.add(this.layerGroup);
        this.dropLine = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
            new THREE.LineDashedMaterial({ color: VALID, dashSize: 0.15, gapSize: 0.1 })
        );
        this.dropLine.frustumCulled = false;
        this.dropLine.visible = false;
        this.scene.add(this.dropLine);
    }

    #rebuildLayer() {
        this.layerGroup.clear();
        if (this.map.kind !== "volume") return;
        const n = this.map.arena.size;
        const plane = new THREE.Mesh(
            new THREE.PlaneGeometry(n, n),
            new THREE.MeshBasicMaterial({ color: 0x7a3cff, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false })
        );
        plane.rotation.x = -Math.PI / 2;
        const grid = new THREE.GridHelper(n, n, 0xb36bff, 0xb36bff);
        grid.material.transparent = true;
        grid.material.opacity = 0.35;
        this.layerGroup.add(plane, grid);
        this.#placeLayer();
    }

    #placeLayer() {
        this.layerGroup.position.y = this.layer - (this.size - 1) / 2;
    }

    setLayer(layer) {
        const { min, max } = this.map.arena;
        this.layer = Math.max(min, Math.min(max, layer));
        this.#placeLayer();
        this.#pick();
        this.#changed();
    }

    get volume() {
        return this.map.kind === "volume";
    }

    // Carré lumineux sous le curseur : on voit toujours quelle case on vise.
    #buildCursor() {
        this.cursor = new THREE.Mesh(
            new THREE.RingGeometry(0.36, 0.48, 4, 1, Math.PI / 4),
            new THREE.MeshBasicMaterial({ color: VALID, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
        );
        this.cursor.visible = false;
        this.scene.add(this.cursor);
    }

    #buildGhost() {
        this.ghost = new THREE.Group();
        this.ghostMat = new THREE.MeshBasicMaterial({ color: VALID, transparent: true, opacity: 0.35, depthWrite: false });
        this.ghostEdgeMat = new THREE.LineBasicMaterial({ color: VALID });
        const box = new THREE.BoxGeometry(0.96, 0.96, 0.96);
        const edges = new THREE.EdgesGeometry(box);
        this.ghostCells = Array.from({ length: 9 }, () => {
            const m = new THREE.Mesh(box, this.ghostMat);
            m.add(new THREE.LineSegments(edges, this.ghostEdgeMat));
            this.ghost.add(m);
            return m;
        });
        // Zone dangereuse : dalle hachurée (ce qui brûlera), pas des cubes.
        this.zoneMat = new THREE.MeshBasicMaterial({ color: VALID, map: hazardTexture(), transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
        this.zoneCells = Array.from({ length: 9 }, () => {
            const m = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.96), this.zoneMat);
            this.ghost.add(m);
            return m;
        });
        // Mur rotatif : cercle balayé par la lame, couché sur la face.
        this.sweepRing = new THREE.Mesh(
            new THREE.RingGeometry(0.4, POWERS.rotatingWall.arm + 0.5, 48),
            new THREE.MeshBasicMaterial({ color: VALID, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })
        );
        this.ghost.add(this.sweepRing);
        // Téléporteur : anneau du portail d'entrée (la sortie est tirée par le serveur).
        this.portalGhost = new THREE.Mesh(
            new THREE.TorusGeometry(0.4, 0.06, 8, 32),
            new THREE.MeshBasicMaterial({ color: VALID, transparent: true, opacity: 0.7, depthWrite: false })
        );
        this.ghost.add(this.portalGhost);
        this.ghost.visible = false;
        this.scene.add(this.ghost);
    }

    #bindInput() {
        this.canvas.addEventListener("pointermove", (e) => this.#onPointerMove(e));
        this.canvas.addEventListener("pointerdown", (e) => {
            this.downAt = { x: e.clientX, y: e.clientY };
        });
        this.canvas.addEventListener("pointerup", (e) => {
            if (!this.enabled || e.button !== 0 || !this.downAt) return;
            const moved = Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y);
            this.downAt = null;
            if (moved < 6) this.place();
        });
        // Cube 3D : Maj + molette change de couche (capturé avant le zoom de la caméra).
        window.addEventListener(
            "wheel",
            (e) => {
                if (!this.enabled || !this.volume || !e.shiftKey) return;
                e.stopPropagation();
                e.preventDefault();
                this.setLayer(this.layer + (e.deltaY < 0 || e.deltaX < 0 ? 1 : -1));
            },
            { capture: true, passive: false }
        );
        window.addEventListener("keydown", (e) => this.#onKey(e));
    }

    // Chiffres 1 à 8 : choix direct d'un pouvoir (le reste passe par les actions remappables).
    #onKey(e) {
        if (!this.enabled || e.repeat || e.target instanceof HTMLInputElement) return;
        const k = e.key.toLowerCase();
        const byKey = POWER_IDS.find((id) => POWERS[id].key === k || e.code === `Digit${POWERS[id].key}`);
        if (!byKey) return;
        e.preventDefault();
        this.selectPower(byKey);
    }

    // Actions de l'InputManager (clavier remappé ou manette).
    handleAction(action) {
        if (!this.enabled) return;
        if (action === "place") this.place();
        else if (action === "nextPower") this.cyclePower(1);
        else if (action === "prevPower") this.cyclePower(-1);
        else if (action === "cycleAxis") this.cycleAxis();
        else if (action === "layerUp" && this.volume) this.setLayer(this.layer + 1);
        else if (action === "layerDown" && this.volume) this.setLayer(this.layer - 1);
    }

    // Viseur manette : croix à l'écran, déplacée par le stick gauche (vitesse en écrans / s).
    #buildPadCursor() {
        this.padCursor = document.createElement("div");
        this.padCursor.className = "pad-cursor hidden";
        document.body.appendChild(this.padCursor);
    }

    moveCursor(dx, dy) {
        if (!this.enabled || (!dx && !dy)) return;
        this.pointer.x = Math.max(-1, Math.min(1, this.pointer.x + dx));
        this.pointer.y = Math.max(-1, Math.min(1, this.pointer.y - dy));
        this.#pick();
    }

    // Affiche le viseur quand la manette est utilisée (la souris garde son propre pointeur).
    showPadCursor(on) {
        const visible = on && this.enabled;
        this.padCursor.classList.toggle("hidden", !visible);
        if (!visible) return;
        const rect = this.canvas.getBoundingClientRect();
        const x = rect.left + ((this.pointer.x + 1) / 2) * rect.width;
        const y = rect.top + ((1 - this.pointer.y) / 2) * rect.height;
        this.padCursor.style.transform = `translate(${x}px, ${y}px)`;
    }

    // La caméra a bougé : la case sous le viseur change même si le viseur est immobile.
    refreshAim() {
        if (this.enabled) this.#pick();
    }

    #onPointerMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
        this.#pick();
    }

    // Case visée : on touche le bloc du cube (ou le plan du terrain), puis on prend la
    // case de surface juste au-dessus du point touché.
    #pick() {
        if (!this.enabled) return;
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const ray = this.raycaster.ray;
        const hit = new THREE.Vector3();
        const normal = new THREE.Vector3(0, 1, 0);
        if (this.volume) {
            // Couche horizontale : la case visée est dans le plan de la couche.
            const y = this.layer - (this.size - 1) / 2;
            if (!ray.intersectPlane(new THREE.Plane(normal, -y), hit)) return this.#setHover(null);
            const cell = worldToCell(hit, this.size);
            cell[1] = this.layer;
            return this.#setHover(this.map.isCell(cell) ? cell : null);
        }
        if (this.map.kind === "world") {
            const y = cellToWorld([0, this.map.layer, 0], this.size).y - 0.5;
            if (!ray.intersectPlane(new THREE.Plane(normal, -y), hit)) return this.#setHover(null);
        } else {
            const h = this.map.arena.size / 2;
            const box = new THREE.Box3(new THREE.Vector3(-h, -h, -h), new THREE.Vector3(h, h, h));
            if (!ray.intersectBox(box, hit)) return this.#setHover(null);
            // Normale de la face touchée : l'axe où le point est sur le bord du bloc.
            const a = [Math.abs(hit.x), Math.abs(hit.y), Math.abs(hit.z)];
            const i = a.indexOf(Math.max(...a));
            normal.set(0, 0, 0).setComponent(i, Math.sign(hit.getComponent(i)));
        }
        const cell = worldToCell(hit.addScaledVector(normal, 0.5), this.size);
        this.#setHover(this.map.isCell(cell) ? cell : null);
    }

    #setHover(cell) {
        this.hoverCell = cell;
        this.#refreshGhost();
    }

    setEnabled(on) {
        this.enabled = on;
        this.layerGroup.visible = on && this.volume;
        if (!on) this.ghost.visible = this.cursor.visible = this.dropLine.visible = false;
        else this.#refreshGhost();
        this.#changed();
    }

    // Map de la partie (topologie partagée avec le serveur).
    setMap(map, size) {
        this.map = map;
        this.size = size;
        this.hoverCell = null;
        this.layer = Math.floor((map.arena.min + map.arena.max) / 2);
        this.#rebuildLayer();
        this.layerGroup.visible = this.enabled && this.volume;
        this.#refreshGhost();
    }

    // L'arène a grandi (Cube 3D) : plan de couche à la bonne taille, couche dans les bornes.
    setState(state) {
        this.state = state;
        if (this.volume && state.arena.size !== this.layerSize) {
            this.layerSize = state.arena.size;
            this.#rebuildLayer();
            this.setLayer(this.layer);
        }
        this.#refreshGhost();
    }

    selectPower(id) {
        // Pouvoir sans cible : il part immédiatement.
        if (POWERS[id].needsCell === false) {
            this.net.usePower(id, null, this.axis);
            return;
        }
        this.power = id;
        this.#refreshGhost();
        this.#changed();
    }

    // Manette : L1 / R1 parcourent tous les pouvoirs. Un pouvoir sans cible (Déclencher,
    // Expansion) est seulement armé : il part au prochain appui sur « poser ».
    cyclePower(step) {
        const i = POWER_IDS.indexOf(this.power);
        this.power = POWER_IDS[(i + step + POWER_IDS.length) % POWER_IDS.length];
        this.#refreshGhost();
        this.#changed();
    }

    cycleAxis() {
        this.axisIndex = (this.axisIndex + 1) % (this.volume ? 3 : 2);
        this.#refreshGhost();
        this.#changed();
    }

    place() {
        if (POWERS[this.power].needsCell === false) return this.net.usePower(this.power, null, this.axis);
        if (!this.hoverCell) return;
        this.net.usePower(this.power, this.hoverCell, this.axis);
    }

    #onFace(cell) {
        return (c) => this.map.isCell(c) && this.map.sameFace(c, cell);
    }

    previewCells(cell = this.hoverCell) {
        const p = POWERS[this.power];
        if (!cell || p.needsCell === false) return []; // pouvoir sans cible : pas d'aperçu
        const n = this.volume ? this.axis : this.map.normalAxis(cell);
        if (this.power === "wall") return straightWallCells(cell, this.axis, p.length);
        if (this.power === "rotatingWall") return rotatingWallCells(cell, n, p.arm, 0);
        if (this.power === "dangerZone") return dangerZoneCells(cell, n, p.radius, this.#onFace(cell));
        return [cell];
    }

    // Mêmes règles que le serveur, pour colorer l'aperçu (le serveur reste l'arbitre).
    // Renvoie la raison du refus, ou "" si le pouvoir peut partir.
    #whyInvalid(cells) {
        const s = this.state;
        if (!s || !cells.length) return "Vise une case de la map";
        const god = s.god;
        const info = god.powers[this.power];
        const p = POWERS[this.power];
        if (!info) return "";
        if (!info.unlocked) return `Débloqué en phase ${p.phase}`;
        if (info.cooldownLeft > 0) return `Recharge : ${(info.cooldownLeft / 1000).toFixed(1)} s`;
        if (god.energy < p.cost) return `Énergie insuffisante (${Math.floor(god.energy)} / ${p.cost})`;
        const onFace = this.#onFace(this.hoverCell);
        const shapeAxis = this.volume ? this.axis : this.map.normalAxis(this.hoverCell);
        if (this.power === "rotatingWall" && !rotatingWallFits(this.hoverCell, shapeAxis, p.arm, onFace))
            return this.volume ? "La lame doit pouvoir tourner dans le cube : change d'axe (R)" : "La lame doit pouvoir tourner sur la face : rapproche-toi du centre";
        const wallCells = new Set();
        for (const w of s.walls) for (const c of w.cells) wallCells.add(key(c));
        if (this.power === "demolish") return wallCells.has(key(cells[0])) ? "" : "Vise un mur ou un obstacle";
        if (this.power === "dangerZone") return "";
        if (!cells.every(onFace)) return "Dépasse de la face : change d'orientation (R)";
        const taken = new Set(wallCells);
        for (const c of s.traps) taken.add(key(c));
        for (const f of s.food) taken.add(key(f.cell));
        for (const sn of s.snakes) for (const c of sn.body) taken.add(key(c));
        for (const t of s.teleporters ?? []) taken.add(key(t.a)).add(key(t.b));
        const heads = s.snakes.filter((sn) => sn.alive && sn.body.length).map((sn) => sn.body[0]);
        if (cells.some((c) => taken.has(key(c)))) return "Case occupée";
        if (cells.some((c) => heads.some((h) => chebyshev(h, c) <= 1))) return "Trop près d'un Snake";
        return "";
    }

    #refreshGhost() {
        const cells = this.previewCells();
        const on = this.enabled && cells.length > 0;
        this.ghost.visible = on;
        this.cursor.visible = on;
        this.dropLine.visible = on && this.volume;
        if (!on) return;
        const reason = this.#whyInvalid(cells);
        if (reason !== this.hint.reason) {
            this.hint = { ok: !reason, reason };
            this.#changed();
        }
        const color = reason ? INVALID : VALID;
        for (const mat of [this.ghostMat, this.ghostEdgeMat, this.zoneMat, this.sweepRing.material, this.portalGhost.material, this.cursor.material, this.dropLine.material]) {
            mat.color.setHex(color);
        }
        const normal = vec(this.map.normalAt(this.hoverCell));
        const lay = (obj, cell, lift) => {
            cellToWorld(cell, this.size, obj.position).addScaledVector(normal, lift);
            obj.quaternion.setFromUnitVectors(Z_AXIS, normal);
        };
        lay(this.cursor, this.hoverCell, -0.46);

        // Forme propre à chaque pouvoir : mine, dalle hachurée, portail, cubes (+ cercle balayé).
        const trapModel = this.power === "trap" ? trapModelFor(cells[0], this.map.kind) : null;
        const trap = !!this.trapGhosts[trapModel];
        const zone = this.power === "dangerZone";
        const portal = this.power === "teleporter";
        for (const [name, g] of Object.entries(this.trapGhosts)) {
            g.visible = name === trapModel;
            if (!g.visible) continue;
            cellToWorld(cells[0], this.size, g.position);
            if (g.userData.flat) g.quaternion.setFromUnitVectors(Y_AXIS, normal);
        }
        this.portalGhost.visible = portal;
        if (portal) lay(this.portalGhost, cells[0], -0.38);
        this.ghostCells.forEach((m, i) => {
            m.visible = !trap && !zone && !portal && i < cells.length && this.map.isCell(cells[i]);
            if (m.visible) cellToWorld(cells[i], this.size, m.position);
        });
        this.zoneCells.forEach((m, i) => {
            m.visible = zone && i < cells.length;
            if (m.visible) lay(m, cells[i], -0.46);
        });
        this.sweepRing.visible = this.power === "rotatingWall";
        if (this.sweepRing.visible) lay(this.sweepRing, this.hoverCell, -0.4);
        if (this.volume) {
            // Lame et dalle suivent l'axe choisi ; fil de la case visée jusqu'au sol.
            const axisVec = vec({ x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[this.axis]);
            if (this.sweepRing.visible) {
                cellToWorld(this.hoverCell, this.size, this.sweepRing.position);
                this.sweepRing.quaternion.setFromUnitVectors(Z_AXIS, axisVec);
            }
            this.zoneCells.forEach((m, i) => {
                if (!m.visible) return;
                cellToWorld(cells[i], this.size, m.position);
                m.quaternion.setFromUnitVectors(Z_AXIS, axisVec);
            });
            const top = cellToWorld(this.hoverCell, this.size);
            const pos = this.dropLine.geometry.attributes.position;
            pos.setXYZ(0, top.x, top.y - 0.5, top.z);
            pos.setXYZ(1, top.x, this.map.arena.min - (this.size - 1) / 2 - 0.5, top.z);
            pos.needsUpdate = true;
            this.dropLine.computeLineDistances();
        }
    }

    #changed() {
        this.dispatchEvent(new Event("change"));
    }
}
