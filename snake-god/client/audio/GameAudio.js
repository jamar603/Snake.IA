import { MAPS } from "/shared/config.js";
import { chebyshev, key, rotatingWallCells } from "/shared/grid.js";
import { foodKind, trapKind } from "../render/catalog.js";
import { Ambient } from "./Ambient.js";
import { Music } from "./Music.js";
import { GodSounds } from "./sounds/god.js";
import { SnakeSounds } from "./sounds/snake.js";
import { UISounds } from "./sounds/ui.js";
import { WorldSounds } from "./sounds/world.js";

// Intensité musicale de base par phase.
const PHASE_INTENSITY = { 1: 0.12, 2: 0.4, 3: 0.62, 4: 0.8 };

// Relie le jeu au son : événements du serveur -> effets (spatialisés),
// état de la partie -> intensité de la musique, danger -> battements de cœur,
// vision divine -> notification réservée au Snake God.
export class GameAudio {
    constructor(audio, cellToWorld) {
        this.audio = audio;
        this.cellToWorld = cellToWorld;
        this.music = new Music(audio);
        this.ambient = new Ambient(audio);
        this.lastHeartbeat = 0;
        this.lastCountdown = null;
        this.intelKey = null;
        this.saidFinal = false;
        this.combo = { count: 0, at: 0 }; // repas enchaînés du joueur local
        this.mapKind = "cube";
        audio.onReady(() => {
            this.music.start();
            this.ambient.start();
        });
    }

