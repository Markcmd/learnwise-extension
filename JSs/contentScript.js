// =====================================================================
//          Helper: Promise wrappers for chrome.storage.local
// =====================================================================
/**
 * @summary Read values from chrome.storage.local via a Promise.
 * @description Wraps the callback-based `chrome.storage.local.get` API.
 * @param {string[]|string|Object|null}
 * @returns {Promise<Object>}
 * @remarks The returned object only includes the requested keys; missing keys are `undefined`.
 */
function getLocal(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}
/**
 * @summary Write values to chrome.storage.local via a Promise.
 * @description Wraps the callback-based `chrome.storage.local.set`.
 * @param {Object} obj Key/value pairs to store in local storage.
 * @returns {Promise<void>}
 * @remarks The Promise resolves after Chrome finishes writing. Errors (if any) should be checked using `chrome.runtime.lastError`.
 */
function setLocal(obj) {
  return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
}

// =============================================================================
//                Helper: Enable LearnWise
// =============================================================================
/**
 * @summary Read the LearnWise enable/disable toggle.
 * @description
 * - Loads the boolean flag `lw_enabled` from `chrome.storage.local` and returns it.
 * - If the key is missing or not a boolean, defaults to `true` (enabled).
 * @returns {Promise<boolean>} Whether LearnWise is enabled.
 * @remarks
 * - Storage key: `lw_enabled`
 * - Default behavior: enabled when unset/invalid.
 */
async function isLearnWiseEnabled() {
  const res = await getLocal(["lw_enabled"]);
  return typeof res.lw_enabled === "boolean" ? res.lw_enabled : true; // default ON
}

// =============================================================================
//               Helper: Word Bank Management
// =============================================================================
/**
 * @summary Check whether the word bank exists in chrome.storage.local.
 * @description
 * - Reads `wordbank` from `chrome.storage.local` and validates that it is a plain object
 * - (not missing, not null, and not an array).
 * @returns {Promise<boolean>}
 * @remarks
 * - Storage key: `wordbank`
 * - `res` is the resolved storage result object (not a Promise). !!
 */
async function isWordBankExist() {
  const res = await getLocal(["wordbank"]); // res is a pr
  return !!(res.wordbank && typeof res.wordbank === "object" && !Array.isArray(res.wordbank));
}

/**
 * @summary Create an empty word bank in chrome.storage.local.
 * @description Initializes the `wordbank` key to an empty object `{}`.
 * @returns {Promise<void>}
 * @remarks Used during first-run initialization when `wordbank` is missing or invalid.
 */
async function createEmptyWordBank() {
  await setLocal({ wordbank: {} });
}

/**
 * @summary Upsert multiple words into the word bank and update stats.
 * @description
 * Reads the current `wordbank` from `chrome.storage.local`, then inserts or updates
 * each word from `words` in memory and writes the updated `wordbank` back once.
 *
 * New word behavior:
 * - Initializes `{ level: 1, readCount: 1, createdAt, updatedAt }`.
 * - Copies `meaning` / `pronunciation` from input if provided.
 * - If `options.level` is a valid integer in `[1, 100]`, uses it instead of `1`.
 *
 * Existing word behavior:
 * - `readCount += 1`
 * - `level += 1` (capped at `100`)
 * - Updates `updatedAt`
 * - Fills missing `meaning` / `pronunciation` only if currently empty.
 *
 * @param {Object} words Map of `{ [wordLowerOrRaw: string]: { meaning?: string, pronunciation?: string, level?: number } }`.
 * @returns {Promise<void>}
 * @remarks
 * - Input keys are normalized to lowercase via `String(...).trim().toLowerCase()`.
 * - This function performs exactly one read and one write to `chrome.storage.local`.
 */
