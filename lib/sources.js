const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";
// World Cup final is July 19, 2026 — without an explicit date range, ESPN's
// scoreboard endpoint only returns TODAY's games, which is why future
// fixtures were missing from the schedule. Requesting the full window fixes it.
const TOURNAMENT_START = "20260601"; // safely before the June 11 opener
const TOURNAMENT_END = "20260720";
const fmtDate = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");

function mapEspnEvents(events) {
  return (events || []).map((ev) => {
    const comp = ev.competitions?.[0] || {};
    const [home, away] = comp.competitors || [];
    const odds = comp.odds?.[0] || {};
    const status = comp.status || {};
    return {

      id: ev.id,
      date: ev.date,
      state: status.type?.state, // "pre" | "in" | "post"
      round: comp.notes?.[0]?.headline || "Knockout",
      home: home?.team?.displayName,
      away: away?.team?.displayName,
      homeScore: Number(home?.score ?? 0),
      awayScore: Number(away?.score ?? 0),
      city: comp.venue?.address?.city,
      venue: comp.venue?.fullName, // stadium name
      homeML: odds.homeTeamOdds?.moneyLine,
      drawML: odds.drawOdds?.moneyLine,
      awayML: odds.awayTeamOdds?.moneyLine,
      overUnder: odds.overUnder,
      // live-only fields
      clock: status.displayClock,           // e.g. "67'"
      period: status.period,                // 1 = first half, 2 = second half
      liveDetail: status.type?.shortDetail, // e.g. "HT", "FT", "67'"
    };
  });
}

// --- ESPN: upcoming AND live fixtures, venues, scores, moneylines ----------
// Fast, frequent version — only fetches from "yesterday" onward. Fine for
// live scores and grading recently-finished games, but deliberately narrow
// so routine polling stays cheap. NOT suitable for backfill: any match
// older than a day has already permanently fallen out of this window.
export async function getEspnSlate() {
  // Pull the start date back by a full day as a safety buffer. The server
  // runs in UTC, but games and the people watching them run on US time —
  // late evening in the US is already "tomorrow" in UTC, which was silently
  // excluding today's live game from the fetch range entirely. Starting a
  // day earlier guarantees today's games are always included regardless of
  // which side of the UTC boundary the server happens to be on.
  const start = fmtDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const url = `${ESPN_BASE}/scoreboard?dates=${start}-${TOURNAMENT_END}&limit=300`;
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();
  return mapEspnEvents(data.events);
}

// --- ESPN: the WHOLE tournament, from before the opener through the final --
// Used only for backfill — this is what makes it possible to retroactively
// predict and grade matches from weeks ago that getEspnSlate() can no
// longer see, since its narrow "yesterday+" window has already passed them.
export async function getFullTournamentSlate() {
  const url = `${ESPN_BASE}/scoreboard?dates=${TOURNAMENT_START}-${TOURNAMENT_END}&limit=300`;
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();
  return mapEspnEvents(data.events);
}

// --- Just the in-progress games, shaped for the "Live Now" ticker ----------
export function extractLiveGames(slate) {
  return slate
    .filter((g) => g.state === "in")
    .map((g) => ({
      a: g.home, b: g.away, aScore: g.homeScore, bScore: g.awayScore,
      clock: g.liveDetail || g.clock || "", period: g.period,
      city: g.city, stad: g.venue,
      homeML: g.homeML, drawML: g.drawML, awayML: g.awayML, overUnder: g.overUnder,
    }));
}

export async function getEspnMatch(eventId) {
  const res = await fetch(`${ESPN_BASE}/summary?event=${eventId}`, { cache: "no-store" });
  return res.json();
}

// --- ESPN: head-to-head history for a fixture ------------------------------
// Takes the event id we already have from the slate — no need to re-fetch
// the whole scoreboard to find it again. That earlier version re-downloaded
// ESPN's entire scoreboard once per upcoming game, sequentially — with a
// full tournament's worth of fixtures that's dozens of redundant fetches in
// a row, easily enough to time out the whole refresh and silently freeze the
// site on stale data. This version does one direct summary call per fixture.
export async function getEspnH2H(gameId, teamA, teamB) {
  try {
    const sum = await getEspnMatch(gameId);
    const games = sum.headToHeadGames || [];
    let aWins = 0, bWins = 0, draws = 0;
    for (const g of games) {
      const comps = g.competitors || [];
      const winner = comps.find((c) => c.winner);
      if (!winner) draws++;
      else if (winner.team?.displayName === teamA) aWins++;
      else bWins++;
    }
    const played = aWins + bWins + draws;
    return played ? { played, aWins, bWins, draws } : { played: 0, note: "No prior meetings on record." };
  } catch {
    return { played: 0, note: "H2H unavailable right now." };
  }
}