    // ---------- Raccourcis ----------
    #pos(cell) {
        return cell ? this.cellToWorld(cell) : null;
    }

    #play(category, recipe, opts = {}) {
        this.audio.play(category, recipe, opts);
    }

    // ---------- Menus ----------
    menu() {
        this.music.setMode("menu");
        this.music.setIntensity(0.1);
        this.ambient.update(0.05, 0.3);
        this.intelKey = null;
        this.saidFinal = false;
        this.lastCountdown = null;
    }

    bindInterface(root = document) {
        let lastHover = null;
        root.addEventListener("mouseover", (e) => {
            const btn = e.target.closest?.("button");
            if (!btn || btn === lastHover || btn.disabled) return;
            lastHover = btn;
            this.#play("ui", UISounds.hover);
        });
        root.addEventListener("mouseout", (e) => {
            if (e.target.closest?.("button") === lastHover) lastHover = null;
        });
        root.addEventListener("click", (e) => {
            const btn = e.target.closest?.("button");
            if (!btn || btn.disabled) return;
            if (btn.matches(".back-btn, [data-back], #leave-room-btn, #end-menu")) this.#play("ui", UISounds.back);
            else if (btn.matches(".cta, [data-solo-role], [data-mode]")) this.#play("ui", UISounds.confirm);
            else this.#play("ui", UISounds.click);
        });
    }

    notice(isGod) {
        this.#play(isGod ? "god" : "ui", isGod ? GodSounds.denied : UISounds.error);
    }

    transition() {
        this.#play("ui", UISounds.transition);
    }

    // ---------- Partie ----------
    onState(state, prev, myRole) {
        if (state.status === "ended") return;
        this.mapKind = state.map?.kind ?? "cube";
        this.#countdown(state, prev);
        const mine = state.snakes.find((s) => s.id === myRole);
        const danger = mine?.alive ? this.#danger(state, mine) : 0;

        // Intensité : phase, fin du timer, taille des Snakes, expansion, danger.
        let intensity = PHASE_INTENSITY[state.phase] ?? 0.12;
        const longest = Math.max(0, ...state.snakes.map((s) => s.length));
        intensity += Math.min(0.12, longest / 180);
        if (state.expansion) intensity += 0.08;
        intensity += danger * 0.1;
        if (state.status === "playing" && state.timeLeftMs != null && state.timeLeftMs < 20000) {
            intensity = 1;
            if (!this.saidFinal) {
                this.saidFinal = true;
                this.audio.say("Vingt secondes");
            }
        }
        if (state.status === "countdown") intensity = Math.min(intensity, 0.2);
        this.music.setMode("game");
        this.music.setIntensity(intensity);
        // Taille relative du monde (0..1) : la plus grande taille de la map en cours.
        const sizes = MAPS[state.map?.kind ?? "cube"].sizes;
        this.ambient.update(intensity, state.arena.size / sizes.at(-1));

        // Déplacement du Snake local : petit tic alterné à chaque case.
        if (mine?.alive && prev && state.status === "playing") {
            const before = prev.snakes.find((s) => s.id === myRole);
            if (before?.body[0] && mine.body[0] && key(before.body[0]) !== key(mine.body[0])) {
                this.#play("snake", (c, o, t) => SnakeSounds.move(c, o, t, { alt: state.tick % 2 === 0 }));
            }
        }

        // Danger : battement de cœur discret (peu de PV, piège ou zone tout proche).
        const now = performance.now();
        const low = mine?.alive && mine.hp === 1;
        const pulse = Math.max(low ? 0.6 : 0, danger);
        if (pulse > 0.3 && now - this.lastHeartbeat > (pulse > 0.8 ? 650 : 1000)) {
            this.lastHeartbeat = now;
            this.#play("snake", (c, o, t) => SnakeSounds.heartbeat(c, o, t, { strength: pulse }));
        }

        // Vision divine : nouvelle révélation -> notification exclusive au Snake God.
        if (myRole === "god" && state.intel?.nextEvent) {
            const ev = state.intel.nextEvent;
            const k = `${ev.type}:${ev.cells.map(key).join("|")}`;
            if (k !== this.intelKey && state.status === "playing") {
                this.intelKey = k;
                this.#play("god", GodSounds.intel, { echo: 0.35, reverb: 0.3 });
            }
        }

        this.#events(state, myRole);
    }

    // 0..1 selon la proximité du danger le plus proche (pièges, zones, lames).
    #danger(state, snake) {
        const head = snake.body[0];
        if (!head) return 0;
        let d = Infinity;
        for (const c of state.traps) d = Math.min(d, chebyshev(head, c));
        for (const z of state.zones ?? []) for (const c of z.cells) d = Math.min(d, chebyshev(head, c));
        for (const w of state.walls) {
            if (w.kind !== "rotating") continue;
            for (const c of rotatingWallCells(w.pivot, w.axis, w.arm, w.turns + 1)) d = Math.min(d, chebyshev(head, c));
        }
        return d <= 1 ? 1 : d === 2 ? 0.5 : 0;
    }

    #countdown(state, prev) {
        if (state.status === "countdown") {
            const n = Math.ceil(state.countdownMs / 1000);
            if (n !== this.lastCountdown && n <= 3 && n > 0) this.#play("world", WorldSounds.countdown);
            this.lastCountdown = n;
        } else if (prev?.status === "countdown" && state.status === "playing") {
            this.#play("world", (c, o, t) => WorldSounds.countdown(c, o, t, { go: true }));
        }
    }

    #events(state, myRole) {
        for (const ev of state.events) {
            const position = this.#pos(ev.cells?.[0]);
            const mine = ev.snake === myRole;
            const gain = ev.snake && !mine ? 0.6 : 1;
            switch (ev.type) {
                case "foodEaten": {
                    // Repas enchaînés (moins de 3 s d'écart) : la note monte, comme un combo.
                    let combo = 0;
                    if (mine) {
                        const now = performance.now();
                        this.combo.count = now - this.combo.at < 3000 ? this.combo.count + 1 : 0;
                        this.combo.at = now;
                        combo = this.combo.count;
                    }
                    // Bouchée propre à l'aliment (croquant, juteux, viande...) : voir catalog.js.
                    const flavor = foodKind(ev).flavor;
                    const recipe = ev.golden ? SnakeSounds.golden : (c, o, t) => SnakeSounds.eat(c, o, t, { combo, flavor });
                    this.#play("snake", recipe, { position, gain, echo: mine ? 0.25 : 0 });
                    if (mine) this.#play("snake", SnakeSounds.grow, { delay: 0.12, gain: 0.7 });
                    break;
                }
                case "damage":
                    this.#play("snake", SnakeSounds.hurt, { position, gain });
                    if (ev.cause === "trap") {
                        // Même modèle que celui affiché (le Cube 3D n'a que des mines).
                        const kind = this.mapKind === "volume" ? "RuneMine" : trapKind(ev.cells[0]);
                        this.#play("snake", (c, o, t) => SnakeSounds.trapHit(c, o, t, { kind }), { position, gain });
                    }
                    else if (["boundary", "wall", "snake", "headOn", "crushed"].includes(ev.cause)) this.#play("snake", SnakeSounds.collision, { position, gain });
                    break;
                case "eliminated":
                    this.#play("snake", SnakeSounds.death, { position, reverb: 0.5 });
                    this.#play("world", WorldSounds.elimination, { delay: 0.3 });
                    this.music.hit();
                    break;
                case "healed":
                    this.#play("snake", SnakeSounds.heal, { position, gain, delay: 0.15 });
                    break;
                case "respawn":
                    this.#play("snake", SnakeSounds.respawn, { position, gain });
                    break;
                case "evolved":
                    this.#play("snake", SnakeSounds.evolve, { position, gain: mine ? 1 : 0.5, reverb: 0.3, echo: 0.2 });
                    break;
                case "trapPlaced":
                    this.#play("god", GodSounds.trap, { position, reverb: 0.25, echo: 0.2 });
                    break;
                case "wallPlaced":
                    this.#play("god", ev.power === "rotatingWall" ? GodSounds.rotatingWall : GodSounds.wall, { position, reverb: 0.35 });
                    break;
                case "wallRotated":
                    this.#play("god", GodSounds.rotate, { position: this.#pos(ev.cells[Math.floor(ev.cells.length / 2)]), gain: 0.8 });
                    break;
                case "wallDemolished":
                    this.#play("god", GodSounds.demolish, { position, reverb: 0.3 });
                    break;
                case "wallExpired":
                    this.#play("god", GodSounds.demolish, { position, gain: 0.35 });
                    break;
                case "zoneCreated":
                    this.#play("god", GodSounds.zone, { position, reverb: 0.3 });
                    break;
                case "zoneActive":
                    if (ev.kind === "meteor") {
                        ev.cells.slice(0, 3).forEach((c, i) => this.#play("world", WorldSounds.explosion, { position: this.#pos(c), delay: i * 0.07, reverb: 0.4 }));
                    } else this.#play("world", WorldSounds.burn, { position });
                    break;
                case "worldEvent":
                    if (ev.forced) this.#play("god", GodSounds.trigger, { reverb: 0.9, echo: 0.2 });
                    if (ev.event === "goldenFruit") this.#play("world", WorldSounds.goldenFruit, { position, reverb: 0.4 });
                    else if (ev.event === "foodRain") this.#play("world", WorldSounds.foodRain, { position });
                    else if (ev.event === "meteorShower") {
                        ev.cells.slice(0, 3).forEach((c, i) => this.#play("world", WorldSounds.meteorFall, { position: this.#pos(c), delay: i * 0.1 }));
                    }
                    break;
                case "phase":
                    this.#play("world", (c, o, t) => WorldSounds.phase(c, o, t, { phase: ev.phase }), { reverb: 0.6 });
                    this.music.build(0.5);
                    setTimeout(() => this.music.hit(), 450);
                    this.audio.say(`Phase ${["", "un", "deux", "trois", "quatre"][ev.phase]}`);
                    break;
                case "expansionStart": {
                    const d = ev.inMs / 1000;
                    this.#play("world", (c, o, t) => WorldSounds.expansionRise(c, o, t, { duration: d }), { reverb: 0.4 });
                    this.#play("world", (c, o, t) => WorldSounds.construction(c, o, t, { duration: 1.4 }), { delay: Math.max(0, d - 1.5) });
                    this.music.build(d);
                    this.audio.say("Expansion du monde");
                    break;
                }
                case "expansionComplete":
                    this.#play("world", WorldSounds.expansionImpact, { reverb: 0.8 });
                    this.music.hit();
                    break;
            }
        }
    }

    // Fin de partie : signature sonore selon le résultat, du point de vue du joueur.
    onEnd(summary, myRole, timeUp) {
        this.music.setMode("end");
        const godWon = summary.winner === "god";
        if (timeUp) this.#play("world", WorldSounds.timeUp, { reverb: 0.6 });
        const won = myRole === "god" ? godWon : myRole ? !godWon : null;
        const delay = 0.6;
        if (won === false) this.#play("world", WorldSounds.defeat, { delay });
        else if (godWon) this.#play("world", WorldSounds.victoryGod, { delay, reverb: 0.7 });
        else this.#play("world", WorldSounds.victorySnake, { delay, reverb: 0.5 });
        this.audio.say(won === null ? (godWon ? "Le dieu triomphe" : "Les Snakes survivent") : won ? "Victoire" : "Défaite");
    }
}
