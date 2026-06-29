# LearnWise — Data Model Deep Analysis

Companion to `DESIGN.md`. This file justifies **every property**: what it is, how necessary it is, and — where the choice is debatable — the pros, cons, and alternatives. Use it to decide what to build into v1 vs. reserve vs. drop.

**Necessity scale:**

| Level | Meaning |
|-------|---------|
| **Required** | The app cannot deliver its core function without it. Build now. |
| **Recommended** | High value, low cost. Build now unless you have a reason not to. |
| **Optional** | Nice to have; defer until the feature needs it. |
| **Reserved** | Not used yet, but added now to avoid a future migration (Principle 1). |

A guiding idea throughout: **a field is only worth storing if something reads it.** For each one, ask "who reads this, and could they compute it instead?"

---

## 1. WORD (the word bank — one record per word)

| Field | Type | Necessity | Why it exists / who reads it |
|-------|------|-----------|------------------------------|
| `word` | string (PK) | **Required** | The lookup key. Lowercased so "The"/"the" collapse. |
| `meaning` | string | **Required** | The whole point — the gloss shown to the user. Also the translation cache (store once, reuse). |
| `pronunciation` | string | **Recommended** | Needed for the audio feature and for display. Cheap; from ECDICT. Could be Optional if you drop audio. |
| `level` | number | **Recommended** (as cache) | Drives glossing (≥90 = hide). See Tradeoff A — it's a *derived cache*, not source of truth. |
| `status` | enum | **Recommended** | `new/learning/known/ignored`. The only one not expressible by `level` is **ignored** (user said "never gloss this"). See Tradeoff B. |
| `source` | enum | **Optional** | `read/manual/import`. Useful for stats ("how did this word enter my bank"); harmless to omit early. |
| `readCount` | number | **Recommended** | Fast aggregate for stats/familiarity without scanning the event log. Denormalized — see Tradeoff C. |
| `firstSeenAt` | number | **Recommended** | "When did I first meet this word." Derivable from events but cheap to keep; powers recency. |
| `lastSeenAt` | number | **Recommended** | Recency signal for familiarity; "last encountered." |
| `createdAt` | number | **Recommended** | Record birth; auditing and sorting. |
| `updatedAt` | number | **Required** | Sort order in the bank UI **and** the conflict key for import/sync (last-write-wins). Don't skip this. |
| `srs` | object | **Reserved** → Required at M2 | Spaced-repetition state. Reserve now so Leitner→SM-2 is a logic change, not a migration. See §2. |
| `tags` | string[] | **Reserved** → M2 | Deck membership (many-to-many). Empty array until decks ship. |
| `recentContexts` | Context[] | **Optional** | Bounded (3–5) snapshot of where/how the word appeared, for quick review without an IndexedDB query. See Tradeoff D. |

**Verdict for v1 (M0):** `word`, `meaning`, `pronunciation`, `level`, `readCount`, `firstSeenAt`, `lastSeenAt`, `createdAt`, `updatedAt`. Add `status`, `srs`, `tags`, `recentContexts`, `source` as reserved-empty so the shape is stable.

---

## 2. SRS (embedded object on WORD)

| Field | Type | Necessity | Why it exists |
|-------|------|-----------|---------------|
| `box` | number | **Required at M2** | Leitner box (1–5). The simplest scheduler; all you need to ship reviews. |
| `nextReviewAt` | number | **Required at M2** | The query key — "give me words due now." Without it you can't build a review queue efficiently. |
| `ease` | number | **Reserved** | SM-2 ease factor (default 2.5). Unused under Leitner; reserved for the upgrade. |
| `interval` | number | **Reserved** | SM-2 days-until-next. Leitner derives this from `box`. |
| `reps` | number | **Reserved** | SM-2 repetition count. |
| `lastResult` | enum/null | **Recommended at M2** | `again/hard/good/easy` — drives UI and the next interval. |
| `lastReviewedAt` | number | **Recommended at M2** | "Last quizzed" display; debugging schedules. |

**Pro of embedding `srs` in WORD** (vs. a separate store): one read gives you everything about a word; no joins. **Con:** every word carries the object even before reviews exist (a few dozen bytes each — negligible). **Verdict:** embed it.

**Pro of reserving SM-2 fields now:** zero-cost future-proofing. **Con:** mild clutter. Worth it.

---

## 3. CONTEXT (embedded in WORD.recentContexts)

