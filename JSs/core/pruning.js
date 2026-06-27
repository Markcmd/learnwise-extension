// =====================================================================
// Event pruning — keep the log bounded without losing the totals
// ---------------------------------------------------------------------
// The raw event log grows forever, so we keep ~EVENT_RETENTION_DAYS of
// detail and collapse older events into per-word aggregates on the Word
// record (its `readCount` total + `lastSeenAt`). DESIGN.md §7.
//
// Why this is safe for familiarity: `level` is derived with a recency
// half-life (core/familiarity.js), so an event older than the retention
// window already contributes ~nothing to the level. Dropping it changes
// the score negligibly while keeping the lifetime exposure COUNT accurate
// for the dashboard (which reads `readCount`). Pure logic first, IO last.
// =====================================================================
import { normalizeWord, getWordBank, setWordBank } from "./wordbank.js";
import { EVENT_RETENTION_DAYS } from "./constants.js";
import { getEventsBefore } from "./events.js";
import { deleteKeys } from "./idb.js";
import { IDB } from "./constants.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The timestamp before which events are considered stale (pure). */
export function retentionCutoff(now = Date.now(), retentionDays = EVENT_RETENTION_DAYS) {
  const days = Number.isFinite(retentionDays) && retentionDays >= 0 ? retentionDays : EVENT_RETENTION_DAYS;
  return now - days * DAY_MS;
}

/**
 * Split events into those to keep vs. those old enough to collapse (pure).
 * @returns {{fresh:Object[], stale:Object[]}}
 */
export function partitionEvents(events, now = Date.now(), retentionDays = EVENT_RETENTION_DAYS) {
  const cutoff = retentionCutoff(now, retentionDays);
  const fresh = [];
  const stale = [];
  for (const ev of events || []) {
    const ts = Number(ev?.ts);
    if (Number.isFinite(ts) && ts < cutoff) stale.push(ev);
    else fresh.push(ev);
  }
  return { fresh, stale };
}

/**
 * Collapse stale events into per-word aggregates (pure).
 * @returns {Record<string, {count:number, lastTs:number}>}
 */
export function aggregateStale(staleEvents) {
  const out = {};
  for (const ev of staleEvents || []) {
    const key = normalizeWord(ev?.word);
    if (!key) continue;
    const ts = Number(ev?.ts) || 0;
    const agg = out[key] || (out[key] = { count: 0, lastTs: 0 });
    agg.count += 1;
    if (ts > agg.lastTs) agg.lastTs = ts;
  }
  return out;
}

/**
 * Fold aggregates into the bank's cached counters (pure).
 * Bumps `readCount` and advances `lastSeenAt` for tracked words; never
 * touches `level` (that stays derived from the surviving fresh events).
 * Untracked words are ignored. Mutates and returns `bank`.
 */
export function applyAggregatesToBank(bank, aggregates = {}, now = Date.now()) {
  for (const [rawWord, agg] of Object.entries(aggregates || {})) {
    const key = normalizeWord(rawWord);
    const entry = bank[key];
    if (!entry || typeof entry !== "object" || !agg) continue;
    entry.readCount = (Number(entry.readCount) || 0) + (Number(agg.count) || 0);
    if ((Number(agg.lastTs) || 0) > (Number(entry.lastSeenAt) || 0)) {
      entry.lastSeenAt = agg.lastTs;
    }
    entry.updatedAt = now;
  }
  return bank;
}

// ---------------------------------------------------------------------
// IO entry point
// ---------------------------------------------------------------------

/**
 * Prune the event log: collapse events older than the retention window into
 * the word bank's aggregates, then delete them from IndexedDB. Safe to call
 * periodically (e.g. on startup from the background worker).
 * @returns {Promise<{prunedCount:number, words:number}>}
 */
export async function pruneEvents(now = Date.now(), retentionDays = EVENT_RETENTION_DAYS) {
  const cutoff = retentionCutoff(now, retentionDays);
  const stale = await getEventsBefore(cutoff);
  if (!stale.length) return { prunedCount: 0, words: 0 };

  const aggregates = aggregateStale(stale);

  const bank = await getWordBank();
  applyAggregatesToBank(bank, aggregates, now);
  await setWordBank(bank);

  const ids = stale.map((e) => e.id).filter((id) => id != null);
  if (ids.length) await deleteKeys(IDB.STORES.EVENTS, ids);

  return { prunedCount: stale.length, words: Object.keys(aggregates).length };
}
