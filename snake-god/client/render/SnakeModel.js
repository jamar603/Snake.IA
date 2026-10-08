import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { SKINS } from "/shared/cosmetics.js";
import { glowTexture, scaleNormalTexture, snakeSkinTextures } from "./textures.js";

// Anneaux du tube : la capacité grandit avec le Snake (plus de queue tronquée au-delà
// d'environ 116 cases), et la subdivision baisse quand il devient très long pour garder
// un coût par image borné (RING_BUDGET anneaux au plus, sauf corps immense).
const START_RINGS = 700;
const RING_BUDGET = 1500;
const RADIAL = 24;
// Cosinus et sinus autour du tube, calculés une fois (au lieu de 2 × 25 par anneau et par image).
const RING_COS = Float32Array.from({ length: RADIAL + 1 }, (_, j) => Math.cos((j / RADIAL) * Math.PI * 2));
const RING_SIN = Float32Array.from({ length: RADIAL + 1 }, (_, j) => Math.sin((j / RADIAL) * Math.PI * 2));
const UV_PER_UNIT = 0.9; // u de la peau par unité de longueur (corps et crâne)
const GAP = 1.8; // au-delà, deux points du chemin ne se touchent pas (téléporteur)
const easeOut = (t) => 1 - Math.pow(1 - t, 4);

// Bulle du Bouclier : bord lumineux (Fresnel) et alvéoles qui défilent, centre transparent.
const SHIELD_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vPos;
void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    vPos = position;
    gl_Position = projectionMatrix * mv;
}`;
const SHIELD_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uOpacity;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vPos;
void main() {
    float rim = pow(1.0 - abs(dot(vNormal, vView)), 2.5);
    vec2 h = vec2(atan(vPos.z, vPos.x) * 4.0, vPos.y * 9.0 + uTime * 1.5);
    vec2 g = abs(fract(h) - 0.5);
    float cell = smoothstep(0.42, 0.5, max(g.x, g.y));
    float a = (rim * 0.9 + cell * 0.25) * uOpacity;
    gl_FragColor = vec4(uColor * (0.6 + rim), a);
}`;

// Crâne sculpté dans Blender (blender/build_snake.py), chargé une fois pour tous les Snakes.
// UV calculées ici comme pour le corps : u le long du corps, v autour (0 et 1 = dos).
let skullGeometry = null;
const skullReady = new GLTFLoader()
    .loadAsync("/assets/snake.glb")
    .then((gltf) => {
        let geo = null;
        gltf.scene.traverse((o) => o.isMesh && (geo ??= o.geometry));
        const pos = geo.attributes.position;
        const uv = new Float32Array(pos.count * 2);
        for (let i = 0; i < pos.count; i++) {
            const a = Math.atan2(pos.getX(i), pos.getY(i));
            uv[i * 2] = -pos.getZ(i) * UV_PER_UNIT;
            uv[i * 2 + 1] = 1 - (a < 0 ? a + Math.PI * 2 : a) / (Math.PI * 2);
        }
        geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
        skullGeometry = geo;
        return geo;
    })
    .catch((err) => console.warn("Crâne introuvable, tête simple utilisée :", err));
const SUBDIV = 6; // échantillons par case de grille (Snake court)
const MIN_SUBDIV = 2; // jamais moins : les virages restent arrondis
const FIN_MAX = 90;

// Modèle 3D d'un Snake : corps tubulaire continu (reconstruit à chaque image
// le long du chemin), tête modélisée, accessoires et parties d'évolution.
// Utilisé en jeu (SnakeView) et dans les menus (aperçu de personnalisation).
export class SnakeModel {
    constructor(cosmetics) {
        this.group = new THREE.Group();
        this.time = 0;
        this.tier = 1;
        this.bulges = []; // { dist, amp }
        this.hurtT = 0;
        this.chompT = 0;
        this.mouthTarget = 0;
        this.mouth = 0;
        this.blinkAt = 1 + Math.random() * 3;
        this.tongueAt = 2 + Math.random() * 3;
        this.opacity = 1;
        this.skills = { sprint: false, shield: false, phase: false, shieldMs: 0 };
        this.shieldT = 0; // 0 -> 1 : apparition de la bulle
        this.phaseT = 0;
        this.samples = []; // réserve de Vector3 réutilisés d'une image à l'autre
        this.sampleCount = 0;
        this.frames = []; // repères du corps (centre, tangente, normale, rayon), réutilisés
        this.capacity = 0;
        this.length = 0;

        this.#buildBody();
        this.#buildHead();
        this.#buildEvolutionParts();
        this.setCosmetics(cosmetics);
        this.setTier(1);
    }

