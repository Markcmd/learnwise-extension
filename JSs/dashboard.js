// =====================================================================
//                  LearnWise — progress stats renderer (M3.2)
// ---------------------------------------------------------------------
// Renders the progress stats at the top of the combined LearnWise page
// (HTMLs/settingsWindow.html). Like the review page, this is an
// extension-origin script, so it reads chrome.storage.local and the
// extension's own IndexedDB directly (no background hop), hands the bank
// + event logs to the pure aggregator (core/stats.js, M3.1), then renders
// the result with hand-rolled SVG/CSS charts (house style — zero runtime
// deps). Bundled by esbuild (imports core/) → dist/dashboard.js.
//
// Colours are CSS variables (--lw-tier-*, --lw-grade-*, --lw-act-*) so the
// charts follow the page's light/dark theme; the values live in settings.css.
// =====================================================================
import { STATS, FAMILIARITY_TIERS } from "./core/constants.js";
import { getWordBank } from "./core/wordbank.js";
import { getAllExposures, getAllReviews } from "./core/events.js";
import { computeStats } from "./core/stats.js";

const $ = (id) => document.getElementById(id);

// Bucket days by the user's LOCAL day (getTimezoneOffset is minutes BEHIND
// UTC, so local-east offset = its negation). Keeps "today" intuitive.
const TZ_OFFSET_MIN = -new Date().getTimezoneOffset();

// Theme-aware colours (resolved against the page's CSS custom properties).
const TIER_COLORS = {
  new: "var(--lw-tier-new)",
  learning: "var(--lw-tier-learning)",
  familiar: "var(--lw-tier-familiar)",
  known: "var(--lw-tier-known)",
};

const COLOR_EXPOSURE = "var(--lw-act-read)";
const COLOR_REVIEW = "var(--lw-act-review)";
const COLOR_TRACK = "var(--lw-border)";
const GRADE_COLORS = {
  again: "var(--lw-grade-again)",
  hard: "var(--lw-grade-hard)",
  good: "var(--lw-grade-good)",
  easy: "var(--lw-grade-easy)",
};

// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (n) => `${Math.round(n * 100)}%`;

