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


// --- content script entry ---
(async () => {
  console.log("[LearnWise] Content script loaded.");

  // 1) ensure wordbank exists
  await ensureWordBank();

  // 2) create word list to seed
  const knownWordsList = {
    the: { meaning: "定冠词", pronunciation: "ðə" },
    and: { meaning: "和", pronunciation: "ænd" }
  };

  // 3) upsert words
  await upsertWordsIntoBank(knownWordsList);


  // Example: when you actually detect a word on page, then do:
  // await upsertWordsIntoBank({
  //   sophisticated: { meaning: "...", pronunciation: "..." }
  // });
})();