async function upsertWordsIntoBank(words) {
  // Validate input words object
  const entries = words && typeof words === "object" ? words : {}; 
  
  // Load and validate existing wordbank
  const { wordbank = {} } = await getLocal(["wordbank"]);
  
  // Get current timestamp for createdAt/updatedAt fields
  const now = Date.now();

  // Upsert in memory
  for (const [rawWord, optionsRaw] of Object.entries(entries)) {
    // Preliminary normalization and validation of the word key
    const key = String(rawWord).trim().toLowerCase();
    if (!key) continue;

    // Validate options object for this word
    const options = optionsRaw && typeof optionsRaw === "object" ? optionsRaw : {};

    // Handle new vs existing entry
    if (!wordbank[key]) {// New
      wordbank[key] = {
        word: key,
        meaning: options.meaning || "",
        pronunciation: options.pronunciation || "",
        level: 1,                               // start at level 1
        readCount: 1,                           // first read
        createdAt: now,                         // timestamp
        updatedAt: now                          // timestamp
      };
      // Ignore! if I am not bored enough to implement the options.level logic for now, since it's not very reliable and I can just click to increase level if I already know it. This is simpler and more consistent for all new words.
      // // if option has level use it ( this logic can be changed as needed )
      // if (options.level && Number.isInteger(options.level) && options.level >= 1 && options.level <= 100) {
      //   wordbank[key].level = options.level;
      // } 
      // on 2/12/2026: after testing, I think it's better to just start with level 1 for new words, and let the user click to increase level if they already know it. This is because the options.level is not very reliable, and it's simpler to just have a consistent starting point for all new words.
    } else {// Existing
      const entry = wordbank[key];                          // get existing entry
      entry.readCount = (entry.readCount || 0) + 1;         // increment read count
      entry.level = Math.min((entry.level || 1) + 1, 100);  // increment level, max 100
      entry.updatedAt = now;                                // update timestamp
      
      console.log(`[LearnWise] Updated word: "${key}", new level: ${entry.level}, readCount: ${entry.readCount}`);
      // only fill meaning/pronunciation if empty
      // this logic can be changed as needed (like nlp suggestions)
      if (!entry.meaning && options.meaning) entry.meaning = options.meaning;
      if (!entry.pronunciation && options.pronunciation) entry.pronunciation = options.pronunciation;
    }
  }
  // Write back
  await setLocal({ wordbank });
}

