import { Redis } from "@upstash/redis";
import { buildTrainingSet } from "@/lib/trainingFeatures";
import { trainMatchModel } from "@/lib/gbtEngine";
import { getEspnSlate } from "@/lib/sources";

const redis = Redis.fromEnv();

// Trains a fresh GBT model on the bundled 7,461-match historical dataset
// PLUS every 2026 World Cup match played so far, and stores the serialized
// trees in Redis so live prediction requests just load the pre-trained
// model instead of retraining on every request (retraining takes ~6.5s —
// too slow and wasteful to do per-request, fine as a scheduled job).
//
// TIMING NOTE: the full pipeline (build features + fit 180 trees across 3
// classes) takes ~6.5s on the full dataset — comfortably under Vercel's
// 10s Hobby limit, but not with huge margin. If this route ever times out
// on a given day, it's low-stakes: predictions keep using the last
// successfully trained model until the next scheduled run succeeds.
export async function GET(req) {
  const authed = req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (!authed) return new Response("unauthorized", { status: 401 });

  try {
    // pull in any 2026 matches played so far, so the model learns from the
    // current tournament too, not just historical data through 2025
    const slate = await getEspnSlate();
    const played2026 = slate
      .filter((g) => g.state === "post")
      .map((g) => ({
        date: g.date, teamA: g.home, teamB: g.away,
        ftA: g.homeScore, ftB: g.awayScore,
        winner: g.homeScore > g.awayScore ? "A" : g.homeScore < g.awayScore ? "B" : "D",
      }));

    const t0 = Date.now();
    const { rows, outcomes, featureNames } = buildTrainingSet(played2026);
    // 40 rounds instead of 60 — measured timing showed real variance between
    // runs (6.5s-8.2s at 60 rounds, uncomfortably close to Vercel's 10s
    // limit once production network/cold-start overhead is added). 40
    // rounds cuts training time by ~30% while producing nearly identical
    // predictions in spot checks (0.943/0.045/0.012 vs 0.943/0.042/0.015 for
    // the same test case) — a safety margin worth far more than the tiny
    // accuracy cost.
    const model = trainMatchModel(rows, outcomes, featureNames, { rounds: 40, learningRate: 0.15, maxDepth: 3 });
    const trainMs = Date.now() - t0;

    const serialized = model.serialize();
    await redis.set("wc-gbt-model", {
      ...serialized,
      featureNames,
      trainedAt: new Date().toISOString(),
      trainingRows: rows.length,
      trainMs,
    });

    return Response.json({ ok: true, trainingRows: rows.length, trainMs, played2026: played2026.length });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 200 });
  }
}