// --- Build who has advanced + auto-fill EVERY future round's pairings -----
// ESPN labels not-yet-decided fixtures with placeholders like "Winner Match 73"
// once the bracket is set. We swap those placeholders for the real team name
// as soon as that feeder match finishes — so nobody has to type anything in.
// This resolves R16, quarterfinals, semifinals, and the final, not just the
// next round — the whole rest-of-tournament bracket, as far as ESPN has set it.
export async function buildBracket(slate) {
  const qualified = [];
  const byMatchNum = {}; // "73" -> winning team name

  for (const g of slate.filter((x) => x.state === "post")) {
    let winner = null;
    if (g.homeScore > g.awayScore) winner = g.home;
    else if (g.awayScore > g.homeScore) winner = g.away;
    if (winner) {
      qualified.push(winner);
      const num = g.id || g.matchNumber;
      if (num) byMatchNum[String(num)] = winner;
    }
  }

  const resolvePlaceholder = (name) => {
    if (!name) return name;
    const m = name.match(/Winner Match (\d+)/i) || name.match(/W(\d+)/);
    if (m && byMatchNum[m[1]]) return byMatchNum[m[1]];
    return name; // not decided yet — show the placeholder as-is
  };

  const shapeRound = (g) => ({
    a: resolvePlaceholder(g.home), b: resolvePlaceholder(g.away),
    city: g.city, stad: g.venue,
    when: new Date(g.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
    decided: !/Winner|TBD/i.test(`${g.home}${g.away}`),
  });

  const byRound = (regex) => slate.filter((g) => g.round && regex.test(g.round)).map(shapeRound);

  return {
    qualified: [...new Set(qualified)],
    r16: byRound(/round of 16/i),
    qf: byRound(/quarterfinal/i),
    sf: byRound(/semifinal/i),
    third: byRound(/third.place/i),
    final: byRound(/\bfinal\b/i),
  };
}

// --- Polymarket (Gamma API, no key). slug e.g. "world-cup-winner" ----------
export async function getPolymarket(slug) {
  const res = await fetch(`https://gamma-api.polymarket.com/events?slug=${slug}`, { cache: "no-store" });
  const [event] = await res.json();
  if (!event) return [];
  return (event.markets || [])
    .map((m) => {
      const prices = JSON.parse(m.outcomePrices || "[]").map(Number);
      return { label: m.groupItemTitle || m.question, prob: prices[0] || 0 };
    })
    .sort((a, b) => b.prob - a.prob);
}

// --- Kalshi (public markets GET, no key needed) -----------------------------
// The correct public base is external-api.kalshi.com — NOT api.elections.kalshi.com,
// which is a different/legacy domain that returns nothing useful for this.
// Kalshi's response format has shifted between cents-integer fields (yes_bid,
// yes_ask) and dollar-string fields (yes_bid_dollars, yes_ask_dollars)
// depending on the market — this reads whichever is present.
export async function getKalshi(eventTicker) {
  try {
    const res = await fetch(
      `https://external-api.kalshi.com/trade-api/v2/markets?event_ticker=${eventTicker}&status=open`,
      { headers: { accept: "application/json" }, cache: "no-store" }
    );
    const data = await res.json();
    return (data.markets || []).map((m) => {
      const bid = m.yes_bid_dollars != null ? parseFloat(m.yes_bid_dollars) : (m.yes_bid ?? 0) / 100;
      const ask = m.yes_ask_dollars != null ? parseFloat(m.yes_ask_dollars) : (m.yes_ask ?? 0) / 100;
      return { label: m.yes_sub_title || m.title, prob: (bid + ask) / 2 };
    });
  } catch {
    return [];
  }
}

/* ================================================================== */
/*  TRACK RECORD — a compact copy of the frontend's model, used only    */
/*  to log a pre-match prediction the moment a fixture appears, so it   */
/*  can be graded once the result is known. Same Elo→Poisson approach   */
/*  as the main site; kept small since we only need win/draw/loss here. */
/* ================================================================== */
const TEAM_ELO = {
  Argentina: 2100, France: 2085, Spain: 2075, Brazil: 2020, England: 2010,
  Portugal: 2000, Netherlands: 1990, Germany: 1960, Italy: 1935, Belgium: 1930,
  Croatia: 1900, Uruguay: 1895, Colombia: 1885, Morocco: 1870, Switzerland: 1855,
  Denmark: 1850, Senegal: 1840, Japan: 1835, Norway: 1835, USA: 1830, Ecuador: 1815,
  Mexico: 1810, Sweden: 1810, Serbia: 1800, Austria: 1800, "Türkiye": 1795,
  "Korea Rep.": 1790, Ukraine: 1785, Nigeria: 1780, Algeria: 1780, Poland: 1770,
  "Ivory Coast": 1765, Canada: 1765, Iran: 1760, Paraguay: 1750, Australia: 1750,
  Egypt: 1745, Ghana: 1720, Venezuela: 1720, Bosnia: 1720, "Congo DR": 1685,
  "Costa Rica": 1685, Panama: 1680, "Saudi Arabia": 1675, Qatar: 1655,
  Uzbekistan: 1630, Jordan: 1625, "Cape Verde": 1615, Haiti: 1550, "New Zealand": 1520,
  "Curaçao": 1500,
};
const elo = (name) => TEAM_ELO[name] ?? 1700;

function pFactorial(n) { let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; }
function pPoisson(k, l) { return Math.exp(-l) * Math.pow(l, k) / pFactorial(k); }

// Predict win/draw/loss for a fixture — same shape of math as the main site,
// trimmed to a 6x6 grid since we only need the three outcome probabilities.
export function predictMatch(homeTeam, awayTeam) {
  const diff = elo(homeTeam) - elo(awayTeam);
  const sup = Math.max(-3.2, Math.min(3.2, diff / 200));
  const qAdj = Math.max(-0.15, Math.min(0.7, ((elo(homeTeam) + elo(awayTeam)) / 2 - 1785) / 400));
  const total = 2.70 + qAdj;
  const lA = Math.max(0.18, (total + sup) / 2), lB = Math.max(0.18, (total - sup) / 2);
  const RHO = -0.08, MAXG = 6;
  const tau = (i, j) => (i === 0 && j === 0) ? 1 - lA * lB * RHO
    : (i === 0 && j === 1) ? 1 + lA * RHO
    : (i === 1 && j === 0) ? 1 + lB * RHO
    : (i === 1 && j === 1) ? 1 - RHO : 1;
  let pA = 0, pD = 0, pB = 0, S = 0;
  const cells = [];
  for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) {
    const p = pPoisson(i, lA) * pPoisson(j, lB) * tau(i, j);
    cells.push([i, j, p]); S += p;
  }
  for (const [i, j, p0] of cells) {
    const p = p0 / S;
    if (i > j) pA += p; else if (i < j) pB += p; else pD += p;
  }
  const pick = pA >= pD && pA >= pB ? "A" : pB >= pD && pB >= pA ? "B" : "D";
  return { pA, pD, pB, pick };
}

