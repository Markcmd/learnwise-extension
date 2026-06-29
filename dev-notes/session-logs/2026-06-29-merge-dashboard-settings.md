# 2026-06-29 — Merge dashboard + settings into one page

## Goal
The standalone Progress dashboard (M3.2) and the Settings page both showed
stats — redundant. Merge them into a single page; keep the dashboard-style
statistics, drop the old basic stat cards + level chart.

## What shipped
- **One combined page** = `HTMLs/settingsWindow.html`. The bundled
  `dist/dashboard.js` renders the **Progress** stats card at the top; the
  classic `settingsWindow.js` keeps all the management tools below (word bank
  search + list, decks, smart-translations note, vocab setup, danger zone).
  Two scripts on one page, each owning its own DOM region — no coupling.
- **Dashboard stats are now theme-aware.** `dashboard.js` emits CSS variables
  (`--lw-tier-*`, `--lw-grade-*`, `--lw-act-*`, `--lw-streak`, track =
  `--lw-border`) instead of hardcoded hex, so the charts follow the settings
  page's light/dark theme. The tokens (light + both dark blocks) and the
  ported `lw-db-*` styles now live in `CSSs/settings.css`.
- **Removed the old stats UI:** the D-002 stat cards (Total/Known/Learning/This
  week) and the D-003/011 "Progress by level" bar chart — markup, the
  `computeStats`/`renderStats`/`renderChart` functions in `settingsWindow.js`,
  the now-unused `WEEK_MS`, and the `.stat-cards`/`.chart-*`/`.bar-*` CSS.
- **`dashboard.js`** dropped its `openSettings` nav (the page *is* settings);
  keeps Review + Refresh, still live-refreshes on wordbank `storage.onChanged`.
- **Deleted** `HTMLs/dashboard.html` and `CSSs/dashboard.css` (the separate page
  is gone; its styles moved into `settings.css`). The `dashboard` esbuild entry
  **stays** — `dist/dashboard.js` is now loaded by the combined page.
- **Popup:** the single button now opens `settingsWindow.html`, relabelled
  **Open LearnWise**. Manifest → **1.0.11**.

## Decisions
- **Two scripts, not a rewrite.** Reusing the already-built `dist/dashboard.js`
  for stats + the existing classic `settingsWindow.js` for management avoided
  rewriting ~780 lines of working settings code into a bundle. They share the
  page but not state; both read the bank independently.
- **Stats stay bundled, management stays classic.** The management half still
  works without `npm run build` (classic script); only the stats half needs the
  build (it imports `core/stats.js`). If `dist/` is stale, the Progress card
  just doesn't populate — the rest of the page is unaffected.
- **Colours via CSS variables.** Inline SVG resolves `fill="var(--…)"` against
  the document, so the same dashboard.js renders correctly in both themes with
  no JS theme-awareness.
- **IDs don't collide:** stats use `#loading/#empty/#dash`, settings use
  `#emptyState/#dashboard` — distinct, so both scripts' toggling coexists.

## Verification
- `node --check` passes on `dashboard.js`, `settingsWindow.js`, `popup.js`;
  `manifest.json` parses (v1.0.11); import graph resolves.
- No references to the deleted `dashboard.html`/`dashboard.css` remain.
- **esbuild can't run in the sandbox** → `dist/dashboard.js` not rebuilt here.
- **On your machine:** `npm run build` (refreshes `dist/dashboard.js` with the
  theme-var colours) then `npm test`. Manually: open the popup → **Open
  LearnWise**; confirm the Progress card renders the cards/familiarity/donut/
  activity, toggle the light/dark theme and check the charts recolour, then
  scroll to the word bank + decks + setup + danger tools below.

## Bundles
`dist/` still has SIX entries — `contentScript.js`, `background.js`,
`onboarding.js`, `review.js`, `dashboard.js` (now embedded in the combined
page), plus `background`. Settings/popup remain unbundled classic scripts.
