import { ROLE_INFO } from "/shared/config.js";
import { ACCESSORIES, EVOLUTIONS, SKINS, TRAILS } from "/shared/cosmetics.js";
import { AUDIO_CATEGORIES } from "../audio/AudioManager.js";
import { QUALITY } from "../settings.js";
import { escapeHtml, hexColor } from "./util.js";

const $ = (id) => document.getElementById(id);

const SCREENS = ["main", "mode", "solo", "online", "room", "customize", "settings", "end"];

const EVO_DESC = {
    1: "Éclosion : corps lisse, yeux lumineux.",
    2: "Chasseur (7+) : nageoires dorsales.",
    3: "Prédateur (13+) : pointes d'énergie et veines pulsantes.",
    4: "Légende (21+) : aura, halo et traînée intense.",
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
        this.#bindNavigation();
        this.#bindOnline();
        this.#bindRoom();
        this.#bindCustomize();
        this.#bindSettings();
        this.#bindEnd();
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
        if (name === "customize") this.#renderCustomize();
        if (name === "settings") this.#renderSettings();
        this.emit("screen", name);
    }

    back() {
        const prev = this.history.pop() ?? "main";
        this.show(prev, { push: false });
    }

    hideAll() {
        for (const s of SCREENS) $(`screen-${s}`).classList.add("hidden");
        this.screen = "game";
        this.history = [];
        this.emit("screen", "game");
    }

    #bindNavigation() {
        for (const b of document.querySelectorAll("[data-go]")) b.addEventListener("click", () => this.show(b.dataset.go));
        for (const b of document.querySelectorAll("[data-back]")) b.addEventListener("click", () => this.back());
        for (const b of document.querySelectorAll("[data-mode]")) {
            b.addEventListener("click", () => {
                const mode = b.dataset.mode;
                if (mode === "solo") this.show("solo");
                else if (mode === "online") this.show("online");
                else this.emit("quickPlay", null);
            });
        }
        for (const b of document.querySelectorAll("[data-solo-role]")) {
            b.addEventListener("click", () => this.emit("quickPlay", b.dataset.soloRole));
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

    // ---------- Multijoueur ----------
    #bindOnline() {
        $("create-room-btn").addEventListener("click", () => this.emit("createRoom", $("private-toggle").checked));
        const join = () => {
            const code = $("join-code").value.trim().toUpperCase();
            if (code.length === 4) this.emit("joinRoom", code);
        };
        $("join-btn").addEventListener("click", join);
        $("join-code").addEventListener("keydown", (e) => e.key === "Enter" && join());
        $("refresh-rooms").addEventListener("click", () => this.emit("refreshRooms"));
    }

    renderRooms(rooms) {
        const list = $("room-list");
        if (!rooms.length) {
            list.innerHTML = `<li class="empty">Aucun salon public pour l'instant. Crées-en un !</li>`;
            return;
        }
        const status = { lobby: "En attente", countdown: "Démarrage", playing: "En partie", ended: "Terminée" };
        list.innerHTML = rooms
            .map(
                (r) => `<li><div><strong>${escapeHtml(r.name)}</strong> <span class="room-meta">· ${r.code} · ${r.players} joueur(s) · ${status[r.status] ?? r.status}</span></div>
                <button class="ghost-btn small" data-join="${r.code}">Rejoindre</button></li>`
            )
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
            setTimeout(() => ($("copy-code").textContent = "Copier"), 1200);
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
            card.classList.toggle("taken", !!owner);
            card.classList.toggle("mine", owner?.id === myId);
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
        $("start-btn").classList.toggle("hidden", !isHost);
        $("room-wait").classList.toggle("hidden", isHost);
    }

    // ---------- Personnalisation ----------
    #bindCustomize() {
        $("name-input").addEventListener("change", () => {
            this.emit("profile", { name: $("name-input").value.trim() });
            this.renderProfile();
        });
        for (const t of document.querySelectorAll(".tab")) {
            t.addEventListener("click", () => {
                this.customTab = t.dataset.tab;
                this.#renderCustomize();
            });
        }
        const evo = $("evo-buttons");
        evo.innerHTML = EVOLUTIONS.map((e) => `<button data-tier="${e.tier}">${["I", "II", "III", "IV"][e.tier - 1]}</button>`).join("");
        for (const b of evo.querySelectorAll("button")) {
            b.addEventListener("click", () => {
                this.previewTier = Number(b.dataset.tier);
                this.emit("previewTier", this.previewTier);
                this.#renderCustomize();
            });
        }
    }

    #renderCustomize() {
        const p = this.settings.profile;
        $("name-input").value = p.name;
        for (const t of document.querySelectorAll(".tab")) t.classList.toggle("active", t.dataset.tab === this.customTab);
        const table = { skin: SKINS, accessory: ACCESSORIES, trail: TRAILS }[this.customTab];
        const current = p.cosmetics[this.customTab];
        const box = $("custom-options");
        box.innerHTML = Object.entries(table)
            .map(([id, item]) => {
                const swatches =
                    this.customTab === "skin"
                        ? `<span class="swatches">${[item.primary, item.secondary, item.glow, item.eye].map((c) => `<i style="background:${hexColor(c)}"></i>`).join("")}</span>`
                        : "";
                return `<button class="option ${id === current ? "selected" : ""}" data-id="${id}">
                    <strong>${item.name}</strong>${swatches}${item.description ? `<small>${item.description}</small>` : ""}</button>`;
            })
            .join("");
        for (const b of box.querySelectorAll(".option")) {
            b.addEventListener("click", () => {
                this.emit("profile", { cosmetics: { [this.customTab]: b.dataset.id } });
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
