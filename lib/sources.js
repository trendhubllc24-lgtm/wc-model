const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";

// --- ESPN: upcoming fixtures, venues, scores, moneylines -------------------
export async function getEspnSlate() {
  const res = await fetch(`${ESPN_BASE}/scoreboard`, { cache: "no-store" });
  const data = await res.json();
  return (data.events || []).map((ev) => {
    const comp = ev.competitions?.[0] || {};
    const [home, away] = comp.competitors || [];
    const odds = comp.odds?.[0] || {};
    return {
      id: ev.id,
      date: ev.date,
      state: comp.status?.type?.state, // "pre" | "in" | "post"
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
    };
  });
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

// --- Build who has advanced (extend with a fixed bracket map if you want) ---
export async function buildBracket(slate) {
  const qualified = [];
  for (const g of slate.filter((x) => x.state === "post")) {
    if (g.homeScore > g.awayScore) qualified.push(g.home);
    else if (g.awayScore > g.homeScore) qualified.push(g.away);
  }
  return { qualified: [...new Set(qualified)], r16: [] };
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
