# LearnWise — Scalability & Server-Cost Roadmap

_Last updated: 2026-06-22_

This roadmap answers two questions:

1. **How do I stop paying for the AWS EC2 server?**
2. **How do I keep LearnWise scalable as more people use it?**

The good news: your architecture is already mostly client-side, so both problems are easier than they look. The EC2 server only does one job — the `/translate` endpoint that proxies to OpenAI. Everything else (word bank, familiarity tracking, ECDICT lookups, rendering) runs in the browser with **zero server**.

---

## The core insight

You have two translation backends, and only one of them needs a server:

| Mode | What it does | Server needed? | Cost |
|------|--------------|----------------|------|
| `local` (ECDICT) | Looks up bundled dictionary shards in the browser | **No** | $0 |
| `api` (OpenAI) | Sends visible sentence + words to EC2 → OpenAI | Yes (currently EC2) | EC2 24/7 + OpenAI tokens |

The EC2 box costs money **even when nobody is using it**, because it runs around the clock. That's the thing to kill. Below are the moves, cheapest-first.

---

## Phase 0 — Quick wins (do these first, days)

### 0.1 Cache translations so you never pay for the same word twice ⭐ biggest cost lever
Right now `buildShowDictWithTranslations()` re-fetches translations for the whole visible "show" set on **every scroll pass**. In `api` mode that means repeated OpenAI calls for words you've already translated.

Your word bank already stores `meaning` and `pronunciation` per word. So:

- Before calling the API, check the word bank. If `meaning` is already filled, use it — skip the network call entirely.
- Only send genuinely-new, never-translated words to the API.

After a short warm-up period, almost every word on a page is already cached, and API calls drop by ~90%+. This single change makes _any_ backend dramatically cheaper and is worth doing no matter which server path you pick.

### 0.2 Remove the hardcoded API key
`contentScript.js` ships a literal `API_KEY` string that's committed to git and visible to anyone who installs the extension. It provides no real security and becomes irrelevant once you pick a server path below. Remove it.

### 0.3 Stop paying EC2 while developing
For your own testing you don't need EC2 at all — run the Node server on `localhost` and point the extension there. Spin EC2 down. (Localhost only works for you, not shipped users — that's what Phase 1 solves.)

---

## Phase 1 — Eliminate the server cost (pick ONE path)

### Path A — Local-first, server optional 💰 cheapest, recommended to start
Make `local` (ECDICT) the default for everyone and treat the OpenAI server as an optional power-user feature (or drop it for now). ECDICT has ~770k entries and covers the overwhelming majority of words users will hit.

- **Server cost: $0.** Shut EC2 down entirely.
- **Trade-off:** ECDICT gives dictionary-style glosses, not sentence-context-aware translations. For a vocabulary tool this is usually fine.
- **Effort:** trivial — flip the default, keep `api` behind a toggle that's off unless configured.

### Path B — Serverless proxy (keep context translations, near-zero idle cost)
If you want to keep the OpenAI-powered context translations but stop paying for an idle box, move the `/translate` endpoint off EC2 onto a **pay-per-request** platform:

- **Cloudflare Workers** (generous free tier) or **AWS Lambda + API Gateway**.
- You pay per invocation instead of 24/7. At low/hobby volume this rounds to ~$0; you only pay the OpenAI token cost.
- Combined with the 0.1 caching change, invocations stay very low.
- **Effort:** moderate — port `server.mjs` logic into a single handler function, move the OpenAI key into the platform's secret store, update the extension's endpoint URL.
- **Note:** verify current pricing on each platform before committing — free-tier limits change.

### Path C — Bring-your-own-key (no server at all, scales infinitely) 🚀 best long-term
Let each user paste **their own** OpenAI API key into the settings page (stored in `chrome.storage.local`). The extension calls OpenAI directly. No server, no shared key, and cost is borne per-user so it scales with users automatically.

- **Server cost: $0. Your scaling cost: $0.**
- **Trade-off:** asks users for a key (fine for a power-user/friends audience, a barrier for mass-market). Also requires a clear privacy note since their browser talks to OpenAI directly.
- **Effort:** moderate — add a key field + validation to settings, move the OpenAI call client-side.

**Recommendation:** Ship **Path A** now (instant $0), and offer **Path C** as the opt-in "smart translation" mode for users who want context-aware glosses. That combination is permanently free for you and scales without limit. Reach for Path B only if you specifically want to keep translations server-side without asking users for keys.

---

## Phase 2 — Scalability hardening

Because the word bank and most logic live in the browser, "scaling to more users" mostly means **each client stays fast** and **any server stays stateless**. Concrete items:

### Client performance
- **Dedupe across passes.** Track which words you've already rendered on the current page so each scroll pass only processes newly-revealed text instead of re-walking the whole DOM.
- **Reuse the viewport walk.** `getVisibleWordsInViewport`, `getReadableTextInViewport`, and `renderShowDictUseRubys` each do their own full `TreeWalker` pass. Consolidate to one pass per cycle.
- **Consider `IntersectionObserver`** instead of scroll+debounce for detecting newly-visible text — less work per scroll.

### Storage growth
- Add the **`unlimitedStorage`** permission so a growing word bank never hits the ~10MB `chrome.storage.local` cap.
- If the bank gets very large (tens of thousands of words), migrate from `chrome.storage.local` to **IndexedDB** for faster reads/writes.

### Dictionary size
- ECDICT is already sharded by first letter and lazy-loaded per shard with a cache — good. Keep it that way; don't load the whole dictionary at once.

### Server (if you keep one — Path B)
- Keep it **stateless** (no per-user state on the server). Stateless + serverless = horizontal scaling for free.
- Add basic rate-limiting / a per-request cap so one heavy page can't run up your OpenAI bill.

---

## Phase 3 — Product polish (after the above)

- **Real onboarding** to replace the hardcoded ~100 "known" words seed (there's a `TODO` for this): let users set their starting level / known-words.
- **Editable word bank** in settings (edit, delete, clear, import) — currently read-only + download.
- **Pronunciation audio**, review/quiz mode, spaced repetition.
- **Privacy note** in the store listing describing what (if anything) leaves the browser, especially for `api`/BYO-key modes.

---

## Suggested order

1. Phase 0.1 caching + 0.2 remove key + 0.3 localhost dev → stop the bleeding.
2. Phase 1 Path A (default to local) → **EC2 off, cost = $0.**
3. Phase 2 client performance + storage → smooth as users grow.
4. Phase 1 Path C (BYO-key opt-in) → context translations back, still free for you.
5. Phase 3 polish.

The headline: **after step 2 your server cost is zero**, and nothing about your design forces it to come back.