| Field | Type | Necessity | Why |
|-------|------|-----------|-----|
| `sentence` | string | **Recommended** | The example sentence — makes review cards and meaning nuance far better. |
| `domain` | string | **Recommended** | "Seen on nytimes.com." Domain, **not full URL** — see Tradeoff E (privacy). |
| `ts` | number | **Recommended** | When this context was captured. |

This is the *bounded, syncable* slice of context. The *full* history lives in the event log (§4).

---

## 4. EXPOSURE_EVENT (IndexedDB — many per word)

| Field | Type | Necessity | Why / tradeoff |
|-------|------|-----------|----------------|
| `id` | number (PK) | **Required** | Auto key. |
| `word` | string (FK) | **Required** | Links event to its word; primary index. |
| `ts` | number | **Required** | When. The core of "store facts, derive scores." |
| `domain` | string | **Recommended** | Per-site analytics; cheap, low privacy risk. |
| `url` | string | **Optional** ⚠️ | Exact page. **Logging full URLs = recording browsing history.** Big storage + privacy + Chrome-review cost. See Tradeoff E. Default off / domain-only. |
| `sentence` | string | **Recommended** | Context for review; note it can capture page text — disclose in privacy policy. |
| `action` | enum | **Recommended** | `seen/glossed/clicked_known`. Lets familiarity weight a click (strong signal) vs a passive sighting (weak). |

**Verdict:** log `word`, `ts`, `domain`, `sentence`, `action`. Make `url` opt-in.

---

## 5. REVIEW_EVENT (IndexedDB — many per word)

| Field | Type | Necessity | Why |
|-------|------|-----------|-----|
| `id` | number (PK) | **Required at M2** | Auto key. |
| `word` | string (FK) | **Required at M2** | Links to word. |
| `ts` | number | **Required at M2** | When reviewed. |
| `quality` | number (0–5) | **Required at M2** | The SM-2 input; also recomputes familiarity. |
| `intervalAfter` | number | **Optional** | The interval the algorithm chose — useful for debugging/tuning schedules; not essential. |

Could you fold reviews into `EXPOSURE_EVENT` with `action="reviewed"`? Yes. **Pro of separate store:** clean queries, distinct shape (`quality`). **Con:** two stores. **Verdict:** keep separate — review data has a different shape and you'll query it on its own.

---

## 6. DECK (storage.local — few records)

| Field | Type | Necessity | Why |
|-------|------|-----------|-----|
| `id` | string (PK) | **Required if decks ship** | Stable reference held in `WORD.tags`. |
| `name` | string | **Required if decks ship** | Display ("IELTS"). |
| `createdAt` | number | **Optional** | Sort/audit. |

See Tradeoff F: **managed decks vs. plain string tags.** For v1, plain tags may be enough.

---

## 7. META / SETTINGS (storage.local — single record)

| Key | Type | Necessity | Why / note |
|-----|------|-----------|------------|
| `schemaVersion` | number | **Required** | The migration guard. Without it, a future shape change can corrupt data. Non-negotiable. |
| `lw_enabled` | bool | **Required** | The on/off toggle. |
| `translation_source` | enum | **Required** | `local/byok/managed`. Routes translation. |
| `openai_key` | string | **Optional** | Only for BYO-key mode. **Security: store local only, never log, never sync, never bundle.** |
| `targetLanguage` | string | **Reserved** | For pluggable languages later. Default `zh`. |

---

## Key design tradeoffs (the decisions worth pausing on)

