# LearnWise — Privacy Policy

**Effective date:** June 29, 2026
**Last updated:** June 29, 2026

LearnWise is a Chrome extension that helps you learn English vocabulary while you
read the web. It glosses unfamiliar words inline, tracks your familiarity in a
personal word bank, and offers spaced-repetition review.

This policy explains exactly what data LearnWise handles and where it goes. The
short version: **LearnWise has no server, runs no analytics, stores everything
on your own device, and sends nothing over the network — it works fully
offline.**

## Summary

| | |
|---|---|
| Do we run a server that receives your data? | **No.** |
| Do we use analytics, tracking, or advertising? | **No.** |
| Do we sell or share your data? | **No.** |
| Where is your data stored? | **Only on your device**, in the browser's local extension storage. |
| Does any data ever leave your device? | **No.** This version makes no network requests and works fully offline. |

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
- **Your settings** — your preferences, such as theme and how reading history is
  logged. (If the future opt-in "smart" translation feature is added, any AI key
  you choose to enter would also be stored locally only and never sent to us.)

You can edit or delete individual words at any time, and "Clear all words"
removes everything LearnWise has accumulated.

## What leaves your device

**Nothing.** LearnWise looks up word meanings using a **dictionary bundled inside
the extension** (ECDICT, stored locally). It makes **no network requests** to
translate — it works fully offline, and no information about what you read is
transmitted anywhere.

### Planned: optional "smart" translations (not in this version)

A future version may add optional AI-powered definitions. If it does, the feature
will be strictly **opt-in** and will use an AI provider and an API key that
**you** supply — sending only the word (and optionally one sentence of context)
**directly from your browser to the provider you choose**, never through a
LearnWise server. This feature is **not enabled in the current version**. This
policy will be updated to describe it in full before it ships.

## Permissions, and why LearnWise asks for them

- **Read and change data on websites you visit (`<all_urls>` content script)** —
  required so LearnWise can find words on the page and show inline meanings. The
  extension reads page text locally to do this and does not send page content
  anywhere.
- **Storage / unlimited storage** — to keep your word bank, logs, and settings
  on your device. "Unlimited" storage is requested because a large vocabulary
  history can exceed the small default quota.

LearnWise requests **no host/network permissions** in this version — consistent
with working fully offline.

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
