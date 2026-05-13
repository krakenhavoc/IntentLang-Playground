import { createEditor, createJsonEditor, setEditorValue } from "./editor.bundle.js";
import { initWasm, checkSource, executeAction, inspectModule, formatSource, generateCode, generateOpenApi, isReady } from "./runtime.js";
import { EXAMPLES } from "./examples.js";
import { loadSettings, saveSettings, hasApiKey, generate } from "./generate.js";
import {
  escapeHtml,
  renderModuleInfo,
  renderDiff,
  renderViolations,
  renderCodegenCode,
  renderCodegenOpenapi,
} from "./render.js";

// DOM refs
const statusEl = document.getElementById("status");
const diagnosticsEl = document.getElementById("diagnostics");
const moduleInfoEl = document.getElementById("module-info");
const actionSelectEl = document.getElementById("action-select");
const subExamplesEl = document.getElementById("sub-examples");
const responseEl = document.getElementById("response");
const examplesSelectEl = document.getElementById("examples-select");
const btnCheck = document.getElementById("btn-check");
const btnFormat = document.getElementById("btn-format");
const btnExecute = document.getElementById("btn-execute");
const btnGenerate = document.getElementById("btn-generate");
const generateInput = document.getElementById("generate-input");
const btnSettings = document.getElementById("btn-settings");
const settingsModal = document.getElementById("settings-modal");
const btnSettingsSave = document.getElementById("btn-settings-save");
const btnSettingsCancel = document.getElementById("btn-settings-cancel");
const codegenLangEl = document.getElementById("codegen-lang");
const btnCodegen = document.getElementById("btn-codegen");
const btnOpenapi = document.getElementById("btn-openapi");
const codegenTabsEl = document.getElementById("codegen-tabs");
const codegenOutputEl = document.getElementById("codegen-output");

// State
let specEditor = null;
let requestEditor = null;
let currentSource = "";
let currentModuleInfo = null;
let currentExample = null;
let checkTimer = null;
let codegenResults = { code: null, openapi: null };
let activeCodegenTab = "code";

// Initialize
async function init() {
  try {
    await initWasm();
    statusEl.textContent = "Ready";
    statusEl.className = "status ready";
    enableUI();
  } catch (e) {
    statusEl.textContent = "WASM load failed";
    statusEl.className = "status error";
    console.error("WASM init failed:", e);
    return;
  }

  // Populate examples dropdown
  EXAMPLES.forEach((ex, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = ex.name;
    examplesSelectEl.appendChild(opt);
  });

  // Create editors
  specEditor = createEditor(
    document.getElementById("editor"),
    "",
    onSourceChange,
  );

  requestEditor = createJsonEditor(
    document.getElementById("request-editor"),
    "{}",
    null,
  );

  // Load first example
  loadExample(0);

  // Wire events
  examplesSelectEl.addEventListener("change", (e) => {
    if (e.target.value !== "") loadExample(parseInt(e.target.value));
  });
  btnCheck.addEventListener("click", runCheck);
  btnFormat.addEventListener("click", runFormat);
  btnExecute.addEventListener("click", runExecute);
  actionSelectEl.addEventListener("change", onActionChange);

  // Generate
  btnGenerate.addEventListener("click", runGenerate);
  generateInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runGenerate();
  });
  updateGenerateUI();

  // Settings
  btnSettings.addEventListener("click", openSettings);
  btnSettingsSave.addEventListener("click", () => {
    saveSettings({
      apiBase: document.getElementById("setting-api-base").value,
      apiKey: document.getElementById("setting-api-key").value,
      model: document.getElementById("setting-model").value,
    });
    settingsModal.classList.add("hidden");
    updateGenerateUI();
  });
  btnSettingsCancel.addEventListener("click", () => {
    settingsModal.classList.add("hidden");
  });

  // Codegen
  btnCodegen.addEventListener("click", runCodegen);
  btnOpenapi.addEventListener("click", runOpenapi);
  codegenTabsEl.addEventListener("click", (e) => {
    const tab = e.target.dataset?.tab;
    if (tab) switchCodegenTab(tab);
  });
}

