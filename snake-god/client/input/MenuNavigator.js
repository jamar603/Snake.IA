// Navigation des menus à la manette : la croix (ou le stick) déplace le focus vers l'élément
// le plus proche dans la direction voulue, × / A valide, ○ / B revient en arrière.
// Le clavier garde la navigation native du navigateur (Tab, Entrée).
const FOCUSABLE = "button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])";
const DIRS = { 12: [0, -1], 13: [0, 1], 14: [-1, 0], 15: [1, 0] };

export class MenuNavigator {
    constructor(input, { active, back }) {
        this.active = active;
        this.back = back;
        input.addEventListener("padButton", (e) => {
            if (!this.active()) return;
            const b = e.detail;
            if (DIRS[b]) this.#move(...DIRS[b]);
            else if (b === 0) this.#press();
            else if (b === 1) this.back();
        });
    }

    // Éléments visibles et cliquables (écran affiché, boîte de dialogue ouverte).
    #candidates() {
        const dialog = document.querySelector(".dialog-backdrop:not(.closed)");
        const scope = dialog ?? document;
        return [...scope.querySelectorAll(FOCUSABLE)].filter((el) => {
            if (el.closest(".hidden, .closed")) return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
        });
    }

    #move(dx, dy) {
        const items = this.#candidates();
        if (!items.length) return;
        const current = items.includes(document.activeElement) ? document.activeElement : null;
        if (!current) return this.#focus(items[0]);
        // Curseur (volume, distance de la caméra...) : gauche / droite changent sa valeur.
        if (current instanceof HTMLInputElement && current.type === "range" && dx) {
            if (dx > 0) current.stepUp();
            else current.stepDown();
            current.dispatchEvent(new Event("input", { bubbles: true }));
            current.dispatchEvent(new Event("change", { bubbles: true }));
            return;
        }
        const from = center(current.getBoundingClientRect());
        let best = null;
        let bestScore = Infinity;
        for (const el of items) {
            if (el === current) continue;
            const to = center(el.getBoundingClientRect());
            const vx = to.x - from.x;
            const vy = to.y - from.y;
            const along = vx * dx + vy * dy; // distance dans la direction demandée
            if (along <= 4) continue;
            const across = Math.abs(vx * dy - vy * dx); // écart de côté, pénalisé
            const score = along + across * 2.2;
            if (score < bestScore) {
                bestScore = score;
                best = el;
            }
        }
        if (best) this.#focus(best);
    }

    #press() {
        const el = document.activeElement;
        if (!el || el === document.body || !this.#candidates().includes(el)) {
            const first = this.#candidates()[0];
            if (first) this.#focus(first);
            return;
        }
        if (el instanceof HTMLInputElement && el.type === "checkbox") el.click();
        else if (el instanceof HTMLInputElement) el.focus();
        else el.click();
    }

    #focus(el) {
        el.focus({ preventScroll: false });
        el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
}

const center = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
