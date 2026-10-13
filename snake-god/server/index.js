import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { MultiplayerManager } from "./MultiplayerManager.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT) || 8080;

// URL publique -> dossier local
const MOUNTS = [
    ["/shared/", join(ROOT, "shared")],
    ["/vendor/three/", join(ROOT, "node_modules", "three")],
    ["/", join(ROOT, "client")],
];

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".glb": "model/gltf-binary",
};

// Formats texte (et modèles 3D) : gzip réduit leur taille de 60 à 80 %.
const COMPRESSIBLE = new Set([".html", ".js", ".css", ".json", ".svg", ".glb"]);

// Fichiers lus et compressés une seule fois, relus seulement si modifiés.
const cache = new Map(); // chemin -> { mtimeMs, etag, body, gzip }

async function load(file) {
    const info = await stat(file);
    if (!info.isFile()) return null;
    const hit = cache.get(file);
    if (hit?.mtimeMs === info.mtimeMs) return hit;
    const body = await readFile(file);
    const entry = {
        mtimeMs: info.mtimeMs,
        etag: `"${info.size.toString(36)}-${Math.floor(info.mtimeMs).toString(36)}"`,
        body,
        gzip: COMPRESSIBLE.has(extname(file)) && body.length > 1024 ? gzipSync(body, { level: 9 }) : null,
    };
    cache.set(file, entry);
    return entry;
}

function resolvePath(urlPath) {
    for (const [prefix, dir] of MOUNTS) {
        if (!urlPath.startsWith(prefix)) continue;
        const file = normalize(join(dir, urlPath.slice(prefix.length)));
        if (!file.startsWith(dir)) return null; // pas de sortie du dossier
        return file;
    }
    return null;
}

const server = createServer(async (req, res) => {
    let urlPath;
    try {
        urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch {
        res.writeHead(400).end("Requête invalide");
        return;
    }
    if (urlPath.endsWith("/")) urlPath += "index.html";
    const file = resolvePath(urlPath);
    const entry = file && (await load(file).catch(() => null));
    if (!entry) {
        res.writeHead(404).end("Introuvable");
        return;
    }
    const headers = {
        "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
        // Three.js ne change pas entre deux déploiements : gardé un jour.
        // Le jeu, lui, est revalidé à chaque visite (réponse 304 vide s'il n'a pas changé).
        "Cache-Control": urlPath.startsWith("/vendor/") ? "public, max-age=86400" : "no-cache",
        ETag: entry.etag,
        Vary: "Accept-Encoding",
    };
    if (req.headers["if-none-match"] === entry.etag) {
        res.writeHead(304, headers).end();
        return;
    }
    const gzip = entry.gzip && /\bgzip\b/.test(req.headers["accept-encoding"] ?? "");
    if (gzip) headers["Content-Encoding"] = "gzip";
    const body = gzip ? entry.gzip : entry.body;
    headers["Content-Length"] = body.length;
    res.writeHead(200, headers).end(req.method === "HEAD" ? undefined : body);
});

const options = {};
if (process.env.MATCH_SECONDS) options.matchSeconds = Number(process.env.MATCH_SECONDS);
if (process.env.COUNTDOWN_SECONDS) options.countdownSeconds = Number(process.env.COUNTDOWN_SECONDS);
new MultiplayerManager(server, options);

server.listen(PORT, () => {
    console.log(`Snakora : http://localhost:${PORT}`);
    for (const nets of Object.values(networkInterfaces())) {
        for (const net of nets ?? []) {
            if (net.family === "IPv4" && !net.internal) console.log(`  réseau local : http://${net.address}:${PORT}`);
        }
    }
});