function enableUI() {
  btnCheck.disabled = false;
  btnFormat.disabled = false;
  btnExecute.disabled = false;
}

function setCodegenEnabled(enabled) {
  btnCodegen.disabled = !enabled;
  btnOpenapi.disabled = !enabled;
}

// Source change handler (debounced check)
function onSourceChange(source) {
  currentSource = source;
  clearTimeout(checkTimer);
  checkTimer = setTimeout(() => {
    if (isReady()) runCheck();
  }, 300);
}

// Check
function runCheck() {
  currentSource = specEditor.state.doc.toString();
  const result = checkSource(currentSource);

  if (result.ok) {
    diagnosticsEl.textContent = "No errors";
    diagnosticsEl.className = "diagnostics ok";
    setCodegenEnabled(true);
    updateModuleInfo();
  } else {
    const msgs = result.diagnostics.map((d) => d.message).join("; ");
    diagnosticsEl.textContent = msgs;
    diagnosticsEl.className = "diagnostics err";
    setCodegenEnabled(false);
    // Still try to show module info if we got a module name
    if (result.module_name) {
      updateModuleInfo();
    }
  }
}

// Format
function runFormat() {
  currentSource = specEditor.state.doc.toString();
  const formatted = formatSource(currentSource);
  setEditorValue(specEditor, formatted);
}

// Module info
function updateModuleInfo() {
  try {
    currentModuleInfo = inspectModule(currentSource);
  } catch {
    return;
  }

  moduleInfoEl.innerHTML = renderModuleInfo(currentModuleInfo);
  moduleInfoEl.classList.remove("placeholder");

  // Update action dropdown (textContent — safe by construction)
  actionSelectEl.innerHTML = '<option value="">-- Select Action --</option>';
  for (const action of currentModuleInfo.actions) {
    const opt = document.createElement("option");
    opt.value = action.name;
    opt.textContent = action.name;
    actionSelectEl.appendChild(opt);
  }
  actionSelectEl.disabled = false;
}

