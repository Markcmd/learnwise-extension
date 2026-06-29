// =====================================================================
// Speech — pronunciation audio via the Web Speech API (DOM glue)
// ---------------------------------------------------------------------
// Thin wrapper over window.speechSynthesis so the review page and the
// content script can pronounce a word with one call. The voice-selection
// logic (pickEnglishVoice) is pure and unit-tested; everything that
// touches speechSynthesis is isolated here.
// =====================================================================
import { SPEECH } from "../core/constants.js";

/**
 * Choose the best English voice from a list (pure).
 * Precedence: exact lang match → any "en-*" → the platform default → first.
 * @param {Array<{lang?:string, default?:boolean, name?:string}>} voices
 * @param {string} [preferredLang]
 * @returns {Object|null}
 */
export function pickEnglishVoice(voices, preferredLang = SPEECH.LANG) {
  const list = Array.isArray(voices) ? voices.filter((v) => v && v.lang) : [];
  if (!list.length) return null;
  const pl = String(preferredLang || "").toLowerCase();
  return (
    list.find((v) => v.lang.toLowerCase() === pl) ||
    list.find((v) => v.lang.toLowerCase().startsWith("en")) ||
    list.find((v) => v.default) ||
    list[0]
  );
}

/** Is the Web Speech API available in this context? */
export function speechSupported() {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance !== "undefined"
  );
}

/**
 * Warm up the voice list. Voices often load asynchronously, so we kick a
 * getVoices() and resolve on the `voiceschanged` event (or immediately if
 * they're already available). Best-effort; resolves to the voice array.
 * @returns {Promise<Object[]>}
 */
export function ensureVoices() {
  return new Promise((resolve) => {
    if (!speechSupported()) return resolve([]);
    const synth = window.speechSynthesis;
    const have = synth.getVoices();
    if (have && have.length) return resolve(have);

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(synth.getVoices() || []);
    };
    try {
      synth.addEventListener("voiceschanged", finish, { once: true });
    } catch (_e) {
      /* older engines: fall back to the timeout below */
    }
    // Safety net if `voiceschanged` never fires.
    setTimeout(finish, 1000);
  });
}

/**
 * Speak a word/phrase. Cancels any in-flight utterance first so rapid clicks
 * don't queue up. Returns true if speech was started.
 * @param {string} text
 * @param {Object} [opts] { lang, rate }
 * @returns {boolean}
 */
export function speak(text, opts = {}) {
  if (!speechSupported()) return false;
  const t = String(text || "").trim();
  if (!t) return false;

  const lang = opts.lang || SPEECH.LANG;
  const rate = typeof opts.rate === "number" ? opts.rate : SPEECH.RATE;

  try {
    const synth = window.speechSynthesis;
    synth.cancel(); // stop anything currently speaking
    const u = new window.SpeechSynthesisUtterance(t);
    u.lang = lang;
    u.rate = rate;
    const voice = pickEnglishVoice(synth.getVoices(), lang);
    if (voice) u.voice = voice;
    synth.speak(u);
    return true;
  } catch (_e) {
    return false;
  }
}

/** Stop any current speech. */
export function cancelSpeech() {
  if (!speechSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch (_e) {
    /* no-op */
  }
}
