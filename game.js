import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// ---------- Réglages ----------
const COLS = 20;
const ROWS = 20;
const START_TICK = 150; // ms par case au départ
const MIN_TICK = 60;
const TICK_STEP = 8; // accélération par niveau
const POINTS_PER_LEVEL = 5;
const RIVAL_KILL_BONUS = 5; // points gagnés quand l'IA meurt
const RIVAL_RESPAWN_TICKS = 25;

const DIRECTIONS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
};

const KEYS = {
    arrowup: "up", z: "up", w: "up",
    arrowdown: "down", s: "down",
    arrowleft: "left", q: "left", a: "left",
    arrowright: "right", d: "right",
};

// ---------- DOM ----------
const container = document.getElementById("map");
const scoreEl = document.getElementById("score");
const levelEl = document.getElementById("level");
const bestEl = document.getElementById("best");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayText = document.getElementById("overlay-text");
const startBtn = document.getElementById("start-btn");
const pauseBtn = document.getElementById("pause-btn");
const rivalScoreEl = document.getElementById("rival-score");
const rivalHud = document.getElementById("rival-hud");
const difficultyEl = document.getElementById("difficulty");

// ---------- Scène Three.js ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0f0c);
scene.fog = new THREE.Fog(0x0a0f0c, 28, 50);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
const CAMERA_OFFSET = new THREE.Vector3(0, 21, 15);
const cameraTarget = new THREE.Vector3();
camera.position.copy(CAMERA_OFFSET);
camera.lookAt(0, 0, 0);

scene.add(new THREE.HemisphereLight(0xcfffe0, 0x1a2a20, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(-8, 18, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14 });
sun.shadow.bias = -0.0005;
scene.add(sun);

buildBoard();

function buildBoard() {
    // Damier dessiné dans un canvas puis utilisé comme texture
    const size = 64;
    const tex = document.createElement("canvas");
    tex.width = COLS * size;
    tex.height = ROWS * size;
    const g = tex.getContext("2d");
    for (let x = 0; x < COLS; x++) {
        for (let y = 0; y < ROWS; y++) {
            g.fillStyle = (x + y) % 2 ? "#17331f" : "#1c3d26";
            g.fillRect(x * size, y * size, size, size);
        }
    }
    const texture = new THREE.CanvasTexture(tex);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;

    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(COLS, ROWS),
        new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({
        color: 0x00ff66, emissive: 0x00aa44, emissiveIntensity: 0.6, roughness: 0.4,
    });
    const t = 0.4;
    // [largeur, profondeur, x, z]
    const walls = [
        [COLS + t * 2, t, 0, -ROWS / 2 - t / 2],
        [COLS + t * 2, t, 0, ROWS / 2 + t / 2],
        [t, ROWS, -COLS / 2 - t / 2, 0],
        [t, ROWS, COLS / 2 + t / 2, 0],
    ];
    for (const [w, d, x, z] of walls) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, d), wallMat);
        mesh.position.set(x, 0.3, z);
        mesh.castShadow = mesh.receiveShadow = true;
        scene.add(mesh);
    }
}

function cellToWorld(x, y, out = new THREE.Vector3()) {
    return out.set(x - COLS / 2 + 0.5, 0, y - ROWS / 2 + 0.5);
}