// Action selection
function onActionChange() {
  const actionName = actionSelectEl.value;
  if (!actionName || !currentExample) return;

  // Show sub-example buttons for this action
  const matchingRequests = currentExample.requests.filter((r) => r.action === actionName);
  subExamplesEl.innerHTML = "";
  matchingRequests.forEach((req, i) => {
    const btn = document.createElement("button");
    btn.className = "sub-example-btn";
    btn.textContent = req.name;
    btn.addEventListener("click", () => {
      loadRequest(req);
      // Highlight active
      subExamplesEl.querySelectorAll(".sub-example-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
    subExamplesEl.appendChild(btn);
  });

  // Load first matching request
  if (matchingRequests.length > 0) {
    loadRequest(matchingRequests[0]);
    subExamplesEl.querySelector(".sub-example-btn")?.classList.add("active");
  } else {
    // Generate a blank request template
    const template = { action: actionName, params: {}, state: {} };
    setEditorValue(requestEditor, JSON.stringify(template, null, 2));
  }
}

function loadRequest(req) {
  const requestObj = {
    action: req.action,
    params: req.params,
    state: req.state || {},
  };
  setEditorValue(requestEditor, JSON.stringify(requestObj, null, 2));
}

// Execute
function runExecute() {
  currentSource = specEditor.state.doc.toString();
  let requestJson;
  try {
    requestJson = JSON.parse(requestEditor.state.doc.toString());
  } catch (e) {
    responseEl.innerHTML = `<div class="response-fail"><pre>Invalid request JSON: ${escapeHtml(e.message)}</pre></div>`;
    return;
  }

  const result = executeAction(currentSource, requestJson);

  if (result.error) {
    responseEl.innerHTML = `<div class="response-fail"><pre>${escapeHtml(result.error)}</pre></div>`;
    return;
  }

  if (result.ok) {
    const diffHtml = renderDiff(requestJson.params, result.new_params);
    responseEl.innerHTML = `<div class="response-ok"><pre>${diffHtml}</pre></div>`;
  } else {
    responseEl.innerHTML = renderViolations(result.violations);
  }
}

// Load example
function loadExample(index) {
  currentExample = EXAMPLES[index];
  examplesSelectEl.value = index;
  setEditorValue(specEditor, currentExample.source);
  currentSource = currentExample.source;

  // Clear response and codegen
  responseEl.innerHTML = '<span class="placeholder">Execute an action to see the result</span>';
  codegenResults = { code: null, openapi: null };
  codegenTabsEl.classList.add("hidden");
  codegenOutputEl.innerHTML = '<span class="placeholder">Generate skeleton code or an OpenAPI spec from your intent file</span>';
  codegenOutputEl.classList.add("placeholder");

  // Run check + update module info
  if (isReady()) {
    runCheck();

    // Select first action and load its first request
    if (currentModuleInfo && currentModuleInfo.actions.length > 0) {
      const firstAction = currentModuleInfo.actions[0].name;
      actionSelectEl.value = firstAction;
      onActionChange();
    }
  }
}

// Generate
async function runGenerate() {
  const prompt = generateInput.value.trim();
  if (!prompt) return;

  btnGenerate.disabled = true;
  btnGenerate.textContent = "Generating...";
  try {
    const source = await generate(
      prompt,
      isReady() ? checkSource : null,
      (status) => { btnGenerate.textContent = status; },
    );
    setEditorValue(specEditor, source);
    currentSource = source;
    currentExample = null;
    examplesSelectEl.value = "";
    if (isReady()) runCheck();
  } catch (e) {
    diagnosticsEl.textContent = e.message;
    diagnosticsEl.className = "diagnostics err";
  } finally {
    btnGenerate.disabled = false;
    btnGenerate.textContent = "Generate";
  }
}

function updateGenerateUI() {
  const enabled = hasApiKey();
  generateInput.disabled = !enabled;
  btnGenerate.disabled = !enabled;
  if (!enabled) {
    generateInput.placeholder = "Configure your API URL in settings to enable AI generation";
  } else {
    generateInput.placeholder = "Describe what you want...";
  }
}

function openSettings() {
  const s = loadSettings();
  document.getElementById("setting-api-base").value = s.apiBase || "";
  document.getElementById("setting-api-key").value = s.apiKey || "";
  document.getElementById("setting-model").value = s.model || "";
  settingsModal.classList.remove("hidden");
}

// Codegen
function runCodegen() {
  currentSource = specEditor.state.doc.toString();
  const lang = codegenLangEl.value;
  const result = generateCode(currentSource, lang);

  if (!result.ok) {
    codegenOutputEl.innerHTML = `<div class="response-fail"><pre>${escapeHtml(result.error)}</pre></div>`;
    codegenOutputEl.classList.remove("placeholder");
    return;
  }

  codegenResults.code = { code: result.code, filename: result.filename, lang };
  showCodegenTabs();
  switchCodegenTab("code");
}

function runOpenapi() {
  currentSource = specEditor.state.doc.toString();
  const result = generateOpenApi(currentSource);

  if (!result.ok) {
    codegenOutputEl.innerHTML = `<div class="response-fail"><pre>${escapeHtml(result.error)}</pre></div>`;
    codegenOutputEl.classList.remove("placeholder");
    return;
  }

  codegenResults.openapi = JSON.stringify(result.spec, null, 2);
  showCodegenTabs();
  switchCodegenTab("openapi");
}

function showCodegenTabs() {
  if (codegenResults.code || codegenResults.openapi) {
    codegenTabsEl.classList.remove("hidden");
  }
}

function switchCodegenTab(tab) {
  activeCodegenTab = tab;
  codegenTabsEl.querySelectorAll(".codegen-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === tab);
  });

  if (tab === "code" && codegenResults.code) {
    codegenOutputEl.innerHTML = renderCodegenCode(codegenResults.code);
    codegenOutputEl.classList.remove("placeholder");
  } else if (tab === "openapi" && codegenResults.openapi) {
    codegenOutputEl.innerHTML = renderCodegenOpenapi(codegenResults.openapi);
    codegenOutputEl.classList.remove("placeholder");
  } else {
    codegenOutputEl.innerHTML = '<span class="placeholder">Generate skeleton code or an OpenAPI spec from your intent file</span>';
  }
}

init();
