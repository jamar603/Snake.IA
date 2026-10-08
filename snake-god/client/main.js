import * as THREE from "three";
import { GRID_SIZE, MAPS } from "/shared/config.js";
import { createMap } from "/shared/maps/index.js";
import { DEFAULT_COSMETICS } from "/shared/cosmetics.js";
import { cross, key } from "/shared/grid.js";
import { MATCH_STATUS, S2C } from "/shared/protocol.js";
import { AudioManager } from "./audio/AudioManager.js";
import { GameAudio } from "./audio/GameAudio.js";
import { GodController } from "./input/GodController.js";
import { SnakeInput } from "./input/SnakeInput.js";
import { MultiplayerClient } from "./net/MultiplayerClient.js";
import { CameraController } from "./render/Cameras.js";
import { foodKind } from "./render/catalog.js";
import { cellToWorld } from "./render/coords.js";
import { Effects } from "./render/Effects.js";
import { Environment } from "./render/Environment.js";
import { MenuStage } from "./render/MenuStage.js";
import { PostFX } from "./render/PostFX.js";
import { SnakeView } from "./render/SnakeView.js";
import { WorldController } from "./render/WorldController.js";
import { Settings } from "./settings.js";
import { renderEnd } from "./ui/EndScreen.js";
import { Hud } from "./ui/Hud.js";
import { UIManager } from "./ui/UIManager.js";

// ---------- Scène et rendu ----------
const settings = new Settings();
const canvas = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(settings.get("fov"), 1, 0.1, 300);
const postfx = new PostFX(renderer, scene, camera);
const MENU_ARENA = 7; // taille du cube affiché dans les menus
// Map courante (CUBE ou WORLD) : même topologie que le serveur, recréée depuis l'état.
let map = createMap("cube", MENU_ARENA);
let space = GRID_SIZE; // espace de coordonnées de la map
const env = new Environment(scene, GRID_SIZE);
env.setArena(MENU_ARENA);
const world = new WorldController(scene, GRID_SIZE, map);
const effects = new Effects(scene);
const menuStage = new MenuStage(scene, effects, MENU_ARENA);
const cameras = new CameraController(camera, canvas, MENU_ARENA);
cameras.setMap("cube", MENU_ARENA);

// ---------- Réseau et interface ----------
const net = new MultiplayerClient(() => ({ name: settings.profile.name, cosmetics: settings.profile.cosmetics }));
const ui = new UIManager(settings);
const hud = new Hud();
const god = new GodController({ scene, camera, canvas, size: GRID_SIZE, net, map });
const snakeInput = new SnakeInput(
    (turn) => net.turn(turn),
    (skill) => net.useSkill(skill)
);
const audio = new AudioManager(settings);
const gameAudio = new GameAudio(audio, (c) => cellToWorld(c, space));
gameAudio.bindInterface();
gameAudio.menu();

let mode = "menu"; // "menu" | "game"
let room = null;
let myRole = null;
let state = null;
let stateTime = 0;
let quickRole = undefined; // rôle de la dernière partie rapide (pour "Rejouer")
const snakeViews = new Map();

// ---------- Paramètres ----------
function applySettings() {
    const q = settings.quality;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
    postfx.enabled = q.bloom && settings.get("bloom");
    env.setShadows(q.shadows);
    effects.density = q.particles;
    camera.fov = settings.get("fov");
    cameras.snake.distance = settings.get("cameraDistance");
    hud.showHelp = settings.get("showHelp");
    resize();
}
settings.addEventListener("change", applySettings);

