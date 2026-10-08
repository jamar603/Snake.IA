// Entrées centralisées : clavier, souris (gérée par le dieu et les menus) et manettes.
// Chaque commande du jeu est une *action* nommée ; clavier et manette y sont liés par des
// raccourcis remappables, gardés dans les paramètres. Les consommateurs (SnakeInput,
// GodController, menus) écoutent des actions, jamais des touches.
//
// Manettes : API Gamepad du navigateur, disposition « standard » (Xbox, DualSense,
// DualShock, Switch Pro et la plupart des manettes génériques). Détection automatique,
// glyphes adaptés (△ ○ × □ pour PlayStation), vibrations si le navigateur les gère.
// Gâchettes adaptatives, gyroscope et pavé tactile de la DualSense ne sont pas exposés
// par l'API Gamepad : volontairement non utilisés (rien d'instable ni de demi-supporté).

// ---------- Actions ----------
export const ACTIONS = {
    // Snake
    turnLeft: { label: "Tourner à gauche", group: "snake" },
    turnRight: { label: "Tourner à droite", group: "snake" },
    turnUp: { label: "Monter (Cube 3D)", group: "snake" },
    turnDown: { label: "Descendre (Cube 3D)", group: "snake" },
    sprint: { label: "Sprint", group: "snake" },
    shield: { label: "Bouclier", group: "snake" },
    phase: { label: "Phase", group: "snake" },
    // Snake God
    place: { label: "Poser le pouvoir", group: "god" },
    nextPower: { label: "Pouvoir suivant", group: "god" },
    prevPower: { label: "Pouvoir précédent", group: "god" },
    cycleAxis: { label: "Orientation des murs", group: "god" },
    layerUp: { label: "Couche au-dessus (Cube 3D)", group: "god" },
    layerDown: { label: "Couche en dessous (Cube 3D)", group: "god" },
    // Partout
    pause: { label: "Quitter / menu", group: "global" },
};

// Raccourcis clavier par défaut : valeurs de `KeyboardEvent.key` en minuscules
// (plusieurs par action : QWERTY et AZERTY). Les chiffres du dieu restent fixes (1 à 8).
export const DEFAULT_KEYS = {
    turnLeft: ["arrowleft", "q", "a"],
    turnRight: ["arrowright", "d"],
    turnUp: ["arrowup", "z", "w"],
    turnDown: ["arrowdown", "s"],
    sprint: [" ", "1"],
    shield: ["e", "2"],
    phase: ["f", "3"],
    place: [],
    nextPower: ["tab"],
    prevPower: [],
    cycleAxis: ["r"],
    layerUp: ["pageup", "arrowup"],
    layerDown: ["pagedown", "arrowdown"],
    pause: ["escape"],
};

// Raccourcis manette par défaut (indices de la disposition standard).
// 0 bas (×/A), 1 droite (○/B), 2 gauche (□/X), 3 haut (△/Y), 4 L1/LB, 5 R1/RB,
// 6 L2/LT, 7 R2/RT, 8 Create/View, 9 Options/Menu, 10 L3, 11 R3, 12-15 croix, 16 PS/Xbox, 17 pavé.
export const DEFAULT_PAD = {
    turnLeft: [14],
    turnRight: [15],
    turnUp: [12],
    turnDown: [13],
    sprint: [0, 7],
    shield: [1],
    phase: [2],
    place: [0], // R2 / L2 zooment la caméra du dieu
    nextPower: [5],
    prevPower: [4],
    cycleAxis: [3],
    layerUp: [12],
    layerDown: [13],
    pause: [9],
};

