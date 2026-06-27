// =====================================================================
// LearnWise settings window — word bank viewer + BYO-key settings.
// ---------------------------------------------------------------------
// This is a PLAIN classic script (no ES imports), loaded directly from
// HTMLs/settingsWindow.html. It deliberately does NOT go through the
// esbuild bundle, so the settings UI works without `npm run build`.
//
// The few constants/helpers below MIRROR the source-of-truth modules
// (core/constants.js, core/providers.js, core/byokSettings.js,
// core/translation.js). Keep them in sync if those change. The authoritative
// translation logic still runs in the bundled background worker.
// =====================================================================

// ---- storage keys (mirror core/constants.js STORAGE_KEYS) ----
const KEYS = {
  WORDBANK: "wordbank",
  TRANSLATION_SOURCE: "translation_source",
  BYOK_PROVIDER: "lw_byok_provider",
  BYOK_KEYS: "lw_byok_keys",
  BYOK_MODELS: "lw_byok_models",
  BYOK_BASE_URL: "lw_byok_base_url",
  OPENAI_KEY: "lw_openai_key", // legacy single-key storage
  OPENAI_MODEL: "lw_openai_model",
};
const MSG_TRANSLATE_BYOK = "lw_translate_byok"; // mirror core/constants.js MSG.TRANSLATE_BYOK
const MSG_DEMOTE_WORD = "lw_demote_word"; // mirror core/constants.js MSG.DEMOTE_WORD
const STOP_GLOSS_LEVEL = 90; // mirror core/constants.js

// ---- provider registry for the UI (mirrors core/providers.js) ----
const PROVIDERS_UI = [
  { id: "openai", label: "OpenAI", keyHint: "sk-…", needsBaseUrl: false,
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"] },
  { id: "anthropic", label: "Anthropic (Claude)", keyHint: "sk-ant-…", needsBaseUrl: false,
    models: ["claude-3-5-haiku-latest", "claude-3-5-sonnet-latest", "claude-3-7-sonnet-latest"] },
  { id: "openrouter", label: "OpenRouter", keyHint: "sk-or-…", needsBaseUrl: false,
    models: ["openai/gpt-4o-mini", "anthropic/claude-3.5-haiku", "google/gemini-flash-1.5", "meta-llama/llama-3.1-8b-instruct"] },
  { id: "custom", label: "Custom (OpenAI-compatible)", keyHint: "your key (optional for local)", needsBaseUrl: true,
    models: [] },
];
const PROVIDER_BY_ID = Object.fromEntries(PROVIDERS_UI.map((p) => [p.id, p]));
const PROVIDER_IDS = PROVIDERS_UI.map((p) => p.id);

function getProviderUI(id) {
  return PROVIDER_BY_ID[id] || PROVIDERS_UI[0];
}
function normalizeProvider(id) {
  return PROVIDER_BY_ID[id] ? id : "openai";
}
function defaultModelFor(id) {
  return getProviderUI(id).models[0] || "";
}
function normalizeSource(s) {
  if (s === "api") return "byok"; // legacy
  return ["local", "byok", "managed"].includes(s) ? s : "local";
}
function normalizeModel(model, providerId) {
  const id = normalizeProvider(providerId);
  if (id === "custom") return String(model || "").trim();
  return getProviderUI(id).models.includes(model) ? model : defaultModelFor(id);
}
function validateApiKey(key, providerId) {
  const k = String(key || "").trim();
  const isCustom = normalizeProvider(providerId) === "custom";
  if (!k) return isCustom ? { valid: true, reason: "" } : { valid: false, reason: "No API key set." };
  if (/\s/.test(k)) return { valid: false, reason: "API key must not contain spaces." };
  if (!isCustom && k.length < 20) return { valid: false, reason: "API key looks too short." };
  return { valid: true, reason: "" };
}
function resolveCustomChatUrl(baseUrl) {
  let base = String(baseUrl || "").trim();
  if (!base) return "";
  base = base.replace(/\/+$/, "");
  if (/\/chat\/completions$/.test(base)) return base;
  if (/\/v1$/.test(base)) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}
function originPatternFromUrl(url) {
  try {
    return `${new URL(String(url || "").trim()).origin}/*`;
  } catch (_e) {
    return "";
  }
}

// ---- storage helpers ----
function getLocal(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, (res) => resolve(res || {})));
}
function setLocal(obj) {
  return new Promise((resolve) => chrome.storage.local.set(obj, () => resolve()));
}
function asObject(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

async function getByokSettings() {
  const s = await getLocal([
    KEYS.BYOK_PROVIDER, KEYS.BYOK_KEYS, KEYS.BYOK_MODELS, KEYS.BYOK_BASE_URL,
    KEYS.OPENAI_KEY, KEYS.OPENAI_MODEL,
  ]);
  const keys = { ...asObject(s[KEYS.BYOK_KEYS]) };
  const models = { ...asObject(s[KEYS.BYOK_MODELS]) };
  if (!keys.openai && s[KEYS.OPENAI_KEY]) keys.openai = String(s[KEYS.OPENAI_KEY]);
  if (!models.openai && s[KEYS.OPENAI_MODEL]) models.openai = String(s[KEYS.OPENAI_MODEL]);
  return {
    provider: normalizeProvider(s[KEYS.BYOK_PROVIDER]),
    keys,
    models,
    baseUrl: String(s[KEYS.BYOK_BASE_URL] || ""),
  };
}
async function saveByokProvider({ provider, key, model, baseUrl }) {
  const id = normalizeProvider(provider);
  const s = await getLocal([KEYS.BYOK_KEYS, KEYS.BYOK_MODELS]);
  const keys = { ...asObject(s[KEYS.BYOK_KEYS]) };
  const models = { ...asObject(s[KEYS.BYOK_MODELS]) };
  keys[id] = String(key || "").trim();
  models[id] = normalizeModel(model, id) || defaultModelFor(id);
  const patch = { [KEYS.BYOK_PROVIDER]: id, [KEYS.BYOK_KEYS]: keys, [KEYS.BYOK_MODELS]: models };
  if (id === "custom") patch[KEYS.BYOK_BASE_URL] = String(baseUrl || "").trim();
  await setLocal(patch);
}

// =====================================================================
// DOM helpers
// =====================================================================
function $(id) {
  return document.getElementById(id);
}
function formatTime(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString();
  } catch (_e) {
    return "";
  }
}

