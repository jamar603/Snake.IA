import { ACTIONS } from "../input/InputManager.js";

const GROUPS = { snake: "Snake", god: "Snake God", global: "Partout" };

// Paramètres > Contrôles : manette détectée, vibrations, et remappage de chaque action
// (clavier et manette). Un clic sur un raccourci attend la nouvelle touche ; Échap annule.
export class ControlsPanel {
    constructor(input, root) {
        this.input = input;
        this.root = root;
        this.waiting = null;
        root.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-bind]");
            if (btn) return this.#rebind(btn);
            if (e.target.closest("#reset-bindings")) input.resetBindings();
            if (e.target.closest("#vibration-test")) input.rumble(0.8, 300);
        });
        root.addEventListener("change", (e) => {
            if (e.target.id === "vibration-toggle") input.settings.set("vibration", e.target.checked);
        });
        for (const ev of ["device", "pad"]) input.addEventListener(ev, () => this.render());
        input.settings.addEventListener("change", () => this.render());
        this.render();
    }

    #rebind(btn) {
        const { bind: kind, action } = btn.dataset;
        this.waiting = `${kind}:${action}`;
        this.render();
        this.input.captureNext(kind, (value) => {
            this.waiting = null;
            if (value !== null && value !== undefined) this.input.setBinding(kind, action, value);
            else this.render();
        });
    }

    render() {
        const input = this.input;
        const pad = input.padName;
        const rows = Object.entries(GROUPS)
            .map(([group, title]) => {
                const actions = Object.entries(ACTIONS).filter(([, a]) => a.group === group);
                return `<tr class="bind-group"><th colspan="3">${title}</th></tr>${actions
                    .map(([id, a]) => {
                        const cell = (kind, label) => {
                            const wait = this.waiting === `${kind}:${id}`;
                            return `<td><button class="bind${wait ? " waiting" : ""}" data-bind="${kind}" data-action="${id}" aria-label="${a.label} : ${kind === "keys" ? "clavier" : "manette"}">${wait ? "Appuie…" : label}</button></td>`;
                        };
                        return `<tr><td>${a.label}</td>${cell("keys", input.label(id, "keyboard"))}${cell("pad", input.label(id, "gamepad"))}</tr>`;
                    })
                    .join("")}`;
            })
            .join("");
        const vib = input.settings.get("vibration");
        this.root.innerHTML = `
            <div class="pad-status ${pad ? "on" : ""}">
                <span class="pad-dot"></span>
                <div><strong>${pad ? `${pad} connectée` : "Aucune manette détectée"}</strong>
                <small>${pad ? "Glyphes et aides affichés pour cette manette." : "Branche une manette (Xbox, DualSense, DualShock, Switch Pro…) et appuie sur un bouton."}</small></div>
            </div>
            <div class="setting">
                <div><strong>Vibrations</strong><small>Dégâts, pièges, repas (si le navigateur et la manette les gèrent)</small></div>
                <div class="inline-actions">
                    <button id="vibration-test" class="ghost-btn small" ${pad ? "" : "disabled"}>Tester</button>
                    <label class="switch"><input type="checkbox" id="vibration-toggle" ${vib ? "checked" : ""}><span></span></label>
                </div>
            </div>
            <table class="bind-table">
                <thead><tr><th>Action</th><th>Clavier</th><th>Manette</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
            <p class="muted bind-note">Souris : le Snake God clique sur la face visée, glisse pour tourner la vue, molette pour zoomer. Manette : stick gauche pour viser (dieu) ou tourner (Snake), stick droit pour la caméra, L2 / R2 pour zoomer. Pouvoirs du dieu au clavier : 1 à 8.</p>
            <button id="reset-bindings" class="ghost-btn small">Raccourcis par défaut</button>`;
    }
}
