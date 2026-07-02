# LearnWise — Permission justifications (Chrome Web Store review form)

Paste these into the **Privacy practices** tab of the developer dashboard. Each
field below maps to a prompt Google's review form asks for. Keep them short and
specific — vague justifications are a common rejection cause.

Current manifest (v1.0.13) declares:

- `permissions`: `storage`, `unlimitedStorage`
- content script `matches`: `<all_urls>`
- **No host permissions.** (Dropped in 4.2: `activeTab`. Dropped in the
  pre-launch review: the OpenAI/Anthropic/OpenRouter `host_permissions` and the
  broad `optional_host_permissions` — the BYOK "smart translation" feature ships
  disabled in v1, so those were unused. They'll return when BYOK ships.)

---

## Single purpose

> LearnWise helps users learn English vocabulary while they read the web. It
> detects unfamiliar words on the pages a user visits, shows an inline meaning,
> tracks each word's familiarity in a personal on-device word bank, and provides
> spaced-repetition review.

## Permission: `storage`

> Stores the user's word bank, settings, and learning progress in the browser's
> local extension storage so their vocabulary and preferences persist between
> sessions. No data is sent to any LearnWise server — there is none.

## Permission: `unlimitedStorage`

> A user's vocabulary history (words seen, review history, exposure log) grows
> over time and can exceed the small default storage quota. `unlimitedStorage`
> lets the extension keep a complete local learning history without hitting the
> quota. All of it stays on the user's device.

## Host access for the content script: `<all_urls>`

> The core feature — glossing unfamiliar words inline — must work on whatever
> page the user is reading, so the content script needs to run on all sites. It
> reads the page's visible text locally to find words and insert inline meanings.
> Page content is never transmitted anywhere; all lookups use a dictionary
> bundled inside the extension and everything stays on the user's device.

## Remote code

> No. The extension executes no remotely hosted code. All scripts are packaged in
> the extension; the bundled local dictionary is the default translation source.

## Data usage disclosures (Privacy practices → Data usage)

> IMPORTANT: Google's User Data FAQ (Q3) says you must disclose data the
> extension **handles even if it is only processed/stored locally** and never
> transmitted. So "fully offline" does NOT mean "disclose nothing." Disclose to
> match the privacy policy + actual behavior — inconsistencies can get a
> publisher suspended.

**"What user data do you plan to collect?" — check these two:**

- ✅ **Website content** — the content script reads the visible page text to find
  and gloss words (bundled dictionary, on-device).
- ✅ **Web history** — the exposure log records the **website domain** (and the
  full URL only if the user opts in) + a timestamp for pages where words are
  glossed. That's a record of pages visited, so it maps to "Web history." The
  privacy policy already discloses this, so this box must match.

**Leave unchecked:** Personally identifiable info, Health, Financial/payment,
Authentication, Personal communications, Location.

- **User activity** — judgment call; leave **unchecked**. The only interactions
  logged are clicking a gloss to mark a word "known" and grading review cards —
  the mechanics of the extension's own features, not behavioral/clickstream
  tracking. (Check it only if you want to over-disclose.)

**Certify all three (required) — all TRUE for LearnWise:**

- ✅ I do not sell or transfer user data to third parties (nothing is transmitted
  at all in v1).
- ✅ I do not use/transfer user data for purposes unrelated to the single purpose.
- ✅ I do not use/transfer user data to determine creditworthiness or for lending.

> Consistency note: none of this data is transmitted off-device — these
> disclosures cover **local handling**, which Google still requires. This agrees
> with the privacy policy (fully offline; discloses domain-only reading history).

## Privacy policy URL

> (Set once GitHub Pages is published — see docs/privacy-policy.md and the 4.1
> session log. The hosted `docs/index.html` URL goes here.)
