/**
 * 水果 / 炸弹实体工厂与切开分瓣生成。
 */

import { HALF_IMPULSE, HALF_LIFE_MS } from "./constants";
import type { Entity, FruitKind, HalfEntity } from "./types";

let nextId = 1;

export function createFruit(
  kind: FruitKind,
  x: number,
  y: number,
  vx: number,
  vy: number,
  radius: number
): Entity {
  return {
    id: nextId++,
    kind: "fruit",
    fruit: kind,
    x,
    y,
    vx,
    vy,
    radius,
    rot: (Math.random() - 0.5) * 0.6,
    vrot: (Math.random() - 0.5) * 0.12,
    sliced: false,
    fusePhase: Math.random() * Math.PI * 2,
  };
}

export function createBomb(
  x: number,
  y: number,
  vx: number,
  vy: number,
  radius: number
): Entity {
  return {
    id: nextId++,
    kind: "bomb",
    fruit: null,
    x,
    y,
    vx,
    vy,
    radius,
    rot: (Math.random() - 0.5) * 0.4,
    vrot: (Math.random() - 0.5) * 0.1,
    sliced: false, // 被刀切中后引擎置 true 并触发爆炸
    fusePhase: Math.random() * Math.PI * 2,
  };
}

/**
 * 切开 → 两瓣：沿切割法线（刀路方向旋转 90°）分别施加 ±HALF_IMPULSE 冲量，
 * 并叠加随机旋转角速度，让两瓣旋转飞开。
 */
export function makeHalves(e: Entity, sliceAngle: number): [HalfEntity, HalfEntity] {
  const fruit = e.fruit ?? "watermelon";
  // 法线向量：与刀路方向垂直
  const nx = -Math.sin(sliceAngle);
  const ny = Math.cos(sliceAngle);

  const half = (side: -1 | 1): HalfEntity => ({
    fruit,
    x: e.x,
    y: e.y,
    vx: e.vx + nx * HALF_IMPULSE * side,
    vy: e.vy + ny * HALF_IMPULSE * side,
    radius: e.radius,
    rot: e.rot,
    vrot: (Math.random() - 0.5) * 0.28,
    sliceAngle,
    side,
    ageMs: 0,
    maxAgeMs: HALF_LIFE_MS,
  });

  return [half(-1), half(1)];
}