// --- Log new predictions + grade ones whose match has finished --------------
// A short, honest explanation for why a prediction missed — based only on
// the actual probability pattern, not a claim of deep causal insight we
// don't have. Deliberately avoids overclaiming "X caused this" when the
// truthful read is closer to "this was close" or "an upset happened."
export function explainMiss(pA, pD, pB, pick, actual) {
  const probs = { A: pA, B: pB, D: pD };
  const pickedProb = probs[pick];
  const actualProb = probs[actual];
  const gap = pickedProb - actualProb;

  if (actual === "D") {
    return `Draws are the hardest outcome to call — the model gave a draw only ${Math.round(pD * 100)}% here, well behind its ${Math.round(pickedProb * 100)}% pick. Draws are structurally underrepresented in most models' top picks even when they're a real possibility.`;
  }
  if (gap < 0.10) {
    return `This was close — the actual result was given a real chance too (${Math.round(actualProb * 100)}%), only ${Math.round(gap * 100)} points behind the model's actual pick (${Math.round(pickedProb * 100)}%). A near-coinflip that landed the other way, not a confident miss.`;
  }
  if (pickedProb >= 0.65) {
    return `A genuine upset — the model gave its pick a strong ${Math.round(pickedProb * 100)}% edge, but the ${Math.round(actualProb * 100)}% underdog won anyway. This happens; a heavy favorite losing some fraction of the time is expected, not a sign the model is broken.`;
  }
  return `The model's read (${Math.round(pA * 100)}% / ${Math.round(pD * 100)}% / ${Math.round(pB * 100)}%) didn't match this result. No single miss means much on its own — what matters is the hit rate across many matches, not any one call.`;
}

// Reads/writes the "wc-predictions" key directly, so the refresh route just
// calls this once per cycle. Nothing here needs the person to type anything.
export async function updateTrackRecord(redis, slate) {
  const predictions = (await redis.get("wc-predictions")) || {};

  for (const g of slate) {
    const gid = String(g.id);
    if (g.state !== "pre" && g.state !== "in" && g.state !== "post") continue;

    if (!predictions[gid]) {
      const { pA, pD, pB, pick } = predictMatch(g.home, g.away);
      predictions[gid] = { a: g.home, b: g.away, date: g.date, pA, pD, pB, pick, resolved: false };
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

  await redis.set("wc-predictions", predictions);

  const resolved = Object.values(predictions)
    .filter((p) => p.resolved)
    .sort((x, y) => new Date(y.date) - new Date(x.date));
  const correct = resolved.filter((p) => p.correct).length;
  const incorrect = resolved.length - correct;

  return {
    correct, incorrect, total: resolved.length,
    accuracy: resolved.length ? correct / resolved.length : null,
    history: resolved.slice(0, 50),
  };
}