function resize() {
    const { clientWidth: w, clientHeight: h } = container;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(container);

// ---------- Modèles (générés avec Blender) ----------
const models = {};

async function loadModels() {
    const loader = new GLTFLoader();
    const names = ["head", "body", "apple"];
    const results = await Promise.allSettled(names.map((n) => loader.loadAsync(`assets/models/${n}.glb`)));
    results.forEach((res, i) => {
        const name = names[i];
        if (res.status === "fulfilled") {
            const root = res.value.scene;
            root.traverse((o) => {
                if (o.isMesh) o.castShadow = o.receiveShadow = true;
            });
            models[name] = root;
        } else {
            console.warn(`Modèle ${name} introuvable, forme simple utilisée`, res.reason);
            models[name] = fallbackModel(name);
        }
    });
}

function fallbackModel(name) {
    const colors = { head: 0x2df273, body: 0x0dbf4d, apple: 0xe6102a };
    const geo = name === "apple"
        ? new THREE.SphereGeometry(0.36, 24, 16).translate(0, 0.38, 0)
        : new THREE.BoxGeometry(0.86, 0.8, 0.86).translate(0, 0.4, 0);
    const names = { head: "SnakeHead", body: "SnakeBody", apple: "Apple" };
    const mat = new THREE.MeshStandardMaterial({ color: colors[name], roughness: 0.35, name: names[name] });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    const group = new THREE.Group();
    group.add(mesh);
    return group;
}


// Copie un modèle en recolorant certains matériaux (le serpent IA est rouge)
function tinted(model, colors) {
    const copy = model.clone();
    copy.traverse((o) => {
        if (!o.isMesh || !colors[o.material.name]) return;
        o.material = o.material.clone();
        o.material.color.set(colors[o.material.name]);
    });
    return copy;
}

// ---------- Serpents ----------
// Chaque segment garde sa case précédente et actuelle pour l'interpolation.
function createSnake(headMesh, bodyModel) {
    const group = new THREE.Group();
    group.add(headMesh);
    scene.add(group);
    return {
        segs: [], // { prev:{x,y}, curr:{x,y}, mesh }
        dir: DIRECTIONS.right,
        queue: [],
        alive: false,
        score: 0,
        headMesh,
        bodyModel,
        pool: [],
        group,
        angle: 0,
        targetAngle: 0,
        pulse: 0,
        spawn: 1, // animation d'apparition 0..1
        respawnTicks: 0,
    };
}

function getBodyMesh(snake, i) {
    if (!snake.pool[i]) {
        snake.pool[i] = snake.bodyModel.clone();
        snake.group.add(snake.pool[i]);
    }
    snake.pool[i].visible = true;
    return snake.pool[i];
}

function placeSnake(snake, head, dir, length = 3) {
    snake.pool.forEach((m) => (m.visible = false));
    snake.headMesh.visible = true;
    snake.segs = [];
    for (let i = 0; i < length; i++) {
        const cell = { x: head.x - dir.x * i, y: head.y - dir.y * i };
        const mesh = i === 0 ? snake.headMesh : getBodyMesh(snake, i - 1);
        snake.segs.push({ prev: { ...cell }, curr: { ...cell }, mesh });
    }
    snake.dir = dir;
    snake.queue = [];
    snake.alive = true;
    snake.angle = snake.targetAngle = Math.atan2(-dir.y, dir.x);
    snake.spawn = 0;
}

function hideSnake(snake) {
    snake.alive = false;
    snake.headMesh.visible = false;
    snake.pool.forEach((m) => (m.visible = false));
    snake.segs = [];
}

function moveSnake(snake, next, eating) {
    const tail = snake.segs[snake.segs.length - 1].curr;
    for (let i = snake.segs.length - 1; i >= 0; i--) {
        const seg = snake.segs[i];
        seg.prev = { ...seg.curr };
        seg.curr = i === 0 ? next : { ...snake.segs[i - 1].curr };
    }
    snake.targetAngle = Math.atan2(-snake.dir.y, snake.dir.x);
    if (eating) {
        // Nouveau segment immobile sur l'ancienne queue : il « sort » au tick suivant
        snake.segs.push({ prev: { ...tail }, curr: { ...tail }, mesh: getBodyMesh(snake, snake.segs.length - 1) });
        snake.pulse = 1;
    }
}

// ---------- Outils de grille ----------
const same = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y;
const inside = (c) => c.x >= 0 && c.y >= 0 && c.x < COLS && c.y < ROWS;
const add = (c, d) => ({ x: c.x + d.x, y: c.y + d.y });
const key = (c) => c.y * COLS + c.x;
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const isReverse = (a, b) => a.x === -b.x && a.y === -b.y;

// Cases occupées après ce tick (la queue avance, sauf si le serpent mange)
function bodyCells(snake, eating) {
    if (!snake.alive) return [];
    return (eating ? snake.segs : snake.segs.slice(0, -1)).map((s) => s.curr);
}

// ---------- IA du serpent rival ----------
const AI_LEVELS = {
    off: {},
    easy: { mistakes: 0.2, smart: false },
    normal: { mistakes: 0, smart: true },
    hard: { mistakes: 0, smart: true, hunter: true },
};

function bfsDistance(start, goal, blocked) {
    if (same(start, goal)) return 0;
    const seen = new Set([key(start)]);
    let frontier = [start];
    for (let dist = 1; frontier.length; dist++) {
        const next = [];
        for (const c of frontier) {
            for (const d of Object.values(DIRECTIONS)) {
                const n = add(c, d);
                if (!inside(n) || blocked.has(key(n)) || seen.has(key(n))) continue;
                if (same(n, goal)) return dist;
                seen.add(key(n));
                next.push(n);
            }
        }
        frontier = next;
    }
    return Infinity;
}

// Nombre de cases accessibles depuis start : évite de s'enfermer
function floodSize(start, blocked, limit) {
    const seen = new Set([key(start)]);
    const stack = [start];
    while (stack.length && seen.size < limit) {
        const c = stack.pop();
        for (const d of Object.values(DIRECTIONS)) {
            const n = add(c, d);
            if (!inside(n) || blocked.has(key(n)) || seen.has(key(n))) continue;
            seen.add(key(n));
            stack.push(n);
        }
    }
    return seen.size;
}

function aiChooseDirection() {
    const level = AI_LEVELS[difficulty];
    const head = rival.segs[0].curr;
    const playerHead = player.segs[0].curr;

    const blocked = new Set();
    player.segs.forEach((s) => blocked.add(key(s.curr)));
    rival.segs.slice(0, -1).forEach((s) => blocked.add(key(s.curr)));

    // Cases où le joueur peut aller au prochain tick : risque de collision frontale
    const danger = new Set(
        Object.values(DIRECTIONS)
            .filter((d) => !isReverse(d, player.dir))
            .map((d) => key(add(playerHead, d)))
    );

    let moves = Object.values(DIRECTIONS)
        .filter((d) => !isReverse(d, rival.dir))
        .map((d) => ({ d, next: add(head, d) }))
        .filter((m) => inside(m.next) && !blocked.has(key(m.next)));
    if (!moves.length) return rival.dir; // piégé

    const calm = moves.filter((m) => !danger.has(key(m.next)));
    if (calm.length) moves = calm;

    if (!level.smart) {
        if (Math.random() < level.mistakes) return moves[Math.floor(Math.random() * moves.length)].d;
        moves.sort((a, b) => manhattan(a.next, food) - manhattan(b.next, food));
        return moves[0].d;
    }

    // Cible : la pomme, ou (difficile) la case devant le joueur pour lui couper la route
    let target = food;
    if (level.hunter && food) {
        const cut = add(add(playerHead, player.dir), player.dir);
        const playerWinsRace = manhattan(playerHead, food) < manhattan(head, food);
        if (playerWinsRace && inside(cut) && !blocked.has(key(cut)) && manhattan(head, cut) <= 7) target = cut;
    }

    const need = rival.segs.length + 2;
    for (const m of moves) {
        const after = new Set(blocked).add(key(head));
        m.space = floodSize(m.next, after, need * 2);
        m.dist = target ? bfsDistance(m.next, target, after) : Infinity;
        m.safe = m.space >= need;
    }

    const safe = moves.filter((m) => m.safe && m.dist < Infinity);
    if (safe.length) {
        safe.sort((a, b) => a.dist - b.dist || b.space - a.space);
        return safe[0].d;
    }
    // Pas de chemin sûr : survivre en gardant le plus d'espace possible
    moves.sort((a, b) => b.space - a.space);
    return moves[0].d;
}

function spawnRival() {
    const playerHead = player.segs[0].curr;
    for (let attempt = 0; attempt < 300; attempt++) {
        const dir = Math.random() < 0.5 ? DIRECTIONS.left : DIRECTIONS.right;
        const head = {
            x: 3 + Math.floor(Math.random() * (COLS - 6)),
            y: 1 + Math.floor(Math.random() * (ROWS - 2)),
        };
        // 3 cases pour le corps + 3 cases libres devant
        const cells = [-2, -1, 0, 1, 2, 3].map((i) => ({ x: head.x + dir.x * i, y: head.y }));
        const free = cells.every((c) => inside(c) && !same(c, food) && !player.segs.some((s) => same(s.curr, c)));
        if (free && manhattan(head, playerHead) >= 7) {
            placeSnake(rival, head, dir);
            return;
        }
    }
    rival.respawnTicks = 5; // plateau trop plein, on réessaie bientôt
}

function killRival() {
    rival.segs.forEach((s) => burst(s.curr, 0xff3344, 5));
    hideSnake(rival);
    rival.respawnTicks = RIVAL_RESPAWN_TICKS;
    player.score += RIVAL_KILL_BONUS;
    player.pulse = 1;
}

// ---------- État du jeu ----------
let player, rival;
let food, tickMs, accumulator;
let state = "loading"; // loading | idle | running | paused | over
let difficulty = loadSetting("snake-difficulty", "normal");
let best = Number(loadSetting("snake-best", 0)) || 0;
let shake = 0;
let appleMesh;
const appleAnim = { spawn: 0 };

function loadSetting(name, fallback) {
    try {
        return localStorage.getItem(name) ?? fallback;
    } catch {
        return fallback;
    }
}

function saveSetting(name, value) {
    try {
        localStorage.setItem(name, value);
    } catch {}
}

function reset() {
    placeSnake(player, { x: 4, y: ROWS - 6 }, DIRECTIONS.right);
    player.score = 0;
    rival.score = 0;
    rival.respawnTicks = 0;
    if (difficulty === "off") hideSnake(rival);
    else placeSnake(rival, { x: COLS - 5, y: 5 }, DIRECTIONS.left);
    tickMs = START_TICK;
    accumulator = 0;
    shake = 0;
    food = null;
    placeFood();
    updateHud();
}

function placeFood() {
    const taken = new Set([...player.segs, ...rival.segs].map((s) => key(s.curr)));
    const free = [];
    for (let x = 0; x < COLS; x++) {
        for (let y = 0; y < ROWS; y++) {
            if (!taken.has(key({ x, y }))) free.push({ x, y });
        }
    }
    food = free[Math.floor(Math.random() * free.length)];
    appleAnim.spawn = 0;
    appleMesh.visible = !!food;
}

function start() {
    reset();
    state = "running";
    hideOverlay();
}

function step() {
    if (player.queue.length) player.dir = player.queue.shift();
    if (rival.alive) rival.dir = aiChooseDirection();

    const pNext = add(player.segs[0].curr, player.dir);
    const rNext = rival.alive ? add(rival.segs[0].curr, rival.dir) : null;
    const pEat = same(pNext, food);
    const rEat = same(rNext, food);

    const pBody = bodyCells(player, pEat);
    const rBody = bodyCells(rival, rEat);
    const hits = (cells, c) => cells.some((b) => same(b, c));

    let cause = null;
    if (!inside(pNext)) cause = "Tu as percuté un mur";
    else if (same(pNext, rNext)) cause = "Collision frontale avec l'IA";
    else if (hits(pBody, pNext)) cause = "Tu t'es mordu la queue";
    else if (hits(rBody, pNext)) cause = "Le serpent IA t'a bloqué";
    if (cause) {
        gameOver(cause);
        return;
    }

    if (rival.alive) {
        const rivalDies = !inside(rNext) || hits(rBody, rNext) || hits(pBody, rNext);
        if (rivalDies) killRival();
        else moveSnake(rival, rNext, rEat);
    } else if (difficulty !== "off" && --rival.respawnTicks <= 0) {
        spawnRival();
    }

    moveSnake(player, pNext, pEat);

    if (pEat || (rEat && rival.alive)) {
        if (pEat) {
            player.score++;
            burst(food, 0xff4d6a);
        } else {
            rival.score++;
            burst(food, 0xffaa33);
        }
        placeFood();
        if (!food) {
            win();
            return;
        }
    }

    const level = Math.floor(player.score / POINTS_PER_LEVEL);
    tickMs = Math.max(MIN_TICK, START_TICK - level * TICK_STEP);
    updateHud();
}

function changeDirection(name) {
    if (state === "idle" || state === "over") {
        start();
        return;
    }
    if (state !== "running") return;

    const dir = DIRECTIONS[name];
    const last = player.queue.length ? player.queue[player.queue.length - 1] : player.dir;
    if (dir === last || isReverse(dir, last)) return;
    if (player.queue.length < 3) player.queue.push(dir);
}

function togglePause() {
    if (state === "running") {
        state = "paused";
        showOverlay("Pause", "Espace pour reprendre", "Reprendre", false);
    } else if (state === "paused") {
        state = "running";
        hideOverlay();
    } else if (state === "idle" || state === "over") {
        start();
    }
}

function finish() {
    state = "over";
    const record = player.score > best;
    if (record) {
        best = player.score;
        saveSetting("snake-best", best);
    }
    updateHud();
    return record;
}

function gameOver(cause) {
    shake = 1;
    const record = finish();
    const duel = difficulty === "off" ? "" : ` · IA : ${rival.score}`;
    const text = record ? `Nouveau record : ${player.score} !` : `Score : ${player.score}${duel}`;
    showOverlay("Game Over", `${cause}. ${text}`, "Rejouer");
}

function win() {
    finish();
    showOverlay("Victoire !", `Grille remplie. Score : ${player.score}`, "Rejouer");
}

function updateHud() {
    scoreEl.textContent = player.score;
    rivalScoreEl.textContent = rival.score;
    rivalHud.hidden = difficulty === "off";
    levelEl.textContent = Math.floor(player.score / POINTS_PER_LEVEL) + 1;
    bestEl.textContent = best;
}

function showOverlay(title, text, button, withDifficulty = true) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    startBtn.textContent = button;
    startBtn.hidden = !button;
    difficultyEl.hidden = !withDifficulty;
    overlay.classList.remove("hidden");
}

