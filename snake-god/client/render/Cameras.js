import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// Caméra des Snakes (troisième personne) : derrière et au-dessus de la tête, alignée sur
// la face où il rampe. Sur le CUBE, elle anticipe les arêtes : son « haut » commence à
// pencher vers la face suivante une ou deux cases avant le passage, puis suit en douceur.
export class SnakeCamera {
    constructor(camera) {
        this.camera = camera;
        this.pos = new THREE.Vector3();
        this.look = new THREE.Vector3();
        this.up = new THREE.Vector3(0, 1, 0);
        this.shakeAmount = 0;
        this.distance = 1;
        this.ready = false;
        this.intro = null; // vol d'introduction : { from, up, t }
    }

    shake(amount = 0.35) {
        this.shakeAmount = Math.max(this.shakeAmount, amount);
    }

    // Petit élan vers l'avant (bouchée, fruit doré) : la caméra répond au geste du joueur.
    punch(amount = 0.2) {
        this.punchAmount = Math.max(this.punchAmount ?? 0, amount);
    }

    reset() {
        this.ready = false;
    }

    // Part de la position actuelle (vue d'ensemble) et plonge vers le Snake.
    startIntro() {
        this.intro = { from: this.camera.position.clone(), up: this.camera.up.clone(), t: 0 };
    }

    update(headPos, headQuat, dt, edge = null) {
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(headQuat);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(headQuat);
        if (edge?.t > 0) up.lerp(edge.next, edge.t * 0.35).normalize();
        const d = this.distance * (this.mapKind === "cube" ? 1.1 : 1);
        const desiredPos = headPos.clone().addScaledVector(forward, -3.8 * d).addScaledVector(up, 2.9 * d);
        const desiredLook = headPos.clone().addScaledVector(forward, 3).addScaledVector(up, 0.2);

        const far = this.pos.distanceTo(desiredPos) > 4.5;
        const k = !this.ready || far ? 1 : 1 - Math.exp(-dt * 9);
        this.pos.lerp(desiredPos, k);
        this.look.lerp(desiredLook, k);
        this.up.lerp(up, k).normalize();
        this.ready = true;

        if (this.intro) {
            this.intro.t += dt / 2.2;
            const t = Math.min(1, this.intro.t);
            const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
            this.camera.position.lerpVectors(this.intro.from, this.pos, e);
            this.camera.up.lerpVectors(this.intro.up, this.up, e).normalize();
            this.camera.lookAt(new THREE.Vector3().lerpVectors(new THREE.Vector3(), this.look, e));
            if (t >= 1) this.intro = null;
            return;
        }

        this.camera.position.copy(this.pos);
        if (this.punchAmount > 0.001) {
            // Montée instantanée, retour en ~200 ms (ease-out exponentiel).
            this.camera.position.addScaledVector(forward, this.punchAmount);
            this.punchAmount *= Math.exp(-dt * 14);
        }
        if (this.shakeAmount > 0.001) {
            this.camera.position.add(new THREE.Vector3().randomDirection().multiplyScalar(this.shakeAmount));
            this.shakeAmount *= Math.exp(-dt * 10);
        }
        this.camera.up.copy(this.up);
        this.camera.lookAt(this.look);
    }
}

