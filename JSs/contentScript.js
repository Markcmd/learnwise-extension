// =====================================================================
//                       LearnWise — content script
// ---------------------------------------------------------------------
// Thin glue: it wires the scanner + renderer (dom/) to the pure logic
// (core/). All word-bank, migration, caching, and promotion logic lives
// in importable, tested modules. esbuild bundles this into dist/.
// =====================================================================
import { getLocal } from "./core/storage.js";
import { STORAGE_KEYS, STOP_GLOSS_LEVEL, MSG } from "./core/constants.js";
import {
  getWordBank,
  setWordBank,
  isWordBankExist,
  createEmptyWordBank,
  insertWords,
  applyExposures,
  splitWords,
  markKnown,
  demoteWord,
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
  deleteEventsForWord,
} from "./core/events.js";
import { recomputeLevels, applyDerivedLevels } from "./core/familiarity.js";
import { scanViewport } from "./dom/scanner.js";
import { renderRuby } from "./dom/renderer.js";
import { installSelectionAction } from "./dom/selectionAction.js";
import { fetchTranslationFromLocalDictionary } from "./dom/ecdict.js";

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
// Translation routing: cache → (byok | local). The page-level cache dedupes
// repeated lookups of the same word across scroll passes; the word bank
// caches meanings permanently, so each word is fetched at most once.
//   • local   → offline ECDICT dictionary
//   • byok    → the user's OpenAI key, via the background worker (CORS);
//               any word the model doesn't return falls back to local
//   • managed → v2 (not built) → local
// ---------------------------------------------------------------------
const PAGE_MEANING_CACHE = new Map();

// Warn the user at most once per page if smart translation degrades to local.
let BYOK_WARNED = false;
function warnByokOnce(message) {
  if (BYOK_WARNED) return;
  BYOK_WARNED = true;
  showLearnWiseToast(`LearnWise: ${message} Using the local dictionary.`);
}

/** Ask the background worker to translate via the user's OpenAI key. */
async function fetchViaByok(words, sentence) {
  try {
    const resp = await chrome.runtime.sendMessage({
      type: MSG.TRANSLATE_BYOK,
      words,
      sentence,
    });
    if (resp && resp.ok) return resp.translations || {};
    warnByokOnce(resp?.error?.message || "Smart translation failed.");
    return {};
  } catch (e) {
    // Extension-context-invalidated etc. bubble up to the pass error handler.
    if (String(e?.message || e).includes("Extension context invalidated")) throw e;
    warnByokOnce("Smart translation is unavailable.");
    return {};
  }
}

function cacheAndCollect(out, fetched) {
  for (const [w, d] of Object.entries(fetched)) {
    PAGE_MEANING_CACHE.set(w, d);
    out[w] = d;
  }
}

async function fetchTranslations(words, sentence) {
  const out = {};
  const toLookup = [];
  for (const w of words) {
    if (PAGE_MEANING_CACHE.has(w)) out[w] = PAGE_MEANING_CACHE.get(w);
    else toLookup.push(w);
  }
  if (!toLookup.length) return out;

  const source = await getTranslationSource();
  let remaining = toLookup;

  if (source === "byok") {
    const translations = await fetchViaByok(toLookup, sentence);
    remaining = [];
    for (const w of toLookup) {
      const d = translations[w];
      if (d && String(d.meaning || "").trim()) {
        PAGE_MEANING_CACHE.set(w, d);
        out[w] = d;
      } else {
        remaining.push(w); // model skipped it → fill the gap from local
      }
    }
  } else if (source === "managed") {
    console.warn("[LearnWise] 'managed' translation is a v2 feature; using local dictionary.");
  }

  if (remaining.length) {
    cacheAndCollect(out, await fetchTranslationFromLocalDictionary(remaining));
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
// Select-to-review: is this selected word a known word we can demote?
// ---------------------------------------------------------------------
async function isReviewableWord(word) {
  const bank = await getWordBank();
  const entry = bank[word];
  return !!(entry && typeof entry === "object" && Number(entry.level || 0) >= STOP_GLOSS_LEVEL);
}

// Demote a known word back into the glossing range (the user forgot it). Done
// locally — the content script has the bank + event log — then re-render so it
// gets glossed right away.
async function reviewAgainIO(word) {
  const now = Date.now();
  const bank = await getWordBank();
  demoteWord(bank, word, undefined, now);
  await setWordBank(bank);
  try {
    await deleteEventsForWord(word);
  } catch (err) {
    console.warn("[LearnWise] clearing events on demote failed:", err);
  }
  PAGE_LOGGED.delete(word);
  PAGE_MEANING_CACHE.delete(word);
  showLearnWiseToast(`LearnWise: "${word}" reset — it'll be glossed again as you read.`);
  await runLearnWisePass().catch(handlePassError);
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

  // 1) Ensure a word bank exists. The known-words baseline now comes from the
  //    first-run onboarding calibration (M1.5), not a hardcoded seed — so we
  //    just create an empty bank if none exists and let onboarding fill it.
  if (!(await isWordBankExist())) {
    await createEmptyWordBank();
    console.log("[LearnWise] Created empty word bank (awaiting onboarding).");
  }

  // 2) Initial pass.
  await runLearnWisePass().catch(handlePassError);

  // 3) Re-run on scroll/resize (debounced).
  schedulePass = debounce(() => {
    runLearnWisePass().catch(handlePassError);
  }, 250);
  window.addEventListener("scroll", schedulePass, { passive: true });
  window.addEventListener("resize", schedulePass);

  // 4) Select-to-review: selecting a known word shows a "Review again" button.
  installSelectionAction({
    isReviewable: (w) => isReviewableWord(w),
    onReviewAgain: (w) => reviewAgainIO(w).catch(handlePassError),
  });
})();