// ============================================================================
//             Helper: Most Common Words List (for quick lookup and rendering)
// ============================================================================
const mostCommonWordsListFromGPT = { // this can be replaced by a more comprehensive list later, such as test results from corpora
  // add "close" "philosophy" "science" "psychology" "society"
  "close": { meaning: "关闭；接近", pronunciation: "kloʊs" },
  "philosophy": { meaning: "哲学", pronunciation: "fɪˈlɑsəfi" },
  "science": { meaning: "科学", pronunciation: "ˈsaɪəns" },
  "psychology": { meaning: "心理学", pronunciation: "saɪˈkɑlədʒi" },
  "society": { meaning: "社会", pronunciation: "səˈsaɪəti" },

  "the": { meaning: "定冠词", pronunciation: "ðə" },
  "of": { meaning: "……的；属于", pronunciation: "əv" },
  "and": { meaning: "和；并且", pronunciation: "ænd" },
  "to": { meaning: "到；去；（不定式）", pronunciation: "tə" },
  "a": { meaning: "一个；（不定冠词）", pronunciation: "ə" },
  "in": { meaning: "在……里", pronunciation: "ɪn" },
  "is": { meaning: "是", pronunciation: "ɪz" },
  "it": { meaning: "它", pronunciation: "ɪt" },
  "you": { meaning: "你；你们", pronunciation: "juː" },
  "that": { meaning: "那；那个；（引导从句）", pronunciation: "ðæt" },
  "he": { meaning: "他", pronunciation: "hiː" },
  "was": { meaning: "是（过去式）", pronunciation: "wʌz" },
  "for": { meaning: "为了；对于", pronunciation: "fər" },
  "on": { meaning: "在……上", pronunciation: "ɑn" },
  "are": { meaning: "是（复数/第二人称）", pronunciation: "ɑr" },
  "as": { meaning: "作为；像……一样", pronunciation: "æz" },
  "with": { meaning: "和；带有", pronunciation: "wɪð" },
  "his": { meaning: "他的", pronunciation: "hɪz" },
  "they": { meaning: "他们；她们；它们", pronunciation: "ðeɪ" },
  "I": { meaning: "我", pronunciation: "aɪ" },
  "at": { meaning: "在（某处/某时）", pronunciation: "æt" },
  "be": { meaning: "是；成为", pronunciation: "biː" },
  "this": { meaning: "这；这个", pronunciation: "ðɪs" },
  "have": { meaning: "有；已经（助动词）", pronunciation: "hæv" },
  "from": { meaning: "来自；从", pronunciation: "frəm" },
  "or": { meaning: "或者", pronunciation: "ɔr" },
  "one": { meaning: "一；一个", pronunciation: "wʌn" },
  "had": { meaning: "有（过去式）", pronunciation: "hæd" },
  "by": { meaning: "通过；被；在……旁", pronunciation: "baɪ" },
  "word": { meaning: "单词；话语", pronunciation: "wɝd" },
  "but": { meaning: "但是", pronunciation: "bʌt" },
  "not": { meaning: "不；不是", pronunciation: "nɑt" },
  "what": { meaning: "什么", pronunciation: "wʌt" },
  "all": { meaning: "所有；全部", pronunciation: "ɔl" },
  "were": { meaning: "是（过去复数）", pronunciation: "wɝ" },
  "we": { meaning: "我们", pronunciation: "wiː" },
  "when": { meaning: "什么时候；当……时", pronunciation: "wɛn" },
  "your": { meaning: "你的；你们的", pronunciation: "jʊr" },
  "can": { meaning: "能；可以", pronunciation: "kæn" },
  "said": { meaning: "说（过去式）", pronunciation: "sɛd" },
  "there": { meaning: "那里；有（存在句）", pronunciation: "ðɛr" },
  "use": { meaning: "使用", pronunciation: "juːz" },
  "an": { meaning: "一个；（不定冠词，元音前）", pronunciation: "æn" },
  "each": { meaning: "每个", pronunciation: "iːtʃ" },
  "which": { meaning: "哪一个；（关系代词）", pronunciation: "wɪtʃ" },
  "she": { meaning: "她", pronunciation: "ʃiː" },
  "do": { meaning: "做；（助动词）", pronunciation: "duː" },
  "how": { meaning: "怎样；如何", pronunciation: "haʊ" },
  "their": { meaning: "他们的；她们的；它们的", pronunciation: "ðɛr" },
  "if": { meaning: "如果；是否", pronunciation: "ɪf" },
  "will": { meaning: "将会；愿意", pronunciation: "wɪl" },
  "up": { meaning: "向上；起来", pronunciation: "ʌp" },
  "other": { meaning: "其他的", pronunciation: "ˈʌðɚ" },
  "about": { meaning: "关于；大约", pronunciation: "əˈbaʊt" },
  "out": { meaning: "出去；在外", pronunciation: "aʊt" },
  "many": { meaning: "许多", pronunciation: "ˈmɛni" },
  "then": { meaning: "然后；那时", pronunciation: "ðɛn" },
  "them": { meaning: "他们/她们/它们（宾格）", pronunciation: "ðɛm" },
  "these": { meaning: "这些", pronunciation: "ðiz" },
  "so": { meaning: "所以；如此", pronunciation: "soʊ" },
  "some": { meaning: "一些", pronunciation: "sʌm" },
  "her": { meaning: "她的；她（宾格）", pronunciation: "hɝ" },
  "would": { meaning: "会；将（过去/条件）", pronunciation: "wʊd" },
  "make": { meaning: "制作；使得", pronunciation: "meɪk" },
  "like": { meaning: "喜欢；像", pronunciation: "laɪk" },
  "him": { meaning: "他（宾格）", pronunciation: "hɪm" },
  "into": { meaning: "进入……；变成", pronunciation: "ˈɪntuː" },
  "time": { meaning: "时间", pronunciation: "taɪm" },
  "has": { meaning: "有（第三人称单数）；已经", pronunciation: "hæz" },
  "look": { meaning: "看", pronunciation: "lʊk" },
  "two": { meaning: "二", pronunciation: "tuː" },
  "more": { meaning: "更多", pronunciation: "mɔr" },
  "write": { meaning: "写", pronunciation: "raɪt" },
  "go": { meaning: "去；走", pronunciation: "ɡoʊ" },
  "see": { meaning: "看见", pronunciation: "siː" },
  "number": { meaning: "数字；号码", pronunciation: "ˈnʌmbɚ" },
  "no": { meaning: "不；没有", pronunciation: "noʊ" },
  "way": { meaning: "方式；道路", pronunciation: "weɪ" },
  "could": { meaning: "能（过去式/可能）", pronunciation: "kʊd" },
  "people": { meaning: "人们", pronunciation: "ˈpiːpəl" },
  "my": { meaning: "我的", pronunciation: "maɪ" },
  "than": { meaning: "比（用于比较）", pronunciation: "ðæn" },
  "first": { meaning: "第一；首先", pronunciation: "fɝst" },
  "water": { meaning: "水", pronunciation: "ˈwɔtɚ" },
  "been": { meaning: "已经是/在（be 的过去分词）", pronunciation: "bɪn" },
  "call": { meaning: "打电话；称呼", pronunciation: "kɔl" },
  "who": { meaning: "谁", pronunciation: "huː" },
  "oil": { meaning: "油；石油", pronunciation: "ɔɪl" },
  "its": { meaning: "它的", pronunciation: "ɪts" },
  "now": { meaning: "现在", pronunciation: "naʊ" },
  "find": { meaning: "找到", pronunciation: "faɪnd" },
  "long": { meaning: "长的；久的", pronunciation: "lɔŋ" },
  "down": { meaning: "向下；下来", pronunciation: "daʊn" },
  "day": { meaning: "天；日子", pronunciation: "deɪ" },
  "did": { meaning: "做（过去式）；（助动词过去式）", pronunciation: "dɪd" },
  "get": { meaning: "得到；变得；到达", pronunciation: "ɡɛt" },
  "come": { meaning: "来", pronunciation: "kʌm" },
  "made": { meaning: "制作（过去式/过去分词）", pronunciation: "meɪd" },
  "may": { meaning: "可能；可以（较正式）", pronunciation: "meɪ" },
  "part": { meaning: "部分", pronunciation: "pɑrt" }
};
// add level 100 to most Common Words // this part is stupid but ok, i just don't want to modify the original list from GPT
for (const w of Object.keys(mostCommonWordsListFromGPT)) {
  
  mostCommonWordsListFromGPT[w].level = 100;
}
function mostCommonWordsList() {
  return mostCommonWordsListFromGPT;
}

