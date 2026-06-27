// =====================================================================
// Selection action — floating "Review again" on a selected word
// ---------------------------------------------------------------------
// Known words aren't glossed, so you can't click them to manage them. This
// lets the user *select* any single word on the page; if it's a known word
// in the bank, a small floating button appears to demote it (reset it back
// into the glossing range). Pure DOM glue — the data work is the injected
// callbacks (isReviewable / onReviewAgain).
// =====================================================================

const BTN_ID = "learnwise-review-btn";
const WORD_RE = /^[A-Za-z]+(?:'[A-Za-z]+)?$/;

/**
 * @param {Object} cb
 * @param {(word:string)=>Promise<boolean>} cb.isReviewable  show the button?
 * @param {(word:string)=>void|Promise<void>} cb.onReviewAgain  demote action
 */
export function installSelectionAction({ isReviewable, onReviewAgain } = {}) {
  let btn = null;
  let currentWord = "";

  function ensureBtn() {
    if (btn && document.documentElement.contains(btn)) return btn;
    btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.textContent = "Review again";
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
      hide();
      // Clear the selection so the trailing mouseup re-eval finds nothing and
      // the button doesn't pop back (the demote save is async).
      try {
        window.getSelection()?.removeAllRanges();
      } catch (_e) {
        /* ignore */
      }
      if (w) {
        try {
          onReviewAgain?.(w);
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
    let ok = false;
    try {
      ok = await isReviewable?.(word);
    } catch (_e) {
      ok = false;
    }
    // Selection may have changed while we awaited the bank lookup.
    const after = selectedWord();
    if (after.word !== word) return;
    if (!ok) {
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
