/**
 * 服务端难度配置读取：解析 GameConfig.json，失败回落默认值。
 * 被 GET /api/config 与 POST /api/sessions（分数校验）共用。
 */

import { prisma } from "@/lib/prisma";
import { DEFAULT_DIFFICULTY } from "@/game/constants";
import { mergeConfig } from "@/game/difficulty";
import type { DifficultyConfig } from "@/game/types";

export async function getEffectiveConfig(): Promise<{
  config: DifficultyConfig;
  version: number;
}> {
  const row = await prisma.gameConfig.findUnique({ where: { id: "default" } });
  if (!row) return { config: DEFAULT_DIFFICULTY, version: 1 };
  try {
    return { config: mergeConfig(JSON.parse(row.json)), version: row.version };
  } catch {
    // JSON 损坏 → 回落默认配置（仍返回当前 version 便于客户端判断）
    return { config: DEFAULT_DIFFICULTY, version: row.version };
  }
}
