/** 游戏实体与配置类型 —— 全部显式类型，禁止 any */

export type FruitKind =
  | "watermelon"
  | "apple"
  | "orange"
  | "banana"
  | "kiwi"
  | "pineapple";

export type EntityKind = "fruit" | "bomb";

/** 抛出的完整水果 / 炸弹（切开后被替换为两个 HalfEntity） */
export interface Entity {
  id: number;
  kind: EntityKind;
  /** bomb 时为 null */
  fruit: FruitKind | null;
  x: number;
  y: number;
  /** px/step（60Hz 固定步长） */
  vx: number;
  vy: number;
  radius: number;
  rot: number;
  vrot: number;
  sliced: boolean;
  /** 炸弹引线闪烁相位 */
  fusePhase: number;
}

/** 切开后的半瓣 */
export interface HalfEntity {
  fruit: FruitKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  rot: number;
  vrot: number;
  /** 切割线方向角（用于把原图对切） */
  sliceAngle: number;
  side: -1 | 1;
  ageMs: number;
  maxAgeMs: number;
}

/** 果汁 / 火花粒子 */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  ageMs: number;
  maxAgeMs: number;
  /** 0 = 无重力，1 = 全重力 */
  gravityScale: number;
}

/** 刀光轨迹采样点（逻辑坐标 + 时间戳） */
export interface BladePoint {
  x: number;
  y: number;
  t: number;
}

/** 服务端可覆盖的难度配置（前后端共用形状，见 TECH_DESIGN.md） */
export interface DifficultyConfig {
  spawnIntervalMs: { base: number; perLevel: number; min: number };
  fruitsPerWave: {
    startDoubleLevel: number;
    startTripleLevel: number;
    doubleChance: number;
    tripleChance: number;
  };
  throwSpeed: { base: number; perLevel: number; max: number };
  gravity: { base: number; perLevel: number; max: number };
  bombChance: { startLevel: number; base: number; perLevel: number; max: number };
  fruitRadius: { base: number; perLevel: number; min: number };
  comboWindowMs: { base: number; perLevel: number; min: number };
  fruitsToLevelUp: { base: number; perLevel: number };
  lives: number;
  bombEndsGame: boolean;
  scorePerFruit: number;
  comboBonus: number;
}

/** 某一等级下的运行时参数（getDifficulty 纯函数输出） */
export interface RuntimeParams {
  level: number;
  spawnIntervalMs: number;
  startDoubleLevel: number;
  startTripleLevel: number;
  doubleChance: number;
  tripleChance: number;
  throwSpeed: number;
  gravity: number;
  bombChance: number;
  fruitRadius: number;
  comboWindowMs: number;
  /** 离开当前等级升到下一级所需的累计切开数增量 */
  fruitsToLevelUp: number;
  lives: number;
  bombEndsGame: boolean;
  scorePerFruit: number;
  comboBonus: number;
}

export type GameState = "idle" | "running" | "paused" | "ended";

/** 引擎 → React HUD 的快照（10Hz 节流推送，绝不包含实体数组） */
export interface GameSnapshot {
  state: GameState;
  score: number;
  combo: number;
  comboActive: boolean;
  maxCombo: number;
  level: number;
  lives: number;
  misses: number;
  fruitsSliced: number;
  fruitsMissed: number;
  bombsHit: number;
  elapsedMs: number;
  /** 距离下一级还差几个 */
  nextLevelIn: number;
  fps: number;
}

export type EndReason = "MISS" | "BOMB" | "QUIT";

export type GameEvent =
  | { type: "slice"; fruit: FruitKind; points: number; combo: number }
  | { type: "bomb" }
  | { type: "miss" }
  | { type: "combo"; count: number }
  | { type: "levelup"; level: number }
  | { type: "end"; reason: EndReason };

/** 资源加载进度（图片 x/y · 音频 x/y） */
export interface LoadProgress {
  imagesLoaded: number;
  imagesTotal: number;
  audioLoaded: number;
  audioTotal: number;
}