// =============================================================================
//                 Helper: Detect Visible Words in Viewport
// =============================================================================
// Collect visible English words (lowercased) from text nodes whose parent elements
// are visible AND overlap the viewport. Returns an array of words (with duplicates).
async function getVisibleWordsInViewport() {
  const WORD_RE = /[A-Za-z]+(?:'[A-Za-z]+)?/g;

  function isElementVisible(el) {
    if (!(el instanceof Element)) return false;

    const style = getComputedStyle(el);
    if (!style) return false;
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (parseFloat(style.opacity || "1") === 0) return false;

    const rect = el.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;

    // Intersect with viewport
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;

    if (rect.bottom <= 0 || rect.right <= 0) return false;
    if (rect.top >= vh || rect.left >= vw) return false;

    return true;
  }

  const words = [];

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!node || !node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;

        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        // Skip elements that are not useful for text extraction
        const tag = parent.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return NodeFilter.FILTER_REJECT;

        // Optional: skip editable fields
        if (parent.closest('input, textarea, [contenteditable="true"]')) return NodeFilter.FILTER_REJECT;

        if (!isElementVisible(parent)) return NodeFilter.FILTER_REJECT;

        return NodeFilter.FILTER_ACCEPT;
      }
    },
    false
  );

  let n;
  while ((n = walker.nextNode())) {
    const text = n.nodeValue;
    const matches = text.match(WORD_RE);
    if (!matches) continue;
    for (const w of matches) {
      const key = w.toLowerCase();
      if (key) words.push(key);
    }
  }

  return words;
}

// ======================================================================
//      Click handler: mark a rendered word as known (level = 100)
// ======================================================================
let LW_CLICK_HANDLER_INSTALLED = false;

async function markWordKnown(wordLower) {
  const key = String(wordLower || "").trim().toLowerCase();
  if (!key) return;

  const { wordbank = {} } = await getLocal(["wordbank"]);
  const now = Date.now();

  if (!wordbank[key] || typeof wordbank[key] !== "object") {
    // if missing, create minimal entry
    wordbank[key] = {
      word: key,
      meaning: "",
      pronunciation: "",
      level: 100,
      readCount: 1,
      createdAt: now,
      updatedAt: now
    };
  } else {
    wordbank[key].level = 100;
    wordbank[key].updatedAt = now;
  }

  await setLocal({ wordbank });
}

