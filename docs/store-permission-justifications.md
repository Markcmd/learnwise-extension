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

## Data usage disclosures (check on the form)

- Does the extension collect/transmit user data? **No.** This version makes no
  network requests and works fully offline; nothing is collected or transmitted.
  (A future opt-in "smart translation" feature would send a word + context to a
  user-chosen AI provider using the user's own key — never to a LearnWise server;
  the policy will be updated before that ships.)
- Personally identifiable info: **No** (extension does not collect names, emails,
  addresses, etc.).
- Health / financial / authentication info: **No.**
- Personal communications, location, web history: the extension stores, **only
  on the device**, the website domains where words were seen (domain-only by
  default; full-URL is an off-by-default opt-in). This is never transmitted.
- Selling data / using it for purposes unrelated to core function / using it for
  creditworthiness or lending: **No** to all (required certifications).

## Privacy policy URL

> (Set once GitHub Pages is published — see docs/privacy-policy.md and the 4.1
> session log. The hosted `docs/index.html` URL goes here.)
