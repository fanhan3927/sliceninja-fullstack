import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/me —— 当前登录态：user / 最高分 / 偏好。
 * 未登录返回 { user: null, bestScore: null, preference: null }（游戏页据此决定是否自动存档）。
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ user: null, bestScore: null, preference: null });
  }

  const [best, preference] = await Promise.all([
    prisma.gameSession.aggregate({
      where: { userId: session.user.id },
      _max: { score: true },
    }),
    prisma.preference.findUnique({ where: { userId: session.user.id } }),
  ]);

  return NextResponse.json({
    user: {
      id: session.user.id,
      name: session.user.name ?? null,
      email: session.user.email ?? null,
      role: session.user.role,
    },
    bestScore: best._max.score ?? 0,
    preference,
  });
}
