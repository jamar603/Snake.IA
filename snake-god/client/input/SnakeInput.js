// Snake : actions de l'InputManager (clavier, manette) et gestes tactiles -> virages relatifs.
// Contrôle classique : gauche et droite seulement (la map gère les faces du cube) ;
// haut et bas en plus dans le Cube 3D.
const TURNS = { turnLeft: "left", turnRight: "right", turnUp: "up", turnDown: "down" };
const SKILL_ACTIONS = { sprint: "sprint", shield: "shield", phase: "phase" };

export class SnakeInput {
    constructor(input, onTurn, onSkill = () => {}) {
        this.onTurn = onTurn;
        this.onSkill = onSkill;
        this.vertical = false; // haut / bas actifs (Cube 3D)
        this.enabled = false;

        input.addEventListener("action", (e) => {
            if (!this.enabled) return;
            const { action } = e.detail;
            if (SKILL_ACTIONS[action]) return this.onSkill(SKILL_ACTIONS[action]);
            const turn = TURNS[action];
            if (!turn || ((turn === "up" || turn === "down") && !this.vertical)) return;
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
            // Glisser à gauche / à droite, ou toucher la moitié gauche / droite de l'écran.
            if (Math.abs(dx) >= 24 && Math.abs(dx) > Math.abs(dy)) this.onTurn(dx > 0 ? "right" : "left");
            else if (this.vertical && Math.abs(dy) >= 24) this.onTurn(dy > 0 ? "down" : "up");
            else if (Math.max(Math.abs(dx), Math.abs(dy)) < 12 && !(e.target instanceof HTMLButtonElement)) {
                this.onTurn(t.clientX > window.innerWidth / 2 ? "right" : "left");
            }
        });
    }
}
