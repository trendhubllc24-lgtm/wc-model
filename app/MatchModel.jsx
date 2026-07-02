"use client";
import { useState, useMemo, useEffect } from "react";

/* ================================================================== */
/*  TEAM RATINGS  (approximate pre-tournament Elo, editable in UI)     */
/* ================================================================== */
const TEAMS = [
  ["🇦🇷", "Argentina", 2100], ["🇫🇷", "France", 2085], ["🇪🇸", "Spain", 2075],
  ["🇧🇷", "Brazil", 2020], ["🏴󠁧󠁢󠁥󠁮󠁧󠁿", "England", 2010], ["🇵🇹", "Portugal", 2000],
  ["🇳🇱", "Netherlands", 1990], ["🇩🇪", "Germany", 1960], ["🇮🇹", "Italy", 1935],
  ["🇧🇪", "Belgium", 1930], ["🇭🇷", "Croatia", 1900], ["🇺🇾", "Uruguay", 1895],
  ["🇨🇴", "Colombia", 1885], ["🇲🇦", "Morocco", 1870], ["🇨🇭", "Switzerland", 1855],
  ["🇩🇰", "Denmark", 1850], ["🇸🇳", "Senegal", 1840], ["🇯🇵", "Japan", 1835],
  ["🇳🇴", "Norway", 1835], ["🇺🇸", "USA", 1830], ["🇪🇨", "Ecuador", 1815],
  ["🇲🇽", "Mexico", 1810], ["🇸🇪", "Sweden", 1810], ["🇷🇸", "Serbia", 1800],
  ["🇦🇹", "Austria", 1800], ["🇹🇷", "Türkiye", 1795], ["🇰🇷", "Korea Rep.", 1790],
  ["🇺🇦", "Ukraine", 1785], ["🇳🇬", "Nigeria", 1780], ["🇩🇿", "Algeria", 1780],
  ["🇵🇱", "Poland", 1770], ["🇨🇮", "Ivory Coast", 1765], ["🇨🇦", "Canada", 1765],
  ["🇮🇷", "Iran", 1760], ["🇵🇾", "Paraguay", 1750], ["🇦🇺", "Australia", 1750],
  ["🇪🇬", "Egypt", 1745], ["🇬🇭", "Ghana", 1720], ["🇻🇪", "Venezuela", 1720],
  ["🇧🇦", "Bosnia", 1720], ["🇨🇩", "Congo DR", 1685], ["🇨🇷", "Costa Rica", 1685],
  ["🇵🇦", "Panama", 1680], ["🇸🇦", "Saudi Arabia", 1675], ["🇶🇦", "Qatar", 1655],
  ["🇺🇿", "Uzbekistan", 1630], ["🇯🇴", "Jordan", 1625], ["🇨🇻", "Cape Verde", 1615],
  ["🇭🇹", "Haiti", 1550], ["🇳🇿", "New Zealand", 1520], ["🇨🇼", "Curaçao", 1500],
].map(([flag, name, elo]) => ({ flag, name, elo })).sort((a, b) => a.name.localeCompare(b.name));
// ESPN sometimes uses a different name than our list (e.g. "United States"
// instead of "USA"). This maps the common variants so a live match always
// resolves — and byName() never returns undefined, so a mismatched name can
// never crash the page.
const NAME_ALIASES = {
  "United States": "USA", "USMNT": "USA",
  "Bosnia and Herzegovina": "Bosnia", "Bosnia-Herzegovina": "Bosnia",
  "Korea Republic": "Korea Rep.", "South Korea": "Korea Rep.",
  "IR Iran": "Iran", "Côte d'Ivoire": "Ivory Coast", "Cote d'Ivoire": "Ivory Coast",
  "DR Congo": "Congo DR", "Congo DR": "Congo DR", "Congo-Kinshasa": "Congo DR",
  "Türkiye": "Türkiye", "Turkey": "Türkiye",
  "England": "England", "Saudi Arabia": "Saudi Arabia",
};
const norm = (n) => NAME_ALIASES[n] || n;
const byName = (n) => TEAMS.find((t) => t.name === norm(n)) || { flag: "🏳️", name: n, elo: 1700 };
const flag = (n) => byName(n).flag;
// Display helper: show our short canonical name ("USA") whenever we recognize
// the team, even if the raw source text was longer ("United States").
const disp = (n) => { const t = TEAMS.find((x) => x.name === norm(n)); return t ? t.name : n; };

/* KEY SCORERS: ["name", share of team's expected goals] */
const SCORERS = {
  Argentina: [["Messi", 0.26], ["J. Álvarez", 0.20], ["L. Martínez", 0.18], ["Almada", 0.08]],
  France: [["Mbappé", 0.34], ["Dembélé", 0.16], ["Olise", 0.12], ["Kolo Muani", 0.10], ["Thuram", 0.08]],
  Spain: [["Yamal", 0.16], ["Oyarzabal", 0.16], ["Ferran Torres", 0.14], ["Morata", 0.12], ["Pedri", 0.08]],
  Brazil: [["Vinícius Jr", 0.22], ["Cunha", 0.14], ["Rodrygo", 0.14], ["Raphinha", 0.14], ["Igor Thiago", 0.10]],
  England: [["Kane", 0.32], ["Saka", 0.14], ["Bellingham", 0.12], ["Foden", 0.10]],
  Portugal: [["Ronaldo", 0.22], ["B. Fernandes", 0.16], ["Leão", 0.14], ["J. Félix", 0.10]],
  Netherlands: [["Gakpo", 0.20], ["Depay", 0.18], ["Simons", 0.12], ["Reijnders", 0.10]],
  Germany: [["Undav", 0.18], ["Wirtz", 0.16], ["Havertz", 0.14], ["Musiala", 0.12]],
  Belgium: [["Lukaku", 0.28], ["De Bruyne", 0.16], ["Trossard", 0.16], ["Doku", 0.10], ["Openda", 0.10]],
  Croatia: [["Kramarić", 0.18], ["Budimir", 0.16], ["Baturina", 0.10], ["Perišić", 0.10]],
  Uruguay: [["Núñez", 0.22], ["De Arrascaeta", 0.12], ["Valverde", 0.12], ["Pellistri", 0.10]],
  Colombia: [["L. Díaz", 0.24], ["J. Córdoba", 0.16], ["J. Rodríguez", 0.12], ["Muñoz", 0.08]],
  Morocco: [["En-Nesyri", 0.18], ["Saibari", 0.18], ["B. Díaz", 0.12], ["Ziyech", 0.12]],
  Switzerland: [["Embolo", 0.20], ["Ndoye", 0.14], ["Vargas", 0.12], ["Amdouni", 0.10]],
  Senegal: [["I. Sarr", 0.22], ["N. Jackson", 0.18], ["Mané", 0.16], ["Ndiaye", 0.12]],
  Japan: [["Ueda", 0.16], ["Kubo", 0.16], ["Mitoma", 0.14], ["Dōan", 0.12]],
  Norway: [["Haaland", 0.40], ["Sørloth", 0.14], ["Nusa", 0.10]],
  USA: [["Balogun", 0.22], ["Pulisic", 0.20], ["Weah", 0.10], ["Reyna", 0.10]],
  Ecuador: [["E. Valencia", 0.26], ["Páez", 0.12], ["K. Rodríguez", 0.10]],
  Mexico: [["R. Jiménez", 0.22], ["S. Giménez", 0.18], ["Lozano", 0.12]],
  Sweden: [["Isak", 0.30], ["Gyökeres", 0.24], ["Kulusevski", 0.12]],
  Austria: [["Arnautović", 0.18], ["Baumgartner", 0.14], ["Gregoritsch", 0.12], ["Sabitzer", 0.10]],
  Nigeria: [["Osimhen", 0.30], ["Lookman", 0.18], ["Chukwueze", 0.12]],
  Algeria: [["Amoura", 0.20], ["Mahrez", 0.18], ["Bounedjah", 0.12]],
  Canada: [["J. David", 0.28], ["Larin", 0.16], ["Buchanan", 0.10]],
  Ghana: [["Kudus", 0.20], ["J. Ayew", 0.16], ["Semenyo", 0.14]],
  Paraguay: [["Sanabria", 0.20], ["Almirón", 0.14], ["Enciso", 0.12]],
  Egypt: [["Salah", 0.34], ["Marmoush", 0.16], ["Trezeguet", 0.10]],
  Australia: [["Duke", 0.18], ["Boyle", 0.12], ["Irankunda", 0.12]],
};
const CREATORS = {
  "De Bruyne": 0.24, Messi: 0.22, "B. Fernandes": 0.18, "J. Rodríguez": 0.18, Yamal: 0.18,
  Olise: 0.16, Kulusevski: 0.16, Ziyech: 0.16, "De Arrascaeta": 0.16, Simons: 0.16, Wirtz: 0.18,
  Mahrez: 0.16, Mané: 0.14, Kudus: 0.14, Raphinha: 0.14, Pedri: 0.14, Reyna: 0.14, Pulisic: 0.14,
  Almirón: 0.14, Bellingham: 0.12, Saka: 0.12, Mitoma: 0.12, Kubo: 0.12, Trossard: 0.10,
};

