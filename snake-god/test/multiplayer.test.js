import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import WebSocket from "ws";
import { C2S, S2C } from "../shared/protocol.js";
import { createMap } from "../shared/maps/index.js";
import { MultiplayerManager } from "../server/MultiplayerManager.js";

// Client de test : historique des messages, `wait` cherche le prochain message
// qui correspond (même s'il est déjà arrivé).
function client(port, token) {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    const c = { ws, history: [], cursor: 0, waiters: [] };
    ws.on("message", (raw) => {
        c.history.push(JSON.parse(raw));
        c.waiters = c.waiters.filter((w) => !w.check());
    });
    c.send = (msg) => ws.send(JSON.stringify(msg));
    c.wait = (pred, ms = 3000, label = "message") =>
        new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`délai dépassé : ${label}`)), ms);
            const check = () => {
                for (let i = c.cursor; i < c.history.length; i++) {
                    if (!pred(c.history[i])) continue;
                    c.cursor = i + 1;
                    clearTimeout(timer);
                    resolve(c.history[i]);
                    return true;
                }
                return false;
            };
            if (!check()) c.waiters.push({ check });
        });
    c.ready = new Promise((r) => ws.on("open", r)).then(() => {
        c.send({ t: C2S.HELLO, token, name: "Test" });
        return c.wait((m) => m.t === S2C.WELCOME);
    });
    return c;
}

// Cellule de l'arène libre et à plus d'une case des têtes.
function freeCell(state) {
    const taken = new Set();
    for (const w of state.walls) for (const c of w.cells) taken.add(c.join());
    for (const f of state.food) taken.add(f.cell.join());
    for (const c of state.traps) taken.add(c.join());
    for (const s of state.snakes) for (const c of s.body) taken.add(c.join());
    for (const t of state.teleporters ?? []) taken.add(t.a.join()).add(t.b.join());
    const heads = state.snakes.map((s) => s.body[0]);
    // Cellules de la map (surface du cube ou terrain), recréées comme le fait le client.
    for (const c of createMap(state.map.kind, state.map.arenaSize).cells()) {
        if (taken.has(c.join())) continue;
        if (heads.every((h) => Math.max(...h.map((v, i) => Math.abs(v - c[i]))) > 2)) return c;
    }
    throw new Error("aucune cellule libre");
}

test("trois joueurs, pouvoirs, fin de partie et reconnexion", async () => {
    const http = createServer();
    const mm = new MultiplayerManager(http, { matchSeconds: 3, countdownSeconds: 0 });
    await new Promise((r) => http.listen(0, r));
    const port = http.address().port;

    const a = client(port);
    const b = client(port);
    const g = client(port);
    const welcomeA = await a.ready;
    await b.ready;
    await g.ready;

    // A crée un salon, B et G le rejoignent avec son code.
    a.send({ t: C2S.CREATE_ROOM });
    const room = await a.wait((m) => m.t === S2C.ROOM && m.code);
    assert.equal(room.hostId, welcomeA.playerId);
    b.send({ t: C2S.JOIN_ROOM, code: room.code.toLowerCase() });
    g.send({ t: C2S.JOIN_ROOM, code: room.code });
    await g.wait((m) => m.t === S2C.ROOM && m.players?.length === 3);

    a.send({ t: C2S.CHOOSE_ROLE, role: "snake1" });
    b.send({ t: C2S.CHOOSE_ROLE, role: "snake2" });
    g.send({ t: C2S.CHOOSE_ROLE, role: "god" });
    await g.wait((m) => m.t === S2C.ROOM && m.players?.filter((p) => p.role).length === 3);

    // Rôle déjà pris : refusé.
    b.send({ t: C2S.CHOOSE_ROLE, role: "god" });
    const notice = await b.wait((m) => m.t === S2C.NOTICE);
    assert.match(notice.message, /déjà pris/);

    // Seul l'hôte lance.
    g.send({ t: C2S.START });
    assert.match((await g.wait((m) => m.t === S2C.NOTICE)).message, /hôte/);
    a.send({ t: C2S.START });
    const first = await a.wait((m) => m.t === S2C.STATE && m.status === "playing");
    assert.equal(first.snakes.length, 2);
    // Information exclusive : seul le Snake God la reçoit.
    assert.equal(first.intel, undefined);
    const godState = await g.wait((m) => m.t === S2C.STATE && m.status === "playing");
    assert.ok(godState.intel.nextEvent.type);
    assert.equal(godState.intel.upcomingFood.length, 3);

    // Le dieu pose un piège loin des Snakes.
    // Le dieu pose un piège sur une cellule libre, loin des Snakes.
    const spot = freeCell(godState);
    g.send({ t: C2S.POWER, power: "trap", cell: spot });
    const withTrap = await a.wait((m) => m.t === S2C.STATE && m.traps.some((c) => c.join() === spot.join()));
    assert.ok(withTrap.god.energy < 40);

    // Un Snake ne peut pas utiliser les pouvoirs.
    a.send({ t: C2S.POWER, power: "trap", cell: freeCell(withTrap) });
    a.send({ t: C2S.TURN, turn: "left" });

    // Reconnexion : même jeton -> même rôle.
    a.ws.close();
    const takeover = await g.wait((m) => m.t === S2C.STATE && m.snakes.find((s) => s.id === "snake1").ai);
    assert.ok(takeover, "l'IA remplace le joueur déconnecté");
    const a2 = client(port, welcomeA.token);
    const welcome2 = await a2.ready;
    assert.equal(welcome2.playerId, welcomeA.playerId);
    const lobby = await a2.wait((m) => m.t === S2C.ROOM && m.players?.find((p) => p.id === welcomeA.playerId)?.connected);
    assert.equal(lobby.players.find((p) => p.id === welcomeA.playerId).role, "snake1");
    const back = await a2.wait((m) => m.t === S2C.STATE && m.status === "playing");
    assert.equal(back.snakes.find((s) => s.id === "snake1").ai, false, "le joueur reprend la main");

    const end = await a2.wait((m) => m.t === S2C.END, 5000);
    assert.ok(["snakes", "god"].includes(end.summary.winner));
    assert.equal(end.summary.snakes.length, 2);
    assert.equal(withTrap.traps.length, 1, "le Snake n'a pas pu poser de piège");

    for (const c of [a2, b, g]) c.ws.close();
    mm.close();
    http.close();
});

test("partie rapide : salon privé, IA partout ailleurs", async () => {
    const http = createServer();
    const mm = new MultiplayerManager(http, { matchSeconds: 2, countdownSeconds: 0 });
    await new Promise((r) => http.listen(0, r));
    const solo = client(http.address().port);
    await solo.ready;
    solo.send({ t: C2S.QUICK_PLAY, role: "god" });
    const state = await solo.wait((m) => m.t === S2C.STATE && m.status === "playing");
    assert.equal(state.snakes.length, 2);
    assert.ok(state.snakes.every((s) => s.ai));
    assert.equal(state.god.ai, false);
    const lister = client(http.address().port);
    await lister.ready;
    const rooms = await lister.wait((m) => m.t === S2C.ROOMS);
    assert.equal(rooms.rooms.length, 0, "salon privé non listé");
    solo.ws.close();
    lister.ws.close();
    mm.close();
    http.close();
});
