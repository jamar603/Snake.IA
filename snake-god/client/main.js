import * as THREE from "three";
import { GRID_SIZE } from "/shared/config.js";
import { DEFAULT_COSMETICS } from "/shared/cosmetics.js";
import { key } from "/shared/grid.js";
import { MATCH_STATUS, S2C } from "/shared/protocol.js";
import { AudioManager } from "./audio/AudioManager.js";
import { GameAudio } from "./audio/GameAudio.js";
import { GodController } from "./input/GodController.js";
import { SnakeInput } from "./input/SnakeInput.js";
import { MultiplayerClient } from "./net/MultiplayerClient.js";
import { GodCamera, MenuCamera, SnakeCamera } from "./render/Cameras.js";
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
const env = new Environment(scene, GRID_SIZE);
env.setArena(MENU_ARENA);
const world = new WorldController(scene, GRID_SIZE);
const effects = new Effects(scene);
const menuStage = new MenuStage(scene, effects, MENU_ARENA);
const snakeCamera = new SnakeCamera(camera);
const godCamera = new GodCamera(camera, canvas, GRID_SIZE);
godCamera.setArena(MENU_ARENA);
const menuCamera = new MenuCamera(camera, MENU_ARENA);

// ---------- Réseau et interface ----------
const net = new MultiplayerClient(() => ({ name: settings.profile.name, cosmetics: settings.profile.cosmetics }));
const ui = new UIManager(settings);
const hud = new Hud();
const god = new GodController({ scene, camera, canvas, size: GRID_SIZE, net });
const snakeInput = new SnakeInput((turn) => net.turn(turn));
const audio = new AudioManager(settings);
const gameAudio = new GameAudio(audio, (c) => cellToWorld(c, GRID_SIZE));
gameAudio.bindInterface();
gameAudio.menu();

let mode = "menu"; // "menu" | "game"
let cameraMode = "menu"; // "menu" | "god" | "snake"
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
    snakeCamera.distance = settings.get("cameraDistance");
    hud.showHelp = settings.get("showHelp");
    resize();
}
settings.addEventListener("change", applySettings);

// ---------- Événements de l'interface ----------
ui.addEventListener("screen", (e) => {
    const custom = e.detail === "customize";
    menuStage.setShowcase(custom, settings.profile.cosmetics);
    menuCamera.mode = custom ? "showcase" : "world";
});
ui.addEventListener("profile", (e) => {
    settings.setProfile(e.detail);
    net.updateProfile();
    menuStage.setShowcase(true, settings.profile.cosmetics);
});
ui.addEventListener("previewTier", (e) => menuStage.setShowcaseTier(e.detail));
ui.addEventListener("quickPlay", (e) => {
    quickRole = e.detail;
    net.quickPlay(e.detail);
});
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
    else if (quickRole !== undefined) net.quickPlay(quickRole);
    else net.start();
});
hud.addEventListener("power", (e) => god.selectPower(e.detail));
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
    snakeCamera.reset();
    state = null;
    env.setPhase(1);
    world.setPhase(1);
    world.setArena(MENU_ARENA);
    env.setArena(MENU_ARENA);
}

