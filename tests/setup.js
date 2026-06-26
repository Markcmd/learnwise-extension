// =====================================================================
// Vitest global setup — fake `chrome` API
// ---------------------------------------------------------------------
// The storage wrapper (JSs/core/storage.js) talks to chrome.storage.local.
// In Node there is no `chrome`, so we install a tiny in-memory stand-in
// that mirrors the callback-based shape of the real API closely enough
// for our wrappers. Each test file gets a fresh, empty store.
// =====================================================================
import { beforeEach, vi } from "vitest";

function createFakeChrome() {
  let store = {};

  return {
    __reset() {
      store = {};
    },
    runtime: {
      lastError: undefined,
      getURL: (p) => `chrome-extension://test/${p}`,
    },
    storage: {
      local: {
        get(keys, cb) {
          let out = {};
          if (keys == null) {
            out = { ...store };
          } else if (typeof keys === "string") {
            if (keys in store) out[keys] = store[keys];
          } else if (Array.isArray(keys)) {
            for (const k of keys) if (k in store) out[k] = store[k];
          } else if (typeof keys === "object") {
            // object form: keys with default values
            for (const k of Object.keys(keys)) {
              out[k] = k in store ? store[k] : keys[k];
            }
          }
          // structuredClone to mimic the serialization boundary
          cb(structuredClone(out));
        },
        set(obj, cb) {
          for (const [k, v] of Object.entries(obj)) {
            store[k] = structuredClone(v);
          }
          if (cb) cb();
        },
        remove(keys, cb) {
          const arr = Array.isArray(keys) ? keys : [keys];
          for (const k of arr) delete store[k];
          if (cb) cb();
        },
        clear(cb) {
          store = {};
          if (cb) cb();
        },
      },
    },
  };
}

globalThis.chrome = createFakeChrome();

beforeEach(() => {
  globalThis.chrome.__reset();
  globalThis.chrome.runtime.lastError = undefined;
  vi.restoreAllMocks();
});
