import { POWERS, ROLE_INFO } from "/shared/config.js";
import { SKINS, evolutionFor } from "/shared/cosmetics.js";
import { escapeHtml, formatTime, hexColor } from "./util.js";

const $ = (id) => document.getElementById(id);

// Écran de fin : verdict, carte de résultats par joueur, statistiques de la partie.
export function renderEnd(summary, myRole) {
    const godWon = summary.winner === "god";
    const iWon = myRole === "god" ? godWon : myRole ? !godWon : null;
    const best = [...summary.snakes].sort((a, b) => b.score - a.score)[0];

    $("end-kicker").textContent = iWon === null ? "Fin de partie" : iWon ? "Bravo" : "Dommage";
    $("end-title").textContent = iWon === null ? (godWon ? "Le dieu triomphe" : "Les Snakes survivent") : iWon ? "Victoire" : "Défaite";
    $("screen-end").style.setProperty("--end-color", iWon === false ? "#ff4d4d" : godWon ? "#e07bff" : "#f2c94c");
    $("end-sub").textContent = godWon
        ? "Le Snake God a éliminé tous les Snakes."
        : `Au moins un Snake a survécu jusqu'au bout.${best ? ` Meilleur score : ${best.name}.` : ""}`;

    const maxScore = Math.max(1, ...summary.snakes.map((s) => s.score), summary.god.score);
    const maxLen = Math.max(1, ...summary.snakes.map((s) => s.length));
    const bar = (v, max) => `<div class="stat-bar"><i style="width:${Math.round((v / max) * 100)}%"></i></div>`;
    const cards = summary.snakes.map((s) => {
        const skin = SKINS[s.cosmetics?.skin];
        const color = skin ? hexColor(skin.primary) : ROLE_INFO[s.id].css;
        const mvp = !godWon && s === best;
        return `<div class="end-card ${mvp ? "mvp" : ""}" style="--c:${color}">
            <h3>${escapeHtml(s.name)}${mvp ? '<span class="badge">MVP</span>' : ""}</h3>
            <div class="big-score">${s.score} <small>points</small></div>
            <div class="stat-row">
                <span>${ROLE_INFO[s.id].label} · ${evolutionFor(s.length).name}</span><b>${s.alive ? "Survivant" : "Éliminé"}</b>
                <span>Longueur</span><b>${s.length}</b>${bar(s.length, maxLen)}
                <span>Temps de survie</span><b>${formatTime(s.survivalMs)}</b>${bar(s.survivalMs, summary.durationMs || 1)}
                <span>Nourriture</span><b>${s.foodEaten}</b>
                <span>Dégâts subis</span><b>${s.damageTaken}</b>
                <span>Pièges déclenchés</span><b>${s.trapsTriggered}</b>
            </div>
        </div>`;
    });
    const g = summary.god;
    const used = Object.entries(g.powersUsed ?? {})
        .filter(([, n]) => n > 0)
        .map(([id, n]) => `${POWERS[id].label} ×${n}`)
        .join(" · ");
    cards.push(`<div class="end-card ${godWon ? "mvp" : ""}" style="--c:${ROLE_INFO.god.css}">
        <h3>${escapeHtml(g.name ?? "Snake God")}${godWon ? '<span class="badge">MVP</span>' : ""}</h3>
        <div class="big-score">${g.score} <small>points</small></div>
        <div class="stat-row">
            <span>Snake God</span><b>${godWon ? "Vainqueur" : "Vaincu"}</b>
            <span>Dégâts infligés</span><b>${g.damageDealt}</b>${bar(g.score, maxScore)}
            <span>Éliminations</span><b>${g.eliminations}</b>
            <span>Pouvoirs</span><b>${Object.values(g.powersUsed ?? {}).reduce((a, b) => a + b, 0)}</b>
        </div>
        <p class="muted">${used || "Aucun pouvoir utilisé"}</p>
    </div>`);
    $("end-cards").innerHTML = cards.join("");

    $("end-match").innerHTML = [
        ["Durée", formatTime(summary.durationMs)],
        ["Pièges déclenchés", summary.trapsTriggered],
        ["Événements du monde", summary.worldEvents ?? 0],
    ]
        .map(([k, v]) => `<div>${k} <strong>${v}</strong></div>`)
        .join("");
}
