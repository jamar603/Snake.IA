import { C2S, S2C } from "/shared/protocol.js";

const TOKEN_KEY = "snakegod.token";

// Côté client du MultiplayerManager : connexion WebSocket, jeton de reconnexion
// (par onglet, pour pouvoir jouer à plusieurs sur un seul PC) et reconnexion automatique.
export class MultiplayerClient extends EventTarget {
    constructor(getProfile) {
        super();
        this.getProfile = getProfile;
        this.ws = null;
        this.playerId = null;
        this.retryMs = 500;
        this.connected = false;
    }

    connect() {
        const proto = location.protocol === "https:" ? "wss" : "ws";
        const ws = new WebSocket(`${proto}://${location.host}/ws`);
        this.ws = ws;
        ws.addEventListener("open", () => {
            this.retryMs = 500;
            this.connected = true;
            this.#emit("connection", { connected: true });
            const token = storage(() => sessionStorage.getItem(TOKEN_KEY));
            this.send({ t: C2S.HELLO, token, ...this.getProfile() });
        });
        ws.addEventListener("message", (e) => {
            const msg = JSON.parse(e.data);
            if (msg.t === S2C.WELCOME) {
                this.playerId = msg.playerId;
                storage(() => sessionStorage.setItem(TOKEN_KEY, msg.token));
                // Le profil local fait foi (personnalisation faite hors connexion).
                this.send({ t: C2S.SET_PROFILE, ...this.getProfile() });
            }
            this.#emit(msg.t, msg);
        });
        ws.addEventListener("close", () => {
            this.connected = false;
            this.#emit("connection", { connected: false });
            setTimeout(() => this.connect(), this.retryMs);
            this.retryMs = Math.min(this.retryMs * 2, 5000);
        });
    }

    send(msg) {
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
    }

    updateProfile() {
        this.send({ t: C2S.SET_PROFILE, ...this.getProfile() });
    }

    quickPlay(role) {
        this.send({ t: C2S.QUICK_PLAY, role });
    }

    listRooms() {
        this.send({ t: C2S.LIST_ROOMS });
    }

    createRoom(isPrivate) {
        this.send({ t: C2S.CREATE_ROOM, private: isPrivate });
    }

    joinRoom(code) {
        this.send({ t: C2S.JOIN_ROOM, code });
    }

    leaveRoom() {
        this.send({ t: C2S.LEAVE_ROOM });
    }

    chooseRole(role) {
        this.send({ t: C2S.CHOOSE_ROLE, role });
    }

    start() {
        this.send({ t: C2S.START });
    }

    turn(turn) {
        this.send({ t: C2S.TURN, turn });
    }

    usePower(power, cell, axis) {
        this.send({ t: C2S.POWER, power, cell, axis });
    }

    backToLobby() {
        this.send({ t: C2S.BACK_TO_LOBBY });
    }

    on(type, fn) {
        this.addEventListener(type, (e) => fn(e.detail));
    }

    #emit(type, detail) {
        this.dispatchEvent(new CustomEvent(type, { detail }));
    }
}

function storage(fn) {
    try {
        return fn();
    } catch {
        return null;
    }
}
