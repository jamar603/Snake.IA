import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

// Rendu final : bloom (halo des éléments lumineux) puis tone mapping.
// Le bloom est désactivable dans les paramètres (qualité basse).
export class PostFX {
    constructor(renderer, scene, camera) {
        this.renderer = renderer;
        this.composer = new EffectComposer(renderer);
        this.composer.addPass(new RenderPass(scene, camera));
        this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.5, 0.8);
        this.composer.addPass(this.bloom);
        this.composer.addPass(new OutputPass());
        this.enabled = true;
        this.scene = scene;
        this.camera = camera;
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
