// =====================================================================
//                     LearnWise — review (quiz) page
// ---------------------------------------------------------------------
// The M2.2 spaced-repetition review UI. Pulls due words from the bank
// (SRS state lives on each Word record), shows a flashcard, and on each
// grade advances the Leitner schedule (core/srs.js) and logs a review
// event (core/events.js → IndexedDB "reviews"). Bundled by esbuild
// (imports core/) → dist/review.js.
//
// Architecture: this is an extension-origin page, so unlike the content
// script it can read chrome.storage.local and the extension's own
// IndexedDB + bundled dictionary shards directly — no background hop.
// =====================================================================
import { REVIEW_SESSION_LIMIT, GRADES, STORAGE_KEYS } from "./core/constants.js";
import { getLocal } from "./core/storage.js";
import { getWordBank, setWordBank } from "./core/wordbank.js";
import { schedule, gradeWord, dueWords, seedNewReviews } from "./core/srs.js";
import { appendReview } from "./core/events.js";
import { fetchTranslationFromLocalDictionary } from "./dom/ecdict.js";
import { speak, speechSupported, ensureVoices } from "./dom/speech.js";

const $ = (id) => document.getElementById(id);

const state = {
  bank: {},
  queue: [], // word keys remaining this session
  current: null, // current word key
  total: 0, // distinct words this session (for progress)
  done: new Set(), // words finished (not "again")
  reviewed: 0, // total grades submitted
  again: 0, // count of "again" grades
  revealed: false,
  audio: false, // Web Speech API available
  autoplay: true, // speak the word automatically when the answer is revealed
};

/** Speak the current word (no-op if audio is unavailable). */
function speakCurrent() {
  if (state.audio && state.current) speak(state.current);
}

// ---------------------------------------------------------------------
// View helpers
// ---------------------------------------------------------------------
function showPanel(id) {
  for (const p of ["loading", "empty", "card", "done"]) {
    const el = $(p);
    if (el) el.hidden = p !== id;
  }
}

/** Human-readable "next review" gap for a grade hint. */
function intervalLabel(days) {
  if (!days || days <= 0) return "<1d";
  if (days < 30) return `${days}d`;
  const months = Math.round(days / 30);
  return `${months}mo`;
}

function updateProgress() {
  const seen = state.done.size + (state.current ? 1 : 0);
  $("progress").textContent = state.total ? `${Math.min(seen, state.total)} / ${state.total}` : "";
}

async function backFor(word) {
  const rec = state.bank[word] || {};
  let meaning = rec.meaning || "";
  let pronunciation = rec.pronunciation || "";

  // Fill from the local dictionary on demand if the record has no cached gloss
  // (most read-tracked words are glossed live, not stored). Persist when found
  // so the next review — and the dashboard — is instant.
  if (!meaning) {
    try {
      const res = await fetchTranslationFromLocalDictionary([word]);
      const hit = res[word];
      if (hit) {
        meaning = hit.meaning || "";
        pronunciation = pronunciation || hit.pronunciation || "";
        if (meaning && state.bank[word]) {
          state.bank[word].meaning = meaning;
          if (pronunciation) state.bank[word].pronunciation = pronunciation;
          state.bank[word].updatedAt = Date.now();
          await setWordBank(state.bank);
        }
      }
    } catch (_e) {
      /* dictionary unavailable → show word only */
    }
  }

  const contexts = Array.isArray(rec.recentContexts) ? rec.recentContexts : [];
  const lastCtx = contexts.length ? contexts[contexts.length - 1] : null;
  const sentence = lastCtx && typeof lastCtx === "object" ? lastCtx.sentence : lastCtx;

  return { meaning, pronunciation, sentence: sentence || "" };
}

async function renderCard() {
  state.current = state.queue.shift() || null;
  if (!state.current) {
    finishSession();
    return;
  }
  state.revealed = false;

  $("cardWord").textContent = state.current;
  $("cardBack").hidden = true;
  $("cardMeaning").textContent = "";
  $("cardPron").textContent = "";
  $("cardContext").textContent = "";
  $("showBtn").hidden = false;
  $("grades").hidden = true;
  if ($("speakBtn")) $("speakBtn").hidden = !state.audio;
  updateProgress();
  showPanel("card");
}