// ---------- Événements de l'interface ----------
ui.addEventListener("screen", (e) => {
    const custom = e.detail === "customize";
    menuStage.setShowcase(custom, settings.profile.cosmetics);
    cameras.menu.mode = custom ? "showcase" : "world";
});
ui.addEventListener("profile", (e) => {
    settings.setProfile(e.detail);
    net.updateProfile();
    menuStage.setShowcase(true, settings.profile.cosmetics);
});
ui.addEventListener("previewTier", (e) => menuStage.setShowcaseTier(e.detail));
ui.addEventListener("quickPlay", (e) => {
    quickRole = e.detail;
    net.quickPlay(e.detail, settings.get("matchDuration"), settings.get("matchMap"));
});
ui.addEventListener("setDuration", (e) => net.setDuration(e.detail));
ui.addEventListener("setMap", (e) => net.setMap(e.detail));
ui.addEventListener("createRoom", (e) => {
    quickRole = undefined;
    net.createRoom(e.detail);
});
ui.addEventListener("joinRoom", (e) => {
    quickRole = undefined;
    net.joinRoom(e.detail);
});
ui.addEventListener("refreshRooms", () => net.listRooms());
ui.addEventListener("leaveRoom", () => {
    net.leaveRoom();
    enterMenu("online");
});
ui.addEventListener("chooseRole", (e) => net.chooseRole(e.detail === myRole ? null : e.detail));
ui.addEventListener("start", () => net.start());
ui.addEventListener("endAction", (e) => {
    if (e.detail === "menu") {
        net.leaveRoom();
        enterMenu("main");
    } else if (e.detail === "lobby") net.backToLobby();
    else if (quickRole !== undefined) net.quickPlay(quickRole, settings.get("matchDuration"), settings.get("matchMap"));
    else net.start();
});
hud.addEventListener("power", (e) => god.selectPower(e.detail));
hud.addEventListener("skill", (e) => net.useSkill(e.detail));

// ---------- Quitter la partie en cours ----------
// Bouton ou Échap : confirmation, puis l'IA prend la place du joueur.
const quitDialog = document.getElementById("quit-dialog");
const quitOpen = () => !quitDialog.classList.contains("closed");
function setQuitDialog(open) {
    quitDialog.classList.toggle("closed", !open);
    if (open) document.getElementById("quit-cancel").focus();
}
document.getElementById("quit-btn").addEventListener("click", () => setQuitDialog(true));
document.getElementById("quit-cancel").addEventListener("click", () => setQuitDialog(false));
document.getElementById("quit-confirm").addEventListener("click", () => {
    setQuitDialog(false);
    net.leaveRoom();
    enterMenu("main");
});
quitDialog.addEventListener("click", (e) => e.target === quitDialog && setQuitDialog(false));
window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || mode !== "game" || ui.screen === "end") return;
    e.preventDefault();
    setQuitDialog(!quitOpen());
});
god.addEventListener("change", () => hud.renderGodTools(god));
hud.renderGodTools(god);

// ---------- Messages du serveur ----------
net.on("connection", ({ connected }) => ui.setConnection(connected));
net.on(S2C.ROOMS, ({ rooms }) => ui.renderRooms(rooms));
net.on(S2C.NOTICE, ({ message }) => {
    hud.notice(message);
    gameAudio.notice(mode === "game" && myRole === "god");
});

net.on(S2C.ROOM, (msg) => {
    if (!msg.code) {
        room = null;
        myRole = null;
        if (mode === "game" || ui.screen === "room" || ui.screen === "end") enterMenu("main");
        return;
    }
    room = msg;
    myRole = msg.players.find((p) => p.id === net.playerId)?.role ?? null;
    hud.setRole(myRole);
    ui.renderRoom(msg, net.playerId);
    const quick = msg.private && msg.name === "Partie rapide";
    if (msg.status === MATCH_STATUS.LOBBY && !quick) {
        if (mode === "game") enterMenu("room");
        else if (!["room", "customize", "settings"].includes(ui.screen)) ui.show("room");
    }
    updateControls();
});

net.on(S2C.STATE, (msg) => {
    const newMatch = !state || msg.tick < state.tick || (state.status === MATCH_STATUS.ENDED && msg.status !== MATCH_STATUS.ENDED);
    if (msg.status !== MATCH_STATUS.ENDED && mode !== "game") enterGame();
    else if (newMatch) resetMatchView();
    const prev = state;
    state = msg;
    stateTime = performance.now();
    applyState(msg);
    gameAudio.onState(msg, prev, myRole);
    updateControls();
});