function hideOverlay() {
    overlay.classList.add("hidden");
}

function renderDifficulty() {
    difficultyEl.querySelectorAll("button").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.level === difficulty);
    });
}

// ---------- Particules ----------
const particles = [];
const particleGeo = new THREE.SphereGeometry(0.08, 6, 4);
const particleMats = {};

function burst(cell, color, count = 14) {
    particleMats[color] ??= new THREE.MeshBasicMaterial({ color });
    const origin = cellToWorld(cell.x, cell.y);
    for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(particleGeo, particleMats[color]);
        mesh.position.copy(origin).setY(0.4);
        const a = Math.random() * Math.PI * 2;
        const v = new THREE.Vector3(Math.cos(a) * 3, 3 + Math.random() * 3, Math.sin(a) * 3);
        scene.add(mesh);
        particles.push({ mesh, v, life: 0.6 });
    }
}

function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        p.v.y -= 12 * dt;
        p.mesh.position.addScaledVector(p.v, dt);
        p.mesh.scale.setScalar(Math.max(p.life / 0.6, 0.01));
        if (p.life <= 0) {
            scene.remove(p.mesh);
            particles.splice(i, 1);
        }
    }
}

// ---------- Rendu interpolé ----------
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const easeInOut = (t) => t * t * (3 - 2 * t);

