# LearnWise — Detailed Tasks & Time Estimates

**How to read these numbers:**

- Estimates are **focused-work hours** for a solo developer of intermediate skill, **tests included**.
- Calendar time = hours ÷ your weekly availability. Conversions at the bottom.
- **Add a 30–40% buffer** for anything using tech that's new to you (IndexedDB, SRS, Supabase) and for the inevitable unknowns. The ranges already lean realistic, not optimistic.
- A range like "2–3h" means "probably 2, could be 3."

---

## M0 — Foundation (make the core trustworthy & testable)

| # | Task | Subtasks | Est. |
|---|------|----------|------|
| 0.1 | **Project scaffolding + test tooling** (#16) | Add `package.json`; install Vitest; **set up a bundler (esbuild)** so the content script can `import` from `core/` modules; create `core/ dom/ tests/` folders; one passing sample test | 5–7h |
| 0.2 | **Storage wrapper** | `core/storage.js` — promise wrappers for `storage.local` (IndexedDB added in M1) | 1–2h |
| 0.3 | **Extract word-bank logic** | Move word CRUD out of `contentScript.js` → `core/wordbank.js` (pure, behind one module per Tradeoff G); tests | 4–6h |
| 0.4 | **Schema version + migration** (#17, *test-first*) | Define `schemaVersion` + new Word shape (reserved fields); write migration v0→v1; **write tests first** against a populated bank; run on load | 6–8h |
| 0.5 | **Translation caching** (#3) | Check cached `meaning` before any lookup/AI call; only translate new words; tests | 2–3h |
| 0.6 | **Word-promotion rule** (≥ threshold, default 2, configurable) | Gloss on 1st sighting; promote to tracked record on Nth; lightweight sighting counter (full event log comes in M1); tests | 3–4h |
| 0.7 | **Remove hardcoded API key** (#4) | Delete literal key; confirm nothing references it | 0.5h |
| 0.8 | **`unlimitedStorage` permission** (#5) | Add to manifest; reload-test | 0.5h |
| 0.9 | **Confirm local default + guard `api` option** (#2) | Ensure `local` default; disable/hide `api` until BYO-key exists; smoke-test pages | 1h |
| 0.10 | **Optimize DOM passes** (#6) | Consolidate 3 TreeWalker passes → 1; dedupe already-rendered words per page; manual perf test on long pages | 5–7h |

**M0 subtotal: ~29–40h** (~1–2 weeks part-time). *This is the most important milestone — everything sits on it.*

---

## M1 — Core learning loop (events + smart translations + onboarding)

| # | Task | Subtasks | Est. |
|---|------|----------|------|
| 1.1 | **Exposure event log (IndexedDB)** (#18) | Open DB, `events`/`reviews` stores + indexes; `core/events.js` append/query; tests | 6–9h |
| 1.2 | **Derived familiarity** (#18) | `core/familiarity.js` computes `level` from events (store facts, derive scores); recompute on append; tests | 4–6h |
| 1.3 | **Event pruning** | Keep ~90 days, collapse older into aggregates; tests | 2–3h |
| 1.4 | **BYO-key translation mode** (#7) | Settings key field + validation; client-side OpenAI call; error handling (bad key / quota / offline); routing local↔byok; tests | 9–12h |
| 1.5 | **Real onboarding** (#8) | First-run flow to set starting level / known words; seed word bank; tests | 7–9h |

**M1 subtotal: ~28–39h** (~1.5–2 weeks part-time).

---

## M2 — Engagement (review, audio, decks, import/export, editing)

| # | Task | Subtasks | Est. |
|---|------|----------|------|
| 2.1 | **SRS scheduler (Leitner)** (#10) | `core/srs.js` boxes + intervals; `nextReviewAt`; tests (*test-first — pure math*) | 4–6h |
| 2.2 | **Review queue + quiz UI** (#10) | Query due words; flashcard front/back; grade buttons; wire results → events + srs | 9–12h |
| 2.3 | **Pronunciation audio** (#10) | Web Speech API on glossed words + review cards; speaker UI | 3–5h |
| 2.4 | **Decks + manual capture** (#20) | Deck CRUD (storage + UI); highlight-to-save; assign words to decks | 9–12h |
| 2.5 | **Export / import** (#19) | Serialize bank+decks; import merge-by-`updatedAt`; tests | 4–6h |
| 2.6 | **Editable word bank** (#9) | Per-word edit/delete + clear-all in settings | 4–6h |

**M2 subtotal: ~33–47h** (~2–3 weeks part-time).

---

## M3 — Progress dashboard

| # | Task | Subtasks | Est. |
|---|------|----------|------|
| 3.1 | **Stats aggregation** | Compute words-learned, level distribution, streaks from bank+events; tests | 3–4h |
| 3.2 | **Charts + layout** | Render charts (a small lib or canvas); dashboard page | 7–10h |

**M3 subtotal: ~10–14h** (~1 week part-time).

---

## M4 — Launch (Chrome Web Store)

| # | Task | Subtasks | Est. |
|---|------|----------|------|
| 4.1 | **Privacy policy + in-app note** (#11) | Write + host; cover domain-only logging + BYO-key data flow | 2–3h |
| 4.2 | **Permission audit** | Justify `<all_urls>`, `unlimitedStorage`; drop anything unused | 1–2h |
| 4.3 | **Store listing assets** (#12) | Screenshots, promo tile, description, category | 4–6h |
| 4.4 | **Package + submit** (#13) | Zip, dev account, upload, forms, submit | 2–3h |
| 4.5 | **Google review wait** | *External* — not your hours; typically days, sometimes longer | — |

**M4 subtotal: ~9–14h** (~3–5 days part-time, plus external review time).

---

## Totals (v1 — free product, launched)

| Milestone | Hours |
|-----------|-------|
| M0 Foundation | 29–40 |
| M1 Core loop | 28–39 |
| M2 Engagement | 33–47 |
| M3 Dashboard | 10–14 |
| M4 Launch | 9–14 |
| **Total** | **~109–154h** |

With the recommended 30–40% buffer: **~145–215h** all-in.

### Calendar conversion (mid-point ~130h, or ~175h buffered)

| Pace | ~130h (raw) | ~175h (buffered) |
|------|-------------|------------------|
| 5 h/week | ~6 months | ~8 months |
| 10 h/week | ~3 months | ~4 months |
| 20 h/week | ~6–7 weeks | ~9 weeks |
| Full-time (40 h/wk) | ~3–4 weeks | ~4–5 weeks |

---

## v2 — Paid tier (post-launch, separate project)

Not part of the v1 number above. Rough order-of-magnitude:

| Task | Est. |
|------|------|
| Choose + set up backend (Supabase) | 4–8h |
| User accounts / auth | 8–14h |
| Cloud sync (push/pull, last-write-wins) | 12–20h |
| Managed translation endpoint + quotas + rate limits | 10–16h |
| Billing (Stripe) + paywall | 12–20h |
| Testing + hardening | 8–12h |
| **v2 total** | **~54–90h** (+ buffer) |

v2 is its own milestone-set; don't start it until v1 has real users.

---

## Notes

- **Biggest risk to these numbers:** scope creep within a milestone. The estimates assume you build the milestone as scoped, then move on.
- **Where you'll likely run over:** the quiz UI (2.2), onboarding (1.5), and decks/manual capture (2.4) — UI work always expands. The pure-logic tasks (migration, SRS, familiarity) are more predictable because they're tested.
- **Where you might run under:** the small config tasks (0.7, 0.8, 0.9) if nothing surprising turns up.
