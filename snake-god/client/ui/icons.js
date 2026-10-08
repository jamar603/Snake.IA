// Icônes SVG des pouvoirs du Snake God (couleur = currentColor).
const svg = (body) =>
    `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const POWER_ICONS = {
    trap: svg(`<circle cx="16" cy="16" r="6"/><path d="M16 3v5M16 24v5M3 16h5M24 16h5M7 7l3.5 3.5M21.5 21.5L25 25M25 7l-3.5 3.5M10.5 21.5L7 25"/>`),
    wall: svg(`<rect x="5" y="9" width="22" height="14" rx="2"/><path d="M5 16h22M12 9v7M20 16v7"/>`),
    rotatingWall: svg(`<path d="M6 16h20"/><circle cx="16" cy="16" r="3"/><path d="M25 8a12 12 0 0 1 0 16M7 24a12 12 0 0 1 0-16"/><path d="M25 8l-3 1M7 24l3-1"/>`),
    demolish: svg(`<path d="M6 26l9-9M13 7l12 12-4 4L9 11z"/><path d="M22 4l6 6"/>`),
    triggerEvent: svg(`<path d="M16 3l3.5 8.5L28 13l-6.5 6 2 9L16 23.5 8.5 28l2-9L4 13l8.5-1.5z"/>`),
    dangerZone: svg(`<path d="M16 4L29 27H3z"/><path d="M16 12v7M16 23v.5"/>`),
    teleporter: svg(`<ellipse cx="9" cy="16" rx="4" ry="9"/><ellipse cx="23" cy="16" rx="4" ry="9"/><path d="M13 12h6M17 9l3 3-3 3M19 20h-6M15 17l-3 3 3 3"/>`),
    expand: svg(`<rect x="10" y="10" width="12" height="12" rx="1"/><path d="M4 9V4h5M28 9V4h-5M4 23v5h5M28 23v5h-5M6 6l5 5M26 6l-5 5M6 26l5-5M26 26l-5-5"/>`),
};

// Icônes des compétences des Snakes.
export const SKILL_ICONS = {
    sprint: svg(`<path d="M4 10h9M2 16h11M4 22h9"/><path d="M15 7l11 9-11 9z"/>`),
    shield: svg(`<path d="M16 3l11 4v8c0 7-5 11.5-11 14C10 26.5 5 22 5 15V7z"/><path d="M11 16l3.5 3.5L21 12"/>`),
    phase: svg(`<circle cx="12" cy="16" r="7" stroke-dasharray="3 3"/><circle cx="20" cy="16" r="7"/>`),
};

export const EVENT_ICONS = {
    goldenFruit: "🍎",
    foodRain: "🌧",
    meteorShower: "☄",
};

// Icônes des modes de jeu (écran « Mode de jeu »).
export const MODE_ICONS = {
    solo: svg(`<circle cx="16" cy="11" r="5"/><path d="M6 27c1.5-5 5.5-8 10-8s8.5 3 10 8"/>`),
    online: svg(`<circle cx="9" cy="12" r="4"/><circle cx="23" cy="12" r="4"/><circle cx="16" cy="8" r="4"/><path d="M2 26c1-4 4-6 7-6M30 26c-1-4-4-6-7-6M9 27c1-4.5 3.8-7 7-7s6 2.5 7 7"/>`),
    demo: svg(`<rect x="4" y="6" width="24" height="16" rx="3"/><path d="M14 11l5 3-5 3z"/><path d="M11 27h10"/>`),
};

// Accessoires : tête de Snake vue de face + l'accessoire (cartes de personnalisation).
const head = `<ellipse cx="32" cy="38" rx="17" ry="13" fill="var(--skin, #22e6ff)" stroke="none"/>
<circle cx="25" cy="35" r="3.2" fill="#fff35c" stroke="none"/><circle cx="39" cy="35" r="3.2" fill="#fff35c" stroke="none"/>
<path d="M25 33.5v3M39 33.5v3" stroke="#050308" stroke-width="1.6"/>`;
const art = (body) =>
    `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${head}${body}</svg>`;
export const ACCESSORY_ICONS = {
    none: art(""),
    horns: art(`<path d="M20 28c-4-6-4-12-1-17 1 6 4 9 8 12M44 28c4-6 4-12 1-17-1 6-4 9-8 12" fill="#f2e6d0" stroke="#c9bba0"/>`),
    crown: art(`<path d="M19 26l3-12 6 7 4-10 4 10 6-7 3 12z" fill="#ffd34d" stroke="#b8860b"/>`),
    crest: art(`<path d="M32 26c-3-6-2-13 2-18 0 6 3 9 6 11-2 2-5 4-8 7z" fill="var(--glow, #8ff8ff)" stroke="none"/>`),
    visor: art(`<path d="M15 33c4-5 30-5 34 0-3 4-31 4-34 0z" fill="var(--glow, #8ff8ff)" fill-opacity="0.8" stroke="var(--glow, #8ff8ff)"/>`),
};