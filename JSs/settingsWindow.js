// =====================================================================
// LearnWise settings window — word-bank dashboard + theme.
// ---------------------------------------------------------------------
// PLAIN classic script (no ES imports), loaded directly from
// HTMLs/settingsWindow.html. It deliberately does NOT go through the
// esbuild bundle, so the settings UI works without `npm run build`.
//
// D-001: the "smart translations (BYO key)" form is gated behind
// FEATURE_BYOK. The form markup currently shows a "coming soon" card
// instead. The authoritative translation logic still lives in the core
// modules + background worker and is untouched — re-enabling the UI means
// restoring the form markup and flipping this flag back to true.
// =====================================================================

// ---- feature flags ----
const FEATURE_BYOK = false; // D-001 — smart translations hidden for now.

// ---- storage keys (mirror core/constants.js STORAGE_KEYS) ----
const KEYS = {
  WORDBANK: "wordbank",
};
const MSG_DEMOTE_WORD = "lw_demote_word"; // mirror core/constants.js MSG.DEMOTE_WORD
const MSG_DELETE_WORD = "lw_delete_word"; // mirror core/constants.js MSG.DELETE_WORD
const MSG_CLEAR_WORDBANK = "lw_clear_wordbank"; // mirror core/constants.js MSG.CLEAR_WORDBANK
const STOP_GLOSS_LEVEL = 90; // mirror core/constants.js
// Familiarity tiers — mirror of core/constants.js FAMILIARITY_TIERS (single
// source of truth). This page is an unbundled classic script so it can't import;
// keep these `min` values in sync with constants.js. known.min === STOP_GLOSS_LEVEL.
const FAMILIARITY_TIERS = [
  { key: "new", label: "New", min: 0 },
  { key: "learning", label: "Learning", min: 25 },
  { key: "familiar", label: "Familiar", min: 60 },
  { key: "known", label: "Known", min: STOP_GLOSS_LEVEL },
];
// Tier key for a level — highest tier whose `min` the level meets (mirror of
// core/wordbank.js deriveStatus).
function tierForLevel(level) {
  const n = Number(level) || 0;
  let key = FAMILIARITY_TIERS[0].key;
  for (const t of FAMILIARITY_TIERS) if (n >= t.min) key = t.key;
  return key;
}

// ---- storage helpers ----
function getLocal(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, (res) => resolve(res || {})));
}
function setLocal(obj) {
  return new Promise((resolve) => chrome.storage.local.set(obj, () => resolve()));
}

// =====================================================================
// DOM helpers
// =====================================================================
function $(id) {
  return document.getElementById(id);
}
function formatDate(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch (_e) {
    return "—";
  }
}

// =====================================================================
// Word bank — read + normalize
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
    addedAt: Number(r.firstSeenAt || r.createdAt || 0) || 0,
    updatedAt: Number(r.updatedAt || r.updated_at || 0) || 0,
    recentContexts: Array.isArray(r.recentContexts) ? r.recentContexts : [],
    tags: Array.isArray(r.tags) ? r.tags.slice() : [],
  };
}

async function getWordBank() {
  const res = await getLocal([KEYS.WORDBANK]);
  return res?.[KEYS.WORDBANK] || {};
}

// In-memory cache of normalized records (rebuilt on refresh).
let RECORDS = [];

// =====================================================================
// Decks by difficulty (M2.4) — automatic, no manual curation.
// Words are grouped by how common they are (frequency rank). This is a
// classic, unbundled script, so it inlines the band thresholds that
// core/difficulty.js defines (keep the two in sync) and loads the rank
// list from the bundled frequency.json asset.
// =====================================================================
let RANK_INDEX = new Map(); // word -> frequency rank (1 = most common)

// Mirror of core/difficulty.js DIFFICULTY_BANDS thresholds.
const DIFF_BANDS = [
  { key: "beginner", label: "Beginner", desc: "the ~600 most common words" },
  { key: "intermediate", label: "Intermediate", desc: "common everyday words" },
  { key: "advanced", label: "Advanced", desc: "less common words" },
  { key: "rare", label: "Rare / specialized", desc: "uncommon or technical words" },
];
const DIFF_COLOR = {
  beginner: "#0a7d2c",
  intermediate: "#2b6cb0",
  advanced: "#b7791f",
  rare: "#8a5cf6",
};

