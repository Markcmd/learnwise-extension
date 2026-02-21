// Service worker for LearnWise.
// With a popup configured in manifest.json (action.default_popup), we no longer
// open settingsWindow.html on toolbar icon click here.

chrome.runtime.onInstalled.addListener(() => {
  // Default: enabled
  chrome.storage.local.get(["lw_enabled"], (res) => {
    if (typeof res.lw_enabled === "undefined") {
      chrome.storage.local.set({ lw_enabled: true });
    }
  });

  // Default: translation local
  chrome.storage.local.get(["translation_source"], (res) => {
    if (typeof res.translation_source === "undefined") {
      chrome.storage.local.set({ translation_source: "local" });
    }
  });
});

// ======================================================
// Inject contentScript.js into the active tab on icon click
// (content_scripts removed from manifest; this is manual injection)
// ======================================================
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["JSs/contentScript.js"],
    });

    console.log("LearnWise: contentScript injected");
  } catch (err) {
    console.error("LearnWise: injection failed", err);
  }
});
