// =====================================================================
//                       LearnWise — content script
// ---------------------------------------------------------------------
// Thin glue: it wires the scanner + renderer (dom/) to the pure logic
// (core/). All word-bank, migration, caching, and promotion logic lives
// in importable, tested modules. esbuild bundles this into dist/.
// =====================================================================
import { getLocal } from "./core/storage.js";
import { STORAGE_KEYS, STOP_GLOSS_LEVEL } from "./core/constants.js";
import {
  getWordBank,
  setWordBank,
  isWordBankExist,
  createEmptyWordBank,
  insertWords,
  applyExposures,
  splitWords,
  markKnown,
} from "./core/wordbank.js";
import { runMigration } from "./core/migration.js";
import {
  wordsNeedingTranslation,
  buildShowDict,
  mergeTranslationsIntoBank,
  normalizeSource,
} from "./core/translation.js";
import {
  recordSightings,
  getSightings,
  setSightings,
  getPromotionThreshold,
} from "./core/promotion.js";
import {
  buildExposureEvents,
  appendExposures,
  getEventsForWord,
  locationForEvent,
} from "./core/events.js";
import { recomputeLevels, applyDerivedLevels } from "./core/familiarity.js";
import { scanViewport } from "./dom/scanner.js";
import { renderRuby } from "./dom/renderer.js";
import { fetchTranslationFromLocalDictionary } from "./dom/ecdict.js";
import { mostCommonWordsList } from "./data/commonWords.js";

// ---------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------
async function isLearnWiseEnabled() {
  const res = await getLocal([STORAGE_KEYS.ENABLED]);
  return typeof res[STORAGE_KEYS.ENABLED] === "boolean" ? res[STORAGE_KEYS.ENABLED] : true;
}

async function getTranslationSource() {
  const res = await getLocal([STORAGE_KEYS.TRANSLATION_SOURCE]);
  return normalizeSource(res[STORAGE_KEYS.TRANSLATION_SOURCE]);
}

// Privacy: log the full page URL only if the user opted in; domain-only otherwise.
async function shouldLogFullUrl() {
  const res = await getLocal([STORAGE_KEYS.LOG_FULL_URL]);
  return res[STORAGE_KEYS.LOG_FULL_URL] === true;
}

// Words already logged this page-visit, so scrolling doesn't inflate counts:
// we want roughly one exposure event per word per page view.
const PAGE_LOGGED = new Set();

// ---------------------------------------------------------------------
// Translation: cache → local dictionary. (BYO-key 'api' arrives in M1.)
// Page-level cache dedupes repeated lookups of the same word across scroll
// passes for untracked words that aren't cached in the bank yet.
// ---------------------------------------------------------------------
const PAGE_MEANING_CACHE = new Map();

async function fetchTranslations(words, _sentence) {
  const out = {};
  const toLookup = [];
  for (const w of words) {
    if (PAGE_MEANING_CACHE.has(w)) out[w] = PAGE_MEANING_CACHE.get(w);
    else toLookup.push(w);
  }
  if (!toLookup.length) return out;

  let source = await getTranslationSource();
  if (source === "api") {
    // BYO-key translation isn't built yet (M1). Degrade to local cleanly.
    console.warn("[LearnWise] 'api' translation not available yet; using local dictionary.");
    source = "local";
  }

  const fetched = await fetchTranslationFromLocalDictionary(toLookup);
  for (const [w, d] of Object.entries(fetched)) {
    PAGE_MEANING_CACHE.set(w, d);
    out[w] = d;
  }
  return out;
}

// ---------------------------------------------------------------------
// Click-to-know IO
// ---------------------------------------------------------------------
async function markWordKnownIO(word) {
  const now = Date.now();
  // Log the assertion as a fact (clicked_known pins derived familiarity to max),
  // then update the cached bank record.
  try {
    const { domain, url } = locationForEvent(
      { domain: location.hostname, url: location.href },
      await shouldLogFullUrl()
    );
    await appendExposures(
      buildExposureEvents([word], { domain, url, action: "clicked_known" }, now),
      now
    );
  } catch (err) {
    console.warn("[LearnWise] clicked_known logging failed:", err);
  }
  const bank = await getWordBank();
  markKnown(bank, word, now);
  await setWordBank(bank);
}

// ---------------------------------------------------------------------
// Pass runner
// ---------------------------------------------------------------------
let LW_PASS_RUNNING = false;
let LW_PASS_PENDING = false;

