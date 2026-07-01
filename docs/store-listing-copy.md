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

Meanings come from a comprehensive English–Chinese dictionary bundled inside the
extension, so glossing works with no internet connection and nothing leaves your
computer. (AI-powered "smart" definitions are coming in a future update — they'll
be optional and use an AI key you supply.)

**You're in control**

• Click a word you already know to stop glossing it.
• Edit or delete any saved word, or clear everything in one tap.
• Export your word bank to a file and import it back any time.

Start reading, and let your vocabulary grow on its own.

---

## 中文版 listing (Simplified Chinese) — recommended for the CN audience

> Since users read Simplified Chinese (the gloss language), lead the store
> listing with Chinese. Two options: paste **Chinese only** (best if you're
> targeting CN users and set the listing Language to Chinese), or paste
> **Chinese first, then the English block above** as one bilingual description.

### 简短描述 (summary — the manifest `description`, ≤132 characters)

推荐（Chinese only）:

> 边读网页边学英语单词：LearnWise 为生词显示行内中文释义，用间隔重复帮你记牢。完全离线、注重隐私，数据只存在你的设备上。

双语备选（bilingual, watch the 132-char limit）:

> 边读边学英语单词 · Learn English vocabulary as you read — 行内释义 + 间隔重复复习，完全离线、注重隐私。

### 详细描述 (detailed description)

**在阅读网页时，轻松学习英语词汇。**

LearnWise 在你浏览网页时静静工作。当它发现你可能还不认识的单词时，会在单词旁边显示简短的中文释义——让你继续阅读，而不必中断去查词典。你遇到的每个单词都会记录在你的个人词库中，它会越来越了解你已经掌握了哪些词。

**工作原理**

• 正常阅读，LearnWise 会在语境中为生词添加行内释义。
• 反复出现的单词会自动加入你的词库；你已经认识的单词则保持原样。
• 用内置的间隔重复闪卡复习（Again / Hard / Good / Easy 四个等级），让你觉得最难的单词更频繁地出现，帮助你记牢。
• 可朗读任意单词的发音。
• 在内置的进度面板查看学习情况：已跟踪单词、已掌握单词、连续学习天数、复习正确率，以及最近 30 天的活动。
• 通过快速的词汇量校准来设置起点，让 LearnWise 只标注高于你水平的单词，而不打扰你已经会的词。

**注重隐私**

LearnWise 把你的词库、阅读记录和设置只保存在你自己的设备上。没有账号，也没有服务器——你阅读的内容不会上传到任何地方，因为根本无处可传。阅读记录默认只按网站域名保存（记录完整网址是默认关闭的选项）。没有分析追踪，没有广告。

**完全离线**

释义来自内置的英汉词典，因此没有网络也能使用，任何数据都不会离开你的电脑。（AI 智能释义将在未来版本中推出——它将是可选的，并使用你自己提供的 AI 密钥。）

**你完全掌控**

• 点击你已经认识的单词，即可停止标注它。
• 编辑或删除任意已保存的单词，或一键清空全部。
• 可将词库导出为文件，随时重新导入。

开始阅读，让你的词汇量自然增长。

> **Listing Language field:** if you're primarily targeting CN users, set the
> store listing's Language to **Chinese (Simplified)** so it surfaces in Chinese
> searches. The screenshot captions in the shot-list are English — optionally
> redo them in Chinese to match, but that's cosmetic.

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
- BYOK smart translations ship **disabled** in v1 (D-001, `FEATURE_BYOK=false`),
  so the copy says "coming soon" — kept consistent with the in-app card, the
  privacy policy, and the manifest (provider host permissions were removed in the
  pre-launch review; see `dev-notes/problems/2026-06-30-pre-launch-review.md`).
- Avoid keyword stuffing — the copy above is deliberately readable; Google's
  spam policy penalizes repeated keywords.
