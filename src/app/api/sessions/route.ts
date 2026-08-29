import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEffectiveConfig } from "@/lib/config";
import { validateSession, type SessionInput } from "@/lib/score-guard";
import { unlockAchievementsForUser } from "@/lib/achievements";
import { sessionSubmitSchema } from "@/lib/validators";

/**
 * POST /api/sessions —— 登录用户提交对局（Game Over 时恰好一次）：
 *   校验 → score-guard → 落库 → 扫描成就。
 * GET  /api/sessions —— 当前用户最近 20 局。
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = sessionSubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "对局数据不合法" },
      { status: 400 }
    );
  }
  const input = parsed.data as SessionInput;

  const { config } = await getEffectiveConfig();
  const guard = validateSession(input, config);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.reason }, { status: 400 });
  }

  const created = await prisma.gameSession.create({
    data: {
      userId: session.user.id,
      score: input.score,
      maxCombo: input.maxCombo,
      levelReached: input.levelReached,
      fruitsSliced: input.fruitsSliced,
      fruitsMissed: input.fruitsMissed,
      bombsHit: input.bombsHit,
      durationMs: input.durationMs,
      endedReason: input.endedReason,
    },
  });

  const newAchievements = await unlockAchievementsForUser(prisma, session.user.id, input);

  return NextResponse.json({ ok: true, id: created.id, newAchievements });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const rows = await prisma.gameSession.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return NextResponse.json({ sessions: rows });
}
