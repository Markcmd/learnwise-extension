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

## Next action: **M2 — Engagement** (review/SRS + audio + decks + import/export + editing; see ESTIMATES.md → M2)
M1 (the core learning loop) is complete. M2 starts with **2.1 SRS scheduler (Leitner, test-first)** then **2.2 review queue + quiz UI**. The `srs` fields are already reserved on every Word record.

> Tip to open a new build chat: "Read START_HERE.md, PLAN.md, DESIGN.md, ESTIMATES.md in this repo, then let's build M2 task 2.1."

> **Build note:** `dist/` now has FOUR bundles — `contentScript.js`, `background.js`, and `onboarding.js` (settings/popup are unbundled classic scripts). Run `npm run build` after any change under `JSs/core`, `JSs/dom`, `contentScript.js`, `background.js`, or `onboarding.js`.
