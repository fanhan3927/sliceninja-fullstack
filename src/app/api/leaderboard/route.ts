import { NextResponse } from "next/server";
import { getLeaderboard } from "@/lib/leaderboard";
import { z } from "zod";

const limitSchema = z.coerce.number().int().min(1).max(50).default(50);

/** GET /api/leaderboard?limit=50 —— 每用户最高分，并列按最早达成时间排序 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = limitSchema.parse(searchParams.get("limit") ?? "50");
  const entries = await getLeaderboard(limit);
  return NextResponse.json({ entries });
}
