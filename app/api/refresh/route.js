import { Redis } from "@upstash/redis";
import { getEspnSlate, getEspnH2H, buildBracket, getPolymarket, getKalshi } from "@/lib/sources";

const redis = Redis.fromEnv(); // reads UPSTASH_REDIS_REST_URL + _TOKEN

export async function GET(req) {
  const authed = req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;

  // Called from a browser (no secret): don't hit the upstream APIs, just report
  // the cached snapshot's time. This is what your page's Refresh button uses.
  if (!authed) {
    const cached = await redis.get("wc-snapshot");
    return Response.json({ ok: true, cachedOnly: true, updatedAt: cached?.updatedAt || null });
  }

  // Called by cron-job.org (with the secret): do the real pull.
  try {
    const [slate, winnerPoly, bootPoly, winnerKalshi] = await Promise.all([
      getEspnSlate(),
      getPolymarket("world-cup-winner"),
      getPolymarket("world-cup-golden-boot-winner"),
      getKalshi("KXWORLDCUP"),
    ]);
    const { qualified, r16 } = await buildBracket(slate);

    const upcoming = slate.filter((g) => g.state === "pre");
    const schedule = upcoming.map((g) => ({
      day: new Date(g.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
      time: new Date(g.date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) + " ET",
      a: g.home, b: g.away, city: g.city, stad: g.venue, round: g.round,
    }));

    // winner rows shaped as [flagLabel, polyPct, kalshiPct] to match the UI
    const kByName = Object.fromEntries(winnerKalshi.map((k) => [k.label, Math.round(k.prob * 100)]));
    const winner = winnerPoly.slice(0, 6).map((p) => [p.label, Math.round(p.prob * 100), kByName[p.label] ?? "—"]);
    const boot = bootPoly.slice(0, 4).map((p) => [p.label, Math.round(p.prob * 100)]);

    // head-to-head keyed "TeamA|TeamB" (alphabetical), same as the frontend
    const h2h = {};
    for (const g of upcoming) h2h[[g.home, g.away].sort().join("|")] = await getEspnH2H(g.home, g.away);

    const snapshot = {
      updatedAt: new Date().toISOString(),
      asOf: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      note: "Auto-updated from ESPN + Polymarket + Kalshi.",
      winner, boot, schedule, qualified, r16, h2h,
    };
    await redis.set("wc-snapshot", snapshot);
    return Response.json({ ok: true, updatedAt: snapshot.updatedAt });
  } catch (err) {
    // keep the previous snapshot on failure — never serve a broken page
    return Response.json({ ok: false, error: String(err) }, { status: 200 });
  }
}
