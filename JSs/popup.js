console.log("[LearnWise popup] popup.js loaded");

const ENABLE_KEY = "lw_enabled";
const TRANSLATION_SOURCE_KEY = "translation_source";

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
  // set id="translationSource" select value
  transOpt.value = res?.[TRANSLATION_SOURCE_KEY] || "local";
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
});