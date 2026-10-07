// Points de vie d'un Snake, avec une courte invulnérabilité après chaque coup.
export class SnakeHealth {
    constructor(maxHp, invulnerableMs) {
        this.maxHp = maxHp;
        this.hp = maxHp;
        this.invulnerableMs = invulnerableMs;
        this.invulnerableUntil = 0;
        this.damageTaken = 0;
    }

    get dead() {
        return this.hp <= 0;
    }

    isInvulnerable(now) {
        return now < this.invulnerableUntil;
    }

    // Rend des PV sans dépasser le maximum. Renvoie true si des PV ont été rendus.
    heal(amount = 1) {
        if (this.dead || this.hp >= this.maxHp) return false;
        this.hp = Math.min(this.maxHp, this.hp + amount);
        return true;
    }

    // Retire `amount` PV sauf pendant l'invulnérabilité. Renvoie true si appliqué.
    damage(now, amount = 1) {
        if (this.dead || this.isInvulnerable(now)) return false;
        this.hp = Math.max(0, this.hp - amount);
        this.damageTaken += amount;
        this.invulnerableUntil = now + this.invulnerableMs;
        return true;
    }
}
