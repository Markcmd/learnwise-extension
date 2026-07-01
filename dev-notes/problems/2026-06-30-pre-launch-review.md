# Pre-launch code review (before M4.4)

**Date:** 2026-06-30 · Full-project pass for bugs/errors before packaging.

**Bottom line:** no blocking *runtime* bugs. All JS parses (`node --check`), core
logic is correct, the inlined mirrors are in sync, background message handlers
keep the channel open correctly, migration is safe, and icons/CSS/assets all
resolve. Findings are one launch-consistency issue + cleanup.

## 1. Launch consistency — BYOK disabled vs permissions/policy/listing (TOP)

`settingsWindow.js` has `FEATURE_BYOK = false` (D-001) → the smart-translation
UI is a "coming soon" card and a user **cannot** switch translation source to
`byok`. But:
- `manifest.json` declares `host_permissions` for `api.openai.com`,
  `api.anthropic.com`, `openrouter.ai` **and** broad `optional_host_permissions`
  (`http://*/*`, `https://*/*`) — all only used by the BYOK path.
- `docs/privacy-policy.md` / `docs/index.html` and `docs/store-listing-copy.md`
  describe smart translations / sending words to AI providers as an available
  opt-in.

So the manifest requests host access a shipped-disabled feature can't use, and
the policy/listing describe a feature the reviewer won't find. CWS reviewers
commonly reject "host permissions not used by the extension."

**Reconcile before submit — pick one:**
- (A) **Enable BYOK for v1** (`FEATURE_BYOK = true`), verify the settings form +
  background path end-to-end. Keeps permissions + policy honest.
- (B) **Ship v1 without BYOK** (recommended smaller move): remove the three
  provider `host_permissions` and the `optional_host_permissions` from the
  manifest, and change the policy + listing wording to "AI translations coming
  soon" (the in-app card already says that). Re-add them when BYOK ships.

Whichever: manifest + policy + listing + UI must agree.

**RESOLVED 2026-06-30 — took option (B):**
- `manifest.json` → **v1.0.13**; removed the provider `host_permissions` and the
  `optional_host_permissions` (now: `permissions` = storage + unlimitedStorage,
  content script `<all_urls>`, no host perms). JSON re-validated.
- Aligned all copy to "fully offline; smart translations coming later":
  `docs/privacy-policy.md`, `docs/index.html`, `docs/store-listing-copy.md`,
  `docs/store-permission-justifications.md`, and the in-app **Privacy** card in
  `HTMLs/settingsWindow.html`.
- Left the BYOK code in place (gated by `FEATURE_BYOK=false`); re-add the host
  perms + restore the policy's active-BYOK wording when the feature ships.
- **No rebuild needed** (manifest + classic HTML + docs only).

## 2. Dead / orphaned files still in the repo (will ship in the zip)

Imported/linked nowhere (grep-verified):
- `JSs/core/decks.js` — notes say removed in M2.4, still on disk.
- `JSs/data/commonWords.js` — replaced by onboarding seed.
- `JSs/dom/openai.js` — back-compat shim; `dom/llm.js` is the live one.
- `HTMLs/dashboard.html` + `CSSs/dashboard.css` — notes say deleted in the
  post-M3 merge; still present, linked from nowhere.

Recommend deleting before packaging (smaller, cleaner review). **Keep
`dist/dashboard.js`** — that bundle *is* used by `settingsWindow.html`.

**Status 2026-06-30:** couldn't delete from the Cowork sandbox — the
OneDrive-synced working tree blocks `unlink` (bash can create but not delete),
so `git rm` failed and left a stale `.git/index.lock`. **Mark to run on his Mac:**
```
cd <repo>
rm -f .git/index.lock
git rm JSs/core/decks.js JSs/data/commonWords.js JSs/dom/openai.js HTMLs/dashboard.html CSSs/dashboard.css
git rm tests/decks.test.js   # orphaned test for the deleted decks module (breaks `npm test`)
```

> **Follow-up (2026-07-01):** `npm test` failed on `tests/decks.test.js` importing
> the now-deleted `core/decks.js`. The review scanned `JSs/` but not `tests/` —
> this orphaned test slipped through. Delete it (command above); the replacement
> automatic-difficulty logic is covered by `tests/difficulty.test.js`.
Independently, the **M4.4 package script uses an allowlist** (copies only runtime
files), so these never ship even if they linger in the repo.

## 3. Minor

- **6 `console.log`** calls under `JSs/` — harmless, but strip for a clean prod
  build if easy.
- **`manifest.json` icons** include a non-standard `"500"` key — harmless (Chrome
  ignores unknown sizes); can drop.
- **"n/a" glosses** (renderer `pickFirstChineseTranslation(...) || "n/a"`) — a
  *documented, accepted* decision (`decisions/na-words.md`: expand the dict over
  time). The recorded not-taken option — *gate glosses on dict-membership so
  non-dictionary tokens (proper nouns/typos) never render `n/a`* — would visibly
  improve the first impression (and the store hero). Worth reconsidering for v1.

## 4. Packaging note for M4.4

The repo contains lots of **non-runtime** files that must NOT ship: `tests/`,
`dev-notes/`, `docs/`, `dict-supplement/`, `node_modules/`, `build.mjs`,
`verify-srs.mjs`, `test-results.txt`, `package*.json`, `vitest.config.js`, and
the raw `JSs/core|dom` sources (only the **bundled** `dist/` + the two classic
scripts `JSs/popup.js`, `JSs/settingsWindow.js` are loaded).
Ship only: `manifest.json`, `dist/`, `HTMLs/`, `CSSs/`, `JSs/popup.js`,
`JSs/settingsWindow.js`, `icons/`, `ecdict_json/`, `data/frequency.json`.
Build a clean packaging script in 4.4 rather than zipping the repo root.
