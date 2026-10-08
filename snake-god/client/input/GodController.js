import * as THREE from "three";
import { POWERS, POWER_IDS } from "/shared/config.js";
import {
    AXES,
    chebyshev,
    dangerZoneCells,
    inBounds,
    key,
    rotatingWallCells,
    rotatingWallFits,
    straightWallCells,
} from "/shared/grid.js";
import { worldPieces } from "../render/assets.js";
import { cellToWorld, vec, worldToCell } from "../render/coords.js";
import { hazardTexture } from "../render/textures.js";

const AXIS_ORDER = ["y", "x", "z"];
const VALID = 0xb36bff;
const INVALID = 0xff3b5c;

// Contrôles du Snake God : choix du pouvoir, de la couche et de l'axe,
// aperçu fantôme sous la souris, envoi des demandes au serveur (qui valide).
export class GodController extends EventTarget {
    constructor({ scene, camera, canvas, size, net }) {
        super();
        this.scene = scene;
        this.camera = camera;
        this.canvas = canvas;
        this.size = size;
        this.net = net;
        this.enabled = false;
        this.power = "trap";
        this.axis = "y";
        this.layer = Math.floor(size / 2);
        this.arena = { min: 0, max: size - 1, size };
        this.hoverCell = null;
        this.state = null;
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        this.downAt = null;

        this.#buildLayer();
        this.#buildGhost();
        this.#bindInput();
        this.hint = { ok: true, reason: "" };
        // Aperçu du piège : la vraie mine, en fantôme.
        worldPieces.then((pieces) => {
            if (!pieces?.Trap) return;
            this.trapGhost = pieces.Trap.clone();
            this.trapGhost.traverse((o) => {
                if (o.isMesh) o.material = this.ghostMat;
            });
            this.trapGhost.visible = false;
            this.ghost.add(this.trapGhost);
        });
    }

    #buildLayer() {
        const n = this.arena.size;
        const visible = this.layerGroup?.visible ?? false;
        if (this.layerGroup) this.scene.remove(this.layerGroup);
        this.layerGroup = new THREE.Group();
        const plane = new THREE.Mesh(
            new THREE.PlaneGeometry(n, n),
            new THREE.MeshBasicMaterial({
                color: 0x7a3cff,
                transparent: true,
                opacity: 0.08,
                side: THREE.DoubleSide,
                depthWrite: false,
            })
        );
        plane.rotation.x = -Math.PI / 2;
        const grid = new THREE.GridHelper(n, n, 0xb36bff, 0xb36bff);
        grid.material.transparent = true;
        grid.material.opacity = 0.35;
        this.layerGroup.add(plane, grid);
        this.layerGroup.visible = visible;
        this.scene.add(this.layerGroup);
        this.#placeLayer();
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
        // Mur rotatif : cercle balayé par la lame, dans son plan de rotation.
        this.sweepRing = new THREE.Mesh(
            new THREE.RingGeometry(0.4, POWERS.rotatingWall.arm + 0.5, 48),
            new THREE.MeshBasicMaterial({ color: VALID, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })
        );
        this.ghost.add(this.sweepRing);
        // Ligne verticale vers le sol : situe la profondeur du curseur.
        const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
        this.dropLine = new THREE.Line(lineGeo, new THREE.LineDashedMaterial({ color: VALID, dashSize: 0.15, gapSize: 0.1 }));
        this.ghost.add(this.dropLine);
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
        // Maj + molette change de couche (capturé avant le zoom de la caméra).
        window.addEventListener(
            "wheel",
            (e) => {
                if (!this.enabled || !e.shiftKey) return;
                e.stopPropagation();
                e.preventDefault();
                this.setLayer(this.layer + (e.deltaY < 0 || e.deltaX < 0 ? 1 : -1));
            },
            { capture: true, passive: false }
        );
        window.addEventListener("keydown", (e) => this.#onKey(e));
    }

