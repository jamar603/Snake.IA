// Réglages partagés entre le serveur et le client.
// Toute la logique de jeu vit sur le serveur ; le client lit ces valeurs
// uniquement pour l'affichage (coûts, couleurs, taille du cube...).

// Trois maps. CUBE (mode principal) : les Snakes rampent sur les 6 faces d'un cube qui grandit
// (7 -> 13 cases de côté). CUBE 3D : la version classique, dans le volume du cube.
// WORLD : grand terrain plat 3D, plus simple à prendre en main.
// `space` : espace de coordonnées fixe (le monde grandit sans décaler les coordonnées).
export const MAPS = {
    cube: {
        label: "Cube",
        description: "Rampe sur les 6 faces d'un cube. Le passage d'une face à l'autre est automatique.",
        sizes: [7, 9, 11, 13],
        space: 15, // 13 + la couche de surface de chaque côté
        foodBySize: { 7: 7, 9: 9, 11: 11, 13: 13 },
        pillarsBySize: { 7: 4, 9: 3, 11: 3, 13: 3 },
        snakeHp: 2,
        maxRotatingWalls: 4,
    },
    // Version classique : le Snake se déplace DANS le volume du cube (gauche, droite, haut, bas).
    volume: {
        label: "Cube 3D",
        description: "La version classique : vole dans tout le volume du cube, avec haut et bas en plus.",
        sizes: [7, 9, 11, 13],
        space: 13,
        foodBySize: { 7: 6, 9: 7, 11: 8, 13: 10 },
        pillarsBySize: { 7: 3, 9: 2, 11: 3, 13: 3 },
        snakeHp: 2,
        maxRotatingWalls: 4,
        aiSweepDanger: [40, 3], // prudence des Snakes IA face aux lames (imminente, à venir)
    },
    world: {
        label: "World",
        description: "Grand terrain plat en 3D, avec reliefs et obstacles. Idéal pour débuter.",
        sizes: [17, 21, 25, 29],
        space: 29,
        foodBySize: { 17: 8, 21: 10, 25: 12, 29: 14 },
        pillarsBySize: { 17: 10, 21: 6, 25: 6, 29: 6 },
        snakeHp: 3, // mode accessible : un PV de plus
        maxRotatingWalls: 3,
    },
};
export const MAP_IDS = Object.keys(MAPS);
export const DEFAULT_MAP = "cube";

// Croissance du monde (les deux maps) : une expansion se déclenche dès qu'UN critère est
// atteint pour l'étape suivante, mais jamais avant `minProgress` (montée progressive).
export const WORLD = {
    minProgress: [0.1, 0.3, 0.52], // fraction du temps de partie
    timeThresholds: [0.22, 0.45, 0.7],
    lengthThresholds: [16, 36, 64], // longueur cumulée des Snakes vivants
    densityThreshold: 0.15, // (murs + corps) / cellules jouables
    warnMs: 2800, // annonce -> fin de la construction
};
export const GRID_SIZE = MAPS.cube.space; // espace du cube (menus, valeur par défaut)

// Durée d'une partie (choisie dans le salon ou en solo). 0 = illimitée : la partie dure
// jusqu'à ce que le dieu élimine les Snakes, ou qu'un Snake atteigne UNLIMITED.winLength.
export const MATCH_SECONDS = 90;
export const MATCH_DURATIONS = [90, 120, 150, 180, 0];
export const UNLIMITED = {
    pacingSeconds: 180, // phases et expansions comme une partie de 3 min, puis Chaos jusqu'au bout
    winLength: 150, // longueur qui fait gagner les Snakes
};
export const durationLabel = (s) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "Illimitée");
export const COUNTDOWN_SECONDS = 3;

export const SNAKE = {
    maxHp: 2,
    startLength: 3,
    invulnerableMs: 1800, // après un coup : pas de nouveaux dégâts
    maxQueuedTurns: 2,
    foodPoints: 10,
    lengthPoints: 5, // par segment à la fin de la partie
    survivalBonus: 100,
};

// Compétences des Snakes : une touche chacune, puis un temps de recharge.
export const SKILLS = {
    sprint: {
        label: "Sprint",
        keys: [" ", "1"],
        keyLabel: "Espace",
        cooldownMs: 12000,
        durationMs: 1500,
        description: "Avance de 2 cases par tick pendant 1,5 s.",
    },
    shield: {
        label: "Bouclier",
        keys: ["e", "2"],
        keyLabel: "E",
        cooldownMs: 20000,
        durationMs: 3000,
        description: "Bloque le prochain dégât pendant 3 s.",
    },
    phase: {
        label: "Phase",
        keys: ["f", "3"],
        keyLabel: "F",
        cooldownMs: 18000,
        durationMs: 1000,
        description: "Traverse murs, pièges et corps pendant 1 s (pas les bords).",
    },
};
export const SKILL_IDS = Object.keys(SKILLS);

export const FOOD_COUNT = 6;

