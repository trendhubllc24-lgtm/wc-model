// Computes live features (Elo rating, rolling form) for any team as of
// right now, using the bundled 7,461-match historical dataset (finals +
// qualifiers, 1992-2025) PLUS whatever 2026 World Cup matches have already
// been played (passed in from the live ESPN slate). Same math as the
// research/backtest build — adaptive K-factor Elo, leakage-safe rolling
// form — just wired to run against live data instead of a fixed backtest.

import { readFileSync } from "fs";
import { join } from "path";

// fs.readFileSync instead of a JS import — sidesteps any ambiguity about
// whether the deployment bundler needs a JSON import attribute (Node's own
// ESM loader requires one, Next.js's bundler may or may not) by just
// reading the file directly, which works identically everywhere.
const historicalMatches = JSON.parse(
  readFileSync(join(process.cwd(), "lib/data/historicalMatches.json"), "utf8")
);

// Name mismatches between ESPN's live feed and our bundled dataset's naming
// convention — reusing exactly the aliases already verified elsewhere in
// this project (frontend display aliases, qualifier-dataset merge aliases).
// Additional mismatches may surface on first real deployment against live
// ESPN data, same honest caveat as the Wikipedia title mapping — this list
// isn't guaranteed exhaustive, just built from every real mismatch we've
// actually found so far.
const NAME_ALIASES = {
  "USA": "United States",
  "Ireland": "Republic of Ireland",
  "Yugoslavia": "FR Yugoslavia",
  "China": "China PR",
  "Côte d'Ivoire": "Ivory Coast",
  "Bosnia-Herzegovina": "Bosnia and Herzegovina",
  "Bosnia": "Bosnia and Herzegovina",
};
function norm(name) { return NAME_ALIASES[name] || name; }

const K_TIERS = (gamesPlayed) => (gamesPlayed < 10 ? 40 : gamesPlayed < 30 ? 32 : 20);
function adaptiveK(gamesPlayed, daysSinceLastMatch) {
  let k = K_TIERS(gamesPlayed);
  if (daysSinceLastMatch != null && daysSinceLastMatch > 365) k *= 1.5;
  return k;
}

// Builds current Elo ratings for every team by running adaptive-K Elo
// across the full bundled history plus any 2026 results played so far.
// Returns a plain { teamName: rating } map as of "right now".
export function computeCurrentRatings(playedMatches2026 = []) {
  const all = [...historicalMatches, ...playedMatches2026.map((m) => ({
    date: m.date, teamA: norm(m.teamA), teamB: norm(m.teamB), winner: m.winner, ftA: m.ftA, ftB: m.ftB,
  }))].sort((a, b) => new Date(a.date) - new Date(b.date));

  const ratings = {}, gamesPlayed = {}, lastDate = {};
  const get = (team) => ratings[team] ?? 1500;
  const daysSince = (team, date) => (!lastDate[team] ? null : (new Date(date) - new Date(lastDate[team])) / 86400000);

  for (const m of all) {
    const tA = norm(m.teamA), tB = norm(m.teamB);
    const rA = get(tA), rB = get(tB);
    const kA = adaptiveK(gamesPlayed[tA] ?? 0, daysSince(tA, m.date));
    const kB = adaptiveK(gamesPlayed[tB] ?? 0, daysSince(tB, m.date));
    const expectedA = 1 / (1 + Math.pow(10, (rB - rA) / 400));
    const actualA = m.winner === "A" ? 1 : m.winner === "B" ? 0 : 0.5;
    ratings[tA] = rA + kA * (actualA - expectedA);
    ratings[tB] = rB + kB * ((1 - actualA) - (1 - expectedA));
    gamesPlayed[tA] = (gamesPlayed[tA] ?? 0) + 1;
    gamesPlayed[tB] = (gamesPlayed[tB] ?? 0) + 1;
    lastDate[tA] = m.date; lastDate[tB] = m.date;
  }
  return ratings;
}

// Rolling goal-differential form: last 10 matches for a team, found
// anywhere in the bundled history + 2026 results so far, strictly before
// "right now" (which is trivially true here since we only ever look at
// matches that have already happened — there's no future data to leak from
// when computing a LIVE, present-moment feature).
export function computeCurrentForm(team, playedMatches2026 = [], n = 10) {
  const tn = norm(team);
  const all = [...historicalMatches, ...playedMatches2026.map((m) => ({
    date: m.date, teamA: norm(m.teamA), teamB: norm(m.teamB), ftA: m.ftA, ftB: m.ftB,
  }))];
  const prior = all
    .filter((m) => m.teamA === tn || m.teamB === tn)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, n);
  if (prior.length === 0) return 0;
  const gds = prior.map((m) => (m.teamA === tn ? m.ftA - m.ftB : m.ftB - m.ftA));
  return gds.reduce((a, b) => a + b, 0) / gds.length;
}

export { norm as normalizeTeamName };
