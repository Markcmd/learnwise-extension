# 2026-06-29 — Familiarity-tier rule: one canonical 4-tier definition

## Why
The "familiarity level rule" (level → coarse label) lived in two places and
disagreed:

- **Core** `JSs/core/wordbank.js → deriveStatus` — the value written to each
  word's `status` field — knew only **3 tiers**: `new` (0), `learning` (1–89),
  `known` (≥90). It never produced `familiar`.
- **Settings** `JSs/settingsWindow.js` re-derived its **own 4 tiers** locally
  (chart buckets, `levelClass`, `FOLDERS`): `new` <25, `learning` 25–59,
  `familiar` 60–89, `known` ≥90 — and ignored the stored `status` entirely.

Result: a word's stored `status` could read "learning" while the UI filed it
under **Familiar**; the `familiar` tier referenced by decisions D-011/D-012
never actually existed in stored data; and an `"ignored"` status read by
`popup.js`/`srs.js` is set by nothing (left as-is — it's user-set, not derived).

## What changed
Single source of truth: **`FAMILIARITY_TIERS`** in `core/constants.js`.

```
new      0–24
learning 25–59
familiar 60–89
known    ≥90   (min === STOP_GLOSS_LEVEL — known & "stop glossing" stay locked)
```

- `deriveStatus` (core/wordbank.js) now derives all four tiers from the array
  (highest tier whose `min` the level meets). Stored `status` can now be
  `familiar`.
- `settingsWindow.js` is an unbundled classic script (no imports), so it keeps
  an **inline mirror** of the thresholds + a `tierForLevel()` helper, and its
  chart/folders/level-bars all derive from it. **Keep the mirror in sync** with
  `constants.js` (noted in both files).
- `DEMOTE_LEVEL` 20 → **30**: a "Review again" word now lands in `learning`
  (re-learning), not `new`.
- **`familiar` is display-only** (Mark's call): glossing still stops only at
  `known` (≥90). No renderer change.

### Why these numbers
`level` comes from the saturating exposure curve in `core/familiarity.js`
(SATURATION 0.18, 30-day half-life): ~1 weighted exposure ≈ 16, ~2 ≈ 30,
~4 ≈ 51, ~5 ≈ 59, ~7 ≈ 72, ~13 ≈ 90. So new = barely seen, learning = a few
recent sightings, familiar = many, known = mastered / clicked-known (100).
These are a **first pass** — Mark wanted thresholds changed but had no target
numbers; they're now one tunable constant (no migration needed since `level` is
derived).

## Files touched
- `JSs/core/constants.js` — added `FAMILIARITY_TIERS`; `DEMOTE_LEVEL` 20→30.
- `JSs/core/wordbank.js` — `deriveStatus` rewritten over `FAMILIARITY_TIERS`.
- `JSs/settingsWindow.js` — inline tier mirror + `tierForLevel`; `computeStats`
  buckets, `renderChart` order, `levelClass`, `FOLDERS`, `groupRecords` init now
  all derive from the mirror.
- Tests: `tests/wordbank.test.js` (4-tier deriveStatus, default-record status
  now `new`), `tests/migration.test.js` (level 12 → `new`). `tests/demote.test.js`
  unchanged — still expects `learning` (now satisfied via DEMOTE_LEVEL=30).

## Verification
- Pure tier logic Node-verified (10/10 cases incl. boundaries + DEMOTE_LEVEL),
  and the real `deriveStatus` import checked too. **vitest/esbuild can't run in
  this sandbox** — on your machine: `npm run build` (core changed → rebuild
  `dist/contentScript.js` + `dist/background.js`; settings is unbundled), then
  `npm test`.

## Follow-ups
- Revisit the threshold numbers once there's real usage data (edit the `min`
  values in `constants.js` **and** the mirror in `settingsWindow.js`).
- Optional later: if "familiar" should ever affect glossing (lighter gloss),
  that's a renderer change — deferred (display-only for now).