export const GOD = {
    maxEnergy: 100,
    startEnergy: 40,
    damagePoints: 25,
    eliminationPoints: 100,
    victoryBonus: 200,
};

// Pouvoirs du Snake God. `phase` = phase à partir de laquelle il est débloqué.
export const POWERS = {
    trap: {
        label: "Piège",
        key: "1",
        cost: 15,
        cooldownMs: 1000,
        phase: 1,
        maxActive: 12,
        description: "Une cellule piégée : -1 PV au Snake qui passe dessus.",
    },
    wall: {
        label: "Mur",
        key: "2",
        cost: 20,
        cooldownMs: 2500,
        phase: 1,
        maxActive: 9,
        lifetimeMs: 20000,
        length: 3,
        description: "Un mur de 3 cellules qui dure 20 s.",
    },
    rotatingWall: {
        label: "Mur rotatif",
        key: "3",
        cost: 45,
        cooldownMs: 8000,
        phase: 2,
        maxActive: 3,
        arm: 2, // cellules de chaque côté du pivot
        rotateEveryMs: 2200,
        description: "Une lame de 5 cases couchée sur la face, qui pivote de 90° et écrase.",
    },
    demolish: {
        label: "Démolition",
        key: "4",
        cost: 10,
        cooldownMs: 1500,
        phase: 1,
        description: "Détruit un mur ou un pilier : ouvre un passage.",
    },
    triggerEvent: {
        label: "Déclencher",
        key: "5",
        cost: 25,
        cooldownMs: 10000,
        phase: 2,
        needsCell: false,
        description: "Déclenche tout de suite le prochain événement du monde (que toi seul connais).",
    },
    dangerZone: {
        label: "Zone dangereuse",
        key: "6",
        cost: 30,
        cooldownMs: 6000,
        phase: 3,
        maxActive: 2,
        radius: 1, // 3 × 3 cellules
        warnMs: 1000,
        durationMs: 6000,
        description: "Une dalle de 3 × 3 qui brûle (-1 PV) après un court avertissement.",
    },
    teleporter: {
        label: "Téléporteur",
        key: "7",
        cost: 25,
        cooldownMs: 6000,
        phase: 2,
        maxActive: 2,
        lifetimeMs: 18000,
        description: "Un portail sur la case visée, relié à une sortie au hasard (loin des Snakes, face à une voie libre).",
    },
    expand: {
        label: "Expansion",
        key: "8",
        cost: 40,
        cooldownMs: 20000,
        phase: 2,
        needsCell: false,
        description: "Agrandit le monde tout de suite (nouvelles zones, jamais sur un Snake).",
    },
};

export const POWER_IDS = Object.keys(POWERS);

// Montée en tension : la partie accélère et le dieu se recharge plus vite.
// `from` = fraction du temps écoulé à laquelle la phase commence.
export const PHASES = [
    { id: 1, name: "Éveil", from: 0, tickMs: 240, energyPerSec: 6 },
    { id: 2, name: "Colère", from: 0.25, tickMs: 215, energyPerSec: 8 },
    { id: 3, name: "Tempête", from: 0.5, tickMs: 190, energyPerSec: 10 },
    { id: 4, name: "Chaos", from: 0.8, tickMs: 165, energyPerSec: 14 },
];

// Événements du monde. Le Snake God les voit à l'avance (information exclusive).
export const WORLD_EVENTS = {
    intervalMs: [16000, 24000],
    goldenFruit: { label: "Fruit doré", points: 50, growth: 3, heal: 1, lifetimeMs: 15000 },
    foodRain: { label: "Pluie de nourriture", count: 5 },
    meteorShower: { label: "Pluie de météores", count: 10, warnMs: 1500, durationMs: 700 },
};
export const UPCOMING_FOOD_PREVIEW = 3; // prochaines apparitions de nourriture visibles par le dieu

export const STARTING_PILLARS = 5; // petits obstacles fixes en début de partie

export const ROLES = ["snake1", "snake2", "god"];
export const SNAKE_ROLES = ["snake1", "snake2"];

export const ROLE_INFO = {
    snake1: { label: "Snake 1", color: 0x2ee6ff, css: "#2ee6ff" },
    snake2: { label: "Snake 2", color: 0xffb02e, css: "#ffb02e" },
    god: { label: "Snake God", color: 0xb36bff, css: "#b36bff" },
};

export const RECONNECT_GRACE_MS = 30000;

// IA qui remplace les joueurs absents. Les Snakes IA font des erreurs
// comme des humains : sinon ils ne meurent jamais.
export const AI = {
    snakeMistakeChance: 0.008, // chance par tick de ne pas réagir (continue tout droit)
    godThinkMs: [700, 1500], // délai entre deux décisions du dieu
    godFirstActionMs: 6000, // laisse aux Snakes le temps de prendre leurs marques
    godPhaseTempo: { 1: 1.6, 2: 1.2, 3: 1, 4: 0.85 }, // le dieu IA accélère avec les phases
};
