import { DEFAULT_MAP, MAPS, MATCH_DURATIONS, MATCH_SECONDS, ROLE_INFO, ROLES, SNAKE_ROLES } from "../shared/config.js";
import { C2S, MATCH_STATUS, S2C, TURNS } from "../shared/protocol.js";
import { GameManager } from "./GameManager.js";

// Un salon : ses joueurs, leurs rôles et sa partie. Les rôles sans joueur
// (ou dont le joueur est déconnecté) sont joués par l'IA.
export class Room {
    constructor(code, { name, isPrivate = false, gameOptions = {}, send }) {
        this.code = code;
        this.name = name;
        this.isPrivate = isPrivate;
        this.game = new GameManager(gameOptions);
        this.duration = gameOptions.matchSeconds ?? MATCH_SECONDS; // secondes, 0 = illimitée
        this.map = DEFAULT_MAP; // "cube" ou "world"
        this.players = new Set();
        this.hostId = null;
        this.timer = null;
        this.send = send; // (player, msg) => void
    }

    get inMatch() {
        return this.game.status === MATCH_STATUS.COUNTDOWN || this.game.status === MATCH_STATUS.PLAYING;
    }

    get connectedCount() {
        return [...this.players].filter((p) => p.connected).length;
    }

    add(player) {
        this.players.add(player);
        player.room = this;
        player.role = null;
        if (!this.hostId) this.hostId = player.id;
        this.broadcastRoom();
        this.sendCurrentState(player);
    }

    remove(player) {
        if (player.role && this.inMatch) this.game.setAiControl(player.role, true);
        this.players.delete(player);
        player.room = null;
        player.role = null;
        if (this.hostId === player.id) this.hostId = [...this.players][0]?.id ?? null;
        this.broadcastRoom();
    }

    onDisconnect(player) {
        if (player.role && this.inMatch) this.game.setAiControl(player.role, true);
        if (this.hostId === player.id) this.hostId = [...this.players].find((p) => p.connected)?.id ?? this.hostId;
        this.broadcastRoom();
    }

    onReconnect(player) {
        if (player.role && this.inMatch) this.game.setAiControl(player.role, false);
        this.broadcastRoom();
        this.sendCurrentState(player);
    }

    sendCurrentState(player) {
        if (this.game.status === MATCH_STATUS.LOBBY) return;
        const state = this.game.snapshot();
        if (state) this.send(player, this.#stateFor(player, { ...state, events: [] }));
        if (this.game.status === MATCH_STATUS.ENDED) this.send(player, { t: S2C.END, summary: this.game.summary });
    }

    handle(player, msg) {
        const status = this.game.status;
        const idle = status === MATCH_STATUS.LOBBY || status === MATCH_STATUS.ENDED;
        switch (msg.t) {
            case C2S.CHOOSE_ROLE: {
                if (!idle) return;
                const role = msg.role ?? null;
                if (role !== null && !ROLES.includes(role)) return;
                if (role && [...this.players].some((p) => p.role === role && p !== player)) {
                    return this.#notice(player, "Ce rôle est déjà pris.");
                }
                player.role = role;
                return this.broadcastRoom();
            }
            case C2S.SET_DURATION:
                if (!idle || player.id !== this.hostId) return;
                if (!this.setDuration(msg.seconds)) return;
                return this.broadcastRoom();
            case C2S.SET_MAP:
                if (!idle || player.id !== this.hostId) return;
                if (!this.setMap(msg.map)) return;
                return this.broadcastRoom();
            case C2S.START:
                if (!idle) return;
                if (player.id !== this.hostId) return this.#notice(player, "Seul l'hôte peut lancer la partie.");
                return this.start();
            case C2S.TURN:
                if (SNAKE_ROLES.includes(player.role) && TURNS.includes(msg.turn)) this.game.handleTurn(player.role, msg.turn);
                return;
            case C2S.SKILL:
                if (SNAKE_ROLES.includes(player.role)) this.game.handleSkill(player.role, msg.skill);
                return;
            case C2S.POWER: {
                if (player.role !== "god") return;
                const result = this.game.handlePower(msg);
                if (!result.ok) this.#notice(player, result.error);
                return;
            }
            case C2S.BACK_TO_LOBBY:
                if (status !== MATCH_STATUS.ENDED) return;
                this.game.status = MATCH_STATUS.LOBBY;
                return this.broadcastRoom();
        }
    }

    // Renvoie true si la durée fait partie des choix proposés.
    setDuration(seconds) {
        const s = Number(seconds);
        if (!MATCH_DURATIONS.includes(s)) return false;
        this.duration = s;
        return true;
    }

    setMap(kind) {
        if (!MAPS[kind]) return false;
        this.map = kind;
        return true;
    }

    // Les rôles libres (ou dont le joueur est absent) sont joués par l'IA.
    start() {
        this.game.setDuration(this.duration);
        this.game.setMap(this.map);
        const roster = {};
        for (const role of ROLES) roster[role] = { name: `IA ${ROLE_INFO[role].label}`, ai: true };
        for (const p of this.players) {
            if (p.role) roster[p.role] = { name: p.name, ai: !p.connected, cosmetics: p.cosmetics };
        }
        this.game.startMatch(roster);
        this.broadcastRoom();
        this.#loop();
    }

    #loop() {
        clearTimeout(this.timer);
        const step = () => {
            this.game.tick(this.game.tickMs);
            const state = this.game.snapshot();
            for (const p of this.players) this.send(p, this.#stateFor(p, state));
            if (this.game.status === MATCH_STATUS.ENDED) {
                this.broadcast({ t: S2C.END, summary: this.game.summary });
                this.broadcastRoom();
                return;
            }
            this.timer = setTimeout(step, this.game.tickMs);
        };
        this.timer = setTimeout(step, this.game.tickMs);
    }

    // Seul le Snake God reçoit l'information exclusive.
    #stateFor(player, state) {
        const msg = { t: S2C.STATE, ...state };
        if (player.role === "god") msg.intel = this.game.godIntel();
        return msg;
    }

    info() {
        return {
            code: this.code,
            name: this.name,
            status: this.game.status,
            map: this.map,
            players: this.connectedCount,
            roles: ROLES.filter((r) => [...this.players].some((p) => p.role === r)),
        };
    }

    broadcastRoom() {
        this.broadcast({
            t: S2C.ROOM,
            code: this.code,
            name: this.name,
            private: this.isPrivate,
            hostId: this.hostId,
            status: this.game.status,
            duration: this.duration,
            map: this.map,
            players: [...this.players].map((p) => ({
                id: p.id,
                name: p.name,
                role: p.role,
                connected: p.connected,
                cosmetics: p.cosmetics,
            })),
        });
    }

    broadcast(msg) {
        for (const p of this.players) this.send(p, msg);
    }

    #notice(player, message) {
        this.send(player, { t: S2C.NOTICE, message });
    }

    close() {
        clearTimeout(this.timer);
    }
}