async function reveal() {
  if (state.revealed || !state.current) return;
  state.revealed = true;

  // Swap controls immediately: "Show answer" disappears, grade buttons appear.
  $("showBtn").hidden = true;
  $("grades").hidden = false;
  $("cardBack").hidden = false;
  $("cardPron").textContent = "";
  $("cardMeaning").textContent = "…";
  $("cardContext").textContent = "";

  // Grade hints (sync): how long until this word is due again per choice.
  const srs = state.bank[state.current]?.srs;
  for (const g of GRADES) {
    const el = $(`hint${g[0].toUpperCase()}${g.slice(1)}`);
    if (el) el.textContent = intervalLabel(schedule(srs, g, Date.now()).interval);
  }

  // Pronounce the word as the answer appears (if enabled).
  if (state.autoplay) speakCurrent();

  // Fill the answer text (async dictionary lookup) after the controls swap.
  const { meaning, pronunciation, sentence } = await backFor(state.current);
  if (!state.revealed || state.current == null) return; // user already advanced
  $("cardPron").textContent = pronunciation ? `/${pronunciation}/` : "";
  $("cardMeaning").textContent = meaning || "(no dictionary entry — grade by memory)";
  $("cardContext").textContent = sentence ? `“${sentence}”` : "";
}

async function grade(g) {
  if (!state.revealed || !state.current || !GRADES.includes(g)) return;
  const word = state.current;
  const now = Date.now();

  gradeWord(state.bank, word, g, now);
  await setWordBank(state.bank);

  const srs = state.bank[word].srs;
  try {
    await appendReview({ word, grade: g, intervalAfter: srs.interval, box: srs.box }, now);
  } catch (_e) {
    /* logging is best-effort; the schedule (source of truth) is already saved */
  }

  state.reviewed += 1;
  if (g === "again") {
    state.again += 1;
    state.queue.push(word); // re-show later this session
  } else {
    state.done.add(word);
  }

  renderCard();
}

function finishSession() {
  state.current = null;
  const reviewedWords = state.done.size;
  $("doneNote").textContent =
    `You reviewed ${reviewedWords} word${reviewedWords === 1 ? "" : "s"}` +
    (state.again ? ` · ${state.again} marked “Again”` : "") +
    `. Nice work — come back when more are due.`;
  updateProgress();
  showPanel("done");
}

async function closeTab() {
  try {
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id != null) {
      chrome.tabs.remove(tab.id);
      return;
    }
  } catch (_e) {
    /* fall through */
  }
  window.close();
}

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------
async function buildQueue() {
  state.bank = await getWordBank();
  const now = Date.now();

  // Bring newly-learned words into the review system (due now), then persist.
  const seeded = seedNewReviews(state.bank, now);
  if (seeded.length) await setWordBank(state.bank);

  const due = dueWords(state.bank, now).slice(0, REVIEW_SESSION_LIMIT);
  state.queue = due.slice();
  state.total = due.length;
  state.done = new Set();
  state.reviewed = 0;
  state.again = 0;
}

async function loadSettings() {
  state.audio = speechSupported();
  if (state.audio) ensureVoices(); // warm the voice list (async, best-effort)
  try {
    const res = await getLocal([STORAGE_KEYS.SPEECH_AUTOPLAY]);
    const v = res[STORAGE_KEYS.SPEECH_AUTOPLAY];
    state.autoplay = typeof v === "boolean" ? v : true; // default on
  } catch (_e) {
    state.autoplay = true;
  }
}

async function init() {
  await loadSettings();

  $("showBtn")?.addEventListener("click", () => reveal());
  $("grades")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-grade]");
    if (btn) grade(btn.dataset.grade);
  });
  $("speakBtn")?.addEventListener("click", () => speakCurrent());
  $("closeEmpty")?.addEventListener("click", closeTab);
  $("closeDone")?.addEventListener("click", closeTab);
  $("reviewMore")?.addEventListener("click", () => start());

  // Keyboard: space reveals, 1–4 grade, P plays pronunciation.
  document.addEventListener("keydown", (e) => {
    if ($("card").hidden) return;
    if (e.key === "p" || e.key === "P") {
      e.preventDefault();
      speakCurrent();
      return;
    }
    if (e.code === "Space" || e.key === " ") {
      e.preventDefault();
      if (!state.revealed) reveal();
      return;
    }
    if (!state.revealed) return;
    const map = { 1: "again", 2: "hard", 3: "good", 4: "easy" };
    if (map[e.key]) {
      e.preventDefault();
      grade(map[e.key]);
    }
  });

  await start();
}

async function start() {
  showPanel("loading");
  await buildQueue();
  if (!state.total) {
    showPanel("empty");
    $("progress").textContent = "";
    return;
  }
  renderCard();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
