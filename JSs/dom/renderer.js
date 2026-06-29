// =====================================================================
// Renderer — ruby annotations + click-to-know
// ---------------------------------------------------------------------
// Consumes the text nodes the scanner already collected (no extra DOM
// walk) and wraps matching words with <ruby> + <rt> glosses.
// =====================================================================

import { speak } from "./speech.js";

const WORD_RE = /[A-Za-z]+(?:'[A-Za-z]+)?/g;
let CLICK_HANDLER_INSTALLED = false;

/** Inject the tiny ruby stylesheet once per page. */
export function ensureRubyStyle() {
  if (document.getElementById("learnwise-ruby-style")) return;
  const style = document.createElement("style");
  style.id = "learnwise-ruby-style";
  style.textContent = `
    ruby.learnwise-ruby { ruby-position: over; ruby-align: center; }
    ruby.learnwise-ruby rt {
      font-size: 0.5em;
      line-height: 1;
      white-space: nowrap;
      text-align: center;
      letter-spacing: 0;
    }
  `;
  document.documentElement.appendChild(style);
}

/**
 * Install a single delegated click handler on glossed words:
 *  - plain click       → mark the word known and remove the annotation
 *  - Alt/Option+click  → pronounce the word (Web Speech API), keep the gloss
 * `onMarkKnown(word)` does the data update.
 */
export function installRubyClickHandlerOnce(onMarkKnown) {
  if (CLICK_HANDLER_INSTALLED) return;
  CLICK_HANDLER_INSTALLED = true;

  document.addEventListener(
    "click",
    (e) => {
      const ruby = e.target?.closest?.("ruby.learnwise-ruby");
      if (!ruby) return;

      const w = String(ruby.dataset?.lwWord || "").trim().toLowerCase();
      if (!w) return;

      // Alt/Option+click pronounces the word without marking it known.
      if (e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        try {
          speak(w);
        } catch (_e) {
          /* swallow — audio must not break the page */
        }
        return;
      }

      try {
        onMarkKnown?.(w);
      } catch (_e) {
        /* swallow — UI must not break the page */
      }

      const base = ruby.firstChild?.nodeType === Node.TEXT_NODE ? ruby.firstChild.nodeValue : w;
      ruby.replaceWith(document.createTextNode(base));
    },
    true
  );
}

/** Reduce a raw ECDICT meaning string to a short Chinese gloss for the <rt>. */
export function pickFirstChineseTranslation(meaning) {
  let s = String(meaning || "").trim();
  if (!s) return "";
  s = s.split(/\r?\n/)[0].trim();
  s = s.replace(/^\s*\[[^\]]+\]\s*/g, "").replace(/^\s*(?:[a-z]{1,6}\.)+\s*/i, "");
  const parts = s.split(/[；;，,、\s]+/).map((x) => x.trim()).filter(Boolean);
  const first = parts[0] || "";
  const m = first.match(/[一-鿿]+/);
  return (m ? m[0] : first).slice(0, 10);
}

/**
 * Annotate the given text nodes with ruby glosses for words in `showDict`.
 * @param {Text[]} nodes  text nodes from the scanner
 * @param {Record<string,{meaning?:string,pronunciation?:string}>} showDict
 * @param {(word:string)=>void} [onMarkKnown]
 */
export function renderRuby(nodes, showDict, onMarkKnown) {
  if (!showDict || typeof showDict !== "object") return;
  const keys = Object.keys(showDict);
  if (!keys.length || !Array.isArray(nodes) || !nodes.length) return;

  const showSet = new Set(keys.map((k) => String(k || "").trim().toLowerCase()).filter(Boolean));
  if (!showSet.size) return;

  ensureRubyStyle();
  installRubyClickHandlerOnce(onMarkKnown);

  for (const node of nodes) {
    // Node may have been replaced/detached by an earlier pass.
    if (!node || !node.parentNode || node.nodeType !== Node.TEXT_NODE) continue;
    const text = node.nodeValue;
    if (!text) continue;

    WORD_RE.lastIndex = 0;
    let last = 0;
    let changed = false;
    const frag = document.createDocumentFragment();

    let match;
    while ((match = WORD_RE.exec(text)) !== null) {
      const wText = match[0];
      const start = match.index;
      const end = start + wText.length;

      if (start > last) frag.appendChild(document.createTextNode(text.slice(last, start)));

      const key = wText.toLowerCase();
      if (showSet.has(key)) {
        const meaning = pickFirstChineseTranslation(showDict[key]?.meaning) || "n/a";
        changed = true;

        const ruby = document.createElement("ruby");
        ruby.className = "learnwise-ruby";
        ruby.dataset.lwWord = key;
        ruby.title = "Click: I know this · Alt+click: hear it";
        ruby.appendChild(document.createTextNode(wText));

        const rt = document.createElement("rt");
        rt.textContent = meaning;
        ruby.appendChild(rt);

        frag.appendChild(ruby);
      } else {
        frag.appendChild(document.createTextNode(wText));
      }
      last = end;
    }

    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    if (changed) node.parentNode.replaceChild(frag, node);
  }
}