function installRubyClickHandlerOnce() {
  if (LW_CLICK_HANDLER_INSTALLED) return;
  LW_CLICK_HANDLER_INSTALLED = true;

  document.addEventListener(
    "click",
    (e) => {
      const ruby = e.target?.closest?.("ruby.learnwise-ruby");
      if (!ruby) return;

      const w = String(ruby.dataset?.lwWord || "").trim().toLowerCase();
      if (!w) return;

      markWordKnown(w).catch((err) => console.warn("[LearnWise] markWordKnown failed:", err));

      // Optional: immediately remove ruby after marking known (since level>=90 => noshow)
      const base = ruby.firstChild?.nodeType === Node.TEXT_NODE ? ruby.firstChild.nodeValue : w;
      ruby.replaceWith(document.createTextNode(base));
    },
    true
  );
}

// =====================================================================
//                 Helper: Split Visible Words into Sets
// =====================================================================
// Rule:
//  - if word in wordbank and level >= 90 => noshow
//  - if word in wordbank and level < 90  => show
//  - if word not in wordbank            => unknown
// Note: show Set includes unknown words.
async function splitVisibleWordsIntoSets(visibleWords) {
  const show = new Set();
  const noshow = new Set();
  const unknown = new Set();

  const { wordbank = {} } = await getLocal(["wordbank"]);

  for (const raw of visibleWords) {
    const word = String(raw || "").trim().toLowerCase();
    if (!word) continue;                                  // also skip empty

    const entry = wordbank[word];                         // get entry from wordbank
    if (entry && typeof entry === "object") {             // found in wordbank
      const level = Number(entry.level ?? 1);             // default level 1 if missing.  ?? means if entry.level is null or undefined, use 1
      if (level >= 90) noshow.add(word);
      else show.add(word);
    } else {                                              // not found in wordbank
      show.add(word); 
      unknown.add(word);
    }
  }

  return { show, noshow, unknown };
}

// =====================================================================
//        Helper: Check word existence + get entry from ECDICT shards
// =====================================================================
// NOTE: Requires your manifest.json to expose the JSON shards via web_accessible_resources.
// Example path used below: `ecdict_json/{shard}.json`.

// cache for loaded shards, live during content script lifetime.
const ECDICT_CACHE = new Map(); // shard -> Map(word -> entry) // JS Map here means key-value pairs, entry is the meaning/pronunciation object

function shardKeyFromWord(word) {
  const c = (word?.[0] || "").toLowerCase(); // word?.[0] means first character of the word, to lower case, ? means if word is undefined, return empty string
  if (c >= "a" && c <= "z") return c;
  if (c >= "0" && c <= "9") return "0-9";
  return "other";
}

async function loadEcdictShard(shard) {
  // first check cache
  if (ECDICT_CACHE.has(shard)) return ECDICT_CACHE.get(shard);
  // fetch shard JSON
  const url = chrome.runtime.getURL(`ecdict_json/${shard}.json`); // ${} means template string
  const res = await fetch(url);                                   // fetch the JSON file    
  if (!res.ok) {                                                  // .ok means status in the range 200-299. res's type is Response. includes status, headers, body, etc.
    // Cache empty map to avoid repeated fetch attempts
    const empty = new Map();
    ECDICT_CACHE.set(shard, empty);                               // set the empty map to cache 
    return empty;
  }
  const arr = await res.json();                                   // parse JSON array, arr type is Array, element type is dictionary entry object.
  // Expected format: [{ w: "hood", p: "hud", t: "..." }, ...]
  const map = new Map();
  if (Array.isArray(arr)) {                                       // Array.isArray(arr) checks if arr is an array
    for (const it of arr) {                                       // of: iterate each item in arr, it type is Object
      const w = (it?.w || "").toLowerCase();                      // w: word key in the entry object
      if (w) map.set(w, it);
    }
  }
  ECDICT_CACHE.set(shard, map);                                   // cache the loaded shard
  return map;
}

// Returns the entry object `{w,p,t}` if found, else null
async function wordExistsInEcdict(word) {
  const key = String(word || "").trim().toLowerCase();
  if (!key) return null;
  const shard = shardKeyFromWord(key);            // return the shard key based on first letter, string like 'a', 'b', ..., 'z', '0-9', 'other'
  const shardMap = await loadEcdictShard(shard);  
  return shardMap.get(key) || null;               // get(key) returns the entry object if found, entry object is { w: "word", p: "pronunciation", t: "meaning"
}

