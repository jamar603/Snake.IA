import * as THREE from "three";
import { evolutionFor } from "/shared/cosmetics.js";
import { cross, equals } from "/shared/grid.js";
import { cellToWorld, vec } from "./coords.js";
import { SnakeModel } from "./SnakeModel.js";
import { glowTexture } from "./textures.js";

const DANGER = new THREE.Color(0xff3b5c);
const CAUTION = new THREE.Color(0xffb02e);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const AIM_POINTS = 24;
const ARC = 0.55; // hauteur de l'arc qui contourne une arête du cube

const TRAIL_STYLE = {
    sparks: { rate: 26, speed: 1.2, life: 0.45, size: 0.22, gravity: 0, color: null },
    embers: { rate: 22, speed: 0.6, life: 0.9, size: 0.26, gravity: -1.2, color: 0xff9a3d },
    stardust: { rate: 18, speed: 0.25, life: 1.3, size: 0.2, gravity: 0, color: 0xfff6c8 },
    none: { rate: 0 },
};

// Un Snake en jeu : interpole les positions entre deux ticks serveur, nourrit le modèle 3D,
// émet la traînée et affiche les aides du joueur local (rayon de visée, flèches de virage).
// Sur le CUBE, le corps et l'interpolation contournent les arêtes par un petit arc,
// et `edge` annonce à la caméra le passage imminent sur une autre face.
export class SnakeView {
    constructor(scene, size, effects, cosmetics, map) {
        this.scene = scene;
        this.size = size;
        this.map = map;
        this.effects = effects;
        this.model = new SnakeModel(cosmetics);
        scene.add(this.model.group);
        this.cosmeticsKey = JSON.stringify(cosmetics);

        // Ombre lumineuse plaquée sur la face sous la tête.
        this.shadow = new THREE.Mesh(
            new THREE.CircleGeometry(0.45, 24),
            new THREE.MeshBasicMaterial({ map: glowTexture(), color: this.model.glowColor, transparent: true, opacity: 0.55, depthWrite: false })
        );
        scene.add(this.shadow);

        // Cube 3D : fil de hauteur tête -> sol, pour lire la profondeur dans le volume.
        this.depthGeo = new THREE.BufferGeometry();
        this.depthGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(6), 3));
        this.depthLine = new THREE.Line(
            this.depthGeo,
            new THREE.LineDashedMaterial({ color: this.model.glowColor, dashSize: 0.1, gapSize: 0.1, transparent: true, opacity: 0.45, depthWrite: false })
        );
        this.depthLine.frustumCulled = false;
        this.depthLine.visible = false;
        scene.add(this.depthLine);
        this.floorY = 0;

        // Rayon de visée : jusqu'où on peut aller tout droit (il suit les arêtes du cube).
        this.aimGeo = new THREE.BufferGeometry();
        this.aimGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(AIM_POINTS * 3), 3));
        this.aim = new THREE.Line(
            this.aimGeo,
            new THREE.LineDashedMaterial({ color: this.model.glowColor, dashSize: 0.16, gapSize: 0.12, transparent: true, opacity: 0.7 })
        );
        this.aim.frustumCulled = false;
        this.aimEnd = new THREE.Mesh(
            new THREE.RingGeometry(0.2, 0.28, 32),
            new THREE.MeshBasicMaterial({ color: this.model.glowColor, side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending })
        );
        scene.add(this.aim, this.aimEnd);

        // Flèches de virage autour de la tête (Snake du joueur) : gauche et droite, plus haut et
        // bas dans le Cube 3D. Rouge = mur juste derrière, ambre = peu de place, clair = voie libre.
        this.guides = {};
        const arrowGeo = new THREE.ConeGeometry(0.09, 0.22, 4);
        arrowGeo.rotateX(Math.PI / 2); // pointe vers +z
        for (const turn of ["left", "right", "up", "down"]) {
            const m = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false }));
            m.visible = false;
            scene.add(m);
            this.guides[turn] = { mesh: m, run: 0, dir: [0, 0, 1] };
        }

        this.prev = null;
        this.cur = null;
        this.headPos = new THREE.Vector3();
        this.headQuat = new THREE.Quaternion();
        this.targetQuat = new THREE.Quaternion();
        this.aimRun = 0;
        this.isMine = false;
        this.trailAcc = 0;
        this.tier = 1;
        this.edge = { t: 0, normal: new THREE.Vector3(0, 1, 0), next: new THREE.Vector3(0, 1, 0) };
    }

    setMap(map, size) {
        this.map = map;
        this.size = size;
    }

    setTurnRuns(runs) {
        for (const [turn, info] of Object.entries(runs)) if (this.guides[turn]) Object.assign(this.guides[turn], info);
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
        // Compétences actives : le modèle les montre (bouclier, phase, sprint).
        const active = (id) => (snake.skills?.[id]?.activeMs ?? 0) > 0;
        this.sprinting = active("sprint");
        this.model.setSkills({ sprint: this.sprinting, shield: active("shield"), phase: active("phase"), shieldMs: snake.skills?.shield?.activeMs ?? 0 });
        const visible = snake.alive && snake.body.length > 0;
        const volume = this.map?.kind === "volume";
        this.model.group.visible = this.shadow.visible = visible;
        this.depthLine.visible = visible && volume;
        this.aim.visible = this.aimEnd.visible = visible && this.isMine;
        for (const [turn, g] of Object.entries(this.guides)) {
            g.mesh.visible = visible && this.isMine && (volume || turn === "left" || turn === "right");
        }

        const dir = vec(snake.dir);
        const up = vec(snake.up);
        const left = vec(cross(snake.up, snake.dir)); // x local = haut × avant
        this.targetQuat.setFromRotationMatrix(new THREE.Matrix4().makeBasis(left, up, dir));
        if (this.#teleported()) this.headQuat.copy(this.targetQuat);
        if (visible) this.#watchEdge(snake);
    }

    // Arête dans 1 ou 2 cases : la caméra commence à pencher vers la face suivante.
    #watchEdge(snake) {
        this.edge.normal.set(...snake.up);
        if (this.map?.kind !== "cube") {
            this.edge.t = 0; // pas d'arête hors du cube de surface
            return;
        }
        const ray = this.map?.ray(snake.body[0], snake.dir, 2) ?? [];
        const i = ray.findIndex((c) => this.map.isCell(c) && !equals(this.map.normalAt(c), snake.up));
        this.edge.t = i < 0 ? 0 : i === 0 ? 1 : 0.5;
        this.edge.next.set(...(i < 0 ? snake.up : this.map.normalAt(ray[i])));
    }

    #teleported() {
        if (!this.prev?.body.length || !this.cur.body.length) return true;
        const a = this.prev.body[0];
        const b = this.cur.body[0];
        return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 2; // 2 = sprint ou arête
    }

    #normal(cell) {
        return this.map ? vec(this.map.normalAt(cell)) : new THREE.Vector3(0, 1, 0);
    }

    // Point d'appui pour contourner l'arête entre deux cases de faces différentes.
    #arcPoint(a, b, out) {
        const pa = cellToWorld(a, this.size);
        const pb = cellToWorld(b, this.size);
        return out.addVectors(pa, pb).multiplyScalar(0.5).addScaledVector(this.#normal(a).add(this.#normal(b)), ARC);
    }

    #crossesEdge(a, b) {
        return this.map?.kind === "cube" && !equals(this.map.normalAt(a), this.map.normalAt(b));
    }

    #lerpCell(i, alpha, out) {
        const cur = this.cur.body[i];
        cellToWorld(cur, this.size, out);
        const prevBody = this.prev?.body;
        if (!prevBody?.length) return out;
        const from = prevBody[Math.min(i, prevBody.length - 1)];
        const dist = Math.abs(from[0] - cur[0]) + Math.abs(from[1] - cur[1]) + Math.abs(from[2] - cur[2]);
        if (dist > 2) return out; // au-delà : téléportation (réapparition, portail)
        const start = cellToWorld(from, this.size, new THREE.Vector3());
        if (dist === 2 && this.#crossesEdge(from, cur) && this.map.isCell(from)) {
            // Passage d'arête : courbe de Bézier par-dessus l'arête (jamais à travers le cube).
            const ctrl = this.#arcPoint(from, cur, new THREE.Vector3());
            const t = alpha;
            return out
                .copy(start)
                .multiplyScalar((1 - t) * (1 - t))
                .addScaledVector(ctrl, 2 * (1 - t) * t)
                .addScaledVector(cellToWorld(cur, this.size), t * t);
        }
        return out.lerp(start, 1 - alpha);
    }

    update(alpha, time, dt) {
        if (!this.cur?.alive || !this.cur.body.length) return;
        const body = this.cur.body;
        // Chemin interpolé, sans doublons (segments empilés après réapparition) ;
        // un point d'arc est ajouté là où le corps passe d'une face à l'autre.
        const points = [];
        for (let i = 0; i < body.length; i++) {
            const p = this.#lerpCell(i, alpha, new THREE.Vector3());
            if (i > 0 && this.#crossesEdge(body[i - 1], body[i]) && this.map.neighbors(body[i - 1]).some((n) => equals(n, body[i]))) {
                points.push(this.#arcPoint(body[i - 1], body[i], new THREE.Vector3()));
            }
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

        if (this.map?.kind === "volume") this.#volumeShadow();
        else {
            // Ombre : plaquée sur la face, juste sous la tête.
            const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.headQuat);
            this.shadow.position.copy(this.headPos).addScaledVector(up, -0.47);
            this.shadow.quaternion.setFromUnitVectors(Z_AXIS, up);
            this.shadow.scale.setScalar(1);
        }
        this.shadow.material.color.copy(this.model.glowColor);
        this.#emitTrail(dt);

        if (this.isMine) this.#updateAids(time);
    }

    // Cube 3D : ombre au sol sous la tête (plus petite et plus pâle en hauteur) et fil de hauteur.
    #volumeShadow() {
        this.shadow.position.set(this.headPos.x, this.floorY + 0.02, this.headPos.z);
        this.shadow.quaternion.setFromUnitVectors(Z_AXIS, new THREE.Vector3(0, 1, 0));
        const height = this.headPos.y - this.floorY;
        this.shadow.scale.setScalar(1.15 - Math.min(0.5, height * 0.05));
        this.shadow.material.opacity = 0.6 - Math.min(0.35, height * 0.03);
        const line = this.depthGeo.attributes.position;
        line.setXYZ(0, this.headPos.x, this.headPos.y - 0.3, this.headPos.z);
        line.setXYZ(1, this.headPos.x, this.floorY + 0.03, this.headPos.z);
        line.needsUpdate = true;
        this.depthLine.computeLineDistances();
        this.depthLine.material.color.copy(this.model.glowColor);
    }

    #updateAids(time) {
        // Rayon : de case en case sur `aimRun + 1` cases, en suivant les arêtes.
        const cells = this.map ? this.map.ray(this.cur.body[0], this.cur.dir, Math.min(AIM_POINTS - 2, this.aimRun + 1)) : [];
        const pos = this.aimGeo.attributes.position;
        const dir = vec(this.cur.dir);
        const start = this.headPos.clone().addScaledVector(dir, 0.55);
        pos.setXYZ(0, start.x, start.y, start.z);
        const tmp = new THREE.Vector3();
        cells.forEach((c, i) => {
            cellToWorld(c, this.size, tmp);
            pos.setXYZ(i + 1, tmp.x, tmp.y, tmp.z);
        });
        this.aimGeo.setDrawRange(0, cells.length + 1);
        pos.needsUpdate = true;
        this.aim.computeLineDistances();
        const last = cells.at(-1);
        if (last) {
            cellToWorld(last, this.size, this.aimEnd.position);
            // Cube 3D : l'anneau fait face à la direction ; ailleurs, il est couché sur la face.
            this.aimEnd.quaternion.setFromUnitVectors(Z_AXIS, this.map?.kind === "volume" ? dir : this.#normal(last));
        }
        this.aimEnd.scale.setScalar(1 + 0.15 * Math.sin(time / 120));
        // Obstacle droit devant : le rayon vire au rouge (à 1 case) puis clignote (collé).
        const danger = this.aimRun <= 0 ? 1 : this.aimRun <= 1 ? 0.6 : 0;
        const aimColor = this.model.glowColor.clone().lerp(DANGER, danger);
        this.aim.material.color.copy(aimColor);
        this.aimEnd.material.color.copy(aimColor);
        this.aimEnd.material.opacity = this.aimRun <= 0 ? 0.5 + 0.5 * Math.abs(Math.sin(time / 90)) : 1;

        for (const g of Object.values(this.guides)) {
            const d = vec(g.dir);
            g.mesh.position.copy(this.headPos).addScaledVector(d, 0.72);
            g.mesh.quaternion.setFromUnitVectors(Z_AXIS, d);
            g.mesh.material.color.copy(g.run <= 0 ? DANGER : g.run <= 2 ? CAUTION : this.model.glowColor);
            g.mesh.material.opacity = g.run <= 0 ? 0.9 : 0.6;
            g.mesh.scale.setScalar(g.run <= 0 ? 0.8 : 1);
        }
    }

    // Traînée de particules depuis la queue (plus dense à chaque évolution).
    #emitTrail(dt) {
        const style = TRAIL_STYLE[this.cur.cosmetics?.trail] ?? TRAIL_STYLE.sparks;
        const tail = this.model.tail;
        if (!style.rate || !tail) return;
        const boost = this.sprinting ? 3 : 1; // sprint : traînée dense, sillage de vitesse
        this.trailAcc += dt * style.rate * (0.6 + this.tier * 0.3) * this.effects.density * boost;
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
        this.scene.remove(this.shadow, this.depthLine, this.aim, this.aimEnd, ...Object.values(this.guides).map((g) => g.mesh));
    }
}
