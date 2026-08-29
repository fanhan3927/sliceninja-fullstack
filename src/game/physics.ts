/**
 * 物理：60Hz 固定步长积分（px/step），dt 由引擎换算为整数步后调用。
 * 重力作用于 vy；位置与旋转每步累加。
 */

import { CANVAS_H, CANVAS_W } from "./constants";
import type { Entity, HalfEntity, Particle } from "./types";

export function integrateEntity(e: Entity, gravity: number): void {
  e.vy += gravity;
  e.x += e.vx;
  e.y += e.vy;
  e.rot += e.vrot;
}

export function integrateHalf(h: HalfEntity, gravity: number): void {
  h.vy += gravity;
  h.x += h.vx;
  h.y += h.vy;
  h.rot += h.vrot;
}

export function integrateParticle(p: Particle, gravity: number): void {
  p.vy += gravity * p.gravityScale;
  p.x += p.vx;
  p.y += p.vy;
}

/**
 * 出界检测（miss 定义）：未切开的水果落出底部（y > 720 + radius）即算漏切。
 * 左右出界的未切水果不算 miss（生成时已瞄准屏幕中轴，正常不会发生）。
 */
export function isMissedFruit(e: Entity): boolean {
  return e.kind === "fruit" && !e.sliced && e.y - e.radius > CANVAS_H;
}

/** 彻底离开舞台（含侧边），可以移除实体 */
export function isOffscreen(e: Entity): boolean {
  const margin = 200;
  return (
    e.y - e.radius > CANVAS_H + margin ||
    e.x < -e.radius - margin ||
    e.x > CANVAS_W + e.radius + margin
  );
}
