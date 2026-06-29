// =====================================================================
// Selection action — floating contextual button on a selected word
// ---------------------------------------------------------------------
// Lets the user *select* any single word on the page and act on it. The
// caller supplies `resolveAction(word)` which decides what (if anything) to
// offer for that word — e.g. "Review again" for a known word, or "Save word"
// to manually capture an untracked one (M2.4 highlight-to-save). Pure DOM
// glue — all data work lives in the injected action's `run`.
// =====================================================================

const BTN_ID = "learnwise-review-btn";
const WORD_RE = /^[A-Za-z]+(?:'[A-Za-z]+)?$/;

/**
 * @param {Object} cb
 * @param {(word:string)=>Promise<({label:string, run:(word:string)=>void}|null)>} cb.resolveAction
 *   Resolve the action to offer for a selected word, or null to show nothing.
 */
export function installSelectionAction({ resolveAction } = {}) {
  let btn = null;
  let currentWord = "";
  let currentRun = null;

  function ensureBtn() {
    if (btn && document.documentElement.contains(btn)) return btn;
    btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    Object.assign(btn.style, {
      position: "fixed",
      zIndex: "2147483647",
      padding: "5px 10px",
      fontSize: "12px",
      lineHeight: "1.2",
      fontFamily: "system-ui, -apple-system, sans-serif",
      borderRadius: "7px",
      border: "1px solid rgba(0,0,0,0.2)",
      background: "#2b6cb0",
      color: "#fff",
      cursor: "pointer",
      boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
      display: "none",
      whiteSpace: "nowrap",
    });
    // Keep the page selection while interacting with the button.
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const w = currentWord;
      const run = currentRun;
      hide();
      // Clear the selection so the trailing mouseup re-eval finds nothing and
      // the button doesn't pop back (the action's save is async).
      try {
        window.getSelection()?.removeAllRanges();
      } catch (_e) {
        /* ignore */
      }
      if (w && run) {
        try {
          run(w);
        } catch (_e) {
          /* never break the page */
        }
      }
    });
    document.documentElement.appendChild(btn);
    return btn;
  }

  function hide() {
    if (btn) btn.style.display = "none";
    currentWord = "";
    currentRun = null;
  }

  function positionAt(rect) {
    const b = ensureBtn();
    b.style.display = "block";
    const above = rect.top - 36;
    const top = above > 4 ? above : rect.bottom + 8;
    const left = Math.max(4, Math.min(rect.left, window.innerWidth - 120));
    b.style.top = `${Math.max(4, top)}px`;
    b.style.left = `${left}px`;
  }

  function selectedWord() {
    const sel = window.getSelection ? window.getSelection() : null;
    const text = sel ? sel.toString().trim() : "";
    if (!text || !WORD_RE.test(text)) return { sel: null, word: "" };
    return { sel, word: text.toLowerCase() };
  }

  async function evaluate() {
    const { sel, word } = selectedWord();
    if (!word) {
      hide();
      return;
    }
    let action = null;
    try {
      action = await resolveAction?.(word);
    } catch (_e) {
      action = null;
    }
    // Selection may have changed while we awaited the bank lookup.
    const after = selectedWord();
    if (after.word !== word) return;
    if (!action || !action.label || typeof action.run !== "function") {
      hide();
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      hide();
      return;
    }
    currentWord = word;
    currentRun = action.run;
    ensureBtn().textContent = action.label;
    positionAt(rect);
  }

  const scheduleEval = () => setTimeout(evaluate, 0);
  document.addEventListener("mouseup", scheduleEval, true);
  document.addEventListener("keyup", scheduleEval, true);
  document.addEventListener("selectionchange", () => {
    const t = window.getSelection ? window.getSelection().toString().trim() : "";
    if (!t) hide();
  });
  document.addEventListener("scroll", hide, true);
  document.addEventListener(
    "mousedown",
    (e) => {
      if (e.target?.id !== BTN_ID) hide();
    },
    true
  );
}
