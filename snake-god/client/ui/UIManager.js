import { MATCH_DURATIONS, ROLE_INFO, durationLabel } from "/shared/config.js";
import { ACCESSORIES, DEFAULT_COSMETICS, EVOLUTIONS, SKINS, TRAILS } from "/shared/cosmetics.js";
import { AUDIO_CATEGORIES } from "../audio/AudioManager.js";
import { snakeSkinTextures } from "../render/textures.js";
import { QUALITY } from "../settings.js";
import { ACCESSORY_ICONS, MODE_ICONS } from "./icons.js";
import { escapeHtml, hexColor } from "./util.js";

const $ = (id) => document.getElementById(id);

const SCREENS = ["main", "mode", "online", "room", "customize", "settings", "end"];
const MODES = ["solo", "online", "demo"];
const LAST_MODE_KEY = "snakegod.lastMode";

const EVO_DESC = {
    1: "Éclosion : corps lisse, yeux lumineux.",
    2: "Chasseur (7+) : nageoires dorsales.",
    3: "Prédateur (13+) : pointes d'énergie et veines pulsantes.",
    4: "Légende (21+) : aura, halo et traînée intense.",
};

const CUSTOM_TABS = {
    skin: { table: SKINS, hint: "L'espèce change les couleurs, le motif des écailles et la lueur." },
    accessory: { table: ACCESSORIES, hint: "Un accessoire posé sur la tête, visible par tous les joueurs." },
    trail: { table: TRAILS, hint: "Les particules laissées derrière la queue (plus denses en évoluant)." },
};

// Couleurs des particules de chaque traînée (null = couleur de lueur de l'espèce).
const TRAIL_COLORS = { sparks: null, embers: "#ff9a3d", stardust: "#fff6c8", none: null };

// Stockage du navigateur : peut être indisponible (navigation privée, aperçu).
const store = {
    get(k) {
        try {
            return localStorage.getItem(k);
        } catch {
            return null;
        }
    },
    set(k, v) {
        try {
            localStorage.setItem(k, v);
        } catch {
            /* rien : simple confort */
        }
    },
};

// Menus et navigation : menu principal, modes, salons, rôles, personnalisation,
// paramètres et boutons de l'écran de fin. Envoie des événements à main.js.
export class UIManager extends EventTarget {
    constructor(settings) {
        super();
        this.settings = settings;
        this.screen = "main";
        this.history = [];
        this.customTab = "skin";
        this.previewTier = 1;
        this.mode = MODES.includes(store.get(LAST_MODE_KEY)) ? store.get(LAST_MODE_KEY) : "solo";
        this.isPrivate = false;
        this.#bindNavigation();
        this.#bindModes();
        this.#bindOnline();
        this.#bindRoom();
        this.#bindCustomize();
        this.#bindSettings();
        this.#bindEnd();
        this.#bindDurations();
        this.renderProfile();
    }

    emit(type, detail) {
        this.dispatchEvent(new CustomEvent(type, { detail }));
    }

    // ---------- Navigation ----------
    show(name, { push = true } = {}) {
        if (push && this.screen !== name && SCREENS.includes(this.screen)) this.history.push(this.screen);
        this.screen = name;
        for (const s of SCREENS) $(`screen-${s}`).classList.toggle("hidden", s !== name);
        if (name === "online") this.emit("refreshRooms");
        if (name === "mode") this.#selectMode(this.mode, { instant: true });
        if (name === "customize") this.#renderCustomize();
        if (name === "settings") this.#renderSettings();
        // Les salons publics se mettent à jour seuls tant que l'écran est ouvert.
        clearInterval(this.roomsTimer);
        if (name === "online") this.roomsTimer = setInterval(() => this.emit("refreshRooms"), 5000);
        this.emit("screen", name);
    }

    back() {
        const prev = this.history.pop() ?? "main";
        this.show(prev, { push: false });
    }

    hideAll() {
        for (const s of SCREENS) $(`screen-${s}`).classList.add("hidden");
        clearInterval(this.roomsTimer);
        this.screen = "game";
        this.history = [];
        this.emit("screen", "game");
    }

