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