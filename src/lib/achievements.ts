/**
 * 成就解锁扫描：对局落库后调用，幂等（已拥有则跳过）。
 * 成就清单（与 seed 一致）：first_game / combo_5 / combo_8 / combo_12 /
 * level_5 / level_10 / sliced_100（累计切开 ≥ 100）。
 */

import type { PrismaClient } from "@prisma/client";
import type { SessionInput } from "./score-guard";

export interface AchievementUnlocked {
  key: string;
  title: string;
  description: string;
}

export async function unlockAchievementsForUser(
  prisma: PrismaClient,
  userId: string,
  session: SessionInput
): Promise<AchievementUnlocked[]> {
  const achievements = await prisma.achievement.findMany();
  const byKey = new Map(achievements.map((a) => [a.key, a]));
  const owned = await prisma.userAchievement.findMany({
    where: { userId },
    select: { achievementId: true },
  });
  const ownedIds = new Set(owned.map((o) => o.achievementId));

  // 累计切开数（session 已插入，聚合包含本局）
  const agg = await prisma.gameSession.aggregate({
    where: { userId },
    _sum: { fruitsSliced: true },
  });
  const totalSliced = agg._sum.fruitsSliced ?? 0;

  const candidates: Array<{ key: string; hit: boolean }> = [
    { key: "first_game", hit: true }, // 能走到这里说明完成了第一局
    { key: "combo_5", hit: session.maxCombo >= 5 },
    { key: "combo_8", hit: session.maxCombo >= 8 },
    { key: "combo_12", hit: session.maxCombo >= 12 },
    { key: "level_5", hit: session.levelReached >= 5 },
    { key: "level_10", hit: session.levelReached >= 10 },
    { key: "sliced_100", hit: totalSliced >= 100 },
  ];

  const unlocked: AchievementUnlocked[] = [];
  for (const c of candidates) {
    const ach = byKey.get(c.key);
    if (!ach || !c.hit || ownedIds.has(ach.id)) continue;
    await prisma.userAchievement.create({ data: { userId, achievementId: ach.id } });
    unlocked.push({ key: ach.key, title: ach.title, description: ach.description });
  }
  return unlocked;
}
