// Cloudflare Pages Function: proxy /api/* requests to the AI API base URL.
// Reads the target from the X-Api-Base request header.

export async function onRequest(context) {
  const { request } = context;

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Base",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const apiBase = request.headers.get("X-Api-Base");
  if (!apiBase) {
    return new Response(
      JSON.stringify({ error: "No API base configured. Enter your API URL in the settings (gear icon)." }),
      { status: 503, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } },
    );
  }

  // Build target URL: strip /api prefix, append to configured base
  const url = new URL(request.url);
  const targetPath = url.pathname.replace(/^\/api/, "");
  const targetUrl = `${apiBase.replace(/\/$/, "")}${targetPath}${url.search}`;

  // Only forward essential headers — strip browser-specific headers
  // that cause upstream APIs to reject requests
  const headers = new Headers();
  const authorization = request.headers.get("Authorization");
  if (authorization) headers.set("Authorization", authorization);
  headers.set("Content-Type", request.headers.get("Content-Type") || "application/json");
  headers.set("Accept", "application/json");

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
    });

    // Forward response with CORS headers
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("Access-Control-Allow-Origin", "*");

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: `Proxy error: ${e.message}` }),
      { status: 502, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } },
    );
  }
}