net.on(S2C.END, ({ summary }) => {
    if (mode !== "game") enterGame();
    setQuitDialog(false);
    renderEnd(summary, myRole);
    gameAudio.onEnd(summary, myRole, state?.timeLeftMs === 0);
    const quick = room?.private && room?.name === "Partie rapide";
    ui.setEndActions({ canReplay: quick || room?.hostId === net.playerId, showLobby: !quick });
    hud.setVisible(false);
    ui.show("end", { push: false });
    updateControls();
});

// ---------- Passage menu <-> jeu ----------
function fadeThrough(fn) {
    const fade = document.getElementById("fade");
    fade.classList.add("on");
    setTimeout(() => {
        fn();
        fade.classList.remove("on");
    }, 260);
}

function enterGame() {
    mode = "game";
    resetMatchView();
    ui.hideAll();
    menuStage.setVisible(false);
    hud.setVisible(true, { playing: true });
}

function enterMenu(screen) {
    gameAudio.transition();
    gameAudio.menu();
    fadeThrough(() => {
        mode = "menu";
        resetMatchView();
        hud.setVisible(false);
        menuStage.setVisible(true);
        ui.show(screen, { push: false });
        updateControls();
    });
}

function resetMatchView() {
    world.clear();
    effects.clear();
    for (const v of snakeViews.values()) v.dispose();
    snakeViews.clear();
    cameras.snake.reset();
    state = null;
    env.setPhase(1);
    world.setPhase(1);
    useMap({ kind: "cube", space: GRID_SIZE, arenaSize: MENU_ARENA });
}

// Passe à la map décrite par le serveur ({ kind, space, arenaSize }) si elle a changé.
function useMap(info) {
    if (map.kind === info.kind && space === info.space) return;
    map = createMap(info.kind, info.arenaSize);
    space = info.space;
    world.setMap(map, space);
    env.setMap(map.kind, world.floorY);
    env.setArena(info.arenaSize);
    god.setMap(map, space);
    snakeInput.vertical = map.kind === "volume";
    cameras.setMap(map.kind, info.arenaSize, world.floorY);
    for (const v of snakeViews.values()) v.setMap(map, space);
}

function applyState(s) {
    const now = performance.now();
    useMap(s.map);
    world.applyState(s, now); // met aussi la topologie à la taille de l'arène
    effects.floorY = world.floorY;
    env.setArena(s.arena.size);
    cameras.setArena(s.arena.size);

    const occupied = new Set();
    for (const sn of s.snakes) for (const c of sn.body) occupied.add(key(c));
    for (const sn of s.snakes) {
        let view = snakeViews.get(sn.id);
        if (!view) {
            view = new SnakeView(scene, s.size, effects, sn.cosmetics ?? DEFAULT_COSMETICS[sn.id], map);
            snakeViews.set(sn.id, view);
        }
        view.isMine = sn.id === myRole;
        view.floorY = world.floorY;
        view.floorY = world.floorY;
        const alive = sn.alive && sn.body.length;
        const run = alive ? world.freeRun(sn.body[0], sn.dir, occupied) : 0;
        view.setState(sn, run, alive && world.foodAhead(sn.body[0], sn.dir));
        // Snake du joueur : place libre dans chaque direction de virage (flèches de guidage).
        if (view.isMine && alive) {
            const right = cross(sn.dir, sn.up);
            const dirs = { right, left: right.map((v) => -v + 0) };
            if (map.kind === "volume") Object.assign(dirs, { up: sn.up, down: sn.up.map((v) => -v + 0) });
            view.setTurnRuns(Object.fromEntries(Object.entries(dirs).map(([t, d]) => [t, { dir: d, run: world.freeRun(sn.body[0], d, occupied) }])));
        }
    }
    god.setState(s);
    if (mode === "game" && s.status !== MATCH_STATUS.ENDED) {
        hud.setVisible(true, { playing: true });
        hud.render(s);
    }
    hud.handleEvents(s.events, myRole, Object.fromEntries(s.snakes.map((sn) => [sn.id, sn])));
    playEvents(s, s.size);
    env.setPhase(s.phase);
    world.setPhase(s.phase);
}