// ---------- Glyphes ----------
const GLYPHS = {
    playstation: ["×", "○", "□", "△", "L1", "R1", "L2", "R2", "Create", "Options", "L3", "R3", "↑", "↓", "←", "→", "PS", "Pavé"],
    xbox: ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "View", "Menu", "LS", "RS", "↑", "↓", "←", "→", "Xbox", "Share"],
    nintendo: ["B", "A", "Y", "X", "L", "R", "ZL", "ZR", "−", "+", "LS", "RS", "↑", "↓", "←", "→", "Home", "Capture"],
    generic: ["B1", "B2", "B3", "B4", "L1", "R1", "L2", "R2", "Select", "Start", "L3", "R3", "↑", "↓", "←", "→", "Home", "B18"],
};
const FAMILY_NAMES = { playstation: "PlayStation", xbox: "Xbox", nintendo: "Nintendo", generic: "Manette" };

// Famille de la manette d'après son identifiant (fabricant 054c = Sony, 045e = Microsoft, 057e = Nintendo).
export function padFamily(id = "") {
    const s = id.toLowerCase();
    if (/054c|dualsense|dualshock|playstation|wireless controller/.test(s)) return "playstation";
    if (/045e|xbox|xinput/.test(s)) return "xbox";
    if (/057e|nintendo|switch|pro controller|joy-con/.test(s)) return "nintendo";
    return "generic";
}

export function padModel(id = "") {
    const s = id.toLowerCase();
    if (/0ce6|0df2|dualsense/.test(s)) return "DualSense";
    if (/05c4|09cc|dualshock/.test(s)) return "DualShock 4";
    if (/xbox|045e|xinput/.test(s)) return "Manette Xbox";
    if (/057e|pro controller/.test(s)) return "Switch Pro";
    return null;
}

export const keyLabel = (k) =>
    ({ " ": "Espace", arrowleft: "←", arrowright: "→", arrowup: "↑", arrowdown: "↓", escape: "Échap", tab: "Tab", pageup: "Pg↑", pagedown: "Pg↓", enter: "Entrée" })[k] ??
    (k.length === 1 ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1));

const DEADZONE = 0.22;
const STICK_ON = 0.6; // un « coup » de stick déclenche un virage…
const STICK_OFF = 0.35; // … puis il faut revenir vers le centre pour en redéclencher un.