/** Format a day index back into a short local date label (e.g. "Jun 3"). */
function dayLabel(dayIndex) {
  const ms = dayIndex * 24 * 60 * 60 * 1000 - TZ_OFFSET_MIN * 60 * 1000;
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function showPanel(id) {
  for (const p of ["loading", "empty", "dash"]) {
    const el = $(p);
    if (el) el.hidden = p !== id;
  }
}

// ---------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------
function renderHeadline(stats) {
  const { totals, streak, reviews } = stats;
  $("statTracked").textContent = String(totals.tracked);
  $("statKnown").textContent = String(totals.known);
  $("statAdded").textContent = totals.addedThisWeek > 0 ? `+${totals.addedThisWeek}` : "0";
  $("statStreak").textContent = String(streak.current);
  $("statStreakUnit").textContent = streak.current === 1 ? "day" : "days";
  $("statReviews").textContent = String(reviews.total);
  $("statAccuracy").textContent = reviews.total ? pct(reviews.accuracy) : "—";
}

function renderDistribution(dist) {
  const total = Object.values(dist).reduce((s, n) => s + n, 0);
  const max = Math.max(1, ...Object.values(dist));
  const rows = FAMILIARITY_TIERS.map((t) => {
    const n = dist[t.key] || 0;
    const w = Math.round((n / max) * 100);
    return (
      `<div class="lw-db-distrow">` +
      `<div class="lw-db-distlabel">${esc(t.label)}</div>` +
      `<div class="lw-db-disttrack"><div class="lw-db-distbar" style="width:${w}%;background:${TIER_COLORS[t.key]}"></div></div>` +
      `<div class="lw-db-distval">${n}</div>` +
      `</div>`
    );
  }).join("");
  $("distChart").innerHTML = rows;
  $("distTotal").textContent = total ? `${total} tracked word${total === 1 ? "" : "s"}` : "No words yet";
}

function renderActivity(activity) {
  const max = Math.max(1, ...activity.map((d) => d.total));
  const n = activity.length;
  const W = 100; // viewBox width units; scales to container
  const H = 40;
  const gap = 0.18;
  const bw = W / n;
  const total = activity.reduce((s, d) => s + d.total, 0);

  const bars = activity
    .map((d, i) => {
      const x = i * bw + (bw * gap) / 2;
      const w = bw * (1 - gap);
      const expH = (d.exposures / max) * H;
      const revH = (d.reviews / max) * H;
      const title = `${dayLabel(d.dayIndex)} — ${d.exposures} read, ${d.reviews} reviewed`;
      let svg = `<g><title>${esc(title)}</title>`;
      if (d.total === 0) {
        svg += `<rect x="${x.toFixed(2)}" y="${(H - 0.6).toFixed(2)}" width="${w.toFixed(2)}" height="0.6" fill="${COLOR_TRACK}"/>`;
      } else {
        // exposures on the bottom, reviews stacked on top
        svg += `<rect x="${x.toFixed(2)}" y="${(H - expH).toFixed(2)}" width="${w.toFixed(2)}" height="${expH.toFixed(2)}" fill="${COLOR_EXPOSURE}"/>`;
        svg += `<rect x="${x.toFixed(2)}" y="${(H - expH - revH).toFixed(2)}" width="${w.toFixed(2)}" height="${revH.toFixed(2)}" fill="${COLOR_REVIEW}"/>`;
      }
      svg += `</g>`;
      return svg;
    })
    .join("");

  $("activityChart").innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="lw-db-spark" role="img" aria-label="Daily activity for the last ${n} days">${bars}</svg>`;
  $("activityAxis").innerHTML =
    `<span>${esc(dayLabel(activity[0].dayIndex))}</span><span>Today</span>`;
  $("activitySummary").textContent = total
    ? `${total} action${total === 1 ? "" : "s"} over ${n} days`
    : `No activity in the last ${n} days`;
}

function renderAccuracy(reviews) {
  const { total, correct, accuracy, byGrade } = reviews;
  // Donut: a single ring whose filled arc = accuracy.
  const R = 16;
  const C = 2 * Math.PI * R;
  const filled = C * accuracy;
  $("accuracyRing").innerHTML =
    `<svg viewBox="0 0 40 40" class="lw-db-donut" role="img" aria-label="Review accuracy ${pct(accuracy)}">` +
    `<circle cx="20" cy="20" r="${R}" fill="none" stroke="${COLOR_TRACK}" stroke-width="6"/>` +
    (total
      ? `<circle cx="20" cy="20" r="${R}" fill="none" stroke="${COLOR_REVIEW}" stroke-width="6" ` +
        `stroke-dasharray="${filled.toFixed(2)} ${(C - filled).toFixed(2)}" stroke-dashoffset="${(C / 4).toFixed(2)}" stroke-linecap="round"/>`
      : "") +
    `<text x="20" y="20" text-anchor="middle" dominant-baseline="central" class="lw-db-donut-label">${total ? pct(accuracy) : "—"}</text>` +
    `</svg>`;
  $("accuracyNote").textContent = total
    ? `${correct} of ${total} reviews recalled (Good or Easy)`
    : "No reviews yet — answer some cards in Review to see accuracy.";

  const order = ["again", "hard", "good", "easy"];
  const maxG = Math.max(1, ...order.map((g) => byGrade[g] || 0));
  $("gradeBreakdown").innerHTML = order
    .map((g) => {
      const v = byGrade[g] || 0;
      const w = Math.round((v / maxG) * 100);
      return (
        `<div class="lw-db-graderow">` +
        `<div class="lw-db-gradelabel" style="color:${GRADE_COLORS[g]}">${g[0].toUpperCase()}${g.slice(1)}</div>` +
        `<div class="lw-db-disttrack"><div class="lw-db-distbar" style="width:${w}%;background:${GRADE_COLORS[g]}"></div></div>` +
        `<div class="lw-db-distval">${v}</div>` +
        `</div>`
      );
    })
    .join("");
}

function renderStreak(streak) {
  $("streakSub").textContent =
    `Longest streak ${streak.longest} day${streak.longest === 1 ? "" : "s"} · ${streak.activeDays} active day${streak.activeDays === 1 ? "" : "s"} total`;
}

function render(stats) {
  renderHeadline(stats);
  renderStreak(stats.streak);
  renderDistribution(stats.distribution);
  renderActivity(stats.activity);
  renderAccuracy(stats.reviews);
  showPanel("dash");
}

// ---------------------------------------------------------------------
// Load + init
// ---------------------------------------------------------------------
async function loadStats() {
  const [bank, events, reviews] = await Promise.all([
    getWordBank(),
    getAllExposures().catch(() => []),
    getAllReviews().catch(() => []),
  ]);
  const stats = computeStats(bank, events, reviews, {
    now: Date.now(),
    days: STATS.ACTIVITY_DAYS,
    tzOffsetMin: TZ_OFFSET_MIN,
  });
  return { stats, isEmpty: stats.totals.tracked === 0 && stats.reviews.total === 0 };
}

async function refresh() {
  showPanel("loading");
  try {
    const { stats, isEmpty } = await loadStats();
    if (isEmpty) {
      showPanel("empty");
      return;
    }
    render(stats);
  } catch (e) {
    showPanel("empty");
    const note = $("emptyNote");
    if (note) note.textContent = `Couldn't load your stats: ${String(e?.message || e)}`;
  }
}

function openReview() {
  chrome.tabs.create({ url: chrome.runtime.getURL("HTMLs/review.html") });
}

function init() {
  $("openReview")?.addEventListener("click", openReview);
  $("refreshBtn")?.addEventListener("click", refresh);
  $("emptyReview")?.addEventListener("click", openReview);

  // Live-refresh if the bank changes while the dashboard is open.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.wordbank) refresh();
  });

  refresh();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
