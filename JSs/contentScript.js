// --- small helper: Promise wrappers ---
function getLocal(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}
function setLocal(obj) {
  return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
}

// --- 1) ensure wordbank exists (and keep meta flags) ---
async function ensureWordBank() {
  const res = await getLocal(["wordbank"]);
  if (!res.wordbank || typeof res.wordbank !== "object" || Array.isArray(res.wordbank)) {
    await setLocal({ wordbank: {} });
  }
}

// --- 2) upsert many words then write ONCE ---
async function upsertWordsIntoBank(words) { // words: { [word: string]: { meaning?: string, pronunciation?: string } }
  // read existing bank once
  const { wordbank = {} } = await getLocal(["wordbank"]); // 不知道为啥要 default {}，但保险起见，保留 吧 !! 

  const now = Date.now();
  const entries = words && typeof words === "object" ? words : {}; // the reason for this extra check is to avoid someone passing a non-object by mistake

  // upsert in memory
  for (const [rawWord, optionsRaw] of Object.entries(entries)) { // entries: { [word: string]: { meaning?: string, pronunciation?: string } }
    const key = String(rawWord).trim().toLowerCase(); // normalize to lower case
    if (!key) continue; // skip empty keys

    const options = optionsRaw && typeof optionsRaw === "object" ? optionsRaw : {}; // extra check to avoid errors

    // structure of word entry:
    if (!wordbank[key]) {     // new entry
      wordbank[key] = {
        word: key,
        meaning: options.meaning || "",
        pronunciation: options.pronunciation || "",
        level: 1,                               // start at level 1
        readCount: 1,                           // first read
        createdAt: now,                         // timestamp
        updatedAt: now                          // timestamp
      };
      // if option has level use it ( this logic can be changed as needed )
      if (options.level && Number.isInteger(options.level) && options.level >= 1 && options.level <= 100) {
        wordbank[key].level = options.level;
      }
    } else {                  // existing entry, update stats
      const entry = wordbank[key];                          // get existing entry
      entry.readCount = (entry.readCount || 0) + 1;         // increment read count
      entry.level = Math.min((entry.level || 1) + 1, 100);  // increment level, max 100
      entry.updatedAt = now;                                // update timestamp

      // only fill meaning/pronunciation if empty
      // this logic can be changed as needed (like nlp suggestions)
      if (!entry.meaning && options.meaning) entry.meaning = options.meaning;
      if (!entry.pronunciation && options.pronunciation) entry.pronunciation = options.pronunciation;
    }
  }
  // write once
  await setLocal({ wordbank });
}

// --- Helper: most common words list ---
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
  // randomly assign level 20-100 for testing
  // const randomLevel = Math.floor(Math.random() * 81) + 20; // 20 to 100
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

// =====================================================================
//                 Helper: Split Visible Words into Sets
// =====================================================================
// Rule:
//  - if word in wordbank and level >= 90 => noshow
//  - if word in wordbank and level < 90  => show
//  - if word not in wordbank            => unknown
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