async function runLearnWisePass() {
  if (!(await isLearnWiseEnabled())) return;

  if (LW_PASS_RUNNING) {
    LW_PASS_PENDING = true;
    return;
  }
  LW_PASS_RUNNING = true;

  try {
    // 1) ONE DOM pass → words, sentence context, and the text nodes to render.
    const { words, sentence, nodes } = scanViewport();

    // 2) Load the bank once; classify visible words.
    const bank = await getWordBank();
    const { show, unknown } = splitWords(words, bank, STOP_GLOSS_LEVEL);
    const now = Date.now();
    const threshold = await getPromotionThreshold();

    // 3) Promotion: count sightings of untracked words; promote on Nth.
    let promoted = [];
    if (unknown.size > 0) {
      const sightings = await getSightings();
      const r = recordSightings(sightings, unknown, threshold);
      await setSightings(r.sightings);
      promoted = r.promoted;
    }

    if (show.size === 0) return;

    // 4) Translation caching: only look up words without a cached meaning.
    const showArr = Array.from(show);
    const needLookup = wordsNeedingTranslation(showArr, bank);
    const fetched = needLookup.length ? await fetchTranslations(needLookup, sentence) : {};

    // 5) Build render dict (cached bank meanings + fresh lookups).
    const showDict = buildShowDict(showArr, bank, fetched);

    // 6) Update bank: passive exposures, promote new words, cache meanings.
    applyExposures(bank, show, now);
    if (promoted.length) {
      const toInsert = {};
      for (const w of promoted) {
        const d = showDict[w] || {};
        toInsert[w] = {
          meaning: d.meaning || "",
          pronunciation: d.pronunciation || "",
          readCount: threshold,
          source: "read",
        };
      }
      insertWords(bank, toInsert, now);
    }
    mergeTranslationsIntoBank(bank, fetched, now);

    // 6b) Log exposure events (the source of truth) for words shown this
    //     page-visit, then DERIVE familiarity from the full event history.
    //     Logging once per word per page keeps scroll passes from inflating
    //     counts; pruning (background) keeps the log bounded.
    const newlyShown = showArr.filter((w) => !PAGE_LOGGED.has(w));
    if (newlyShown.length) {
      try {
        const { domain, url } = locationForEvent(
          { domain: location.hostname, url: location.href },
          await shouldLogFullUrl()
        );
        const events = buildExposureEvents(
          newlyShown,
          { domain, url, sentence, action: "glossed" },
          now
        );
        await appendExposures(events, now);
        for (const w of newlyShown) PAGE_LOGGED.add(w);

        // Recompute derived levels for the words we just logged.
        const eventsByWord = {};
        await Promise.all(
          newlyShown.map(async (w) => {
            eventsByWord[w] = await getEventsForWord(w);
          })
        );
        applyDerivedLevels(bank, recomputeLevels(eventsByWord, now), now);
      } catch (err) {
        // Event logging is best-effort; never let it break glossing.
        console.warn("[LearnWise] exposure logging failed:", err);
      }
    }

    await setWordBank(bank);

    // 7) Render reusing the scanner's nodes (no second DOM walk).
    renderRuby(nodes, showDict, (w) => {
      markWordKnownIO(w).catch((err) => console.warn("[LearnWise] markWordKnown failed:", err));
    });
  } finally {
    LW_PASS_RUNNING = false;
    if (LW_PASS_PENDING) {
      LW_PASS_PENDING = false;
      await runLearnWisePass().catch(handlePassError);
    }
  }
}

// ---------------------------------------------------------------------
// UI: non-blocking toast
// ---------------------------------------------------------------------
function showLearnWiseToast(message) {
  try {
    const id = "learnwise-toast";
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("div");
      el.id = id;
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      Object.assign(el.style, {
        position: "fixed",
        top: "12px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: "2147483647",
        maxWidth: "92vw",
        padding: "10px 12px",
        borderRadius: "10px",
        border: "1px solid rgba(0,0,0,0.2)",
        background: "rgba(20,20,20,0.92)",
        color: "#fff",
        fontSize: "13px",
        lineHeight: "1.25",
        boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
        pointerEvents: "auto",
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "pre-wrap",
      });
      el.addEventListener("click", () => {
        try { el.remove(); } catch (_e) {}
      });
      document.documentElement.appendChild(el);
    }
    el.textContent = String(message || "");
    if (el.__lwTimer) clearTimeout(el.__lwTimer);
    el.__lwTimer = setTimeout(() => {
      try { el.remove(); } catch (_e) {}
    }, 6000);
  } catch (_e) {
    /* no-op */
  }
}

// When the extension is reloaded/updated mid-session the old context becomes
// invalid; treat that as a shutdown signal and stop scheduling work.
let schedulePass = null;
function handlePassError(e) {
  const msg = String(e?.message || e || "");
  if (msg.includes("Extension context invalidated")) {
    console.warn("[LearnWise] Extension updated/reloaded. Please refresh this tab.");
    showLearnWiseToast("LearnWise: extension updated. Refresh this tab to resume.");
    try { schedulePass?.cancel?.(); } catch (_err) {}
    try {
      window.removeEventListener("scroll", schedulePass);
      window.removeEventListener("resize", schedulePass);
    } catch (_err) {}
    return;
  }
  console.warn("[LearnWise] Pass failed:", e);
}

// ---------------------------------------------------------------------
// Debounce
// ---------------------------------------------------------------------
function debounce(fn, waitMs) {
  let t = null;
  const wrapped = (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), waitMs);
  };
  wrapped.cancel = () => {
    if (t) clearTimeout(t);
    t = null;
  };
  return wrapped;
}

// ---------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------
(async () => {
  console.log("[LearnWise] Content script loaded.");

  // 0) Data safety: migrate the bank to the current schema before anything reads it.
  try {
    await runMigration();
  } catch (e) {
    handlePassError(e);
  }

  // 1) Ensure a word bank exists; seed known words on very first run.
  if (!(await isWordBankExist())) {
    await createEmptyWordBank();
    const bank = await getWordBank();
    insertWords(bank, mostCommonWordsList(), Date.now());
    await setWordBank(bank);
    console.log("[LearnWise] Seeded initial known-words bank.");
  }

  // 2) Initial pass.
  await runLearnWisePass().catch(handlePassError);

  // 3) Re-run on scroll/resize (debounced).
  schedulePass = debounce(() => {
    runLearnWisePass().catch(handlePassError);
  }, 250);
  window.addEventListener("scroll", schedulePass, { passive: true });
  window.addEventListener("resize", schedulePass);
})();
