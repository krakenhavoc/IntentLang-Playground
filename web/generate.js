const STORAGE_KEY = "intentlang-ai-settings";
const MAX_RETRIES = 2;

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

const SYSTEM_PROMPT = `You are an IntentLang specification generator. Your job is to translate natural language descriptions into valid .intent specification files. You produce ONLY raw .intent source code — no markdown fences, no explanations, no commentary.

# IntentLang Syntax Reference

IntentLang is a declarative specification language. It is NOT a general-purpose programming language. There are no functions, no import statements, no return statements, no loops, no variable assignments. You define entities (data), actions (operations with pre/postconditions), invariants (universal rules), and edge cases.

## Structure
Every file starts with \`module ModuleName\` (PascalCase). An optional doc block may follow, then top-level items (entities, actions, invariants, edge_cases).

Documentation blocks use \`---\` as a LINE PREFIX (not a separator). Each doc line must start with \`--- \` followed by text on the SAME line. Example:
--- This is a doc line.
--- This is another doc line.

WRONG (do NOT do this):
---
This text is NOT a doc block, it will cause parse errors.
---

## Entities
entity Account {
  id: UUID
  owner: String
  balance: Decimal(precision: 2)
  status: Active | Frozen | Closed
  created_at: DateTime
  email: Email?
}

## Actions
action Transfer {
  --- Move funds between accounts.
  from: Account
  to: Account
  amount: Decimal(precision: 2)

  requires {
    from.status == Active
    to.status == Active
    amount > 0
    from.balance >= amount
  }

  ensures {
    from.balance == old(from.balance) - amount
    to.balance == old(to.balance) + amount
  }

  properties {
    idempotent: true
    atomic: true
  }
}

## Invariants
invariant NoNegativeBalances {
  forall a: Account => a.balance >= 0
}

## Edge Cases
edge_cases {
  when amount > 10000 => require_approval(level: "manager")
  when from.id == to.id => reject("Cannot transfer to same account")
}

## Types
- Primitives: UUID, String, Int, Decimal(precision: N), Bool, DateTime
- Domain types: CurrencyCode, Email, URL
- Collections: List<T>, Set<T>, Map<K, V>
- Optional: T? (nullable)
- Union: Active | Frozen | Closed (enum-like labels, NOT type references)

## Operators
- Comparison: ==, !=, >, <, >=, <=
- Logical: &&, ||, !, => (implies)
- Quantifiers: forall x: Type => predicate, exists x: Type => predicate
- State: old(expr) — value before action execution (only in ensures blocks)
- Arithmetic: +, -, *, /

## Critical Rules
- \`---\` is a LINE PREFIX, not a separator. Write \`--- text here\` NOT \`---\` on its own line
- Each requires/ensures condition goes on its OWN LINE — no semicolons, no commas
- Union variants (Active, Frozen, etc.) are bare identifiers, NOT quoted strings
- old() is ONLY valid inside \`ensures\` blocks
- forall/exists bind a variable to an entity or action type defined in the same file
- properties values can be: true, false, quoted strings, or numbers
- There is NO \`fn\`, \`let\`, \`return\`, \`if/else\`, \`match\`, or \`!\` (negation) operator on expressions
- Do NOT wrap output in markdown code fences
- Do NOT use \`!(expr)\` — there is no negation operator in IntentLang

# Generation Rules
1. Always start with \`module ModuleName\`.
2. Add a \`---\` documentation block after the module declaration.
3. Define entities for all domain objects mentioned or implied.
4. Define actions for all operations described.
5. Add \`requires\` blocks for preconditions and \`ensures\` blocks for postconditions.
6. Add \`invariant\` blocks for domain rules that must always hold.
7. Add \`edge_cases\` for error handling and boundary conditions.
8. Use appropriate types — prefer specific types (Email, URL, CurrencyCode) over String.
9. Use union types for status fields and enums (e.g., Active | Inactive).
10. Every field must have a type. Every entity/action must have at least one field.`;

const RETRY_HINTS = `Common mistakes to avoid:
- \`---\` is a LINE PREFIX, not a separator. Write \`--- text here\` NOT \`---\` alone on a line
- Do NOT use fn/let/return/if-else — IntentLang has none of these
- Do NOT wrap output in markdown code fences
- Do NOT use \`!(expr)\` — there is no negation operator
- Each requires/ensures condition must be on its own line
- Union variants are bare identifiers (Active, not "Active")
- old() is only valid inside ensures blocks`;

/**
 * Generate an IntentLang spec from a natural language prompt.
 * @param {string} prompt - The user's description
 * @param {function} validate - A function(source) that returns {ok, diagnostics} (from WASM check)
 * @param {function} onStatus - Optional callback for status updates
 */
export async function generate(prompt, validate, onStatus) {
  const settings = loadSettings();
  if (!settings.apiBase) {
    throw new Error("No API URL configured. Click the gear icon to add one.");
  }

  const configuredBase = settings.apiBase.replace(/\/$/, "");
  const model = settings.model || "gpt-4o";

  const headers = {
    "Content-Type": "application/json",
    "X-Api-Base": configuredBase,
  };
  if (settings.apiKey) {
    headers["Authorization"] = `Bearer ${settings.apiKey}`;
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Generate an IntentLang specification for the following:\n\n${prompt}\n\nRespond with ONLY the .intent file content. No explanation, no markdown fences.` },
  ];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      onStatus?.(`Retry ${attempt}/${MAX_RETRIES}...`);
    }

    const response = await fetch("/api/chat/completions", {
      method: "POST",
      headers,
      body: JSON.stringify({ model, messages, temperature: 0.3 }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API error ${response.status}: ${text}`);
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || "";
    const spec = extractIntentSource(raw);

    // If no validate function, return as-is (best effort)
    if (!validate) return spec;

    const result = validate(spec);
    if (result.ok) return spec;

    // Validation failed — retry with error feedback
    const errors = result.diagnostics.map((d) => d.message).join("\n");

    if (attempt < MAX_RETRIES) {
      messages.push({ role: "assistant", content: raw });
      messages.push({
        role: "user",
        content: `The generated spec has validation errors:\n\n${errors}\n\n${RETRY_HINTS}\n\nFix the errors and respond with ONLY the corrected .intent file content. No explanation, no markdown fences.`,
      });
    } else {
      // Final attempt failed — return what we have, let the user see the errors
      return spec;
    }
  }
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
