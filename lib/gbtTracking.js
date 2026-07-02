import { computeCurrentRatings, computeCurrentForm, normalizeTeamName } from "./liveFeatures";
import { loadMatchModel } from "./gbtEngine";
import { explainMiss } from "./sources";

// Predicts one match using the currently-stored trained GBT model. Returns
// null if no model has been trained yet (first-run case, before the first
// /api/train call succeeds) — callers must handle this, not assume a model
// always exists.
export async function predictWithGbt(redis, homeTeam, awayTeam, playedMatches2026 = []) {
  const stored = await redis.get("wc-gbt-model");
  if (!stored) return null;

  const model = loadMatchModel(stored);
  const ratings = computeCurrentRatings(playedMatches2026);
  const tA = normalizeTeamName(homeTeam), tB = normalizeTeamName(awayTeam);
  const eloDiff = (ratings[tA] ?? 1500) - (ratings[tB] ?? 1500);
  const formA = computeCurrentForm(homeTeam, playedMatches2026);
  const formB = computeCurrentForm(awayTeam, playedMatches2026);

  const { pA, pD, pB } = model.predict({ formA, formB, eloDiff });
  const pick = pA >= pD && pA >= pB ? "A" : pB >= pD && pB >= pA ? "B" : "D";
  return { pA, pD, pB, pick };
}

// Same shape and logic as updateTrackRecord() in sources.js, but for the
// GBT model — a fully separate Redis key ("wc-gbt-predictions"), graded
// independently, so the two models' hit rates can be compared honestly
// side by side rather than mixed into one number.
export async function updateGbtTrackRecord(redis, slate) {
  const stored = await redis.get("wc-gbt-model");
  if (!stored) {
    // no trained model yet — return an empty-but-valid summary rather than
    // crashing the whole refresh cycle over a route that hasn't run yet
    return { correct: 0, incorrect: 0, total: 0, accuracy: null, history: [], modelTrained: false };
  }

  const played2026 = slate
    .filter((g) => g.state === "post")
    .map((g) => ({
      date: g.date, teamA: g.home, teamB: g.away, ftA: g.homeScore, ftB: g.awayScore,
      winner: g.homeScore > g.awayScore ? "A" : g.homeScore < g.awayScore ? "B" : "D",
    }));

  const predictions = (await redis.get("wc-gbt-predictions")) || {};

  for (const g of slate) {
    const gid = String(g.id);
    if (g.state !== "pre" && g.state !== "in" && g.state !== "post") continue;

    if (!predictions[gid]) {
      // matches strictly before this one (excludes this game itself, since
      // it may already be in `played2026` if state is "post" on first sight)
      const priorPlayed = played2026.filter((m) => m.date < g.date);
      const result = await predictWithGbt(redis, g.home, g.away, priorPlayed);
      if (result) {
        predictions[gid] = { a: g.home, b: g.away, date: g.date, ...result, resolved: false };
      }
    }
    if (g.state === "post" && predictions[gid] && !predictions[gid].resolved) {
      const actual = g.homeScore > g.awayScore ? "A" : g.awayScore > g.homeScore ? "B" : "D";
      predictions[gid].resolved = true;
      predictions[gid].actual = actual;
      predictions[gid].correct = actual === predictions[gid].pick;
      if (!predictions[gid].correct) {
        predictions[gid].reason = explainMiss(predictions[gid].pA, predictions[gid].pD, predictions[gid].pB, predictions[gid].pick, actual);
      }
      predictions[gid].finalScore = `${g.homeScore}-${g.awayScore}`;
    }
  }

  await redis.set("wc-gbt-predictions", predictions);

  const resolved = Object.values(predictions)
    .filter((p) => p.resolved)
    .sort((x, y) => new Date(y.date) - new Date(x.date));
  const correct = resolved.filter((p) => p.correct).length;
  const incorrect = resolved.length - correct;

  return {
    correct, incorrect, total: resolved.length,
    accuracy: resolved.length ? correct / resolved.length : null,
    history: resolved.slice(0, 150), // raised above the tournament's max ~104 matches so nothing gets silently truncated
    modelTrained: true,
    modelTrainedAt: stored.trainedAt,
  };
}