function bandForRank(rank) {
  const r = Number(rank) || 0;
  if (r <= 0) return "rare";
  if (r <= 600) return "beginner";
  if (r <= 1200) return "intermediate";
  return "advanced";
}
function rankOfWord(word) {
  return RANK_INDEX.get(String(word || "").trim().toLowerCase()) || 0;
}
function bandLabelForWord(word) {
  const key = bandForRank(rankOfWord(word));
  return (DIFF_BANDS.find((b) => b.key === key) || {}).label || "";
}

async function loadRankIndex() {
  try {
    const res = await fetch(chrome.runtime.getURL("data/frequency.json"));
    if (!res.ok) return;
    const arr = await res.json();
    if (!Array.isArray(arr)) return;
    const idx = new Map();
    for (let i = 0; i < arr.length; i++) {
      const w = String(arr[i] || "").trim().toLowerCase();
      if (w && !idx.has(w)) idx.set(w, i + 1);
    }
    RANK_INDEX = idx;
  } catch (_e) {
    /* offline / missing asset → everything falls into "Rare" */
  }
}

// Progress stats (cards, familiarity, streak, accuracy, activity) are rendered
// by the bundled dashboard.js (M3.2), which reads the bank + event logs and
// computes everything via core/stats.js. The old per-tier stat cards + level
// chart that lived here were removed when the two pages were merged.

// =====================================================================
// Word list with detail-on-click (D-009)
// =====================================================================
function levelClass(level) {
  return tierForLevel(level);
}

async function demoteWordIO(word, btn) {
  if (btn) {
    btn.disabled = true;
    btn.textContent = "…";
  }
  try {
    const resp = await chrome.runtime.sendMessage({ type: MSG_DEMOTE_WORD, word });
    if (!resp || !resp.ok) throw new Error(resp?.error || "demote failed");
    await refresh();
  } catch (e) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Review again";
    }
    const status = $("status");
    if (status) status.textContent = `Could not reset "${word}": ${String(e?.message || e)} (rebuild the extension?)`;
  }
}

// Edit a word's meaning/pronunciation directly (no events involved → no
// background hop). Mirror of core/wordbank.js editWord.
async function editWordIO(word, fields) {
  const bank = await getWordBank();
  const entry = bank[word];
  if (!entry || typeof entry !== "object") return;
  if (typeof fields.meaning === "string") entry.meaning = fields.meaning.trim();
  if (typeof fields.pronunciation === "string") entry.pronunciation = fields.pronunciation.trim();
  entry.updatedAt = Date.now();
  await setLocal({ [KEYS.WORDBANK]: bank });
  await refresh();
}

// Delete one word — routed through the background so its events are cleared too.
async function deleteWordIO(word) {
  const status = $("status");
  try {
    const resp = await chrome.runtime.sendMessage({ type: MSG_DELETE_WORD, word });
    if (!resp || !resp.ok) throw new Error(resp?.error || "delete failed");
    await refresh();
    if (status) status.textContent = `Deleted "${word}".`;
  } catch (e) {
    if (status) status.textContent = `Could not delete "${word}": ${String(e?.message || e)} (rebuild the extension?)`;
  }
}

// Clear the entire word bank + event log (background clears IndexedDB too).
async function clearAllIO() {
  const total = RECORDS.length;
  if (!window.confirm(`Delete all ${total} words and your reading history? This cannot be undone. Your setup and settings are kept.`)) return;
  const status = $("status");
  try {
    const resp = await chrome.runtime.sendMessage({ type: MSG_CLEAR_WORDBANK });
    if (!resp || !resp.ok) throw new Error(resp?.error || "clear failed");
    await refresh();
    if (status) status.textContent = "Cleared all words.";
  } catch (e) {
    if (status) status.textContent = `Could not clear: ${String(e?.message || e)} (rebuild the extension?)`;
  }
}

