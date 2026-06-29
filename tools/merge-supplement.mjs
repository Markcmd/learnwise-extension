// =====================================================================
// merge-supplement.mjs — expand the bundled ECDICT local dictionary
// ---------------------------------------------------------------------
// Folds curated entries from dict-supplement/supplement.json into the
// right ecdict_json/<shard>.json files. Words already present are skipped
// (never clobbered), so the run is idempotent: re-running adds nothing.
//
//   node tools/merge-supplement.mjs            merge supplement.json
//   node tools/merge-supplement.mjs --dry-run  report only, write nothing
//   node tools/merge-supplement.mjs path.json  merge a different file
//
// Shard bucketing MUST match JSs/dom/ecdict.js::shardKeyFromWord so a
// merged word lands in the shard the extension will actually fetch.
// No npm deps — plain Node fs. Edit the JSON shards in place; the dict is
// a web_accessible_resource (not bundled), so just reload the extension.
// =====================================================================
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SHARD_DIR = join(ROOT, "ecdict_json");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const supPath = resolve(
  ROOT,
  args.find((a) => !a.startsWith("--")) || "dict-supplement/supplement.json"
);

/** First-letter shard bucket for a word. Mirrors JSs/dom/ecdict.js. */
function shardKeyFromWord(word) {
  const c = (word?.[0] || "").toLowerCase();
  if (c >= "a" && c <= "z") return c;
  if (c >= "0" && c <= "9") return "0-9";
  return "other";
}

function loadShard(shard) {
  try {
    const arr = JSON.parse(readFileSync(join(SHARD_DIR, `${shard}.json`), "utf8"));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return []; // shard may not exist yet (e.g. a brand-new bucket)
  }
}

// --- read + validate the supplement -----------------------------------
let supplement;
try {
  supplement = JSON.parse(readFileSync(supPath, "utf8"));
} catch (e) {
  console.error(`[merge] cannot read supplement: ${supPath}\n        ${e.message}`);
  process.exit(1);
}
if (!Array.isArray(supplement)) {
  console.error("[merge] supplement must be a JSON array of { w, p, t } objects.");
  process.exit(1);
}

// Group valid entries by shard, lowercasing the key so it matches lookups.
const byShard = new Map();
let skippedInvalid = 0;
for (const raw of supplement) {
  const w = String(raw?.w || "").trim().toLowerCase();
  const t = String(raw?.t || "").trim();
  if (!w || !t) {
    skippedInvalid++;
    continue;
  }
  const entry = { w, p: String(raw?.p || "").trim(), t };
  const shard = shardKeyFromWord(w);
  if (!byShard.has(shard)) byShard.set(shard, []);
  byShard.get(shard).push(entry);
}

// --- merge shard by shard ---------------------------------------------
let added = 0;
let alreadyPresent = 0;

for (const [shard, entries] of [...byShard].sort()) {
  const existing = loadShard(shard);
  const have = new Set(existing.map((it) => String(it?.w || "").trim().toLowerCase()));

  const toAdd = [];
  for (const e of entries) {
    if (have.has(e.w)) {
      alreadyPresent++;
    } else {
      have.add(e.w);
      toAdd.push(e);
      added++;
    }
  }
  if (!toAdd.length) {
    console.log(`[merge] ${shard}: +0 (all ${entries.length} already present)`);
    continue;
  }

  const merged = existing.concat(toAdd).sort((a, b) =>
    String(a?.w || "").toLowerCase().localeCompare(String(b?.w || "").toLowerCase())
  );

  console.log(`[merge] ${shard}: +${toAdd.length} -> ${merged.length} entries` + (dryRun ? " (dry-run)" : ""));
  if (!dryRun) {
    writeFileSync(join(SHARD_DIR, `${shard}.json`), JSON.stringify(merged), "utf8");
  }
}

console.log(
  `\n[merge] done. added ${added}, already present ${alreadyPresent}` +
    (skippedInvalid ? `, skipped ${skippedInvalid} invalid` : "") +
    (dryRun ? "  (dry-run: no files written)" : "")
);
