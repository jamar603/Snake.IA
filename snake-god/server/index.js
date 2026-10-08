import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

function resolvePath(urlPath) {
    for (const [prefix, dir] of MOUNTS) {
        if (!urlPath.startsWith(prefix)) continue;
        const file = normalize(join(dir, urlPath.slice(prefix.length)));
        if (!file.startsWith(dir)) return null; // pas de sortie du dossier
        return file;
    }
    return null;
}

const server = createServer((req, res) => {
    let urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (urlPath.endsWith("/")) urlPath += "index.html";
    const file = resolvePath(urlPath);
    if (!file || !existsSync(file) || !statSync(file).isFile()) {
        res.writeHead(404).end("Introuvable");
        return;
    }
    res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
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
