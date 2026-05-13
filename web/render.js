// Pure rendering helpers. No DOM access — these return HTML strings.
// Centralized so XSS-sensitive interpolations of user-controlled values
// (entity/field/action/invariant names coming back from WASM `inspect`,
// codegen filenames derived from module names, etc.) can be unit-tested
// in isolation. Every interpolation goes through escapeHtml.

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderModuleInfo(info) {
  if (!info) return "";
  let html = "";

  for (const entity of info.entities || []) {
    html += `<div class="module-entity">`;
    html += `<span class="entity-name">entity ${escapeHtml(entity.name)}</span>`;
    html += `<div class="field-list">`;
    for (const f of entity.fields || []) {
      html += `<div><span class="field-name">${escapeHtml(f.name)}</span>: <span class="field-type">${escapeHtml(f.type)}</span></div>`;
    }
    html += `</div></div>`;
  }

  for (const action of info.actions || []) {
    html += `<div class="module-action">`;
    html += `<span class="action-name">action ${escapeHtml(action.name)}</span>`;
    html += `<div class="field-list">`;
    for (const p of action.params || []) {
      html += `<div><span class="field-name">${escapeHtml(p.name)}</span>: <span class="field-type">${escapeHtml(p.type)}</span></div>`;
    }
    html += `</div>`;
    html += `<div class="counts">${escapeHtml(action.precondition_count)} requires, ${escapeHtml(action.postcondition_count)} ensures</div>`;
    html += `</div>`;
  }

  for (const inv of info.invariants || []) {
    html += `<div class="module-invariant"><span class="invariant-name">invariant ${escapeHtml(inv)}</span></div>`;
  }

  return html;
}

export function renderDiff(inputParams, outputParams) {
  const lines = [];
  lines.push("{");
  const keys = Object.keys(outputParams);
  for (let ki = 0; ki < keys.length; ki++) {
    const key = keys[ki];
    const newVal = outputParams[key];
    const oldVal = inputParams ? inputParams[key] : undefined;
    const comma = ki < keys.length - 1 ? "," : "";
    const escKey = escapeHtml(key);

    if (
      typeof newVal === "object" && newVal !== null &&
      typeof oldVal === "object" && oldVal !== null
    ) {
      lines.push(`  "${escKey}": {`);
      const fieldKeys = Object.keys(newVal);
      for (let fi = 0; fi < fieldKeys.length; fi++) {
        const fk = fieldKeys[fi];
        const escFk = escapeHtml(fk);
        const fComma = fi < fieldKeys.length - 1 ? "," : "";
        const nv = JSON.stringify(newVal[fk]);
        const ov = oldVal[fk] !== undefined ? JSON.stringify(oldVal[fk]) : undefined;
        if (ov !== undefined && ov !== nv) {
          lines.push(`    <span class="old-value">"${escFk}": ${escapeHtml(ov)}</span>`);
          lines.push(`    <span class="new-value">"${escFk}": ${escapeHtml(nv)}${fComma}</span>`);
        } else {
          lines.push(`    "${escFk}": ${escapeHtml(nv)}${fComma}`);
        }
      }
      lines.push(`  }${comma}`);
    } else {
      lines.push(`  "${escKey}": ${escapeHtml(JSON.stringify(newVal))}${comma}`);
    }
  }
  lines.push("}");
  return lines.join("\n");
}

export function renderViolations(violations) {
  let html = '<div class="response-fail">';
  for (const v of violations) {
    html += `<div class="violation">`;
    html += `<span class="violation-kind">${escapeHtml(v.kind)}</span> `;
    html += escapeHtml(v.message);
    html += `</div>`;
  }
  html += "</div>";
  return html;
}

const LANG_LABELS = {
  rust: "Rust",
  typescript: "TypeScript",
  python: "Python",
  go: "Go",
  java: "Java",
  csharp: "C#",
  swift: "Swift",
};

export function renderCodegenCode({ code, filename, lang }) {
  const label = LANG_LABELS[lang] || lang;
  return (
    `<div class="codegen-header">` +
    `<span class="codegen-filename">${escapeHtml(filename)}</span>` +
    `<span class="codegen-lang-label">${escapeHtml(label)}</span>` +
    `</div>` +
    `<pre class="codegen-code">${escapeHtml(code)}</pre>`
  );
}

export function renderCodegenOpenapi(json) {
  return (
    `<div class="codegen-header">` +
    `<span class="codegen-filename">openapi.json</span>` +
    `<span class="codegen-lang-label">OpenAPI 3.0</span>` +
    `</div>` +
    `<pre class="codegen-code">${escapeHtml(json)}</pre>`
  );
}
