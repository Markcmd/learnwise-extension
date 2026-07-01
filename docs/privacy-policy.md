# LearnWise — Privacy Policy

**Effective date:** June 29, 2026
**Last updated:** June 29, 2026

LearnWise is a Chrome extension that helps you learn English vocabulary while you
read the web. It glosses unfamiliar words inline, tracks your familiarity in a
personal word bank, and offers spaced-repetition review.

This policy explains exactly what data LearnWise handles and where it goes. The
short version: **LearnWise has no server, runs no analytics, and stores
everything on your own device. Nothing leaves your computer unless you turn on
the optional "smart translation" feature, which uses an AI provider and an API
key that you supply.**

## Summary

| | |
|---|---|
| Do we run a server that receives your data? | **No.** |
| Do we use analytics, tracking, or advertising? | **No.** |
| Do we sell or share your data? | **No.** |
| Where is your data stored? | **Only on your device**, in the browser's local extension storage. |
| Does any data ever leave your device? | **Only if you opt in to "smart (BYO-key) translation"** — and then only to the AI provider *you* choose, using *your* key. |

## What LearnWise stores (all on your device)

LearnWise saves the following locally, using the browser's built-in extension
storage (`chrome.storage.local`) and on-device database (IndexedDB). This data
never reaches us — we have no way to see it.

- **Your word bank** — words you have encountered, their meanings and
  pronunciations, your familiarity level for each, and spaced-repetition review
  state.
- **An exposure log** — a record of which words you saw, when, and on which
  **website domain**. By default this stores the **domain only** (for example
  `example.com`), never the full page address. You can optionally enable
  full-URL logging in Settings; it is off by default.
- **Review history** — the results of your flashcard reviews, used to schedule
  future reviews and to compute your progress dashboard.
- **Your settings** — including, if you use smart translation, your chosen AI
  provider, model, and API key. The API key is stored locally and is only ever
  read inside the extension's background process to make the request you asked
  for. It is never displayed back on web pages and is never sent to us.

You can edit or delete individual words at any time, and "Clear all words"
removes everything LearnWise has accumulated.

## What leaves your device

### Default mode: nothing leaves your device

By default, LearnWise looks up word meanings using a **dictionary bundled inside
the extension** (ECDICT, stored locally). In this mode, LearnWise makes **no
network requests** for translations — it works fully offline, and no information
about what you read is transmitted anywhere.

### Optional "smart (BYO-key) translation"

If — and only if — you turn on smart translation in Settings and provide your
own API key, LearnWise will contact the AI provider **you** select. The
supported providers are OpenAI, Anthropic, OpenRouter, and any
OpenAI-compatible "custom" endpoint you configure (including a local one).

When this mode is on, each translation request sends to that provider:

- the **word or words** to be defined, and
- optionally, **a single sentence of surrounding context** from the page where
  the word appeared, so the AI can pick the meaning that fits.

This request is made directly from your browser to the provider, using your own
API key. **It does not pass through any LearnWise server** (we don't operate
one). The data you send is handled under **that provider's** privacy policy and
terms — please review them:

- OpenAI: https://openai.com/policies/privacy-policy
- Anthropic: https://www.anthropic.com/legal/privacy
- OpenRouter: https://openrouter.ai/privacy
- A "custom" endpoint is governed by whoever operates it.

If a smart-translation request fails or you are offline, LearnWise quietly falls
back to the bundled local dictionary.

## Permissions, and why LearnWise asks for them

- **Read and change data on websites you visit (`<all_urls>` content script)** —
  required so LearnWise can find words on the page and show inline meanings. The
  extension reads page text locally to do this; it does not send page content
  anywhere except, in smart-translation mode, the single word/context sentence
  described above.
- **Storage / unlimited storage** — to keep your word bank, logs, and settings
  on your device. "Unlimited" storage is requested because a large vocabulary
  history can exceed the small default quota.
- **Access to AI provider domains** (`api.openai.com`, `api.anthropic.com`,
  `openrouter.ai`) — used only to make smart-translation requests when you have
  enabled that feature and supplied a key. If you configure a custom endpoint,
  the extension asks for permission to that specific address at the time you set
  it up.

## Data retention

Everything is kept locally until you remove it. The exposure log is
automatically pruned over time — entries older than roughly 90 days are
collapsed into per-word summary counts and the detailed records are deleted.
Uninstalling the extension removes its locally stored data through the browser.

## Children's privacy

LearnWise is a general-audience learning tool and is not directed at children
under 13. It does not knowingly collect personal information from children.

## Changes to this policy

If this policy changes, the "Last updated" date above will change and the
revised policy will be posted at this page. Material changes will be reflected in
the extension's listing.

## Contact

Questions about this policy or your data? Contact the developer at
**lovekinball311@gmail.com**.
