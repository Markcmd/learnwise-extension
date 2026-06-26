# LearnWise — Professional Product Plan

**Goal:** a polished Chrome Web Store product.
**Owner:** Mark · **Last updated:** 2026-06-22

This is your master plan. It separates what is *basic* (must work before anything else) from what comes *later*, shows how every feature connects, and flags the mistakes that most often sink a project like this. Read Section 2 first — it's the mentor part. Treat this document as living: edit it as decisions change.

---

## 1. Vision

LearnWise helps people grow English vocabulary *while they read the web*. As you browse, it quietly glosses words you don't yet know, tracks how familiar you are with each one, and gradually stops helping as you learn. Over time it becomes a personal vocabulary coach: it knows your words, reviews them, speaks them, and shows your progress.

The four features you want:

1. **Smart context translations** — sentence-aware meanings (bring-your-own OpenAI key), alongside the offline dictionary.
2. **Review / quiz with spaced repetition (SRS)** — actively test saved words over time.
3. **Pronunciation audio** — hear any word spoken.
4. **Progress dashboard** — stats on words learned, levels, streaks.

---

## 2. Mentor principles (read this before building anything)

These are the rules that prevent the expensive mistakes. They apply to every feature below.

**Principle 1 — The data model is the foundation. Get it right once.**
Every feature you want reads or writes the same word bank. If you design the schema casually now and patch it later, you will one day ship an update that *corrupts every user's saved data*. That is the single worst thing a learning app can do. So: design the schema to support all four features *now* (even fields you won't use yet), add a `schemaVersion`, and write a migration function before you ever change it. Details in Section 3.

**Principle 2 — Ship the smallest thing that works, then layer.**
You have four big features. Building them in parallel is how solo projects stall. Each milestone in Section 6 produces something you could actually ship. Resist starting feature N+1 until feature N is stable.

**Principle 3 — Don't reinvent solved problems.**
For spaced repetition, use a known algorithm (Leitner boxes or SM-2), not a homemade one. For audio, use the browser's built-in speech engine before paying for anything. For translations, you already chose the right model (bring-your-own-key) — keep it.

**Principle 4 — Privacy and permissions are launch blockers, not afterthoughts.**
Chrome reviewers reject extensions that request more than they need or send data without disclosure. Every permission must be justified; anything leaving the browser (the OpenAI call) must be disclosed. Design with this from day one.

**Principle 5 — Cache aggressively; never do the same work twice.**
Translate each word once and store it. Re-render only newly-revealed text. This is both a cost rule and a performance rule.

**Principle 6 — Test the boring failure paths.**
Bad API key, no network, a 50,000-word page, an extension reload mid-session. These are where real users hit bugs. Build small checks for them as you go, not at the end.

---

## 3. The architecture spine: your data model

Everything connects through one object — the **word bank** in `chrome.storage.local`. Picture it as the hub of a wheel; every feature is a spoke.

```
                        ┌──────────────────────────┐
                        │      WORD BANK (storage)  │
                        │  the single source of     │
                        │  truth for every feature  │
                        └────────────┬──────────────┘
            ┌────────────┬───────────┼───────────┬─────────────┐
            │            │           │           │             │
   ┌────────▼─────┐ ┌────▼─────┐ ┌───▼──────┐ ┌──▼────────┐ ┌──▼─────────┐
   │ Reading +    │ │ Trans-   │ │ Review / │ │ Pronun-   │ │ Progress   │
   │ glossing     │ │ lation   │ │ SRS      │ │ ciation   │ │ dashboard  │
   │ (content     │ │ layer    │ │ (quiz)   │ │ (audio)   │ │ (stats)    │
   │  script)     │ │          │ │          │ │           │ │            │
   └──────────────┘ └──────────┘ └──────────┘ └───────────┘ └────────────┘
     writes new       fills          reads &      reads          reads-only
     words, bumps     meaning/       writes       word +         aggregate
     level/readCount  pronunciation  review state  meaning        of all fields
```

**Why this matters:** reading, review, dashboard, and audio are all just different *views and updates* of the same records. If the record has the right fields, every feature is straightforward. If it doesn't, every feature fights the schema.

### Recommended schema (design now, even if unused)

Each word entry should carry:

| Field | Used by | Notes |
|-------|---------|-------|
| `word` | all | the key, lowercased |
| `meaning` | translation, glossing, review, audio | cache it; translate once |
| `pronunciation` | audio, glossing | IPA from dictionary |
| `level` | glossing | familiarity 1–100; ≥90 = stop glossing |
| `readCount` | dashboard | passive exposures |
| `createdAt` / `updatedAt` | dashboard | timestamps |
| `srs` (object) | review/SRS | **add now**: `{ interval, ease, nextReviewAt, lastResult }` — empty until SRS ships, but reserving it avoids a painful migration |
| `source` | dashboard | how the word entered (read / manual / import) |