function buildDetail(r) {
  const wrap = document.createElement("div");
  wrap.className = "wl-detail";
  wrap.hidden = true;

  const rows = document.createElement("div");
  rows.className = "wl-meta";
  const add = (label, value) => {
    if (!value) return;
    const row = document.createElement("div");
    row.className = "wl-meta-row";
    const l = document.createElement("span");
    l.className = "wl-meta-label";
    l.textContent = label;
    const v = document.createElement("span");
    v.className = "wl-meta-val";
    v.textContent = value;
    row.appendChild(l);
    row.appendChild(v);
    rows.appendChild(row);
  };
  add("Meaning", r.meaning || "—");
  add("Pronunciation", r.pronunciation || "");
  add("Difficulty", bandLabelForWord(r.word));
  add("Times read", String(r.readCount || 0));
  add("Added", formatDate(r.addedAt));
  add("Level", String(Math.round(r.level || 0)));
  wrap.appendChild(rows);

  if (r.recentContexts.length) {
    const ctxTitle = document.createElement("div");
    ctxTitle.className = "wl-ctx-title";
    ctxTitle.textContent = "Recently seen in";
    wrap.appendChild(ctxTitle);
    const list = document.createElement("ul");
    list.className = "wl-ctx-list";
    for (const c of r.recentContexts.slice(-3)) {
      const li = document.createElement("li");
      li.textContent = typeof c === "string" ? c : c?.sentence || c?.text || "";
      if (li.textContent) list.appendChild(li);
    }
    if (list.childElementCount) wrap.appendChild(list);
  }

  if ((r.level || 0) >= STOP_GLOSS_LEVEL) {
    const btn = document.createElement("button");
    btn.className = "wl-review";
    btn.textContent = "Review again";
    btn.title = "Forgot this word? Reset it so it gets glossed and re-checked as you read.";
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      demoteWordIO(r.word, btn);
    });
    wrap.appendChild(btn);
  }

  // Edit / delete (M2.6)
  const actions = document.createElement("div");
  actions.className = "wl-actions";

  const editBtn = document.createElement("button");
  editBtn.className = "wl-action-btn";
  editBtn.textContent = "Edit";

  const delBtn = document.createElement("button");
  delBtn.className = "wl-action-btn wl-delete";
  delBtn.textContent = "Delete";
  delBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (window.confirm(`Delete "${r.word}" from your word bank?`)) deleteWordIO(r.word);
  });

  // Inline edit form, hidden until "Edit" is clicked.
  const form = document.createElement("div");
  form.className = "wl-edit";
  form.hidden = true;
  const mInput = document.createElement("input");
  mInput.type = "text";
  mInput.className = "wl-edit-input";
  mInput.placeholder = "Meaning";
  mInput.value = r.meaning || "";
  const pInput = document.createElement("input");
  pInput.type = "text";
  pInput.className = "wl-edit-input";
  pInput.placeholder = "Pronunciation";
  pInput.value = r.pronunciation || "";
  const saveBtn = document.createElement("button");
  saveBtn.className = "wl-action-btn wl-save";
  saveBtn.textContent = "Save";
  saveBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    editWordIO(r.word, { meaning: mInput.value, pronunciation: pInput.value });
  });
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "wl-action-btn";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    form.hidden = true;
  });
  form.appendChild(mInput);
  form.appendChild(pInput);
  form.appendChild(saveBtn);
  form.appendChild(cancelBtn);

  editBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    form.hidden = !form.hidden;
  });

  actions.appendChild(editBtn);
  actions.appendChild(delBtn);
  wrap.appendChild(actions);
  wrap.appendChild(form);

  return wrap;
}

