const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";

// --- ESPN: upcoming AND live fixtures, venues, scores, moneylines ----------
export async function getEspnSlate() {
  const res = await fetch(`${ESPN_BASE}/scoreboard`, { cache: "no-store" });
  const data = await res.json();
  return (data.events || []).map((ev) => {
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

// --- Just the in-progress games, shaped for the "Live Now" ticker ----------
export function extractLiveGames(slate) {
  return slate
    .filter((g) => g.state === "in")
    .map((g) => ({
      a: g.home, b: g.away, aScore: g.homeScore, bScore: g.awayScore,
      clock: g.liveDetail || g.clock || "", period: g.period,
      city: g.city, stad: g.venue,
    }));
}

export async function getEspnMatch(eventId) {
  const res = await fetch(`${ESPN_BASE}/summary?event=${eventId}`, { cache: "no-store" });
  return res.json();
}

// --- ESPN: head-to-head history for a fixture ------------------------------
export async function getEspnH2H(teamA, teamB) {
  try {
    const sb = await fetch(`${ESPN_BASE}/scoreboard`, { cache: "no-store" }).then((r) => r.json());
    const ev = (sb.events || []).find((e) => {
      const names = (e.competitions?.[0]?.competitors || []).map((c) => c.team?.displayName);
      return names.includes(teamA) && names.includes(teamB);
    });
    if (!ev) return { played: 0, note: "No fixture found for H2H lookup." };
    const sum = await getEspnMatch(ev.id);
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

// --- Build who has advanced + auto-fill next-round pairings ----------------
// ESPN labels not-yet-decided fixtures with placeholders like "Winner Match 73"
// once the bracket is set. We swap those placeholders for the real team name
// as soon as that feeder match finishes — so nobody has to type anything in.
export async function buildBracket(slate) {
  const qualified = [];
  const byMatchNum = {}; // "73" -> winning team name

  for (const g of slate.filter((x) => x.state === "post")) {
    let winner = null;
    if (g.homeScore > g.awayScore) winner = g.home;
    else if (g.awayScore > g.homeScore) winner = g.away;
    // shootout winners: ESPN usually still reflects it in home/awayScore
    // after penalties; if scores are still level here, leave winner unresolved.
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

  const r16 = slate
    .filter((g) => g.round && /round of 16/i.test(g.round))
    .map((g) => ({
      a: resolvePlaceholder(g.home), b: resolvePlaceholder(g.away),
      city: g.city, stad: g.venue,
      when: new Date(g.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
      // only "clickable" in the UI once both sides are real team names
      decided: !/Winner|TBD/i.test(`${g.home}${g.away}`),
    }));

  return { qualified: [...new Set(qualified)], r16 };
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

// --- Kalshi (public markets GET). Confirm the ticker on kalshi.com ---------
export async function getKalshi(eventTicker) {
  try {
    const res = await fetch(
      `https://api.elections.kalshi.com/trade-api/v2/markets?event_ticker=${eventTicker}`,
      { headers: { accept: "application/json" }, cache: "no-store" }
    );
    const data = await res.json();
    return (data.markets || []).map((m) => ({
      label: m.yes_sub_title || m.title,
      prob: ((m.yes_bid + m.yes_ask) / 2) / 100,
    }));
  } catch {
    return [];
  }
}
