/**
 * 计分与连击（与 TECH_DESIGN / score-guard 服务端公式一致）：
 * - 基础分 = scorePerFruit × (1 + floor((level − 1) / 3))
 * - 连击：窗口内第 n 个（n ≥ 3）额外 + comboBonus × (n − 2)
 * - Level 由累计切开数对照前缀和阈值表推导（levelForSliced）
 */

import { fruitsToLevelUpFor, levelForSliced } from "./difficulty";
import type { DifficultyConfig, RuntimeParams } from "./types";

export class Scoring {
  score = 0;
  chain = 0;
  maxCombo = 0;
  /** 连击窗口过期时刻（ms） */
  comboExpireAt = 0;
  comboActive = false;
  sliced = 0;

  private config: DifficultyConfig;

  constructor(config: DifficultyConfig) {
    this.config = config;
  }

  static baseMultiplier(level: number): number {
    return 1 + Math.floor((level - 1) / 3);
  }

  reset(): void {
    this.score = 0;
    this.chain = 0;
    this.maxCombo = 0;
    this.comboExpireAt = 0;
    this.comboActive = false;
    this.sliced = 0;
  }

  /** 每帧调用：连击窗口过期则关闭高亮 */
  update(nowMs: number): void {
    if (nowMs > this.comboExpireAt) this.comboActive = false;
  }

  /**
   * 记录一次切开。返回得分与连击信息。
   */
  onSlice(nowMs: number, params: RuntimeParams): { points: number; combo: number; isComboStart: boolean } {
    const combo = this.chain > 0 && nowMs <= this.comboExpireAt ? this.chain + 1 : 1;
    this.chain = combo;
    this.comboExpireAt = nowMs + params.comboWindowMs;
    this.comboActive = combo >= 2;
    if (combo > this.maxCombo) this.maxCombo = combo;

    this.sliced += 1;

    const base = params.scorePerFruit * Scoring.baseMultiplier(params.level);
    const bonus = combo >= 3 ? params.comboBonus * (combo - 2) : 0;
    this.score += base + bonus;

    return { points: base + bonus, combo, isComboStart: combo === 3 };
  }

  /** 当前等级（由累计切开数推导） */
  levelNow(): number {
    return levelForSliced(this.sliced, this.config);
  }

  /** 距离下一级还差几个（HUD 用） */
  nextLevelIn(level: number): number {
    let prefix = 0;
    for (let l = 1; l < level; l++) prefix += fruitsToLevelUpFor(l, this.config);
    const progress = Math.max(0, this.sliced - prefix);
    const need = fruitsToLevelUpFor(level, this.config);
    return Math.max(0, need - progress);
  }
}
