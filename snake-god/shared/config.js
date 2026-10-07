// Réglages partagés entre le serveur et le client.
// Toute la logique de jeu vit sur le serveur ; le client lit ces valeurs
// uniquement pour l'affichage (coûts, couleurs, taille du cube...).

export const GRID_SIZE = 9; // le cube fait GRID_SIZE³ cellules

export const MATCH_SECONDS = 180;
export const COUNTDOWN_SECONDS = 3;

export const SNAKE = {
    maxHp: 3,
    startLength: 3,
    invulnerableMs: 1800, // après un coup : pas de nouveaux dégâts
    maxQueuedTurns: 2,
    foodPoints: 10,
    lengthPoints: 5, // par segment à la fin de la partie
    survivalBonus: 100,
};

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
        maxActive: 8,
        description: "Une cellule piégée : -1 PV au Snake qui passe dessus.",
    },
    wall: {
        label: "Mur",
        key: "2",
        cost: 20,
        cooldownMs: 2500,
        phase: 1,
        maxActive: 6,
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
        description: "Une barre de 5 cellules qui pivote de 90° autour d'un axe.",
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
        cost: 35,
        cooldownMs: 6000,
        phase: 3,
        maxActive: 2,
        radius: 1, // 3 × 3 cellules
        warnMs: 1200,
        durationMs: 6000,
        description: "Une dalle de 3 × 3 qui brûle (-1 PV) après un court avertissement.",
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
    goldenFruit: { label: "Fruit doré", points: 50, growth: 3, lifetimeMs: 15000 },
    foodRain: { label: "Pluie de nourriture", count: 5 },
    meteorShower: { label: "Pluie de météores", count: 6, warnMs: 1500, durationMs: 700 },
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