// =====================================================================
// Word bank table
// =====================================================================
function normalizeRecord(word, rec) {
  const r = rec || {};
  return {
    word,
    meaning: r.meaning || r.translation || "",
    pronunciation: r.pronunciation || r.pronounce || "",
    level:
      typeof r.level === "number" ? r.level : typeof r.familiarity === "number" ? r.familiarity : 0,
    readCount:
      typeof r.readCount === "number" ? r.readCount : typeof r.read_events === "number" ? r.read_events : 0,
    updatedAt: r.updatedAt || r.updated_at || 0,
  };
}

async function getWordBank() {
  const res = await getLocal([KEYS.WORDBANK]);
  return res?.[KEYS.WORDBANK] || {};
}

function downloadObjectAsJson(filename, obj) {
  try {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (_e) {
    /* no-op */
  }
}

async function downloadWordBank() {
  const status = $("status");
  if (status) status.textContent = "Preparing download...";
  const bank = await getWordBank();
  const now = new Date();
  const pad2 = (n) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}_${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
  downloadObjectAsJson(`learnwise_wordbank_${stamp}.json`, bank);
  if (status) status.textContent = `Downloaded ${Object.keys(bank || {}).length} words.`;
}

async function demoteWordIO(word, btn) {
  if (btn) {
    btn.disabled = true;
    btn.textContent = "…";
  }
  try {
    const resp = await chrome.runtime.sendMessage({ type: MSG_DEMOTE_WORD, word });
    if (!resp || !resp.ok) throw new Error(resp?.error || "demote failed");
    await refresh(); // re-render with the updated level/status
  } catch (e) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Review again";
    }
    const status = $("status");
    if (status) status.textContent = `Could not reset "${word}": ${String(e?.message || e)} (rebuild the extension?)`;
  }
}

