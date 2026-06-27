// =====================================================================
// esbuild bundler for LearnWise
// ---------------------------------------------------------------------
// Content scripts (and the service worker) cannot use ES module `import`
// directly, so we bundle each entry point into a single classic script
// under dist/. The source lives in JSs/ (with pure logic in JSs/core/
// and DOM glue in JSs/dom/); the manifest points at the bundled output.
//
//   npm run build     one-off build
//   npm run watch     rebuild on change
// =====================================================================
import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");

/** Entry points that need bundling (they import from core/ and dom/). */
const entryPoints = {
  contentScript: "JSs/contentScript.js",
  background: "JSs/background.js",
  // Onboarding imports the pure calibration logic + the frequency word list,
  // so it is bundled (opened from the bundled background after install).
  onboarding: "JSs/onboarding.js",
  // Note: settingsWindow.js and popup.js are plain classic scripts loaded
  // directly from JSs/ (no imports), so they don't need bundling. Keeping
  // them out of the build means the settings UI works without `npm run build`.
};

/** @type {import("esbuild").BuildOptions} */
const options = {
  entryPoints,
  outdir: "dist",
  bundle: true,
  format: "iife", // classic script — safe for content scripts & service workers
  target: ["chrome110"],
  logLevel: "info",
  legalComments: "none",
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("[build] watching for changes…");
} else {
  await esbuild.build(options);
  console.log("[build] done.");
}
