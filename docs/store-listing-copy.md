# LearnWise — Chrome Web Store listing copy

Paste-ready text for the **Store listing** tab. Angle: lead with the learning
benefit, make privacy a strong secondary hook (per the "both, balanced"
decision).

---

## Primary category

**Education**
(Best fit — it's a vocabulary-learning tool. "Productivity" is the fallback if
you'd rather position it as a reading utility, but Education matches user intent
better for search.)

## Language

**English**

## Short summary (the manifest `description` field — max 132 characters)

Recommended (122 chars):

> Learn English vocabulary while you read. LearnWise glosses unfamiliar words inline and tracks them — private and on-device.

Shorter alt (97 chars):

> Learn vocabulary as you browse: inline meanings, spaced-repetition review, fully private and offline.

> The current manifest value is "An extension to help you learn and retain
> vocabulary knowledge effectively." Consider swapping in the recommended summary
> above (it's more concrete and uses the words people search for).

---

## Detailed description (Store listing → Detailed description)

> Open the description with a one-line statement of what it does, then details —
> that's exactly what Google recommends. Copy everything between the lines.

---

**Learn English vocabulary without leaving the page you're reading.**

LearnWise quietly works in the background as you browse. When it spots a word you
probably don't know yet, it adds a small inline meaning right next to it — so you
keep reading instead of breaking off to look things up. Every word you encounter
is tracked in a personal word bank that gets smarter about what you already know.

**How it works**

• Read normally. LearnWise glosses unfamiliar words inline, in context.
• Words you keep seeing get added to your word bank automatically; words you
  already know are left alone.
• Review what you're learning with built-in spaced-repetition flashcards
  (Again / Hard / Good / Easy), so the words you find hardest come back more
  often and stick.
• Hear any word pronounced out loud.
• Watch your progress on a built-in dashboard: words tracked, words known, day
  streak, review accuracy, and a 30-day activity view.
• Tune your starting point with a quick vocabulary calibration so LearnWise only
  glosses words above your level — not ones you already know.

**Private by design**

LearnWise keeps your word bank, reading history, and settings **only on your own
device**. There is no LearnWise account and no LearnWise server — nothing about
what you read is uploaded to us, because there's nowhere for it to go. Reading
history is recorded by website domain only (logging full page addresses is an
option that's switched off by default). No analytics, no tracking, no ads.

**Works offline**

Out of the box, meanings come from a comprehensive English–Chinese dictionary
bundled inside the extension, so glossing works with no internet connection and
nothing leaves your computer. If you ever want AI-quality definitions, you can
optionally connect your own AI provider key (OpenAI, Anthropic, OpenRouter, or a
custom endpoint) — entirely your choice, and your key stays on your device.

**You're in control**

• Click a word you already know to stop glossing it.
• Edit or delete any saved word, or clear everything in one tap.
• Export your word bank to a file and import it back any time.

Start reading, and let your vocabulary grow on its own.

---

## Additional listing URLs (optional fields)

- **Homepage URL:** `https://github.com/Markcmd/learnwise-extension`
  (or your GitHub Pages site once published)
- **Support URL:** `https://github.com/Markcmd/learnwise-extension/issues`
- **Privacy policy URL** (Privacy tab, required): `https://markcmd.github.io/learnwise-extension/`
  — publish GitHub Pages first (see 4.1).
- **Promotional YouTube video:** optional; skip for v1.

## Notes / decisions

- The description mentions the **English–Chinese** dictionary (ECDICT) because
  that's what actually ships — keep this accurate; if you broaden languages
  later, update the copy.
- BYOK smart translations are described as **optional**. If you launch with the
  Settings "Smart translations" card still gated "Coming soon" (D-001), change
  "you can optionally connect your own AI provider key" to "AI-quality
  definitions are coming soon" to stay consistent with the UI. (Same caveat
  flagged in the 4.1 log.)
- Avoid keyword stuffing — the copy above is deliberately readable; Google's
  spam policy penalizes repeated keywords.
