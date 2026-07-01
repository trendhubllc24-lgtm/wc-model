import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export async function GET() {
  const snap = await redis.get("wc-snapshot");
  return Response.json(snap || { updatedAt: null, winner: [], schedule: [] });
}
