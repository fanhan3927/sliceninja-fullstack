/**
 * 引擎：rAF 主循环 + 固定步长物理 + 状态机（idle / running / paused / ended）。
 *
 * 帧循环顺序（TECH_DESIGN）：
 *   input → blade 更新 → spawn → integrate 物理 → 切割判定 → 粒子 → render → snapshot(10Hz)
 * - dt clamp 33ms；暂停时不做 spawn / 物理 / 切割；
 * - 切中瞬间 hit-stop（HIT_STOP_MS）冻结世界一小拍增强手感；
 * - 只通过 onSnapshot（10Hz 标量）与 onEvent 与 React 通信，绝不外泄实体数组。
 */

import { attachInput } from "./input";
import { Blade, segmentCircleHit } from "./blade";
import { createBomb, createFruit, makeHalves } from "./fruit";
import { getDifficulty } from "./difficulty";
import { ParticleSystem } from "./particles";
import { Scoring } from "./scoring";
import { Spawner, type SpawnDescriptor } from "./spawner";
import {
  integrateEntity,
  integrateHalf,
  isMissedFruit,
} from "./physics";
import { renderFrame, type RenderAssets } from "./renderer";
import type { AudioManager } from "./audio";
import {
  CANVAS_H,
  FRAME_DT_CLAMP_MS,
  FRUIT_COLORS,
  HIT_STOP_MS,
  MAX_STEPS_PER_FRAME,
  SNAPSHOT_INTERVAL_MS,
  STEP_MS,
} from "./constants";
import type {
  DifficultyConfig,
  EndReason,
  Entity,
  GameEvent,
  GameSnapshot,
  GameState,
  HalfEntity,
  RuntimeParams,
} from "./types";

export interface GameHandlers {
  config: DifficultyConfig;
  audio: AudioManager;
  assets: RenderAssets;
  onSnapshot: (s: GameSnapshot) => void;
  onEvent: (e: GameEvent) => void;
}

export interface GameHandle {
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  destroy: () => void;
  getSnapshot: () => GameSnapshot;
}

