/**
 * 服务端分数合理性校验（score-guard）。
 *
 * 与客户端同公式重算「理论分数上界」：
 *   基础分上界 = fruitsSliced × scorePerFruit × (1 + floor((levelReached−1)/3))
 *   连击分上界 = comboBonus × Σ_{n=3..maxCombo}(n−2)   （假设全部切开集中在一次最长连击里）
 *   容差 = max(上界 × 15%, 50 分)   —— 超出即 400（技术设计「±15% 或 ±50 分取较大」）
 * 另校验：漏切数 ≤ 生命上限、连击 ≤ 切开数、Level 与切开数自洽（levelForSliced）、
 * 分数不低于理论下限（每次切开至少 scorePerFruit）、时长下限。
 */

import { levelForSliced } from "@/game/difficulty";
import type { DifficultyConfig, EndReason } from "@/game/types";

export interface SessionInput {
  score: number;
  maxCombo: number;
  levelReached: number;
  fruitsSliced: number;
  fruitsMissed: number;
  bombsHit: number;
  durationMs: number;
  endedReason: EndReason;
}

export type ScoreGuardResult = { ok: true } | { ok: false; reason: string };

export function validateSession(input: SessionInput, config: DifficultyConfig): ScoreGuardResult {
  const { score, maxCombo, levelReached, fruitsSliced, fruitsMissed, durationMs } = input;

  if (fruitsMissed > config.lives) {
    return { ok: false, reason: "漏切数超过生命上限" };
  }
  if (maxCombo > fruitsSliced) {
    return { ok: false, reason: "最高连击不能超过切开数" };
  }
  if (levelReached < 1 || levelReached > levelForSliced(fruitsSliced, config)) {
    return { ok: false, reason: "Level 与切开数不符" };
  }
  if (durationMs < 1000 || durationMs > 4 * 3600 * 1000) {
    return { ok: false, reason: "对局时长不合理" };
  }

  // 理论下限：每次切开至少 scorePerFruit
  const minScore = fruitsSliced * config.scorePerFruit;
  if (score < minScore) {
    return { ok: false, reason: "分数低于理论下限" };
  }

  // 理论上限
  const multiplier = 1 + Math.floor((levelReached - 1) / 3);
  const comboBonusTotal =
    maxCombo >= 3 ? (config.comboBonus * (maxCombo - 2) * (maxCombo - 1)) / 2 : 0;
  const expectedMax = fruitsSliced * config.scorePerFruit * multiplier + comboBonusTotal;
  const tolerance = Math.max(expectedMax * 0.15, 50);
  if (score > expectedMax + tolerance) {
    return { ok: false, reason: "分数超出合理范围，疑似伪造" };
  }

  return { ok: true };
}