function renderRows(records) {
  const tbody = $("wordbankRows");
  if (!tbody) return;
  tbody.innerHTML = "";
  for (const r of records) {
    const tr = document.createElement("tr");
    const cells = [
      r.word,
      r.meaning,
      r.pronunciation,
      String(r.level ?? ""),
      String(r.readCount ?? ""),
      formatTime(r.updatedAt),
    ];
    cells.forEach((text, i) => {
      const td = document.createElement("td");
      td.textContent = text;
      if (i === 3 || i === 4) td.style.textAlign = "right";
      tr.appendChild(td);
    });

    // Actions: "Review again" demotes a known word back into the glossing range.
    const tdAction = document.createElement("td");
    if ((r.level ?? 0) >= STOP_GLOSS_LEVEL) {
      const btn = document.createElement("button");
      btn.textContent = "Review again";
      btn.title = "Forgot this word? Reset it so it gets glossed and re-checked as you read.";
      btn.style.fontSize = "12px";
      btn.addEventListener("click", () => demoteWordIO(r.word, btn));
      tdAction.appendChild(btn);
    }
    tr.appendChild(tdAction);

    tbody.appendChild(tr);
  }
}

async function refresh() {
  const status = $("status");
  if (status) status.textContent = "Loading word bank...";
  const bank = await getWordBank();
  const records = Object.keys(bank)
    .map((w) => normalizeRecord(w, bank[w]))
    .sort((a, b) => {
      const la = a.level ?? 0;
      const lb = b.level ?? 0;
      if (lb !== la) return lb - la;
      return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    });
  renderRows(records);
  if (status) status.textContent = `Loaded ${records.length} words.`;
}

// =====================================================================
// BYO-key translation settings (multi-provider)
// =====================================================================
function setByokStatus(msg, kind = "info") {
  const el = $("byokStatus");
  if (!el) return;
  el.textContent = msg || "";
  el.style.color = kind === "error" ? "#b00020" : kind === "ok" ? "#0a7d2c" : "inherit";
}

// In-memory copy of the per-provider maps so switching providers in the UI
// shows the right saved values without re-reading storage each time.
let BYOK_KEYS = {};
let BYOK_MODELS = {};

function populateProviderSelect() {
  const sel = $("byokProvider");
  if (!sel || sel.options.length) return;
  for (const id of PROVIDER_IDS) {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = getProviderUI(id).label;
    sel.appendChild(opt);
  }
}

function renderProviderFields(providerId) {
  const provider = getProviderUI(providerId);
  const isCustom = providerId === "custom";
  const modelSel = $("byokModel");
  const modelCustom = $("byokModelCustom");
  const keyInput = $("byokKey");

  if (modelSel) {
    modelSel.innerHTML = "";
    for (const m of provider.models) {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m === defaultModelFor(providerId) ? `${m} (default)` : m;
      modelSel.appendChild(opt);
    }
    modelSel.style.display = isCustom ? "none" : "";
    if (!isCustom) modelSel.value = BYOK_MODELS[providerId] || defaultModelFor(providerId);
  }
  if (modelCustom) {
    modelCustom.style.display = isCustom ? "" : "none";
    if (isCustom) modelCustom.value = BYOK_MODELS[providerId] || "";
  }
  if (keyInput) {
    keyInput.value = BYOK_KEYS[providerId] || "";
    keyInput.placeholder = provider.keyHint || "your key";
  }
  applyByokVisibility();
}

// Show the BYO-key fields only when the source is "smart (byok)"; show the
// custom base-URL row only for the custom provider. Keeps "local" mode clean.
function applyByokVisibility() {
  const byok = ($("translationSource")?.value || "local") === "byok";
  const isCustom = ($("byokProvider")?.value || "openai") === "custom";

  for (const el of document.querySelectorAll(".byokOnly")) {
    el.style.display = byok ? "" : "none";
  }
  const btns = $("byokButtons");
  if (btns) btns.style.display = byok ? "flex" : "none";

  const showBase = byok && isCustom;
  const baseRow = $("byokBaseUrlRow");
  const baseLabel = $("byokBaseUrlLabel");
  if (baseRow) baseRow.style.display = showBase ? "" : "none";
  if (baseLabel) baseLabel.style.display = showBase ? "" : "none";
}

