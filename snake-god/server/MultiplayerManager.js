import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";
import { RECONNECT_GRACE_MS } from "../shared/config.js";
import { DEFAULT_COSMETICS, sanitizeCosmetics } from "../shared/cosmetics.js";
import { C2S, S2C } from "../shared/protocol.js";
import { Room } from "./Room.js";

const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

// Serveur autoritaire : connexions WebSocket, profils, salons.
// Chaque salon (Room) fait tourner sa propre partie. Un jeton par joueur
// permet de reprendre sa place (et son salon) après une déconnexion.
export class MultiplayerManager {
    constructor(httpServer, gameOptions = {}) {
        this.gameOptions = gameOptions;
        this.players = new Map(); // id -> joueur
        this.rooms = new Map(); // code -> Room
        this.wss = new WebSocketServer({ server: httpServer, path: "/ws" });
        this.wss.on("connection", (ws) => this.#onConnection(ws));
        this.heartbeat = setInterval(() => this.#heartbeat(), 5000);
    }

    close() {
        clearInterval(this.heartbeat);
        for (const room of this.rooms.values()) room.close();
        this.wss.close();
    }

    #onConnection(ws) {
        ws.isAlive = true;
        ws.on("pong", () => (ws.isAlive = true));
        let player = null;

        ws.on("message", (raw) => {
            let msg;
            try {
                msg = JSON.parse(raw);
            } catch {
                return;
            }
            if (!player) {
                if (msg.t === C2S.HELLO) player = this.#attach(ws, msg);
                return;
            }
            this.#handle(player, msg);
        });

        ws.on("close", () => {
            if (!player || player.ws !== ws) return;
            player.connected = false;
            player.disconnectedAt = Date.now();
            player.room?.onDisconnect(player);
            this.#broadcastRooms();
        });
    }

    #attach(ws, { token, name, cosmetics }) {
        let player = token ? [...this.players.values()].find((p) => p.token === token) : null;
        if (player) {
            if (player.ws && player.ws !== ws) player.ws.close();
            player.ws = ws;
            player.connected = true;
        } else {
            player = {
                id: randomUUID().slice(0, 8),
                token: randomUUID(),
                name: cleanName(name),
                cosmetics: sanitizeCosmetics(cosmetics, DEFAULT_COSMETICS.snake1),
                role: null,
                room: null,
                ws,
                connected: true,
            };
            this.players.set(player.id, player);
        }
        this.#send(player, {
            t: S2C.WELCOME,
            token: player.token,
            playerId: player.id,
            profile: { name: player.name, cosmetics: player.cosmetics },
        });
        if (player.room) player.room.onReconnect(player);
        else {
            this.#send(player, { t: S2C.ROOM, code: null });
            this.#sendRooms(player);
        }
        return player;
    }

    #handle(player, msg) {
        switch (msg.t) {
            case C2S.SET_PROFILE:
                if (typeof msg.name === "string") player.name = cleanName(msg.name);
                if (msg.cosmetics) player.cosmetics = sanitizeCosmetics(msg.cosmetics, player.cosmetics);
                player.room?.broadcastRoom();
                return;
            case C2S.LIST_ROOMS:
                return this.#sendRooms(player);
            case C2S.CREATE_ROOM: {
                this.#leave(player);
                const room = this.#createRoom(`Salon de ${player.name}`, !!msg.private);
                room.add(player);
                return this.#broadcastRooms();
            }
            case C2S.JOIN_ROOM: {
                const room = this.rooms.get(String(msg.code ?? "").toUpperCase().trim());
                if (!room) return this.#send(player, { t: S2C.NOTICE, message: "Salon introuvable." });
                if (room === player.room) return;
                this.#leave(player);
                room.add(player);
                return this.#broadcastRooms();
            }
            case C2S.LEAVE_ROOM:
                this.#leave(player);
                this.#send(player, { t: S2C.ROOM, code: null });
                this.#sendRooms(player);
                return;
            case C2S.QUICK_PLAY: {
                // Salon privé, le joueur prend son rôle (ou regarde), l'IA fait le reste.
                this.#leave(player);
                const room = this.#createRoom("Partie rapide", true);
                room.add(player);
                room.handle(player, { t: C2S.CHOOSE_ROLE, role: msg.role ?? null });
                room.start();
                return;
            }
            default:
                player.room?.handle(player, msg);
        }
    }

    #createRoom(name, isPrivate) {
        let code;
        do {
            code = Array.from({ length: 4 }, () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]).join("");
        } while (this.rooms.has(code));
        const room = new Room(code, { name, isPrivate, gameOptions: this.gameOptions, send: (p, m) => this.#send(p, m) });
        this.rooms.set(code, room);
        return room;
    }

    #leave(player) {
        const room = player.room;
        if (!room) return;
        room.remove(player);
        if (room.players.size === 0) this.#closeRoom(room);
        this.#broadcastRooms();
    }

    #closeRoom(room) {
        room.close();
        this.rooms.delete(room.code);
    }

    #heartbeat() {
        for (const ws of this.wss.clients) {
            if (!ws.isAlive) {
                ws.terminate();
                continue;
            }
            ws.isAlive = false;
            ws.ping();
        }
        // Un joueur absent trop longtemps quitte son salon ; un salon vide est fermé.
        for (const p of [...this.players.values()]) {
            if (p.connected || Date.now() - p.disconnectedAt < RECONNECT_GRACE_MS) continue;
            if (p.room?.inMatch) continue; // garde sa place jusqu'à la fin de la partie
            this.#leave(p);
            this.players.delete(p.id);
        }
        for (const room of [...this.rooms.values()]) {
            if (room.connectedCount === 0 && !room.inMatch && room.players.size === 0) this.#closeRoom(room);
        }
    }

    #roomList() {
        return [...this.rooms.values()].filter((r) => !r.isPrivate).map((r) => r.info());
    }

    #sendRooms(player) {
        this.#send(player, { t: S2C.ROOMS, rooms: this.#roomList() });
    }

    #broadcastRooms() {
        const msg = { t: S2C.ROOMS, rooms: this.#roomList() };
        for (const p of this.players.values()) if (!p.room) this.#send(p, msg);
    }

    #send(player, msg) {
        if (player.connected && player.ws?.readyState === 1) player.ws.send(JSON.stringify(msg));
    }
}

function cleanName(name) {
    const n = String(name ?? "").trim().slice(0, 16);
    return n || "Joueur";
}
