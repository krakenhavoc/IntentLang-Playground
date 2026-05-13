// Integration tests for the Cloudflare Pages Function. Exercises the
// full request handler with mocked env (no real fetch to upstreams).

import { describe, it, expect } from "vitest";
import { onRequest } from "../functions/api/[[path]].js";

const ORIGIN_OK = "https://intentlang-playground.pages.dev";

// We don't go through `new Request()` because the fetch spec lists Origin
// on the forbidden header list — undici (Node's fetch) strips it from any
// Request a script constructs. In the Cloudflare runtime the platform
// delivers Origin verbatim to onRequest, so a request-shaped duck type
// reproduces the real call shape more faithfully than a stripped Request.
function makeRequest(method, path, headers = {}, body) {
  return {
    method,
    url: `https://intentlang-playground.pages.dev${path}`,
    headers: new Headers(headers),
    body: body !== undefined ? body : (method === "POST" ? "{}" : undefined),
  };
}

describe("CF function — origin handling", () => {
  it("returns 403 on OPTIONS from an unknown origin", async () => {
    const res = await onRequest({
      request: makeRequest("OPTIONS", "/api/v1/chat/completions", { "Origin": "https://attacker.example.com" }),
      env: {},
    });
    expect(res.status).toBe(403);
  });

  it("returns CORS-locked OPTIONS preflight for allowed origin", async () => {
    const res = await onRequest({
      request: makeRequest("OPTIONS", "/api/v1/chat/completions", { "Origin": ORIGIN_OK }),
      env: {},
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN_OK);
    expect(res.headers.get("Vary")).toBe("Origin");
  });

  it("accepts a preview-deploy subdomain origin", async () => {
    const origin = "https://deadbeef.intentlang-playground.pages.dev";
    const res = await onRequest({
      request: makeRequest("OPTIONS", "/api/v1/chat/completions", { "Origin": origin }),
      env: {},
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(origin);
  });

  it("rejects cross-origin POST", async () => {
    const res = await onRequest({
      request: makeRequest("POST", "/api/v1/chat/completions", {
        "Origin": "https://attacker.example.com",
        "X-Api-Base": "https://api.openai.com",
      }),
      env: {},
    });
    expect(res.status).toBe(403);
  });
});

describe("CF function — upstream allowlist", () => {
  it("rejects unknown upstream host", async () => {
    const res = await onRequest({
      request: makeRequest("POST", "/api/v1/chat/completions", {
        "X-Api-Base": "https://evil.example.com",
      }),
      env: {},
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/allowlist/);
  });

  it("rejects SSRF to IMDS (169.254.169.254)", async () => {
    const res = await onRequest({
      request: makeRequest("POST", "/api/latest/meta-data/", {
        "X-Api-Base": "http://169.254.169.254",
      }),
      env: {},
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/IP literal/);
  });

  it("rejects http on public hosts", async () => {
    const res = await onRequest({
      request: makeRequest("POST", "/api/v1/chat/completions", {
        "X-Api-Base": "http://api.openai.com",
      }),
      env: {},
    });
    expect(res.status).toBe(400);
  });

  it("rejects suffix-spoofing of allowlisted hosts", async () => {
    const res = await onRequest({
      request: makeRequest("POST", "/api/v1/chat/completions", {
        "X-Api-Base": "https://api.openai.com.attacker.com",
      }),
      env: {},
    });
    expect(res.status).toBe(400);
  });

  it("returns 503 when X-Api-Base is missing", async () => {
    const res = await onRequest({
      request: makeRequest("POST", "/api/v1/chat/completions"),
      env: {},
    });
    expect(res.status).toBe(503);
  });
});

describe("CF function — rate limiting", () => {
  it("returns 429 with Retry-After when the limiter denies", async () => {
    const env = {
      RATE_LIMITER: { limit: async () => ({ success: false }) },
    };
    const res = await onRequest({
      request: makeRequest("POST", "/api/v1/chat/completions", {
        "X-Api-Base": "https://api.openai.com",
        "CF-Connecting-IP": "1.2.3.4",
      }),
      env,
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
  });

  it("keys rate limit on CF-Connecting-IP when present", async () => {
    const seen = [];
    const env = {
      RATE_LIMITER: {
        limit: async ({ key }) => {
          seen.push(key);
          return { success: true };
        },
      },
    };
    await onRequest({
      request: makeRequest("POST", "/api/v1/chat/completions", {
        "X-Api-Base": "https://evil.example.com", // rejected after limit check
        "CF-Connecting-IP": "203.0.113.5",
      }),
      env,
    });
    expect(seen).toEqual(["203.0.113.5"]);
  });

  it("fails closed if the limiter itself throws", async () => {
    const env = {
      RATE_LIMITER: {
        limit: async () => { throw new Error("kaboom"); },
      },
    };
    const res = await onRequest({
      request: makeRequest("POST", "/api/v1/chat/completions", {
        "X-Api-Base": "https://api.openai.com",
      }),
      env,
    });
    expect(res.status).toBe(503);
  });

  it("skips rate limiting when binding is absent (wrangler dev)", async () => {
    const res = await onRequest({
      request: makeRequest("POST", "/api/v1/chat/completions", {
        "X-Api-Base": "https://evil.example.com",
      }),
      env: {},
    });
    // No rate-limit denial; the request still fails the allowlist check.
    expect(res.status).toBe(400);
  });
});
