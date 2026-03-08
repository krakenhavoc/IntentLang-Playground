let wasm = null;

export async function initWasm() {
  const mod = await import("./pkg/playground_wasm.js");
  await mod.default();
  wasm = mod;
}

export function checkSource(source) {
  if (!wasm) throw new Error("WASM not loaded");
  return JSON.parse(wasm.check(source));
}

export function executeAction(source, requestJson) {
  if (!wasm) throw new Error("WASM not loaded");
  return JSON.parse(wasm.execute(source, JSON.stringify(requestJson)));
}

export function inspectModule(source) {
  if (!wasm) throw new Error("WASM not loaded");
  return JSON.parse(wasm.inspect(source));
}

export function formatSource(source) {
  if (!wasm) throw new Error("WASM not loaded");
  return wasm.fmt(source);
}

export function generateCode(source, lang) {
  if (!wasm) throw new Error("WASM not loaded");
  return JSON.parse(wasm.codegen(source, lang));
}

export function generateOpenApi(source) {
  if (!wasm) throw new Error("WASM not loaded");
  return JSON.parse(wasm.openapi(source));
}

export function generateTestHarness(source, lang) {
  if (!wasm) throw new Error("WASM not loaded");
  return JSON.parse(wasm.test_harness(source, lang));
}

export function isReady() {
  return wasm !== null;
}
