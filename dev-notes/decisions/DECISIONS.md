# UI Decisions Log

Short, trackable record of UI/UX decisions. One entry per decision.
Format: **what** → why good (pro) / why risky (con) → **status**.

Status legend: `proposed` · `approved` · `built` · `shipped` · `rejected`

> **Built 2026-06-28:** D-001, D-002, D-003, D-004, D-006, D-007, D-008, D-009, D-010, D-011 implemented in
> `HTMLs/popup.html` · `JSs/popup.js` · `CSSs/popup.css` · `HTMLs/settingsWindow.html` · `JSs/settingsWindow.js` · `CSSs/settings.css`.
> Popup/settings are classic scripts (no build needed to view), but the "Review again" action talks to the bundled
> background worker — run `npm run build` and reload the extension to test end-to-end. No data/schema changes.

---

## D-001 — Hide API / BYOK behind "Coming soon"
**Date:** 2026-06-28
**Change:** Replace the live "Translation source" dropdown + the whole "Smart translations (bring your own key)" settings section with a single disabled row: *"Smart translations — coming soon"*. Keep the working code, gate it behind a flag (`FEATURE_BYOK = false`).

- **Pro:** Removes the biggest setup burden. A user who must paste an API key will mostly just leave. Matches the goal: extension should make users do *less*. Local dictionary already works offline, so nothing breaks.
- **Pro:** Code is preserved, so turning it back on later is a one-line flag flip.
- **Con:** Power users lose the smart-translation path for now.
- **Con:** "Coming soon" sets an expectation we must eventually meet.

**Decision:** approved (show disabled "Coming soon").
**Status:** proposed

---

## D-002 — Word bank becomes a stats dashboard, not a raw table
**Date:** 2026-06-28
**Change:** Lead the settings word-bank section with a stats summary instead of the full 7-column table.
Summary cards: **Total words · Known · Learning · New · Added this week**. (All derived from existing record fields — no schema change.)

- **Pro:** A learner cares about progress ("how many do I know?"), not a database dump. More motivating, less overwhelming.
- **Pro:** Cards read instantly; the table forces scanning.
- **Con:** Users who liked the raw table lose the default view → mitigated by D-005 (table kept behind a toggle).

**Status:** proposed

---

## D-003 — Add a progress chart
**Date:** 2026-06-28
**Change:** Small chart showing **level distribution** (buckets: new / learning / familiar / known) — and, if cheap, words added per week.

- **Pro:** One glance shows whether the user is actually advancing. Strong motivation hook.
- **Pro:** Pure render from existing `level` + `firstSeenAt`; no new data.
- **Con:** Adds a chart dependency or hand-rolled SVG. Keep it lightweight (inline SVG bars, no library) to avoid bloating the bundle.

**Status:** proposed

---

## D-004 — Search lives in settings only
**Date:** 2026-06-28
**Change:** Remove the search box from the popup. Keep search in settings, where it filters the (toggleable) full list.

- **Pro:** Popup is a quick-glance surface — looking up a specific word is a settings-level task, not a daily popup action. Less clutter.
- **Pro:** Search still exists where the full word list lives, so nothing is lost.
- **Con:** One extra click (open settings) to look up a word from the popup → acceptable, it's a rare need.

**Decision:** approved (remove from popup, keep in settings).
**Status:** approved

---

## D-005 — Drop the 7-column table (REJECTED)
**Date:** 2026-06-28
**Change:** Proposed keeping the wide 7-column table behind a "Show all words" toggle.

- **Pro:** Power-user view.
- **Con:** Redundant once D-009 gives a clean clickable word list with detail-on-click.

**Decision:** rejected (Mark: "don't need"). The D-009 list + search is the only word view; no columnar table.
**Status:** rejected

---

## D-006 — Popup slimmed down
**Date:** 2026-06-28
**Change:** Popup keeps only: Enable toggle, a tiny "X words · Y known" line, and "Open Settings". Remove the translation-source dropdown + hint (D-001) and the search box (D-004).

- **Pro:** Popup is a quick-glance surface; fewer controls = faster. Removed controls were config/secondary, not daily-use.
- **Con:** None — removed controls are non-essential here.

**Decision:** approved.
**Status:** approved

---

## D-007 — Friendly empty state
**Date:** 2026-06-28
**Change:** When the word bank is empty, show "Start reading and I'll track words here" instead of a blank table/zeroed stats.

- **Pro:** A blank screen looks broken; an invitation explains what to do next. Low effort, high polish.
- **Con:** None.

**Decision:** approved.
**Status:** approved

---

## D-008 — "Words this week" / streak highlight
**Date:** 2026-06-28
**Change:** Surface a weekly highlight (e.g. "+27 this week") in the popup line and settings stats to encourage return visits. Derived from `firstSeenAt`.

- **Pro:** Gives a reason to come back daily; cheap motivation from existing data.
- **Con:** Shows "+0" after an inactive week — keep copy neutral, not guilt-trippy.

