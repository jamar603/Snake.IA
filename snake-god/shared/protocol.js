// Messages échangés en JSON via WebSocket. Format : { t: TYPE, ...données }

// Client -> serveur
export const C2S = {
    HELLO: "hello", // { token?, name, cosmetics }
    SET_PROFILE: "setProfile", // { name, cosmetics }
    LIST_ROOMS: "listRooms",
    CREATE_ROOM: "createRoom", // { private: bool }
    JOIN_ROOM: "joinRoom", // { code }
    LEAVE_ROOM: "leaveRoom",
    QUICK_PLAY: "quickPlay", // { role | null, duration? } salon privé, IA partout ailleurs, départ immédiat
    SET_DURATION: "setDuration", // { seconds } (hôte) durée de la partie, 0 = illimitée
    CHOOSE_ROLE: "chooseRole", // { role: "snake1" | "snake2" | "god" | null }
    START: "start", // lancer la partie depuis le salon (hôte)
    TURN: "turn", // { turn: "left" | "right" | "up" | "down" } relatif à la tête du Snake
    POWER: "power", // { power, cell?: [x,y,z], axis: "x" | "y" | "z" }
    SKILL: "skill", // { skill: "sprint" | "shield" | "phase" } compétence du Snake
    BACK_TO_LOBBY: "backToLobby",
};

// Serveur -> client
export const S2C = {
    WELCOME: "welcome", // { token, playerId, profile }
    ROOMS: "rooms", // { rooms: [{ code, name, players, status }] }
    ROOM: "room", // { code, name, hostId, status, private, players: [...] } ou { code: null } hors salon
    STATE: "state", // état complet du monde à chaque tick (+ `intel` pour le Snake God uniquement)
    END: "end", // { summary }
    NOTICE: "notice", // { message } (refus d'un pouvoir, erreur...)
};

export const TURNS = ["left", "right", "up", "down"];

export const MATCH_STATUS = {
    LOBBY: "lobby",
    COUNTDOWN: "countdown",
    PLAYING: "playing",
    ENDED: "ended",
};
