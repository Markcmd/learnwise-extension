# LearnWise — Chrome Web Store submission checklist (M4.4)

Everything below runs on **your Mac** (the build + zip can't be done from the
Cowork sandbox). Work top to bottom.

---

## 0. Pre-submit gate — do these first

- [ ] **Delete leftover files** (sandbox couldn't remove them):
      `rm CSSs/.__wtest tests/decks.test.js`
      (`decks.test.js` is an orphaned test for the removed decks module — it
      fails `npm test` until deleted; the replacement logic is covered by
      `tests/difficulty.test.js`.)
- [ ] **Fresh build:** `npm install && npm run build` (regenerates `dist/` — the
      manifest points at the bundles).
- [ ] **Tests green:** `npm test`.
- [ ] **Publish the privacy policy** so it has a public URL (required by the
      Privacy tab). Push `docs/`, then GitHub repo → **Settings → Pages** →
      Deploy from a branch → `main` / `/docs`. Confirm it loads at
      **https://markcmd.github.io/learnwise-extension/** (this exact URL is
      already referenced by the in-app Privacy card and the justifications doc).
- [ ] **Package:** `./package.sh` → produces `dist-package/learnwise-v1.0.13.zip`
      (49 runtime files, `manifest.json` at root, no sources/tests/docs). The
      script prints a sanity check confirming no leaks.
- [ ] **Smoke-test the packaged build:** at `chrome://extensions`, "Load
      unpacked" on `dist-package/stage/` (or unzip the zip and load that) — not
      your dev repo — and confirm glossing, review, dashboard, and settings all
      work from the *packaged* files.

## 1. Developer account (one-time)

- [ ] Register at https://chrome.google.com/webstore/devconsole/ — one-time
      **$5** registration fee, paid with a Google account.
- [ ] Complete the account/publisher details it asks for (name, contact email).

## 2. Create the item + upload

- [ ] Dashboard → **Add new item** → upload
      `dist-package/learnwise-v1.0.13.zip`.
- [ ] Wait for it to process; fix any manifest warnings it surfaces.

## 3. Store listing tab

Source copy: **`docs/store-listing-copy.md`** (English + 中文 versions).

- [ ] **Detailed description:** paste the Chinese block (recommended for the CN
      audience) or Chinese-then-English bilingual.
- [ ] **Summary** (the short one, ≤132 chars): from the same doc.
- [ ] **Category:** Education.
- [ ] **Language:** Chinese (Simplified) if leading with Chinese; else English.
- [ ] **Screenshots (1280×800):** upload the 5 from
      `docs/assets/screenshots/store-shot-1..5.png` (order: glossing → review →
      dashboard → word bank → privacy).
- [ ] **Small promo tile (440×280, required):**
      `docs/assets/promo-tile-440x280.png`.
- [ ] **Marquee promo tile (1400×560, optional):**
      `docs/assets/promo-marquee-1400x560.png`.
- [ ] **Store icon:** taken from the manifest (`icons/LEARNWISE_128.png`) — no
      separate upload needed.
- [ ] **Homepage URL** (optional): `https://github.com/Markcmd/learnwise-extension`
- [ ] **Support URL** (optional): the repo's Issues page.

## 4. Privacy tab

Source copy: **`docs/store-permission-justifications.md`**.

- [ ] **Single purpose** — paste from the doc.
- [ ] **Permission justifications** — only two to justify now: `storage`,
      `unlimitedStorage`, plus the `<all_urls>` host access for the content
      script (all in the doc). No provider host permissions anymore.
- [ ] **Data usage disclosures** — tick the "does NOT collect/transmit" answers
      per the doc (v1 is fully offline). Certify the three required statements
      (no selling, no unrelated use, no creditworthiness use).
- [ ] **Privacy policy URL:** paste **https://markcmd.github.io/learnwise-extension/**
      (must be live from step 0).

## 5. Distribution / visibility

- [ ] **Pricing:** Free.
- [ ] **Visibility:** consider **Unlisted** for the first release (only people
      with the link can find it) — soft-launch, share with a few learners, flip
      to **Public** once you've seen it help someone. Public is fine too; your
      call.
- [ ] **Regions:** default is all regions. If you want to target CN-language
      users specifically you can still leave it global (recommended).

## 6. Submit

- [ ] Resolve any remaining red validation items the dashboard flags.
- [ ] **Submit for review.**
- [ ] Review time is typically a few days (sometimes longer). You'll get an email
      on approval or if changes are requested.

---

## Notes / gotchas

- **Keep manifest, policy, and listing in agreement.** They're aligned right now
  (v1.0.13, fully offline, BYOK "coming soon"). If you later enable BYOK
  (`FEATURE_BYOK=true`), you must re-add the provider `host_permissions`, restore
  the active-BYOK wording in the policy + listing, bump the version, and
  re-submit.
- **Version bumps:** every store update needs a higher `manifest.json` `version`.
- **Screenshots are English-captioned.** Optional to redo in Chinese; cosmetic.
- If the dashboard rejects the zip for an "unused permission," re-check that the
  packaged `manifest.json` is the v1.0.13 one (no host permissions).