/* ---- TOURNAMENT SNAPSHOT (static in this build; backend replaces live) ---- */
const SNAPSHOT = {
  asOf: "Jun 30, 2026",
  winner: [["🇫🇷 France", 23, 20], ["🇦🇷 Argentina", 22, 16], ["🇪🇸 Spain", 11, 11], ["🏴󠁧󠁢󠁥󠁮󠁧󠁿 England", 10, 10], ["🇧🇷 Brazil", 6, 7]],
  boot: [["🇦🇷 Messi", 53], ["🇫🇷 Mbappé", 26], ["🇧🇷 Vinícius Jr", 6], ["🇳🇴 Haaland", 5]],
  note: "Germany and Netherlands are out. Round of 32 in progress.",
};
const SCHEDULE = [
  { day: "Wed Jul 1", time: "12:00 ET", a: "England", b: "Congo DR", city: "Atlanta", stad: "Mercedes-Benz Stadium", round: "Round of 32" },
  { day: "Wed Jul 1", time: "4:00 ET", a: "Belgium", b: "Senegal", city: "Seattle", stad: "Lumen Field", round: "Round of 32" },
  { day: "Wed Jul 1", time: "8:00 ET", a: "USA", b: "Bosnia", city: "Santa Clara", stad: "Levi's Stadium", round: "Round of 32" },
  { day: "Thu Jul 2", time: "3:00 ET", a: "Spain", b: "Austria", city: "Los Angeles", stad: "SoFi Stadium", round: "Round of 32" },
  { day: "Thu Jul 2", time: "7:00 ET", a: "Portugal", b: "Croatia", city: "Toronto", stad: "BMO Field", round: "Round of 32" },
  { day: "Fri Jul 3", time: "11:00 ET", a: "Switzerland", b: "Algeria", city: "Vancouver", stad: "BC Place", round: "Round of 32" },
  { day: "Fri Jul 3", time: "2:00 ET", a: "Australia", b: "Egypt", city: "Dallas", stad: "AT&T Stadium", round: "Round of 32" },
  { day: "Fri Jul 3", time: "6:00 ET", a: "Argentina", b: "Cape Verde", city: "Miami", stad: "Hard Rock Stadium", round: "Round of 32" },
  { day: "Sat Jul 4", time: "9:30 ET", a: "Colombia", b: "Ghana", city: "Kansas City", stad: "Arrowhead Stadium", round: "Round of 32" },
];
const R16_QUALIFIED = ["France", "Brazil", "Norway", "Mexico", "Paraguay", "Morocco"];
const R16_FIXTURES = [
  { a: "Norway", b: "Brazil", city: "New York/NJ", stad: "MetLife Stadium", when: "Sun Jul 5" },
];
const HEAD2HEAD = {
  "Belgium|Senegal": { played: 0, note: "These two have never met at senior level — a true first meeting." },
};
const h2hKey = (a, b) => [a, b].sort().join("|");

/* ================================================================== */
/*  MODEL MATH                                                         */
/* ================================================================== */
const HOME_ADV = 60, RHO = -0.08, DIV = 200, MAXG = 8;
function factorial(n) { let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; }
function poisson(k, l) { return Math.exp(-l) * Math.pow(l, k) / factorial(k); }
function deriveLambdas(rA, rB, venue) {
  let diff = rA - rB;
  if (venue === "A") diff += HOME_ADV;
  if (venue === "B") diff -= HOME_ADV;
  const sup = Math.max(-3.2, Math.min(3.2, diff / DIV));
  const qAdj = Math.max(-0.15, Math.min(0.7, ((rA + rB) / 2 - 1785) / 400));
  const total = 2.70 + qAdj;
  return [Math.max(0.18, (total + sup) / 2), Math.max(0.18, (total - sup) / 2), diff];
}
function tau(i, j, l, m) {
  if (i === 0 && j === 0) return 1 - l * m * RHO;
  if (i === 0 && j === 1) return 1 + l * RHO;
  if (i === 1 && j === 0) return 1 + m * RHO;
  if (i === 1 && j === 1) return 1 - RHO;
  return 1;
}
function buildGrid(l, m) {
  const g = []; let s = 0;
  for (let i = 0; i <= MAXG; i++) { g[i] = []; for (let j = 0; j <= MAXG; j++) { const p = poisson(i, l) * poisson(j, m) * tau(i, j, l, m); g[i][j] = p; s += p; } }
  for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) g[i][j] /= s;
  return g;
}
function cond(scores, f) { const sub = scores.filter(f), tot = sub.reduce((a, x) => a + x.p, 0); return sub.slice(0, 3).map((x) => ({ i: x.i, j: x.j, p: tot ? x.p / tot : 0 })); }
function summarize(grid) {
  let pA = 0, pD = 0, pB = 0, o15 = 0, o25 = 0, o35 = 0, btts = 0, sprA = 0, sprB = 0;
  let a0 = 0, a1 = 0, b0 = 0, b1 = 0, peak = { i: 0, j: 0, p: 0 };
  const scores = [], margA = Array(MAXG + 1).fill(0), margB = Array(MAXG + 1).fill(0), tot = Array(2 * MAXG + 1).fill(0);
  for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) {
    const p = grid[i][j];
    if (i > j) pA += p; else if (i < j) pB += p; else pD += p;
    if (i + j >= 2) o15 += p; if (i + j >= 3) o25 += p; if (i + j >= 4) o35 += p;
    if (i > 0 && j > 0) btts += p;
    if (i - j >= 2) sprA += p; if (j - i >= 2) sprB += p;
    if (i === 0) a0 += p; if (i === 1) a1 += p; if (j === 0) b0 += p; if (j === 1) b1 += p;
    margA[i] += p; margB[j] += p; tot[i + j] += p;
    if (p > peak.p) peak = { i, j, p };
    if (i <= 6 && j <= 6) scores.push({ i, j, p });
  }
  scores.sort((a, b) => b.p - a.p);
  return {
    pA, pD, pB, o15, o25, o35, btts, sprA, sprB, peak, margA, margB, tot,
    aOver05: 1 - a0, aOver15: 1 - a0 - a1, bOver05: 1 - b0, bOver15: 1 - b0 - b1,
    csA: b0, csB: a0, top: scores.slice(0, 6),
    condWin: cond(scores, (x) => x.i > x.j), condDraw: cond(scores, (x) => x.i === x.j), condLoss: cond(scores, (x) => x.i < x.j),
  };
}
function samplePoisson(l) { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= Math.random(); } while (p > L); return k - 1; }
function monteCarloAdvance(l, m, diff, n = 20000) {
  let advA = 0; const pS = 0.5 + Math.max(-0.12, Math.min(0.12, diff / 5000));
  for (let s = 0; s < n; s++) {
    let a = samplePoisson(l), b = samplePoisson(m);
    if (a === b) { a += samplePoisson(l / 3); b += samplePoisson(m / 3); }
    if (a > b) advA++; else if (a === b && Math.random() < pS) advA++;
  }
  return advA / n;
}
const anytime = (xg, share) => 1 - Math.exp(-xg * share);
const brace = (mu) => 1 - Math.exp(-mu) * (1 + mu);
function impliedProb(str) { const v = parseFloat(str); if (!str || isNaN(v)) return null; return v >= 0 ? 100 / (v + 100) : -v / (-v + 100); }
function fairAmerican(p) { if (p <= 0.001 || p >= 0.999) return "—"; return p > 0.5 ? "-" + Math.round(100 * p / (1 - p)) : "+" + Math.round(100 * (1 - p) / p); }
const overFrom = (arr, line) => { let s = 0; for (let k = Math.ceil(line); k < arr.length; k++) s += arr[k]; return s; };

/* ================================================================== */
/*  COMPONENT                                                          */
/* ================================================================== */
const MINT = "#4FD8B0", CORAL = "#FF6B5C", AMBER = "#F2C14E";
const p1 = (x) => (x * 100).toFixed(1) + "%";

// 2026 World Cup host cities → host nation, used to auto-detect home advantage.
// A team only gets "home" status if it's one of the three co-hosts AND the
// fixture is actually being played in that host nation.
const CITY_COUNTRY = {
  Atlanta: "USA", Seattle: "USA", "Santa Clara": "USA", "Los Angeles": "USA",
  Miami: "USA", "Kansas City": "USA", Dallas: "USA", "East Rutherford": "USA",
  Foxborough: "USA", Philadelphia: "USA", Houston: "USA", "San Francisco Bay Area": "USA",
  "New York/NJ": "USA", "Inglewood": "USA",
  Toronto: "Canada", Vancouver: "Canada",
  "Mexico City": "Mexico", Guadalajara: "Mexico", Monterrey: "Mexico",
};
const HOST_TEAMS = ["USA", "Canada", "Mexico"];
function autoVenue(city, tA, tB) {
  const country = CITY_COUNTRY[city];
  if (!country) return "neutral";
  if (tA === country && HOST_TEAMS.includes(tA)) return "A";
  if (tB === country && HOST_TEAMS.includes(tB)) return "B";
  return "neutral";
}