export function createGame(canvas: HTMLCanvasElement, handlers: GameHandlers): GameHandle {
  const { config, audio, assets, onSnapshot, onEvent } = handlers;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  let state: GameState = "idle";
  let entities: Entity[] = [];
  let halves: HalfEntity[] = [];
  const particles = new ParticleSystem();
  const blade = new Blade();
  const spawner = new Spawner();
  const scoring = new Scoring(config);

  let level = 1;
  let params: RuntimeParams = getDifficulty(1, config);
  let lives = config.lives;
  let fruitsMissed = 0;
  let bombsHit = 0;
  let elapsedMs = 0;
  let hitStopMs = 0;
  let accStepMs = 0;
  let endReason: EndReason | null = null;
  let fpsEma = 60;
  let lastFrameMs = performance.now();
  let lastSnapshotMs = 0;
  let rafId = 0;
  let destroyed = false;

  /* ---------- canvas 尺寸（逻辑 1280×720，物理按 DPR 缩放） ---------- */
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
  };
  resize();
  window.addEventListener("resize", resize);

  /* ---------- 输入（屏幕坐标 → 逻辑坐标） ---------- */
  const map = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    const x = rect.width > 0 ? ((clientX - rect.left) / rect.width) * 1280 : 0;
    const y = rect.height > 0 ? ((clientY - rect.top) / rect.height) * 720 : 0;
    return { x, y };
  };
  const cleanupInput = attachInput(canvas, map, {
    onDown: (p) => {
      if (destroyed || state !== "running") return;
      blade.begin(p.x, p.y, performance.now());
    },
    onMove: (p) => {
      if (destroyed || state !== "running") return;
      blade.move(p.x, p.y, performance.now());
    },
    onUp: () => {
      if (destroyed) return;
      blade.end();
    },
  });

  /* ---------- 快照 ---------- */
  const buildSnapshot = (): GameSnapshot => ({
    state,
    score: scoring.score,
    combo: scoring.comboActive ? scoring.chain : 0,
    comboActive: scoring.comboActive,
    maxCombo: scoring.maxCombo,
    level,
    lives,
    misses: fruitsMissed,
    fruitsSliced: scoring.sliced,
    fruitsMissed,
    bombsHit,
    elapsedMs: Math.round(elapsedMs), // 取整毫秒（POST /api/sessions 的 zod 要求 int）
    nextLevelIn: scoring.nextLevelIn(level),
    fps: Math.round(fpsEma),
  });

  const pushSnapshot = (force = false) => {
    if (destroyed) return;
    const now = performance.now();
    if (!force && now - lastSnapshotMs < SNAPSHOT_INTERVAL_MS) return;
    lastSnapshotMs = now;
    onSnapshot(buildSnapshot());
  };

  /* ---------- 状态机 ---------- */
  const reset = () => {
    entities = [];
    halves = [];
    particles.clear();
    blade.end();
    scoring.reset();
    spawner.reset();
    level = 1;
    params = getDifficulty(1, config);
    lives = config.lives;
    fruitsMissed = 0;
    bombsHit = 0;
    elapsedMs = 0;
    hitStopMs = 0;
    accStepMs = 0;
    endReason = null;
  };

  const start = () => {
    if (destroyed) return;
    reset();
    state = "running";
    lastFrameMs = performance.now();
    pushSnapshot(true);
  };

  const pause = () => {
    if (state !== "running") return;
    state = "paused";
    audio.setBgmDucked(true);
    pushSnapshot(true);
  };

  const resume = () => {
    if (state !== "paused") return;
    state = "running";
    lastFrameMs = performance.now();
    audio.setBgmDucked(false);
    pushSnapshot(true);
  };

  const end = (reason: EndReason) => {
    if (state === "ended") return;
    endReason = reason;
    state = "ended";
    blade.end();
    onEvent({ type: "end", reason });
    pushSnapshot(true);
  };

  /* ---------- 实体工厂 ---------- */
  const makeEntity = (d: SpawnDescriptor): Entity => {
    const radius = params.fruitRadius;
    if (d.kind === "bomb") return createBomb(d.x, d.y, d.vx, d.vy, radius * 0.92);
    return createFruit(d.fruit ?? "watermelon", d.x, d.y, d.vx, d.vy, radius);
  };

  /* ---------- 单步（60Hz） ---------- */
  const step = (stepMs: number, nowMs: number) => {
    // 1) spawn
    const wave = spawner.update(stepMs, params);
    if (wave) {
      for (const d of wave) entities.push(makeEntity(d));
    }

    // 2) 物理积分（未切水果 / 未爆炸弹）
    for (const e of entities) {
      if (!e.sliced) integrateEntity(e, params.gravity);
    }

    // 3) 分瓣
    for (let i = halves.length - 1; i >= 0; i--) {
      const h = halves[i];
      integrateHalf(h, params.gravity);
      h.ageMs += stepMs;
      if (h.ageMs >= h.maxAgeMs || h.y > CANVAS_H + 180) {
        halves.splice(i, 1);
      }
    }

    // 4) 粒子
    particles.update(params.gravity, stepMs);

    // 5) 漏切判定（出底）→ 扣命 / Game Over
    for (let i = entities.length - 1; i >= 0; i--) {
      const e = entities[i];
      if (e.sliced) {
        entities.splice(i, 1);
        continue;
      }
      if (isMissedFruit(e)) {
        entities.splice(i, 1);
        fruitsMissed += 1;
        lives -= 1;
        onEvent({ type: "miss" });
        if (lives <= 0) {
          end("MISS");
          return;
        }
      }
    }

    // 6) 切割判定（本帧新刀路 × 未切实体）
    const segments = blade.takeSegments();
    if (segments.length > 0 && blade.tipSpeedOk(nowMs)) {
      for (const e of [...entities]) {
        if (e.sliced) continue;
        for (const [a, b] of segments) {
          const hit = segmentCircleHit(a, b, e.x, e.y, e.radius);
          if (!hit.hit) continue;

          const idx = entities.indexOf(e);
          if (idx < 0) break;

          if (e.kind === "bomb") {
            // 切炸弹 → 爆炸 → 按配置立即结束
            e.sliced = true;
            bombsHit += 1;
            entities.splice(idx, 1);
            particles.burst(e.x, e.y, "#ffb020", 26, 2, 6, 0.4);
            particles.burst(e.x, e.y, "#ff5a30", 14, 1.5, 4.5, 0.4);
            onEvent({ type: "bomb" });
            if (config.bombEndsGame) {
              end("BOMB");
            }
            return;
          }

          // 水果 → 分瓣 + 果汁 + 计分
          entities.splice(idx, 1);
          const [h1, h2] = makeHalves(e, hit.angle);
          halves.push(h1, h2);
          const juice = FRUIT_COLORS[e.fruit ?? "watermelon"].juice;
          particles.burst(e.x, e.y, juice, 18, 1.5, 5, 0.35);
          hitStopMs = HIT_STOP_MS;

          const r = scoring.onSlice(nowMs, params);
          onEvent({ type: "slice", fruit: e.fruit ?? "watermelon", points: r.points, combo: r.combo });
          if (r.isComboStart) onEvent({ type: "combo", count: r.combo });

          // 升级判定（按累计切开数）
          const newLevel = scoring.levelNow();
          if (newLevel > level) {
            level = newLevel;
            params = getDifficulty(level, config);
            onEvent({ type: "levelup", level });
          }
          break; // 该实体本帧只切一次
        }
        if (endReason !== null) return; // 炸弹结束时立即退出本步
      }
    }

    // 7) 计时
    elapsedMs += stepMs;
  };

  /* ---------- 主循环 ---------- */
  const loop = (nowMs: number) => {
    if (destroyed) return;

    const frameDt = Math.min(nowMs - lastFrameMs, FRAME_DT_CLAMP_MS);
    lastFrameMs = nowMs;
    if (frameDt > 0) fpsEma = fpsEma * 0.9 + 0.1 * (1000 / frameDt);

    if (state === "running") {
      blade.prune(nowMs);
      if (hitStopMs > 0) {
        // hit-stop：世界冻结，仅推进冻结计时
        hitStopMs -= frameDt;
      } else {
        accStepMs += frameDt;
        const steps = Math.min(Math.floor(accStepMs / STEP_MS), MAX_STEPS_PER_FRAME);
        accStepMs -= steps * STEP_MS;
        for (let i = 0; i < steps; i++) step(STEP_MS, nowMs);
      }
      scoring.update(nowMs);
    }

    renderFrame(
      ctx,
      {
        entities,
        halves,
        particles: particles.items,
        blade,
        timeMs: nowMs,
        paused: state === "paused",
      },
      assets,
      canvas.width,
      canvas.height
    );

    pushSnapshot(false);
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);

  /* ---------- 销毁 ---------- */
  const destroy = () => {
    destroyed = true;
    cancelAnimationFrame(rafId);
    cleanupInput();
    window.removeEventListener("resize", resize);
    audio.setBgmDucked(false);
  };

  return { start, pause, resume, reset, destroy, getSnapshot: buildSnapshot };
}
