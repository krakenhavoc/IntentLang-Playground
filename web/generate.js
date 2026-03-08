const STORAGE_KEY = "intentlang-ai-settings";

export function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

export function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function hasApiKey() {
  const s = loadSettings();
  return !!(s.apiBase && s.apiBase.trim());
}

const SYSTEM_PROMPT = `You are an expert in IntentLang, a declarative specification language. Generate valid .intent specs from natural language descriptions.

Syntax reference:
- module ModuleName
- --- Doc comment
- entity Name { field: Type }
- action Name { param: Type  requires { conditions }  ensures { postconditions }  properties { key: value } }
- invariant Name { forall x: Type => predicate }
- edge_cases { when condition => action(args) }
- Types: UUID, String, Int, Decimal(precision: N), Bool, DateTime, CurrencyCode, Email, URL, List<T>, Set<T>, Map<K,V>, T?, A | B | C
- Operators: ==, !=, >, <, >=, <=, &&, ||, !, => (implies)
- old(expr) references pre-state in ensures blocks
- forall/exists quantifiers

Return ONLY the .intent source code, no markdown fences or explanation.`;

export async function generate(prompt) {
  const settings = loadSettings();
  if (!settings.apiBase) {
    throw new Error("No API URL configured. Click the gear icon to add one.");
  }

  const configuredBase = settings.apiBase.replace(/\/$/, "");
  const model = settings.model || "gpt-4o";

  // Route through /api proxy to avoid CORS. The proxy reads X-Api-Base
  // to know where to forward the request.
  const headers = {
    "Content-Type": "application/json",
    "X-Api-Base": configuredBase,
  };
  if (settings.apiKey) {
    headers["Authorization"] = `Bearer ${settings.apiKey}`;
  }

  const response = await fetch("/api/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  let content = data.choices?.[0]?.message?.content || "";

  // Extract intent source from LLM response.
  // LLMs often add explanatory text before/after fences despite instructions.
  content = extractIntentSource(content);

  return content;
}

function extractIntentSource(raw) {
  const trimmed = raw.trim();

  // Try to extract from a fenced code block anywhere in the output
  const fenceMatch = trimmed.match(/```\w*\n([\s\S]*?)```/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  // No fences — if there's text before "module", strip it
  const moduleIdx = trimmed.search(/^module\s/m);
  if (moduleIdx > 0) {
    return trimmed.slice(moduleIdx).trim();
  }

  return trimmed;
}
