import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

// Occlusion ambiante : ombres de contact dans les coins, sous les décors et le serpent.
// Les halos (sprites, matériaux transparents sans profondeur) sont exclus du calcul,
// sinon leurs quads assombriraient la scène derrière eux.
class ContactShadowPass extends GTAOPass {
    overrideVisibility() {
        const cache = this._visibilityCache;
        this.scene.traverse((o) => {
            cache.set(o, o.visible);
            const m = o.material;
            if (o.isPoints || o.isLine || o.isSprite || (m && !Array.isArray(m) && m.transparent && !m.depthWrite)) o.visible = false;
        });
    }
}

// Rendu final : occlusion ambiante, bloom (halo des éléments lumineux) puis tone mapping.
// Le composer rend dans une cible multi-échantillonnée : l'antialiasing du canvas
// ne s'applique pas aux passes, sans ça les bords crénelent.
export class PostFX {
    constructor(renderer, scene, camera) {
        this.renderer = renderer;
        const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
        this.composer = new EffectComposer(renderer, target);
        this.composer.addPass(new RenderPass(scene, camera));
        this.ao = new ContactShadowPass(scene, camera, 1, 1);
        this.ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1, scale: 1, samples: 12 });
        this.ao.updatePdMaterial({ radius: 6, rings: 2, samples: 16 });
        this.ao.blendIntensity = 0.85;
        this.composer.addPass(this.ao);
        this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.5, 0.8);
        this.composer.addPass(this.bloom);
        this.composer.addPass(new OutputPass());
        this.enabled = true;
        this.scene = scene;
        this.camera = camera;
    }

    // Qualité : sans bloom ni occlusion, rendu direct sans composer. `msaa` : échantillons.
    configure({ bloom, ao, msaa }) {
        this.enabled = bloom || ao;
        this.bloom.enabled = bloom;
        this.ao.enabled = ao;
        for (const t of [this.composer.renderTarget1, this.composer.renderTarget2]) {
            if (t.samples === msaa) continue;
            t.samples = msaa;
            t.dispose(); // réalloué au prochain rendu avec le nouveau nombre d'échantillons
        }
    }

    setSize(w, h, pixelRatio) {
        this.composer.setPixelRatio(pixelRatio);
        this.composer.setSize(w, h);
    }

    // Petite poussée de bloom pour les gros événements (dégâts, phase...).
    pulse(amount = 0.6) {
        this.extra = Math.max(this.extra ?? 0, amount);
    }

    render(dt) {
        if (!this.enabled) {
            this.renderer.render(this.scene, this.camera);
            return;
        }
        this.extra = Math.max(0, (this.extra ?? 0) - dt * 1.5);
        this.bloom.strength = 0.7 + this.extra * 0.5;
        this.composer.render(dt);
    }
}
