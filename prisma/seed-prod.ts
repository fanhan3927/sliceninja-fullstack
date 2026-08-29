/**
 * 生产环境 seed：只写入「成就清单」与「默认难度配置」，
 * 不创建任何演示账号/默认密码（安全要求，见 README）。
 * 用法（先建好表）：DATABASE_URL=<postgres url> npx tsx prisma/seed-prod.ts
 */

import { PrismaClient } from "@prisma/client";
import { DEFAULT_DIFFICULTY } from "../src/game/constants";

const prisma = new PrismaClient();

const ACHIEVEMENTS = [
  { key: "first_game", title: "初试刀锋", description: "完成第一局对局" },
  { key: "combo_5", title: "五连斩", description: "单局达成 5 连击" },
  { key: "combo_8", title: "八连斩", description: "单局达成 8 连击" },
  { key: "combo_12", title: "十二连斩", description: "单局达成 12 连击" },
  { key: "level_5", title: "登堂入室", description: "单局达到 Level 5" },
  { key: "level_10", title: "宗师之路", description: "单局达到 Level 10" },
  { key: "sliced_100", title: "百果斩", description: "累计切开 100 个水果" },
] as const;

async function main() {
  for (const a of ACHIEVEMENTS) {
    await prisma.achievement.upsert({
      where: { key: a.key },
      update: { title: a.title, description: a.description },
      create: { key: a.key, title: a.title, description: a.description },
    });
  }
  await prisma.gameConfig.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", version: 1, json: JSON.stringify(DEFAULT_DIFFICULTY), updatedBy: "seed-prod" },
  });
  console.log("Prod seed 完成：7 项成就 + 默认难度配置（未创建任何用户）。");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
