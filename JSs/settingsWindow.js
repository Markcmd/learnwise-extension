// Display LearnWise word bank in the settings window.

const WORD_BANK_KEY = "wordbank";

// =====================================================================
// Helper: DOM selector
// =====================================================================
function $(id) {
  return document.getElementById(id);
}

// =====================================================================
// Helper: Format timestamp
// =====================================================================
function formatTime(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString();
  } catch (e) {
    return "";
  }
}

// =====================================================================
// Helper: Normalize wordbank record
// =====================================================================
function normalizeRecord(word, rec) {
  const r = rec || {};
  return {
    word,
    meaning: r.meaning || r.translation || "",
    pronunciation: r.pronunciation || r.pronounce || "",
    level:
      typeof r.level === "number"
        ? r.level
        : typeof r.familiarity === "number"
          ? r.familiarity
          : 0,
    readCount:
      typeof r.readCount === "number"
        ? r.readCount
        : typeof r.read_events === "number"
          ? r.read_events
          : 0,
    updatedAt: r.updatedAt || r.updated_at || 0
  };
}

// =====================================================================
// Storage: Read wordbank
// =====================================================================
async function getWordBank() {
  return new Promise((resolve) => {
    chrome.storage.local.get([WORD_BANK_KEY], (res) => {
      resolve(res?.[WORD_BANK_KEY] || {});
    });
  });
}

// =====================================================================
// Storage: Write wordbank
// =====================================================================
async function setWordBank(next) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [WORD_BANK_KEY]: next }, () => resolve());
  });
}

// =====================================================================
// Helper: Download JSON file
// =====================================================================
function downloadObjectAsJson(filename, obj) {
  try {
    const json = JSON.stringify(obj, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    // Allow the click to finish before revoking.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (_e) {
    // no-op
  }
}

// =====================================================================
// Action: Download wordbank
// =====================================================================
async function downloadWordBank() {
  const status = $("status");
  if (status) status.textContent = "Preparing download...";

  const bank = await getWordBank();
  const now = new Date();
  const pad2 = (n) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}_${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
  const filename = `learnwise_wordbank_${stamp}.json`;

  downloadObjectAsJson(filename, bank);

  if (status) {
    const count = Object.keys(bank || {}).length;
    status.textContent = `Downloaded ${count} words.`;
  }
}

// =====================================================================
// UI: Render rows
// =====================================================================
function renderRows(records) {
  const tbody = $("wordbankRows");
  if (!tbody) return;

  tbody.innerHTML = "";

  for (const r of records) {
    const tr = document.createElement("tr");

    const tdWord = document.createElement("td");
    tdWord.textContent = r.word;

    const tdMeaning = document.createElement("td");
    tdMeaning.textContent = r.meaning;

    const tdPron = document.createElement("td");
    tdPron.textContent = r.pronunciation;

    const tdLevel = document.createElement("td");
    tdLevel.style.textAlign = "right";
    tdLevel.textContent = String(r.level ?? "");

    const tdRead = document.createElement("td");
    tdRead.style.textAlign = "right";
    tdRead.textContent = String(r.readCount ?? "");

    const tdUpdated = document.createElement("td");
    tdUpdated.textContent = formatTime(r.updatedAt);

    tr.appendChild(tdWord);
    tr.appendChild(tdMeaning);
    tr.appendChild(tdPron);
    tr.appendChild(tdLevel);
    tr.appendChild(tdRead);
    tr.appendChild(tdUpdated);

    tbody.appendChild(tr);
  }
}

// =====================================================================
// UI: Refresh view
// =====================================================================
async function refresh() {
  const status = $("status");
  if (status) status.textContent = "Loading word bank...";

  const bank = await getWordBank();
  const words = Object.keys(bank);

  const records = words
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
// App entry
// =====================================================================
document.addEventListener("DOMContentLoaded", () => {
  $("btnRefresh")?.addEventListener("click", refresh);
  $("btnDownload")?.addEventListener("click", downloadWordBank);

  // Initial load  
  refresh();
});