export class InputManager extends EventTarget {
    constructor(settings) {
        super();
        this.settings = settings;
        this.device = "keyboard"; // dernier périphérique utilisé : "keyboard" | "gamepad"
        this.family = "generic";
        this.padName = null;
        this.padIndex = null;
        this.prevButtons = [];
        this.stickLatch = { x: 0, y: 0 };
        this.capture = null; // remappage en cours : (binding) => void
        this.context = "menu"; // "menu" | "snake" | "god" : quelles actions sont actives
        this.analog = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, zoom: 0 };
        this.#loadBindings();
        // Lecture de la manette à 125 Hz, indépendante de la fréquence d'image : un appui bref
        // n'est jamais manqué, même si le rendu ralentit (PC modeste, grosse scène).
        setInterval(() => this.#pollPad(), 8);

        window.addEventListener("keydown", (e) => this.#onKey(e), { capture: true });
        window.addEventListener("pointerdown", () => this.#setDevice("keyboard"), { passive: true });
        window.addEventListener("gamepadconnected", (e) => this.#onConnect(e.gamepad));
        window.addEventListener("gamepaddisconnected", (e) => {
            if (e.gamepad.index !== this.padIndex) return;
            this.padIndex = null;
            this.padName = null;
            this.#setDevice("keyboard");
            this.dispatchEvent(new CustomEvent("pad", { detail: null }));
        });
        settings.addEventListener("change", (e) => {
            if (!e.detail.key || e.detail.key === "bindings") this.#loadBindings();
        });
    }

    // ---------- Raccourcis ----------
    #loadBindings() {
        const saved = this.settings.get("bindings") ?? {};
        this.keys = {};
        this.pad = {};
        for (const id of Object.keys(ACTIONS)) {
            this.keys[id] = Array.isArray(saved.keys?.[id]) ? saved.keys[id] : DEFAULT_KEYS[id];
            this.pad[id] = Array.isArray(saved.pad?.[id]) ? saved.pad[id] : DEFAULT_PAD[id];
        }
    }

    // Remplace le premier raccourci d'une action (le clavier garde ses variantes AZERTY / QWERTY).
    setBinding(kind, action, value) {
        const saved = structuredClone(this.settings.get("bindings") ?? {});
        saved[kind] ??= {};
        const current = kind === "keys" ? this.keys[action] : this.pad[action];
        saved[kind][action] = [value, ...current.filter((v, i) => i > 0 && v !== value)];
        this.settings.set("bindings", saved);
    }

    resetBindings() {
        this.settings.set("bindings", {});
    }

    // Attend la prochaine touche ou le prochain bouton (remappage). Échap annule.
    captureNext(kind, done) {
        this.capture = { kind, done };
    }

    // ---------- Clavier ----------
    #onKey(e) {
        if (e.repeat) return;
        const k = e.key.toLowerCase();
        if (this.capture && this.capture.kind !== "keys" && k === "escape") {
            // Échap annule aussi un remappage de bouton de manette.
            e.preventDefault();
            e.stopImmediatePropagation();
            const { done } = this.capture;
            this.capture = null;
            done(null);
            return;
        }
        if (this.capture?.kind === "keys") {
            e.preventDefault();
            e.stopImmediatePropagation();
            const { done } = this.capture;
            this.capture = null;
            done(k === "escape" ? null : k);
            return;
        }
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        this.#setDevice("keyboard");
        for (const action of this.#activeActions()) {
            if (!this.keys[action].includes(k)) continue;
            // Flèche haut / bas : virage vertical pour le Snake, couche pour le dieu (contexte).
            e.preventDefault();
            this.#emit(action, { source: "keyboard", event: e });
        }
    }

    // Actions écoutées dans le contexte courant (évite qu'une touche serve à deux choses).
    #activeActions() {
        const groups = this.context === "snake" ? ["snake", "global"] : this.context === "god" ? ["god", "global"] : ["global"];
        return Object.keys(ACTIONS).filter((id) => groups.includes(ACTIONS[id].group));
    }

    setContext(context) {
        this.context = context;
    }