// Effets visuels déclenchés par les événements du serveur.
function playEvents(s, size) {
    const pos = (c) => cellToWorld(c, size);
    const normalOf = (c) => new THREE.Vector3(...map.normalAt(c));
    // Secousse sur la caméra active (Snake ou dieu), si le joueur l'a laissée activée.
    const shake = (amount) => {
        if (!settings.get("screenShake")) return;
        cameras.shake(amount);
    };
    for (const ev of s.events) {
        const p = ev.cells?.[0] && pos(ev.cells[0]);
        const view = ev.snake && snakeViews.get(ev.snake);
        const glow = view?.model.glowColor ?? new THREE.Color(0xe07bff);
        switch (ev.type) {
            case "foodEaten":
                view?.onEat(ev.golden);
                if (ev.snake === myRole && cameras.mode === "snake") cameras.snake.punch(ev.golden ? 0.45 : 0.18);
                // Éclats de la couleur de l'aliment croqué (pomme rouge, ananas jaune...).
                effects.burst(p, foodKind(ev).color, { count: ev.golden ? 70 : 28, speed: ev.golden ? 4 : 2.6 });
                if (!ev.golden) effects.ring(p, foodKind(ev).color, { size: 0.9, life: 0.4, normal: normalOf(ev.cells[0]) });
                if (ev.golden) effects.ring(p, 0xffd34d, { size: 2 });
                break;
            case "damage":
                view?.onHurt();
                effects.explosion(p, { color: 0xff3b5c, hot: 0xffd0d8, scale: 0.7, smoke: false, sparks: 0.8 });
                if (ev.snake === myRole) {
                    shake(0.45);
                    postfx.pulse(0.8);
                } else if (ev.byGod && myRole === "god") {
                    // Le dieu sent que son piège a porté : retour court, moins fort que pour la victime.
                    shake(0.25);
                    postfx.pulse(0.4);
                }
                break;
            case "eliminated":
                effects.explosion(p, { color: glow, scale: 1.8, debris: 30, debrisColor: glow });
                effects.burst(p, glow, { count: 120, speed: 7, life: 1.4, size: 0.35, endColor: 0x2a1040 });
                effects.ring(p, glow, { size: 4, life: 1 });
                shake(0.6);
                postfx.pulse(1);
                break;
            case "healed":
                effects.ring(p, 0x7dff9a, { size: 1.6 });
                effects.burst(p, 0x7dff9a, { count: 40, speed: 2.5, gravity: -2 });
                break;
            case "respawn":
                effects.ring(p, glow, { size: 1.5 });
                effects.burst(p, glow, { count: 30, speed: 2 });
                break;
            case "evolved":
                effects.ring(p, 0xffd34d, { size: 3, life: 0.9 });
                effects.ring(p, glow, { size: 2, life: 0.7, normal: new THREE.Vector3(1, 0, 0) });
                effects.burst(p, 0xffd34d, { count: 90, speed: 4.5, life: 1.1 });
                postfx.pulse(0.8);
                break;
            case "shieldBlocked":
                view?.model.breakShield();
                effects.explosion(p, { color: glow, hot: 0xffffff, scale: 0.8, smoke: false, debris: 12, debrisColor: glow, sparks: 0.6 });
                if (ev.snake === myRole) shake(0.25);
                break;
            case "skillUsed":
                if (ev.skill === "sprint") {
                    effects.ring(p, glow, { size: 1.2, life: 0.35, normal: new THREE.Vector3(...(state?.snakes.find((sn) => sn.id === ev.snake)?.dir ?? [0, 1, 0])) });
                    effects.burst(p, glow, { count: 24, speed: 3, life: 0.4 });
                } else if (ev.skill === "shield") {
                    effects.ring(p, glow, { size: 1, life: 0.3 });
                } else if (ev.skill === "phase") {
                    effects.burst(p, 0xe6f4ff, { count: 30, speed: 1.6, life: 0.6, endColor: glow });
                }
                break;
            case "teleporterPlaced":
                for (const c of ev.cells) {
                    effects.ring(pos(c), 0x6bf0ff, { size: 1.4, normal: normalOf(c) });
                    effects.burst(pos(c), 0x6bf0ff, { count: 24, speed: 2.4, endColor: 0x2a2440 });
                }
                break;
            case "teleported":
                // Entrée et sortie du portail : éclair et anneau des deux côtés.
                for (const c of ev.cells) {
                    effects.flash(pos(c), 0xbff8ff, 2);
                    effects.ring(pos(c), glow, { size: 1.2, life: 0.4, normal: normalOf(c) });
                }
                if (ev.snake === myRole) postfx.pulse(0.6);
                break;
            case "teleporterClosed":
                for (const c of ev.cells) effects.burst(pos(c), 0xc9b8ff, { count: 12, speed: 1.6 });
                break;
            case "trapPlaced":
                effects.ring(p, 0xff3b5c, { size: 1 });
                break;
            case "trapTriggered":
                world.triggerTrap(ev.cells[0]);
                effects.explosion(p, { color: 0xff4a2e, scale: 1, debris: 14, debrisColor: 0x2b2233 });
                break;
            case "wallPlaced":
                for (const c of ev.cells) effects.burst(pos(c), 0xe07bff, { count: 14, speed: 2.4 });
                effects.ring(p, 0xe07bff, { size: 1.6 });
                break;
            case "wallDemolished":
                for (const c of ev.cells) effects.explosion(pos(c), { color: 0xc9b8ff, hot: 0xffffff, scale: 0.7, debris: 10, debrisColor: 0x3a3352, sparks: 0.5 });
                shake(0.2);
                break;
            case "wallRotated":
                for (const c of ev.cells) effects.burst(pos(c), 0xe07bff, { count: 6, speed: 1.4, life: 0.5 });
                break;
            case "wallExpired":
                for (const c of ev.cells) effects.burst(pos(c), 0xc9b8ff, { count: 10, speed: 1.6 });
                break;
            case "zoneCreated":
                effects.ring(p, 0xff2e4d, { size: 2 });
                break;
            case "zoneActive":
                for (const c of ev.cells) {
                    const meteor = ev.kind === "meteor";
                    if (meteor) effects.explosion(pos(c), { color: 0xff7a2e, scale: 0.9, debris: 8, debrisColor: 0x4b3a2c });
                    else effects.burst(pos(c), 0xff2e4d, { count: 12, speed: 2, endColor: 0x401018 });
                }
                if (ev.kind === "meteor") {
                    shake(0.3);
                    postfx.pulse(0.5);
                }
                break;
            case "worldEvent":
                if (ev.event === "goldenFruit" && p) effects.ring(p, 0xffd34d, { size: 3, life: 1 });
                if (ev.event === "foodRain") for (const c of ev.cells) effects.burst(pos(c), 0x9dff6a, { count: 18, speed: 2 });
                break;
            case "phase":
                effects.ring(world.center, 0xffffff, { size: s.arena.size * 0.35, life: 1.2, width: 0.04 });
                postfx.pulse(1.2);
                break;
            case "expansionStart":
                world.startExpansion(ev.fromSize, ev.toSize, ev.inMs);
                for (let i = 0; i < 6; i++) {
                    const dir = new THREE.Vector3().randomDirection().multiplyScalar(ev.fromSize / 2);
                    if (map.kind === "world") dir.y = 0;
                    effects.ring(dir.clone().add(world.center), 0xc9a6ff, { size: 1.2, normal: map.kind === "world" ? undefined : dir.clone(), life: 1 });
                }
                break;
            case "expansionComplete":
                effects.ring(world.center, 0xffffff, { size: ev.toSize * 0.3, life: 1.1, width: 0.06 });
                if (map.kind === "cube") effects.ring(world.center, 0xc9a6ff, { size: ev.toSize * 0.3, life: 1.3, normal: new THREE.Vector3(1, 0, 0) });
                // Gerbe d'énergie sur toute la nouvelle surface.
                for (let i = 0; i < 40; i++) {
                    const h = ev.toSize / 2;
                    const p2 = new THREE.Vector3((Math.random() - 0.5) * 2 * h, (Math.random() - 0.5) * 2 * h, (Math.random() - 0.5) * 2 * h);
                    if (map.kind === "world") p2.y = 0;
                    else p2.setComponent(Math.floor(Math.random() * 3), Math.random() < 0.5 ? -h : h);
                    p2.add(world.center);
                    effects.burst(p2, 0xd9c2ff, { count: 6, speed: 1.5, life: 0.9 });
                }
                for (const c of ev.cells) effects.burst(pos(c), 0xc9b8ff, { count: 12, speed: 2 });
                shake(0.5);
                postfx.pulse(1.4);
                break;
        }
    }
}

