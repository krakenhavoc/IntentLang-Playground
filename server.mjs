// Local dev server with static file serving and AI API proxy.
// The proxy forwards /api/* requests to the configured AI_API_BASE,
// avoiding browser CORS restrictions during development.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";

const PORT = parseInt(process.env.PORT || "8080");
const WEB_DIR = join(import.meta.dirname, "web");

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

async function serveStatic(req, res) {
  let url = req.url.split("?")[0];
  if (url === "/") url = "/index.html";

  const filePath = join(WEB_DIR, url);

  // Prevent directory traversal
  if (!filePath.startsWith(WEB_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    await stat(filePath);
    const data = await readFile(filePath);
    const ext = extname(filePath);
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not Found");
  }
}

async function proxyApi(req, res, apiBase) {
  // Strip /api prefix and forward to the real API
  const targetPath = req.url.replace(/^\/api/, "");
  const targetUrl = `${apiBase}${targetPath}`;

  // Read request body
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  // Forward headers (strip proxy-specific, host, and encoding headers)
  const headers = { ...req.headers };
  delete headers.host;
  delete headers["x-api-base"];
  delete headers["accept-encoding"];
  headers["content-length"] = body.length;

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: req.method !== "GET" && req.method !== "HEAD" ? body : undefined,
    });

    // Forward response headers, stripping hop-by-hop headers.
    // Node's fetch auto-decompresses gzip, so content-encoding and
    // content-length from the upstream no longer match the body we send.
    const hopByHop = new Set([
      "content-encoding", "transfer-encoding", "content-length", "connection",
    ]);
    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      if (!hopByHop.has(key)) responseHeaders[key] = value;
    });

    const responseBody = Buffer.from(await response.arrayBuffer());
    responseHeaders["content-length"] = responseBody.length;
    res.writeHead(response.status, responseHeaders);
    res.end(responseBody);
  } catch (e) {
    res.writeHead(502);
    res.end(JSON.stringify({ error: `Proxy error: ${e.message}` }));
  }
}

const server = createServer(async (req, res) => {
  if (req.url.startsWith("/api/")) {
    // Read target from X-Api-Base header (set by browser), fall back to env var
    const apiBase = req.headers["x-api-base"] || process.env.AI_API_BASE;
    if (!apiBase) {
      res.writeHead(503);
      res.end(JSON.stringify({ error: "No API base configured. Enter your API URL in the settings (gear icon)." }));
      return;
    }
    await proxyApi(req, res, apiBase.replace(/\/$/, ""));
  } else {
    await serveStatic(req, res);
  }
});

server.listen(PORT, () => {
  console.log(`IntentLang Playground: http://localhost:${PORT}`);
  console.log(`  AI proxy: /api/* (reads target from X-Api-Base header or AI_API_BASE env)`);
});
