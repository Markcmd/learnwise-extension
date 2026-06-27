// =====================================================================
//                 LearnWise — first-run onboarding page
// ---------------------------------------------------------------------
// Runs the vocabulary calibration test, estimates the user's known-word
// count, and seeds the word bank so familiar words aren't glossed. Bundled
// by esbuild (imports the pure logic in core/onboarding.js + the frequency
// list) → dist/onboarding.js.
// =====================================================================
import { STORAGE_KEYS } from "./core/constants.js";
import { getLocal, setLocal } from "./core/storage.js";
import { getWordBank, setWordBank, insertWords } from "./core/wordbank.js";
import {
  buildCalibrationTest,
  estimateVocabulary,
  buildKnownSeed,
} from "./core/onboarding.js";
import { FREQUENCY_WORDS, FREQUENCY_WORD_COUNT } from "./data/frequencyWords.js";

const $ = (id) => document.getElementById(id);

let CURRENT_TEST = []; // [{ word, band, rank }]

function renderTest() {
  // Fresh random sample each take.
  CURRENT_TEST = buildCalibrationTest(FREQUENCY_WORDS, {
    seed: (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0,
  });

  const grid = $("wordGrid");
  grid.innerHTML = "";
  for (const item of CURRENT_TEST) {
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = item.word;
    cb.dataset.band = String(item.band);
    const span = document.createElement("span");
    span.textContent = item.word;
    label.appendChild(cb);
    label.appendChild(span);
    grid.appendChild(label);
  }
  $("status").textContent = `${CURRENT_TEST.length} words — check the ones you know.`;
}

function collectResults() {
  const boxes = $("wordGrid").querySelectorAll('input[type="checkbox"]');
  return Array.from(boxes).map((cb) => ({
    band: Number(cb.dataset.band),
    known: cb.checked,
  }));
}

async function seeResult() {
  const results = collectResults();
  const { estimatedVocab } = estimateVocabulary(results, FREQUENCY_WORD_COUNT);

  // Seed every word up to the estimate as known (insertWords never overwrites).
  const seed = buildKnownSeed(FREQUENCY_WORDS, estimatedVocab);
  const bank = await getWordBank();
  insertWords(bank, seed, Date.now());
  await setWordBank(bank);
  await setLocal({
    [STORAGE_KEYS.ONBOARDED]: true,
    [STORAGE_KEYS.ESTIMATED_VOCAB]: estimatedVocab,
  });

  $("vocabCount").textContent = String(estimatedVocab);
  $("resultNote").textContent = estimatedVocab >= FREQUENCY_WORD_COUNT
    ? `We marked the ${FREQUENCY_WORD_COUNT} most common words as known. Rarer words will still be glossed as you read.`
    : `We marked your ~${estimatedVocab} most-common known words so they won't be glossed. You can retake this anytime from Settings.`;
  $("testArea").style.display = "none";
  $("result").classList.add("show");
}

function retake() {
  $("result").classList.remove("show");
  $("testArea").style.display = "";
  renderTest();
}

async function finish() {
  // Close the onboarding tab if we can; otherwise just acknowledge.
  try {
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id != null) {
      chrome.tabs.remove(tab.id);
      return;
    }
  } catch (_e) {
    /* fall through */
  }
  $("resultNote").textContent = "All set! You can close this tab.";
}

async function init() {
  $("seeResult")?.addEventListener("click", () => seeResult().catch((e) => {
    $("status").textContent = `Error: ${String(e?.message || e)}`;
  }));
  $("finish")?.addEventListener("click", finish);
  $("retake")?.addEventListener("click", retake);

  // If already onboarded, let them know but still allow a retake.
  const res = await getLocal([STORAGE_KEYS.ONBOARDED, STORAGE_KEYS.ESTIMATED_VOCAB]);
  if (res[STORAGE_KEYS.ONBOARDED]) {
    $("status").textContent =
      `You've already set up (estimated ${res[STORAGE_KEYS.ESTIMATED_VOCAB] || 0} words). Retaking will only add words, never remove them.`;
  }
  renderTest();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