Plus one top-level key: `schemaVersion` (start at `1`). The first thing your content script does on load is check it and run a migration if needed. This one habit prevents the worst class of bug.

> **The full, authoritative data model lives in [`DESIGN.md`](./DESIGN.md)** — including the event log, decks/tags, SRS fields, export/import, and the "store facts, derive scores" rule. That document is the buildable blueprint; this section is the summary.

---

## 4. Feature tiers — basic vs later

### Tier 0 — Foundation (BASIC — must be rock-solid first)
This is what you already have, plus the cleanup to make it trustworthy. **No new feature should start until Tier 0 is done.**

- Reading detection + ruby glossing _(built)_
- Word bank with familiarity levels _(built)_
- Local ECDICT dictionary, offline, no server _(built — now your default)_
- Popup toggle + settings word-bank viewer _(built)_
- **Cleanup:** translation caching, remove hardcoded key, `unlimitedStorage`, `schemaVersion` + migration, one-pass DOM rendering.

### Tier 1 — The core learning loop (your first real differentiator)
- **Smart context translations (BYO-key).** User pastes their own OpenAI key (stored locally), extension calls OpenAI directly, results cached into `meaning`. No server, scales infinitely, costs you nothing.
- **Real onboarding.** Replace the hardcoded "known words" seed with a first-run flow so glossing matches the user's actual vocabulary.

### Tier 2 — Engagement (turns a reader into a learner)
- **Review / quiz + SRS.** Uses the `srs` fields. Start with simple Leitner boxes; schedule reviews by `nextReviewAt`. Keep review progress separate from passive reading `level`.
- **Pronunciation audio.** Use the browser's built-in Web Speech API first (free, no key). Attach to glossed words and review cards.

### Tier 3 — Insight & launch
- **Progress dashboard.** Read-only aggregation of the word bank: words learned, level distribution, streaks. No new data — just views of what's already stored.
- **Privacy policy + store assets + submission.**

---

## 5. How the features connect

Read this as "to build X, Y must already exist."

| Feature | Depends on | Reads | Writes | Pitfall to avoid |
|---------|-----------|-------|--------|------------------|
| Glossing (Tier 0) | data model | `level`, `meaning` | new words, `level`, `readCount` | re-walking the whole DOM every scroll |
| Caching (Tier 0) | data model | `meaning` | — | translating a word more than once |
| Smart translations (Tier 1) | caching, data model | new words | `meaning` | logging/exposing the user's key; no error handling for bad key/quota |
| Onboarding (Tier 1) | data model | — | `level`, `source` | overwriting an existing bank on re-run |
| Review / SRS (Tier 2) | data model with `srs` fields | `srs`, `meaning` | `srs` | inventing your own scheduling algorithm; mixing review state into reading `level` |
| Audio (Tier 2) | data model | `word`, `pronunciation` | — | reaching for paid TTS before trying the free browser one |
| Dashboard (Tier 3) | everything above | all fields | — | creating a second source of truth instead of aggregating the bank |
| Launch (Tier 3) | all features stable | — | — | over-broad permissions; missing privacy disclosure |

The throughline: **Tier 0's data model unlocks everything; Tier 1 fills `meaning` well; Tier 2 uses the `srs` and `pronunciation` fields; Tier 3 just reads it all back.** Build in that order and nothing blocks on something unbuilt.

---

## 6. Build sequence & milestones

Each milestone is shippable on its own.

**M0 — Stabilize the foundation** _(Tier 0)_
Caching, remove key, `unlimitedStorage`, add `schemaVersion` + migration, consolidate DOM passes. Outcome: a fast, trustworthy, zero-server extension you'd be comfortable having friends use daily.

**M1 — Smart translations + onboarding** _(Tier 1)_
BYO-key translation mode with caching and full error handling; first-run vocabulary setup. Outcome: glosses are genuinely good and personalized.

**M2 — Review & audio** _(Tier 2)_
Leitner/SM-2 review mode on the `srs` fields; built-in speech audio. Outcome: LearnWise is now an active learning tool, not just a reading aid.

**M3 — Dashboard** _(Tier 3)_
Stats and streaks view. Outcome: users see progress, which drives retention.

**M4 — Launch** _(Tier 3)_
Privacy policy, minimal-permission audit, store listing + screenshots, package, submit. Outcome: live on the Chrome Web Store.

A reasonable rhythm for a solo builder is one milestone at a time, fully finished (including the failure-path checks) before moving on.

---

## 7. Testing strategy — where tests go

**Tests are not a task at the end, and not test-first for everything.** Split the code in two:

- **Pure logic** — schema migration, word-bank read/update, translation caching, SRS scheduling, dashboard aggregation. These are deterministic, high-risk (they touch user data), and easy to test. **Write the test first or alongside** here. The schema migration and SRS math especially: a bad migration wipes a user's words, so prove it with a test against a populated bank.
- **UI / DOM glue** — ruby rendering, scroll handling, popup wiring. Slow to unit-test and low-value solo. **Verify manually**; consider light end-to-end tests only if a bug keeps recurring.

So each milestone carries its own tests for its pure logic:

| Milestone | Test-first / alongside (pure logic) | Manual only (UI) |
|-----------|-------------------------------------|------------------|
| M0 | schema migration, word-bank update, caching | glossing render, scroll |
| M1 | key validation, cache-hit skip, error fallbacks | onboarding screens |
| M2 | SRS scheduling math, review-state updates | quiz UI, audio playback |
| M3 | stats aggregation | dashboard charts |

**Tooling:** add a lightweight runner (Vitest or Jest) for the pure-logic modules in M0 — this is itself an M0 setup step. Keep pure logic in separate files (not buried in the content script) so it's importable and testable.

---

## 8. Quality gates for a public product

Before M4, each of these must be true:

- **Permissions are minimal and justified.** Re-check `manifest.json`; drop anything unused. `<all_urls>` and `unlimitedStorage` each need a one-line justification ready for review.
- **Privacy is disclosed.** A hosted privacy policy stating data stays local except, in BYO-key mode, the words/sentences sent to the user's own OpenAI account.
- **No secrets in the bundle.** The hardcoded key is gone; the only key is the user's own, stored locally, never logged.
- **Graceful failures.** Bad/empty API key, offline, huge pages, and extension-reload mid-session all degrade cleanly (you already handle the reload case — keep that).
- **Data safety.** `schemaVersion` migration tested with a populated bank so an update never wipes a user's words.
- **Performance budget.** Scrolling a long article stays smooth (one DOM pass per cycle, dedupe rendered words).

---

## 9. Risks & how to de-risk

- **Scope creep** (biggest risk with four features). _De-risk:_ the milestone rule — finish one, ship it, then the next.
- **Data-loss on updates.** _De-risk:_ schema versioning + migration from M0, tested against a full bank.
- **Chrome review rejection.** _De-risk:_ minimal permissions and a real privacy policy from the start, not at M4.
- **Key handling in BYO-key mode.** _De-risk:_ store locally only, never log, validate before use, handle quota/billing errors with a clear user message.
- **SRS complexity.** _De-risk:_ start with simple Leitner boxes; only move to SM-2 if you need finer scheduling.

---

## 10. Decisions

**Resolved — product & monetization:**

- **Languages:** English→Chinese at launch. Pluggable target languages **later**. _Design note:_ keep the translation layer behind one function.
- **Default translation mode:** local dictionary for everyone. Smart translations (BYO-key free / managed paid) are opt-in.
- **Translation backends — keep BOTH:** BYO-key (free) and provided-server (paid), as long as the provided server is priced and quota-limited.
- **Cross-device sync:** **v2, PAID.** Word bank won't be tiny, so `chrome.storage.sync` is ruled out — needs a real backend. Managed serverless (Supabase/Firebase), not self-run. Local-first now; `updatedAt` supports last-write-wins.
- **Monetization — freemium (v2):** Free = local + BYO-key + local-only storage. Paid = managed translations + cloud sync. Both paid features share one foundation (accounts + billing) — build once, ship together.

**Resolved — data model & privacy:**

- **Location logging:** **domain-only by default**, with a user opt-in to capture full URLs. Keeps the launch privacy story clean.
- **Word promotion:** a word is **glossed and event-logged on first sighting, but only promoted to a tracked Word record on the 2nd sighting.** Filters one-off junk (names/typos/code), keeps the bank small/fast, loses no data (events keep everything). Manual capture / click-known promote immediately.
- **Grouping:** **managed decks** (id + name), referenced by `WORD.tags`. Supports rename, color, per-deck stats.

**Still open (defer to v2):**

- **Backend: Firebase vs Supabase vs self-run Node.** Both managed options are $0 at low volume; "no cost" = staying in either free tier. Lean **Supabase** (Postgres fits per-user rows, built-in auth, open-source self-host escape hatch). Confirm at v2 against current free-tier limits.

---

### How this maps to your task list
The session task list is the execution view of this plan: M0 = tasks for caching/key/storage/perf, M1 = BYO-key + onboarding, M2 = review/audio, M3 = dashboard, M4 = privacy/assets/submit. This document is the *why and how-they-connect*; the task list is the *do-next*.
