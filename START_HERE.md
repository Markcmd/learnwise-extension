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
Planning is **complete**. Nothing is blocking the build. The live task list (#2–#22) is the execution view; the docs are the why/how.

## Next action: start **M0** (see ESTIMATES.md → M0)
Begin with **task 0.1 — scaffolding + test tooling**:
1. Add `package.json`; install Vitest.
2. Set up an **esbuild bundler** so `contentScript.js` can `import` from `core/` modules (content scripts can't use ES modules directly).
3. Create `core/`, `dom/`, `tests/` folders.
4. Add one passing sample test.

Then 0.2 storage wrapper → 0.4 schema + migration (test-first) → caching, key removal, `unlimitedStorage`, DOM-pass optimization.

> Tip to open a new build chat: "Read START_HERE.md, PLAN.md, DESIGN.md, ESTIMATES.md in this repo, then let's build M0 task 0.1."