// =====================================================================
// Decks panel (M2.4) — automatic difficulty groups
// =====================================================================
function renderDecks() {
  const list = $("deckList");
  if (!list) return;
  list.innerHTML = "";

  if (!RECORDS.length) {
    const empty = document.createElement("div");
    empty.className = "deck-empty";
    empty.textContent = "Words you collect will be grouped here by difficulty automatically.";
    list.appendChild(empty);
    return;
  }

  const groups = { beginner: [], intermediate: [], advanced: [], rare: [] };
  for (const r of RECORDS) groups[bandForRank(rankOfWord(r.word))].push(r);

  for (const band of DIFF_BANDS) {
    const items = groups[band.key];
    if (!items.length) continue; // hide empty difficulty decks

    const folder = document.createElement("div");
    folder.className = "folder";

    const head = document.createElement("button");
    head.className = "folder-head";
    head.setAttribute("aria-expanded", "false");
    const dot = document.createElement("span");
    dot.className = "folder-chevron";
    dot.style.background = DIFF_COLOR[band.key] || "var(--lw-accent)";
    const name = document.createElement("span");
    name.className = "folder-name";
    name.textContent = band.label;
    const count = document.createElement("span");
    count.className = "folder-count";
    count.textContent = String(items.length);
    head.appendChild(dot);
    head.appendChild(name);
    head.appendChild(count);

    const body = document.createElement("div");
    body.className = "folder-body";
    body.hidden = true;

    const itemsWrap = document.createElement("div");
    itemsWrap.className = "folder-items";
    renderFolderItems(itemsWrap, items, "az");
    body.appendChild(itemsWrap);

    head.addEventListener("click", () => {
      const open = body.hidden;
      body.hidden = !open;
      head.setAttribute("aria-expanded", String(open));
      folder.classList.toggle("open", open);
    });

    folder.appendChild(head);
    folder.appendChild(body);
    list.appendChild(folder);
  }
}

function buildWordItem(r) {
  const item = document.createElement("div");
  item.className = "wl-item";

  const head = document.createElement("button");
  head.className = "wl-head";
  head.setAttribute("aria-expanded", "false");
  const lvl = Math.round(r.level || 0);
  head.innerHTML =
    `<span class="wl-word"></span>` +
    `<span class="wl-meaning"></span>` +
    `<span class="wl-bar"><span class="wl-bar-fill bar-${levelClass(lvl)}" style="width:${Math.min(100, lvl)}%"></span></span>` +
    `<span class="wl-lvl">${lvl}</span>`;
  head.querySelector(".wl-word").textContent = r.word;
  head.querySelector(".wl-meaning").textContent = r.meaning || "";

  const detail = buildDetail(r);
  head.addEventListener("click", () => {
    const open = detail.hidden;
    detail.hidden = !open;
    head.setAttribute("aria-expanded", String(open));
    item.classList.toggle("open", open);
  });

  item.appendChild(head);
  item.appendChild(detail);
  return item;
}

// D-012: group records into collapsible folders by level. Folders are
// collapsed by default; pass forceOpen=true (used while searching) to
// auto-expand any folder that has matches.
const FOLDERS = FAMILIARITY_TIERS.map((t) => ({ key: t.key, label: t.label }));

// D-013: sort modes available inside an open folder.
const SORT_MODES = [
  { value: "az", label: "A–Z" },
  { value: "za", label: "Z–A" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "levelDesc", label: "Highest level" },
  { value: "levelAsc", label: "Lowest level" },
];

function sortRecords(items, mode) {
  const arr = items.slice();
  switch (mode) {
    case "za": return arr.sort((a, b) => b.word.localeCompare(a.word));
    case "newest": return arr.sort((a, b) => (b.addedAt - a.addedAt) || a.word.localeCompare(b.word));
    case "oldest": return arr.sort((a, b) => (a.addedAt - b.addedAt) || a.word.localeCompare(b.word));
    case "levelDesc": return arr.sort((a, b) => (b.level - a.level) || a.word.localeCompare(b.word));
    case "levelAsc": return arr.sort((a, b) => (a.level - b.level) || a.word.localeCompare(b.word));
    case "az":
    default: return arr.sort((a, b) => a.word.localeCompare(b.word));
  }
}

function renderFolderItems(container, items, mode) {
  container.innerHTML = "";
  for (const r of sortRecords(items, mode)) container.appendChild(buildWordItem(r));
}