    #emit(action, detail = {}) {
        this.dispatchEvent(new CustomEvent("action", { detail: { action, ...detail } }));
    }

    // ---------- Manettes ----------
    #onConnect(gp) {
        if (this.padIndex !== null && navigator.getGamepads()[this.padIndex]) return;
        this.padIndex = gp.index;
        this.family = padFamily(gp.id);
        this.padName = padModel(gp.id) ?? FAMILY_NAMES[this.family];
        this.prevButtons = gp.buttons.map((b) => b.pressed);
        this.dispatchEvent(new CustomEvent("pad", { detail: { name: this.padName, family: this.family } }));
    }

    #setDevice(device) {
        if (this.device === device) return;
        this.device = device;
        document.documentElement.dataset.input = device;
        this.dispatchEvent(new CustomEvent("device", { detail: device }));
    }

    get usingPad() {
        return this.device === "gamepad";
    }

    // État analogique le plus récent (curseur du dieu, caméra), lu par la boucle de rendu.
    poll() {
        return this.analog;
    }

    // Boutons (fronts montants) et sticks (virages, navigation des menus, état analogique).
    #pollPad() {
        const analog = this.analog;
        analog.moveX = analog.moveY = analog.lookX = analog.lookY = analog.zoom = 0;
        if (!navigator.getGamepads || document.hidden) return;
        const pads = navigator.getGamepads();
        let gp = this.padIndex !== null ? pads[this.padIndex] : null;
        if (!gp) {
            // Manette déjà branchée au chargement (pas d'événement) : on la prend au premier bouton.
            gp = [...pads].find((p) => p?.connected && p.buttons.some((b) => b.pressed));
            if (!gp) return;
            this.#onConnect(gp);
        }
        const pressed = gp.buttons.map((b) => b.pressed || b.value > 0.5);
        const axes = gp.axes.map((v) => (Math.abs(v) < DEADZONE ? 0 : (v - Math.sign(v) * DEADZONE) / (1 - DEADZONE)));
        const anyInput = pressed.some(Boolean) || axes.some((v) => v !== 0);
        if (anyInput) this.#setDevice("gamepad");

        if (this.capture?.kind === "pad") {
            const b = pressed.findIndex((p, i) => p && !this.prevButtons[i]);
            if (b >= 0) {
                const { done } = this.capture;
                this.capture = null;
                done(b);
            }
        } else {
            for (let i = 0; i < pressed.length; i++) {
                if (!pressed[i] || this.prevButtons[i]) continue;
                this.dispatchEvent(new CustomEvent("padButton", { detail: i }));
                for (const action of this.#activeActions()) if (this.pad[action].includes(i)) this.#emit(action, { source: "gamepad" });
            }
            this.#stickTurns(axes[0] ?? 0, axes[1] ?? 0);
        }
        this.prevButtons = pressed;

        analog.moveX = axes[0] ?? 0;
        analog.moveY = axes[1] ?? 0;
        analog.lookX = axes[2] ?? 0;
        analog.lookY = axes[3] ?? 0;
        analog.zoom = (gp.buttons[6]?.value ?? 0) - (gp.buttons[7]?.value ?? 0);
        this.gamepad = gp;
    }

    // Stick gauche du Snake : un coup franc = un virage (avec hystérésis, pas de rafale).
    #stickTurns(x, y) {
        const latch = this.stickLatch;
        if (this.context === "snake") {
            if (!latch.x && Math.abs(x) > STICK_ON) {
                latch.x = Math.sign(x);
                this.#emit(x > 0 ? "turnRight" : "turnLeft", { source: "gamepad" });
            } else if (latch.x && Math.abs(x) < STICK_OFF) latch.x = 0;
            if (!latch.y && Math.abs(y) > STICK_ON) {
                latch.y = Math.sign(y);
                this.#emit(y > 0 ? "turnDown" : "turnUp", { source: "gamepad" });
            } else if (latch.y && Math.abs(y) < STICK_OFF) latch.y = 0;
        } else if (this.context === "menu") {
            // Menus : le stick déplace le focus comme la croix.
            const dir = !latch.x && Math.abs(x) > STICK_ON ? (x > 0 ? 15 : 14) : !latch.y && Math.abs(y) > STICK_ON ? (y > 0 ? 13 : 12) : null;
            if (Math.abs(x) > STICK_ON) latch.x = 1;
            else if (Math.abs(x) < STICK_OFF) latch.x = 0;
            if (Math.abs(y) > STICK_ON) latch.y = 1;
            else if (Math.abs(y) < STICK_OFF) latch.y = 0;
            if (dir !== null) this.dispatchEvent(new CustomEvent("padButton", { detail: dir }));
        }
    }

    // ---------- Vibrations ----------
    // `strength` 0..1, `ms` durée. Silencieux si la manette ou le navigateur ne les gèrent pas.
    rumble(strength = 0.5, ms = 120) {
        if (!this.settings.get("vibration") || this.device !== "gamepad") return;
        const act = this.gamepad?.vibrationActuator;
        if (!act?.playEffect) return;
        act.playEffect("dual-rumble", { duration: ms, strongMagnitude: Math.min(1, strength), weakMagnitude: Math.min(1, strength * 0.7) }).catch(() => {});
    }

    // ---------- Libellés ----------
    // Libellé du premier raccourci de l'action pour le périphérique en cours.
    label(action, device = this.device) {
        if (device === "gamepad") {
            const b = this.pad[action]?.[0];
            return b === undefined ? "—" : this.buttonLabel(b);
        }
        const k = this.keys[action]?.[0];
        return k === undefined ? "—" : keyLabel(k);
    }

    buttonLabel(index) {
        return (GLYPHS[this.family] ?? GLYPHS.generic)[index] ?? `B${index + 1}`;
    }
}
