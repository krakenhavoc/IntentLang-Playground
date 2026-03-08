// Cloudflare Pages Function: proxy /api/* requests to the AI API base URL.
// Reads the target from the X-Api-Base request header.

export async function onRequest(context) {
  const { request } = context;

  const apiBase = request.headers.get("X-Api-Base");
  if (!apiBase) {
    return new Response(
      JSON.stringify({ error: "No API base configured. Enter your API URL in the settings (gear icon)." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  // Build target URL: strip /api prefix, append to configured base
  const url = new URL(request.url);
  const targetPath = url.pathname.replace(/^\/api/, "");
  const targetUrl = `${apiBase.replace(/\/$/, "")}${targetPath}${url.search}`;

  // Forward headers, stripping proxy-specific and host headers
  const headers = new Headers(request.headers);
  headers.delete("X-Api-Base");
  headers.set("Host", new URL(targetUrl).host);

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
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
}
