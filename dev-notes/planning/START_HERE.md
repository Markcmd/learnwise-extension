# START HERE — LearnWise project state

_If you're a new chat (or future Mark): read this first, then the linked docs. Everything important is written down — nothing lives only in chat._

## What this is
A Chrome extension (Manifest V3) that helps people learn English vocabulary while they read the web: it glosses unknown words inline (Chinese), tracks familiarity in a personal word bank, and will grow into a full vocab coach (smart translations, spaced-repetition review, audio, progress dashboard). **Goal: a public Chrome Web Store product.**

## Read these, in order
1. **`PLAN.md`** — the master plan: vision, feature tiers (basic vs later), how features connect, milestones (M0–M4), testing strategy, quality gates, and the **decisions log (Section 10)**.
2. **`DESIGN.md`** — the buildable blueprint: data model (ER diagram), component architecture, key flows, target file structure.
3. **`ESTIMATES.md`** — detailed task breakdown with time estimates per milestone.
4. **`README.md`** — one-line product description.

## Key decisions already made (don't re-litigate)
- **No server.** EC2 is shut down. Default translation = **local ECDICT dictionary** (offline, free). Smart AI translation is opt-in **bring-your-own-key** (free tier) or **managed** (paid, v2).
- **Data principle: store facts, derive scores.** Log exposure events; `level`/familiarity is a *derived cache*, not source of truth.
- **Storage:** word bank + decks + settings in `chrome.storage.local`; full event log in **IndexedDB**. Add `schemaVersion` + migration early (data safety).
- **Word promotion:** gloss + log on 1st sighting; promote to a tracked word on the **Nth sighting (configurable, default 2)**.
- **Privacy:** log **domain-only by default**, full-URL is a user opt-in.
- **Grouping:** managed **decks** (referenced by `Word.tags`).
- **Monetization (v2):** freemium — free = local + BYO-key + local-only storage; paid = managed translations + cloud sync (share one accounts+billing foundation).
- **Sync backend (v2, undecided):** leaning **Supabase**; confirm at v2.
- **Tests:** pure logic (migration, familiarity, SRS, caching) is test-first; UI is manual.

## Where we left off
- **M0 — DONE** (committed "M0 completed"): caching, key removal, `unlimitedStorage`, `schemaVersion` + migration, one-pass DOM. Core is pure + tested.
- **M1 foundation (1.1–1.3) — DONE**: the IndexedDB event log + derived familiarity + pruning. New modules:
  - `core/idb.js` — promise wrapper over IndexedDB (`events` + `reviews` stores, indexed by word/ts/domain).
  - `core/events.js` — exposure-event builders (pure) + append/query IO. Privacy: **domain-only by default**, full URL opt-in (`lw_log_full_url`).
  - `core/familiarity.js` — derive `level` (0–100) from exposure events with a 30-day recency half-life + saturating curve. "Store facts, derive scores."
  - `core/pruning.js` — collapse events older than 90 days into the Word's `readCount` aggregate, then delete them. Wired into `background.js` (install + startup).
  - Content script now logs one exposure event per word per page-visit and derives familiarity from the log; click-to-known logs a `clicked_known` event.
  - Tests: `tests/events.test.js`, `tests/familiarity.test.js`, `tests/pruning.test.js`. IndexedDB IO tested via **`fake-indexeddb`** (added to devDependencies + `tests/setup.js`).

