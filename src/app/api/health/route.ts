import { NextResponse } from "next/server";

/** GET /api/health —— 探活 */
export async function GET() {
  return NextResponse.json({ ok: true });
}