function renderFolders(records, forceOpen = false) {
  const list = $("wordList");
  if (!list) return;
  list.innerHTML = "";

  if (!records.length) {
    const empty = document.createElement("div");
    empty.className = "wl-none";
    empty.textContent = "No matching words.";
    list.appendChild(empty);
    return;
  }

  const groups = {};
  for (const f of FOLDERS) groups[f.key] = [];
  for (const r of records) groups[levelClass(Math.round(r.level || 0))].push(r);

  for (const f of FOLDERS) {
    const items = groups[f.key];
    if (!items.length) continue; // hide empty folders

    const folder = document.createElement("div");
    folder.className = "folder";

    const head = document.createElement("button");
    head.className = "folder-head";
    head.setAttribute("aria-expanded", String(forceOpen));
    head.innerHTML =
      `<span class="folder-chevron bar-${f.key}" aria-hidden="true"></span>` +
      `<span class="folder-name"></span>` +
      `<span class="folder-count"></span>`;
    head.querySelector(".folder-name").textContent = f.label;
    head.querySelector(".folder-count").textContent = String(items.length);

    const body = document.createElement("div");
    body.className = "folder-body";
    body.hidden = !forceOpen;

    // Sort control (D-013) + the items it reorders.
    const sortRow = document.createElement("div");
    sortRow.className = "folder-sort";
    const sortLabel = document.createElement("label");
    sortLabel.className = "folder-sort-label";
    sortLabel.textContent = "Sort";
    const sortSel = document.createElement("select");
    sortSel.className = "folder-sort-select";
    for (const m of SORT_MODES) {
      const opt = document.createElement("option");
      opt.value = m.value;
      opt.textContent = m.label;
      sortSel.appendChild(opt);
    }
    const sortId = `sort-${f.key}`;
    sortSel.id = sortId;
    sortLabel.setAttribute("for", sortId);
    sortRow.appendChild(sortLabel);
    sortRow.appendChild(sortSel);

    const itemsWrap = document.createElement("div");
    itemsWrap.className = "folder-items";
    renderFolderItems(itemsWrap, items, "az");
    sortSel.addEventListener("change", () => renderFolderItems(itemsWrap, items, sortSel.value));

    body.appendChild(sortRow);
    body.appendChild(itemsWrap);

    head.addEventListener("click", () => {
      const open = body.hidden;
      body.hidden = !open;
      head.setAttribute("aria-expanded", String(open));
      folder.classList.toggle("open", open);
    });
    if (forceOpen) folder.classList.add("open");

    folder.appendChild(head);
    folder.appendChild(body);
    list.appendChild(folder);
  }
}

function applySearch() {
  const q = String($("wordSearch")?.value || "").trim().toLowerCase();
  const filtered = q
    ? RECORDS.filter((r) => r.word.includes(q) || (r.meaning || "").toLowerCase().includes(q))
    : RECORDS;
  renderFolders(filtered, q !== "");
}

async function refresh() {
  const status = $("status");
  if (status) status.textContent = "Loading word bank…";
  const bank = await getWordBank();
  RECORDS = Object.keys(bank)
    .map((w) => normalizeRecord(w, bank[w]))
    .sort((a, b) => {
      if (b.level !== a.level) return b.level - a.level;
      return b.updatedAt - a.updatedAt;
    });

  const empty = $("emptyState");
  const dash = $("dashboard");
  const isEmpty = RECORDS.length === 0;
  if (empty) empty.hidden = !isEmpty;
  if (dash) dash.hidden = isEmpty;

  if (!isEmpty) applySearch();
  renderDecks(); // decks can be managed even with an empty bank
  if (status) status.textContent = isEmpty ? "" : `${RECORDS.length} words`;
}

// =====================================================================
// Download
// =====================================================================
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
  if (status) status.textContent = "Preparing export…";
  const bank = await getWordBank();
  const now = new Date();
  const pad2 = (n) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}_${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
  // Wrapped export envelope (mirror of core/exportImport.js buildExport).
  const envelope = {
    format: "learnwise-export",
    exportVersion: 1,
    exportedAt: Date.now(),
    wordCount: Object.keys(bank || {}).length,
    wordbank: bank || {},
  };
  downloadObjectAsJson(`learnwise_wordbank_${stamp}.json`, envelope);
  if (status) status.textContent = `Exported ${envelope.wordCount} words.`;
}

