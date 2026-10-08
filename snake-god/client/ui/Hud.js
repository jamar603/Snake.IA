import { POWERS, POWER_IDS, ROLE_INFO, SKILLS, SKILL_IDS, WORLD_EVENTS } from "/shared/config.js";
import { EVOLUTIONS, SKINS, evolutionFor } from "/shared/cosmetics.js";
import { PHASE_COLORS } from "../render/Environment.js";
import { POWER_ICONS, SKILL_ICONS } from "./icons.js";
import { escapeHtml } from "./util.js";

const $ = (id) => document.getElementById(id);

const CAUSE_TEXT = {
    trap: "Piège !",
    wall: "Mur !",
    boundary: "Bord du monde !",
    snake: "Collision !",
    headOn: "Choc frontal !",
    crushed: "Écrasé par un mur !",
    zone: "Zone brûlante !",
};

const EVENT_TEXT = {
    goldenFruit: { title: "Fruit doré !", sub: "+50 points et 3 segments", color: "#ffd34d" },
    foodRain: { title: "Pluie de nourriture", sub: "Le monde est généreux… pour l'instant", color: "#7dff6a" },
    meteorShower: { title: "Pluie de météores", sub: "Évitez les zones marquées !", color: "#ff7a2e" },
};

// Interface en jeu : cartes des joueurs, timer, panneau du dieu, vision divine,
// évolution du Snake, bannières, notifications et effet de dégâts.
export class Hud extends EventTarget {
    constructor() {
        super();
        this.el = {
            root: $("hud"),
            snakeCards: $("snake-cards"),
            godCard: $("god-card"),
            timer: $("timer"),
            phase: $("phase"),
            countdown: $("countdown"),
            banner: $("banner"),
            youAre: $("you-are"),
            godPanel: $("god-panel"),
            snakePanel: $("snake-panel"),
            snakeHelp: $("snake-help"),
            evoName: $("evo-name"),
            evoNext: $("evo-next"),
            evoFill: $("evo-fill"),
            energyValue: $("energy-value"),
            energyFill: $("energy-fill"),
            powers: $("powers"),
            axisValue: $("axis-value"),
            intel: $("intel"),
            intelEvent: $("intel-event"),
            intelFood: $("intel-food"),
            notices: $("notices"),
            vignette: $("vignette"),
            skills: $("skills"),
            godHint: $("god-hint"),
            layerTool: $("layer-tool"),
            layerValue: $("layer-value"),
            godKeys: document.querySelector(".god-tools .hint"),
        };
        this.lastHp = {};
        this.showHelp = true;
        this.input = null; // InputManager : libellés des touches / boutons
        this.#buildPowers();
        this.#buildSkills();
    }

