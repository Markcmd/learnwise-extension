console.log("[LearnWise popup] popup.js loaded");

const ENABLE_KEY = "lw_enabled";
const WORDBANK_KEY = "wordbank";
const STOP_GLOSS_LEVEL = 90; // mirror core/constants.js
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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

// -----------------------------
// Word bank — quick stats (D-006 / D-008)
// -----------------------------
async function getWordBank() {
  const res = await chrome.storage.local.get([WORDBANK_KEY]);
  const wb = res?.[WORDBANK_KEY];
  return wb && typeof wb === "object" && !Array.isArray(wb) ? wb : {};
}

function levelOf(rec) {
  const r = rec || {};
  return typeof r.level === "number" ? r.level : typeof r.familiarity === "number" ? r.familiarity : 0;
}

function addedAtOf(rec) {
  const r = rec || {};
  return Number(r.firstSeenAt || r.createdAt || 0) || 0;
}

function computeStats(bank, now = Date.now()) {
  let total = 0;
  let known = 0;
  let week = 0;
  for (const word of Object.keys(bank)) {
    total += 1;
    const rec = bank[word];
    if (levelOf(rec) >= STOP_GLOSS_LEVEL) known += 1;
    if (now - addedAtOf(rec) <= WEEK_MS && addedAtOf(rec) > 0) week += 1;
  }
  return { total, known, week };
}

async function renderStats() {
  const bank = await getWordBank();
  const { total, known, week } = computeStats(bank);
  const elTotal = document.getElementById("statTotal");
  const elKnown = document.getElementById("statKnown");
  const elWeek = document.getElementById("statWeek");
  if (elTotal) elTotal.textContent = String(total);
  if (elKnown) elKnown.textContent = String(known);
  if (elWeek) elWeek.textContent = week > 0 ? `+${week} this week` : "";
}

document.addEventListener("DOMContentLoaded", async () => {
  const toggle = document.getElementById("enableToggle");
  const dashBtn = document.getElementById("openDashboard");

  const enabled = await getEnabled();
  toggle.checked = enabled;
  setBadge(enabled);

  toggle.addEventListener("change", async () => {
    await setEnabled(toggle.checked);
    console.log(`LearnWise is now ${toggle.checked ? "enabled" : "disabled"}.`);
  });

  dashBtn?.addEventListener("click", async () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("HTMLs/settingsWindow.html") });
    window.close();
  });

  renderStats();

  // Keep the popup in sync if anything changes these values while it's open.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[ENABLE_KEY]) {
      const next = changes[ENABLE_KEY].newValue;
      toggle.checked = typeof next === "boolean" ? next : true;
      setBadge(toggle.checked);
    }
    if (changes[WORDBANK_KEY]) {
      renderStats();
    }
  });
});
