/**
 * SliceNinja 集中配置 —— 所有难度数值只允许来自这里（或服务端 GameConfig 合并后的对象），
 * 禁止在 spawner / engine 里散落魔法数。
 *
 * DifficultyConfig 数值与 PRD「动态难度机制」表逐项对应：
 * - 出果间隔：Level 1 = 1400ms，每级 -80ms，下限 420ms
 * - 单波数量：Level 1 = 1；Level 3+ 有概率 2 连抛；Level 6+ 有概率 3 连抛
 * - 初速度 throwSpeed：7.2，每级 +0.35，上限 14（单位：px/step，60Hz 固定步长）
 * - 重力 gravity：0.18，每级 +0.012，上限 0.38（单位：px/step²）
 * - 炸弹率 bombChance：Level 1 = 0，Level 2 = 0.08，之后每级 +0.035，上限 0.32
 * - 水果半径：42px，每级 -1.2px，下限 28px
 * - 连击窗口：900ms，每级 -30ms，下限 480ms
 * - 升级所需切开数：8 + 2×Level（见 difficulty.ts 顶部注释的口径说明）
 */

import type { DifficultyConfig } from "./types";

export const DEFAULT_DIFFICULTY: DifficultyConfig = {
  spawnIntervalMs: { base: 1400, perLevel: -80, min: 420 },
  fruitsPerWave: {
    startDoubleLevel: 3,
    startTripleLevel: 6,
    doubleChance: 0.45,
    tripleChance: 0.3,
  },
  throwSpeed: { base: 7.2, perLevel: 0.35, max: 14 },
  gravity: { base: 0.18, perLevel: 0.012, max: 0.38 },
  bombChance: { startLevel: 2, base: 0.08, perLevel: 0.035, max: 0.32 },
  fruitRadius: { base: 42, perLevel: -1.2, min: 28 },
  comboWindowMs: { base: 900, perLevel: -30, min: 480 },
  fruitsToLevelUp: { base: 8, perLevel: 2 },
  lives: 3,
  bombEndsGame: true,
  scorePerFruit: 10,
  comboBonus: 5,
};

/** 逻辑分辨率：物理与切割判定全部在该坐标系进行，CSS 负责缩放适配 */
export const CANVAS_W = 1280;
export const CANVAS_H = 720;

/** 固定物理步长（60Hz）：throwSpeed / gravity / 分瓣冲量的单位均为 px/step */
export const STEP_MS = 1000 / 60;
export const MAX_STEPS_PER_FRAME = 4;

/** 引擎每帧 dt clamp 上限（PRD/技术设计要求 33ms） */
export const FRAME_DT_CLAMP_MS = 33;

/** 刀光轨迹保留时长（渐隐用） */
export const BLADE_TRAIL_MS = 140;
/** 切割速度阈值：最近 80ms 内指针位移 > 18px（0.225 px/ms）才可能切开，防点按秒杀 */
export const SLICE_MIN_SPEED_PX_PER_MS = 18 / 80;
/** 切割速度取样窗口 */
export const SLICE_SPEED_WINDOW_MS = 80;

/** 切开后两瓣沿切割法线获得 ±3.2 px/step 冲量 */
export const HALF_IMPULSE = 3.2;
/** 分瓣存活时长上限 */
export const HALF_LIFE_MS = 900;

/** 粒子上限（对象池回收） */
export const PARTICLE_CAP = 120;

/** 切中瞬间 hit-stop，增强停顿手感 */
export const HIT_STOP_MS = 32;

/** 引擎向 React 推送 snapshot 的节流频率 */
export const SNAPSHOT_INTERVAL_MS = 100;

/** 出果出生 x 范围与同波相邻最小间距 */
export const SPAWN_X_MIN = 120;
export const SPAWN_X_MAX = 1160;
export const SPAWN_X_GAP = 80;
/** 出生 y（画布下沿外） */
export const SPAWN_Y = CANVAS_H + 40;
/** throwSpeed（px/step）→ 垂直初速度的映射系数（L1 时约 13.4 px/step，最高点 ≈ 500px 高） */
export const THROW_VY_SCALE = 1.86;
/** 单只最高点相对出生点的最大抬升高度，防止高等级飞出屏幕顶端太久 */
export const SPAWN_MAX_APEX_PX = 680;

/** 刀光可触发切割的最大冷却（同一帧内多次 move 合并） */
export const BLADE_MAX_POINTS = 10;

/** 水果种类清单（与图片资源一一对应） */
export const FRUIT_KINDS = [
  "watermelon",
  "apple",
  "orange",
  "banana",
  "kiwi",
  "pineapple",
] as const;

/** 每种水果的果汁颜色（粒子）与占位圆盘主色（渲染兜底） */
export const FRUIT_COLORS: Record<
  (typeof FRUIT_KINDS)[number],
  { juice: string; body: string; rim: string }
> = {
  watermelon: { juice: "#e5484d", body: "#2f9e44", rim: "#1e7a30" },
  apple: { juice: "#f3e2c0", body: "#d64545", rim: "#a52d2d" },
  orange: { juice: "#ffa02e", body: "#f79009", rim: "#c26a00" },
  banana: { juice: "#ffe27a", body: "#f5c542", rim: "#c79a1d" },
  kiwi: { juice: "#8ac926", body: "#8a5a33", rim: "#6b421f" },
  pineapple: { juice: "#ffd43b", body: "#e8b02e", rim: "#b07d14" },
};

/** localStorage 键 */
export const LS_KEY_BEST = "sliceninja.best";
export const LS_KEY_MUTED = "sliceninja.muted";