// =====================================================================
//        Helper: Render Show Set with Ruby Annotations (translations)
// =====================================================================
// Walk visible text nodes and wrap words in `showSet` with:
//   <ruby class="learnwise-ruby"><rb>WORD</rb><rt>中文</rt></ruby>
// Notes:
//  - Uses wordbank meanings (already upserted) as the translation source.
//  - Avoids SCRIPT/STYLE/NOSCRIPT and editable fields.
//  - Skips nodes already inside <ruby> to prevent double-wrapping.
async function renderSetUseRubys(showSet) {
  if (!(showSet instanceof Set) || showSet.size === 0) return;        // check input validity

  // Load wordbank once
  const { wordbank = {} } = await getLocal(["wordbank"]);

  // Pick the first Chinese translation from a meaning string.
  // Examples:
  //  - "n. 头巾, 兜帽, 覆盖"      -> "头巾"
  //  - "vt. 罩上；覆盖"          -> "罩上"
  //  - "头巾, 兜帽"             -> "头巾"
  function pickFirstChineseTranslation(meaning) {
    let s = String(meaning || "").trim();
    if (!s) return "";

    // 1) Only consider the first line (ECDICT may have multi-line translations)
    s = s.split(/\r?\n/)[0].trim();

    // 2) Remove leading part-of-speech markers like "n.", "vt.", "adj.", etc.
    //    Also remove leading bracketed labels like "[网络]" if present.
    s = s
      .replace(/^\s*\[[^\]]+\]\s*/g, "")
      .replace(/^\s*(?:[a-z]{1,6}\.)+\s*/i, "");

    // 3) Split by common separators and take the first non-empty chunk
    const parts = s.split(/[；;，,、\s]+/).map(x => x.trim()).filter(Boolean);
    const first = parts[0] || "";

    // 4) Ensure we return a Chinese chunk (if the first chunk contains extra text)
    const m = first.match(/[\u4e00-\u9fff]+/);
    return (m ? m[0] : first).slice(0, 10);
  }

  // Ensure a tiny bit of CSS once per page
  if (!document.getElementById("learnwise-ruby-style")) { // avoid duplicates 
    const style = document.createElement("style");
    style.id = "learnwise-ruby-style";
    style.textContent = `
      /* Keep ruby text (Chinese) centered above the base word without per-character spacing */
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

  const WORD_RE = /[A-Za-z]+(?:'[A-Za-z]+)?/g; // this means match words with optional apostrophes, to match words like "it's", "don't", etc.

  function isElementVisible(el) {
    if (!(el instanceof Element)) return false;                             // check if el is an Element
    const style = getComputedStyle(el);                                     // get computed style function, returns CSSStyleDeclaration
    if (!style) return false;                                               // check style validity
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (parseFloat(style.opacity || "1") === 0) return false;

    const rect = el.getBoundingClientRect();                                // get bounding rectangle of the element
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;         // check size validity

    const vw = window.innerWidth || document.documentElement.clientWidth;   // viewport width
    const vh = window.innerHeight || document.documentElement.clientHeight; // viewport height

    if (rect.bottom <= 0 || rect.right <= 0) return false;
    if (rect.top >= vh || rect.left >= vw) return false;

    return true;
  }

  const walker = document.createTreeWalker(     // this function need 4 parameters
    document.body,                              // root node
    NodeFilter.SHOW_TEXT,                       // show text nodes only
    {                                           // this position need a filter object, type: NodeFilter, with acceptNode method, which is a function
      acceptNode(node) {                        // Study this function later, it is important!!!!!
        if (!node || !node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        const tag = parent.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return NodeFilter.FILTER_REJECT;

        // Skip editable fields
        if (parent.closest('input, textarea, [contenteditable="true"]')) return NodeFilter.FILTER_REJECT;

        // Skip anything already inside ruby
        if (parent.closest("ruby")) return NodeFilter.FILTER_REJECT;

        if (!isElementVisible(parent)) return NodeFilter.FILTER_REJECT;

        // Fast precheck: if no alpha chars, skip
        if (!/[A-Za-z]/.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;

        return NodeFilter.FILTER_ACCEPT;
      }
    },
    false                                       // this position is for entity reference expansion, not used here
  );

  const toReplace = [];                          
  let n;
  while ((n = walker.nextNode())) {             // (n = walker.nextNode()) gets the next text node , assigns to n, and the while loop continues as long as n is not null
    const text = n.nodeValue;                   // get text content of the node, text type is string
    // Quick check: do we have any candidate word in this node?
    const matches = text.match(WORD_RE);        // .match returns an array of matches or null, this checks if there are any words in the text node that match WORD_RE
    if (!matches) continue;

    let hit = false;                            // 
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

      // Append text before match
      if (start > last) frag.appendChild(document.createTextNode(text.slice(last, start)));

      const key = wText.toLowerCase();
      if (showSet.has(key)) {
        const meaning = pickFirstChineseTranslation(wordbank[key]?.meaning);

        // If we don't have a meaning yet, leave as plain text
        if (!meaning) {
          frag.appendChild(document.createTextNode(wText));
        } else {
          changed = true;
          const ruby = document.createElement("ruby");
          ruby.className = "learnwise-ruby";

          // Use a text node for the base word (better browser compatibility than <rb>)
          ruby.appendChild(document.createTextNode(wText));

          const rt = document.createElement("rt");
          rt.textContent = meaning;

          ruby.appendChild(rt);
          frag.appendChild(ruby);
        }
      } else {
        frag.appendChild(document.createTextNode(wText));
      }

      last = end;
    }

    // Append trailing text
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));

    if (changed && node.parentNode) {
      node.parentNode.replaceChild(frag, node);
    }
  }
}

// =====================================================================
//                  Pass Runner + Scroll Debounce
// =====================================================================
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
  // Prevent overlapping passes on rapid scroll
  if (LW_PASS_RUNNING) {
    LW_PASS_PENDING = true;
    return;
  }

  LW_PASS_RUNNING = true;
  try {
    // 4) get visible words from DOM
    const visibleWords = await getVisibleWordsInViewport();
    console.log(`[LearnWise] Pass: visible total=${visibleWords.length}, unique=${new Set(visibleWords).size}`);

    // 5) split visible words into Sets (SHOW, NOSHOW, UNKNOWN)
    const { show, noshow, unknown } = await splitVisibleWordsIntoSets(visibleWords);
    console.log('[LearnWise] Pass: set sizes:', 'show=', show.size, 'noshow=', noshow.size, 'unknown=', unknown.size);

    // 6) fetch meanings/pronunciations from ECDICT for unknown words
    if (unknown.size > 0) {
      const newWordsList = await fetchMeaningsForUnknownWords(Array.from(unknown));
      // 7) upsert new words into word bank
      await upsertWordsIntoBank(newWordsList);
    }

    // 8) render show set (adds ruby above words)
    await renderSetUseRubys(show);
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
//                  Content Script Main Entry
// =====================================================================
(async () => {
  console.log("0. [LearnWise] Content script loaded.");

  // 1) ensure wordbank exists
  await ensureWordBank();
  console.log("1. [LearnWise] Word bank ensured.");

  // 2) create word list to seed       
  // TODO: This should be replaced by initial known words from user settings, for now we hardcode a couple of common words, need a better way later
  //        Ask chatGPT to generate a list of 100 most common English words with their meanings and pronunciations in the same format as below
  // Create most common words list with function calle mostCommonWordsList()
  const knownWordsList = mostCommonWordsList(); // function defined above
  console.log('2. [LearnWise] Known words list prepared: total=', Object.keys(knownWordsList).length);

  // 3) upsert words
  await upsertWordsIntoBank(knownWordsList);
  console.log("3. [LearnWise] Known words upserted into word bank.");

  // // 4) get visible words from DOM
  // const visibleWords = await getVisibleWordsInViewport();
  // console.log(`4. [LearnWise] Visible words collected: total=${visibleWords.length}, unique=${new Set(visibleWords).size}`);

  // // 5) split visible words into Sets (SHOW, NOSHOW, UNKNOWN)
  // const { show, noshow, unknown } = await splitVisibleWordsIntoSets(visibleWords);
  // console.log('5. [LearnWise] Visible words split into sets:', '\n show:', show, '\n noshow: ', noshow,'\n unknown: ', unknown);

  // // 6) process unkownn: fetch meanings/pronunciations from API (not implemented here)
  // const newWordsList = await fetchMeaningsForUnknownWords(Array.from(unknown)); // implement this function as needed // newWordsList: { [word: string]: { meaning: string, pronunciation: string } }
  // console.log("6. [LearnWise] New words fetched for unknown words:", newWordsList);// this prints the newWordsList object to console for debugging, like property-value pairs

  // // 7) upsert new words into word bank
  // await upsertWordsIntoBank(newWordsList);
  // console.log("7. [LearnWise] New words upserted into word bank.");

  // // 8）Rendering show set            // just working version now
  // await renderSetUseRubys(show);

  // 4-8) initial pass
  await runLearnWisePass();

  // 9) Re-run pass when user scrolls / resizes so newly visible content gets ruby translations
  const schedulePass = debounce(() => {
    runLearnWisePass().catch((e) => console.warn('[LearnWise] Pass failed:', e));
  }, 250);

  window.addEventListener('scroll', schedulePass, { passive: true });
  window.addEventListener('resize', schedulePass);      



  
})();