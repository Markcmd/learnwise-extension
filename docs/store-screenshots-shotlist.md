# LearnWise — Screenshot shot-list (Chrome Web Store)

**Spec (verified June 2026):** each screenshot **1280×800 px** (PNG, no rounded
corners/padding — the store adds its own). 1–5 allowed; **at least one
required**. They're shown downscaled to ~640×400, so keep each one to **one
clear idea with large, legible text** — don't cram. The **first** screenshot is
the most important; it's the one most people see.

## How to capture cleanly

- Set the browser/zoom so the UI is crisp; capture at exactly 1280×800 (resize
  the window or crop to size). On a HiDPI display you can capture at 2× and
  downscale to 1280×800 for sharpness.
- Use a clean, neutral demo page for the glossing shot (an article with normal
  prose — avoid anything personal or copyrighted-looking).
- Seed a realistic-but-tidy word bank first (a dozen-plus words, a few reviews,
  a short streak) so the dashboard doesn't look empty.
- Optional but recommended: add a short caption banner across the top or bottom
  of each shot (big text, brand indigo `#4f46e5`). Captions below are written for
  that.

## The 5 shots (in listing order)

**1 — Glossing in action (HERO).**
A real article with several words glossed inline (the small meaning shown next to
the word, in context). This is the whole product in one image.
Caption: **"Learn words right where you read them."**

**2 — Spaced-repetition review.**
The review flashcard (`review.html`) with a word revealed: pronunciation,
meaning, context sentence, and the Again / Hard / Good / Easy buttons.
Caption: **"Review with smart flashcards that adapt to you."**

**3 — Progress dashboard.**
The Progress card at the top of Settings: the headline stat cards (words tracked,
known, added this week, day streak 🔥, reviews done, accuracy), the familiarity
bars, accuracy donut, and the 30-day activity sparkline.
Caption: **"See your progress — streaks, accuracy, and growth."**

**4 — Your word bank, organized.**
The Settings word bank: the searchable word list plus the automatic difficulty
decks (Beginner / Intermediate / Advanced / Rare). Open one word's detail to show
meaning + the Edit/Review-again controls.
Caption: **"Every word you've met, organized automatically."**

**5 — Private & offline (+ onboarding).**
Either the vocabulary-calibration onboarding screen ("which of these do you
know?") **or** the Settings Privacy card. Pick whichever reads more clearly at
small size; onboarding is more visual, the Privacy card reinforces the
differentiator.
Caption: **"Private by design — your data stays on your device."**

> If you only have time for fewer than 5, the priority order is **1 → 3 → 2 → 4
> → 5**. Shot 1 (glossing) and shot 3 (dashboard) carry the most weight.

## Promo tile (separate from screenshots)

- **Small promo tile 440×280** (mandatory) and **marquee 1400×560** (optional)
  are generated as `docs/assets/promo-tile-440x280.png` and
  `docs/assets/promo-marquee-1400x560.png`. See the 4.3 session log.
- **Store icon 128×128** — you already ship `icons/LEARNWISE_128.png`; reuse it.

## Checklist before upload

- [ ] 1280×800, PNG, no transparency-edge artifacts.
- [ ] No personal info, no logged-in accounts, no copyrighted page content
      visible.
- [ ] Text legible at 640×400 (preview at half size before uploading).
- [ ] Consistent theme across all 5 (all light or all dark — don't mix).
