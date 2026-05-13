import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  renderModuleInfo,
  renderDiff,
  renderViolations,
  renderCodegenCode,
  renderCodegenOpenapi,
} from "../web/render.js";

// Each rendered fragment is mounted into a real DOM and we assert no
// dangerous nodes (<script>, <img>, on*-attributes) were created. This
// catches escape gaps that a string-comparison test would miss.
function mount(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
}

function assertNoActiveContent(node) {
  expect(node.querySelectorAll("script").length).toBe(0);
  expect(node.querySelectorAll("img").length).toBe(0);
  expect(node.querySelectorAll("iframe").length).toBe(0);
  for (const el of node.querySelectorAll("*")) {
    for (const attr of el.attributes) {
      expect(attr.name.startsWith("on")).toBe(false);
    }
  }
}

describe("escapeHtml", () => {
  it("escapes the five HTML metacharacters", () => {
    expect(escapeHtml(`<script>"&'</script>`))
      .toBe("&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;");
  });

  it("coerces non-strings", () => {
    expect(escapeHtml(7)).toBe("7");
    expect(escapeHtml(null)).toBe("null");
    expect(escapeHtml(undefined)).toBe("undefined");
  });
});

describe("renderModuleInfo XSS", () => {
  it("escapes entity name", () => {
    const html = renderModuleInfo({
      entities: [{ name: `<img src=x onerror="alert(1)">`, fields: [] }],
      actions: [],
      invariants: [],
    });
    const node = mount(html);
    assertNoActiveContent(node);
    expect(node.textContent).toContain('<img src=x onerror="alert(1)">');
  });

  it("escapes field name and type", () => {
    const html = renderModuleInfo({
      entities: [{
        name: "Account",
        fields: [{ name: `</span><script>1</script>`, type: `<iframe>` }],
      }],
      actions: [],
      invariants: [],
    });
    const node = mount(html);
    assertNoActiveContent(node);
  });

  it("escapes action name, param name, and param type", () => {
    const html = renderModuleInfo({
      entities: [],
      actions: [{
        name: `<script>1</script>`,
        params: [{ name: `<img onerror=x>`, type: `<svg/>` }],
        precondition_count: 1,
        postcondition_count: 2,
      }],
      invariants: [],
    });
    const node = mount(html);
    assertNoActiveContent(node);
  });

  it("escapes invariant names", () => {
    const html = renderModuleInfo({
      entities: [],
      actions: [],
      invariants: [`<img src=x onerror=alert(1)>`],
    });
    const node = mount(html);
    assertNoActiveContent(node);
  });

  it("handles null/missing fields gracefully", () => {
    expect(renderModuleInfo(null)).toBe("");
    expect(renderModuleInfo({})).toBe("");
  });
});

describe("renderDiff XSS", () => {
  it("escapes top-level keys", () => {
    const html = renderDiff({}, { "<script>k</script>": 1 });
    const node = mount(`<pre>${html}</pre>`);
    assertNoActiveContent(node);
  });

  it("escapes nested object keys", () => {
    const html = renderDiff(
      { account: { balance: 100 } },
      { account: { "<img src=x onerror=alert(1)>": 200, balance: 100 } },
    );
    const node = mount(`<pre>${html}</pre>`);
    assertNoActiveContent(node);
  });

  it("escapes JSON-encoded string values that look like markup", () => {
    const html = renderDiff(
      { name: "old" },
      { name: "<img src=x onerror=alert(1)>" },
    );
    const node = mount(`<pre>${html}</pre>`);
    assertNoActiveContent(node);
  });

  it("handles a missing inputParams (no old value)", () => {
    const html = renderDiff(null, { x: 1 });
    expect(html).toContain('"x": 1');
  });
});

describe("renderViolations XSS", () => {
  it("escapes kind and message", () => {
    const html = renderViolations([
      { kind: "<script>k</script>", message: "<img onerror=x>" },
    ]);
    const node = mount(html);
    assertNoActiveContent(node);
  });
});

describe("renderCodegenCode XSS", () => {
  it("escapes filename and code", () => {
    const html = renderCodegenCode({
      filename: `<script>1</script>.rs`,
      code: `<img src=x onerror=alert(1)>`,
      lang: "rust",
    });
    const node = mount(html);
    assertNoActiveContent(node);
  });

  it("escapes an unknown lang label", () => {
    const html = renderCodegenCode({
      filename: "a.txt",
      code: "ok",
      lang: `<script>1</script>`,
    });
    const node = mount(html);
    assertNoActiveContent(node);
  });
});

describe("renderCodegenOpenapi XSS", () => {
  it("escapes JSON string containing markup", () => {
    const json = JSON.stringify({ x: "<img src=x onerror=alert(1)>" });
    const html = renderCodegenOpenapi(json);
    const node = mount(html);
    assertNoActiveContent(node);
  });
});