    #bindNavigation() {
        for (const b of document.querySelectorAll("[data-go]")) b.addEventListener("click", () => this.show(b.dataset.go));
        for (const b of document.querySelectorAll("[data-back]")) b.addEventListener("click", () => this.back());
        // Échap : retour à l'écran précédent (les écrans de jeu et de fin gèrent Échap eux-mêmes).
        window.addEventListener("keydown", (e) => {
            if (e.key !== "Escape" || e.target instanceof HTMLInputElement) return;
            if (["mode", "online", "customize", "settings"].includes(this.screen)) {
                e.preventDefault();
                this.back();
            }
        });
    }

    // ---------- Mode de jeu ----------
    // Liste à gauche, détail à droite : choisir un mode ne lance rien, le bouton du détail lance.
    #bindModes() {
        for (const icon of document.querySelectorAll("[data-icon]")) icon.innerHTML = MODE_ICONS[icon.dataset.icon] ?? "";
        for (const tab of document.querySelectorAll("[data-mode-tab]")) {
            tab.addEventListener("click", () => this.#selectMode(tab.dataset.modeTab));
        }
        for (const b of document.querySelectorAll("[data-solo-role]")) {
            b.addEventListener("click", () => this.emit("quickPlay", b.dataset.soloRole));
        }
        document.querySelector("[data-demo-start]").addEventListener("click", () => this.emit("quickPlay", null));
        // Raccourcis 1, 2, 3 : changement immédiat, sans animation (action clavier fréquente).
        window.addEventListener("keydown", (e) => {
            if (this.screen !== "mode" || e.target instanceof HTMLInputElement) return;
            const i = ["1", "2", "3"].indexOf(e.key);
            if (i < 0) return;
            e.preventDefault();
            this.#selectMode(MODES[i], { instant: true });
        });
    }

    #selectMode(mode, { instant = false } = {}) {
        this.mode = mode;
        store.set(LAST_MODE_KEY, mode);
        for (const tab of document.querySelectorAll("[data-mode-tab]")) {
            const on = tab.dataset.modeTab === mode;
            tab.classList.toggle("active", on);
            tab.setAttribute("aria-selected", on);
        }
        for (const pane of document.querySelectorAll("[data-pane]")) {
            const on = pane.dataset.pane === mode;
            pane.classList.toggle("active", on);
            pane.classList.toggle("instant", instant);
        }
    }

    setConnection(connected) {
        const el = $("conn-status");
        el.textContent = connected ? "Connecté au serveur" : "Connexion perdue… reconnexion";
        el.className = `conn-status ${connected ? "ok" : "bad"}`;
    }

    renderProfile() {
        const p = this.settings.profile;
        const skin = SKINS[p.cosmetics.skin];
        $("profile-chip").innerHTML = `<span class="swatch" style="background:${hexColor(skin.primary)};color:${hexColor(skin.glow)}"></span>
            <span><strong>${escapeHtml(p.name || "Joueur")}</strong> · ${skin.name}</span>`;
    }

    // ---------- Durée de la partie ----------
    // Solo et démonstration : préférence du joueur (gardée). Salon : choisie par l'hôte, vue par tous.
    #bindDurations() {
        for (const seg of document.querySelectorAll("[data-duration-seg]")) {
            seg.innerHTML = MATCH_DURATIONS.map((s) => `<button data-seconds="${s}">${durationLabel(s)}</button>`).join("");
            for (const b of seg.querySelectorAll("button")) {
                b.addEventListener("click", () => {
                    const s = Number(b.dataset.seconds);
                    if (seg.dataset.durationSeg === "room") this.emit("setDuration", s);
                    else {
                        this.settings.set("matchDuration", s);
                        this.#markPersonalDurations();
                    }
                });
            }
        }
        this.#markPersonalDurations();
    }

    #markPersonalDurations() {
        for (const seg of document.querySelectorAll('[data-duration-seg="solo"], [data-duration-seg="demo"]')) {
            this.#markDuration(seg, this.settings.get("matchDuration"));
        }
    }

    #markDuration(seg, seconds, { locked = false } = {}) {
        for (const b of seg.querySelectorAll("button")) {
            b.classList.toggle("active", Number(b.dataset.seconds) === seconds);
            b.disabled = locked;
        }
    }

    // ---------- Multijoueur ----------
    #bindOnline() {
        const input = $("join-code");
        const join = () => {
            const code = input.value.trim().toUpperCase();
            if (code.length === 4) this.emit("joinRoom", code);
        };
        // Lettres seulement, en majuscules ; le bouton s'active à 4 lettres.
        input.addEventListener("input", () => {
            input.value = input.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
            $("join-btn").disabled = input.value.length !== 4;
        });
        input.addEventListener("keydown", (e) => e.key === "Enter" && join());
        $("join-btn").addEventListener("click", join);
        $("refresh-rooms").addEventListener("click", () => this.emit("refreshRooms"));

        for (const b of document.querySelectorAll("[data-private]")) {
            b.addEventListener("click", () => {
                this.isPrivate = b.dataset.private === "1";
                for (const o of document.querySelectorAll("[data-private]")) o.classList.toggle("active", o === b);
                $("visibility-help").textContent = this.isPrivate
                    ? "Caché de la liste : on rejoint seulement avec le code."
                    : "Visible dans la liste des salons publics.";
            });
        }
        $("create-room-btn").addEventListener("click", () => this.emit("createRoom", this.isPrivate));
    }

    renderRooms(rooms) {
        const list = $("room-list");
        $("room-count").textContent = rooms.length;
        if (!rooms.length) {
            list.innerHTML = `<li class="empty">Aucun salon public pour l'instant.<br><span class="muted">Crée le tien à droite, ou rejoins un ami avec son code.</span></li>`;
            return;
        }
        const status = { lobby: "En attente", countdown: "Démarrage", playing: "En partie", ended: "Terminée" };
        list.innerHTML = rooms
            .map((r) => {
                const seats = ["snake1", "snake2", "god"]
                    .map((role) => `<i class="seat ${r.roles?.includes(role) ? "taken" : ""}" style="--c:${ROLE_INFO[role].css}" title="${ROLE_INFO[role].label}"></i>`)
                    .join("");
                const open = r.status === "lobby" || r.status === "ended";
                return `<li>
                    <div class="room-main"><strong>${escapeHtml(r.name)}</strong>
                        <span class="room-meta"><span class="code-chip">${r.code}</span><span class="seats">${seats}</span>${r.players} joueur(s)</span></div>
                    <span class="status-badge ${r.status}">${status[r.status] ?? r.status}</span>
                    <button class="ghost-btn small" data-join="${r.code}">${open ? "Rejoindre" : "Regarder"}</button></li>`;
            })
            .join("");
        for (const b of list.querySelectorAll("[data-join]")) b.addEventListener("click", () => this.emit("joinRoom", b.dataset.join));
    }

    // ---------- Salon ----------
    #bindRoom() {
        for (const card of document.querySelectorAll(".role-card")) {
            card.addEventListener("click", () => this.emit("chooseRole", card.dataset.role));
        }
        $("spectate-btn").addEventListener("click", () => this.emit("chooseRole", null));
        $("start-btn").addEventListener("click", () => this.emit("start"));
        $("leave-room-btn").addEventListener("click", () => this.emit("leaveRoom"));
        $("room-customize-btn").addEventListener("click", () => this.show("customize"));
        $("copy-code").addEventListener("click", () => {
            navigator.clipboard?.writeText($("room-code").textContent).catch(() => {});
            $("copy-code").textContent = "Copié !";
            setTimeout(() => ($("copy-code").textContent = "Copier le code"), 1200);
        });
    }

    renderRoom(room, myId) {
        $("room-title").textContent = room.name;
        $("room-code").textContent = room.code;
        const owners = {};
        for (const p of room.players) if (p.role) owners[p.role] = p;
        for (const card of document.querySelectorAll(".role-card")) {
            const role = card.dataset.role;
            const owner = owners[role];
            const mine = owner?.id === myId;
            card.classList.toggle("taken", !!owner);
            card.classList.toggle("mine", mine);
            // Image du rôle : le Snake avec l'espèce de son joueur (ou celle par défaut), le dieu animé.
            const skinId = owner?.cosmetics?.skin ?? DEFAULT_COSMETICS[role]?.skin;
            const art = role === "god" ? "god" : skinId;
            const artEl = card.querySelector(".role-art");
            if (artEl.dataset.art !== art) {
                artEl.dataset.art = art;
                artEl.innerHTML = role === "god" ? `<span class="god-art"><i></i><i></i><b></b></span>` : this.#skinArt(skinId);
            }
            card.querySelector(".role-status").textContent = mine ? "Toi" : owner ? "Pris" : "Libre · clique pour jouer";
            card.querySelector(".role-status").className = `role-status ${mine ? "is-mine" : owner ? "is-taken" : "is-free"}`;
            const ownerEl = card.querySelector(".role-owner");
            ownerEl.textContent = owner ? `${owner.name}${owner.connected ? "" : " (déconnecté)"}` : "IA";
            ownerEl.classList.toggle("ai", !owner);
            if (role !== "god") {
                const skin = SKINS[owner?.cosmetics?.skin];
                card.querySelector(".role-skin").textContent = owner
                    ? `${skin?.name ?? ""} · ${ACCESSORIES[owner.cosmetics.accessory]?.name ?? ""}`
                    : "Contrôlé par l'IA";
                if (skin) card.style.setProperty("--c", hexColor(skin.primary));
                else card.style.removeProperty("--c");
            }
        }
        $("player-list").innerHTML = room.players
            .map(
                (p) => `<li class="${p.connected ? "" : "offline"}"><span>${escapeHtml(p.name)}${p.id === myId ? " (toi)" : ""}${p.id === room.hostId ? ' <span class="host">★ hôte</span>' : ""}</span>
                <span class="muted">${p.role ? ROLE_INFO[p.role].label : "spectateur"}</span></li>`
            )
            .join("");
        const isHost = room.hostId === myId;
        const me = room.players.find((p) => p.id === myId);
        this.#markDuration(document.querySelector('[data-duration-seg="room"]'), room.duration, { locked: !isHost });
        $("duration-host-only").classList.toggle("hidden", isHost);
        $("start-btn").classList.toggle("hidden", !isHost);
        $("room-wait").classList.toggle("hidden", isHost);
        // Étapes : la première est faite dès qu'on a un rôle ; les deux autres reviennent à l'hôte.
        const steps = document.querySelectorAll(".room-steps li");
        steps[0].classList.toggle("done", !!me?.role);
        steps[0].textContent = me?.role ? `Tu joues ${ROLE_INFO[me.role].label}` : "Clique sur une carte pour prendre un rôle";
        steps[1].classList.toggle("you", isHost);
        steps[2].classList.toggle("you", isHost);
    }

    // ---------- Personnalisation ----------
    #bindCustomize() {
        $("name-input").addEventListener("change", () => {
            this.emit("profile", { name: $("name-input").value.trim() });
            this.renderProfile();
        });
        for (const t of document.querySelectorAll(".tab")) {
            t.querySelector("[data-count]").textContent = Object.keys(CUSTOM_TABS[t.dataset.tab].table).length;
            t.addEventListener("click", () => {
                this.customTab = t.dataset.tab;
                this.#renderCustomize();
            });
        }
        const evo = $("evo-buttons");
        evo.innerHTML = EVOLUTIONS.map(
            (e) => `<button data-tier="${e.tier}"><b>${["I", "II", "III", "IV"][e.tier - 1]}</b><small>${e.name}</small></button>`
        ).join("");
        for (const b of evo.querySelectorAll("button")) {
            b.addEventListener("click", () => {
                this.previewTier = Number(b.dataset.tier);
                this.emit("previewTier", this.previewTier);
                this.#renderCustomize();
            });
        }
    }

    // Corps de Snake avec la vraie peau du jeu (texture du modèle 3D), qui défile.
    #skinArt(skinId) {
        const skin = SKINS[skinId] ?? SKINS.neon;
        this.skinArtCache ??= {};
        if (!this.skinArtCache[skinId]) {
            const tex = snakeSkinTextures(skin);
            this.skinArtCache[skinId] = { map: tex.map.image.toDataURL(), glow: tex.emissiveMap.image.toDataURL() };
        }
        const a = this.skinArtCache[skinId];
        return `<span class="skin-art" style="--map:url(${a.map});--glowmap:url(${a.glow});--eye:${hexColor(skin.eye)};--glow:${hexColor(skin.glow)}"><i class="skin-body"></i><i class="skin-head"></i></span>`;
    }

    // Image de la carte : peau qui défile (espèce), tête équipée (accessoire), particules (traînée).
    #optionArt(tab, id, item, skin) {
        const glow = hexColor(skin.glow);
        if (tab === "skin") return `<span class="opt-art">${this.#skinArt(id)}</span>`;
        if (tab === "accessory") {
            return `<span class="opt-art acc-art" style="--skin:${hexColor(skin.primary)};--glow:${glow}">${ACCESSORY_ICONS[id] ?? ""}</span>`;
        }
        const color = TRAIL_COLORS[id] ?? glow;
        const dots = id === "none" ? "" : Array.from({ length: 7 }, (_, i) => `<i style="--i:${i}"></i>`).join("");
        return `<span class="opt-art trail-art trail-${id}" style="--trail:${color};--skin:${hexColor(skin.primary)}"><b></b>${dots}</span>`;
    }

    #renderCustomize() {
        const p = this.settings.profile;
        const tab = this.customTab;
        $("name-input").value = p.name;
        for (const t of document.querySelectorAll(".tab")) t.classList.toggle("active", t.dataset.tab === tab);
        $("custom-hint").textContent = CUSTOM_TABS[tab].hint;
        const skin = SKINS[p.cosmetics.skin];
        const current = p.cosmetics[tab];
        const box = $("custom-options");
        box.innerHTML = Object.entries(CUSTOM_TABS[tab].table)
            .map(([id, item]) => {
                const on = id === current;
                return `<button class="option ${on ? "selected" : ""}" data-id="${id}" role="radio" aria-checked="${on}">
                    ${this.#optionArt(tab, id, item, skin)}
                    <span class="opt-text"><strong>${item.name}</strong>${item.description ? `<small>${item.description}</small>` : ""}</span>
                    <span class="opt-check" aria-hidden="true">✓</span></button>`;
            })
            .join("");
        for (const b of box.querySelectorAll(".option")) {
            b.addEventListener("click", () => {
                this.emit("profile", { cosmetics: { [tab]: b.dataset.id } });
                this.renderProfile();
                this.#renderCustomize();
            });
        }
        for (const b of $("evo-buttons").querySelectorAll("button")) b.classList.toggle("selected", Number(b.dataset.tier) === this.previewTier);
        $("evo-desc").textContent = EVO_DESC[this.previewTier];
    }

    // ---------- Paramètres ----------
    #bindSettings() {
        const seg = $("quality-seg");
        seg.innerHTML = Object.entries(QUALITY)
            .map(([id, q]) => `<button data-q="${id}">${q.label}</button>`)
            .join("");
        for (const b of seg.querySelectorAll("button")) {
            b.addEventListener("click", () => {
                this.settings.set("quality", b.dataset.q);
                this.#renderSettings();
            });
        }
        $("bloom-toggle").addEventListener("change", (e) => this.settings.set("bloom", e.target.checked));
        $("shake-toggle").addEventListener("change", (e) => this.settings.set("screenShake", e.target.checked));
        $("help-toggle").addEventListener("change", (e) => this.settings.set("showHelp", e.target.checked));
        $("cam-distance").addEventListener("input", (e) => this.settings.set("cameraDistance", Number(e.target.value)));
        $("fov").addEventListener("input", (e) => {
            this.settings.set("fov", Number(e.target.value));
            this.#renderSettings();
        });
        // Audio : volumes (curseurs) et coupure par catégorie (pastilles).
        const volumes = { master: "Volume général", music: "Musique", sfx: "Effets sonores", ambient: "Ambiance", voice: "Voix" };
        $("audio-volumes").innerHTML = Object.entries(volumes)
            .map(
                ([id, label]) => `<div class="setting"><div><strong>${label}</strong></div>
                <div class="slider"><input type="range" min="0" max="1" step="0.05" data-volume="${id}"><output data-out="${id}"></output></div></div>`
            )
            .join("");
        for (const input of $("audio-volumes").querySelectorAll("input")) {
            input.addEventListener("input", () => {
                this.settings.setAudio("volume", input.dataset.volume, Number(input.value));
                this.#renderSettings();
            });
        }
        $("audio-toggles").innerHTML = Object.entries(AUDIO_CATEGORIES)
            .map(([id, c]) => `<button class="chip-toggle" data-cat="${id}">${c.label}</button>`)
            .join("");
        for (const b of $("audio-toggles").querySelectorAll("button")) {
            b.addEventListener("click", () => {
                const id = b.dataset.cat;
                this.settings.setAudio("enabled", id, !this.settings.get("audio").enabled[id]);
                this.#renderSettings();
            });
        }
        $("reset-settings").addEventListener("click", () => {
            this.settings.reset();
            this.#renderSettings();
            this.#markPersonalDurations();
        });
    }

    #renderSettings() {
        const v = this.settings.values;
        for (const b of $("quality-seg").querySelectorAll("button")) b.classList.toggle("active", b.dataset.q === v.quality);
        $("bloom-toggle").checked = v.bloom;
        $("shake-toggle").checked = v.screenShake;
        $("help-toggle").checked = v.showHelp;
        $("cam-distance").value = v.cameraDistance;
        $("fov").value = v.fov;
        $("fov-value").textContent = `${v.fov}°`;
        for (const input of $("audio-volumes").querySelectorAll("input")) {
            const val = v.audio.volume[input.dataset.volume];
            input.value = val;
            $("audio-volumes").querySelector(`[data-out="${input.dataset.volume}"]`).textContent = `${Math.round(val * 100)} %`;
        }
        for (const b of $("audio-toggles").querySelectorAll("button")) b.classList.toggle("off", !v.audio.enabled[b.dataset.cat]);
    }

    // ---------- Fin de partie ----------
    #bindEnd() {
        $("end-menu").addEventListener("click", () => this.emit("endAction", "menu"));
        $("end-lobby").addEventListener("click", () => this.emit("endAction", "lobby"));
        $("end-replay").addEventListener("click", () => this.emit("endAction", "replay"));
    }

    setEndActions({ canReplay, showLobby }) {
        $("end-replay").classList.toggle("hidden", !canReplay);
        $("end-lobby").classList.toggle("hidden", !showLobby);
    }
}
