#!/usr/bin/env bash
# =====================================================================
# package.sh — build a clean Chrome Web Store upload zip for LearnWise
# ---------------------------------------------------------------------
# Ships ONLY the files the loaded extension actually references — no
# sources, tests, dev-notes, docs, node_modules, etc. (see the ALLOWLIST
# below). manifest.json ends up at the ZIP ROOT, as Chrome requires.
#
# Prereq: run `npm run build` first so dist/ is fresh (this script does
# not build — it refuses to package a missing/empty dist/).
#
#   ./package.sh          # -> dist-package/learnwise-v<version>.zip
# =====================================================================
set -euo pipefail

cd "$(dirname "$0")"                 # repo root (script location)

# ---- read version from manifest.json --------------------------------
VERSION="$(node -p "require('./manifest.json').version" 2>/dev/null || true)"
if [ -z "${VERSION:-}" ]; then
  # Fallback if node isn't handy: grep it out.
  VERSION="$(grep -m1 '"version"' manifest.json | sed -E 's/.*"version"[^"]*"([^"]+)".*/\1/')"
fi
[ -n "$VERSION" ] || { echo "ERROR: couldn't read version from manifest.json"; exit 1; }

OUTDIR="dist-package"
STAGE="$OUTDIR/stage"
ZIP="$OUTDIR/learnwise-v${VERSION}.zip"

# ---- the runtime allowlist ------------------------------------------
# Whole directories that contain ONLY runtime files:
DIRS=( "dist" "HTMLs" "CSSs" "ecdict_json" )
# Individual files (we do NOT ship all of JSs/ or all of icons/):
FILES=(
  "manifest.json"
  "JSs/popup.js"
  "JSs/settingsWindow.js"
  "data/frequency.json"
  "icons/LEARNWISE_16.png"
  "icons/LEARNWISE_32.png"
  "icons/LEARNWISE_48.png"
  "icons/LEARNWISE_128.png"
  "icons/LEARNWISE_500.png"
)

# ---- sanity: dist/ must be built ------------------------------------
EXPECTED_BUNDLES=( contentScript.js background.js onboarding.js review.js dashboard.js )
for b in "${EXPECTED_BUNDLES[@]}"; do
  if [ ! -s "dist/$b" ]; then
    echo "ERROR: dist/$b missing or empty — run 'npm run build' first."; exit 1
  fi
done

# ---- verify every allowlisted path exists ---------------------------
missing=0
for d in "${DIRS[@]}"; do [ -d "$d" ] || { echo "MISSING dir  $d"; missing=1; }; done
for f in "${FILES[@]}"; do [ -f "$f" ] || { echo "MISSING file $f"; missing=1; }; done
[ "$missing" -eq 0 ] || { echo "ERROR: allowlist paths missing (see above)."; exit 1; }

# ---- stage a clean copy ---------------------------------------------
rm -rf "$OUTDIR"
mkdir -p "$STAGE"
for d in "${DIRS[@]}"; do
  mkdir -p "$STAGE/$(dirname "$d")"
  cp -R "$d" "$STAGE/$d"
done
for f in "${FILES[@]}"; do
  mkdir -p "$STAGE/$(dirname "$f")"
  cp "$f" "$STAGE/$f"
done

# Drop any stray junk that copying a dir might drag in (READMEs, OS cruft,
# editor/temp dotfiles). e.g. ecdict_json/ ships a README.md we don't want.
find "$STAGE" -type f \( \
     -name "*.md" -o -name ".DS_Store" -o -name "Thumbs.db" \
     -o -name ".__*" -o -name "*.map" \) -delete 2>/dev/null || true

# ---- zip (manifest.json at the archive root) ------------------------
( cd "$STAGE" && zip -rq "../$(basename "$ZIP")" . \
    -x "*.DS_Store" -x "*.md" -x "*/.*" )

# ---- report ---------------------------------------------------------
echo ""
echo "✅ Packaged LearnWise v${VERSION}"
echo "   → $ZIP"
BYTES=$(wc -c < "$ZIP" | tr -d ' '); echo "   size: $(( BYTES / 1024 )) KB"
echo ""
echo "Contents:"
unzip -l "$ZIP" | awk 'NR>3 && $4!="" {print "   " $4}' | sed '/^   ----/d;/^   [0-9]* files/d' | head -60
echo ""
echo "Sanity checks:"
if unzip -l "$ZIP" | awk '{print $NF}' | grep -qx "manifest.json"; then
  echo "   ✓ manifest.json at root"
else
  echo "   ✗ manifest.json NOT at root!"
fi
if unzip -l "$ZIP" | grep -Eq "JSs/core/|JSs/dom/|node_modules/|tests/|dev-notes/|docs/|\.md$"; then
  echo "   ✗ WARNING: non-runtime files leaked into the zip — inspect above."
else
  echo "   ✓ no source/dev files leaked"
fi
echo ""
echo "Upload $ZIP at https://chrome.google.com/webstore/devconsole/"
