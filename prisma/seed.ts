/**
 * Seed：演示账号、默认难度配置、成就清单（幂等，可重复执行）。
 * 默认密码仅用于本地开发，生产环境务必修改/禁用（见 README 部署章节）。
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
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
  // 管理员（仅开发）
  await prisma.user.upsert({
    where: { email: "admin@sliceninja.dev" },
    update: {},
    create: {
      email: "admin@sliceninja.dev",
      name: "道场主",
      role: "ADMIN",
      passwordHash: bcrypt.hashSync("Admin1234!", 10),
    },
  });

  // 演示用户
  await prisma.user.upsert({
    where: { email: "demo@sliceninja.dev" },
    update: {},
    create: {
      email: "demo@sliceninja.dev",
      name: "Demo 忍者",
      role: "USER",
      passwordHash: bcrypt.hashSync("Demo1234!", 10),
    },
  });

  // 默认难度配置（PRD 难度表）
  await prisma.gameConfig.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      version: 1,
      json: JSON.stringify(DEFAULT_DIFFICULTY),
      updatedBy: "seed",
    },
  });

  // 成就
  for (const a of ACHIEVEMENTS) {
    await prisma.achievement.upsert({
      where: { key: a.key },
      update: { title: a.title, description: a.description },
      create: { key: a.key, title: a.title, description: a.description },
    });
  }

  console.log("Seed 完成：admin / demo 用户、default 难度配置、7 项成就。");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
