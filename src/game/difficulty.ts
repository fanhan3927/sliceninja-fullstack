/**
 * 难度公式（纯函数）—— 数值口径以 PRD「动态难度机制」表为准。
 *
 * 多段线性参数（spawnIntervalMs / throwSpeed / gravity / fruitRadius / comboWindowMs）：
 *     f(L) = clamp(base + perLevel × (L − 1), min, max)      （L 从 1 开始）
 *
 * 炸弹率 bombChance（startLevel=2）：
 *     L < startLevel        → 0
 *     L ≥ startLevel        → min(base + perLevel × (L − startLevel), max)
 *
 * 升级所需切开数 fruitsToLevelUp（离开 L 升到 L+1 的增量）：
 *     PRD 写作「每切开 8 + Level × 2 个水果升一级」。
 *     本实现口径：f(L) = base + perLevel × (L − 1)，即 L1 需 8 个、L2 需 10 个、L3 需 12 个…
 *     （与技术设计 DifficultyConfig.fruitsToLevelUp = { base: 8, perLevel: 2 } 保持一致：
 *       base 恒为 Level 1 的取值，与其它参数的 base 语义统一。）
 *
 * 已验证的期望值（下方模块加载断言）：
 *     Level 1：spawnIntervalMs = 1400、bombChance = 0、throwSpeed = 7.2
 *     Level 5：spawnIntervalMs = 1400 − 80×4 = 1080、bombChance = 0.08 + 0.035×3 = 0.185
 *              （startLevel = 2，Level 5 已过 3 档）
 */

import { DEFAULT_DIFFICULTY } from "./constants";
import type { DifficultyConfig, RuntimeParams } from "./types";

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** 三段式参数（base / perLevel / min 或 max）的服务端覆盖合并 */
function mergeTriplet<T extends Record<string, number>>(
  fallback: T,
  raw: unknown,
  minKey: "min" | "max"
): T {
  const out: Record<string, number> = { ...fallback };
  if (typeof raw === "object" && raw !== null) {
    const r = raw as Record<string, unknown>;
    for (const key of ["base", "perLevel", minKey]) {
      if (isFiniteNumber(r[key])) out[key] = r[key] as number;
    }
  }
  return out as T;
}

/**
 * 把服务端 GameConfig JSON（可能残缺 / 被篡改）安全合并进默认配置。
 * 只接受有限数值，未知键忽略；概率字段 clamp 到 [0, 1]。
 */
export function mergeConfig(raw: unknown): DifficultyConfig {
  const cfg: DifficultyConfig = {
    spawnIntervalMs: { ...DEFAULT_DIFFICULTY.spawnIntervalMs },
    fruitsPerWave: { ...DEFAULT_DIFFICULTY.fruitsPerWave },
    throwSpeed: { ...DEFAULT_DIFFICULTY.throwSpeed },
    gravity: { ...DEFAULT_DIFFICULTY.gravity },
    bombChance: { ...DEFAULT_DIFFICULTY.bombChance },
    fruitRadius: { ...DEFAULT_DIFFICULTY.fruitRadius },
    comboWindowMs: { ...DEFAULT_DIFFICULTY.comboWindowMs },
    fruitsToLevelUp: { ...DEFAULT_DIFFICULTY.fruitsToLevelUp },
    lives: DEFAULT_DIFFICULTY.lives,
    bombEndsGame: DEFAULT_DIFFICULTY.bombEndsGame,
    scorePerFruit: DEFAULT_DIFFICULTY.scorePerFruit,
    comboBonus: DEFAULT_DIFFICULTY.comboBonus,
  };
  if (typeof raw !== "object" || raw === null) return cfg;

  const r = raw as Record<string, unknown>;

  cfg.spawnIntervalMs = mergeTriplet(cfg.spawnIntervalMs, r.spawnIntervalMs, "min");
  cfg.throwSpeed = mergeTriplet(cfg.throwSpeed, r.throwSpeed, "max");
  cfg.gravity = mergeTriplet(cfg.gravity, r.gravity, "max");
  cfg.fruitRadius = mergeTriplet(cfg.fruitRadius, r.fruitRadius, "min");
  cfg.comboWindowMs = mergeTriplet(cfg.comboWindowMs, r.comboWindowMs, "min");

  if (typeof r.bombChance === "object" && r.bombChance !== null) {
    const b = r.bombChance as Record<string, unknown>;
    if (isFiniteNumber(b.startLevel)) cfg.bombChance.startLevel = b.startLevel;
    if (isFiniteNumber(b.base)) cfg.bombChance.base = clamp(b.base, 0, 1);
    if (isFiniteNumber(b.perLevel)) cfg.bombChance.perLevel = b.perLevel;
    if (isFiniteNumber(b.max)) cfg.bombChance.max = clamp(b.max, 0, 1);
  }

  if (typeof r.fruitsPerWave === "object" && r.fruitsPerWave !== null) {
    const f = r.fruitsPerWave as Record<string, unknown>;
    if (isFiniteNumber(f.startDoubleLevel)) cfg.fruitsPerWave.startDoubleLevel = f.startDoubleLevel;
    if (isFiniteNumber(f.startTripleLevel)) cfg.fruitsPerWave.startTripleLevel = f.startTripleLevel;
    if (isFiniteNumber(f.doubleChance)) cfg.fruitsPerWave.doubleChance = clamp(f.doubleChance, 0, 1);
    if (isFiniteNumber(f.tripleChance)) cfg.fruitsPerWave.tripleChance = clamp(f.tripleChance, 0, 1);
  }

  if (typeof r.fruitsToLevelUp === "object" && r.fruitsToLevelUp !== null) {
    const t = r.fruitsToLevelUp as Record<string, unknown>;
    if (isFiniteNumber(t.base)) cfg.fruitsToLevelUp.base = t.base;
    if (isFiniteNumber(t.perLevel)) cfg.fruitsToLevelUp.perLevel = t.perLevel;
  }

  if (isFiniteNumber(r.lives)) cfg.lives = clamp(Math.round(r.lives), 1, 9);
  if (typeof r.bombEndsGame === "boolean") cfg.bombEndsGame = r.bombEndsGame;
  if (isFiniteNumber(r.scorePerFruit)) cfg.scorePerFruit = Math.max(1, r.scorePerFruit);
  if (isFiniteNumber(r.comboBonus)) cfg.comboBonus = Math.max(0, r.comboBonus);

  return cfg;
}

