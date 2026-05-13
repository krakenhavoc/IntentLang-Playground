// Cloudflare Pages Function: proxy /api/* requests to the AI API base URL.
// Validates the target host against an allowlist (proxy-policy.mjs),
// blocks IP literals and SSRF vectors, locks CORS to the Pages origin,
// and rate-limits per client IP via the bound `RATE_LIMITER` ratelimit
// resource (see wrangler.toml).

import { validateUpstream, validateFrontendOrigin } from "../../proxy-policy.mjs";

const PUBLIC_CORS_HEADERS = (origin) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Base",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
});

function jsonResponse(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const origin = request.headers.get("Origin");
  const allowedOrigin = validateFrontendOrigin(origin);

  // CORS preflight — only respond positively for allowed origins.
  if (request.method === "OPTIONS") {
    if (!allowedOrigin) {
      return new Response(null, { status: 403 });
    }
    return new Response(null, { headers: PUBLIC_CORS_HEADERS(allowedOrigin) });
  }

  // Same-origin requests don't send Origin; cross-origin requests must
  // come from a frontend we recognise.
  if (origin && !allowedOrigin) {
    return jsonResponse({ error: "origin not allowed" }, 403);
  }

  const corsHeaders = allowedOrigin ? PUBLIC_CORS_HEADERS(allowedOrigin) : {};

  // Rate limit per client IP. The binding is optional so wrangler dev
  // setups without rate-limit configuration still work.
  if (env && env.RATE_LIMITER) {
    const ip = request.headers.get("CF-Connecting-IP")
      || request.headers.get("X-Forwarded-For")
      || "unknown";
    try {
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) {
        return jsonResponse(
          { error: "rate limit exceeded" },
          429,
          { ...corsHeaders, "Retry-After": "60" },
        );
      }
    } catch (e) {
      // If the rate-limit call itself fails, fail closed: it's a
      // security control, not a UX feature.
      return jsonResponse(
        { error: `rate limiter unavailable: ${e.message}` },
        503,
        corsHeaders,
      );
    }
  }

  const apiBase = request.headers.get("X-Api-Base");
  if (!apiBase) {
    return jsonResponse(
      { error: "No API base configured. Enter your API URL in the settings (gear icon)." },
      503,
      corsHeaders,
    );
  }

  // Build target URL and validate against the allowlist BEFORE any fetch.
  const url = new URL(request.url);
  const targetPath = url.pathname.replace(/^\/api/, "");
  const candidate = `${apiBase.replace(/\/$/, "")}${targetPath}${url.search}`;
  const check = validateUpstream(candidate);
  if (!check.ok) {
    return jsonResponse(
      { error: `upstream rejected: ${check.reason}` },
      400,
      corsHeaders,
    );
  }

  // Forward only essential headers — strip browser-specific headers
  // that cause upstream APIs to reject requests.
  const headers = new Headers();
  const authorization = request.headers.get("Authorization");
  if (authorization) headers.set("Authorization", authorization);
  headers.set("Content-Type", request.headers.get("Content-Type") || "application/json");
  headers.set("Accept", "application/json");

  try {
    const response = await fetch(check.url.toString(), {
      method: request.method,
      headers,
      body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
    });

    const responseHeaders = new Headers(response.headers);
    for (const [k, v] of Object.entries(corsHeaders)) responseHeaders.set(k, v);
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (e) {
    return jsonResponse({ error: `Proxy error: ${e.message}` }, 502, corsHeaders);
  }
}