function lerpAngle(a, b, t) {
    let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
}

function renderSnake(snake, k, dt, time) {
    if (!snake.alive) return;
    snake.spawn = Math.min(1, snake.spawn + dt * 3);
    const grow = 1 - Math.pow(1 - snake.spawn, 3);

    snake.segs.forEach((seg, i) => {
        cellToWorld(seg.prev.x, seg.prev.y, tmpA);
        cellToWorld(seg.curr.x, seg.curr.y, tmpB);
        seg.mesh.position.lerpVectors(tmpA, tmpB, k);
        // Petite ondulation pour donner vie au corps
        seg.mesh.position.y = i === 0 ? 0 : Math.sin(time * 6 - i * 0.7) * 0.04;
        if (i > 0) {
            // Plus large que la case pour que les segments se touchent, affiné vers la queue
            const taper = (1 - Math.min(i / (snake.segs.length + 6), 0.3)) * grow;
            seg.mesh.scale.set(Math.max(1.18 * taper, 0.01), Math.max(taper, 0.01), Math.max(1.18 * taper, 0.01));
        }
    });

    snake.angle = lerpAngle(snake.angle, snake.targetAngle, 1 - Math.exp(-dt * 18));
    snake.headMesh.rotation.y = snake.angle;
    snake.pulse = Math.max(0, snake.pulse - dt * 4);
    snake.headMesh.scale.setScalar(Math.max((1 + snake.pulse * 0.25) * grow, 0.01));
}

