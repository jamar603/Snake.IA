import * as THREE from "three";
import { evolutionFor } from "/shared/cosmetics.js";
import { cross } from "/shared/grid.js";
import { cellToWorld, vec } from "./coords.js";
import { SnakeModel } from "./SnakeModel.js";
import { glowTexture } from "./textures.js";

const TRAIL_STYLE = {
    sparks: { rate: 26, speed: 1.2, life: 0.45, size: 0.22, gravity: 0, color: null },
    embers: { rate: 22, speed: 0.6, life: 0.9, size: 0.26, gravity: -1.2, color: 0xff9a3d },
    stardust: { rate: 18, speed: 0.25, life: 1.3, size: 0.2, gravity: 0, color: 0xfff6c8 },
    none: { rate: 0 },
};

// Un Snake en jeu : interpole les positions entre deux ticks serveur, nourrit
// le modèle 3D, émet la traînée et affiche le rayon de visée du joueur local.
export class SnakeView {
    constructor(scene, size, effects, cosmetics) {
        this.scene = scene;
        this.size = size;
        this.effects = effects;
        this.model = new SnakeModel(cosmetics);
        scene.add(this.model.group);
        this.cosmeticsKey = JSON.stringify(cosmetics);

        // Ombre lumineuse au sol : position lisible depuis toutes les vues.
        this.shadow = new THREE.Mesh(
            new THREE.CircleGeometry(0.45, 24),
            new THREE.MeshBasicMaterial({ map: glowTexture(), color: this.model.glowColor, transparent: true, opacity: 0.5, depthWrite: false })
        );
        this.shadow.rotation.x = -Math.PI / 2;
        scene.add(this.shadow);

        // Rayon de visée : jusqu'où on peut aller tout droit.
        this.aimGeo = new THREE.BufferGeometry();
        this.aimGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(6), 3));
        this.aim = new THREE.Line(
            this.aimGeo,
            new THREE.LineDashedMaterial({ color: this.model.glowColor, dashSize: 0.16, gapSize: 0.12, transparent: true, opacity: 0.7 })
        );
        this.aimEnd = new THREE.Mesh(
            new THREE.RingGeometry(0.2, 0.28, 32),
            new THREE.MeshBasicMaterial({ color: this.model.glowColor, side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending })
        );
        scene.add(this.aim, this.aimEnd);

        this.prev = null;
        this.cur = null;
        this.headPos = new THREE.Vector3();
        this.headQuat = new THREE.Quaternion();
        this.targetQuat = new THREE.Quaternion();
        this.aimRun = 0;
        this.isMine = false;
        this.trailAcc = 0;
        this.tier = 1;
    }

    setState(snake, aimRun, foodAhead) {
        this.prev = this.cur;
        this.cur = snake;
        this.aimRun = aimRun;
        this.model.setMouthOpen(foodAhead ? 0.7 : 0);
        const key = JSON.stringify(snake.cosmetics);
        if (snake.cosmetics && key !== this.cosmeticsKey) {
            this.cosmeticsKey = key;
            this.model.setCosmetics(snake.cosmetics);
        }
        const tier = evolutionFor(snake.length).tier;
        if (tier !== this.tier) {
            this.tier = tier;
            this.model.setTier(tier);
        }
        const visible = snake.alive && snake.body.length > 0;
        this.model.group.visible = this.shadow.visible = visible;
        this.aim.visible = this.aimEnd.visible = visible && this.isMine;

        const dir = vec(snake.dir);
        const up = vec(snake.up);
        const left = vec(cross(snake.up, snake.dir)); // x local = haut × avant
        this.targetQuat.setFromRotationMatrix(new THREE.Matrix4().makeBasis(left, up, dir));
        if (this.#teleported()) this.headQuat.copy(this.targetQuat);
    }

    #teleported() {
        if (!this.prev?.body.length || !this.cur.body.length) return true;
        const a = this.prev.body[0];
        const b = this.cur.body[0];
        return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 1;
    }

    #lerpCell(i, alpha, out) {
        const cur = this.cur.body[i];
        cellToWorld(cur, this.size, out);
        const prevBody = this.prev?.body;
        if (!prevBody?.length) return out;
        const from = prevBody[Math.min(i, prevBody.length - 1)];
        const dist = Math.abs(from[0] - cur[0]) + Math.abs(from[1] - cur[1]) + Math.abs(from[2] - cur[2]);
        if (dist > 1) return out;
        return out.lerp(cellToWorld(from, this.size, new THREE.Vector3()), 1 - alpha);
    }

    update(alpha, time, dt) {
        if (!this.cur?.alive || !this.cur.body.length) return;
        const body = this.cur.body;
        // Chemin interpolé, sans doublons (segments empilés après réapparition).
        const points = [];
        for (let i = 0; i < body.length; i++) {
            const p = this.#lerpCell(i, alpha, new THREE.Vector3());
            if (!points.length || p.distanceToSquared(points.at(-1)) > 0.0004) points.push(p);
        }
        this.headPos.copy(points[0]);
        this.headQuat.rotateTowards(this.targetQuat, dt * 11);
        // La tête dépasse légèrement vers l'avant : le corps reste derrière elle.
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.headQuat);
        const path = [this.headPos.clone().addScaledVector(forward, 0.12), ...points.slice(1)];
        if (path.length === 1) path.push(this.headPos.clone().addScaledVector(forward, -0.3));
        this.model.setPath(path, this.headQuat);

        // Clignote pendant l'invulnérabilité.
        this.model.setOpacity(this.cur.invulnerable ? (Math.sin(time / 60) > 0 ? 0.9 : 0.3) : 1);
        this.model.update(dt);

        this.shadow.position.set(this.headPos.x, -this.size / 2 + 0.02, this.headPos.z);
        this.#emitTrail(dt);

        if (this.isMine) {
            const dir = vec(this.cur.dir);
            const start = this.headPos.clone().addScaledVector(dir, 0.55);
            const end = this.headPos.clone().addScaledVector(dir, this.aimRun + 0.5);
            const pos = this.aimGeo.attributes.position;
            pos.setXYZ(0, start.x, start.y, start.z);
            pos.setXYZ(1, end.x, end.y, end.z);
            pos.needsUpdate = true;
            this.aim.computeLineDistances();
            this.aimEnd.position.copy(end);
            this.aimEnd.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
            this.aimEnd.scale.setScalar(1 + 0.15 * Math.sin(time / 120));
        }
    }

    // Traînée de particules depuis la queue (plus dense à chaque évolution).
    #emitTrail(dt) {
        const style = TRAIL_STYLE[this.cur.cosmetics?.trail] ?? TRAIL_STYLE.sparks;
        const tail = this.model.tail;
        if (!style.rate || !tail) return;
        this.trailAcc += dt * style.rate * (0.6 + this.tier * 0.3) * this.effects.density;
        const color = style.color ?? this.model.glowColor;
        while (this.trailAcc >= 1) {
            this.trailAcc--;
            const frames = this.model.frames;
            // Surtout à la queue, parfois le long du corps aux paliers élevés.
            const f = this.tier >= 3 && Math.random() < 0.35 ? frames[Math.floor(Math.random() * frames.length)] : tail;
            const vel = new THREE.Vector3().randomDirection().multiplyScalar(style.speed).addScaledVector(f.t, 0.4);
            this.effects.emit(f.c, color, { vel, life: style.life, size: style.size * (this.tier >= 4 ? 1.4 : 1), gravity: style.gravity });
        }
    }

    // Effets ponctuels déclenchés par les événements du serveur.
    onEat(golden) {
        this.model.eat(golden);
    }

    onHurt() {
        this.model.hurt();
    }

    dispose() {
        this.model.dispose();
        this.scene.remove(this.shadow, this.aim, this.aimEnd);
    }
}
