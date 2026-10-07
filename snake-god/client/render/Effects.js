import * as THREE from "three";
import { glowTexture } from "./textures.js";

const MAX_PARTICLES = 4000;

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

// Particules (taille, couleur et transparence par particule) et ondes de choc.
// Tous les effets du jeu passent par ici : traînées, gerbes, étincelles...
export class Effects {
    constructor(scene) {
        this.scene = scene;
        this.density = 1;
        this.pos = new Float32Array(MAX_PARTICLES * 3);
        this.col = new Float32Array(MAX_PARTICLES * 3);
        this.size = new Float32Array(MAX_PARTICLES);
        this.alpha = new Float32Array(MAX_PARTICLES);
        this.live = []; // { i, vel, life, maxLife, size, gravity, drag, color }
        this.free = Array.from({ length: MAX_PARTICLES }, (_, i) => MAX_PARTICLES - 1 - i);

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
                blending: THREE.AdditiveBlending,
            })
        );
        this.points.frustumCulled = false;
        scene.add(this.points);
        this.rings = [];
    }

    setViewportHeight(h) {
        this.points.material.uniforms.uScale.value = h * 0.5;
    }

    // Une particule. `opts` : vel, life, size, gravity, drag.
    emit(position, color, { vel = new THREE.Vector3(), life = 0.6, size = 0.25, gravity = 0, drag = 2 } = {}) {
        if (!this.free.length) return;
        const i = this.free.pop();
        this.pos.set([position.x, position.y, position.z], i * 3);
        const c = color instanceof THREE.Color ? color : new THREE.Color(color);
        this.live.push({ i, vel: vel.clone(), life, maxLife: life, size, gravity, drag, color: c });
    }

    burst(position, color, { count = 30, speed = 3, life = 0.7, size = 0.28, gravity = 0 } = {}) {
        const n = Math.round(count * this.density);
        for (let k = 0; k < n; k++) {
            const vel = new THREE.Vector3().randomDirection().multiplyScalar(speed * (0.35 + Math.random() * 0.65));
            this.emit(position, color, { vel, life: life * (0.6 + Math.random() * 0.6), size: size * (0.6 + Math.random() * 0.8), gravity });
        }
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
            const t = p.life / p.maxLife;
            this.alpha[i] = Math.min(1, t * 1.6);
            this.size[i] = p.size * (0.4 + 0.6 * t);
            this.col[i * 3] = p.color.r;
            this.col[i * 3 + 1] = p.color.g;
            this.col[i * 3 + 2] = p.color.b;
        }
        const a = this.points.geometry.attributes;
        a.position.needsUpdate = a.aColor.needsUpdate = a.aSize.needsUpdate = a.aAlpha.needsUpdate = true;

        for (let k = this.rings.length - 1; k >= 0; k--) {
            const r = this.rings[k];
            r.life += dt;
            const t = r.life / r.maxLife;
            const ease = 1 - Math.pow(1 - Math.min(t, 1), 3);
            r.mesh.scale.setScalar(1 + ease * r.size * 2.5);
            r.mesh.material.opacity = 1 - t;
            if (t >= 1) {
                this.scene.remove(r.mesh);
                r.mesh.geometry.dispose();
                r.mesh.material.dispose();
                this.rings.splice(k, 1);
            }
        }
    }

    clear() {
        for (const p of this.live) {
            this.alpha[p.i] = 0;
            this.free.push(p.i);
        }
        this.live = [];
    }
}