- **M1 task 1.4 — BYO-key smart translations — DONE (now multi-provider)**:
  - `TRANSLATION_SOURCES` is now `local | byok | managed` (legacy `"api"` aliases to `byok`).
  - **Providers** (`core/providers.js`): a registry of `openai`, `anthropic`, `openrouter`, and `custom` (OpenAI-compatible / local). Two request shapes — OpenAI Chat Completions and Anthropic Messages. `core/translation.js` holds the pure, provider-aware helpers (`validateApiKey(key,provider)`, `normalizeModel`, `buildProviderRequest`, `parseProviderResponse`, `classifyProviderError`); OpenAI-named wrappers kept for back-compat.
  - **Per-provider storage** (`core/byokSettings.js`): keys/models are stored as `{providerId: …}` maps so switching providers never loses a key. Resolves the active config and migrates the legacy single OpenAI key.
  - **CORS:** the provider call runs in the **background worker** (`background.js` handles `MSG.TRANSLATE_BYOK`); `dom/llm.js` is the provider-agnostic fetch (`dom/openai.js` is now a back-compat shim). `manifest.json` host_permissions: `api.openai.com`, `api.anthropic.com`, `openrouter.ai`; `custom`/local uses **`optional_host_permissions`** requested at runtime (Settings → "Grant access"). Version → 1.0.3.
  - Content script routes by source and **falls back to the local dictionary** on any byok error/offline (one toast/page); the key is read only in the background, never on the page.
  - **Settings/popup sync:** both now listen to `chrome.storage.onChanged`, so changing the source/provider in one window updates the other live (without clobbering a field you're editing).
  - **`settingsWindow.js` and `popup.js` are plain classic scripts** (no ES imports, NOT bundled) loaded directly from `JSs/` — so the settings UI works without `npm run build`. They inline small mirrors of `core/providers.js` / `core/byokSettings.js` (keep in sync). The settings page shows: source, provider dropdown, per-provider model (preset dropdown or free-text for custom), key field, custom base-URL + Grant-access button, Save / "Save & test". (Earlier these were briefly bundled to `dist/settingsWindow.js`, which broke the page when `dist/` was stale — reverted.)
  - Tests: `tests/translation_byok.test.js`, `tests/providers.test.js`, `tests/byokSettings.test.js`. Verified independently with Node (37 provider assertions).

> **Verification + build note:** authored without npm access, so vitest/esbuild have not run here. Before loading the extension you **must** run `npm install && npm run build` (the build now also emits `dist/settingsWindow.js`, and `dist/` must be regenerated). Then `npm test` to confirm green. All M1 pure logic was independently verified with Node.

- **M1 task 1.5 — real onboarding — DONE (M1 COMPLETE)**:
  - First-run **vocabulary calibration test** (Vocabulary-Size-Test style): samples words across frequency bands, asks which the user knows, estimates vocabulary = Σ(known fraction per band × band size), then seeds every word up to that rank as known (so they aren't glossed). Replaces the hardcoded `commonWords.js` seed (content script now just creates an empty bank).
  - `core/onboarding.js` — pure, seeded, tested logic (`buildCalibrationTest`, `estimateVocabulary`, `buildKnownSeed`, `bandBounds`, `makeRng`). `tests/onboarding.test.js`.
  - **Data:** `JSs/data/frequencyWords.js` — **1,797 clean, frequency-ordered words** from google-10000-english (Google Trillion-Word/COCA corpus, public domain), filtered to drop single letters, abbreviations, brand/place/proper names, and adult/spam tokens.
  - **Page:** `HTMLs/onboarding.html` + `JSs/onboarding.js` (**bundled** → `dist/onboarding.js`, since it imports the calibration logic + word list). Opened automatically by the background worker on install (`onInstalled` reason `install`) if not yet onboarded; also re-openable via Settings → "Redo vocabulary setup". Re-takes only ADD known words (insertWords never overwrites).
  - Verified independently with Node (17 onboarding assertions).

- **Post-M1 UI tweaks:** (1) Settings hides the provider/model/key/base-URL/buttons unless source = "smart (byok)". (2) **"Review again"** per-word button in the Settings word bank: demotes a "known" word back into the glossing range (`demoteWord` in core/wordbank.js sets level → `DEMOTE_LEVEL` 20 / status "learning") and clears that word's events via the background `MSG.DEMOTE_WORD` handler (so the `clicked_known` pin doesn't re-apply). Click-to-know still pins permanently; this is the manual undo. Tests in `tests/demote.test.js`.

- **M2 task 2.1 — SRS scheduler (Leitner + ease) — DONE (test-first)**:
  - `core/srs.js` — pure, deterministic scheduler over each Word's reserved `srs` sub-object. Leitner boxes 1–5 with fixed base intervals (`LEITNER.INTERVALS_DAYS = [_,1,3,7,16,35]` days) plus an SM-2 `ease` multiplier. Grades (`GRADES = again|hard|good|easy`): **again** → reset to box 1, due this session (interval 0), reps 0, ease −0.20; **hard** → stay in box at half the box interval, ease −0.15; **good** → +1 box at the box interval, ease ±0; **easy** → +2 boxes with an ease bonus, ease +0.15. Ease clamped to [1.3, 3.0]; good/easy intervals scale by `ease/2.5`.
  - Exports: `schedule(srs,grade,now)` (pure, returns new srs), `seedReview(srs,now)` (enter the review system; due after box-1 interval, not yet "reviewed"), `isDue`, `dueWords(bank,now)` (due keys sorted most-overdue-first), `countDue`, `gradeWord(bank,word,grade,now)` (mutating bank convenience, mirrors `applyExposures`), plus `normalizeSrs`/`clampEase`/`clampBox`/`intervalForBox`. A never-scheduled card (`nextReviewAt` 0) is **not** due — words enter review only via `seedReview`/`schedule`.
  - Constants added to `core/constants.js`: `GRADES`, `LEITNER` (boxes, intervals, ease deltas/clamps, hard factor, again interval).
  - Tests: `tests/srs.test.js` (test-first). Independently verified with Node — **43 assertions pass** (vitest/npm still unavailable in-session; run `npm test` on your machine to confirm green). `srs.js` is pure (no chrome/DOM) so **no rebuild needed** for it; it'll be bundled into `contentScript.js`/`background.js` automatically once 2.2 imports it.

- **M2 task 2.2 — Review queue + quiz UI — DONE**:
  - **New page** `HTMLs/review.html` + `CSSs/review.css` + `JSs/review.js` (**bundled** → `dist/review.js`; added to `build.mjs` entryPoints). It's an extension-origin page, so unlike the content script it reads `chrome.storage.local`, the extension's own IndexedDB, and the bundled ECDICT shards **directly** — no background hop.
  - **Flow:** on open it `seedNewReviews(bank)` (brings review-eligible, not-yet-scheduled words into the system **due now**), then builds the session queue from `dueWords(bank)` capped at `REVIEW_SESSION_LIMIT` (40). Flashcard shows the word → "Show answer" reveals pronunciation + meaning + last context sentence → four grade buttons (**Again/Hard/Good/Easy**, also keys 1–4; Space reveals). Each grade calls `gradeWord` (persists the new Leitner state to the bank) and logs a `review` event to IndexedDB. **"Again"** re-queues the word later in the same session. Empty-state and session-summary panels included.
  - **Card backs:** most read-tracked words have no cached gloss (glossing is live), so the back is filled on demand via `fetchTranslationFromLocalDictionary` and the meaning is written back onto the bank record (enriches the bank + dashboard; never clobbers a BYOK meaning).
  - **SRS additions** (`core/srs.js`): `seedReview(srs, now, {dueNow})`, `isReviewEligible`, `isUnscheduled`, `seedNewReviews`. Eligibility = tracked, not `known`/`ignored`, level < STOP_GLOSS_LEVEL.
  - **Review events** (`core/events.js`): `makeReviewEvent` (pure; maps grade→quality via `GRADE_QUALITY`, stores `intervalAfter`+`box`) + IO `appendReview`/`appendReviews`/`getReviewsForWord`/`countReviews` over the IDB `reviews` store (created back in M1).
  - **Constants:** `GRADE_QUALITY {again:1,hard:3,good:4,easy:5}`, `REVIEW_SESSION_LIMIT = 40`.
  - **Popup entry point:** `HTMLs/popup.html` now has a **Review** button (opens `review.html`) with a due-count badge. `popup.js` is an unbundled classic script, so it **inlines** a small `countReviewDue` mirror of `srs.isReviewEligible`/`dueWords`/`seedNewReviews` — **keep it in sync** if that logic changes. Manifest → 1.0.4.
  - Tests: `tests/review.test.js` (review-event pure + IndexedDB round-trip via fake-indexeddb) and extended `tests/srs.test.js` (dueNow, eligibility, seeding). Independently verified with Node — **61 SRS/review assertions pass** (run `npm test` on your machine for the full vitest suite).

> **Build note for 2.2:** `dist/` now has **FIVE** bundles — `contentScript.js`, `background.js`, `onboarding.js`, **`review.js`**. Run `npm run build` so `dist/review.js` exists before loading the extension (esbuild can't run in the authoring sandbox — native binary is host-specific). Then `npm test`.

- **M2 task 2.3 — Pronunciation audio — DONE**:
  - **`JSs/dom/speech.js`** — thin wrapper over `window.speechSynthesis`: `speak(text,{lang,rate})` (cancels any in-flight utterance first), `cancelSpeech`, `speechSupported`, `ensureVoices` (warms the async voice list), and the **pure, tested** `pickEnglishVoice(voices, lang)` (exact lang → any `en-*` → platform default → first). Defaults in `SPEECH = { LANG:"en-US", RATE:0.95 }`.
  - **Review cards:** a round speaker button (`#speakBtn`) next to the word; the word is auto-pronounced when the answer is revealed (toggle `STORAGE_KEYS.SPEECH_AUTOPLAY`, default on), and **P** also plays. Button hidden when the API is unavailable.
  - **Glossed words:** **Alt/Option+click** a gloss pronounces it (plain click still = "I know this"); the ruby gets a `title` hint "Click: I know this · Alt+click: hear it". `renderer.js` imports `speak` from `dom/speech.js`.
  - Tests: `tests/speech.test.js` (voice precedence). Node-verified — **8 assertions pass**.
  - **No new bundle**; `speech.js` is pulled into `dist/review.js` and `dist/contentScript.js` (via renderer) on the next `npm run build`. Manifest → 1.0.5.

- **M2 task 2.4 — Decks + manual capture — DONE** (decks **pivoted to automatic** — see below):
  - **Manual capture (highlight-to-save):** `dom/selectionAction.js` was generalized from the old `isReviewable`/`onReviewAgain` pair to a single **`resolveAction(word) → {label, run}|null`** so the floating button is fully data-driven. `contentScript.js` now resolves: known word → "Review again"; untracked word → **"Save word"** (`captureWordIO`: looks up the meaning, inserts a `source:"manual"` record at a glossing level, and `seedReview`s it **due now**); already-learning word → no button. (`contentScript.js` now imports `core/srs.js`.)
  - **Decks = AUTOMATIC difficulty groups (not manual).** Per user decision (2026-06-28): *"users never operate on decks"* — so there is **no deck CRUD, no tagging UI**. A word's deck is **derived** from its frequency rank, like familiarity ("store facts, derive scores").
    - **`JSs/core/difficulty.js`** (pure, tested): `buildRankIndex(words)`, `rankOf`, `bandForRank`, `bandForWord`, `groupByDifficulty`, `DIFFICULTY_BANDS`. Bands by rank: **Beginner 1–600 · Intermediate 601–1200 · Advanced 1201+ · Rare = not in the list**.
    - **`data/frequency.json`** — a generated, web-accessible mirror of `JSs/data/frequencyWords.js` (1,797 words). The unbundled settings page `fetch`es it to build the rank index; the JS module stays the source of truth (regenerate the JSON if you edit the list). Added to `manifest` `web_accessible_resources`.
    - **Settings:** the **Decks** card now renders four collapsible difficulty groups with live counts (reusing the folder UI); each word's detail shows a read-only **Difficulty** row. `settingsWindow.js` inlines the band thresholds (mirror of `core/difficulty.js` — keep in sync).
    - **Removed:** `core/decks.js`, `tests/decks.test.js`, `STORAGE_KEYS.DECKS`, and all manual deck CRUD/chips from settings. `Word.tags` stays as a reserved field (unused for now).
  - Tests: `tests/difficulty.test.js`. Node-verified — **24 assertions pass** (incl. frequency.json parity: #600 "sun" = Beginner boundary). Manifest → 1.0.7.
  - **Build:** re-run `npm run build` to refresh `dist/contentScript.js` (capture change). The settings difficulty view needs no build (classic script + fetched JSON), but `data/frequency.json` must ship in the loaded extension.

- **M2 task 2.5 — Export / import — DONE**:
  - **`JSs/core/exportImport.js`** (pure, tested): `buildExport(bank)` wraps the bank in a self-describing envelope (`format:"learnwise-export"`, `exportVersion`, `schemaVersion`, `exportedAt`, `wordCount`, `wordbank`); `extractBank`/`parseImport` read either the envelope **or** a legacy raw-bank dump; `mergeBank(current, incoming)` merges **by `updatedAt` — newer record wins**, returning a new bank + `{added, updated, skipped}` (no mutation; missing `updatedAt` = 0). Decks aren't serialized (derived from frequency rank).
  - **Settings:** the toolbar's old "Download" is now **Export** (wrapped envelope) and a new **Import** button + hidden file input restores a backup: read file → parse → `mergeBank` with the live bank → save → refresh, with a status line (`+X new, Y updated, Z skipped`). `settingsWindow.js` inlines the merge/extract logic (mirror of `core/exportImport.js` — keep in sync).
  - Tests: `tests/exportImport.test.js` (envelope, extract/parse, merge precedence, key-normalize, no-mutation). Node-verified — **24 assertions pass**. Manifest → 1.0.8.
  - **Build:** none needed for the settings change (classic script). `core/exportImport.js` will bundle in if a bundled entry imports it later.

- **M2 task 2.6 — Editable word bank — DONE (M2 COMPLETE)**:
  - **`core/wordbank.js`**: pure `editWord(bank, word, {meaning, pronunciation})` (trims, bumps `updatedAt`, only those two fields) and `deleteWord(bank, word)`.
  - **Background** (`background.js`): `MSG.DELETE_WORD` (removes the bank record **and** clears the word's exposure events via `deleteEventsForWord`, like demote) and `MSG.CLEAR_WORDBANK` (wipes the bank + `SIGHTINGS` + the IndexedDB `events`/`reviews` stores via `clearStore`; keeps setup/settings/onboarding flags). Edits don't touch events so the settings page writes them directly.
  - **Settings:** each word's detail now has **Edit** (inline meaning/pronunciation form → Save/Cancel) and **Delete** (confirm); a new **danger card** at the bottom has **Clear all words** (confirm). `settingsWindow.js` inlines `editWordIO` (direct write) and routes delete/clear through the background (mirrors `MSG.*`). Styles in `CSSs/settings.css`.
  - Tests: `tests/wordbankEdit.test.js`. Node-verified — **8 assertions pass**. Manifest → 1.0.9.
  - **Build:** `background.js` + `core/wordbank.js` changed → **re-run `npm run build`** so `dist/background.js` + `dist/contentScript.js` pick up delete/clear handlers and the new helpers.

- **Post-M2 — Familiarity-tier rule unified (D-014, 2026-06-29)**:
  - The level→label rule was defined twice and disagreed (core `deriveStatus`
    only had 3 tiers and never produced `familiar`; `settingsWindow.js`
    hardcoded its own 4). Now there's **one source of truth**:
    **`FAMILIARITY_TIERS`** in `core/constants.js` — **new 0–24 · learning
    25–59 · familiar 60–89 · known ≥90** (`known.min === STOP_GLOSS_LEVEL`).
    `deriveStatus` derives all four from it; `settingsWindow.js` keeps an inline
    **mirror** (`tierForLevel`) for its chart/folders/bars — **keep in sync**.
  - `DEMOTE_LEVEL` 20→30 so "Review again" words read as `learning`, not `new`.
    `familiar` is **display-only** (glossing still stops only at `known`).
  - Thresholds are a **first pass** (tunable in one place, no migration since
    `level` is derived) — revisit with real usage data.
  - Tests updated (`wordbank.test.js`, `migration.test.js`); pure logic
    Node-verified. **Build:** core changed → `npm run build` + `npm test` on your
    machine. Full write-up: `dev-notes/session-logs/2026-06-29-familiarity-tier-rule.md`.

- **M3 task 3.1 — Stats aggregation — DONE (test-first, pure)**:
  - **`core/stats.js`** (pure, no chrome/DOM/IndexedDB) — the dashboard data
    layer; every number is DERIVED from the bank + event logs (no new storage).
    Exports: `dayIndex(ts, tzOffsetMin)` (integer day number, UTC default for
    deterministic tests / local via offset), `activeDays(events, reviews, tz)`
    (Set of days with any exposure **or** review), `computeStreak(dayset,
    todayIndex)` → `{current, longest, activeDays, lastActiveDay}` (current run
    counts to **today or yesterday** — one grace day), `levelDistribution(bank)`
    (familiarity-tier histogram, reuses `deriveStatus`, excludes `ignored`),
    `reviewAccuracy(reviews)` (correct = SM-2 quality ≥ `STATS.CORRECT_QUALITY_MIN`),
    `activitySeries(events, reviews, {now, days, tz})` (dense fixed-width per-day
    series ending today), `wordsAddedSince(bank, now, windowDays)`, and the
    aggregate **`computeStats(bank, events, reviews, opts)`** →
    `{totals, distribution, streak, reviews, activity, generatedAt}`.
  - **Streak counts reading + reviews both** (decision); **one grace day** before
    a streak breaks. **No "learned over time" series** — `level` is a derived
    cache, not a logged fact, so we can't honestly reconstruct when a word became
    "known" (left out, not faked).
  - **`core/constants.js`**: new `STATS` block (`ACTIVITY_DAYS 30`, `WEEK_DAYS 7`,
    `CORRECT_QUALITY_MIN 4`).
  - Tests: `tests/stats.test.js`. Node-verified — **58 assertions pass**.
  - **Build:** NONE needed for 3.1 — `core/stats.js` is pure and not yet imported
    by any bundled entry; it'll bundle into the dashboard page on the next build
    once 3.2 imports it. No manifest change. Full write-up:
    `dev-notes/session-logs/2026-06-29-m3.1-stats.md`.

- **M3 task 3.2 — Charts + dashboard page — DONE (M3 COMPLETE)**:
  - **New page** `HTMLs/dashboard.html` + `CSSs/dashboard.css` + `JSs/dashboard.js`
    (**bundled** → `dist/dashboard.js`; added to `build.mjs` entryPoints). An
    extension-origin page that reads `chrome.storage.local` + the extension's
    IndexedDB **directly** (no background hop): loads the bank + full exposure/
    review logs, hands them to `computeStats()` (M3.1), and renders.
  - **Hand-rolled SVG/CSS charts (zero deps):** six headline cards (tracked,
    known, added-this-week, **day streak** 🔥, reviews done, accuracy); a
    familiarity **distribution** (per-tier bars); a review-**accuracy donut** +
    grade breakdown; a full-width **30-day activity sparkline** (reading stacked
    under reviews, hover titles, date axis). Loading + empty states; live refresh
    on wordbank `storage.onChanged` + a manual Refresh button.
  - **`core/events.js`**: added flat full-log readers `getAllExposures()` /
    `getAllReviews()` for the dashboard.
  - **Local-day bucketing:** the page passes `tzOffsetMin =
    -new Date().getTimezoneOffset()` so streaks/activity align with the user's
    calendar day (pure logic stays UTC-deterministic for tests).
  - **No inlined mirror:** the page is bundled, so it imports `computeStats`/
    `FAMILIARITY_TIERS`/`STATS` directly — nothing to keep in sync (unlike the
    unbundled settings/popup scripts).
  - **Popup:** the old "Open Dashboard" button actually opened *Settings* —
    relabelled to **Settings**, added a real **Progress dashboard** button (→
    `dashboard.html`). Manifest → **1.0.10**.
  - **Build:** `dist/` now has a **SIXTH** bundle, `dist/dashboard.js` — run
    `npm run build` before loading. esbuild can't run in the authoring sandbox;
    `node --check` + import-graph resolution verified instead. Full write-up:
    `dev-notes/session-logs/2026-06-29-m3.2-dashboard.md`.

- **Post-M3 — Dashboard + Settings merged into one page (2026-06-29)**:
  - The standalone dashboard and Settings both showed stats (redundant). Now
    **one combined page** = `HTMLs/settingsWindow.html`: the bundled
    `dist/dashboard.js` renders the **Progress** stats card at the top; the
    classic `settingsWindow.js` owns the management tools below (word bank,
    decks, setup, danger). Two scripts, one page, separate DOM regions.
  - Dashboard charts are now **theme-aware** — `dashboard.js` emits CSS vars
    (`--lw-tier-*`/`--lw-grade-*`/`--lw-act-*`/`--lw-streak`), defined in
    `settings.css`, so they follow the light/dark toggle. The old D-002/003
    stat cards + level chart were removed (markup + `computeStats`/`renderStats`/
    `renderChart` + their CSS).
  - **Deleted** `HTMLs/dashboard.html` + `CSSs/dashboard.css`; the `dashboard`
    esbuild entry stays (`dist/dashboard.js` is loaded by the combined page).
  - Popup is a single **Open LearnWise** button → `settingsWindow.html`.
    Manifest → **1.0.11**. Full write-up:
    `dev-notes/session-logs/2026-06-29-merge-dashboard-settings.md`.

## Next action: **M4 — Launch (Chrome Web Store)** (see ESTIMATES.md → M4)
**M3 is complete** — the product is feature-complete for v1. Next is the launch milestone: **4.1 privacy policy + in-app note** (domain-only logging + BYO-key data flow), **4.2 permission audit** (justify `<all_urls>`, `unlimitedStorage`, drop anything unused), **4.3 store listing assets** (screenshots, promo tile, description, category), **4.4 package + submit**. No more core feature work planned for v1; v2 (paid tier — accounts, cloud sync, managed translations) is a separate milestone-set, not to start until v1 has real users.

> Tip to open a new build chat: "Read START_HERE.md, PLAN.md, DESIGN.md, ESTIMATES.md in this repo, then let's start M4 (launch prep)."

> **Build note:** `dist/` has SIX bundles — `contentScript.js`, `background.js`, `onboarding.js`, `review.js`, `dashboard.js`. `dashboard.js` is the **stats renderer embedded in the combined `settingsWindow.html`** (there is no separate dashboard.html anymore). Settings/popup are unbundled classic scripts. Run `npm run build` after any change under `JSs/core`, `JSs/dom`, `contentScript.js`, `background.js`, `onboarding.js`, `review.js`, or `dashboard.js`.