export default function MatchModel() {
  const [teamA, setA] = useState("Belgium");
  const [teamB, setB] = useState("Senegal");
  const [rA, setRA] = useState(byName("Belgium").elo);
  const [rB, setRB] = useState(byName("Senegal").elo);
  const [mode, setMode] = useState("knockout");
  const [tab, setTab] = useState("risk");
  const [ttab, setTtab] = useState("upcoming");
  const [matchCity, setMatchCity] = useState(null);
  const [mktAuto, setMktAuto] = useState(null); // ESPN's real odds for the loaded fixture, auto-filled
  const [nonce, setNonce] = useState(0);
  const [trackFilter, setTrackFilter] = useState("all");
  const [expandedMatch, setExpandedMatch] = useState(null);
  const [refreshed, setRefreshed] = useState(null);
  const [live, setLive] = useState(null);
  const [feed, setFeed] = useState("offline"); // offline | live | loading

  // risk lab state
  const [bet, setBet] = useState("winA");
  const [si, setSi] = useState(2); const [sj, setSj] = useState(1);
  const [ouLine, setOuLine] = useState(2.5); const [ouSide, setOuSide] = useState("over");
  const [ttTeam, setTtTeam] = useState("A"); const [ttLine, setTtLine] = useState(1.5);
  const [player, setPlayer] = useState("");

  const pickA = (n) => { const nn = norm(n); setA(nn); setRA(byName(nn).elo); };
  const pickB = (n) => { const nn = norm(n); setB(nn); setRB(byName(nn).elo); };
  const loadFixture = (fx) => {
    pickA(fx.a); pickB(fx.b);
    setMatchCity(fx.city || null);
    setMode(fx.round && /group/i.test(fx.round) ? "group" : "knockout");
    setMktAuto((fx.homeML || fx.drawML || fx.awayML || fx.overUnder)
      ? { a: fx.homeML, d: fx.drawML, b: fx.awayML, o25: fx.overUnder } : null);
    setTab("risk");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const A = byName(teamA), B = byName(teamB);
  // Venue auto-derives from the loaded fixture's city — nothing to pick manually.
  const venue = autoVenue(matchCity, teamA, teamB);

  // ---- backend wiring: pull live snapshot on load, then keep polling ----
  // A one-time fetch alone means the Live Prediction Tracker only updates
  // when someone reloads the page or hits Refresh. Polling every 60s picks
  // up newly-graded predictions (and bracket progress) automatically as
  // soon as the backend's frequent track-sync job runs.
  useEffect(() => {
    let ok = true;
    const pull = (first) => {
      if (first) setFeed("loading");
      fetch("/api/snapshot").then((r) => (r.ok ? r.json() : null)).then((d) => {
        if (ok && d && d.winner) { setLive(d); setFeed("live"); } else if (first) setFeed("offline");
      }).catch(() => { if (ok && first) setFeed("offline"); });
    };
    pull(true);
    const id = setInterval(() => pull(false), 60000);
    return () => { ok = false; clearInterval(id); };
  }, []);

  // ---- live scores: sync real ESPN data every 10s, ANCHOR a per-second ----
  // clock in between syncs. ESPN's own data doesn't change every second (their
  // game clock updates roughly every 15-30s), so polling them once a second
  // wouldn't get fresher data — it would just hammer their servers for
  // nothing and risk getting the site rate-limited. Instead: sync real data
  // every 10s, and tick a local clock every 1s in between so the live win
  // probability visibly moves every second, always corrected by the next
  // real sync.
  const [liveGames, setLiveGames] = useState([]);
  const [syncedAt, setSyncedAt] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let ok = true;
    const pull = () => fetch("/api/live").then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (ok && d && d.live) { setLiveGames(d.live); setSyncedAt(Date.now()); } }).catch(() => {});
    pull();
    const id = setInterval(pull, 10000);
    return () => { ok = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (liveGames.length === 0) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [liveGames.length]);

  const M = useMemo(() => {
    const [lA, lB, diff] = deriveLambdas(rA, rB, venue);
    const grid = buildGrid(lA, lB);
    const s = summarize(grid);
    return { lA, lB, diff, grid, s };
    // eslint-disable-next-line
  }, [rA, rB, venue, mode, nonce]);
  const { lA, lB, diff, grid, s } = M;

  // Monte Carlo involves Math.random() — run it client-side only, after mount,
  // so the server-rendered HTML and the browser's first render always match.
  const [advA, setAdvA] = useState(null);
  useEffect(() => {
    if (mode === "knockout") setAdvA(monteCarloAdvance(lA, lB, diff));
    else setAdvA(null);
  }, [lA, lB, diff, mode]);

  // If the loaded matchup is currently being played, recompute win probability
  // live from the CURRENT score + time remaining instead of the pre-match read.
  // minutesPlayed advances every second locally (from `tick`), anchored to the
  // real ESPN clock at the last sync — so it's live-feeling but never drifts
  // far from the truth before the next 10s correction.
  const liveMatch = liveGames.find((g) => (norm(g.a) === teamA && norm(g.b) === teamB) || (norm(g.a) === teamB && norm(g.b) === teamA));
  const liveModel = useMemo(() => {
    if (!liveMatch) return null;
    const flipped = liveMatch.a === teamB; // ESPN's home/away may not match our A/B order
    const curA = flipped ? liveMatch.bScore : liveMatch.aScore;
    const curB = flipped ? liveMatch.aScore : liveMatch.bScore;
    const baseMinute = (liveMatch.period === 2 ? 45 : 0) + (parseInt(liveMatch.clock) || 0);
    const secsSinceSync = syncedAt ? (Date.now() - syncedAt) / 1000 : 0;
    const minutesPlayed = Math.min(90, baseMinute + secsSinceSync / 60);
    const fracLeft = Math.max(0.02, (90 - minutesPlayed) / 90);
    const rlA = lA * fracLeft, rlB = lB * fracLeft;      // remaining expected goals
    const rGrid = buildGrid(Math.max(0.05, rlA), Math.max(0.05, rlB));
    // Shift the remaining-time grid by the current score to get a full
    // final-score grid — same shape as the pre-match `grid`, so every Risk
    // Lab bet type (exact score, over/under, margins, team totals...) can
    // use this directly instead of just the three-way win/draw/loss split.
    const liveGrid = [];
    for (let i = 0; i <= MAXG; i++) { liveGrid[i] = []; for (let j = 0; j <= MAXG; j++) liveGrid[i][j] = 0; }
    for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) {
      const fi = curA + i, fj = curB + j;
      if (fi <= MAXG && fj <= MAXG) liveGrid[fi][fj] += rGrid[i][j];
      // scores beyond the grid's max are vanishingly rare; safe to drop
    }
    const liveS = summarize(liveGrid);
    let pA = 0, pD = 0, pB = 0;
    for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) {
      const fi = curA + i, fj = curB + j, p = rGrid[i][j];
      if (fi > fj) pA += p; else if (fi < fj) pB += p; else pD += p;
    }
    const liveClock = `${Math.floor(minutesPlayed)}'`;
    return { curA, curB, minutesPlayed, pA, pD, pB, clock: liveClock, liveGrid, liveS, remA: rlA, remB: rlB };
    // eslint-disable-next-line
  }, [liveMatch, lA, lB, tick]);

  const refresh = () => {
    setNonce((n) => n + 1);
    setRefreshed(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    setFeed("loading");
    fetch("/api/refresh").then((r) => r.json()).then(() => fetch("/api/snapshot")).then((r) => r.json())
      .then((d) => { if (d && d.winner) { setLive(d); setFeed("live"); } else setFeed("offline"); })
      .catch(() => setFeed("offline"));
  };

  const snap = live || SNAPSHOT;
  const schedule = (live && live.schedule) || SCHEDULE;
  const qualified = (live && live.qualified) || R16_QUALIFIED;
  const r16fx = (live && live.r16) || R16_FIXTURES;
  const qfFx = (live && live.qf) || [];
  const sfFx = (live && live.sf) || [];
  const thirdFx = (live && live.third) || [];
  const finalFx = (live && live.final) || [];

  const venueLabel = venue === "A" ? `${A.name} home` : venue === "B" ? `${B.name} home` : "neutral";
  const call = s.pA > s.pB && s.pA > s.pD ? A.name : s.pB > s.pA && s.pB > s.pD ? B.name : "too close";
  const mk = mktAuto
    ? { a: impliedProb(mktAuto.a), d: impliedProb(mktAuto.d), b: impliedProb(mktAuto.b), o25: impliedProb(mktAuto.o25), adv: null }
    : { a: null, d: null, b: null, o25: null, adv: null };
  const edge = (model, m) => (m == null ? "" : `  market ${Math.round(m * 100)}%  edge ${(model * 100 - m * 100 >= 0 ? "+" : "")}${(model * 100 - m * 100).toFixed(1)}`);

  const Lr = (label, val, extra = "") => `${label.padEnd(20)}${p1(val).padStart(6)}${extra}`;
  const readout =
`============================================================
 PREDICTION: ${A.name} vs ${B.name}
 venue: ${venueLabel}
============================================================

 expected goals   ${A.name}: ${lA.toFixed(2)}   ${B.name}: ${lB.toFixed(2)}

${Lr(` ${A.name} win`, s.pA)}
${Lr(" draw", s.pD)}
${Lr(` ${B.name} win`, s.pB)}

 most likely scores:
${s.top.slice(0, 5).map((x) => `    ${A.name} ${x.i}-${x.j} ${B.name}  (${p1(x.p)})`).join("\n")}

 >>> model call: ${call}

 ---------------- MODEL PROPS ----------------
 regulation result (90 min)
${Lr(` ${A.name} win`, s.pA, edge(s.pA, mk.a))}
${Lr(" draw", s.pD, edge(s.pD, mk.d))}
${Lr(` ${B.name} win`, s.pB, edge(s.pB, mk.b))}
${mode === "knockout" ? `
 who advances (incl. ET/pens)
${Lr(` ${A.name} advances`, advA, edge(advA, mk.adv))}
${Lr(` ${B.name} advances`, 1 - advA)}
` : ""}
 total goals (regulation)
${Lr(" over 1.5", s.o15)}
${Lr(" over 2.5", s.o25, edge(s.o25, mk.o25))}
${Lr(" over 3.5", s.o35)}

 team totals (regulation)
${Lr(` ${A.name} over 0.5`, s.aOver05)}
${Lr(` ${A.name} over 1.5`, s.aOver15)}
${Lr(` ${B.name} over 0.5`, s.bOver05)}
${Lr(` ${B.name} over 1.5`, s.bOver15)}`;

  const scorersA = (SCORERS[teamA] || []).map(([n, sh]) => ({ n, p: anytime(lA, sh) })).sort((a, b) => b.p - a.p);
  const scorersB = (SCORERS[teamB] || []).map(([n, sh]) => ({ n, p: anytime(lB, sh) })).sort((a, b) => b.p - a.p);
  const maxCell = s.peak.p;

  const playersPool = [
    ...(SCORERS[teamA] || []).map(([n, sh]) => ({ n, team: teamA, tag: "A", xg: lA, share: sh })),
    ...(SCORERS[teamB] || []).map(([n, sh]) => ({ n, team: teamB, tag: "B", xg: lB, share: sh })),
  ];
  const selPlayer = playersPool.find((p) => p.n === player) || playersPool[0];

  // Whenever the loaded matchup is actually live, every Risk Lab bet resolves
  // off the live-adjusted grid/summary (current score + time remaining) —
  // ticking every second — instead of the frozen pre-match numbers.
  const activeGrid = liveMatch ? liveModel.liveGrid : grid;
  const activeS = liveMatch ? liveModel.liveS : s;
  const activeAdvA = liveMatch ? liveModel.pA : advA; // regulation-only during live; ET/pens layer applies pre-match
  const xgA = liveMatch ? liveModel.remA : lA;
  const xgB = liveMatch ? liveModel.remB : lB;

  function resolveBet() {
    switch (bet) {
      case "winA": return { p: activeS.pA, title: `${A.name} win (90')` };
      case "draw": return { p: activeS.pD, title: "Draw (90')" };
      case "winB": return { p: activeS.pB, title: `${B.name} win (90')` };
      case "dcA": return { p: activeS.pA + activeS.pD, title: `${A.name} win or draw` };
      case "dcB": return { p: activeS.pB + activeS.pD, title: `${B.name} win or draw` };
      case "advA": return { p: activeAdvA ?? activeS.pA, title: `${A.name} to advance` };
      case "advB": return { p: activeAdvA != null ? 1 - activeAdvA : activeS.pB, title: `${B.name} to advance` };
      case "exact": return { p: (activeGrid[si] && activeGrid[si][sj]) || 0, title: `Exact score ${A.name} ${si}-${sj} ${B.name}` };
      case "ou": { const o = overFrom(activeS.tot, ouLine); return { p: ouSide === "over" ? o : 1 - o, title: `${ouSide === "over" ? "Over" : "Under"} ${ouLine} total goals` }; }
      case "btts": return { p: activeS.btts, title: "Both teams to score — yes" };
      case "bttsNo": return { p: 1 - activeS.btts, title: "Both teams to score — no" };
      case "tt": { const arr = ttTeam === "A" ? activeS.margA : activeS.margB; const tn = ttTeam === "A" ? A.name : B.name; return { p: overFrom(arr, ttLine), title: `${tn} over ${ttLine} goals` }; }
      case "marginA": return { p: activeS.sprA, title: `${A.name} to win by 2+` };
      case "marginB": return { p: activeS.sprB, title: `${B.name} to win by 2+` };
      case "pScore": { const xg = selPlayer.tag === "A" ? xgA : xgB; return { p: anytime(xg, selPlayer.share), title: `${selPlayer.n} to score anytime${liveMatch ? " (rest of match)" : ""}` }; }
      case "pBrace": { const xg = selPlayer.tag === "A" ? xgA : xgB; const mu = xg * selPlayer.share; return { p: brace(mu), title: `${selPlayer.n} to score 2+${liveMatch ? " (rest of match)" : ""}` }; }
      case "pAssist": { const xg = selPlayer.tag === "A" ? xgA : xgB; const aS = CREATORS[selPlayer.n] ?? 0.08; return { p: anytime(xg, aS), title: `${selPlayer.n} to record an assist${liveMatch ? " (rest of match)" : ""}`, approx: true }; }
      default: return { p: 0, title: "" };
    }
  }
  const R = resolveBet();
  const risk = 1 - R.p;
  const band = R.p >= 0.65 ? { l: "Safe", c: MINT } : R.p >= 0.40 ? { l: "Moderate", c: AMBER } : { l: "High risk", c: CORAL };
  // Auto-pick the matching real market line for whichever bet is selected —
  // no typing required. Only a few bet types have a direct ESPN market to
  // compare against; the rest just won't show an edge, which is honest.
  const autoBetOdds = (() => {
    if (!mktAuto) return null;
    if (bet === "winA") return mktAuto.a;
    if (bet === "draw") return mktAuto.d;
    if (bet === "winB") return mktAuto.b;
    if (bet === "ou" && ouSide === "over" && ouLine === 2.5) return mktAuto.o25;
    return null;
  })();
  const bImp = impliedProb(autoBetOdds);
  const bEdge = bImp == null ? null : R.p - bImp;
  const bProfit = autoBetOdds ? (parseFloat(autoBetOdds) >= 0 ? parseFloat(autoBetOdds) / 100 : 100 / -parseFloat(autoBetOdds)) : null;
  const bEV = bProfit == null ? null : R.p * bProfit - (1 - R.p);

  const h2h = HEAD2HEAD[h2hKey(teamA, teamB)] || (live && live.h2h && live.h2h[h2hKey(teamA, teamB)]);

  const css = `
  @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
  .wcm *{box-sizing:border-box;margin:0;padding:0}
  .wcm{--bg:#0B1E24;--surf:#122C33;--surf2:#183840;--line:#22505a;--ink:#EAF2EE;--dim:#8FB0AE;
    --mint:${MINT};--coral:${CORAL};--amber:${AMBER};background:var(--bg);color:var(--ink);
    min-height:100vh;font-family:'Space Grotesk',system-ui,sans-serif;padding:22px 14px 60px;
    background-image:radial-gradient(circle at 50% -8%,#12333a 0%,var(--bg) 46%)}
  .wrap{max-width:820px;margin:0 auto}
  .layout{display:grid;grid-template-columns:1fr 360px;gap:20px;align-items:start;margin-top:20px}
  .main{min-width:0}
  .side{position:sticky;top:20px;min-width:0}
  @media(max-width:980px){.side{position:static}}
  .livesticky{}
  @media(max-width:980px){.layout{grid-template-columns:1fr}.side{position:static}}
  .eyebrow{font-family:'Space Mono',monospace;font-size:11px;letter-spacing:.28em;color:var(--mint);text-transform:uppercase;margin-bottom:8px}
  .title{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:clamp(32px,8.5vw,54px);line-height:.92;letter-spacing:-.02em}
  .lede{color:var(--dim);margin-top:12px;max-width:55ch;font-size:15px;line-height:1.5}
  .credit{font-family:'Space Mono',monospace;font-size:11px;color:var(--dim);margin-top:10px;line-height:1.6}
  .card{background:var(--surf);border:1px solid var(--line);border-radius:16px;padding:18px;margin-top:20px}
  .liveempty{opacity:.6;background:var(--surf2)}
  .snaphead{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:6px}
  .snaphead h3{font-family:'Space Mono';font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--amber);font-weight:700}
  .feedtag{font-family:'Space Mono';font-size:10px;letter-spacing:.1em;padding:3px 8px;border-radius:999px;border:1px solid var(--line)}
  .refresh{background:var(--mint);color:#08181c;border:none;border-radius:9px;padding:9px 14px;font-family:'Space Grotesk';font-weight:700;font-size:13px;cursor:pointer}
  .subtabs{display:flex;gap:6px;margin:14px 0 4px;flex-wrap:wrap}
  .subtabs button{background:var(--surf2);border:1px solid var(--line);color:var(--dim);border-radius:8px;padding:7px 13px;font-family:'Space Grotesk';font-weight:600;font-size:12.5px;cursor:pointer}
  .subtabs button.on{background:var(--line);color:var(--ink)}
  .snapgrid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:12px}
  .snapcol h5{font-family:'Space Mono';font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);margin-bottom:9px}
  .srow{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:7px;font-size:13.5px}
  .srow .mono{font-family:'Space Mono';font-size:12px;color:var(--dim)}
  .srow .mono b{color:var(--ink)}
  .fxrow{display:flex;align-items:center;gap:10px;padding:11px 10px;border:1px solid var(--line);border-radius:11px;margin-bottom:8px;cursor:pointer;background:var(--surf2);transition:.12s}
  .fxrow:hover{border-color:var(--mint)}
  .fxrow .when{font-family:'Space Mono';font-size:11px;color:var(--dim);width:74px;flex-shrink:0;line-height:1.4}
  .fxrow .match{flex:1;font-weight:600;font-size:14px}
  .fxrow .place{font-family:'Space Mono';font-size:11px;color:var(--dim);text-align:right;line-height:1.4}
  .fxrow .go{font-family:'Space Mono';font-size:11px;color:var(--mint)}
  .brk h5{font-family:'Space Mono';font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);margin:4px 0 10px}
  .chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
  .qchip{background:var(--surf2);border:1px solid var(--line);border-radius:999px;padding:7px 13px;font-weight:600;font-size:13.5px}
  .r16row{display:flex;align-items:center;gap:10px;padding:11px 12px;border:1px solid var(--line);border-radius:11px;margin-bottom:8px;background:var(--surf2)}
  .r16row .t{flex:1;font-weight:700;font-size:14.5px;text-align:center}
  .r16row .mid{font-family:'Bricolage Grotesque';font-weight:800;color:var(--dim);font-size:13px}
  .r16row .pl{font-family:'Space Mono';font-size:11px;color:var(--dim);width:100%;text-align:center;margin-top:4px}
  .setup{display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:end}
  .fld label{display:block;font-family:'Space Mono',monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim);margin-bottom:6px}
  select{width:100%;background:var(--surf2);color:var(--ink);border:1px solid var(--line);border-radius:10px;padding:12px 10px;font-family:'Space Grotesk';font-size:15px;font-weight:600;-webkit-appearance:none;appearance:none;cursor:pointer}
  .vs{font-family:'Bricolage Grotesque';font-weight:800;color:var(--dim);font-size:18px;padding-bottom:11px}
  .controls{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;align-items:center}
  .seg{display:flex;background:var(--surf2);border:1px solid var(--line);border-radius:10px;overflow:hidden}
  .seg button{background:none;border:none;color:var(--dim);padding:9px 12px;cursor:pointer;font-family:'Space Grotesk';font-weight:600;font-size:13px}
  .seg button.on{background:var(--line);color:var(--ink)}
  .link{background:none;border:none;color:var(--mint);font-family:'Space Mono';font-size:11px;letter-spacing:.08em;cursor:pointer;padding:9px 4px}
  .bar{display:flex;height:34px;border-radius:9px;overflow:hidden;border:1px solid var(--line)}
  .bar span{display:flex;align-items:center;justify-content:center;font-family:'Space Mono';font-size:12px;font-weight:700;color:#08181c;min-width:0;
    transition:width .6s cubic-bezier(.4,0,.2,1)}
  .autotag{font-family:'Space Mono';font-size:12px;color:var(--dim);background:var(--surf2);border:1px solid var(--line);
    border-radius:999px;padding:8px 13px}
  .autoodds{font-family:'Space Mono';font-size:12.5px;color:var(--dim);background:var(--surf2);border:1px solid var(--line);
    border-radius:8px;padding:9px 10px}
  @keyframes pulseGlow{
    0%{box-shadow:0 0 0 0 rgba(255,107,92,.55)}
    60%{box-shadow:0 0 0 10px rgba(255,107,92,0)}
    100%{box-shadow:0 0 0 0 rgba(255,107,92,0)}
  }
  .pulsing{animation:pulseGlow 1.6s ease-in-out infinite}
  @keyframes dotBlink{0%,100%{opacity:1}50%{opacity:.25}}
  .livedot{display:inline-block;width:7px;height:7px;border-radius:50%;background:${CORAL};
    margin-right:6px;animation:dotBlink 1.1s ease-in-out infinite}
  .barlabels{display:flex;justify-content:space-between;margin-top:7px;font-family:'Space Mono';font-size:11px;color:var(--dim)}
  .xgrow{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:20px;flex-wrap:wrap}
  .xg{text-align:center}
  .xg .n{font-family:'Bricolage Grotesque';font-weight:800;font-size:38px;line-height:1}
  .xg .l{font-family:'Space Mono';font-size:10px;letter-spacing:.14em;color:var(--dim);text-transform:uppercase;margin-top:4px}
  .dash{color:var(--dim);font-family:'Bricolage Grotesque';font-weight:800;font-size:28px}
  .proj{font-family:'Space Mono';font-size:12px;color:var(--dim);margin-top:2px}
  .tabs{display:flex;gap:6px;margin-top:20px;flex-wrap:wrap}
  .tabs button{background:var(--surf);border:1px solid var(--line);color:var(--dim);border-radius:999px;padding:8px 15px;font-family:'Space Grotesk';font-weight:600;font-size:13px;cursor:pointer}
  .tabs button.on{background:var(--mint);color:#08181c;border-color:var(--mint)}
  pre.term{background:#060d0f;border:1px solid var(--line);border-radius:12px;padding:16px;overflow-x:auto;font-family:'Space Mono',monospace;font-size:12px;line-height:1.55;color:#dbe9e4;white-space:pre;margin-top:0}
  .scorers{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .scol h4{font-family:'Space Mono';font-size:11px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:12px;font-weight:700}
  .prow{display:flex;align-items:center;gap:10px;margin-bottom:11px}
  .prow .nm{width:104px;font-size:13.5px;font-weight:600;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .prow .tk{flex:1;height:9px;background:var(--surf2);border-radius:6px;overflow:hidden}
  .prow .fl{display:block;height:100%;border-radius:6px}
  .prow .pp{font-family:'Space Mono';font-size:12px;width:42px;text-align:right}
  .empty{color:var(--dim);font-size:13px;font-family:'Space Mono';padding:8px 0}
  .note{color:var(--dim);font-size:11px;font-family:'Space Mono';margin-top:10px;line-height:1.55}
  .matrix{display:grid;grid-template-columns:auto repeat(6,1fr);gap:3px}
  .mlab{font-family:'Space Mono';font-size:11px;color:var(--dim);display:flex;align-items:center;justify-content:center;min-height:20px}
  .cell{aspect-ratio:1;border-radius:6px;display:flex;align-items:center;justify-content:center;font-family:'Space Mono';font-size:11px;font-weight:700;color:#dff5ee}
  .cell.peak{outline:2px solid var(--amber);color:#08181c}
  .axname{display:flex;gap:8px;font-size:12px;font-family:'Space Mono';color:var(--dim);margin-top:12px;flex-wrap:wrap}
  .axname b{color:var(--ink)}
  .h2hbig{display:flex;align-items:center;justify-content:center;gap:18px;margin:6px 0 4px}
  .split{display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:stretch}
  .dualtrack{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .dualcol{border:1px solid var(--line);border-radius:14px;padding:14px;text-align:center;background:var(--surf2)}
  .dualname{font-family:'Space Mono';font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;margin-bottom:8px}
  .splitcol{border:1px solid var(--line);border-radius:14px;padding:16px;text-align:center;background:var(--surf2)}
  .splitname{font-weight:700;font-size:15px;margin-bottom:8px}
  .splitbig{font-family:'Bricolage Grotesque';font-weight:800;font-size:38px;line-height:1;
    transition:color .3s}
  .splitlab{font-family:'Space Mono';font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);margin-top:3px;margin-bottom:12px}
  .splitrow{display:flex;justify-content:space-between;font-size:12.5px;padding:5px 0;border-top:1px solid var(--line)}
  .splitrow span{color:var(--dim)}
  .splitrow b{font-family:'Space Mono';font-weight:700}
  .splitmid{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10px 6px;min-width:76px}
  .splitdash{font-family:'Bricolage Grotesque';font-weight:800;font-size:24px;color:var(--ink);margin-top:14px}
  .h2hbig .num{font-family:'Bricolage Grotesque';font-weight:800;font-size:44px;line-height:1}
  .h2hbig .lab{font-family:'Space Mono';font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);text-align:center;margin-top:4px}
  .mktgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
  .mktfld label,.rf label{display:block;font-family:'Space Mono';font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);margin-bottom:5px}
  .mktfld input,.rf input,.rf select{width:100%;background:var(--surf2);border:1px solid var(--line);border-radius:8px;color:var(--ink);padding:9px 10px;font-family:'Space Mono';font-size:13px}
  .tunerow{display:flex;align-items:center;gap:12px;margin-bottom:12px}
  .tunerow .nm2{width:130px;font-size:13px;font-weight:600;flex-shrink:0}
  .tunerow input[type=range]{flex:1;accent-color:var(--mint)}
  .tunerow .val{font-family:'Space Mono';font-size:13px;width:44px;text-align:right;color:var(--dim)}
  .rf{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .rf select,.rf input{font-family:'Space Grotesk';font-weight:600}
  .riskhead{display:flex;justify-content:space-between;align-items:center;margin-top:18px;flex-wrap:wrap;gap:8px}
  .riskhead .bt{font-size:15px;font-weight:700}
  .chip{font-family:'Space Mono';font-size:12px;font-weight:700;padding:5px 11px;border-radius:999px;color:#08181c}
  .bigp{font-family:'Bricolage Grotesque';font-weight:800;font-size:46px;line-height:1;margin-top:12px}
  .riskbar{height:14px;border-radius:8px;margin-top:14px;overflow:hidden;background:linear-gradient(90deg,#1f4a44,#3a4a2a,#4a2626)}
  .riskbar .rf2{height:100%;border-radius:8px}
  .rmeta{display:flex;justify-content:space-between;font-family:'Space Mono';font-size:11px;color:var(--dim);margin-top:6px}
  .oddsrow{display:flex;gap:20px;flex-wrap:wrap;margin-top:16px}
  .oddsrow .o .n{font-family:'Space Mono';font-weight:700;font-size:17px}
  .oddsrow .o .l{font-family:'Space Mono';font-size:10px;letter-spacing:.1em;color:var(--dim);text-transform:uppercase;margin-top:3px}
  .evbox{margin-top:14px;padding:12px;border-radius:10px;border:1px solid var(--line);background:var(--surf2);font-size:13px;line-height:1.5}
  .evbox b{font-family:'Space Mono'}
  .disc{font-family:'Space Mono';font-size:11px;color:var(--dim);line-height:1.6;margin-top:26px;text-align:center;border-top:1px solid var(--line);padding-top:18px}
  @media(max-width:560px){.snapgrid,.scorers,.mktgrid,.rf,.setup{}.snapgrid,.scorers,.mktgrid,.rf{grid-template-columns:1fr}.split{grid-template-columns:1fr}.dualtrack{grid-template-columns:1fr}.splitmid{padding:6px 0}.cell{font-size:9px}.prow .nm{width:88px}.fxrow .place{font-size:10px}}`;

  const seg = (val, cur, set, label) => <button className={cur === val ? "on" : ""} onClick={() => set(val)}>{label}</button>;
  const scorerCol = (team, list, color) => (
    <div className="scol">
      <h4 style={{ color }}>{flag(team)} {team} · anytime scorer</h4>
      {list.length === 0 ? <div className="empty">Scorer profile not loaded for {team} yet.</div>
        : list.map((p, k) => (
          <div className="prow" key={k}>
            <span className="nm">{p.n}</span>
            <span className="tk"><span className="fl" style={{ width: `${p.p * 100}%`, background: color }} /></span>
            <span className="pp" style={{ color }}>{Math.round(p.p * 100)}%</span>
          </div>
        ))}
    </div>
  );

  return (
    <div className="wcm">
      <style>{css}</style>
      <div className="wrap">
        <div className="eyebrow">World Cup 2026 · pre-kickoff model</div>
        <h1 className="title">MATCH<br />MODEL</h1>

        {/* ===================== LIVE NOW ===================== */}
        <div className={liveGames.length > 0 ? "card livesticky" : "card livesticky liveempty"} style={{ borderColor: liveGames.length > 0 ? CORAL : "var(--line)" }}>
          <div className="snaphead">
            <h3 style={{ color: liveGames.length > 0 ? CORAL : "var(--dim)" }}>{liveGames.length > 0 ? "● Live now" : "○ Live now"}</h3>
            <span className="note" style={{ margin: 0 }}>synced every 10s · live prob. ticks every second</span>
          </div>
          {liveGames.length > 0 ? (
            liveGames.map((g, k) => (
              <div className="fxrow" key={k} onClick={() => loadFixture(g)} style={{ borderColor: CORAL + "55" }}>
                <div className="when" style={{ color: CORAL, fontWeight: 700 }}>{g.clock || "LIVE"}</div>
                <div className="match">
                  {flag(g.a)} {disp(g.a)} <b>{g.aScore}</b> <span style={{ color: "var(--dim)" }}>–</span> <b>{g.bScore}</b> {disp(g.b)} {flag(g.b)}
                  <div className="go">tap for live win prob →</div>
                </div>
                <div className="place">{g.city}<br />{g.stad}</div>
              </div>
            ))
          ) : (
            <div className="empty" style={{ padding: "18px 4px", textAlign: "center" }}>No live games currently — check back when a match kicks off.</div>
          )}
        </div>


        {/* ===================== MATCH SETUP ===================== */}
        <div className="card">
          <div className="setup">
            <div className="fld"><label style={{ color: MINT }}>Team A</label>
              <select value={teamA} onChange={(e) => pickA(e.target.value)}>{TEAMS.map((t) => <option key={t.name} value={t.name}>{t.flag} {t.name}</option>)}</select></div>
            <div className="vs">vs</div>
            <div className="fld"><label style={{ color: CORAL }}>Team B</label>
              <select value={teamB} onChange={(e) => pickB(e.target.value)}>{TEAMS.map((t) => <option key={t.name} value={t.name}>{t.flag} {t.name}</option>)}</select></div>
          </div>
          <div className="controls">
            <div className="seg">{seg("group", mode, setMode, "Group (90')")}{seg("knockout", mode, setMode, "Knockout")}</div>
            <span className="autotag">
              {venue === "neutral" ? "⚖ neutral venue" : venue === "A" ? `${A.flag} ${A.name} home advantage` : `${B.flag} ${B.name} home advantage`}
              {matchCity ? ` · ${matchCity}` : ""}
            </span>
          </div>
          <div className="note" style={{ marginTop: 10, marginBottom: 0 }}>
            Ratings, venue, and market odds are pulled in automatically — ratings from the
            model's built-in strength table, venue from the fixture's host city, and market
            odds from ESPN's live sportsbook feed when that fixture has one published.
            {mktAuto ? "" : " No market odds are published for this matchup yet, so the edge comparison below is hidden until they are."}
          </div>
        </div>

        {/* headline */}
        <div className="card">
          {liveModel && (
            <div className="pulsing" style={{ marginBottom: 16, padding: 12, borderRadius: 10, border: `1px solid ${CORAL}`, background: "rgba(255,107,92,0.08)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <span style={{ fontFamily: "'Space Mono'", fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: CORAL, fontWeight: 700 }}><span className="livedot" />live · {liveModel.clock || "in play"}</span>
                <span style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: 20 }}>{A.name} {liveModel.curA} – {liveModel.curB} {B.name}</span>
              </div>
              <div className="note" style={{ marginTop: 8, marginBottom: 6 }}>Win probability recalculated from the current score + time remaining, ticking every second.</div>
              <div className="bar">
                <span style={{ width: `${liveModel.pA * 100}%`, background: MINT }}>{liveModel.pA > 0.12 ? p1(liveModel.pA) : ""}</span>
                <span style={{ width: `${liveModel.pD * 100}%`, background: "#3a5f68", color: "#dff5ee" }}>{liveModel.pD > 0.12 ? p1(liveModel.pD) : ""}</span>
                <span style={{ width: `${liveModel.pB * 100}%`, background: CORAL }}>{liveModel.pB > 0.12 ? p1(liveModel.pB) : ""}</span>
              </div>
              <div className="barlabels"><span>{A.name} win</span><span>draw</span><span>{B.name} win</span></div>
            </div>
          )}
          <div className="bar">
            <span style={{ width: `${s.pA * 100}%`, background: MINT }}>{s.pA > 0.12 ? p1(s.pA) : ""}</span>
            <span style={{ width: `${s.pD * 100}%`, background: "#3a5f68", color: "#dff5ee" }}>{s.pD > 0.12 ? p1(s.pD) : ""}</span>
            <span style={{ width: `${s.pB * 100}%`, background: CORAL }}>{s.pB > 0.12 ? p1(s.pB) : ""}</span>
          </div>
          <div className="barlabels"><span>{A.flag} {A.name} win{liveModel ? " (pre-match)" : ""}</span><span>draw</span><span>{B.name} win {B.flag}</span></div>
          <div className="xgrow">
            <div className="xg"><div className="n" style={{ color: MINT }}>{lA.toFixed(2)}</div><div className="l">{A.name} xG</div></div>
            <div style={{ textAlign: "center" }}><div className="dash">{Math.round(lA)}–{Math.round(lB)}</div><div className="proj">peak {s.peak.i}–{s.peak.j} ({Math.round(s.peak.p * 100)}%)</div></div>
            <div className="xg"><div className="n" style={{ color: CORAL }}>{lB.toFixed(2)}</div><div className="l">{B.name} xG</div></div>
          </div>
          {mode === "knockout" && advA !== null && (<div style={{ marginTop: 18 }}>
            <div className="bar"><span style={{ width: `${advA * 100}%`, background: MINT }}>{advA > 0.12 ? p1(advA) : ""}</span><span style={{ width: `${(1 - advA) * 100}%`, background: CORAL }}>{(1 - advA) > 0.12 ? p1(1 - advA) : ""}</span></div>
            <div className="barlabels"><span>{A.name} advances</span><span>{B.name} advances</span></div>
          </div>)}
        </div>

        {/* tabs */}
        <div className="tabs">
          <button className={tab === "risk" ? "on" : ""} onClick={() => setTab("risk")}>Risk lab</button>
          <button className={tab === "scorers" ? "on" : ""} onClick={() => setTab("scorers")}>Goalscorers</button>
          <button className={tab === "matrix" ? "on" : ""} onClick={() => setTab("matrix")}>Score matrix</button>
        </div>

        {/* RISK LAB */}
        {tab === "risk" && (
          <div className="card">
            {liveMatch && (
              <div className="pulsing" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, padding: "8px 12px", borderRadius: 9, border: `1px solid ${CORAL}`, background: "rgba(255,107,92,0.08)", flexWrap: "wrap", gap: 6 }}>
                <span style={{ fontFamily: "'Space Mono'", fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: CORAL, fontWeight: 700 }}><span className="livedot" />live · {liveModel.clock}</span>
                <span className="note" style={{ margin: 0 }}>every bet below updates off the current score, ticking every second</span>
              </div>
            )}

            {/* split scoreboard: Team A stats on the left, Team B stats on the right */}
            <div className={liveMatch ? "pulsing" : ""}>
              <div className="split">
                <div className="splitcol" style={{ borderColor: MINT + "40" }}>
                  <div className="splitname" style={{ color: MINT }}>{A.flag} {A.name}</div>
                  <div className="splitbig" style={{ color: MINT }}>{p1(activeS.pA)}</div>
                  <div className="splitlab">win probability</div>
                  <div className="splitrow"><span>xG</span><b>{xgA.toFixed(2)}</b></div>
                  <div className="splitrow"><span>Clean sheet</span><b>{p1(activeS.csA)}</b></div>
                  <div className="splitrow"><span>Over 1.5 (own)</span><b>{p1(activeS.aOver15)}</b></div>
                  {scorersA[0] && <div className="splitrow"><span>Top scorer</span><b>{scorersA[0].n} {Math.round(scorersA[0].p * 100)}%</b></div>}
                </div>
                <div className="splitmid">
                  <div className="splitbig" style={{ color: "var(--dim)", fontSize: 26 }}>{p1(activeS.pD)}</div>
                  <div className="splitlab">draw</div>
                  <div className="splitdash">{liveMatch ? `${liveModel.curA}–${liveModel.curB}` : `${Math.round(lA)}–${Math.round(lB)}`}</div>
                  <div className="splitlab">{liveMatch ? "current score" : "projected score"}</div>
                </div>
                <div className="splitcol" style={{ borderColor: CORAL + "40" }}>
                  <div className="splitname" style={{ color: CORAL }}>{B.flag} {B.name}</div>
                  <div className="splitbig" style={{ color: CORAL }}>{p1(activeS.pB)}</div>
                  <div className="splitlab">win probability</div>
                  <div className="splitrow"><span>xG</span><b>{xgB.toFixed(2)}</b></div>
                  <div className="splitrow"><span>Clean sheet</span><b>{p1(activeS.csB)}</b></div>
                  <div className="splitrow"><span>Over 1.5 (own)</span><b>{p1(activeS.bOver15)}</b></div>
                  {scorersB[0] && <div className="splitrow"><span>Top scorer</span><b>{scorersB[0].n} {Math.round(scorersB[0].p * 100)}%</b></div>}
                </div>
              </div>
              {h2h && h2h.played > 0 && (
                <div className="note" style={{ textAlign: "center", marginTop: 8 }}>
                  Head-to-head: {A.name} {h2h.aWins} · draws {h2h.draws} · {B.name} {h2h.bWins} ({h2h.played} meetings)
                </div>
              )}
            </div>

            <div className="note" style={{ marginTop: 16, marginBottom: 14 }}>Educational only. Risk = the model's chance the bet LOSES. Longshots pay more because they lose more often — a pick is only sharp if the model beats the market's implied %.</div>
            <div className="rf">
              <div><label>Bet type</label>
                <select value={bet} onChange={(e) => setBet(e.target.value)}>
                  <option value="winA">Match winner — {A.name}</option>
                  <option value="draw">Match winner — Draw</option>
                  <option value="winB">Match winner — {B.name}</option>
                  <option value="dcA">Double chance — {A.name} or draw</option>
                  <option value="dcB">Double chance — {B.name} or draw</option>
                  {mode === "knockout" && <option value="advA">{A.name} to advance</option>}
                  {mode === "knockout" && <option value="advB">{B.name} to advance</option>}
                  <option value="exact">Exact final score</option>
                  <option value="ou">Total goals over/under</option>
                  <option value="btts">Both teams to score — yes</option>
                  <option value="bttsNo">Both teams to score — no</option>
                  <option value="tt">Team total goals</option>
                  <option value="marginA">{A.name} to win by 2+</option>
                  <option value="marginB">{B.name} to win by 2+</option>
                  <option value="pScore">Player to score anytime</option>
                  <option value="pBrace">Player to score 2+</option>
                  <option value="pAssist">Player to record an assist</option>
                </select>
              </div>
              {bet === "exact" && (<div><label>Score {A.name} – {B.name}</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <select value={si} onChange={(e) => setSi(+e.target.value)}>{[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select>
                  <select value={sj} onChange={(e) => setSj(+e.target.value)}>{[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select>
                </div></div>)}
              {bet === "ou" && (<div><label>Line & side</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <select value={ouLine} onChange={(e) => setOuLine(+e.target.value)}>{[0.5, 1.5, 2.5, 3.5, 4.5].map((n) => <option key={n} value={n}>{n}</option>)}</select>
                  <select value={ouSide} onChange={(e) => setOuSide(e.target.value)}><option value="over">Over</option><option value="under">Under</option></select>
                </div></div>)}
              {bet === "tt" && (<div><label>Team & line</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <select value={ttTeam} onChange={(e) => setTtTeam(e.target.value)}><option value="A">{A.name}</option><option value="B">{B.name}</option></select>
                  <select value={ttLine} onChange={(e) => setTtLine(+e.target.value)}>{[0.5, 1.5, 2.5].map((n) => <option key={n} value={n}>{n}</option>)}</select>
                </div></div>)}
              {(bet === "pScore" || bet === "pBrace" || bet === "pAssist") && (<div><label>Player</label>
                <select value={selPlayer ? selPlayer.n : ""} onChange={(e) => setPlayer(e.target.value)}>
                  {playersPool.map((p) => <option key={p.tag + p.n} value={p.n}>{p.n} ({p.team})</option>)}
                </select></div>)}
              <div><label>Market odds for this bet</label>
                <div className="autoodds">{autoBetOdds ? `${autoBetOdds} (auto, ESPN)` : "not published for this bet"}</div></div>
            </div>

            <div className="riskhead">
              <div className="bt">{R.title}{R.approx ? " (rough est.)" : ""}</div>
              <div className="chip" style={{ background: band.c }}>{band.l}</div>
            </div>
            <div className="bigp" style={{ color: band.c }}>{p1(R.p)}<span style={{ fontSize: 16, color: "var(--dim)", fontWeight: 400, fontFamily: "'Space Mono'" }}> to hit</span></div>
            <div className="riskbar"><div className="rf2" style={{ width: `${risk * 100}%`, background: band.c, opacity: 0.85 }} /></div>
            <div className="rmeta"><span>0% risk</span><span>risk of losing: {p1(risk)}</span><span>100% risk</span></div>
            <div className="oddsrow">
              <div className="o"><div className="n">{fairAmerican(R.p)}</div><div className="l">fair odds</div></div>
              <div className="o"><div className="n">{(1 / R.p).toFixed(2)}x</div><div className="l">fair payout</div></div>
              {bImp != null && <div className="o"><div className="n" style={{ color: bEdge >= 0 ? MINT : CORAL }}>{bEdge >= 0 ? "+" : ""}{(bEdge * 100).toFixed(1)}%</div><div className="l">edge vs market</div></div>}
              {bEV != null && <div className="o"><div className="n" style={{ color: bEV >= 0 ? MINT : CORAL }}>{bEV >= 0 ? "+" : ""}{(bEV * 100).toFixed(1)}%</div><div className="l">EV per $1</div></div>}
            </div>
            {bImp != null && (<div className="evbox">
              The book prices this at <b>{Math.round(bImp * 100)}%</b>. The model says <b>{p1(R.p)}</b>.{" "}
              {bEdge >= 0 ? `Positive edge — the model thinks it hits more often than the price implies (EV ${(bEV * 100).toFixed(1)}% per $1 if the model is right).` : `Negative edge — the price is longer than the model's read, so it grades −EV. The model would pass.`}
            </div>)}
          </div>
        )}

        {tab === "scorers" && (
          <div className="card">
            <div className="scorers">{scorerCol(teamA, scorersA, MINT)}{scorerCol(teamB, scorersB, CORAL)}</div>
            <div className="note">Anytime-scorer % = chance a player nets at least once in regulation, from their share of the team's {lA.toFixed(2)}/{lB.toFixed(2)} expected goals. Form-based approximations.</div>
          </div>
        )}


        {tab === "matrix" && (
          <div className="card">
            <div className="matrix">
              <div className="mlab"></div>
              {[0, 1, 2, 3, 4, 5].map((j) => <div key={"h" + j} className="mlab">{j}</div>)}
              {[0, 1, 2, 3, 4, 5].flatMap((i) => [
                <div key={"r" + i} className="mlab">{i}</div>,
                ...[0, 1, 2, 3, 4, 5].map((j) => {
                  const p = grid[i][j], isPeak = i === s.peak.i && j === s.peak.j;
                  const alpha = Math.min(1, (p / maxCell) * 0.9 + 0.06);
                  return <div key={i + "-" + j} className={"cell" + (isPeak ? " peak" : "")} style={{ background: isPeak ? AMBER : `rgba(79,216,176,${alpha})` }}>{p >= 0.02 ? Math.round(p * 100) : ""}</div>;
                }),
              ])}
            </div>
            <div className="axname"><span>rows <b>{A.flag} {A.name}</b> goals</span><span>· cols <b>{B.flag} {B.name}</b> goals</span><span>· amber = most likely</span></div>
          </div>
        )}

        {/* ===================== TOURNAMENT ===================== */}
        <div className="card">
          <div className="snaphead">
            <h3>Tournament · snapshot {snap.asOf || SNAPSHOT.asOf}</h3>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className="feedtag" style={{ color: feed === "live" ? MINT : "var(--dim)", borderColor: feed === "live" ? MINT : "var(--line)" }}>
                {feed === "live" ? "● live feed" : feed === "loading" ? "…syncing" : "○ snapshot"}
              </span>
              <button className="refresh" onClick={refresh}>↻ Refresh</button>
            </div>
          </div>
          <div className="subtabs">
            {seg2("upcoming", ttab, setTtab, "Upcoming")}
            {seg2("schedule", ttab, setTtab, "Schedule")}
            {seg2("bracket", ttab, setTtab, "Bracket")}
          </div>

          {ttab === "upcoming" && (<>
            <div className="note" style={{ marginTop: 4, marginBottom: 12 }}>Every confirmed game still to come · tap any match to load it into the model.</div>
            {schedule.map((fx, k) => (
              <div className="fxrow" key={k} onClick={() => loadFixture(fx)}>
                <div className="when">{fx.day}<br />{fx.time}</div>
                <div className="match">{flag(fx.a)} {disp(fx.a)} <span style={{ color: "var(--dim)" }}>v</span> {flag(fx.b)} {disp(fx.b)}<div className="go">tap to model →</div></div>
                <div className="place">{fx.city}<br />{fx.stad}</div>
              </div>
            ))}
            <div className="snapcol" style={{ marginTop: 16 }}><h5>Golden Boot race (Polymarket)</h5>
              {(snap.boot || SNAPSHOT.boot).map((w, k) => (<div className="srow" key={k}><span>{w[0]}</span><span className="mono"><b>{w[1]}%</b></span></div>))}
            </div>
            <div className="note">{snap.note || SNAPSHOT.note} {feed !== "live" ? "Deploy the backend for live ESPN + Polymarket + Kalshi pulls each night." : `Updated ${refreshed || "just now"}.`}</div>
          </>)}

          {ttab === "schedule" && (<>
            <div className="note" style={{ marginTop: 4, marginBottom: 12 }}>Tap any fixture to load it straight into the model.</div>
            {schedule.map((fx, k) => (
              <div className="fxrow" key={k} onClick={() => loadFixture(fx)}>
                <div className="when">{fx.day}<br />{fx.time}</div>
                <div className="match">{flag(fx.a)} {disp(fx.a)} <span style={{ color: "var(--dim)" }}>v</span> {flag(fx.b)} {disp(fx.b)}<div className="go">tap to model →</div></div>
                <div className="place">{fx.city}<br />{fx.stad}</div>
              </div>
            ))}
          </>)}

          {ttab === "bracket" && (<div className="brk">
            <h5>Into the Round of 16</h5>
            <div className="chips">{qualified.map((t, k) => <span className="qchip" key={k}>{flag(t)} {t}</span>)}</div>
            {[["Round of 16", r16fx], ["Quarterfinals", qfFx], ["Semifinals", sfFx], ["Third Place", thirdFx], ["Final", finalFx]].map(([title, list], gi) => (
              list.length > 0 && (
                <div key={gi}>
                  <h5 style={{ marginTop: 16 }}>{title} — confirmed ties</h5>
                  {list.map((m, k) => (
                    <div className="r16row" key={k} onClick={() => m.decided !== false && byName(m.a) && byName(m.b) && loadFixture(m)} style={{ cursor: m.decided !== false ? "pointer" : "default", flexWrap: "wrap" }}>
                      <div className="t">{flag(m.a)} {disp(m.a)}</div><div className="mid">vs</div><div className="t">{flag(m.b)} {disp(m.b)}</div>
                      <div className="pl">{m.when} · {m.stad}, {m.city}</div>
                    </div>
                  ))}
                </div>
              )
            ))}
            <h5 style={{ marginTop: 16 }}>Round of 32 — still to play</h5>
            {schedule.map((fx, k) => (
              <div className="fxrow" key={k} onClick={() => loadFixture(fx)}>
                <div className="when">{fx.day}</div>
                <div className="match">{flag(fx.a)} {disp(fx.a)} <span style={{ color: "var(--dim)" }}>v</span> {flag(fx.b)} {disp(fx.b)}</div>
                <div className="place">{fx.city}</div>
              </div>
            ))}
            <h5 style={{ marginTop: 18 }}>Market futures — to win it all</h5>
            {snap.winner.map((w, k) => (<div className="srow" key={k}><span>{w[0]}</span><span className="mono">Poly <b>{w[1]}%</b> · Kalshi <b>{w[2]}%</b></span></div>))}
            <div className="note">Bracket reflects the {snap.asOf || SNAPSHOT.asOf} snapshot. The live feed advances winners automatically.</div>
          </div>)}
        </div>

        {/* ===================== LIVE PREDICTION TRACKER ===================== */}
        <div className="card">
          <h3 style={{ fontFamily: "'Space Mono'", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: AMBER, marginBottom: 12 }}>Live prediction tracker</h3>
          {(() => {
            const trk = live && live.track;
            const trkGbt = live && live.trackGbt;
            if (!trk || trk.total === 0) {
              return (
                <div className="empty" style={{ fontSize: 13.5, lineHeight: 1.65 }}>
                  No graded predictions yet. Every match the model forecasts from here
                  forward gets logged automatically the moment it appears on the schedule,
                  then graded pass/fail the moment it finishes — nobody enters anything by
                  hand. Check back once a few matches have been played.
                </div>
              );
            }
            const acc = trk.accuracy;
            const accColor = acc >= 0.6 ? MINT : acc >= 0.45 ? AMBER : CORAL;
            const gbtReady = trkGbt && trkGbt.modelTrained;
            const gbtHasData = gbtReady && trkGbt.total > 0;
            const gbtAcc = gbtHasData ? trkGbt.accuracy : null;
            const gbtColor = gbtAcc == null ? "var(--dim)" : gbtAcc >= 0.6 ? MINT : gbtAcc >= 0.45 ? AMBER : CORAL;

            // merge both models' histories by match id so each row can show
            // both a baseline verdict and a GBT verdict for the same game
            const gbtById = {};
            if (trkGbt) for (const p of trkGbt.history) gbtById[p.a + "|" + p.b + "|" + p.date] = p;
            const merged = trk.history.map((p) => ({ ...p, gbt: gbtById[p.a + "|" + p.b + "|" + p.date] || null }));
            const filtered = merged.filter((p) =>
              trackFilter === "all" ? true : trackFilter === "hits" ? p.correct : !p.correct
            );

            return (<>
              <div className="dualtrack">
                <div className="dualcol" style={{ borderColor: MINT + "40" }}>
                  <div className="dualname" style={{ color: MINT }}>Baseline (Elo+Poisson)</div>
                  <div className="splitbig" style={{ color: accColor, fontSize: 32 }}>{Math.round(acc * 100)}%</div>
                  <div className="splitlab">hit rate · {trk.correct}✓ {trk.incorrect}✗ · {trk.total} graded</div>
                </div>
                <div className="dualcol" style={{ borderColor: CORAL + "40" }}>
                  <div className="dualname" style={{ color: CORAL }}>Gradient Boosted Trees</div>
                  {!gbtReady && <div className="note" style={{ margin: "6px 0 0" }}>Model not trained yet — deploy /api/train to activate.</div>}
                  {gbtReady && !gbtHasData && <div className="note" style={{ margin: "6px 0 0" }}>Trained, but no GBT-graded matches yet — check back soon.</div>}
                  {gbtHasData && (<>
                    <div className="splitbig" style={{ color: gbtColor, fontSize: 32 }}>{Math.round(gbtAcc * 100)}%</div>
                    <div className="splitlab">hit rate · {trkGbt.correct}✓ {trkGbt.incorrect}✗ · {trkGbt.total} graded</div>
                  </>)}
                </div>
              </div>

              <div className="subtabs" style={{ marginTop: 12 }}>
                {[["all", "All"], ["hits", "Baseline hits"], ["misses", "Baseline misses"]].map(([v, label]) => (
                  <button key={v} className={trackFilter === v ? "on" : ""} onClick={() => setTrackFilter(v)}>{label}</button>
                ))}
              </div>
              <div className="note" style={{ marginTop: 10, marginBottom: 10 }}>
                "Correct" = a model's highest-probability pick (win/draw/win) matched the actual
                90-minute result. Most recent first — tap a match to see both models' full picks.
              </div>
              {filtered.length === 0 && <div className="empty">No {trackFilter} in the graded history yet.</div>}
              {filtered.map((p, k) => {
                const matchKey = p.a + "|" + p.b + "|" + p.date;
                const isOpen = expandedMatch === matchKey;
                return (
                  <div key={k}>
                    <div
                      className="fxrow"
                      style={{ borderColor: p.correct ? MINT + "55" : CORAL + "55" }}
                      onClick={() => setExpandedMatch(isOpen ? null : matchKey)}
                    >
                      <div className="when" style={{ color: p.correct ? MINT : CORAL, fontWeight: 700 }}>
                        {p.correct ? "✓" : "✗"}{p.gbt ? (p.gbt.correct ? " / ✓" : " / ✗") : ""}
                      </div>
                      <div className="match">
                        {flag(p.a)} {disp(p.a)} <span style={{ color: "var(--dim)" }}>v</span> {flag(p.b)} {disp(p.b)}
                        <div className="go" style={{ color: "var(--dim)" }}>final {p.finalScore} · baseline picked {p.pick === "A" ? disp(p.a) : p.pick === "B" ? disp(p.b) : "draw"} {isOpen ? "▲" : "▼"}</div>
                      </div>
                      <div className="place">{new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                    </div>
                    {isOpen && (
                      <div className="evbox" style={{ marginTop: -4, marginBottom: 8 }}>
                        <div style={{ marginBottom: p.correct ? 8 : 4 }}>
                          <b style={{ color: MINT }}>Baseline</b> — {disp(p.a)} {Math.round((p.pA ?? 0) * 100)}% · Draw {Math.round((p.pD ?? 0) * 100)}% · {disp(p.b)} {Math.round((p.pB ?? 0) * 100)}%
                          <span style={{ color: p.correct ? MINT : CORAL, marginLeft: 8 }}>{p.correct ? "✓ hit" : "✗ miss"}</span>
                        </div>
                        {!p.correct && p.reason && (
                          <div style={{ marginBottom: 10, color: "var(--dim)", fontSize: 12.5, lineHeight: 1.5, paddingLeft: 10, borderLeft: `2px solid ${CORAL}55` }}>{p.reason}</div>
                        )}
                        {p.gbt ? (
                          <div style={{ marginBottom: p.gbt.correct ? 8 : 4 }}>
                            <b style={{ color: CORAL }}>GBT</b> — {disp(p.a)} {Math.round((p.gbt.pA ?? 0) * 100)}% · Draw {Math.round((p.gbt.pD ?? 0) * 100)}% · {disp(p.b)} {Math.round((p.gbt.pB ?? 0) * 100)}%
                            <span style={{ color: p.gbt.correct ? MINT : CORAL, marginLeft: 8 }}>{p.gbt.correct ? "✓ hit" : "✗ miss"}</span>
                          </div>
                        ) : (
                          <div style={{ marginBottom: 8, color: "var(--dim)" }}>GBT pick not available for this match.</div>
                        )}
                        {p.gbt && !p.gbt.correct && p.gbt.reason && (
                          <div style={{ marginBottom: 10, color: "var(--dim)", fontSize: 12.5, lineHeight: 1.5, paddingLeft: 10, borderLeft: `2px solid ${CORAL}55` }}>{p.gbt.reason}</div>
                        )}
                        <div style={{ color: "var(--dim)" }}>Actual result: <b>{p.actual === "A" ? disp(p.a) : p.actual === "B" ? disp(p.b) : "Draw"}</b></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </>);
          })()}
        </div>

        <div className="disc">Ratings, scorer shares, schedule, bracket, and market snapshot are approximate and time-stamped. Deploy the backend for live nightly data. A model is an edge, not a lock. · 21+. Bet responsibly · 1-800-GAMBLER.</div>
      </div>
    </div>
  );
}

/* small helper for the tournament sub-tabs (kept outside to reuse styles) */
function seg2(val, cur, set, label) {
  return <button className={cur === val ? "on" : ""} onClick={() => set(val)}>{label}</button>;
}
