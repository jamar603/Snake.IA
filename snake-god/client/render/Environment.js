import * as THREE from "three";
import { glowTexture, runeRingTexture } from "./textures.js";

// Couleur dominante du monde à chaque phase : la tension se lit dans la lumière.
export const PHASE_COLORS = {
    1: new THREE.Color(0x9d6bff),
    2: new THREE.Color(0xff4fd8),
    3: new THREE.Color(0xff8a3d),
    4: new THREE.Color(0xff2e4d),
};

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// Ciel : dégradé, nébuleuse et étoiles calculés dans le shader.
const SKY_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uTint;
varying vec3 vDir;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
float noise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float n = mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                  mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
    return n;
}
float fbm(vec3 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.1; a *= 0.5; } return v; }
void main() {
    vec3 d = normalize(vDir);
    float h = d.y * 0.5 + 0.5;
    vec3 col = mix(vec3(0.012, 0.01, 0.03), vec3(0.03, 0.035, 0.09), h);
    float neb = fbm(d * 2.4 + vec3(uTime * 0.01, 0.0, 0.0));
    float neb2 = fbm(d * 4.0 - vec3(0.0, uTime * 0.008, 0.0));
    col += uTint * pow(neb, 3.0) * 0.38;
    col += vec3(0.1, 0.35, 0.6) * pow(neb2, 4.0) * 0.4;
    vec3 sp = floor(d * 380.0);
    float star = step(0.9975, hash(sp));
    float tw = 0.6 + 0.4 * sin(uTime * 2.0 + hash(sp + 3.0) * 30.0);
    col += vec3(star * tw);
    gl_FragColor = vec4(col, 1.0);
}`;

// Décor autour du cube : ciel, socle runique, poussières flottantes, lumières.
export class Environment {
    constructor(scene, size) {
        this.scene = scene;
        this.size = size;
        this.tint = PHASE_COLORS[1].clone();
        this.targetTint = this.tint.clone();

        this.sky = new THREE.Mesh(
            new THREE.SphereGeometry(90, 32, 16),
            new THREE.ShaderMaterial({
                vertexShader: SKY_VERT,
                fragmentShader: SKY_FRAG,
                side: THREE.BackSide,
                depthWrite: false,
                fog: false,
                uniforms: { uTime: { value: 0 }, uTint: { value: this.tint } },
            })
        );
        scene.add(this.sky);

        const base = -size / 2 - 0.9;
        this.platform = new THREE.Group();
        this.platform.position.y = base;
        const disc = new THREE.Mesh(
            new THREE.CylinderGeometry(size * 0.95, size * 1.05, 0.5, 64),
            new THREE.MeshStandardMaterial({ color: 0x0d0b1a, metalness: 0.6, roughness: 0.35 })
        );
        disc.receiveShadow = true;
        this.platform.add(disc);
        this.runes = new THREE.Mesh(
            new THREE.CircleGeometry(size * 0.92, 64),
            new THREE.MeshBasicMaterial({
                map: runeRingTexture(),
                color: this.tint,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            })
        );
        this.runes.rotation.x = -Math.PI / 2;
        this.runes.position.y = 0.26;
        this.platform.add(this.runes);
        scene.add(this.platform);

        // Poussières lumineuses autour du monde.
        const n = 500;
        const pos = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            const r = size * (0.8 + Math.random() * 2.2);
            const a = Math.random() * Math.PI * 2;
            pos.set([Math.cos(a) * r, (Math.random() - 0.4) * size * 2.2, Math.sin(a) * r], i * 3);
        }
        const dustGeo = new THREE.BufferGeometry();
        dustGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        this.dust = new THREE.Points(
            dustGeo,
            new THREE.PointsMaterial({
                size: 0.12,
                map: glowTexture(),
                color: 0xc9b2ff,
                transparent: true,
                opacity: 0.7,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            })
        );
        scene.add(this.dust);

        scene.add(new THREE.HemisphereLight(0xb9c6ff, 0x1a0f2e, 1.1));
        this.key = new THREE.DirectionalLight(0xfff1e0, 2.2);
        this.key.position.set(7, 15, 9);
        this.key.castShadow = true;
        this.key.shadow.mapSize.set(1024, 1024);
        Object.assign(this.key.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 50 });
        this.key.shadow.bias = -0.0008;
        scene.add(this.key);
        const rim = new THREE.DirectionalLight(0x7fb6ff, 1.2);
        rim.position.set(-10, 4, -12);
        scene.add(rim);
        // Lueur venue de sous le monde : la présence du Snake God.
        this.godLight = new THREE.PointLight(this.tint, 45, 30, 1.6);
        this.godLight.position.set(0, base - 1, 0);
        scene.add(this.godLight);

        scene.fog = new THREE.FogExp2(0x070612, 0.018);
    }

    // Le socle suit la taille de l'arène (animé dans update).
    setArena(size) {
        this.arenaTarget = size;
    }

    setPhase(phase) {
        this.targetTint.copy(PHASE_COLORS[phase] ?? PHASE_COLORS[1]);
    }

    setShadows(on) {
        this.key.castShadow = on;
    }

    update(time, dt) {
        this.tint.lerp(this.targetTint, 1 - Math.exp(-dt * 1.5));
        if (this.arenaTarget) {
            this.arenaSize ??= this.size;
            this.arenaSize += (this.arenaTarget - this.arenaSize) * (1 - Math.exp(-dt * 3));
            const k = this.arenaSize / this.size;
            this.platform.scale.set(k, 1, k);
            this.platform.position.y = -this.arenaSize / 2 - 0.9;
            this.godLight.position.y = this.platform.position.y - 1;
        }
        this.sky.material.uniforms.uTime.value = time / 1000;
        this.runes.rotation.z += dt * 0.05;
        this.dust.rotation.y += dt * 0.015;
        this.godLight.color.copy(this.tint);
        this.runes.material.color.copy(this.tint);
        this.godLight.intensity = 40 + Math.sin(time / 700) * 10;
    }
}