    #onKey(e) {
        if (!this.enabled || e.target instanceof HTMLInputElement) return;
        const k = e.key.toLowerCase();
        const byKey = POWER_IDS.find((id) => POWERS[id].key === k);
        if (byKey) this.selectPower(byKey);
        else if (k === "r") this.cycleAxis();
        else if (k === "arrowup" || k === "pageup") this.setLayer(this.layer + 1);
        else if (k === "arrowdown" || k === "pagedown") this.setLayer(this.layer - 1);
        else return;
        e.preventDefault();
    }

    #onPointerMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
        this.#pick();
    }

    #pick() {
        if (!this.enabled) return;
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const y = this.layer - (this.size - 1) / 2;
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
        const hit = new THREE.Vector3();
        if (!this.raycaster.ray.intersectPlane(plane, hit)) {
            this.hoverCell = null;
            return;
        }
        const cell = worldToCell(hit, this.size);
        cell[1] = this.layer;
        this.hoverCell = inBounds(cell, this.arena) ? cell : null;
        this.#refreshGhost();
    }

    #placeLayer() {
        this.layerGroup.position.y = this.layer - (this.size - 1) / 2;
    }

    setEnabled(on) {
        this.enabled = on;
        this.layerGroup.visible = on;
        this.ghost.visible = on && !!this.hoverCell;
        this.#changed();
    }

    setState(state) {
        this.state = state;
        if (state.arena && state.arena.size !== this.arena.size) this.setArena(state.arena);
        this.#refreshGhost();
    }

    // L'arène a grandi : plan de couche à la bonne taille, couche gardée dans les bornes.
    setArena(arena) {
        this.arena = arena;
        this.#buildLayer();
        this.setLayer(this.layer);
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

    cycleAxis() {
        this.axis = AXIS_ORDER[(AXIS_ORDER.indexOf(this.axis) + 1) % AXIS_ORDER.length];
        this.#refreshGhost();
        this.#changed();
    }

    setLayer(layer) {
        this.layer = Math.max(this.arena.min, Math.min(this.arena.max, layer));
        this.#placeLayer();
        this.#pick();
        this.#changed();
    }

    place() {
        if (!this.hoverCell) return;
        this.net.usePower(this.power, this.hoverCell, this.axis);
    }

    previewCells(cell = this.hoverCell) {
        if (!cell) return [];
        const p = POWERS[this.power];
        if (this.power === "wall") return straightWallCells(cell, this.axis, p.length);
        if (this.power === "rotatingWall") return rotatingWallCells(cell, this.axis, p.arm, 0);
        if (this.power === "dangerZone") return dangerZoneCells(cell, this.axis, p.radius, this.arena);
        return [cell];
    }

    // Même règles que le serveur, pour colorer l'aperçu (le serveur reste l'arbitre).
    // Renvoie la raison du refus, ou "" si le pouvoir peut partir.
    #whyInvalid(cells) {
        const s = this.state;
        if (!s || !cells.length) return "Vise une case du cube";
        const god = s.god;
        const info = god.powers[this.power];
        const p = POWERS[this.power];
        if (!info.unlocked) return `Débloqué en phase ${p.phase}`;
        if (info.cooldownLeft > 0) return `Recharge : ${(info.cooldownLeft / 1000).toFixed(1)} s`;
        if (god.energy < p.cost) return `Énergie insuffisante (${Math.floor(god.energy)} / ${p.cost})`;
        if (this.power === "rotatingWall" && !rotatingWallFits(this.hoverCell, this.axis, POWERS.rotatingWall.arm, this.arena))
            return "La lame dépasse du cube : change d'axe (R) ou rapproche-toi du centre";
        const wallCells = new Set();
        for (const w of s.walls) for (const c of w.cells) wallCells.add(key(c));
        if (this.power === "demolish") return wallCells.has(key(cells[0])) ? "" : "Vise un mur ou un pilier";
        if (this.power === "dangerZone") return "";
        const taken = new Set(wallCells);
        for (const c of s.traps) taken.add(key(c));
        for (const f of s.food) taken.add(key(f.cell));
        for (const sn of s.snakes) for (const c of sn.body) taken.add(key(c));
        const heads = s.snakes.filter((sn) => sn.alive && sn.body.length).map((sn) => sn.body[0]);
        if (!cells.every((c) => inBounds(c, this.arena))) return "Dépasse du cube";
        if (cells.some((c) => taken.has(key(c)))) return "Case occupée";
        if (cells.some((c) => heads.some((h) => chebyshev(h, c) <= 1))) return "Trop près d'un Snake";
        return "";
    }

    #refreshGhost() {
        const cells = this.previewCells();
        this.ghost.visible = this.enabled && cells.length > 0;
        if (!this.ghost.visible) return;
        const reason = this.#whyInvalid(cells);
        if (reason !== this.hint.reason) {
            this.hint = { ok: !reason, reason };
            this.#changed();
        }
        const color = reason ? INVALID : VALID;
        for (const mat of [this.ghostMat, this.ghostEdgeMat, this.dropLine.material, this.zoneMat, this.sweepRing.material]) mat.color.setHex(color);
        // Forme propre à chaque pouvoir : mine, dalle hachurée, cubes (+ cercle balayé).
        const trap = this.power === "trap" && this.trapGhost;
        const zone = this.power === "dangerZone";
        if (this.trapGhost) {
            this.trapGhost.visible = !!trap;
            if (trap) cellToWorld(cells[0], this.size, this.trapGhost.position);
        }
        this.ghostCells.forEach((m, i) => {
            m.visible = !trap && !zone && i < cells.length && inBounds(cells[i], this.arena);
            if (m.visible) cellToWorld(cells[i], this.size, m.position);
        });
        this.zoneCells.forEach((m, i) => {
            m.visible = zone && i < cells.length && inBounds(cells[i], this.arena);
            if (!m.visible) return;
            cellToWorld(cells[i], this.size, m.position);
            const n = vec(AXES[this.axis]);
            m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
            m.position.addScaledVector(n, -0.46); // posée sur la face de la cellule
        });
        this.sweepRing.visible = this.power === "rotatingWall";
        if (this.sweepRing.visible) {
            cellToWorld(this.hoverCell, this.size, this.sweepRing.position);
            this.sweepRing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), vec(AXES[this.axis]));
        }
        const top = cellToWorld(this.hoverCell, this.size);
        const pos = this.dropLine.geometry.attributes.position;
        pos.setXYZ(0, top.x, top.y - 0.5, top.z);
        pos.setXYZ(1, top.x, this.arena.min - (this.size - 1) / 2 - 0.5, top.z);
        pos.needsUpdate = true;
        this.dropLine.computeLineDistances();
    }

    #changed() {
        this.dispatchEvent(new Event("change"));
    }
}
