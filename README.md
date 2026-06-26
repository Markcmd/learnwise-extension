# learnwise-extension

A Chrome extension that helps users learn English vocabulary while reading by showing inline meanings and tracking familiarity with a personal word bank.

## Develop / build

The content script and service worker are bundled from ES modules in `JSs/`
(pure logic in `JSs/core/`, DOM glue in `JSs/dom/`) into `dist/` with esbuild.

```bash
npm install      # install esbuild + vitest (one time)
npm run build    # bundle JSs/ -> dist/   (required before loading the extension)
npm run watch    # rebuild on change while developing
npm test         # run the Vitest unit tests (core logic)
```

Then load the **repo root** as an unpacked extension at `chrome://extensions`
(Developer mode → Load unpacked). The manifest points at `dist/contentScript.js`
and `dist/background.js`, so **run `npm run build` first** — `dist/` is generated
and git-ignored.

## Layout

```
JSs/
  contentScript.js   # entry: wires scanner + renderer + core (bundled)
  background.js       # entry: defaults + schema migration (bundled)
  popup.js            # popup UI (classic script, loaded directly)
  settingsWindow.js   # settings/word-bank viewer (classic script)
  core/               # PURE, unit-tested — no DOM, chrome.* only via storage.js
    constants.js  storage.js  wordbank.js  migration.js
    translation.js  promotion.js
  dom/                # browser glue
    scanner.js  renderer.js  ecdict.js
  data/commonWords.js # temporary seed vocabulary (replaced by onboarding in M1)
tests/                # Vitest, mirrors core/
dist/                 # esbuild output (generated, git-ignored)
```

See `PLAN.md`, `DESIGN.md`, and `ESTIMATES.md` for the full product plan.
