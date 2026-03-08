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
  return !!(s.apiKey && s.apiKey.trim());
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
  if (!settings.apiKey) {
    throw new Error("No API key configured. Click the gear icon to add one.");
  }

  const base = (settings.apiBase || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = settings.model || "gpt-4o";

  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${settings.apiKey}`,
    },
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

  // Strip markdown fences if present
  content = content.replace(/^```\w*\n?/, "").replace(/\n?```$/, "").trim();

  return content;
}
