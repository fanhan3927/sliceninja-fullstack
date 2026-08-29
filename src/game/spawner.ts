/**
 * 生成器（Spawner）：按 RuntimeParams 计时抛出，支持多连抛与炸弹混入。
 * 所有数值均来自参数对象 / constants，禁止写死魔法数。
 */

import {
  FRUIT_KINDS,
  CANVAS_W,
  SPAWN_MAX_APEX_PX,
  SPAWN_X_GAP,
  SPAWN_X_MAX,
  SPAWN_X_MIN,
  SPAWN_Y,
  THROW_VY_SCALE,
} from "./constants";
import type { FruitKind, RuntimeParams } from "./types";

export interface SpawnDescriptor {
  kind: "fruit" | "bomb";
  fruit: FruitKind | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * 计算单只的初速度：
 * - vy 向上（负）：throwSpeed × THROW_VY_SCALE 映射到 px/step，并夹到
 *   「最高点不超过 SPAWN_MAX_APEX_PX」以内（高等级重力/速度增大时防止飞出屏幕顶端太久）；
 * - vx：使水果在到达最高点时横向接近屏幕中轴附近（±160px 随机），保证可玩性。
 */
export function computeLaunch(
  x: number,
  params: RuntimeParams,
  rand: () => number = Math.random
): { vx: number; vy: number } {
  const speed = params.throwSpeed;
  const g = params.gravity;

  let vy = -(speed * THROW_VY_SCALE * (0.92 + rand() * 0.16));
  const vyMax = Math.sqrt(2 * g * SPAWN_MAX_APEX_PX); // 由能量守恒推导
  if (-vy > vyMax) vy = -vyMax;

  const timeToApex = -vy / g; // px/step ÷ px/step² = steps
  const targetX = CANVAS_W / 2 + (rand() * 2 - 1) * 160;
  const vx = (targetX - x) / Math.max(1, timeToApex);

  return { vx, vy };
}

export class Spawner {
  private accMs = 0;

  reset(): void {
    this.accMs = 0;
  }

  /** 累积计时；到达 spawnIntervalMs 生成一波。返回描述符列表或 null。 */
  update(
    dtMs: number,
    params: RuntimeParams,
    rand: () => number = Math.random
  ): SpawnDescriptor[] | null {
    this.accMs += dtMs;
    if (this.accMs < params.spawnIntervalMs) return null;
    this.accMs -= params.spawnIntervalMs;
    return this.buildWave(params, rand);
  }

  private buildWave(params: RuntimeParams, rand: () => number): SpawnDescriptor[] {
    // 单波数量：Level 3+ 概率 2 连抛，Level 6+ 概率 3 连抛（先掷三连再掷二连）
    let count = 1;
    if (params.level >= params.startTripleLevel && rand() < params.tripleChance) {
      count = 3;
    } else if (params.level >= params.startDoubleLevel && rand() < params.doubleChance) {
      count = 2;
    }

    // x 散布：随机起点，相邻间距 ≥ SPAWN_X_GAP（带尝试上限防死循环）
    const xs: number[] = [];
    let attempts = 0;
    while (xs.length < count && attempts < 60) {
      attempts += 1;
      const x = SPAWN_X_MIN + rand() * (SPAWN_X_MAX - SPAWN_X_MIN);
      if (xs.every((v) => Math.abs(v - x) >= SPAWN_X_GAP)) xs.push(x);
    }
    while (xs.length < count) xs.push(SPAWN_X_MIN + rand() * (SPAWN_X_MAX - SPAWN_X_MIN));

    const out: SpawnDescriptor[] = [];
    let bombRolled = false; // 每波至多 1 颗炸弹
    for (const x of xs) {
      const { vx, vy } = computeLaunch(x, params, rand);
      const isBomb = !bombRolled && params.bombChance > 0 && rand() < params.bombChance;
      if (isBomb) bombRolled = true;

      if (isBomb) {
        out.push({ kind: "bomb", fruit: null, x, y: SPAWN_Y, vx, vy });
      } else {
        const kind = FRUIT_KINDS[Math.floor(rand() * FRUIT_KINDS.length)];
        out.push({ kind: "fruit", fruit: kind, x, y: SPAWN_Y, vx, vy });
      }
    }
    return out;
  }
}
