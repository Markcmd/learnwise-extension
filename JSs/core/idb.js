// =====================================================================
// IndexedDB wrapper — promise-based access to the event log database
// ---------------------------------------------------------------------
// The full exposure + review event log is large and historical, so it
// lives in IndexedDB rather than chrome.storage.local (DESIGN.md §2).
// The rest of core/ talks to IndexedDB only through these helpers, the
// same way it talks to chrome.storage only through storage.js — so the
// pure logic never touches the raw event-based IndexedDB API directly.
// =====================================================================
import { IDB } from "./constants.js";

let _dbPromise = null;

/**
 * Open (and lazily memoize) the LearnWise database, creating the object
 * stores + indexes on first run / version upgrade.
 *  - events:  keyPath "id" (auto), indexes by word, ts, domain
 *  - reviews: keyPath "id" (auto), indexes by word, ts
 * @returns {Promise<IDBDatabase>}
 */
export function openDB() {
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open(IDB.NAME, IDB.VERSION);
    } catch (e) {
      reject(e);
      return;
    }

    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;

      if (!db.objectStoreNames.contains(IDB.STORES.EVENTS)) {
        const events = db.createObjectStore(IDB.STORES.EVENTS, {
          keyPath: "id",
          autoIncrement: true,
        });
        events.createIndex("word", "word", { unique: false });
        events.createIndex("ts", "ts", { unique: false });
        events.createIndex("domain", "domain", { unique: false });
      }

      if (!db.objectStoreNames.contains(IDB.STORES.REVIEWS)) {
        const reviews = db.createObjectStore(IDB.STORES.REVIEWS, {
          keyPath: "id",
          autoIncrement: true,
        });
        reviews.createIndex("word", "word", { unique: false });
        reviews.createIndex("ts", "ts", { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
    req.onblocked = () => reject(new Error("IndexedDB open blocked"));
  });

  // Don't cache a rejected promise — let the next caller retry the open.
  _dbPromise.catch(() => {
    _dbPromise = null;
  });

  return _dbPromise;
}

/** Wrap an IDBRequest in a promise. */
function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB request failed"));
  });
}

/** Wrap a transaction's completion in a promise. */
function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
  });
}

/**
 * Add many records to a store in one transaction.
 * @returns {Promise<number[]>} generated keys, in input order
 */
export async function addAll(store, records) {
  const list = Array.isArray(records) ? records : [records];
  if (!list.length) return [];
  const db = await openDB();
  const tx = db.transaction(store, "readwrite");
  const os = tx.objectStore(store);
  const keys = await Promise.all(list.map((r) => reqToPromise(os.add(r))));
  await txDone(tx);
  return keys;
}

/** Add a single record; resolves to its generated key. */
export async function add(store, record) {
  const [key] = await addAll(store, [record]);
  return key;
}

/**
 * Read every record from a store.
 * @returns {Promise<Object[]>}
 */
export async function getAll(store) {
  const db = await openDB();
  const tx = db.transaction(store, "readonly");
  const out = await reqToPromise(tx.objectStore(store).getAll());
  await txDone(tx);
  return out || [];
}

/**
 * Read records whose index value falls within `range`.
 * @param {string} store
 * @param {string} index  index name (e.g. "word", "ts", "domain")
 * @param {IDBKeyRange|IDBValidKey} range  a key range, or an exact key
 * @returns {Promise<Object[]>}
 */
export async function getAllByIndex(store, index, range) {
  const db = await openDB();
  const tx = db.transaction(store, "readonly");
  const idx = tx.objectStore(store).index(index);
  const out = await reqToPromise(idx.getAll(range));
  await txDone(tx);
  return out || [];
}

/** Count records in a store (optionally within an index range). */
export async function count(store, index = null, range = null) {
  const db = await openDB();
  const tx = db.transaction(store, "readonly");
  const target = index ? tx.objectStore(store).index(index) : tx.objectStore(store);
  const n = await reqToPromise(range == null ? target.count() : target.count(range));
  await txDone(tx);
  return n || 0;
}

/** Delete records by their primary keys in one transaction. */
export async function deleteKeys(store, keys) {
  const list = Array.isArray(keys) ? keys : [keys];
  if (!list.length) return;
  const db = await openDB();
  const tx = db.transaction(store, "readwrite");
  const os = tx.objectStore(store);
  await Promise.all(list.map((k) => reqToPromise(os.delete(k))));
  await txDone(tx);
}

/** Remove all records from a store. */
export async function clearStore(store) {
  const db = await openDB();
  const tx = db.transaction(store, "readwrite");
  await reqToPromise(tx.objectStore(store).clear());
  await txDone(tx);
}

/** Close + forget the memoized connection (mainly for tests / teardown). */
export function closeDB() {
  if (!_dbPromise) return;
  const p = _dbPromise;
  _dbPromise = null;
  p.then((db) => {
    try {
      db.close();
    } catch (_e) {
      /* no-op */
    }
  }).catch(() => {});
}