// Caméra du Snake God : vue d'ensemble orbitale du cube.
export class GodCamera {
    constructor(camera, domElement, size) {
        this.camera = camera;
        this.controls = new OrbitControls(camera, domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.enablePan = false;
        this.controls.minDistance = size * 0.9;
        this.controls.maxDistance = size * 3;
        this.controls.enabled = false;
        this.home = new THREE.Vector3(size * 1.15, size * 0.95, size * 1.35);
        this.shakeAmount = 0;
        this.mapKind = "cube";
    }

    // WORLD : vue plus plongeante sur le terrain ; CUBE : vue de trois quarts.
    setMap(kind) {
        this.mapKind = kind;
    }

    // Secousse en rotation (pas en position) : OrbitControls recalcule l'orientation
    // à chaque image, donc la secousse ne dérive jamais.
    shake(amount = 0.35) {
        this.shakeAmount = Math.max(this.shakeAmount, amount);
    }

    setArena(size) {
        const flat = this.mapKind === "world";
        this.controls.minDistance = size * (flat ? 0.5 : 0.9);
        this.controls.maxDistance = size * (flat ? 1.8 : 3);
        this.wantedDistance = size * (flat ? 1.05 : 2.1);
        if (flat) this.home.set(size * 0.25, size * 0.85, size * 0.6);
        else this.home.set(size * 1.15, size * 0.95, size * 1.35);
        this.controls.target.set(0, flat ? this.floorY ?? 0 : 0, 0);
    }

    activate() {
        this.camera.up.set(0, 1, 0);
        this.camera.position.copy(this.home);
        this.controls.target.set(0, this.mapKind === "world" ? this.floorY ?? 0 : 0, 0);
        if (this.mapKind === "world") this.camera.position.y += this.controls.target.y;
        this.controls.enabled = true;
        this.controls.update();
    }

    deactivate() {
        this.controls.enabled = false;
    }

    update(dt = 0.016) {
        // Après une expansion, la caméra recule doucement pour tout voir.
        const d = this.camera.position.length();
        if (this.controls.enabled && this.wantedDistance && d < this.wantedDistance * 0.92) {
            this.camera.position.multiplyScalar(1 + Math.min(0.05, dt * 1.2));
        }
        this.controls.update();
        if (this.shakeAmount > 0.001) {
            const s = this.shakeAmount * 0.025;
            this.camera.rotateX((Math.random() - 0.5) * s);
            this.camera.rotateY((Math.random() - 0.5) * s);
            this.shakeAmount *= Math.exp(-dt * 10);
        }
    }
}

// Caméra des menus : lent travelling autour du monde, ou plan serré sur l'aperçu du Snake.
export class MenuCamera {
    constructor(camera, size) {
        this.camera = camera;
        this.size = size;
        this.angle = 0.6;
        this.mode = "world"; // "world" | "showcase"
        this.pos = new THREE.Vector3(size * 1.6, size * 0.7, size * 1.6);
        this.look = new THREE.Vector3();
    }

    update(dt, showcaseTarget) {
        this.angle += dt * 0.06;
        let pos;
        let look;
        if (this.mode === "showcase" && showcaseTarget) {
            pos = showcaseTarget.clone().add(new THREE.Vector3(0.6, 1.6, 4.6));
            look = showcaseTarget.clone().add(new THREE.Vector3(-1.5, 0.35, 0));
        } else {
            const r = this.size * 2.1;
            pos = new THREE.Vector3(Math.cos(this.angle) * r, this.size * 0.55, Math.sin(this.angle) * r);
            look = new THREE.Vector3(0, -0.5, 0);
        }
        const k = 1 - Math.exp(-dt * 2.5);
        this.pos.lerp(pos, k);
        this.look.lerp(look, k);
        this.camera.up.set(0, 1, 0);
        this.camera.position.copy(this.pos);
        this.camera.lookAt(this.look);
    }
}

// Pilote les trois caméras (Snake, dieu, menus) : choix de la caméra active, map, secousses.
export class CameraController {
    constructor(camera, canvas, size) {
        this.camera = camera;
        this.snake = new SnakeCamera(camera);
        this.god = new GodCamera(camera, canvas, size);
        this.menu = new MenuCamera(camera, size);
        this.mode = "menu"; // "menu" | "god" | "snake"
    }

    // Map de la partie : le dieu cadre autrement un terrain plat ; `floorY` = hauteur du sol.
    setMap(kind, arenaSize, floorY = 0) {
        this.snake.mapKind = kind;
        this.god.setMap(kind);
        this.god.floorY = floorY;
        this.god.setArena(arenaSize);
    }

    setArena(arenaSize) {
        this.god.setArena(arenaSize);
    }

    // Change de caméra. Renvoie la caméra précédente.
    setMode(next) {
        const previous = this.mode;
        if (next === previous) return previous;
        this.mode = next;
        if (next === "god") this.god.activate();
        else this.god.deactivate();
        if (next === "snake") {
            this.snake.reset();
            if (previous === "menu") this.snake.startIntro();
        }
        return previous;
    }

    shake(amount) {
        if (this.mode === "snake") this.snake.shake(amount);
        else this.god.shake(amount);
    }

    // `view` : la vue du Snake du joueur (tête, orientation, arête à venir).
    update(dt, { view = null, showcase = null } = {}) {
        if (this.mode === "menu") this.menu.update(dt, showcase);
        else if (this.mode === "snake" && view) this.snake.update(view.headPos, view.headQuat, dt, view.edge);
        else this.god.update(dt);
    }
}