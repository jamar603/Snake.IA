import * as THREE from "three";
import { glowTexture } from "./textures.js";

const MAX_PARTICLES = 4000;
const MAX_SMOKE = 600;
const MAX_DEBRIS = 220;

const VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
uniform float uScale;
void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
varying float vAlpha;
varying vec3 vColor;
void main() {
    vec4 t = texture2D(uMap, gl_PointCoord);
    gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
}`;

const ease = (t) => 1 - Math.pow(1 - t, 3);
const tmpColor = new THREE.Color();

// Un lot de particules (même mélange de couleurs) : position, couleur, taille, transparence.
// Chaque particule peut changer de couleur (chaud -> froid) et grossir pendant sa vie.
class ParticlePool {
    constructor(scene, max, blending) {
        this.max = max;
        this.pos = new Float32Array(max * 3);
        this.col = new Float32Array(max * 3);
        this.size = new Float32Array(max);
        this.alpha = new Float32Array(max);
        this.live = [];
        this.free = Array.from({ length: max }, (_, i) => max - 1 - i);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
        geo.setAttribute("aColor", new THREE.BufferAttribute(this.col, 3));
        geo.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1));
        geo.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1));
        this.points = new THREE.Points(
            geo,
            new THREE.ShaderMaterial({
                vertexShader: VERT,
                fragmentShader: FRAG,
                uniforms: { uMap: { value: glowTexture() }, uScale: { value: 300 } },
                transparent: true,
                depthWrite: false,
                blending,
            })
        );
        this.points.frustumCulled = false;
        scene.add(this.points);
    }

    emit(position, color, { vel = new THREE.Vector3(), life = 0.6, size = 0.25, gravity = 0, drag = 2, endColor = null, grow = 0, opacity = 1 }) {
        if (!this.free.length) return;
        const i = this.free.pop();
        this.pos.set([position.x, position.y, position.z], i * 3);
        const c = color instanceof THREE.Color ? color.clone() : new THREE.Color(color);
        const end = endColor == null ? c : endColor instanceof THREE.Color ? endColor : new THREE.Color(endColor);
        this.live.push({ i, vel: vel.clone(), life, maxLife: life, size, gravity, drag, color: c, endColor: end, grow, opacity });
    }

    update(dt) {
        for (let k = this.live.length - 1; k >= 0; k--) {
            const p = this.live[k];
            p.life -= dt;
            const i = p.i;
            if (p.life <= 0) {
                this.alpha[i] = 0;
                this.size[i] = 0;
                this.free.push(i);
                this.live.splice(k, 1);
                continue;
            }
            p.vel.multiplyScalar(Math.max(0, 1 - dt * p.drag));
            p.vel.y -= p.gravity * dt;
            this.pos[i * 3] += p.vel.x * dt;
            this.pos[i * 3 + 1] += p.vel.y * dt;
            this.pos[i * 3 + 2] += p.vel.z * dt;
            const t = p.life / p.maxLife; // 1 -> 0
            const age = 1 - t;
            // Apparition rapide, disparition douce.
            this.alpha[i] = Math.min(1, t * 1.6) * Math.min(1, age * 12) * p.opacity;
            this.size[i] = p.grow ? p.size * (1 + ease(age) * p.grow) : p.size * (0.4 + 0.6 * t);
            tmpColor.copy(p.color).lerp(p.endColor, ease(age));
            this.col[i * 3] = tmpColor.r;
            this.col[i * 3 + 1] = tmpColor.g;
            this.col[i * 3 + 2] = tmpColor.b;
        }
        const a = this.points.geometry.attributes;
        a.position.needsUpdate = a.aColor.needsUpdate = a.aSize.needsUpdate = a.aAlpha.needsUpdate = true;
    }

    clear() {
        for (const p of this.live) {
            this.alpha[p.i] = 0;
            this.free.push(p.i);
        }
        this.live = [];
    }
}

// Particules lumineuses, fumée, débris et ondes de choc.
// Tous les effets du jeu passent par ici : traînées, gerbes, explosions...
export class Effects {
    constructor(scene) {
        this.scene = scene;
        this.density = 1;
        this.floorY = -Infinity; // les débris rebondissent sur le sol de l'arène
        this.glow = new ParticlePool(scene, MAX_PARTICLES, THREE.AdditiveBlending);
        this.smoke = new ParticlePool(scene, MAX_SMOKE, THREE.NormalBlending);
        this.rings = [];
        this.flashes = [];

        // Débris : petits éclats qui tournent, tombent et rebondissent.
        this.debrisMesh = new THREE.InstancedMesh(
            new THREE.DodecahedronGeometry(0.07, 0),
            new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.2, flatShading: true }),
            MAX_DEBRIS
        );
        this.debrisMesh.frustumCulled = false;
        this.debrisMesh.count = 0;
        this.debrisMesh.castShadow = true;
        scene.add(this.debrisMesh);
        this.debris = [];
        this.matrix = new THREE.Matrix4();
        this.quat = new THREE.Quaternion();
        this.euler = new THREE.Euler();
        this.scaleVec = new THREE.Vector3();
    }

    setViewportHeight(h) {
        this.glow.points.material.uniforms.uScale.value = h * 0.5;
        this.smoke.points.material.uniforms.uScale.value = h * 0.5;
    }

    // Une particule lumineuse. `opts` : vel, life, size, gravity, drag, endColor, grow.
    emit(position, color, opts = {}) {
        this.glow.emit(position, color, opts);
    }

    burst(position, color, { count = 30, speed = 3, life = 0.7, size = 0.28, gravity = 0, endColor = null } = {}) {
        const n = Math.round(count * this.density);
        for (let k = 0; k < n; k++) {
            const vel = new THREE.Vector3().randomDirection().multiplyScalar(speed * (0.35 + Math.random() * 0.65));
            this.emit(position, color, { vel, life: life * (0.6 + Math.random() * 0.6), size: size * (0.6 + Math.random() * 0.8), gravity, endColor });
        }
    }

    // Éclair bref au centre d'un impact (150 ms) : l'œil lit l'instant du choc.
    flash(position, color = 0xffffff, scale = 2.5) {
        const sprite = new THREE.Sprite(
            new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        sprite.position.copy(position);
        sprite.scale.setScalar(scale);
        this.scene.add(sprite);
        this.flashes.push({ sprite, life: 0, maxLife: 0.15, scale });
    }

    // Explosion en couches : éclair, boule de feu qui refroidit, étincelles, fumée,
    // débris et onde de choc. `scale` règle la taille de l'ensemble.
    explosion(position, { color = 0xff7a2e, hot = 0xfff2c4, scale = 1, smoke = true, debris = 0, debrisColor = 0x3a2c40, sparks = 1 } = {}) {
        const d = this.density;
        const base = new THREE.Color(color);
        const dark = base.clone().multiplyScalar(0.25);
        this.flash(position, hot, 2.6 * scale);
        // Boule de feu : part blanche, devient la couleur de l'explosion puis sombre.
        for (let k = 0; k < Math.round(22 * scale * d); k++) {
            const vel = new THREE.Vector3().randomDirection().multiplyScalar((1.2 + Math.random() * 2.2) * scale);
            this.glow.emit(position, hot, { vel, life: 0.35 + Math.random() * 0.3, size: 0.55 * scale, drag: 5, endColor: dark, grow: 1.4 });
        }
        // Étincelles rapides qui retombent.
        for (let k = 0; k < Math.round(34 * scale * sparks * d); k++) {
            const vel = new THREE.Vector3().randomDirection().multiplyScalar((4 + Math.random() * 4) * scale);
            vel.y += 1.5 * scale;
            this.glow.emit(position, hot, { vel, life: 0.5 + Math.random() * 0.5, size: 0.12, drag: 1.2, gravity: 9, endColor: base });
        }
        // Fumée : monte lentement en grossissant.
        if (smoke) {
            for (let k = 0; k < Math.round(10 * scale * d); k++) {
                const vel = new THREE.Vector3().randomDirection().multiplyScalar(0.8 * scale);
                vel.y = Math.abs(vel.y) + 0.4;
                const p = position.clone().addScaledVector(vel, 0.15);
                this.smoke.emit(p, 0x3a3046, { vel, life: 1.2 + Math.random() * 0.8, size: 0.6 * scale, drag: 1.5, gravity: -0.6, endColor: 0x15121e, grow: 2.2, opacity: 0.55 });
            }
        }
        for (let k = 0; k < Math.round(debris * d); k++) this.#spawnDebris(position, debrisColor, scale);
        this.ring(position, base, { size: 1.4 * scale, life: 0.45, width: 0.12 });
    }

    #spawnDebris(position, color, scale) {
        if (this.debris.length >= MAX_DEBRIS) this.debris.shift();
        const vel = new THREE.Vector3().randomDirection().multiplyScalar((2.5 + Math.random() * 3) * scale);
        vel.y = Math.abs(vel.y) * 1.2 + 1.5;
        this.debris.push({
            pos: position.clone(),
            vel,
            rot: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
            spin: new THREE.Vector3().randomDirection().multiplyScalar(8 + Math.random() * 10),
            size: (0.6 + Math.random() * 1.2) * scale,
            life: 1.6 + Math.random() * 0.8,
            maxLife: 2.4,
            color: new THREE.Color(color).offsetHSL(0, 0, (Math.random() - 0.5) * 0.15),
        });
    }

    ring(position, color, { normal = new THREE.Vector3(0, 1, 0), size = 1.6, life = 0.6, width = 0.1 } = {}) {
        const mesh = new THREE.Mesh(
            new THREE.RingGeometry(0.4 - width, 0.4, 48),
            new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                side: THREE.DoubleSide,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            })
        );
        mesh.position.copy(position);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
        this.scene.add(mesh);
        this.rings.push({ mesh, life: 0, maxLife: life, size });
    }

    update(dt) {
        this.glow.update(dt);
        this.smoke.update(dt);

        for (let k = this.rings.length - 1; k >= 0; k--) {
            const r = this.rings[k];
            r.life += dt;
            const t = r.life / r.maxLife;
            r.mesh.scale.setScalar(1 + ease(Math.min(t, 1)) * r.size * 2.5);
            r.mesh.material.opacity = (1 - t) * (1 - t);
            if (t >= 1) {
                this.scene.remove(r.mesh);
                r.mesh.geometry.dispose();
                r.mesh.material.dispose();
                this.rings.splice(k, 1);
            }
        }

        for (let k = this.flashes.length - 1; k >= 0; k--) {
            const f = this.flashes[k];
            f.life += dt;
            const t = Math.min(1, f.life / f.maxLife);
            f.sprite.material.opacity = 1 - t;
            f.sprite.scale.setScalar(f.scale * (1 + 0.6 * ease(t)));
            if (t >= 1) {
                this.scene.remove(f.sprite);
                f.sprite.material.dispose();
                this.flashes.splice(k, 1);
            }
        }

        // Débris : gravité, rebond amorti sur le sol, rétrécissent en fin de vie.
        let n = 0;
        for (let k = this.debris.length - 1; k >= 0; k--) {
            const b = this.debris[k];
            b.life -= dt;
            if (b.life <= 0) {
                this.debris.splice(k, 1);
                continue;
            }
            b.vel.y -= 14 * dt;
            b.pos.addScaledVector(b.vel, dt);
            if (b.pos.y < this.floorY + 0.05) {
                b.pos.y = this.floorY + 0.05;
                b.vel.y *= -0.35;
                b.vel.x *= 0.6;
                b.vel.z *= 0.6;
                b.spin.multiplyScalar(0.6);
            }
            b.rot.addScaledVector(b.spin, dt);
            const s = b.size * Math.min(1, b.life / 0.4);
            this.quat.setFromEuler(this.euler.set(b.rot.x, b.rot.y, b.rot.z));
            this.matrix.compose(b.pos, this.quat, this.scaleVec.set(s, s, s));
            this.debrisMesh.setMatrixAt(n, this.matrix);
            this.debrisMesh.setColorAt(n, b.color);
            n++;
        }
        this.debrisMesh.count = n;
        this.debrisMesh.instanceMatrix.needsUpdate = true;
        if (this.debrisMesh.instanceColor) this.debrisMesh.instanceColor.needsUpdate = true;
    }

    clear() {
        this.glow.clear();
        this.smoke.clear();
        this.debris = [];
        this.debrisMesh.count = 0;
    }
}
