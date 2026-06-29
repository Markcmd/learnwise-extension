# Problem — "n/a" gloss words

**Status:** partially mitigated (offline coverage improved); reader-side handling parked.
**First investigated:** 2026-06-28 · See [session log](../session-logs/2026-06-28-na-words.md).

## Symptom

A word renders with the literal gloss **`n/a`** above it instead of a real meaning.

## Root cause (code path)

1. `JSs/dom/scanner.js` — `scanViewport()` matches every `[A-Za-z]+` token.
2. `JSs/core/wordbank.js` — `splitWords()` puts any token **not in the word bank**
   into `show` + `unknown` (we attempt to gloss it).
3. `JSs/dom/ecdict.js` — `fetchTranslationFromLocalDictionary()` returns
   `{ meaning: "" }` for words absent from the bundled ECDICT shards.
4. `JSs/dom/renderer.js:109` — `pickFirstChineseTranslation(meaning) || "n/a"`;
   an empty meaning falls back to the `"n/a"` placeholder.

So **`n/a` = "treated as glossable, but no local-dictionary entry."**

## Findings (measured 2026-06-28)

| Check | Result |
|---|---|
| Total ECDICT entries | ~404,000 |
| Curated frequency words missing | 0 |
| Common words missing | 0 |
| Common contractions missing | 0 |
| Modern/neologism words missing | small finite set (chatbot, metaverse, ransomware, deepfake, …) |

**Conclusion:** ECDICT coverage of *real* vocabulary is near-complete. The
majority of real-page `n/a` is **proper nouns, brand names, and typos**, which
dictionary expansion cannot meaningfully fix.

## Mitigations

- **Done — expand local dict:** 43 confirmed-missing modern words added via
  `dict-supplement/supplement.json` + `tools/merge-supplement.mjs`.
  See [decision record](../decisions/na-words.md).
- **Parked — reader-side handling:** no inline fix possible without an online
  source (AI or dict API); decided not to build now.
- **Future option — dict-membership gating:** don't annotate tokens absent from
  the dictionary, so junk tokens never render `n/a`. Not implemented.
