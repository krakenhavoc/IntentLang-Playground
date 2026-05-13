import { describe, it, expect } from "vitest";
import {
  validateUpstream,
  validateFrontendOrigin,
  DEFAULT_UPSTREAM_ALLOWLIST,
} from "../proxy-policy.mjs";

describe("validateUpstream — allowlisted hosts", () => {
  it.each([
    "https://api.openai.com/v1/chat/completions",
    "https://api.anthropic.com/v1/messages",
    "https://generativelanguage.googleapis.com/v1beta/models",
    "https://api.together.xyz/v1/chat/completions",
    "https://api.groq.com/openai/v1/chat/completions",
    "https://api.mistral.ai/v1/chat/completions",
    "https://api.perplexity.ai/chat/completions",
    "https://api.deepseek.com/v1/chat/completions",
    "https://openrouter.ai/api/v1/chat/completions",
  ])("accepts %s", (u) => {
    expect(validateUpstream(u).ok).toBe(true);
  });

  it("accepts Azure OpenAI deployments via subdomain match", () => {
    expect(validateUpstream("https://my-resource.openai.azure.com/openai/deployments/foo").ok).toBe(true);
    expect(validateUpstream("https://my-resource.cognitiveservices.azure.com/").ok).toBe(true);
  });

  it("accepts the bare suffix as well as subdomains", () => {
    expect(validateUpstream("https://openai.azure.com/").ok).toBe(true);
  });
});

describe("validateUpstream — rejected hosts", () => {
  it("rejects suffix-spoofing", () => {
    const r = validateUpstream("https://api.openai.com.attacker.com/v1");
    expect(r.ok).toBe(false);
  });

  it("rejects unrelated hosts", () => {
    expect(validateUpstream("https://evil.example.com/v1/chat").ok).toBe(false);
  });

  it("rejects http:// for public hosts", () => {
    expect(validateUpstream("http://api.openai.com/v1").ok).toBe(false);
  });

  it("rejects non-http schemes", () => {
    expect(validateUpstream("file:///etc/passwd").ok).toBe(false);
    expect(validateUpstream("gopher://api.openai.com/").ok).toBe(false);
  });

  it("rejects garbage URLs", () => {
    expect(validateUpstream("not a url").ok).toBe(false);
    expect(validateUpstream("").ok).toBe(false);
  });
});

describe("validateUpstream — IP literals", () => {
  it("rejects link-local IMDS (169.254.169.254)", () => {
    const r = validateUpstream("http://169.254.169.254/latest/meta-data/");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/IP literal/);
  });

  it("rejects RFC1918 private addresses even with allowLoopback", () => {
    expect(validateUpstream("http://10.0.0.5/", { allowLoopback: true }).ok).toBe(false);
    expect(validateUpstream("http://192.168.1.1/", { allowLoopback: true }).ok).toBe(false);
    expect(validateUpstream("http://172.16.0.1/", { allowLoopback: true }).ok).toBe(false);
  });

  it("rejects 0.0.0.0", () => {
    expect(validateUpstream("http://0.0.0.0/", { allowLoopback: true }).ok).toBe(false);
  });

  it("rejects public IPs even when allowlisted host resolves there", () => {
    expect(validateUpstream("https://8.8.8.8/v1").ok).toBe(false);
  });

  it("rejects IPv6 link-local even with allowLoopback", () => {
    expect(validateUpstream("http://[fe80::1]/", { allowLoopback: true }).ok).toBe(false);
  });
});

describe("validateUpstream — loopback (dev server only)", () => {
  it("rejects loopback hostnames by default", () => {
    expect(validateUpstream("http://localhost:11434/v1").ok).toBe(false);
    expect(validateUpstream("http://127.0.0.1:11434/v1").ok).toBe(false);
  });

  it("accepts localhost when allowLoopback=true", () => {
    expect(validateUpstream("http://localhost:11434/v1", { allowLoopback: true }).ok).toBe(true);
    expect(validateUpstream("http://127.0.0.1:11434/v1", { allowLoopback: true }).ok).toBe(true);
  });

  it("accepts 127.x.x.x range when allowLoopback=true", () => {
    expect(validateUpstream("http://127.5.5.5/", { allowLoopback: true }).ok).toBe(true);
  });

  it("accepts [::1] when allowLoopback=true", () => {
    expect(validateUpstream("http://[::1]:11434/", { allowLoopback: true }).ok).toBe(true);
  });
});

describe("validateFrontendOrigin", () => {
  it("accepts the production Pages origin", () => {
    expect(validateFrontendOrigin("https://intentlang-playground.pages.dev")).toBeTruthy();
  });

  it("accepts deploy preview subdomains", () => {
    expect(validateFrontendOrigin("https://abc123.intentlang-playground.pages.dev")).toBeTruthy();
  });

  it("rejects other origins", () => {
    expect(validateFrontendOrigin("https://attacker.example.com")).toBeNull();
    expect(validateFrontendOrigin("https://intentlang-playground.pages.dev.attacker.com")).toBeNull();
  });

  it("rejects missing or malformed origins", () => {
    expect(validateFrontendOrigin(null)).toBeNull();
    expect(validateFrontendOrigin("")).toBeNull();
    expect(validateFrontendOrigin("not a url")).toBeNull();
  });

  it("accepts localhost only when allowLoopback=true", () => {
    expect(validateFrontendOrigin("http://localhost:8080")).toBeNull();
    expect(validateFrontendOrigin("http://localhost:8080", { allowLoopback: true })).toBeTruthy();
  });

  it("honors extraFrontends", () => {
    expect(validateFrontendOrigin("https://custom.example.com", { extraFrontends: ["custom.example.com"] })).toBeTruthy();
  });
});

describe("DEFAULT_UPSTREAM_ALLOWLIST", () => {
  it("is frozen", () => {
    expect(Object.isFrozen(DEFAULT_UPSTREAM_ALLOWLIST)).toBe(true);
  });
});