function render(dt, time) {
    if (!player) {
        renderer.render(scene, camera);
        return;
    }

    // t = progression entre deux cases (0..1) : les serpents glissent au lieu de sauter
    const t = state === "running" ? Math.min(accumulator / tickMs, 1) : 1;
    const k = easeInOut(t);
    renderSnake(player, k, dt, time);
    renderSnake(rival, k, dt, time);

    if (food) {
        appleAnim.spawn = Math.min(1, appleAnim.spawn + dt * 3);
        const s = 1 - Math.pow(1 - appleAnim.spawn, 3) * Math.cos(appleAnim.spawn * 6);
        cellToWorld(food.x, food.y, appleMesh.position);
        appleMesh.position.y = 0.1 + Math.sin(time * 3) * 0.08;
        appleMesh.rotation.y = time * 1.2;
        appleMesh.scale.setScalar(Math.max(s, 0.01));
    }

    updateParticles(dt);

    // Caméra : suit doucement la tête du joueur
    tmpA.copy(player.headMesh.position).multiplyScalar(0.25);
    cameraTarget.lerp(tmpA, 1 - Math.exp(-dt * 3));
    camera.position.copy(cameraTarget).add(CAMERA_OFFSET);
    if (shake > 0) {
        shake = Math.max(0, shake - dt * 2.5);
        camera.position.x += (Math.random() - 0.5) * shake * 0.6;
        camera.position.z += (Math.random() - 0.5) * shake * 0.6;
    }
    camera.lookAt(cameraTarget);

    renderer.render(scene, camera);
}

