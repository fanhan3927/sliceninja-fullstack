import { z } from "zod";

/** 注册：昵称 1-20 字，email 合法，密码 ≥8（上限 72 与 bcrypt 输入限制一致） */
export const registerSchema = z.object({
  name: z.string().trim().min(1, "昵称不能为空").max(20, "昵称最多 20 字"),
  email: z.string().trim().toLowerCase().email("邮箱格式不正确"),
  password: z.string().min(8, "密码至少 8 位").max(72, "密码过长"),
});

/** 登录 */
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("邮箱格式不正确"),
  password: z.string().min(1, "请输入密码"),
});

/** 对局提交（POST /api/sessions） */
export const sessionSubmitSchema = z.object({
  score: z.number().int().min(0).max(10_000_000),
  maxCombo: z.number().int().min(0).max(1000),
  levelReached: z.number().int().min(1).max(999),
  fruitsSliced: z.number().int().min(0).max(100_000),
  fruitsMissed: z.number().int().min(0).max(100_000),
  bombsHit: z.number().int().min(0).max(100),
  durationMs: z.number().int().min(0).max(4 * 60 * 60 * 1000),
  endedReason: z.enum(["MISS", "BOMB", "QUIT"]),
});

/** 管理员难度配置（部分键可省略，最终与默认值合并） */
export const difficultyConfigSchema = z.object({
  spawnIntervalMs: z
    .object({ base: z.number(), perLevel: z.number(), min: z.number() })
    .partial()
    .optional(),
  fruitsPerWave: z
    .object({
      startDoubleLevel: z.number(),
      startTripleLevel: z.number(),
      doubleChance: z.number(),
      tripleChance: z.number(),
    })
    .partial()
    .optional(),
  throwSpeed: z
    .object({ base: z.number(), perLevel: z.number(), max: z.number() })
    .partial()
    .optional(),
  gravity: z
    .object({ base: z.number(), perLevel: z.number(), max: z.number() })
    .partial()
    .optional(),
  bombChance: z
    .object({ startLevel: z.number(), base: z.number(), perLevel: z.number(), max: z.number() })
    .partial()
    .optional(),
  fruitRadius: z
    .object({ base: z.number(), perLevel: z.number(), min: z.number() })
    .partial()
    .optional(),
  comboWindowMs: z
    .object({ base: z.number(), perLevel: z.number(), min: z.number() })
    .partial()
    .optional(),
  fruitsToLevelUp: z.object({ base: z.number(), perLevel: z.number() }).partial().optional(),
  lives: z.number().int().min(1).max(9).optional(),
  bombEndsGame: z.boolean().optional(),
  scorePerFruit: z.number().optional(),
  comboBonus: z.number().optional(),
});
