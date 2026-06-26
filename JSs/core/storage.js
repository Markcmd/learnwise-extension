// =====================================================================
// Storage wrapper — promise-based access to chrome.storage.local
// ---------------------------------------------------------------------
// The rest of core/ talks to storage only through these helpers, so the
// pure logic never touches the callback-based chrome.* API directly.
// IndexedDB (for the full event log) is added in M1.
// =====================================================================

/**
 * Read values from chrome.storage.local.
 * @param {string[]|string|Object|null} keys
 * @returns {Promise<Object>} resolved store slice (missing keys are absent)
 */
export function getLocal(keys) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.get(keys, (res) => {
        const err = chrome.runtime?.lastError;
        if (err) reject(err);
        else resolve(res || {});
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Write key/value pairs to chrome.storage.local.
 * @param {Object} obj
 * @returns {Promise<void>}
 */
export function setLocal(obj) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.set(obj, () => {
        const err = chrome.runtime?.lastError;
        if (err) reject(err);
        else resolve();
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Remove one or more keys from chrome.storage.local.
 * @param {string[]|string} keys
 * @returns {Promise<void>}
 */
export function removeLocal(keys) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.remove(keys, () => {
        const err = chrome.runtime?.lastError;
        if (err) reject(err);
        else resolve();
      });
    } catch (e) {
      reject(e);
    }
  });
}
