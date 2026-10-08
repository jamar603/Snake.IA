import { SKILLS, SKILL_IDS } from "../shared/config.js";

// Compétences d'un Snake : chacune s'active pour `durationMs`, puis se recharge.
// La recharge démarre à l'activation (comme les pouvoirs du dieu).
export class SnakeSkills {
    constructor() {
        this.readyAt = Object.fromEntries(SKILL_IDS.map((id) => [id, 0]));
        this.activeUntil = Object.fromEntries(SKILL_IDS.map((id) => [id, 0]));
        this.used = Object.fromEntries(SKILL_IDS.map((id) => [id, 0]));
    }

    isActive(id, now) {
        return now < this.activeUntil[id];
    }

    isReady(id, now) {
        return now >= this.readyAt[id];
    }

    // Renvoie true si la compétence part.
    use(id, now) {
        const skill = SKILLS[id];
        if (!skill || !this.isReady(id, now)) return false;
        this.activeUntil[id] = now + skill.durationMs;
        this.readyAt[id] = now + skill.cooldownMs;
        this.used[id]++;
        return true;
    }

    // Le bouclier a encaissé un coup : il disparaît.
    end(id) {
        this.activeUntil[id] = 0;
    }

    snapshot(now) {
        return Object.fromEntries(
            SKILL_IDS.map((id) => [
                id,
                { activeMs: Math.max(0, this.activeUntil[id] - now), readyInMs: Math.max(0, this.readyAt[id] - now) },
            ])
        );
    }
}
