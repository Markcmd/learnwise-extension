# Decision record — handling "n/a" words

**Date:** 2026-06-28 · **Owner:** Mark
**Related:** [problem](../problems/na-words.md) · [session log](../session-logs/2026-06-28-na-words.md)

## Context

Words with no local-dictionary entry render as `n/a` (see problem doc). Two
distinct questions had to be decided separately.

---

## Decision 1 — Improve offline coverage by expanding the local dict

**Options weighed**

| Option | Verdict |
|---|---|
| Skip the gloss (plain text) | rejected — cosmetic, hides the gap |
| Subtle marker (`?` / `·`) | rejected — cosmetic |
| Keep `n/a` but styled muted | rejected — cosmetic |
| Lemmatize then retry in ECDICT | not chosen — overlaps with runtime cost |
| **Expand the local dictionary** | **CHOSEN** |

**Decision:** Add real-but-missing words to the bundled ECDICT shards via a
supplement file + idempotent merge script.

**Outcome:** `dict-supplement/supplement.json` (43 modern words) +
`tools/merge-supplement.mjs`. Merged, lookups verified, idempotent. Every added
word is one fewer `n/a` with **no API and no `npm run build`** (shards are
web-accessible resources, loaded at runtime).

---

## Decision 2 — Reader-side action on an `n/a` word

**Options weighed**

| Option | Needs API? | Verdict |
|---|---|---|
| On-demand AI lookup (BYOK) | yes | not now |
| Type-your-own gloss | no | low value — only helps if reader already knows the word |
| Open external dictionary (new tab) | no | possible, but a redirect, not an inline gloss |
| Just dismiss (today's click → mark known) | no | already exists |

**Decision:** **Leave it for now — build nothing.**

**Reasoning / conclusion:** To show a *real inline gloss* for an off-dictionary
word you need an online source (AI or dict API), because the offline lookup
already failed — that's literally why it's `n/a`. The only no-API move is a
click-to-open-external-dictionary escape hatch, which leaves the page. So,
without an API, there is no satisfying inline solution; we accept the `n/a` and
rely on Decision 1 to shrink it over time.

**Not taken (future option):** gate glosses on dict-membership so non-dictionary
tokens (proper nouns, typos) never render `n/a`.