// =====================================================================
// Import (M2.5) — merge a backup into the bank by updatedAt (newer wins).
// Inlined mirror of core/exportImport.js (this is the unbundled script).
// =====================================================================
function extractBankFromImport(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  if (parsed.wordbank !== undefined) {
    const wb = parsed.wordbank;
    return wb && typeof wb === "object" && !Array.isArray(wb) ? wb : null;
  }
  if (parsed.format !== undefined) return null;
  return parsed; // raw bank map (legacy export)
}

function mergeBank(current, incoming) {
  const out = {};
  const base = current && typeof current === "object" && !Array.isArray(current) ? current : {};
  for (const [k, v] of Object.entries(base)) {
    const key = String(k || "").trim().toLowerCase();
    if (key) out[key] = v;
  }
  let added = 0, updated = 0, skipped = 0;
  const inc = incoming && typeof incoming === "object" && !Array.isArray(incoming) ? incoming : {};
  for (const [rawKey, rec] of Object.entries(inc)) {
    const key = String(rawKey || "").trim().toLowerCase();
    if (!key || !rec || typeof rec !== "object" || Array.isArray(rec)) { skipped++; continue; }
    const existing = out[key];
    if (!existing) { out[key] = rec; added++; continue; }
    const a = Number(existing.updatedAt) || 0;
    const b = Number(rec.updatedAt) || 0;
    if (b > a) { out[key] = rec; updated++; } else { skipped++; }
  }
  return { bank: out, stats: { added, updated, skipped } };
}

async function importFromFile(file) {
  const status = $("status");
  if (!file) return;
  if (status) status.textContent = `Reading ${file.name}…`;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const incoming = extractBankFromImport(parsed);
    if (!incoming) throw new Error("Not a recognized LearnWise backup.");

    const current = await getWordBank();
    const { bank, stats } = mergeBank(current, incoming);
    await setLocal({ [KEYS.WORDBANK]: bank });
    await refresh();
    if (status) {
      status.textContent = `Imported: +${stats.added} new, ${stats.updated} updated, ${stats.skipped} skipped.`;
    }
  } catch (e) {
    if (status) status.textContent = `Import failed: ${String(e?.message || e)}`;
  }
}

// =====================================================================
// Color theme (light / dark)
// =====================================================================
const THEME_KEY = "lw_theme";

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") {
    root.setAttribute("data-theme", theme);
  } else {
    root.removeAttribute("data-theme");
  }
  $("themeLight")?.classList.toggle("active", theme === "light");
  $("themeDark")?.classList.toggle("active", theme === "dark");
}

async function loadTheme() {
  const res = await getLocal([THEME_KEY]);
  const t = res[THEME_KEY];
  applyTheme(t === "light" || t === "dark" ? t : "");
}

async function setTheme(theme) {
  await setLocal({ [THEME_KEY]: theme });
  applyTheme(theme);
}

// =====================================================================
// App entry
// =====================================================================
function init() {
  loadTheme();
  $("themeLight")?.addEventListener("click", () => setTheme("light"));
  $("themeDark")?.addEventListener("click", () => setTheme("dark"));
  $("btnRefresh")?.addEventListener("click", refresh);
  $("btnDownload")?.addEventListener("click", downloadWordBank);
  $("btnImport")?.addEventListener("click", () => $("importFile")?.click());
  $("importFile")?.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    importFromFile(file);
    e.target.value = ""; // allow re-importing the same file
  });
  $("btnOnboarding")?.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("HTMLs/onboarding.html") });
  });
  $("btnClearAll")?.addEventListener("click", clearAllIO);
  $("wordSearch")?.addEventListener("input", applySearch);

  // Keep the dashboard fresh if words change while the page is open.
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes[KEYS.WORDBANK]) refresh();
    });
  } catch (_e) {
    /* no-op */
  }

  // Load the frequency rank list (for difficulty decks) before first render.
  loadRankIndex().then(refresh, refresh);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
