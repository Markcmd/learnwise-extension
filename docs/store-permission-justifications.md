# LearnWise — Permission justifications (Chrome Web Store review form)

Paste these into the **Privacy practices** tab of the developer dashboard. Each
field below maps to a prompt Google's review form asks for. Keep them short and
specific — vague justifications are a common rejection cause.

Current manifest (v1.0.12) declares:

- `permissions`: `storage`, `unlimitedStorage`
- `host_permissions`: `https://api.openai.com/*`, `https://api.anthropic.com/*`, `https://openrouter.ai/*`
- `optional_host_permissions`: `http://*/*`, `https://*/*`
- content script `matches`: `<all_urls>`
- (Dropped in 4.2: `activeTab` — was unused.)

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

## Host permission: `api.openai.com`, `api.anthropic.com`, `openrouter.ai`

> Used only for the optional "smart translation" feature. When a user explicitly
> enables it and enters their own API key, the extension sends the word(s) being
> defined (and optionally one sentence of page context) directly from the
> browser to the provider the user chose, to get a higher-quality definition.
> These hosts are the supported AI providers. The feature is off by default; with
> it off, the extension makes no requests to these hosts and works fully offline
> using a bundled local dictionary.

## Optional host permissions: `http://*/*`, `https://*/*`

> Optional (not granted at install). Requested at runtime only if a user
> configures a "custom" OpenAI-compatible translation endpoint of their own
> (including a self-hosted/local one). Because that endpoint can be any address
> the user supplies, the extension requests permission to that specific origin at
> the moment the user sets it up. Users who don't configure a custom endpoint are
> never prompted.

## Host access for the content script: `<all_urls>`

> The core feature — glossing unfamiliar words inline — must work on whatever
> page the user is reading, so the content script needs to run on all sites. It
> reads the page's visible text locally to find words and insert inline meanings.
> Page content is not transmitted anywhere, except that in the optional
> smart-translation mode a single word and one context sentence are sent to the
> user's chosen AI provider (see above).

## Remote code

> No. The extension executes no remotely hosted code. All scripts are packaged in
> the extension; the bundled local dictionary is the default translation source.

## Data usage disclosures (check on the form)

- Does the extension collect/transmit user data? **Only with the user-enabled
  smart-translation feature**, and then only to the user's chosen third-party AI
  provider using the user's own key — never to a LearnWise server (there isn't
  one). In default mode, nothing is collected or transmitted.
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