**Decision:** approved.
**Status:** approved

---

## D-009 — Per-word detail on click (replaces wide table columns)
**Date:** 2026-06-28
**Change:** Word list shows just word + level bar. Click a word → expand a panel with meaning, pronunciation, times read, date added, and the last few sentences it appeared in (from `recentContexts`).

- **Pro:** Clean list; detail on demand. Seeing the word in real context aids memory. Uses data already stored.
- **Con:** A bit more JS than a flat table; contexts panel is empty for words saved before context-tracking existed.

**Decision:** approved.
**Status:** approved

---

## D-010 — Move "Redo vocabulary setup" to the bottom
**Date:** 2026-06-28
**Change:** Move the existing onboarding/redo-setup button out of the word-bank toolbar to the bottom of settings. No logic change.

- **Pro:** Rare action; keeping it beside daily controls (Refresh/Download) adds noise.
- **Con:** None.

**Decision:** approved ("try this").
**Status:** approved

---

## D-011 — Level chart shows distribution
**Date:** 2026-06-28
**Change:** The progress chart is a distribution of words across level buckets (new / learning / familiar / known), not a words-over-time line.

- **Pro:** Answers "where am I?" at a glance from current `level` values; no per-day history needed.
- **Con:** Doesn't show velocity over time → the "+N this week" stat (D-008) covers momentum instead.

**Decision:** approved (matches mockup).
**Status:** approved

---

## D-012 — Word list grouped into collapsible level folders
**Date:** 2026-06-28
**Change:** Don't render the full word list by default. Show four collapsible folders by level — New, Learning, Familiar, Known — each with a word count. Click a folder to expand its words inline; click a word to expand its detail (D-009). Search auto-opens folders that contain matches; empty folders are hidden.

- **Pro:** No wall of words on load — the page stays scannable even with hundreds of words. Folders double as a second progress signal (counts per level).
- **Pro:** Reuses the D-009 detail rows; only the grouping wrapper is new.
- **Con:** One extra click to reach a word when not searching → acceptable; search bypasses it.

**Decision:** approved (group by level; folder shows count; expand inline).
**Status:** built

---

## D-013 — Sort control inside each folder
**Date:** 2026-06-28
**Change:** When a folder is open, show a small "Sort" dropdown above its words: A–Z, Z–A, Newest, Oldest, Highest level, Lowest level. Sorting affects only that folder. Default A–Z.

- **Pro:** Lets users find words their own way without leaving the folder; cheap to add (re-sort in place).
- **Con:** A control per open folder adds slight repetition → kept compact and only visible when expanded.

**Decision:** approved.
**Status:** built

---

## D-014 — One canonical familiarity-tier rule (new/learning/familiar/known)
**Date:** 2026-06-29
**Problem:** The familiarity-tier rule was defined twice and disagreed. Core
`deriveStatus` (the stored `status` field) knew only 3 tiers — `new` (level 0),
`learning` (1–89), `known` (≥90) — and never produced `familiar`. The settings
page meanwhile hardcoded its own 4-tier rule (`new` <25, `learning` 25–59,
`familiar` 60–89, `known` ≥90) for its chart, folders, and level bars. So a
word's persisted `status` could say "learning" while the UI filed it under
**Familiar**, and the `familiar` tier never existed in stored data.

**Change:** A single source of truth — `FAMILIARITY_TIERS` in
`core/constants.js` (ordered low→high, `min` = inclusive lower bound; a level
takes the highest tier whose `min` it meets; top tier's `min` === `STOP_GLOSS_LEVEL`
so "known" and "stop glossing" can't drift). `deriveStatus` now derives all four
tiers from it, so the stored `status` can be `familiar`. `settingsWindow.js`
(unbundled classic script — can't import) keeps an inline **mirror** of the same
thresholds and drives its chart/folders/bars from it. Thresholds:
**new 0–24 · learning 25–59 · familiar 60–89 · known ≥90.**

Also: `DEMOTE_LEVEL` 20 → **30** so a "Review again" word lands in the
`learning` tier (it's a word you're re-learning), not `new`.

- **Pro:** One rule, no drift; `familiar` is now real in stored data; only
  `familiar` is display-only (glossing still stops only at `known`, per Mark's
  call). Because `level` is a derived cache, the `min` values are freely
  tunable later with no migration.
- **Con:** The settings mirror must be kept in sync with `constants.js` (noted
  in both files). Thresholds are a first pass — Mark wanted them changed but had
  no target numbers yet; revisit once there's real usage data.

**Decision:** approved (4-tier canonical rule; familiar display-only; thresholds
provisional).
**Status:** built (pure logic Node-verified; needs `npm run build` + `npm test`
on Mark's machine).

---

## Rejected
- **D-005** full 7-column table — not needed; D-009 list replaces it.
- **One-tap "I know this" in popup** — not needed (and popup search is being removed per D-004).