### Tradeoff A — `level`: derived cache vs. stored-authoritative vs. compute-on-read
- **Stored & mutated (today's code):** simplest, fastest read. **Con:** the raw signal is lost; you can't improve the formula later. ✗ Rejected — violates Principle 1.
- **Compute-on-read from events:** always correct, zero staleness. **Con:** a DB query per render; too slow for glossing on every scroll.
- **Derived cache (recommended):** store `level` as a cached value recomputed when events change. **Pro:** fast reads + recomputable. **Con:** must remember to recompute; can briefly go stale. **Mitigation:** recompute on event append and on review. ✓

### Tradeoff B — `status` enum vs. deriving status from `level`
- Most states map to level thresholds (`known` = level ≥ 90). **But `ignored` cannot** — it's a user choice, not a familiarity. **Verdict:** keep an explicit `status`, if only to express `ignored`/manual overrides. Low cost, removes ambiguity.

### Tradeoff C — denormalized aggregates (`readCount`, `firstSeenAt`, `lastSeenAt`)
- These duplicate what the event log already implies. **Pro of keeping them:** common stats and the glossing path never touch IndexedDB. **Con:** must update them when events are appended (a denormalization bug risk). **Verdict:** keep — they're read constantly; the duplication pays for itself. Treat the event log as the source of truth and these as caches.

### Tradeoff D — `recentContexts` cache vs. IndexedDB-only
- **Cache (recommended):** a few contexts on the word → instant review cards, and it syncs with the bank. **Con:** duplicates event data; bounded to avoid bloat. **Alternative:** always query IndexedDB (no duplication, but slower and not syncable). **Verdict:** keep a small bounded cache (3–5).

### Tradeoff E — full `url` vs. `domain` only ⚠️ (the most important one)
- Storing **full URLs of every page where you saw a word is effectively logging the user's entire browsing history.** That's a serious privacy liability, inflates storage the most, and invites Chrome Web Store scrutiny.
- **Recommended default:** store **domain only**. Offer full-URL capture as an explicit, off-by-default opt-in with clear disclosure. This single decision keeps your privacy story clean at launch.

### Tradeoff F — managed `DECK` objects vs. plain string tags
- **Plain tags** (`tags: ["ielts","work"]`, no Deck table): zero extra entity, rename is messy, no per-deck metadata. Great for v1.
- **Managed decks** (id + name): supports rename, color, per-deck stats, future sharing. More to build.
- **Verdict:** ship **plain tags** first; the `tags` field already supports both, so promoting to managed decks later needs no migration.

### Tradeoff G — where the word bank itself lives at scale (storage.local vs. IndexedDB) ⚠️
- Today the whole word bank is **one object in `storage.local`**, so **every insert rewrites the entire bank.** At a few hundred words that's fine; at tens of thousands it gets slow and write-heavy.
- **Options:** (1) keep in `storage.local` while small (simple, syncable); (2) move the bank to **IndexedDB** for per-row writes once it grows, keeping only settings/decks in `storage.local`.
- **Verdict:** start in `storage.local` (you're early), but **isolate all bank access behind `core/wordbank.js`** so switching the backing store later is a one-file change, not an app-wide rewrite. This is the cheap insurance.

---

## Bottom line

- **Build in M0:** the Required + Recommended WORD fields, `schemaVersion`, settings. Reserve `srs`, `tags`, `recentContexts`, `source` as empty.
- **Two privacy/scale calls to make now:** domain-only by default (Tradeoff E), and hide the word bank behind a module so its storage can move later (Tradeoff G).
- **Everything debatable** (decks vs tags, url logging, SM-2) is reserved-but-deferred, so none of it blocks shipping the core.

---

## Appendix — word-bank size projection

Size = (number of words) × (bytes per record).

**Word count** (LearnWise stores every distinct word-form seen):

| User | Distinct words |
|------|----------------|
| Casual learner | 5,000–15,000 |
| Heavy reader, multi-year | 30,000–60,000 |
| Extreme (junk tokens incl. names/typos/code) | ~100,000 |
| Absolute ceiling (all ECDICT) | ~770,000 (never reached) |

**Bytes per record** (JSON in `storage.local` repeats field names per row):

- Lean (no contexts): ~300 B
- Full (4 context sentences ~80 chars): ~800 B — `recentContexts` is ~50–60% of this.

**Projected totals:**

| Words | Lean (~300 B) | Full (~800 B) |
|-------|---------------|---------------|
| 10,000 | ~3 MB | ~8 MB |
| 30,000 | ~9 MB | ~24 MB |
| 60,000 | ~18 MB | ~48 MB |
| 100,000 | ~30 MB | ~80 MB |

**The three walls (nearest first):**

1. **Performance — the real limit.** The whole bank is re-serialized on every insert, so lag appears around **5–10 MB / ~15k–25k words**. This bites long before capacity does.
2. **Capacity — not a wall.** With `unlimitedStorage`, `storage.local` is disk-bound; even 80 MB fits.
3. **Sync (v2) — the hardest wall.** `chrome.storage.sync` ≈ 100 KB (~300 words). The full bank must sync via a backend.

**Levers to control growth:**

- Move the bank to **IndexedDB before ~15k–20k words** (per-row writes remove the rewrite cost); keep it behind `core/wordbank.js` so it's a one-file swap (Tradeoff G).
- **Promote to the bank only after a word is seen ≥2×** (using the event log) — cuts the one-off junk tail dramatically.
- **Trim `recentContexts`** to 1–2 short entries — the biggest per-record cost.