async function fetchMeaningsForUnknownWords(words) {
  const results = {};

  for (const raw of words) {
    const word = String(raw || "").trim().toLowerCase();
    if (!word) continue;

    const entry = await wordExistsInEcdict(word);

    if (entry) {                                              // found in ECDICT
      results[word] = {
        meaning: entry.t || "",                               // also handle missing fields
        pronunciation: entry.p || ""
      };
    } else {
      // Fallback placeholder (later replace with API), like nlp suggestion, name the function: fetchFromAPI(word)
      results[word] = {
        meaning: "", 
        pronunciation: ""
      };
    }
  }
  return results;
}

// ====================================================================
//               Helper: Translation Decision Maker
// ====================================================================
/**
 * @summary Decide which translation backend to use.
 * @description
 * Reads the user's translation preference from `chrome.storage.local`
 * using the key `translation_source` and normalizes the value for
 * downstream logic.
 * @remarks
 * This function is the single source of truth for translation routing.
 * If the stored value is missing or invalid, it is normalized to `"local"`.
 * Intended to bridge popup UI configuration and content-script execution.
 * @returns {Promise<"local" | "api">} The normalized translation source.
 */
async function getTranslationDecision() {
  const res = await getLocal(["translation_source"]);
  let source = res.translation_source;

  // Basic Validation ✅
  if (typeof source === "undefined") {
    source = "local";
    await setLocal({ translation_source: source });
  }
  return source;
}

// ====================================================================
//               Helper: Fetch Translation from Local Dictionary API
// ====================================================================
/**
 * @summary Fetch translations from the local ECDICT dictionary.
 *
 * @description
 * Looks up each word in the local ECDICT shards and returns a translation
 * dictionary compatible with the rendering pipeline.
 *
 * @remarks
 * - Uses `wordExistsInEcdict()` and shard caching (no network calls).
 * - Words not found in ECDICT are returned with empty meaning/pronunciation.
 * - Does not throw; always resolves to an object.
 *
 * @param {string[]} words Lowercased words to translate.
 * @returns {Promise<Record<string, { meaning: string, pronunciation: string }>>}
 */
async function fetchTranslationFromLocalDictionaryAPI(words) {
  const out = {};

  const arr = Array.isArray(words) ? words : [];
  for (const raw of arr) {
    const key = String(raw || "").trim().toLowerCase();
    if (!key) continue;

    const entry = await wordExistsInEcdict(key);

    if (entry) {
      out[key] = {
        meaning: entry.t || "",
        pronunciation: entry.p || ""
      };
    } else {
      out[key] = {
        meaning: "",
        pronunciation: ""
      };
    }
  }

  return out;
}

// ====================================================================
//              Helper: Fetch Translation from OpenAI API
// ====================================================================
const API_KEY = "ddsalfjlj22LKJ3LKJ43KLJ43L_DASFSLDdkfsdkfjlsdfds-dsfjkefjld0867803";
/**
 * 
 * @param {*} words 
 * @returns 
 */
async function fetchTranslationFromOpenAIAPI(words) {
  // Note: words is an array
  return {}
}

// ====================================================================
//                Helper: Update SHOW set to dict w/ translations
// ====================================================================
/**
 * @summary Build a translation dictionary for the current SHOW set.
 * @description
 * Converts a Set of visible words (SHOW set) into a dictionary mapping
 * each lowercase word to its translation data:
 * The translation backend is selected using the function getTranslationDecision()
 * @remarks
 * Supported translation sources:
 * - `"local"` → `fetchTranslationFromLocalDictionaryAPI()`
 * - `"api"`   → `fetchTranslationFromOpenAIAPI()`
 * Input words are assumed to be normalized to lowercase by upstream logic.
 * If an unknown translation source is encountered, an empty object is returned.
 * @param {Set<string>} showSet Words that should be translated and annotated.
 * @returns {Promise<Record<string, { meaning: string, pronunciation: string }>>}
 */
async function buildShowDictWithTranslations(showSet) {
  const translationSource = await getTranslationDecision()
  if (translationSource === "local") {
    console.log("[LearnWise] Fetching translations from local dictionary API...");
    return await fetchTranslationFromLocalDictionaryAPI(Array.from(showSet));
  }else if (translationSource === "api") {
    console.log("[LearnWise] Fetching translations from OpenAI API...");
    return await fetchTranslationFromOpenAIAPI(Array.from(showSet));
  }else{
    console.warn("[LearnWise] Unknown translation source:", translationSource);
    return {};
  }
}

