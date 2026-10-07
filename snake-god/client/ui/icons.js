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
};

export const EVENT_ICONS = {
    goldenFruit: "🍎",
    foodRain: "🌧",
    meteorShower: "☄",
};
