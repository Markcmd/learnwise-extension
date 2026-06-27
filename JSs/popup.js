console.log("[LearnWise popup] popup.js loaded");

const ENABLE_KEY = "lw_enabled";
const TRANSLATION_SOURCE_KEY = "translation_source";
const WORDBANK_KEY = "wordbank";
const MSG_DEMOTE_WORD = "lw_demote_word"; // mirror core/constants.js MSG.DEMOTE_WORD
const STOP_GLOSS_LEVEL = 90; // mirror core/constants.js
const MAX_RESULTS = 15;

function setBadge(enabled) {
  // Optional: show a badge when disabled
  chrome.action.setBadgeText({ text: enabled ? "" : "OFF" });
}

// -----------------------------
// Storage: enable flag
// -----------------------------
async function getEnabled() {
  const res = await chrome.storage.local.get([ENABLE_KEY]);
  return typeof res[ENABLE_KEY] === "boolean" ? res[ENABLE_KEY] : true;
}

async function setEnabled(enabled) {
  await chrome.storage.local.set({ [ENABLE_KEY]: enabled });
  setBadge(enabled);
}


document.addEventListener("DOMContentLoaded", async () => {
  const toggle = document.getElementById("enableToggle");
  const openBtn = document.getElementById("openSettings");
  const transOpt = document.getElementById("translationSource");

  const enabled = await getEnabled();
  toggle.checked = enabled;
  setBadge(enabled);

  toggle.addEventListener("change", async () => {
    await setEnabled(toggle.checked);
    console.log(`LearnWise is now ${toggle.checked ? "enabled" : "disabled"}.`);
  });

  // get current option value
  const res = await chrome.storage.local.get([TRANSLATION_SOURCE_KEY]);
  let current = res?.[TRANSLATION_SOURCE_KEY] || "local";
  if (current === "api") current = "byok"; // legacy value → BYO-key
  if (current !== "local" && current !== "byok") current = "local"; // managed (v2) etc.
  transOpt.value = current;
  transOpt.addEventListener("change", async () => {
    const value = transOpt.value;
    await chrome.storage.local.set({ [TRANSLATION_SOURCE_KEY]: value });
    console.log(`Translation source set to: ${value}`);
  });

  openBtn.addEventListener("click", async () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL("HTMLs/settingsWindow.html"),
    });
  });

  // ---------------------------------------------------------------------
  // Word-bank search + per-word "Review again" (demote a known word)
  // ---------------------------------------------------------------------
  const searchInput = document.getElementById("wordSearch");
  const resultsEl = document.getElementById("searchResults");

  async function getWordBank() {
    const res = await chrome.storage.local.get([WORDBANK_KEY]);
    const wb = res?.[WORDBANK_KEY];
    return wb && typeof wb === "object" && !Array.isArray(wb) ? wb : {};
  }

  function levelOf(rec) {
    const r = rec || {};
    return typeof r.level === "number" ? r.level : typeof r.familiarity === "number" ? r.familiarity : 0;
  }

  function findMatches(bank, query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out = [];
    for (const word of Object.keys(bank)) {
      if (word.includes(q)) out.push({ word, rec: bank[word] });
    }
    // Exact match first, then known words (likely review targets), then alpha.
    out.sort((a, b) => {
      if ((a.word === q) !== (b.word === q)) return a.word === q ? -1 : 1;
      const dl = levelOf(b.rec) - levelOf(a.rec);
      if (dl !== 0) return dl;
      return a.word.localeCompare(b.word);
    });
    return out.slice(0, MAX_RESULTS);
  }

  async function reviewAgain(word, btn) {
    btn.disabled = true;
    btn.textContent = "…";
    try {
      const resp = await chrome.runtime.sendMessage({ type: MSG_DEMOTE_WORD, word });
      if (!resp || !resp.ok) throw new Error(resp?.error || "failed");
      runSearch(); // re-render with the updated level
    } catch (e) {
      btn.disabled = false;
      btn.textContent = "Review again";
      console.warn("[LearnWise popup] demote failed:", e);
    }
  }

  function renderResults(matches) {
    resultsEl.innerHTML = "";
    if (!matches.length) {
      const empty = document.createElement("div");
      empty.className = "sr-empty";
      empty.textContent = searchInput.value.trim() ? "No matching words in your bank." : "";
      resultsEl.appendChild(empty);
      return;
    }
    for (const { word, rec } of matches) {
      const level = Math.round(levelOf(rec));
      const known = level >= STOP_GLOSS_LEVEL;

      const row = document.createElement("div");
      row.className = "sr-row";

      const info = document.createElement("div");
      info.className = "sr-info";
      const meaning = (rec && rec.meaning) ? ` ${rec.meaning}` : "";
      info.innerHTML =
        `<span class="sr-word"></span><span class="sr-meaning"></span><br><span class="sr-lvl"></span>`;
      info.querySelector(".sr-word").textContent = word;
      info.querySelector(".sr-meaning").textContent = meaning;
      info.querySelector(".sr-lvl").textContent = `level ${level} · ${known ? "known" : "learning"}`;
      row.appendChild(info);

      if (known) {
        const btn = document.createElement("button");
        btn.className = "btn-sm";
        btn.textContent = "Review again";
        btn.title = "Forgot it? Reset so it gets glossed and re-checked as you read.";
        btn.addEventListener("click", () => reviewAgain(word, btn));
        row.appendChild(btn);
      }
      resultsEl.appendChild(row);
    }
  }

  let searchTimer = null;
  async function runSearch() {
    const bank = await getWordBank();
    renderResults(findMatches(bank, searchInput.value));
  }
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(runSearch, 150);
    });
  }

  // Keep the popup in sync if the settings page (or anything else) changes
  // these values while the popup is open.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[ENABLE_KEY]) {
      const next = changes[ENABLE_KEY].newValue;
      toggle.checked = typeof next === "boolean" ? next : true;
      setBadge(toggle.checked);
    }
    if (changes[TRANSLATION_SOURCE_KEY]) {
      let next = changes[TRANSLATION_SOURCE_KEY].newValue || "local";
      if (next === "api") next = "byok";
      if (next !== "local" && next !== "byok") next = "local";
      transOpt.value = next;
    }
  });
});