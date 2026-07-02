import { Redis } from "@upstash/redis";
import { getFullTournamentSlate, predictMatch, explainMiss } from "@/lib/sources";
import { computeCurrentRatings, computeCurrentForm, normalizeTeamName } from "@/lib/liveFeatures";
import { loadMatchModel } from "@/lib/gbtEngine";

const redis = Redis.fromEnv();

// Retroactively predicts and grades every 2026 World Cup match played so
// far, for BOTH models, using the WIDE full-tournament fetch (not the fast
// "yesterday+" one) — this is what fills in matches from early in the
// tournament that getEspnSlate() can no longer see at all, since its
// narrow window has already passed them by.
//
// Leakage discipline: for each match, GBT's live features (Elo, form) are
// computed using only 2026 matches that happened STRICTLY BEFORE that
// match's own date — never using later results to "predict" an earlier
// game, same rule as everywhere else in this project.
//
// Resumable via ?limit=N — process only the next N unresolved matches per
// call, so if a very long tournament history ever risks the 10s timeout,
// this can be safely re-run repeatedly until everything's caught up,
// rather than needing to complete in one shot.
export async function GET(req) {
  const authed = req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (!authed) return new Response("unauthorized", { status: 401 });

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") || "200", 10);

  try {
    const fullSlate = await getFullTournamentSlate();
    const played = fullSlate
      .filter((g) => g.state === "post")
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    const gbtStored = await redis.get("wc-gbt-model");
    const gbtModel = gbtStored ? loadMatchModel(gbtStored) : null;

    const basePredictions = (await redis.get("wc-predictions")) || {};
    const gbtPredictions = (await redis.get("wc-gbt-predictions")) || {};

    let processed = 0, baseAdded = 0, gbtAdded = 0;

    for (const g of played) {
      if (processed >= limit) break;
      const gid = String(g.id);
      const actual = g.homeScore > g.awayScore ? "A" : g.awayScore > g.homeScore ? "B" : "D";
      let touched = false;

      // baseline — static rating table, not date-dependent, so backfilling
      // is just calling the same function used for any live prediction
      if (!basePredictions[gid]) {
        const { pA, pD, pB, pick } = predictMatch(g.home, g.away);
        const correct = actual === pick;
        basePredictions[gid] = {
          a: g.home, b: g.away, date: g.date, pA, pD, pB, pick,
          resolved: true, actual, correct, finalScore: `${g.homeScore}-${g.awayScore}`,
        };
        if (!correct) basePredictions[gid].reason = explainMiss(pA, pD, pB, pick, actual);
        baseAdded++; touched = true;
      }

      // GBT — needs leakage-safe features: only 2026 matches strictly
      // before THIS match's date, from the full tournament slate
      if (gbtModel && !gbtPredictions[gid]) {
        const priorPlayed = played
          .filter((m) => m.date < g.date)
          .map((m) => ({
            date: m.date, teamA: m.home, teamB: m.away, ftA: m.homeScore, ftB: m.awayScore,
          }));
        const ratings = computeCurrentRatings(priorPlayed);
        const tA = normalizeTeamName(g.home), tB = normalizeTeamName(g.away);
        const eloDiff = (ratings[tA] ?? 1500) - (ratings[tB] ?? 1500);
        const formA = computeCurrentForm(g.home, priorPlayed);
        const formB = computeCurrentForm(g.away, priorPlayed);
        const { pA, pD, pB } = gbtModel.predict({ formA, formB, eloDiff });
        const pick = pA >= pD && pA >= pB ? "A" : pB >= pD && pB >= pA ? "B" : "D";
        const correct = actual === pick;
        gbtPredictions[gid] = {
          a: g.home, b: g.away, date: g.date, pA, pD, pB, pick,
          resolved: true, actual, correct, finalScore: `${g.homeScore}-${g.awayScore}`,
        };
        if (!correct) gbtPredictions[gid].reason = explainMiss(pA, pD, pB, pick, actual);
        gbtAdded++; touched = true;
      }

      if (touched) processed++;
    }

    await redis.set("wc-predictions", basePredictions);
    if (gbtModel) await redis.set("wc-gbt-predictions", gbtPredictions);

    const remaining = played.filter((g) => !basePredictions[String(g.id)] || (gbtModel && !gbtPredictions[String(g.id)])).length;

    return Response.json({
      ok: true, totalPlayedMatches: played.length,
      baseAdded, gbtAdded, remaining,
      note: remaining > 0 ? `${remaining} matches still need backfilling — call this route again to continue.` : "All played matches are backfilled.",
    });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 200 });
  }
}
