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

> **Verification note:** these were authored in an environment without npm access, so the IndexedDB IO tests have not been run yet. Run `npm install` then `npm test` locally to confirm green. (Pure logic was independently verified.)

## Next action: **M1 task 1.4 — BYO-key translations** (see ESTIMATES.md → M1)
Then **1.5 — onboarding**. Decisions for 1.4: default OpenAI model = **user-selectable dropdown** (default `gpt-4o-mini`); reconcile `TRANSLATION_SOURCES` from `["local","api"]` to the DESIGN naming `local | byok | managed`.

> Tip to open a new build chat: "Read START_HERE.md, PLAN.md, DESIGN.md, ESTIMATES.md in this repo, then let's build M1 task 1.4."