async function loadByokSettings() {
  populateProviderSelect();
  const sourceSel = $("translationSource");
  const providerSel = $("byokProvider");
  const baseUrlInput = $("byokBaseUrl");
  if (!sourceSel || !providerSel) return;

  const res = await getLocal([KEYS.TRANSLATION_SOURCE]);
  sourceSel.value = normalizeSource(res[KEYS.TRANSLATION_SOURCE]);

  const settings = await getByokSettings();
  BYOK_KEYS = settings.keys || {};
  BYOK_MODELS = settings.models || {};
  providerSel.value = settings.provider;
  if (baseUrlInput) baseUrlInput.value = settings.baseUrl || "";
  renderProviderFields(settings.provider);
}

function readModelFromUI(providerId) {
  return providerId === "custom"
    ? String($("byokModelCustom")?.value || "").trim()
    : String($("byokModel")?.value || "");
}

async function saveByokSettings() {
  const source = normalizeSource($("translationSource")?.value);
  const provider = $("byokProvider")?.value || "openai";
  const key = String($("byokKey")?.value || "").trim();
  const model = readModelFromUI(provider);
  const baseUrl = String($("byokBaseUrl")?.value || "").trim();

  if (source === "byok") {
    const fmt = validateApiKey(key, provider);
    if (!fmt.valid) {
      setByokStatus(fmt.reason, "error");
      return false;
    }
    if (provider === "custom" && !resolveCustomChatUrl(baseUrl)) {
      setByokStatus("Enter the base URL of your OpenAI-compatible endpoint.", "error");
      return false;
    }
  }

  await setLocal({ [KEYS.TRANSLATION_SOURCE]: source });
  await saveByokProvider({ provider, key, model, baseUrl });
  BYOK_KEYS[provider] = key;
  BYOK_MODELS[provider] = normalizeModel(model, provider) || defaultModelFor(provider);
  setByokStatus("Saved.", "ok");
  return true;
}

async function testByokSettings() {
  if (!(await saveByokSettings())) return;
  setByokStatus("Testing…");
  try {
    const resp = await chrome.runtime.sendMessage({
      type: MSG_TRANSLATE_BYOK,
      words: ["hello"],
      sentence: "Hello there.",
    });
    if (resp && resp.ok) {
      const meaning = resp.translations?.hello?.meaning;
      setByokStatus(meaning ? `Working — "hello" → ${meaning}` : "Key works.", "ok");
    } else {
      setByokStatus(resp?.error?.message || "Test failed (is the extension rebuilt?).", "error");
    }
  } catch (e) {
    setByokStatus(`Test failed: ${String(e?.message || e)}`, "error");
  }
}

async function grantCustomHost() {
  const origin = originPatternFromUrl($("byokBaseUrl")?.value || "");
  if (!origin) {
    setByokStatus("Enter a valid base URL first.", "error");
    return;
  }
  try {
    const granted = await chrome.permissions.request({ origins: [origin] });
    setByokStatus(granted ? `Access granted for ${origin}` : "Access was not granted.", granted ? "ok" : "error");
  } catch (e) {
    setByokStatus(`Could not request access: ${String(e?.message || e)}`, "error");
  }
}

// Reflect a source change made elsewhere (e.g. the popup) live.
function applyExternalChanges(changes, area) {
  if (area !== "local") return;
  const sourceSel = $("translationSource");
  if (changes[KEYS.TRANSLATION_SOURCE] && sourceSel && document.activeElement !== sourceSel) {
    sourceSel.value = normalizeSource(changes[KEYS.TRANSLATION_SOURCE].newValue);
    applyByokVisibility();
  }
}

// =====================================================================
// App entry — run now if the DOM is already parsed, else on DOMContentLoaded.
// =====================================================================
function init() {
  $("btnRefresh")?.addEventListener("click", refresh);
  $("btnDownload")?.addEventListener("click", downloadWordBank);
  $("btnOnboarding")?.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("HTMLs/onboarding.html") });
  });
  $("btnSaveKey")?.addEventListener("click", saveByokSettings);
  $("btnTestKey")?.addEventListener("click", testByokSettings);
  $("btnGrantHost")?.addEventListener("click", grantCustomHost);
  $("byokProvider")?.addEventListener("change", (e) => renderProviderFields(e.target.value));
  $("translationSource")?.addEventListener("change", applyByokVisibility);

  try {
    chrome.storage.onChanged.addListener(applyExternalChanges);
  } catch (_e) {
    /* no-op */
  }

  loadByokSettings();
  refresh();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
