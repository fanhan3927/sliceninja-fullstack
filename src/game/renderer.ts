/**
 * 渲染器：只画 Canvas，不碰 DOM。
 * - 背景：dojo-bg.jpg 或程序化暗木渐变；
 * - 水果：图片（旋转）或占位圆盘；炸弹：图片/圆球 + 引线火花闪烁；
 * - 切开分瓣：沿切割线对切原图（无图则半圆盘），飞散旋转；
 * - 刀光：白金渐隐折线（两遍绘制：金色外光 + 白色核心），lighter 合成；
 * - 粒子：果汁 / 火花。
 */

import { CANVAS_H, CANVAS_W, FRUIT_COLORS } from "./constants";
import type { ImageKey } from "./assets";
import type { Blade } from "./blade";
import type { Entity, HalfEntity } from "./types";

export interface RenderAssets {
  images: Partial<Record<ImageKey, HTMLImageElement>>;
}

export interface RenderState {
  entities: readonly Entity[];
  halves: readonly HalfEntity[];
  particles: readonly { x: number; y: number; size: number; color: string; ageMs: number; maxAgeMs: number }[];
  blade: Blade;
  timeMs: number;
  paused: boolean;
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  state: RenderState,
  assets: RenderAssets,
  canvasW: number,
  canvasH: number
): void {
  // 逻辑分辨率 1280×720 → 画布物理像素
  ctx.setTransform(canvasW / CANVAS_W, 0, 0, canvasH / CANVAS_H, 0, 0);
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  drawBackground(ctx, assets);
  for (const half of state.halves) drawHalf(ctx, half, assets);
  for (const e of state.entities) drawEntity(ctx, e, assets, state.timeMs);
  drawParticles(ctx, state.particles);
  drawBlade(ctx, state.blade);

  if (state.paused) {
    ctx.fillStyle = "rgba(10, 6, 4, 0.45)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
}

function drawBackground(ctx: CanvasRenderingContext2D, assets: RenderAssets): void {
  const img = assets.images["dojo-bg"];
  if (img) {
    ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
    return;
  }
  // 程序化暗木：纵向渐变 + 板条缝
  const g = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  g.addColorStop(0, "#2a1a10");
  g.addColorStop(0.55, "#1e130b");
  g.addColorStop(1, "#120b06");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 2;
  for (let y = 0; y < CANVAS_H; y += 96) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_W, y);
    ctx.stroke();
  }
}

function drawEntity(
  ctx: CanvasRenderingContext2D,
  e: Entity,
  assets: RenderAssets,
  timeMs: number
): void {
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.rot);

  if (e.kind === "bomb") {
    drawBomb(ctx, e, assets, timeMs);
  } else {
    const key = e.fruit ?? "watermelon";
    const img = assets.images[key];
    if (img) {
      ctx.drawImage(img, -e.radius, -e.radius, e.radius * 2, e.radius * 2);
    } else {
      const c = FRUIT_COLORS[key];
      ctx.fillStyle = c.body;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = c.rim;
      ctx.lineWidth = 4;
      ctx.stroke();
      // 高光
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.arc(-e.radius * 0.3, -e.radius * 0.3, e.radius * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawBomb(
  ctx: CanvasRenderingContext2D,
  e: Entity,
  assets: RenderAssets,
  timeMs: number
): void {
  const img = assets.images["bomb"];
  if (img) {
    ctx.drawImage(img, -e.radius, -e.radius, e.radius * 2, e.radius * 2);
  } else {
    ctx.fillStyle = "#26211c";
    ctx.beginPath();
    ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#4a3f33";
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.beginPath();
    ctx.arc(-e.radius * 0.28, -e.radius * 0.28, e.radius * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // 引线火花：正弦闪烁（叠加发光）
  const flicker = 0.55 + 0.45 * Math.sin(timeMs / 55 + e.fusePhase);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = `rgba(255, ${Math.round(140 + 90 * flicker)}, 40, ${0.55 + 0.4 * flicker})`;
  ctx.beginPath();
  ctx.arc(0, -e.radius * 0.92, e.radius * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(255, 240, 190, ${0.7 * flicker})`;
  ctx.beginPath();
  ctx.arc(0, -e.radius * 0.92, e.radius * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 切开分瓣：旋转到切割线对齐 x 轴后按 side 裁剪半平面，先画果肉切面再叠图像 */
function drawHalf(ctx: CanvasRenderingContext2D, h: HalfEntity, assets: RenderAssets): void {
  const c = FRUIT_COLORS[h.fruit];
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(h.rot - h.sliceAngle);

  // 果肉切面（叠加在图像下，沿切边露出 2px 亮边）
  ctx.fillStyle = c.juice;
  ctx.globalAlpha = 0.95;
  ctx.beginPath();
  ctx.arc(0, 0, h.radius, h.side === 1 ? 0 : Math.PI, h.side === 1 ? Math.PI : Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // 图像半平面（沿法线方向外移 2px，露出切面）
  const img = assets.images[h.fruit];
  if (img) {
    ctx.save();
    const yOff = h.side * 2;
    ctx.beginPath();
    ctx.rect(-h.radius, h.side === 1 ? yOff : -h.radius + yOff, h.radius * 2, h.radius);
    ctx.clip();
    ctx.drawImage(img, -h.radius, -h.radius, h.radius * 2, h.radius * 2);
    ctx.restore();
  } else {
    ctx.fillStyle = c.body;
    ctx.beginPath();
    ctx.arc(0, h.side * 2, h.radius, h.side === 1 ? 0 : Math.PI, h.side === 1 ? Math.PI : Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: readonly { x: number; y: number; size: number; color: string; ageMs: number; maxAgeMs: number }[]
): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of particles) {
    const life = 1 - p.ageMs / p.maxAgeMs;
    if (life <= 0) continue;
    ctx.globalAlpha = life * 0.9;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.5 + 0.5 * life), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** 刀光：白金渐隐折线（金外光 + 白核心），随轨迹点年龄衰减 */
function drawBlade(ctx: CanvasRenderingContext2D, blade: Blade): void {
  const pts = blade.trail;
  if (pts.length < 2) return;
  const now = pts[pts.length - 1].t;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // 金色外光
  ctx.strokeStyle = "#f0b542";
  drawTaperedPolyline(ctx, pts, now, 18, 4);
  // 白色核心
  ctx.strokeStyle = "#fff7e0";
  drawTaperedPolyline(ctx, pts, now, 9, 1.5);

  ctx.restore();
}

function drawTaperedPolyline(
  ctx: CanvasRenderingContext2D,
  pts: readonly { x: number; y: number; t: number }[],
  now: number,
  widthStart: number,
  widthEnd: number
): void {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const fade = Math.min(1, (now - a.t) / 140);
    ctx.globalAlpha = (1 - fade) * 0.85 + 0.1;
    ctx.lineWidth = widthStart - (widthStart - widthEnd) * fade;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