    // ---------- Construction ----------
    #buildBody() {
        // Écailles en relief (normal map) et vernis léger : la peau accroche la lumière.
        this.bodyMat = new THREE.MeshPhysicalMaterial({
            roughness: 0.45,
            metalness: 0.1,
            emissive: 0xffffff,
            normalMap: scaleNormalTexture(),
            normalScale: new THREE.Vector2(0.9, 0.9),
            clearcoat: 0.35,
            clearcoatRoughness: 0.35,
        });
        this.body = new THREE.Mesh(new THREE.BufferGeometry(), this.bodyMat);
        this.body.frustumCulled = false;
        this.body.castShadow = true;
        this.group.add(this.body);
        this.#ensureCapacity(START_RINGS);
    }

    // Tampons du tube pour `rings` anneaux au moins (capacité doublée si besoin).
    #ensureCapacity(rings) {
        if (rings <= this.capacity) return;
        const cap = Math.max(rings, this.capacity * 2);
        const verts = cap * (RADIAL + 1);
        this.posArr = new Float32Array(verts * 3);
        this.nrmArr = new Float32Array(verts * 3);
        this.uvArr = new Float32Array(verts * 2);
        this.lengths = new Float32Array(cap);
        this.gaps = new Uint8Array(cap);
        const index = new (verts > 65535 ? Uint32Array : Uint16Array)((cap - 1) * RADIAL * 6);
        let w = 0;
        for (let i = 0; i < cap - 1; i++) {
            for (let j = 0; j < RADIAL; j++) {
                const a = i * (RADIAL + 1) + j;
                const b = a + RADIAL + 1;
                index[w++] = a;
                index[w++] = b;
                index[w++] = a + 1;
                index[w++] = b;
                index[w++] = b + 1;
                index[w++] = a + 1;
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(this.posArr, 3).setUsage(THREE.DynamicDrawUsage));
        geo.setAttribute("normal", new THREE.BufferAttribute(this.nrmArr, 3).setUsage(THREE.DynamicDrawUsage));
        geo.setAttribute("uv", new THREE.BufferAttribute(this.uvArr, 2).setUsage(THREE.DynamicDrawUsage));
        geo.setIndex(new THREE.BufferAttribute(index, 1));
        geo.setDrawRange(0, 0);
        // Corps jamais coupé par la caméra (frustumCulled = false) : une sphère fixe suffit,
        // inutile de la recalculer sur tous les sommets à chaque image.
        geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
        this.body.geometry.dispose();
        this.body.geometry = geo;
        this.capacity = cap;
    }

    #buildHead() {
        const head = new THREE.Group();
        this.head = head;
        this.headMat = this.bodyMat; // même peau que le corps
        this.jawMat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.1 });
        const sphere = new THREE.SphereGeometry(1, 32, 20);

        const skull = new THREE.Mesh(sphere, this.headMat);
        skull.scale.set(0.4, 0.29, 0.52);
        skull.position.set(0, 0.03, 0.02);
        const snout = new THREE.Mesh(sphere, this.headMat);
        snout.scale.set(0.3, 0.2, 0.3);
        snout.position.set(0, 0.0, 0.36);
        head.add(skull, snout);
        this.simpleSkull = [skull, snout];

        // Mâchoire inférieure articulée.
        this.jaw = new THREE.Group();
        this.jaw.position.set(0, -0.08, -0.12);
        const jawMesh = new THREE.Mesh(sphere, this.jawMat);
        jawMesh.scale.set(0.27, 0.08, 0.36);
        jawMesh.position.set(0, -0.05, 0.36);
        this.jaw.add(jawMesh);
        const mouth = new THREE.Mesh(sphere, new THREE.MeshStandardMaterial({ color: 0x5a0d1e, roughness: 0.8 }));
        mouth.scale.set(0.21, 0.06, 0.3);
        mouth.position.set(0, -0.02, 0.36);
        this.jaw.add(mouth);
        // Crocs
        const fangGeo = new THREE.ConeGeometry(0.03, 0.12, 8);
        const fangMat = new THREE.MeshStandardMaterial({ color: 0xfff8ec, roughness: 0.3 });
        for (const side of [-1, 1]) {
            const fang = new THREE.Mesh(fangGeo, fangMat);
            fang.rotation.x = Math.PI;
            fang.position.set(side * 0.12, -0.12, 0.52);
            head.add(fang);
        }
        head.add(this.jaw);

        // Langue fourchue.
        this.tongue = new THREE.Group();
        const tongueMat = new THREE.MeshStandardMaterial({ color: 0xff3366, emissive: 0x550011, roughness: 0.4 });
        const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.4, 6), tongueMat);
        t1.rotation.x = Math.PI / 2;
        t1.position.z = 0.2;
        this.tongue.add(t1);
        for (const side of [-1, 1]) {
            const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.016, 0.14, 5), tongueMat);
            fork.rotation.set(Math.PI / 2, 0, side * 0.5);
            fork.position.set(side * 0.03, 0, 0.44);
            this.tongue.add(fork);
        }
        this.tongue.position.set(0, -0.1, 0.35);
        this.tongue.scale.z = 0.01;
        head.add(this.tongue);

        // Yeux : globe lumineux, pupille fendue, reflet, arcade sourcilière.
        this.eyes = [];
        this.eyeMat = new THREE.MeshStandardMaterial({ roughness: 0.15, emissiveIntensity: 1.4 });
        const pupilMat = new THREE.MeshBasicMaterial({ color: 0x050308 });
        const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        for (const side of [-1, 1]) {
            const eye = new THREE.Group();
            eye.position.set(side * 0.23, 0.13, 0.27);
            eye.rotation.y = side * 0.28;
            const globe = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 14), this.eyeMat);
            const pupil = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), pupilMat);
            pupil.scale.set(0.022, 0.085, 0.03);
            pupil.position.z = 0.115;
            const shine = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), shineMat);
            shine.position.set(-side * 0.035, 0.05, 0.115);
            eye.add(globe, pupil, shine);
            const brow = new THREE.Mesh(sphere, this.headMat);
            brow.scale.set(0.14, 0.04, 0.12);
            brow.position.set(side * 0.24, 0.22, 0.24);
            brow.rotation.z = side * -0.35;
            head.add(eye, brow);
            this.simpleSkull.push(brow);
            this.eyes.push(eye);
        }
        // Narines
        for (const side of [-1, 1]) {
            const n = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), pupilMat);
            n.position.set(side * 0.08, 0.1, 0.6);
            head.add(n);
        }
        head.traverse((o) => (o.castShadow = true));
        this.accessory = new THREE.Group();
        head.add(this.accessory);
        this.group.add(head);
        if (skullGeometry) this.#useSculptedSkull(skullGeometry);
        else skullReady.then((geo) => geo && this.#useSculptedSkull(geo));
    }

    // Remplace les sphères (crâne, museau, arcades) par le crâne de Blender.
    #useSculptedSkull(geo) {
        for (const part of this.simpleSkull) part.visible = false;
        const skull = new THREE.Mesh(geo, this.headMat);
        skull.castShadow = true;
        this.head.add(skull);
    }

    #buildEvolutionParts() {
        // Palier 2 : nageoires dorsales.
        const finShape = new THREE.Shape();
        finShape.moveTo(-0.16, 0);
        finShape.quadraticCurveTo(-0.05, 0.12, 0.12, 0.3);
        finShape.quadraticCurveTo(0.06, 0.12, 0.16, 0);
        finShape.lineTo(-0.16, 0);
        const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.025, bevelEnabled: false });
        finGeo.translate(0, 0, -0.0125);
        this.finMat = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.85, side: THREE.DoubleSide, roughness: 0.3 });
        this.fins = new THREE.InstancedMesh(finGeo, this.finMat, FIN_MAX);
        this.fins.frustumCulled = false;
        this.fins.count = 0;
        this.group.add(this.fins);

        // Palier 3 : pointes lumineuses sur les flancs.
        const spikeGeo = new THREE.ConeGeometry(0.045, 0.18, 6);
        spikeGeo.translate(0, 0.09, 0);
        this.spikeMat = new THREE.MeshStandardMaterial({ emissiveIntensity: 2, roughness: 0.3 });
        this.spikes = new THREE.InstancedMesh(spikeGeo, this.spikeMat, FIN_MAX * 2);
        this.spikes.frustumCulled = false;
        this.spikes.count = 0;
        this.group.add(this.spikes);

        // Palier 4 : aura et halo.
        this.aura = new THREE.Sprite(
            new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        this.aura.scale.setScalar(2.4);
        this.halo = new THREE.Mesh(
            new THREE.TorusGeometry(0.32, 0.03, 8, 40),
            new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending })
        );
        this.halo.rotation.x = Math.PI / 2;
        this.halo.position.y = 0.55;
        this.head.add(this.halo);
        this.group.add(this.aura);

        // Bouclier : bulle autour de la tête.
        this.shield = new THREE.Mesh(
            new THREE.IcosahedronGeometry(0.72, 3),
            new THREE.ShaderMaterial({
                vertexShader: SHIELD_VERT,
                fragmentShader: SHIELD_FRAG,
                uniforms: { uColor: { value: new THREE.Color() }, uTime: { value: 0 }, uOpacity: { value: 0 } },
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            })
        );
        this.shield.visible = false;
        this.head.add(this.shield);
    }

    // Compétences actives (lues dans l'état du serveur).
    setSkills(skills) {
        this.skills = skills;
    }

    // Bouclier brisé : la bulle disparaît tout de suite (les éclats sont dans Effects).
    breakShield() {
        this.shieldT = 0;
        this.shield.visible = false;
    }

    setCosmetics(cosmetics) {
        this.cosmetics = cosmetics;
        const skin = SKINS[cosmetics.skin] ?? SKINS.neon;
        this.skin = skin;
        const tex = snakeSkinTextures(skin);
        Object.assign(this.bodyMat, { map: tex.map, emissiveMap: tex.emissiveMap });
        this.bodyMat.color.set(0xffffff);
        this.bodyMat.emissive.set(skin.glow);
        this.baseOpacity = skin.pattern === "runes" ? 0.82 : 1;
        this.bodyMat.needsUpdate = true;
        this.jawMat.color.set(skin.belly);
        this.eyeMat.color.set(skin.eye);
        this.eyeMat.emissive.set(skin.eye);
        this.finMat.color.set(skin.glow);
        this.finMat.emissive.set(skin.primary);
        this.spikeMat.color.set(skin.glow);
        this.spikeMat.emissive.set(skin.glow);
        this.aura.material.color.set(skin.glow);
        this.shield.material.uniforms.uColor.value.set(skin.glow);
        this.halo.material.color.set(skin.glow);
        this.glowColor = new THREE.Color(skin.glow);
        this.#buildAccessory(cosmetics.accessory);
    }

    #buildAccessory(id) {
        this.accessory.clear();
        const skin = this.skin;
        if (id === "horns") {
            const mat = new THREE.MeshStandardMaterial({ color: 0xf2e6d0, roughness: 0.35 });
            for (const side of [-1, 1]) {
                const curve = new THREE.CatmullRomCurve3([
                    new THREE.Vector3(side * 0.18, 0.18, -0.08),
                    new THREE.Vector3(side * 0.3, 0.34, -0.22),
                    new THREE.Vector3(side * 0.34, 0.42, -0.45),
                ]);
                const geo = new THREE.TubeGeometry(curve, 16, 0.05, 8);
                // Corne effilée : on resserre les anneaux vers la pointe.
                const pos = geo.attributes.position;
                const pts = curve.getSpacedPoints(16);
                for (let i = 0; i < pos.count; i++) {
                    const ring = Math.floor(i / 9);
                    const c = pts[Math.min(ring, 16)];
                    const k = 1 - ring / 17;
                    pos.setXYZ(i, c.x + (pos.getX(i) - c.x) * k, c.y + (pos.getY(i) - c.y) * k, c.z + (pos.getZ(i) - c.z) * k);
                }
                geo.computeVertexNormals();
                this.accessory.add(new THREE.Mesh(geo, mat));
            }
        } else if (id === "crown") {
            const gold = new THREE.MeshStandardMaterial({ color: 0xffd34d, metalness: 0.9, roughness: 0.25, emissive: 0x6b4a00 });
            const band = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.08, 20, 1, true), gold);
            band.position.set(0, 0.32, -0.02);
            this.accessory.add(band);
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                const spike = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.13, 6), gold);
                spike.position.set(Math.cos(a) * 0.2, 0.42, -0.02 + Math.sin(a) * 0.2);
                this.accessory.add(spike);
                const gem = new THREE.Mesh(
                    new THREE.OctahedronGeometry(0.03),
                    new THREE.MeshStandardMaterial({ color: skin.eye, emissive: skin.eye, emissiveIntensity: 1.5 })
                );
                gem.position.set(Math.cos(a) * 0.215, 0.32, -0.02 + Math.sin(a) * 0.215);
                this.accessory.add(gem);
            }
        } else if (id === "crest") {
            const mat = new THREE.MeshStandardMaterial({ color: skin.glow, emissive: skin.primary, emissiveIntensity: 0.6, side: THREE.DoubleSide });
            for (let i = 0; i < 4; i++) {
                const fin = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.26 - i * 0.04, 4), mat);
                fin.scale.z = 0.25;
                fin.rotation.x = -0.6;
                fin.position.set(0, 0.32 - i * 0.03, 0.12 - i * 0.15);
                this.accessory.add(fin);
            }
        } else if (id === "visor") {
            const visor = new THREE.Mesh(
                new THREE.TorusGeometry(0.33, 0.045, 10, 30, Math.PI * 0.85),
                new THREE.MeshStandardMaterial({
                    color: skin.glow,
                    emissive: skin.glow,
                    emissiveIntensity: 1.6,
                    transparent: true,
                    opacity: 0.85,
                })
            );
            visor.rotation.set(-0.2, 0, Math.PI * 0.075);
            visor.position.set(0, 0.06, 0.22);
            visor.scale.set(1, 0.6, 1);
            this.accessory.add(visor);
        }
    }

    setTier(tier) {
        this.tier = tier;
        this.aura.visible = tier >= 4;
        this.halo.visible = tier >= 4;
    }

    // ---------- Animations ponctuelles ----------
    eat(golden = false) {
        this.chompT = 0.28;
        this.bulges.push({ dist: 0.2, amp: golden ? 0.75 : 0.45 });
    }

    hurt() {
        this.hurtT = 0.5;
    }

    setMouthOpen(v) {
        this.mouthTarget = v;
    }

    setOpacity(o) {
        this.opacity = o;
    }

    // ---------- Chemin ----------
    // `points` : centres des segments (tête -> queue) ; `headQuat` : orientation de la tête.
    setPath(points, headQuat) {
        this.pathPoints = points;
        this.headQuat = headQuat;
    }

    // Échantillons du corps le long du chemin. Un saut (téléporteur) coupe le corps :
    // les échantillons du saut sont marqués dans `gaps` et le tube y a un rayon nul.
    #sample() {
        const pts = this.pathPoints;
        this.sampleCount = 0;
        if (!pts || pts.length < 2) return;
        const n = pts.length;
        const subdiv = Math.max(MIN_SUBDIV, Math.min(SUBDIV, Math.floor(RING_BUDGET / (n - 1))));
        this.#ensureCapacity((n - 1) * subdiv + 1);
        const out = this.samples;
        const far = (a, b) => a.distanceToSquared(b) > GAP * GAP;
        let w = 0;
        const push = (gap) => {
            this.gaps[w] = gap ? 1 : 0;
            return (out[w++] ??= new THREE.Vector3());
        };
        for (let j = 0; j < n - 1; j++) {
            const p1 = pts[j];
            const p2 = pts[j + 1];
            const gap = far(p1, p2);
            // Pas de courbe à travers un saut : on s'appuie sur le point lui-même.
            const p0 = j > 0 && !far(pts[j - 1], p1) ? pts[j - 1] : p1;
            const p3 = j + 2 < n && !far(p2, pts[j + 2]) ? pts[j + 2] : p2;
            for (let k = 0; k < subdiv; k++) {
                const t = k / subdiv;
                const v = push(gap && k > 0);
                if (gap) v.lerpVectors(p1, p2, t);
                else catmull(p0, p1, p2, p3, t, v);
            }
        }
        push(false).copy(pts[n - 1]);
        this.sampleCount = w;
    }

    #buildTube() {
        const S = this.samples;
        const count = this.sampleCount;
        const geo = this.body.geometry;
        if (count < 2) {
            geo.setDrawRange(0, 0);
            this.fins.count = 0;
            this.spikes.count = 0;
            this.frames.length = 0;
            return;
        }
        // Longueur cumulée
        const L = this.lengths;
        L[0] = 0;
        for (let i = 1; i < count; i++) L[i] = L[i - 1] + S[i].distanceTo(S[i - 1]);
        const total = Math.max(L[count - 1], 0.001);
        this.length = total;

        const { T, N, B, C, dir, basisX, side, scale, m, q } = TMP;
        N.set(0, 1, 0).applyQuaternion(this.headQuat ?? q.identity());
        const R = 0.3 + 0.025 * this.tier;
        const finStep = 0.55;
        let nextFin = 0.35;
        let fins = 0;
        let spikes = 0;
        const frames = this.frames;

        for (let i = 0; i < count; i++) {
            const a = S[Math.max(0, i - 1)];
            const b = S[Math.min(count - 1, i + 1)];
            T.subVectors(b, a).normalize(); // vers la queue
            // Transport du repère : on garde `N` perpendiculaire à la tangente.
            N.addScaledVector(T, -N.dot(T));
            if (N.lengthSq() < 1e-6) N.set(0, 1, 0).addScaledVector(T, -T.y);
            N.normalize();
            B.crossVectors(T, N);

            const s = L[i] / total;
            let r = R * (1 - 0.82 * smoothstep(0.35, 1, s)) * (0.88 + 0.12 * smoothstep(0, 0.06, s));
            // Bosses de digestion : additionnées et plafonnées (plusieurs repas rapprochés,
            // surtout en sprint, ne doivent pas faire gonfler le corps démesurément).
            let swell = 0;
            for (const bulge of this.bulges) {
                const d = L[i] - bulge.dist;
                if (d * d < 1.2) swell += bulge.amp * Math.exp(-(d * d) / 0.12); // au-delà : contribution nulle
            }
            r *= 1 + Math.min(0.6, swell);
            r = this.gaps[i] ? 0 : Math.max(r, 0.03);

            // Ondulation latérale (nulle près de la tête pour garder la lisibilité).
            const wave = Math.sin(this.time * 7 - L[i] * 2.4) * 0.07 * smoothstep(0.05, 0.25, s);
            C.copy(S[i]).addScaledVector(B, wave);
            const f = (frames[i] ??= { c: new THREE.Vector3(), t: new THREE.Vector3(), n: new THREE.Vector3(), r: 0 });
            f.c.copy(C);
            f.t.copy(T);
            f.n.copy(N);
            f.r = r;

            const base = i * (RADIAL + 1);
            for (let j = 0; j <= RADIAL; j++) {
                const cos = RING_COS[j];
                const sin = RING_SIN[j];
                const dx = N.x * cos + B.x * sin;
                const dy = N.y * cos + B.y * sin;
                const dz = N.z * cos + B.z * sin;
                const v = base + j;
                this.posArr[v * 3] = C.x + dx * r;
                this.posArr[v * 3 + 1] = C.y + dy * r;
                this.posArr[v * 3 + 2] = C.z + dz * r;
                this.nrmArr[v * 3] = dx;
                this.nrmArr[v * 3 + 1] = dy;
                this.nrmArr[v * 3 + 2] = dz;
                this.uvArr[v * 2] = L[i] * UV_PER_UNIT;
                this.uvArr[v * 2 + 1] = 1 - j / RADIAL;
            }

            // Nageoires (palier 2+) et pointes (palier 3+) le long du dos.
            if (this.tier >= 2 && L[i] >= nextFin && s < 0.85 && fins < FIN_MAX && !this.gaps[i]) {
                nextFin += finStep;
                const k = r / R;
                scale.set(k, k, k);
                basisX.copy(T).negate();
                m.makeBasis(basisX, N, B).scale(scale).setPosition(dir.copy(C).addScaledVector(N, r * 0.85));
                this.fins.setMatrixAt(fins++, m);
                if (this.tier >= 3 && spikes < FIN_MAX * 2 - 1) {
                    for (const sgn of [-1, 1]) {
                        side.copy(B).multiplyScalar(sgn);
                        m.makeBasis(T, side, dir.copy(N).multiplyScalar(sgn)).scale(scale);
                        m.setPosition(dir.copy(C).addScaledVector(side, r * 0.9));
                        this.spikes.setMatrixAt(spikes++, m);
                    }
                }
            }
        }
        frames.length = count;
        this.fins.count = fins;
        this.spikes.count = spikes;
        this.fins.instanceMatrix.needsUpdate = true;
        this.spikes.instanceMatrix.needsUpdate = true;
        geo.setDrawRange(0, (count - 1) * RADIAL * 6);
        // N'envoyer au GPU que la partie utilisée des tampons.
        for (const [name, size] of [["position", 3], ["normal", 3], ["uv", 2]]) {
            const attr = geo.attributes[name];
            attr.clearUpdateRanges?.();
            attr.addUpdateRange?.(0, count * (RADIAL + 1) * size);
            attr.needsUpdate = true;
        }
    }

    get tail() {
        return this.frames.length ? this.frames[this.frames.length - 1] : null;
    }

    update(dt) {
        this.time += dt;
        for (const b of this.bulges) b.dist += dt * 5.5;
        this.bulges = this.bulges.filter((b) => b.dist < this.length + 0.5);

        this.#sample();
        this.#buildTube();

        // Tête
        const headPos = this.pathPoints?.[0];
        if (headPos) {
            this.head.position.copy(headPos);
            if (this.headQuat) this.head.quaternion.copy(this.headQuat);
        }
        if (this.hurtT > 0) {
            this.hurtT -= dt;
            this.head.position.add(TMP.dir.randomDirection().multiplyScalar(0.06 * (this.hurtT / 0.5)));
        }

        // Mâchoire : anticipation (nourriture devant) puis "chomp" en mangeant.
        this.chompT = Math.max(0, this.chompT - dt);
        const chomp = this.chompT > 0 ? Math.sin((1 - this.chompT / 0.28) * Math.PI) : 0;
        this.mouth += (Math.max(this.mouthTarget, chomp) - this.mouth) * Math.min(1, dt * 14);
        this.jaw.rotation.x = this.mouth * 0.55;

        // Clignements et langue.
        this.blinkAt -= dt;
        const blink = this.blinkAt < 0 ? Math.abs(Math.sin((this.blinkAt / 0.16) * Math.PI)) : 1;
        if (this.blinkAt < -0.16) this.blinkAt = 2 + Math.random() * 4;
        for (const eye of this.eyes) eye.scale.y = Math.max(0.08, blink);
        this.tongueAt -= dt;
        const flick = this.tongueAt < 0 ? Math.sin((-this.tongueAt / 0.45) * Math.PI) : 0;
        if (this.tongueAt < -0.45) this.tongueAt = 2.5 + Math.random() * 3;
        this.tongue.scale.z = Math.max(0.01, flick) * (1 - this.mouth);
        this.tongue.rotation.y = Math.sin(this.time * 40) * 0.15 * flick;

        // Lumière : pulsation des veines au palier 3+, rouge quand il est touché.
        const pulse = this.tier >= 3 ? 0.5 + 0.5 * Math.sin(this.time * 4) : 0;
        this.bodyMat.emissiveIntensity = 0.35 + this.tier * 0.18 + pulse * 0.6;
        const hurt = Math.max(0, this.hurtT / 0.5);
        this.bodyMat.emissive.copy(this.glowColor).lerp(HURT_COLOR, hurt);
        if (hurt > 0) this.bodyMat.emissiveIntensity += hurt * 2;

        // Bouclier : la bulle gonfle vite (ease-out), clignote juste avant de s'éteindre.
        const sk = this.skills;
        this.shieldT = sk.shield ? Math.min(1, this.shieldT + dt / 0.18) : Math.max(0, this.shieldT - dt / 0.12);
        this.shield.visible = this.shieldT > 0;
        if (this.shield.visible) {
            const u = this.shield.material.uniforms;
            u.uTime.value = this.time;
            const ending = sk.shield && sk.shieldMs < 600 ? 0.55 + 0.45 * Math.sin(this.time * 40) : 1;
            u.uOpacity.value = this.shieldT * ending;
            this.shield.scale.setScalar(0.85 + 0.15 * easeOut(this.shieldT));
        }
        // Phase : le corps devient un fantôme lumineux.
        this.phaseT += ((sk.phase ? 1 : 0) - this.phaseT) * Math.min(1, dt * 18);
        if (this.phaseT > 0.01) this.bodyMat.emissiveIntensity += this.phaseT * (1.2 + 0.4 * Math.sin(this.time * 30));

        // Transparence (invulnérabilité, phase, peau Spectre).
        const opacity = this.opacity * this.baseOpacity * (1 - 0.6 * this.phaseT);
        const transparent = opacity < 0.999;
        for (const mat of [this.bodyMat, this.jawMat, this.eyeMat]) {
            mat.opacity = opacity;
            if (mat.transparent !== transparent) {
                mat.transparent = transparent;
                mat.needsUpdate = true;
            }
        }

        if (this.aura.visible && headPos) {
            this.aura.position.copy(headPos);
            this.aura.material.opacity = 0.35 + 0.15 * Math.sin(this.time * 3);
            this.halo.rotation.z += dt * 2;
        }
    }

    dispose() {
        this.group.removeFromParent();
        this.body.geometry.dispose();
    }
}

// Objets temporaires partagés (un seul Snake est construit à la fois) : aucune allocation par image.
const TMP = {
    T: new THREE.Vector3(),
    N: new THREE.Vector3(),
    B: new THREE.Vector3(),
    C: new THREE.Vector3(),
    dir: new THREE.Vector3(),
    basisX: new THREE.Vector3(),
    side: new THREE.Vector3(),
    scale: new THREE.Vector3(),
    m: new THREE.Matrix4(),
    q: new THREE.Quaternion(),
};
const HURT_COLOR = new THREE.Color(0xff1030);

function smoothstep(a, b, x) {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
}

function catmull(p0, p1, p2, p3, t, out) {
    const t2 = t * t;
    const t3 = t2 * t;
    const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
    return out.set(f(p0.x, p1.x, p2.x, p3.x), f(p0.y, p1.y, p2.y, p3.y), f(p0.z, p1.z, p2.z, p3.z));
}
