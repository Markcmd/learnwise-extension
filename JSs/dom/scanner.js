// =====================================================================
// Scanner — ONE DOM pass over the viewport
// ---------------------------------------------------------------------
// Replaces the three separate TreeWalker passes (visible words, readable
// sentence, render walk). A single walk collects:
//   - words:    lowercased tokens (with duplicates) for the word bank
//   - sentence: readable text context (capped) for AI translation
//   - nodes:    the visible text nodes themselves, handed to the renderer
//               so it never re-walks the DOM.
// =====================================================================

const WORD_RE = /[A-Za-z]+(?:'[A-Za-z]+)?/g;
const MAX_SENTENCE_CHARS = 4000;

/** Is the element rendered and overlapping the viewport? */
function isElementVisible(el) {
  if (!(el instanceof Element)) return false;
  const style = getComputedStyle(el);
  if (!style) return false;
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (parseFloat(style.opacity || "1") === 0) return false;

  const rect = el.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) return false;

  const vw = window.innerWidth || document.documentElement.clientWidth;
  const vh = window.innerHeight || document.documentElement.clientHeight;

  if (rect.bottom <= 0 || rect.right <= 0) return false;
  if (rect.top >= vh || rect.left >= vw) return false;

  return true;
}

/** Should this text node be considered for words / rendering? */
function acceptTextNode(node) {
  if (!node || !node.nodeValue || !node.nodeValue.trim()) return false;
  const parent = node.parentElement;
  if (!parent) return false;

  const tag = parent.tagName;
  if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return false;

  if (parent.closest('input, textarea, [contenteditable="true"]')) return false;
  // Skip anything already inside a ruby (ours or the page's) to avoid
  // double-wrapping and re-counting already-glossed words.
  if (parent.closest("ruby")) return false;

  if (!/[A-Za-z]/.test(node.nodeValue)) return false;
  if (!isElementVisible(parent)) return false;

  return true;
}

/**
 * Walk the viewport once.
 * @returns {{ words: string[], sentence: string, nodes: Text[] }}
 */
export function scanViewport() {
  const words = [];
  const nodes = [];
  const parts = [];

  if (!document.body) return { words, sentence: "", nodes };

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    { acceptNode: (n) => (acceptTextNode(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) },
    false
  );

  let n;
  while ((n = walker.nextNode())) {
    nodes.push(n);

    const text = n.nodeValue;
    const matches = text.match(WORD_RE);
    if (matches) {
      for (const w of matches) {
        const key = w.toLowerCase();
        if (key) words.push(key);
      }
    }

    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (t) parts.push(t);
  }

  let sentence = parts.join(" ").trim();
  if (sentence.length > MAX_SENTENCE_CHARS) sentence = sentence.slice(0, MAX_SENTENCE_CHARS);

  return { words, sentence, nodes };
}
