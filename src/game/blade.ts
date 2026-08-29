/**
 * 刀光（Blade）与切割判定。
 *
 * 【切割几何】
 * 刀光 = 最近一段时间内指针采样点组成的折线。判定规则：
 *   1) 折线中「本帧新产生」的任一线段，到水果圆心（碰撞体为圆）的距离 ≤ 水果半径；
 *   2) 速度阈值：最近 80ms 窗口内指针位移 > 18px（0.225 px/ms），
 *      防止点击/慢拖瞬间把水果「点杀」。
 * 命中点取线段上离圆心最近的点，其切线方向（线段方向）用于计算切开后两瓣的飞散角。
 */

import {
  BLADE_MAX_POINTS,
  BLADE_TRAIL_MS,
  SLICE_MIN_SPEED_PX_PER_MS,
  SLICE_SPEED_WINDOW_MS,
} from "./constants";
import type { BladePoint } from "./types";

export interface SegmentHit {
  hit: boolean;
  /** 线段上离圆心最近的点（逻辑坐标） */
  px: number;
  py: number;
  /** 刀路方向角（弧度），用于分瓣冲量与切开角 */
  angle: number;
}

/** 线段 (a→b) 与圆 (cx,cy,r) 相交检测 + 最近点 */
export function segmentCircleHit(
  a: BladePoint,
  b: BladePoint,
  cx: number,
  cy: number,
  r: number
): SegmentHit {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 1e-6) {
    t = ((cx - a.x) * dx + (cy - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
  }
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  const dist2 = (px - cx) * (px - cx) + (py - cy) * (py - cy);
  return { hit: dist2 <= r * r, px, py, angle: Math.atan2(dy, dx) };
}

export class Blade {
  private points: BladePoint[] = [];
  /** 本帧新产生的线段（move 时入队，引擎每帧取走） */
  private pending: Array<[BladePoint, BladePoint]> = [];

  begin(x: number, y: number, t: number): void {
    this.points = [{ x, y, t }];
    this.pending = [];
  }

  move(x: number, y: number, t: number): void {
    const prev = this.points[this.points.length - 1];
    if (prev && t - prev.t < 1 && Math.hypot(x - prev.x, y - prev.y) < 2) {
      // 同一帧内的重复采样：只更新最新点，不产生线段
      prev.x = x;
      prev.y = y;
      prev.t = t;
      return;
    }
    if (prev) {
      this.pending.push([{ ...prev }, { x, y, t }]);
    }
    this.points.push({ x, y, t });
    if (this.points.length > BLADE_MAX_POINTS) this.points.shift();
  }

  end(): void {
    this.points = [];
    this.pending = [];
  }

  /** 按时间淘汰过期轨迹点（渐隐） */
  prune(now: number): void {
    if (this.points.length === 0) return;
    const cutoff = now - BLADE_TRAIL_MS;
    while (this.points.length > 0 && this.points[0].t < cutoff) this.points.shift();
    // 同步清掉过期的 pending 线段
    this.pending = this.pending.filter(([a]) => a.t >= cutoff);
  }

  /** 取走本帧产生的线段（随后清空） */
  takeSegments(): Array<[BladePoint, BladePoint]> {
    const segs = this.pending;
    this.pending = [];
    return segs;
  }

  get trail(): readonly BladePoint[] {
    return this.points;
  }

  /** 速度阈值：最近 80ms 位移是否 > 18px（0.225 px/ms） */
  tipSpeedOk(now: number): boolean {
    const pts = this.points;
    if (pts.length < 2) return false;
    const tip = pts[pts.length - 1];
    let base: BladePoint | null = null;
    for (let i = pts.length - 2; i >= 0; i--) {
      if (now - pts[i].t >= SLICE_SPEED_WINDOW_MS - 8) {
        base = pts[i];
        break;
      }
    }
    if (!base) base = pts[0];
    const dt = Math.max(1, tip.t - base.t);
    const dist = Math.hypot(tip.x - base.x, tip.y - base.y);
    return dist / dt >= SLICE_MIN_SPEED_PX_PER_MS;
  }
}
