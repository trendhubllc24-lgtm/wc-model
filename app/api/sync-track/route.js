import { Redis } from "@upstash/redis";
import { getEspnSlate, extractLiveGames, updateTrackRecord, buildBracket } from "@/lib/sources";

const redis = Redis.fromEnv();

// A cheap, frequent sibling to /api/refresh. The full refresh pulls
// Polymarket + Kalshi + head-to-head too, which is fine once or twice a
// day but wasteful (and rate-limit risky) to run every few minutes. This
// endpoint only re-checks ESPN — grading any game that finished since the
// last check — so the Live Prediction Tracker can update itself soon after
// a final whistle instead of waiting for the next full nightly refresh.
export async function GET(req) {
  const authed = req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (!authed) return new Response("unauthorized", { status: 401 });

  try {
    const slate = await getEspnSlate();
    const track = await updateTrackRecord(redis, slate);
    const live = extractLiveGames(slate);
    const { qualified } = await buildBracket(slate);

    // Merge into whatever snapshot already exists — this only touches the
    // fields that can change quickly (track record, live scores, who's
    // through); the tournament-wide market data stays as the last full
    // refresh left it until the next nightly run.
    const existing = (await redis.get("wc-snapshot")) || {};
    const snapshot = { ...existing, track, live, qualified, trackUpdatedAt: new Date().toISOString() };
    await redis.set("wc-snapshot", snapshot);

    return Response.json({ ok: true, trackTotal: track.total, updatedAt: snapshot.trackUpdatedAt });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 200 });
  }
}
