import * as THREE from "three";
import { DEFAULT_COSMETICS, EVOLUTIONS } from "/shared/cosmetics.js";
import { SnakeModel } from "./SnakeModel.js";

// Décor vivant des menus : des Snakes nagent autour du cube, et un Snake
// d'aperçu (celui du joueur) s'affiche pour la personnalisation.
export class MenuStage {
    constructor(scene, effects, size) {
        this.scene = scene;
        this.effects = effects;
        this.size = size;
        this.group = new THREE.Group();
        scene.add(this.group);
        this.time = 0;

        // Deux Snakes qui tournent autour du monde.
        this.swimmers = [
            { model: new SnakeModel(DEFAULT_COSMETICS.snake1), phase: 0, radius: size * 0.95, tilt: 0.35, speed: 0.32, length: 16 },
            { model: new SnakeModel(DEFAULT_COSMETICS.snake2), phase: Math.PI, radius: size * 1.1, tilt: -0.25, speed: 0.27, length: 22 },
        ];
        this.swimmers[0].model.setTier(2);
        this.swimmers[1].model.setTier(3);
        for (const s of this.swimmers) this.group.add(s.model.group);

        // Snake d'aperçu (personnalisation), posé sur un piédestal à côté du cube.
        this.showcasePos = new THREE.Vector3(size * 0.95 + 4.5, -size / 2 + 1.4, size * 0.6);
        this.showcase = new SnakeModel(DEFAULT_COSMETICS.snake1);
        this.showcase.group.visible = false;
        this.group.add(this.showcase.group);
        this.pedestal = new THREE.Mesh(
            new THREE.CylinderGeometry(1.15, 1.3, 0.25, 48),
            new THREE.MeshStandardMaterial({ color: 0x15122a, metalness: 0.7, roughness: 0.3, emissive: 0x2a1450 })
        );
        this.pedestal.position.copy(this.showcasePos).add(new THREE.Vector3(0, -0.75, 0));
        this.pedestal.visible = false;
        this.group.add(this.pedestal);
        this.showcaseTier = 1;
    }

    setVisible(on) {
        this.group.visible = on;
    }

    setShowcase(on, cosmetics) {
        this.showcase.group.visible = on;
        this.pedestal.visible = on;
        for (const s of this.swimmers) s.model.group.visible = !on;
        if (cosmetics) this.showcase.setCosmetics(cosmetics);
    }

    setShowcaseTier(tier) {
        this.showcaseTier = tier;
        this.showcase.setTier(tier);
    }

    // Courbe fermée autour du cube : chaque segment suit la tête avec un retard.
    #swimPath(s, t) {
        const pts = [];
        for (let i = 0; i < s.length; i++) {
            const a = t * s.speed + s.phase - i * 0.075;
            const y = Math.sin(a * 2) * this.size * 0.25 + Math.sin(a * 3.1) * 0.6;
            const p = new THREE.Vector3(Math.cos(a) * s.radius, y, Math.sin(a) * s.radius);
            p.applyAxisAngle(new THREE.Vector3(1, 0, 0), s.tilt);
            pts.push(p);
        }
        return pts;
    }

    update(dt) {
        if (!this.group.visible) return;
        this.time += dt;
        for (const s of this.swimmers) {
            if (!s.model.group.visible) continue;
            const pts = this.#swimPath(s, this.time);
            s.model.setPath(pts, headQuat(pts));
            s.model.update(dt);
            const tail = s.model.tail;
            if (tail && Math.random() < dt * 30 * this.effects.density) {
                this.effects.emit(tail.c, s.model.glowColor, { vel: new THREE.Vector3().randomDirection().multiplyScalar(0.5), life: 0.8, size: 0.25 });
            }
        }
        if (this.showcase.group.visible) {
            // Le Snake d'aperçu ondule en spirale sur son piédestal.
            const len = 8 + (EVOLUTIONS[this.showcaseTier - 1]?.minLength ?? 0) * 0.4;
            const pts = [];
            for (let i = 0; i < len; i++) {
                const a = -i * 0.5 + this.time * 0.6;
                const r = 0.3 + i * 0.05;
                pts.push(new THREE.Vector3(Math.cos(a) * r, 0.5 - i * 0.04 + (i === 0 ? 0.15 : 0), Math.sin(a) * r).add(this.showcasePos));
            }
            // Tête levée qui regarde la caméra.
            pts[0] = this.showcasePos.clone().add(new THREE.Vector3(0.5, 0.95, 0.6));
            // La tête (qui regarde +Z en local) se tourne vers la caméra.
            const f = new THREE.Vector3(0.3, 0.12, 1).normalize();
            const x = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), f).normalize();
            const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, new THREE.Vector3().crossVectors(f, x), f));
            const swing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(this.time * 0.8) * 0.4);
            this.showcase.setPath(pts, swing.multiply(q));
            this.showcase.setMouthOpen(Math.sin(this.time * 0.5) > 0.85 ? 0.8 : 0);
            this.showcase.update(dt);
        }
    }
}

// Orientation de la tête d'après le début du chemin.
function headQuat(pts) {
    const forward = pts[0].clone().sub(pts[1]).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const x = new THREE.Vector3().crossVectors(up, forward).normalize();
    const y = new THREE.Vector3().crossVectors(forward, x);
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, forward));
}