// ======================================================================
//     Helper: Render SHOW dict with Ruby Annotations (translations)
// ======================================================================
/**
 * @summary Render ruby annotations for words in a SHOW dictionary.
 * @description
 * Walks visible text nodes and wraps words found in `showDict` with:
 *   <ruby class="learnwise-ruby" data-lw-word="word">
 *     WORD
 *     <rt>中文</rt>
 *   </ruby>
 * @remarks
 * - `showDict` is expected to be: { [wordLower]: { meaning: string, pronunciation: string } }
 * - Words should already be normalized to lowercase.
 * - If a word has no usable meaning, show "n/a".
 * - Skips SCRIPT/STYLE/NOSCRIPT, editable fields, and nodes already inside <ruby>.
 * @param {Record<string, { meaning?: string, pronunciation?: string }>} showDict
 * @returns {Promise<void>}
 */
async function renderShowDictUseRubys(showDict) {
  if (!showDict || typeof showDict !== "object" || Array.isArray(showDict)) return;

  const keys = Object.keys(showDict);
  if (keys.length === 0) return;

  const showSet = new Set(keys.map((k) => String(k || "").trim().toLowerCase()).filter(Boolean));
  if (showSet.size === 0) return;

  installRubyClickHandlerOnce();

  // Pick the first Chinese translation from a meaning string.
  function pickFirstChineseTranslation(meaning) {
    let s = String(meaning || "").trim();
    if (!s) return "";

    // 1) Only consider the first line
    s = s.split(/\r?\n/)[0].trim();

    // 2) Remove leading bracket labels and POS markers
    s = s
      .replace(/^\s*\[[^\]]+\]\s*/g, "")
      .replace(/^\s*(?:[a-z]{1,6}\.)+\s*/i, "");

    // 3) Split and take the first chunk
    const parts = s.split(/[；;，,、\s]+/).map((x) => x.trim()).filter(Boolean);
    const first = parts[0] || "";

    // 4) Ensure we return a Chinese chunk
    const m = first.match(/[\u4e00-\u9fff]+/);
    return (m ? m[0] : first).slice(0, 10);
  }

  // Ensure a tiny bit of CSS once per page
  if (!document.getElementById("learnwise-ruby-style")) {
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

  const WORD_RE = /[A-Za-z]+(?:'[A-Za-z]+)?/g;

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

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!node || !node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        const tag = parent.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return NodeFilter.FILTER_REJECT;

        if (parent.closest('input, textarea, [contenteditable="true"]')) return NodeFilter.FILTER_REJECT;
        if (parent.closest("ruby")) return NodeFilter.FILTER_REJECT;

        if (!isElementVisible(parent)) return NodeFilter.FILTER_REJECT;
        if (!/[A-Za-z]/.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;

        return NodeFilter.FILTER_ACCEPT;
      }
    },
    false
  );

  const toReplace = [];
  let n;
  while ((n = walker.nextNode())) {
    const text = n.nodeValue;
    const matches = text.match(WORD_RE);
    if (!matches) continue;

    let hit = false;
    for (const m of matches) {
      if (showSet.has(m.toLowerCase())) {
        hit = true;
        break;
      }
    }
    if (hit) toReplace.push(n);
  }

  for (const node of toReplace) {
    const text = node.nodeValue;
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
        const rawMeaning = showDict?.[key]?.meaning;
        const meaning = pickFirstChineseTranslation(rawMeaning);
        const displayMeaning = meaning || "n/a";

        changed = true;
        const ruby = document.createElement("ruby");
        ruby.className = "learnwise-ruby";
        ruby.dataset.lwWord = key;

        ruby.appendChild(document.createTextNode(wText));

        const rt = document.createElement("rt");
        rt.textContent = displayMeaning;

        ruby.appendChild(rt);
        frag.appendChild(ruby);
      } else {
        frag.appendChild(document.createTextNode(wText));
      }

      last = end;
    }

    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));

    if (changed && node.parentNode) {
      node.parentNode.replaceChild(frag, node);
    }
  }
}


