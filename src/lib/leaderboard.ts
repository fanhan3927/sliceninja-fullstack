/**
 * 排行榜查询（API 与 Server Component 共用）：每用户最高分，并列按最早达成时间。
 */

import { prisma } from "@/lib/prisma";

export interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  createdAt: string;
}

export async function getLeaderboard(limit: number): Promise<LeaderboardEntry[]> {
  const tops = await prisma.gameSession.groupBy({
    by: ["userId"],
    _max: { score: true },
  });

  const or = tops
    .filter((t) => t._max.score !== null)
    .map((t) => ({ userId: t.userId, score: t._max.score as number }));

  const rows =
    or.length > 0
      ? await prisma.gameSession.findMany({
          where: { OR: or },
          select: { userId: true, score: true, createdAt: true },
        })
      : [];

  const bestByUser = new Map<string, { score: number; createdAt: Date }>();
  for (const r of rows) {
    const cur = bestByUser.get(r.userId);
    if (!cur || r.score > cur.score || (r.score === cur.score && r.createdAt < cur.createdAt)) {
      bestByUser.set(r.userId, { score: r.score, createdAt: r.createdAt });
    }
  }

  const userIds = [...bestByUser.keys()];
  const users =
    userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  return [...bestByUser.entries()]
    .map(([userId, v]) => ({
      userId,
      name: nameById.get(userId) ?? "忍者",
      score: v.score,
      createdAt: v.createdAt,
    }))
    .sort((a, b) => b.score - a.score || a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, limit)
    .map((e, i) => ({
      rank: i + 1,
      name: e.name,
      score: e.score,
      createdAt: e.createdAt.toISOString(),
    }));
}