    #buildSkills() {
        this.skillButtons = {};
        this.skillReady = {};
        for (const id of SKILL_IDS) {
            const s = SKILLS[id];
            const btn = document.createElement("button");
            btn.className = "skill";
            btn.title = `${s.label} (${s.keyLabel}) : ${s.description}`;
            btn.innerHTML = `<span class="s-key">${s.keyLabel}</span>${SKILL_ICONS[id]}<span class="s-name">${s.label}</span>`;
            btn.addEventListener("click", () => this.dispatchEvent(new CustomEvent("skill", { detail: id })));
            this.el.skills.appendChild(btn);
            this.skillButtons[id] = btn;
            this.skillReady[id] = true;
        }
    }

    #renderSkills(snake) {
        if (!snake.skills) return;
        const color = ROLE_INFO[snake.id]?.css;
        for (const id of SKILL_IDS) {
            const btn = this.skillButtons[id];
            const { activeMs, readyInMs } = snake.skills[id];
            const skill = SKILLS[id];
            btn.style.setProperty("--c", color);
            btn.style.setProperty("--cd", readyInMs / skill.cooldownMs);
            btn.style.setProperty("--active", activeMs / skill.durationMs);
            btn.classList.toggle("active", activeMs > 0);
            btn.classList.toggle("cooling", readyInMs > 0 && activeMs === 0);
            // De nouveau prête : petit rebond (une seule fois), le joueur le voit du coin de l'œil.
            const ready = readyInMs === 0;
            if (ready && !this.skillReady[id]) {
                btn.classList.remove("just-ready");
                void btn.offsetWidth;
                btn.classList.add("just-ready");
            }
            this.skillReady[id] = ready;
        }
    }

    #buildPowers() {
        this.powerButtons = {};
        for (const id of POWER_IDS) {
            const p = POWERS[id];
            const btn = document.createElement("button");
            btn.className = "power";
            btn.title = p.description;
            btn.innerHTML = `<span class="p-key">${p.key}</span>${POWER_ICONS[id] ?? ""}<span class="p-name">${p.label}</span><span class="p-meta">${p.cost}</span><span class="cooldown"></span>`;
            btn.addEventListener("click", () => this.dispatchEvent(new CustomEvent("power", { detail: id })));
            this.el.powers.appendChild(btn);
            this.powerButtons[id] = btn;
        }
    }

    // Libellés des commandes pour le périphérique utilisé (clavier ou manette, glyphes △ ○ × □
    // pour une manette PlayStation), mis à jour dès que le joueur change de périphérique.
    setInput(input) {
        this.input = input;
        const refresh = () => {
            for (const id of SKILL_IDS) {
                const label = input.label(id);
                this.skillButtons[id].querySelector(".s-key").textContent = label;
                this.skillButtons[id].title = `${SKILLS[id].label} (${label}) : ${SKILLS[id].description}`;
            }
        };
        for (const ev of ["device", "pad"]) input.addEventListener(ev, refresh);
        input.settings.addEventListener("change", refresh);
        refresh();
    }

    #snakeHelp(volume) {
        const L = (a) => this.input?.label(a) ?? "";
        const pad = this.input?.usingPad;
        const turn = `${L("turnLeft")} ${L("turnRight")}${pad ? " ou stick" : ""}`;
        const skills = `${L("sprint")} ${L("shield")} ${L("phase")} : compétences`;
        return volume
            ? `${turn} : tourner · ${L("turnUp")} ${L("turnDown")} : monter / descendre · ${skills}`
            : `${turn} : tourner (la face change toute seule) · ${skills}`;
    }

    #godHelp(volume) {
        const L = (a) => this.input?.label(a) ?? "";
        if (this.input?.usingPad) {
            const layer = volume ? ` · ${L("layerUp")} ${L("layerDown")} : couche` : "";
            return `Stick G : viser · ${L("place")} : poser · ${L("prevPower")} ${L("nextPower")} : pouvoir · ${L("cycleAxis")} : orientation · stick D : caméra${layer}`;
        }
        return volume
            ? `Clic : poser · ${L("layerUp")} ${L("layerDown")} ou Maj + molette : couche · ${L("cycleAxis")} : axe`
            : `Clic sur une face : poser · ${L("cycleAxis")} : orientation · glisser : tourner`;
    }

    setRole(role) {
        this.role = role;
        const isGod = role === "god";
        this.el.youAre.textContent = role
            ? `Tu es ${ROLE_INFO[role].label}${isGod ? " : élimine les deux Snakes" : " : survis, mange, évolue"}`
            : "Spectateur";
        this.el.youAre.style.color = role ? ROLE_INFO[role].css : "";
    }

    setVisible(on, { playing = false } = {}) {
        this.el.root.classList.toggle("hidden", !on);
        const god = on && playing && this.role === "god";
        const snake = on && playing && this.role?.startsWith("snake");
        this.el.godPanel.classList.toggle("hidden", !god);
        this.el.intel.classList.toggle("hidden", !god);
        this.el.snakePanel.classList.toggle("hidden", !snake);
        this.el.snakeHelp.classList.toggle("hidden", !this.showHelp);
        if (!on) this.el.banner.classList.add("hidden");
    }

    render(state) {
        // Partie illimitée : temps écoulé (∞) et objectif des Snakes ; sinon temps restant.
        const unlimited = state.timeLeftMs == null;
        const secs = unlimited ? Math.floor(state.elapsedMs / 1000) : Math.ceil(state.timeLeftMs / 1000);
        this.el.timer.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
        this.el.timer.classList.toggle("unlimited", unlimited);
        this.el.timer.classList.toggle("urgent", !unlimited && secs <= 20 && state.status === "playing");
        const goal = unlimited ? ` · Objectif Snakes : taille ${state.winLength}` : "";
        const side = state.arena.size;
        const mapLabel = { world: `World ${side}×${side}`, volume: `Cube 3D ${side}³` }[state.map?.kind] ?? `Cube ${side}`;
        this.el.phase.textContent = `Phase ${state.phase} · ${state.phaseName} · ${mapLabel}${goal}`;
        this.el.phase.style.setProperty("--phase", `#${PHASE_COLORS[state.phase].getHexString()}`);

        const countdown = state.status === "countdown";
        this.el.countdown.classList.toggle("hidden", !countdown);
        const n = Math.max(1, Math.ceil(state.countdownMs / 1000));
        if (countdown && this.el.countdown.textContent !== String(n)) this.el.countdown.textContent = n;

        this.el.snakeCards.innerHTML = state.snakes.map((s) => this.#snakeCard(s)).join("");
        const god = state.god;
        this.el.godCard.innerHTML = god.name
            ? `<div class="card" style="--c:${ROLE_INFO.god.css}">
                 <div class="name">${escapeHtml(god.name)}${god.ai ? '<span class="ai-tag">IA</span>' : ""}</div>
                 <div class="stats"><span>Score <strong>${god.score}</strong></span><span>Énergie <strong>${Math.floor(god.energy)}</strong></span></div>
               </div>`
            : "";

        if (this.role === "god") {
            this.#renderGodPanel(god);
            this.#renderIntel(state.intel);
        }
        const mine = state.snakes.find((s) => s.id === this.role);
        if (mine) {
            // Aide des commandes selon la map (haut / bas seulement dans le Cube 3D).
            this.el.snakeHelp.textContent = this.#snakeHelp(state.map?.kind === "volume");
            this.#renderEvolution(mine);
            this.#renderSkills(mine);
        }
    }

    #snakeCard(s) {
        const info = ROLE_INFO[s.id];
        const skin = SKINS[s.cosmetics?.skin];
        const color = skin ? `#${skin.primary.toString(16).padStart(6, "0")}` : info.css;
        const hearts = Array.from({ length: s.maxHp }, (_, i) => `<i class="heart ${i < s.hp ? "" : "lost"}"></i>`).join("");
        const evo = evolutionFor(s.length);
        return `<div class="card ${s.alive ? "" : "dead"}" style="--c:${color}">
            <div class="name">${escapeHtml(s.name)}${s.ai ? '<span class="ai-tag">IA</span>' : ""}${s.alive ? "" : " — éliminé"}</div>
            <div class="hearts">${hearts}</div>
            <div class="stats"><span>Score <strong>${s.score}</strong></span><span>Taille <strong>${s.length}</strong></span><span class="tier">${evo.name}</span></div>
        </div>`;
    }

    #renderEvolution(snake) {
        const evo = evolutionFor(snake.length);
        const next = EVOLUTIONS.find((e) => e.tier === evo.tier + 1);
        this.el.evoName.textContent = `${["I", "II", "III", "IV"][evo.tier - 1]} · ${evo.name}`;
        if (next) {
            this.el.evoNext.textContent = `${next.name} à ${next.minLength}`;
            const p = (snake.length - evo.minLength) / (next.minLength - evo.minLength);
            this.el.evoFill.style.width = `${Math.min(100, p * 100)}%`;
        } else {
            this.el.evoNext.textContent = "Forme ultime";
            this.el.evoFill.style.width = "100%";
        }
    }

    #renderGodPanel(god) {
        this.el.energyValue.textContent = `${Math.floor(god.energy)} / ${god.maxEnergy}`;
        this.el.energyFill.style.width = `${(god.energy / god.maxEnergy) * 100}%`;
        for (const id of POWER_IDS) {
            const btn = this.powerButtons[id];
            const info = god.powers[id];
            const p = POWERS[id];
            btn.classList.toggle("locked", !info.unlocked);
            btn.classList.toggle("unaffordable", god.energy < p.cost);
            btn.querySelector(".p-meta").textContent = info.unlocked
                ? info.cooldownLeft > 0
                    ? `${(info.cooldownLeft / 1000).toFixed(1)} s`
                    : `${p.cost} énergie`
                : `Phase ${p.phase}`;
            btn.querySelector(".cooldown").style.height = `${(info.cooldownLeft / info.cooldownMs) * 100}%`;
        }
    }

    #renderIntel(intel) {
        if (!intel) return;
        const ev = intel.nextEvent;
        this.el.intelEvent.innerHTML = ev
            ? `<span>${WORLD_EVENTS[ev.type].label}</span><strong>${Math.ceil(ev.inMs / 1000)} s</strong>`
            : "<span>Aucun événement</span>";
        this.el.intelFood.textContent = intel.upcomingFood.length;
    }

    renderGodTools({ power, axis, hint, layer, volume }) {
        // Cube 3D : couche visée et axe libre ; ailleurs : clic direct sur la face.
        this.el.layerTool.classList.toggle("hidden", !volume);
        this.el.layerValue.textContent = layer;
        this.el.godKeys.textContent = this.#godHelp(volume);
        for (const id of POWER_IDS) this.powerButtons[id].classList.toggle("selected", id === power);
        // Pouvoir choisi : ce qu'il fait, ou pourquoi il ne peut pas partir ici.
        const help = this.el.godHint;
        if (help) {
            const bad = hint && !hint.ok;
            help.textContent = bad ? hint.reason : `${POWERS[power].label} : ${POWERS[power].description}`;
            help.classList.toggle("bad", !!bad);
        }
        this.el.axisValue.textContent = power === "wall" || (volume && ["rotatingWall", "dangerZone"].includes(power)) ? axis : "—";
    }

    // Réactions de l'interface aux événements du tick.
    handleEvents(events, myRole, snakesById) {
        for (const ev of events) {
            if (ev.type === "damage" && ev.snake === myRole) {
                this.flash();
                this.notice(CAUSE_TEXT[ev.cause] ?? "Touché !");
            }
            if (ev.type === "eliminated") {
                const s = snakesById[ev.snake];
                this.banner(`${escapeHtml(s?.name ?? ev.snake)} est éliminé`, "", "#ff3b5c");
            }
            if (ev.type === "phase") this.banner(`Phase ${ev.phase}`, "Le monde se durcit", `#${PHASE_COLORS[ev.phase].getHexString()}`);
            if (ev.type === "healed" && ev.snake === myRole) this.notice("+1 PV !");
            if (ev.type === "shieldBlocked" && ev.snake === myRole) this.notice("Bouclier : coup bloqué !");
            if (ev.type === "evolved" && ev.snake === myRole) this.banner(`Évolution : ${ev.name}`, "Ton Snake devient plus puissant", "#ffd34d");
            if (ev.type === "expansionStart") {
                const why = { time: "Le temps presse…", growth: "Les Snakes grandissent : l'arène s'agrandit…", density: "Le monde étouffe : l'arène s'agrandit…" };
                this.banner("WORLD EXPANSION", `${why[ev.reason] ?? "L'arène s'agrandit…"} ${ev.fromSize}³ → ${ev.toSize}³`, "#d9c2ff");
            }
            if (ev.type === "worldEvent") {
                const t = EVENT_TEXT[ev.event];
                if (t) this.banner(t.title, ev.forced ? "Déclenché par le Snake God" : t.sub, t.color);
            }
        }
    }

    flash() {
        const v = this.el.vignette;
        v.classList.add("on");
        requestAnimationFrame(() => requestAnimationFrame(() => v.classList.remove("on")));
    }

    banner(title, sub = "", color = "") {
        const b = this.el.banner;
        b.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ""}`;
        b.style.setProperty("--banner", color || "var(--god)");
        b.classList.remove("hidden");
        b.style.animation = "none";
        void b.offsetWidth; // relance l'animation
        b.style.animation = "";
        clearTimeout(this.bannerTimer);
        this.bannerTimer = setTimeout(() => b.classList.add("hidden"), 2600);
    }

    notice(message) {
        const n = document.createElement("div");
        n.className = "notice";
        n.textContent = message;
        this.el.notices.appendChild(n);
        setTimeout(() => n.remove(), 2600);
        while (this.el.notices.children.length > 4) this.el.notices.firstChild.remove();
    }
}