function applyState(s) {
    const now = performance.now();
    world.applyState(s, now);
    env.setArena(s.arena.size);
    godCamera.setArena(s.arena.size);

    const occupied = new Set();
    for (const sn of s.snakes) for (const c of sn.body) occupied.add(key(c));
    for (const sn of s.snakes) {
        let view = snakeViews.get(sn.id);
        if (!view) {
            view = new SnakeView(scene, s.size, effects, sn.cosmetics ?? DEFAULT_COSMETICS[sn.id]);
            snakeViews.set(sn.id, view);
        }
        view.isMine = sn.id === myRole;
        view.floorY = world.floorY;
        const alive = sn.alive && sn.body.length;
        const run = alive ? world.freeRun(sn.body[0], sn.dir, occupied) : 0;
        view.setState(sn, run, alive && world.foodAhead(sn.body[0], sn.dir));
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
    const shake = (amount) => settings.get("screenShake") && snakeCamera.shake(amount);
    for (const ev of s.events) {
        const p = ev.cells?.[0] && pos(ev.cells[0]);
        const view = ev.snake && snakeViews.get(ev.snake);
        const glow = view?.model.glowColor ?? new THREE.Color(0xb36bff);
        switch (ev.type) {
            case "foodEaten":
                view?.onEat(ev.golden);
                effects.burst(p, ev.golden ? 0xffd34d : 0x9dff6a, { count: ev.golden ? 70 : 28, speed: ev.golden ? 4 : 2.6 });
                if (ev.golden) effects.ring(p, 0xffd34d, { size: 2 });
                break;
            case "damage":
                view?.onHurt();
                effects.burst(p, 0xff3b5c, { count: 60, speed: 5 });
                effects.ring(p, 0xff3b5c, { size: 1.2, normal: new THREE.Vector3().randomDirection() });
                if (ev.snake === myRole) {
                    shake(0.45);
                    postfx.pulse(0.8);
                }
                break;
            case "eliminated":
                effects.burst(p, glow, { count: 180, speed: 7, life: 1.4, size: 0.35 });
                effects.burst(p, 0xffffff, { count: 40, speed: 3, life: 0.8 });
                effects.ring(p, glow, { size: 4, life: 1 });
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
            case "trapPlaced":
                effects.ring(p, 0xff3b5c, { size: 1 });
                break;
            case "trapTriggered":
                effects.burst(p, 0xff8a3b, { count: 50, speed: 4 });
                break;
            case "wallPlaced":
                for (const c of ev.cells) effects.burst(pos(c), 0xc47dff, { count: 14, speed: 2.4 });
                effects.ring(p, 0xc47dff, { size: 1.6 });
                break;
            case "wallDemolished":
                for (const c of ev.cells) effects.burst(pos(c), 0x9fc0ff, { count: 26, speed: 3.5, gravity: 4, life: 1 });
                break;
            case "wallRotated":
                for (const c of ev.cells) effects.burst(pos(c), 0xff6bf0, { count: 6, speed: 1.4, life: 0.5 });
                break;
            case "wallExpired":
                for (const c of ev.cells) effects.burst(pos(c), 0x8fa2ff, { count: 10, speed: 1.6 });
                break;
            case "zoneCreated":
                effects.ring(p, 0xff2e4d, { size: 2 });
                break;
            case "zoneActive":
                for (const c of ev.cells) {
                    const meteor = ev.kind === "meteor";
                    effects.burst(pos(c), meteor ? 0xff7a2e : 0xff2e4d, { count: meteor ? 40 : 12, speed: meteor ? 5 : 2, gravity: meteor ? 3 : 0 });
                    if (meteor) effects.ring(pos(c), 0xffb050, { size: 1.4 });
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
                effects.ring(new THREE.Vector3(), 0xffffff, { size: s.arena.size, life: 1.4, width: 0.04 });
                postfx.pulse(1.2);
                break;
            case "expansionStart":
                world.startExpansion(ev.fromSize, ev.toSize, ev.inMs);
                for (let i = 0; i < 6; i++) {
                    const dir = new THREE.Vector3().randomDirection().multiplyScalar(ev.fromSize / 2);
                    effects.ring(dir, 0xc9a6ff, { size: 1.2, normal: dir.clone(), life: 1 });
                }
                break;
            case "expansionComplete":
                effects.ring(new THREE.Vector3(), 0xffffff, { size: ev.toSize, life: 1.2, width: 0.06 });
                effects.ring(new THREE.Vector3(), 0xc9a6ff, { size: ev.toSize, life: 1.4, normal: new THREE.Vector3(1, 0, 0) });
                // Gerbe d'énergie sur toute la nouvelle surface.
                for (let i = 0; i < 40; i++) {
                    const h = ev.toSize / 2;
                    const p2 = new THREE.Vector3((Math.random() - 0.5) * 2 * h, (Math.random() - 0.5) * 2 * h, (Math.random() - 0.5) * 2 * h);
                    p2.setComponent(Math.floor(Math.random() * 3), Math.random() < 0.5 ? -h : h);
                    effects.burst(p2, 0xd9c2ff, { count: 6, speed: 1.5, life: 0.9 });
                }
                for (const c of ev.cells) effects.burst(pos(c), 0x9fc0ff, { count: 12, speed: 2 });
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

    const next = mode === "menu" ? "menu" : snakeMode ? "snake" : "god";
    if (next === cameraMode) return;
    const previous = cameraMode;
    cameraMode = next;
    if (next === "god") godCamera.activate();
    else godCamera.deactivate();
    if (next === "snake") {
        snakeCamera.reset();
        if (previous === "menu") snakeCamera.startIntro();
    }
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
    world.setCameraFade(cameraMode === "snake" ? camera.position : null);
    world.update(now, dt);
    effects.update(dt);

    if (mode === "menu") {
        menuStage.update(dt);
        menuCamera.update(dt, menuStage.showcasePos);
    } else {
        const alpha = state ? Math.min(1, (now - stateTime) / state.tickMs) : 1;
        for (const v of snakeViews.values()) v.update(alpha, now, dt);
        const myView = snakeViews.get(myRole);
        if (cameraMode === "snake" && myView) snakeCamera.update(myView.headPos, myView.headQuat, dt);
        else godCamera.update(dt);
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
        net.quickPlay(quickRole);
    }
});
ui.show("main", { push: false });
net.connect();