// Boucle à pas fixe pour la logique + rendu à la fréquence de l'écran
let lastTime = performance.now();
function frame(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    if (state === "running") {
        accumulator += dt * 1000;
        while (accumulator >= tickMs && state === "running") {
            accumulator -= tickMs;
            step();
        }
    }

    render(dt, now / 1000);
    requestAnimationFrame(frame);
}

// ---------- Entrées ----------
document.addEventListener("keydown", (e) => {
    const name = KEYS[e.key.toLowerCase()];
    if (name) {
        e.preventDefault();
        changeDirection(name);
    } else if (e.key === " " || e.key === "p" || e.key === "Escape") {
        e.preventDefault();
        togglePause();
    }
});

document.querySelectorAll("[data-dir]").forEach((btn) => {
    btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        changeDirection(btn.dataset.dir);
    });
});
pauseBtn.addEventListener("click", togglePause);
startBtn.addEventListener("click", () => (state === "paused" ? togglePause() : start()));

difficultyEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-level]");
    if (!btn || !player) return;
    btn.blur(); // sinon Espace re-clique le bouton
    difficulty = btn.dataset.level;
    saveSetting("snake-difficulty", difficulty);
    renderDifficulty();
    reset();
});

let touchStart = null;
container.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    touchStart = { x: t.clientX, y: t.clientY };
}, { passive: true });
container.addEventListener("touchend", (e) => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    changeDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
});

// ---------- Démarrage ----------
if (!AI_LEVELS[difficulty]) difficulty = "normal";
bestEl.textContent = best;
renderDifficulty();
showOverlay("Chargement…", "Préparation des modèles 3D", "", false);
resize();
requestAnimationFrame(frame);

await loadModels();
const RIVAL_COLORS = { SnakeHead: 0xff5544, SnakeBody: 0xc41a2a };
player = createSnake(models.head, models.body);
rival = createSnake(tinted(models.head, RIVAL_COLORS), tinted(models.body, RIVAL_COLORS));
appleMesh = models.apple;
scene.add(appleMesh);
reset();
state = "idle";
showOverlay("Snake.IA", "Bats le serpent IA rouge ! Espace ou Démarrer", "Démarrer");