/** 离开 L 升到 L+1 需要的切开数增量 */
export function fruitsToLevelUpFor(level: number, config: DifficultyConfig): number {
  return Math.max(
    1,
    Math.round(config.fruitsToLevelUp.base + config.fruitsToLevelUp.perLevel * (level - 1))
  );
}

/** 累计切开数 → 等级（前缀和累减，避免递归定义；见 TECH_DESIGN 计分章节） */
export function levelForSliced(totalSliced: number, config: DifficultyConfig): number {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalSliced));
  while (remaining >= fruitsToLevelUpFor(level, config)) {
    remaining -= fruitsToLevelUpFor(level, config);
    level += 1;
    if (level >= 999) break;
  }
  return level;
}

/** 某等级下的完整运行时参数 */
export function getDifficulty(level: number, config: DifficultyConfig): RuntimeParams {
  const L = Math.max(1, Math.floor(level));
  const c = config;
  const span = L - 1;

  const spawnIntervalMs = Math.max(
    c.spawnIntervalMs.min,
    Math.round(c.spawnIntervalMs.base + c.spawnIntervalMs.perLevel * span)
  );

  const bombChance =
    L < c.bombChance.startLevel
      ? 0
      : Math.min(
          c.bombChance.max,
          Math.max(0, c.bombChance.base + c.bombChance.perLevel * (L - c.bombChance.startLevel))
        );

  return {
    level: L,
    spawnIntervalMs,
    startDoubleLevel: c.fruitsPerWave.startDoubleLevel,
    startTripleLevel: c.fruitsPerWave.startTripleLevel,
    doubleChance: c.fruitsPerWave.doubleChance,
    tripleChance: c.fruitsPerWave.tripleChance,
    throwSpeed: Math.min(c.throwSpeed.max, c.throwSpeed.base + c.throwSpeed.perLevel * span),
    gravity: Math.min(c.gravity.max, c.gravity.base + c.gravity.perLevel * span),
    bombChance,
    fruitRadius: Math.max(c.fruitRadius.min, c.fruitRadius.base + c.fruitRadius.perLevel * span),
    comboWindowMs: Math.max(
      c.comboWindowMs.min,
      Math.round(c.comboWindowMs.base + c.comboWindowMs.perLevel * span)
    ),
    fruitsToLevelUp: fruitsToLevelUpFor(L, c),
    lives: c.lives,
    bombEndsGame: c.bombEndsGame,
    scorePerFruit: c.scorePerFruit,
    comboBonus: c.comboBonus,
  };
}

/* ---- 模块加载期断言：验收口径（失败会在控制台报错） ---- */
const d1 = getDifficulty(1, DEFAULT_DIFFICULTY);
const d5 = getDifficulty(5, DEFAULT_DIFFICULTY);

console.assert(d1.spawnIntervalMs === 1400, "[difficulty] L1 spawnIntervalMs 应为 1400，实际", d1.spawnIntervalMs);
console.assert(d1.bombChance === 0, "[difficulty] L1 bombChance 应为 0，实际", d1.bombChance);
console.assert(d1.throwSpeed === 7.2, "[difficulty] L1 throwSpeed 应为 7.2，实际", d1.throwSpeed);
console.assert(d1.gravity === 0.18, "[difficulty] L1 gravity 应为 0.18，实际", d1.gravity);
console.assert(d1.fruitRadius === 42, "[difficulty] L1 fruitRadius 应为 42，实际", d1.fruitRadius);
console.assert(d1.comboWindowMs === 900, "[difficulty] L1 comboWindowMs 应为 900，实际", d1.comboWindowMs);

console.assert(d5.spawnIntervalMs === 1080, "[difficulty] L5 spawnIntervalMs 应为 1080，实际", d5.spawnIntervalMs);
console.assert(
  Math.abs(d5.bombChance - 0.185) < 1e-9,
  "[difficulty] L5 bombChance 应为 0.185，实际",
  d5.bombChance
);
console.assert(getDifficulty(2, DEFAULT_DIFFICULTY).bombChance === 0.08, "[difficulty] L2 bombChance 应为 0.08");

// 参数触底/封顶检查
const d99 = getDifficulty(99, DEFAULT_DIFFICULTY);
console.assert(d99.spawnIntervalMs === 420, "[difficulty] spawnIntervalMs 下限应为 420，实际", d99.spawnIntervalMs);
console.assert(d99.throwSpeed === 14, "[difficulty] throwSpeed 上限应为 14，实际", d99.throwSpeed);
console.assert(d99.gravity === 0.38, "[difficulty] gravity 上限应为 0.38，实际", d99.gravity);
console.assert(d99.bombChance === 0.32, "[difficulty] bombChance 上限应为 0.32，实际", d99.bombChance);
console.assert(d99.fruitRadius === 28, "[difficulty] fruitRadius 下限应为 28，实际", d99.fruitRadius);
console.assert(d99.comboWindowMs === 480, "[difficulty] comboWindowMs 下限应为 480，实际", d99.comboWindowMs);