// ======================================================================
// Testing / Open ai api fetch function // 
// ======================================================================
// TODO: This API Key for MVP testing only later need to set up more secure way
async function translateJson({ sentence, words }) {
  
  // 1) Prepare payload for API
  const payload = {
    sentence: String(sentence || "").trim(),
    words: Array.isArray(words) ? words : [],
  };

  // 2) Call Translate API
  const res = await fetch("https://api.learn-wise.net/translate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-LearnWise-Key": API_KEY,
    },
    // JSON.stringify converts a JavaScript object or value to a JSON string
    // When this need to be used: when sending data to a web server, often when sending data in an AJAX request or when submitting a form
    body: JSON.stringify(payload)
  });

  // Basic Validation ✅
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Translate API error ${res.status}: ${errText}`);
  }

  // 3) Parse response JSON
  const data = await res.json();

  // Basic Validation ✅
  // server.mjs returns: { ok: true, translations: { [word]: "中文" } }
  if (!data || data.ok !== true || !data.translations || typeof data.translations !== "object") {
    throw new Error(`Bad translate response: ${JSON.stringify(data)}`);
  }

  // 4) Return translations
  return data.translations;
}

// =====================================================================
//                  Pass Runner + Scroll Debounce
// =====================================================================
// This function debounces rapid calls to fn, ensuring it's only called. 
function debounce(fn, waitMs) {
  let t = null; 
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), waitMs);
  };
}

let LW_PASS_RUNNING = false;
let LW_PASS_PENDING = false;

async function runLearnWisePass() {
  // Respect popup toggle
  if (!(await isLearnWiseEnabled())) return;

  // Prevent overlapping passes on rapid scroll
  if (LW_PASS_RUNNING) {
    LW_PASS_PENDING = true;
    return;
  }

  LW_PASS_RUNNING = true;
  try {
    // Pass 1) get visible words from DOM
    const visibleWords = await getVisibleWordsInViewport();
    console.log(`[LearnWise] Pass: visible total=${visibleWords.length}, unique=${new Set(visibleWords).size}`);

    // Pass 2) split visible words into Sets (SHOW, NOSHOW, UNKNOWN), SHOW contains UNKOWN
    const { show, noshow, unknown } = await splitVisibleWordsIntoSets(visibleWords); // Type: { show: Set, noshow: Set, unknown: Set }
    console.log('[LearnWise] Pass: set sizes:', 'show=', show.size, 'noshow=', noshow.size, 'unknown=', unknown.size);

    
    if (unknown.size > 0) {
      // Pass 3) fetch meanings/pronunciations from ECDICT for unknown words
      const newWordsList = await fetchMeaningsForUnknownWords(Array.from(unknown));

      // Pass 4) upsert new words into word bank
      await upsertWordsIntoBank(newWordsList);
    }

    // Pass 5) update show set with translations (for rendering)
    const showDict = await buildShowDictWithTranslations(show); // Type: { [word]: { meaning, pronunciation } }

    // Pass 6) render showDict (adds ruby above words with translations, later below pronunciation can be added as well)
    await renderShowDictUseRubys(showDict);

  } finally {
    LW_PASS_RUNNING = false;
    if (LW_PASS_PENDING) {
      LW_PASS_PENDING = false;
      // Run one more pass to catch anything missed while we were busy
      await runLearnWisePass();
    }
  }
}
// =====================================================================
// =====================================================================
//                  Content Script Main Entry
// =====================================================================
// =====================================================================
(async () => {
  console.log("[LearnWise] Content script loaded.");

  // 1) ensure wordbank exists
  if (!(await isWordBankExist())) {
    await createEmptyWordBank();

    // TODO: This should be replaced by Real initial known words from user settings.
    const knownWordsList = mostCommonWordsList();
    console.log('[LearnWise] Temporary Known words list prepared: total=', Object.keys(knownWordsList).length);
  
    // Upsert words
    await upsertWordsIntoBank(knownWordsList);
    console.log("[LearnWise] Temporary Known words upserted into word bank.");
  }
  console.log("[LearnWise] Word bank ensured.");

  // 2) learnwise pass on initial load
  await runLearnWisePass();

  // 3) learnwise pass on scroll/resize with debounce
  const schedulePass = debounce(() => {
    runLearnWisePass().catch((e) => console.warn('[LearnWise] Pass failed:', e));
  }, 250);
  window.addEventListener('scroll', schedulePass, { passive: true });
  window.addEventListener('resize', schedulePass);      

  // Testing 
  const testjson = { sentence: "Sure AI can do writing, but memoir not so much.", words: ["memoir", "writing"] };
  // translateJson(testjson).then(console.log);


})();