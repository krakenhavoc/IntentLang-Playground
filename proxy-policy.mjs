// Proxy target & origin policy for the playground's /api/* relay.
//
// The relay forwards an Authorization header (the user's AI key) to a target
// URL the browser supplied via X-Api-Base. Without these checks anyone on
// the internet can use the deployed Pages Function as an unauthenticated
// open proxy — to laundering requests through your origin, to reaching
// cloud metadata endpoints (SSRF), or to abusing third-party AI APIs.
//
// The validators here are intentionally small and pure so they can be
// unit-tested independently of Cloudflare or Node runtimes.

// Suffix-matched allowlist of upstream API hostnames.
// Entries with a leading `.` match subdomains and the bare suffix.
// Entries without a leading `.` must match the hostname exactly.
export const DEFAULT_UPSTREAM_ALLOWLIST = Object.freeze([
  "api.openai.com",
  ".openai.azure.com",
  ".cognitiveservices.azure.com",
  "api.anthropic.com",
  "generativelanguage.googleapis.com",
  "api.together.xyz",
  "api.groq.com",
  "api.mistral.ai",
  "api.perplexity.ai",
  "api.deepseek.com",
  "openrouter.ai",
]);

// Loopback hostnames permitted only when allowLoopback is true (dev server).
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Validate a user-supplied upstream URL against the proxy policy.
 *
 * @param {string} rawUrl  The candidate target URL (X-Api-Base + path).
 * @param {object} [opts]
 * @param {string[]} [opts.allowlist=DEFAULT_UPSTREAM_ALLOWLIST]
 * @param {boolean} [opts.allowLoopback=false]
 *   When true, permits http(s)://localhost, 127.0.0.0/8, and [::1] so
 *   the local dev server can hit Ollama/LM Studio/etc.
 * @returns {{ok: true, url: URL} | {ok: false, reason: string}}
 */
export function validateUpstream(rawUrl, opts = {}) {
  const allowlist = opts.allowlist || DEFAULT_UPSTREAM_ALLOWLIST;
  const allowLoopback = opts.allowLoopback === true;

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "invalid URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "only http/https targets are allowed" };
  }

  // URL.hostname keeps IPv6 brackets in Node and modern browsers; strip
  // them so the comparisons below see "::1" rather than "[::1]".
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  // Literal IP address: only loopback is ever permitted, and only in dev.
  // This rejects link-local (169.254.x.x → AWS/Azure/GCP metadata),
  // RFC1918 (10/8, 172.16/12, 192.168/16), 0.0.0.0, and public IPs that
  // would otherwise sidestep the hostname allowlist.
  if (isIpLiteral(host)) {
    if (allowLoopback && isLoopbackIp(host)) return { ok: true, url };
    return { ok: false, reason: `IP literal ${host} is not allowed` };
  }

  // Hostname loopback (dev only).
  if (LOOPBACK_HOSTNAMES.has(host)) {
    if (allowLoopback) return { ok: true, url };
    return { ok: false, reason: `loopback host ${host} is not allowed here` };
  }

  // Public hosts must use HTTPS.
  if (url.protocol !== "https:") {
    return { ok: false, reason: "public upstreams must use https" };
  }

  // Suffix allowlist match.
  for (const entry of allowlist) {
    if (entry.startsWith(".")) {
      const suffix = entry.slice(1);
      if (host === suffix || host.endsWith(entry)) {
        return { ok: true, url };
      }
    } else if (host === entry) {
      return { ok: true, url };
    }
  }

  return { ok: false, reason: `host ${host} is not in the allowlist` };
}

/**
 * Validate the browser's Origin header against the frontend allowlist.
 * Returns the matching origin string (for CORS echo) or null to reject.
 *
 * @param {string | null} origin  Value of the Origin header.
 * @param {object} [opts]
 * @param {boolean} [opts.allowLoopback=false]
 * @param {string[]} [opts.extraFrontends=[]]
 *   Additional exact hostnames to permit (e.g. a custom domain).
 * @returns {string | null}
 */
export function validateFrontendOrigin(origin, opts = {}) {
  if (!origin) return null;
  const allowLoopback = opts.allowLoopback === true;
  const extras = new Set(opts.extraFrontends || []);

  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (allowLoopback && LOOPBACK_HOSTNAMES.has(host)) return origin;
  if (host === "intentlang-playground.pages.dev") return origin;
  if (host.endsWith(".intentlang-playground.pages.dev")) return origin;
  if (extras.has(host)) return origin;
  return null;
}

function isIpLiteral(host) {
  // IPv4 dotted quad (URL parser keeps this verbatim).
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  // IPv6: URL.hostname strips brackets, leaving colons.
  if (host.includes(":")) return true;
  return false;
}

function isLoopbackIp(host) {
  if (host === "::1") return true;
  // 127.0.0.0/8
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}
