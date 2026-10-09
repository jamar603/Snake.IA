// Vie d'un Snake (en %), avec une courte invulnérabilité après chaque coup.
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

    // Rend de la vie sans dépasser le maximum. Renvoie true si de la vie a été rendue.
    heal(amount) {
        if (this.dead || this.hp >= this.maxHp) return false;
        this.hp = Math.min(this.maxHp, this.hp + amount);
        return true;
    }

    // Retire `amount` de vie sauf pendant l'invulnérabilité. Renvoie true si appliqué.
    damage(now, amount) {
        if (this.dead || this.isInvulnerable(now)) return false;
        this.hp = Math.max(0, this.hp - amount);
        this.damageTaken += amount;
        this.invulnerableUntil = now + this.invulnerableMs;
        return true;
    }
}