// Choisit la caméra et les contrôles selon le rôle et l'état de la partie.
function updateControls() {
    const playing = mode === "game" && state && (state.status === MATCH_STATUS.PLAYING || state.status === MATCH_STATUS.COUNTDOWN);
    const mySnake = state?.snakes.find((s) => s.id === myRole);
    const snakeMode = playing && mySnake?.alive;
    snakeInput.enabled = !!snakeMode;
    god.setEnabled(!!playing && myRole === "god" && state.status === MATCH_STATUS.PLAYING);

    cameras.setMode(mode === "menu" ? "menu" : snakeMode ? "snake" : "god");
}

// ---------- Boucle de rendu ----------
function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    postfx.setSize(w, h, renderer.getPixelRatio());
    effects.setViewportHeight(h * renderer.getPixelRatio());
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
applySettings();
menuStage.setShowcase(false, settings.profile.cosmetics);

let last = performance.now();
function frame() {
    const now = performance.now(); // même horloge que stateTime
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    env.update(now, dt);
    world.setCameraFade(cameras.mode === "snake" ? camera.position : null);
    world.update(now, dt);
    effects.update(dt);

    if (mode === "menu") {
        menuStage.update(dt);
        cameras.update(dt, { showcase: menuStage.showcasePos });
    } else {
        const alpha = state ? Math.min(1, (now - stateTime) / state.tickMs) : 1;
        for (const v of snakeViews.values()) v.update(alpha, now, dt);
        const myView = snakeViews.get(myRole);
        world.setFocus(myView?.cur?.alive ? myView.headPos : null);
        cameras.update(dt, { view: myView });
        // Sprint : le champ de vision s'élargit (ease-out à l'entrée, retour doux).
        const fov = settings.get("fov") + (cameras.mode === "snake" && myView?.sprinting ? 9 : 0);
        if (Math.abs(camera.fov - fov) > 0.05) {
            camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * (fov > camera.fov ? 12 : 5)));
            camera.updateProjectionMatrix();
        }
    }
    audio.updateListener(camera);
    postfx.render(dt);
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- Démarrage ----------
// Raccourci de test : ?play=snake1|snake2|god|demo lance une partie rapide.
const params = new URLSearchParams(location.search);
net.on(S2C.WELCOME, () => {
    const play = params.get("play");
    if (play && !room) {
        params.delete("play");
        quickRole = play === "demo" ? null : play;
        if (MAPS[params.get("map")]) settings.set("matchMap", params.get("map"));
        net.quickPlay(quickRole, settings.get("matchDuration"), settings.get("matchMap"));
    }
});
ui.show("main", { push: false });
// Raccourci de test : ?menu=mode|online|customize|settings ouvre directement un écran.
const menu = params.get("menu");
if (["mode", "online", "customize", "settings"].includes(menu)) ui.show(menu);
net.connect();
