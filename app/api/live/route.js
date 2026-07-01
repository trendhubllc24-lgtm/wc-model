import { getEspnSlate, extractLiveGames } from "@/lib/sources";

// No secret required — this is read-only and cheap (one ESPN call).
// Safe for the frontend to poll every 20-30s while there are live games.
export async function GET() {
  try {
    const slate = await getEspnSlate();
    const live = extractLiveGames(slate);
    return Response.json({ ok: true, live, checkedAt: new Date().toISOString() });
  } catch (err) {
    return Response.json({ ok: false, live: [], error: String(err) }, { status: 200 });
  }
}
