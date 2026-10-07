import { SNAKE } from "../shared/config.js";
import { add, cross, neg } from "../shared/grid.js";
import { SnakeGrowth } from "./SnakeGrowth.js";
import { SnakeHealth } from "./SnakeHealth.js";

// Un Snake sur la grille 3D. Les virages sont relatifs à la tête :
// gauche/droite tournent autour de `up`, haut/bas font basculer le nez.
export class SnakeController {
    constructor(id, name) {
        this.id = id;
        this.name = name;
        this.body = []; // cellules, tête en premier
        this.dir = [1, 0, 0];
        this.up = [0, 1, 0];
        this.turnQueue = [];
        this.health = new SnakeHealth(SNAKE.maxHp, SNAKE.invulnerableMs);
        this.growth = new SnakeGrowth();
        this.alive = true;
        this.score = 0;
        this.diedAt = null; // temps de jeu (ms) de l'élimination
        this.trapsTriggered = 0;
    }

    get head() {
        return this.body[0];
    }

    get length() {
        return this.alive ? this.body.length : this.finalLength;
    }

    spawn(cell, dir, up, length = this.body.length || SNAKE.startLength) {
        // Tous les segments empilés sur la même cellule : le corps se déplie en avançant.
        this.body = Array.from({ length }, () => [...cell]);
        this.dir = dir;
        this.up = up;
        this.turnQueue = [];
    }

    queueTurn(turn) {
        if (this.turnQueue.length < SNAKE.maxQueuedTurns) this.turnQueue.push(turn);
    }

    applyQueuedTurn() {
        const turn = this.turnQueue.shift();
        if (!turn) return;
        const right = cross(this.dir, this.up);
        switch (turn) {
            case "right":
                this.dir = right;
                break;
            case "left":
                this.dir = neg(right);
                break;
            case "up":
                [this.dir, this.up] = [this.up, neg(this.dir)];
                break;
            case "down":
                [this.dir, this.up] = [neg(this.up), this.dir];
                break;
        }
    }

    nextHead() {
        return add(this.head, this.dir);
    }

    // true si la queue reste en place à ce déplacement (le Snake grandit).
    willGrow() {
        return this.growth.pending > 0;
    }

    advance(newHead) {
        this.body.unshift(newHead);
        if (!this.growth.consume()) this.body.pop();
    }

    eliminate(now) {
        this.finalLength = this.body.length;
        this.alive = false;
        this.diedAt = now;
        this.body = [];
    }

    snapshot(now) {
        return {
            id: this.id,
            name: this.name,
            body: this.body,
            dir: this.dir,
            up: this.up,
            hp: this.health.hp,
            maxHp: this.health.maxHp,
            invulnerable: this.health.isInvulnerable(now),
            alive: this.alive,
            score: this.score,
            length: this.length,
            cosmetics: this.cosmetics,
        };
    }
}
