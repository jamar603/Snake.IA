import { SKILLS, SKILL_IDS } from "/shared/config.js";

// Clavier (QWERTY et AZERTY) et glissés tactiles -> virages relatifs du Snake.
const KEY_TO_TURN = {
    arrowleft: "left", q: "left", a: "left",
    arrowright: "right", d: "right",
    arrowup: "up", z: "up", w: "up",
    arrowdown: "down", s: "down",
};

// Compétences : touche dédiée, ou chiffre de la rangée du haut (e.code : marche en AZERTY).
function skillFor(e) {
    const k = e.key.toLowerCase();
    return SKILL_IDS.find((id, i) => SKILLS[id].keys.includes(k) || e.code === `Digit${i + 1}`);
}

export class SnakeInput {
    constructor(onTurn, onSkill = () => {}) {
        this.onTurn = onTurn;
        this.onSkill = onSkill;
        this.enabled = false;

        window.addEventListener("keydown", (e) => {
            if (!this.enabled || e.repeat || e.target instanceof HTMLInputElement) return;
            const skill = skillFor(e);
            if (skill) {
                e.preventDefault();
                this.onSkill(skill);
                return;
            }
            const turn = KEY_TO_TURN[e.key.toLowerCase()];
            if (!turn) return;
            e.preventDefault();
            this.onTurn(turn);
        });

        let start = null;
        window.addEventListener("touchstart", (e) => (start = e.touches[0]), { passive: true });
        window.addEventListener("touchend", (e) => {
            if (!this.enabled || !start) return;
            const t = e.changedTouches[0];
            const dx = t.clientX - start.clientX;
            const dy = t.clientY - start.clientY;
            start = null;
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
            if (Math.abs(dx) > Math.abs(dy)) this.onTurn(dx > 0 ? "right" : "left");
            else this.onTurn(dy > 0 ? "down" : "up");
        });
    }
}
