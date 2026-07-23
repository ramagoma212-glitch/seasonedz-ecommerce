// Version 7, Milestone 103: minimal static server that mimics GitHub
// Pages' actual behaviour for the smoke-test suite — a real file on
// disk is served with 200; anything else falls back to 404.html
// served WITH a 404 status (matching GH Pages exactly). No SPA
// rewrite magic like `vite preview` or a typical dev server provides,
// since that would test different fallback behaviour than production
// actually has (see .github/workflows/deploy.yml's own 404.html step
// and comment).
//
// Deliberately plain Node http, no new server-framework dependency —
// serves whatever is already in the given directory (the built dist/,
// already including any per-route folders and 404.html the calling
// command produced) and nothing else. Never writes anything, never
// calls any backend endpoint, never needs a secret.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";

const DIST = process.argv[2];
const PORT = Number(process.argv[3] || 4600);

if (!DIST) {
  console.error("Usage: node tests/helpers/server.mjs <dist-dir> [port]");
  process.exit(1);
}

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".xml": "application/xml",
  ".txt": "text/plain",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

async function resolveFile(urlPath) {
  const cleanPath = urlPath.split("?")[0];
  let candidate = join(DIST, cleanPath);
  try {
    const s = await stat(candidate);
    if (s.isDirectory()) candidate = join(candidate, "index.html");
  } catch {
    // Not a direct file/directory match — try it as a route folder
    // (e.g. "/shop" -> "dist/shop/index.html", matching how
    // scripts/generate-static-routes.mjs lays out generated routes).
    if (!extname(cleanPath)) candidate = join(DIST, cleanPath, "index.html");
  }
  try {
    await stat(candidate);
    return candidate;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  const filePath = await resolveFile(req.url);
  if (filePath) {
    const content = await readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(content);
    return;
  }
  const notFoundPath = join(DIST, "404.html");
  try {
    const content = await readFile(notFoundPath);
    res.writeHead(404, { "Content-Type": "text/html" });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});

server.listen(PORT, () => console.log(`[smoke-test-server] serving ${DIST} at http://localhost:${PORT}`));
