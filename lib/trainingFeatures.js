// Builds a leakage-safe training table from the bundled historical dataset:
// for EVERY match, computes each team's rolling form and Elo rating using
// ONLY matches strictly before that match's date. This is different from
// liveFeatures.js, which computes a team's CURRENT rating/form as of right
// now for live predictions — this file computes what those values would
// have been at every point in the past, for training.

import { readFileSync } from "fs";
import { join } from "path";

// fs.readFileSync instead of a JS import — sidesteps any ambiguity about
// whether the deployment bundler needs a JSON import attribute (Node's own
// ESM loader requires one, Next.js's bundler may or may not) by just
// reading the file directly, which works identically everywhere.
const historicalMatches = JSON.parse(
  readFileSync(join(process.cwd(), "lib/data/historicalMatches.json"), "utf8")
);

const K_TIERS = (gamesPlayed) => (gamesPlayed < 10 ? 40 : gamesPlayed < 30 ? 32 : 20);
function adaptiveK(gamesPlayed, daysSinceLastMatch) {
  let k = K_TIERS(gamesPlayed);
  if (daysSinceLastMatch != null && daysSinceLastMatch > 365) k *= 1.5;
  return k;
}

// Elo rating for every match, BEFORE that match is applied — parallel array
// matching the input's order (input must already be chronologically sorted).
function computeEloAtEachMatch(sortedMatches) {
  const ratings = {}, gamesPlayed = {}, lastDate = {};
  const get = (team) => ratings[team] ?? 1500;
  const daysSince = (team, date) => (!lastDate[team] ? null : (new Date(date) - new Date(lastDate[team])) / 86400000);
  const out = [];
  for (const m of sortedMatches) {
    const rA = get(m.teamA), rB = get(m.teamB);
    out.push({ ratingA: rA, ratingB: rB });
    const kA = adaptiveK(gamesPlayed[m.teamA] ?? 0, daysSince(m.teamA, m.date));
    const kB = adaptiveK(gamesPlayed[m.teamB] ?? 0, daysSince(m.teamB, m.date));
    const expectedA = 1 / (1 + Math.pow(10, (rB - rA) / 400));
    const actualA = m.winner === "A" ? 1 : m.winner === "B" ? 0 : 0.5;
    ratings[m.teamA] = rA + kA * (actualA - expectedA);
    ratings[m.teamB] = rB + kB * ((1 - actualA) - (1 - expectedA));
    gamesPlayed[m.teamA] = (gamesPlayed[m.teamA] ?? 0) + 1;
    gamesPlayed[m.teamB] = (gamesPlayed[m.teamB] ?? 0) + 1;
    lastDate[m.teamA] = m.date; lastDate[m.teamB] = m.date;
  }
  return out;
}

function teamFormBefore(matches, team, beforeDate, n = 10) {
  const prior = matches
    .filter((m) => (m.teamA === team || m.teamB === team) && m.date < beforeDate)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, n);
  if (prior.length === 0) return 0;
  const gds = prior.map((m) => (m.teamA === team ? m.ftA - m.ftB : m.ftB - m.ftA));
  return gds.reduce((a, b) => a + b, 0) / gds.length;
}

// Returns { rows: [{formA, formB, eloDiff}], outcomes: ["A"/"D"/"B"] } —
// exactly the shape trainMatchModel() expects, built from the full bundled
// history with extra 2026 matches (if any) merged in and re-sorted.
export function buildTrainingSet(extraMatches2026 = []) {
  const all = [...historicalMatches, ...extraMatches2026]
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const eloAtMatch = computeEloAtEachMatch(all);

  const rows = [], outcomes = [];
  for (let i = 0; i < all.length; i++) {
    const m = all[i];
    const formA = teamFormBefore(all, m.teamA, m.date);
    const formB = teamFormBefore(all, m.teamB, m.date);
    const eloDiff = eloAtMatch[i].ratingA - eloAtMatch[i].ratingB;
    rows.push({ formA, formB, eloDiff });
    outcomes.push(m.winner);
  }
  return { rows, outcomes, featureNames: ["formA", "formB", "eloDiff"] };
}
