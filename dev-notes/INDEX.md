# dev-notes — developer-only working docs

> **DEV-ONLY.** These files are for Mark (the developer), not end users and not
> the public README. Planning docs, decision records, problem investigations,
> and per-session dev logs live here. The repo's public doc is the root
> `README.md`; everything else moved in here.
>
> Currently **tracked by git** (not ignored) by decision on 2026-06-28. If you
> later want it out of the repo, add `dev-notes/` to `.gitignore` and
> `git rm -r --cached dev-notes/`.

## Layout (by category)

```
dev-notes/
├── INDEX.md            ← you are here
├── decisions/          decision records — what we chose and why
│   ├── DECISIONS.md        (UI/UX decisions log, moved from root)
│   └── na-words.md         decisions about "n/a" gloss words
├── problems/           problem investigations — root causes + findings
│   └── na-words.md         the "n/a" words problem, fully diagnosed
├── planning/           product/engineering plans (moved from root)
│   ├── START_HERE.md       project state entry point
│   ├── PLAN.md             product plan
│   ├── DESIGN.md           technical design
│   ├── ROADMAP.md          scalability / cost roadmap
│   └── ESTIMATES.md        task time estimates
└── session-logs/       chronological dev journal, one file per session/topic
    └── 2026-06-28-na-words.md
```

## How to use

- **Starting a new session?** Read `planning/START_HERE.md` first.
- **Recording a decision?** Add to `decisions/` (or append to `DECISIONS.md` for UI tweaks).
- **Investigating a bug?** Write it up in `problems/`.
- **Journaling a work session?** New dated file in `session-logs/`.

## Index of session logs

- [2026-06-28 — "n/a" words: diagnosis, dictionary expansion, reader-side decision](session-logs/2026-06-28-na-words.md)
- [2026-06-28 — M2.1: SRS scheduler (Leitner + ease), test-first](session-logs/2026-06-28-m2.1-srs.md)
- [2026-06-28 — M2.2: review queue + quiz UI](session-logs/2026-06-28-m2.2-review.md)
- [2026-06-28 — M2.3: pronunciation audio (Web Speech API)](session-logs/2026-06-28-m2.3-audio.md)
- [2026-06-28 — M2.4: decks + manual capture](session-logs/2026-06-28-m2.4-decks.md)
- [2026-06-28 — M2.5: export / import (merge by updatedAt)](session-logs/2026-06-28-m2.5-export-import.md)
- [2026-06-28 — M2.6: editable word bank (M2 complete)](session-logs/2026-06-28-m2.6-editable-bank.md)
- [2026-06-29 — Familiarity-tier rule: one canonical 4-tier definition (D-014)](session-logs/2026-06-29-familiarity-tier-rule.md)
- [2026-06-29 — M3.1: stats aggregation (test-first, pure)](session-logs/2026-06-29-m3.1-stats.md)
- [2026-06-29 — M3.2: charts + dashboard page (M3 complete)](session-logs/2026-06-29-m3.2-dashboard.md)
- [2026-06-29 — Merge dashboard + settings into one page](session-logs/2026-06-29-merge-dashboard-settings.md)
- [2026-06-29 — M4.1: privacy policy (GitHub Pages, launch prep)](session-logs/2026-06-29-m4.1-privacy-policy.md)
- [2026-06-29 — M4.2: permission audit (dropped activeTab; store justifications)](session-logs/2026-06-29-m4.2-permission-audit.md)
- [2026-06-29 — M4.3: store listing assets (copy + shot-list + promo tiles)](session-logs/2026-06-29-m4.3-store-assets.md)
