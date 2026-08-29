# 技术设计 — SliceNinja

## 技术栈

- **框架**：Next.js 15 (App Router) + TypeScript（strict）
- **样式**：Tailwind CSS + 少量 CSS 变量；游戏内 HUD 可用绝对定位
- **游戏渲染**：HTML Canvas 2D（主路径，无重型引擎依赖，便于 AI 一次生成）。可选后续换 PixiJS，首版禁止引入未在 Prompt 中声明的引擎。
- **音频**：Web Audio API 封装 + HTMLAudioElement 兜底；推荐轻量封装自研 `AudioManager`，不要强依赖 Howler（可选用 howler 若已写入 package，但默认自研）。
- **数据库**：Prisma + SQLite（开发） / PostgreSQL（生产）
- **认证**：Auth.js (NextAuth v5) — Credentials（邮箱+密码）+ 可选 GitHub
- **校验**：Zod
- **状态**：
  - 游戏循环：纯模块 + `requestAnimationFrame`，不把每帧状态放进 React
  - 大厅 / 用户：Server Components + Server Actions
  - 设置：localStorage + 可选用户 Preferences 表
- **部署**：Vercel + 托管 Postgres（Neon）；静态资源放 `public/`

## 项目结构

```
src/
  app/
    layout.tsx
    page.tsx                 # 大厅 / 落地页
    play/page.tsx            # 游戏页（client canvas）
    leaderboard/page.tsx
    history/page.tsx
    login/page.tsx
    register/page.tsx
    admin/config/page.tsx
    api/
      auth/[...nextauth]/route.ts
      sessions/route.ts
      leaderboard/route.ts
      config/route.ts
      health/route.ts
  components/
    ui/                      # Button, Modal, Toggle
    hall/Hero.tsx
    game/GameCanvas.tsx
    game/Hud.tsx
    game/GameOverModal.tsx
    game/LoaderOverlay.tsx
  game/
    engine.ts                # rAF loop, pause, dt clamp
    world.ts                 # entities list
    fruit.ts
    bomb.ts
    blade.ts                 # slash trail + intersection
    physics.ts
    spawner.ts               # wave / interval / level
    difficulty.ts            # 纯函数：level → params
    scoring.ts
    particles.ts
    renderer.ts
    input.ts
    audio.ts
    assets.ts                # 资源清单与加载进度
    types.ts
    constants.ts             # 默认难度表
  lib/
    prisma.ts
    auth.ts
    password.ts
    score-guard.ts           # 服务端分数合理性
    utils.ts
  types/
prisma/
  schema.prisma
public/
  audio/                     # 见 PRD 路径约定
  images/
scripts/
  generate-placeholder-assets.mjs  # 用 canvas/ffmpeg 或下载免版权占位
```

## 数据模型（Prisma Schema 概要）

```prisma
model User {
  id            String         @id @default(cuid())
  name          String
  email         String         @unique
  passwordHash  String?
  image         String?
  role          Role           @default(USER)
  createdAt     DateTime       @default(now())
  sessions      GameSession[]
  preference    Preference?
  achievements  UserAchievement[]
}

enum Role {
  USER
  ADMIN
}

model Preference {
  id        String  @id @default(cuid())
  userId    String  @unique
  user      User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  bgmMuted  Boolean @default(false)
  sfxMuted  Boolean @default(false)
}

model GameSession {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  score         Int
  maxCombo      Int
  levelReached  Int
  fruitsSliced  Int
  fruitsMissed  Int
  bombsHit      Int      @default(0)
  durationMs    Int
  endedReason   EndReason
  clientChecksum String? // 简单防篡改签名
  createdAt     DateTime @default(now())

  @@index([score, createdAt])
  @@index([userId, createdAt])
}

enum EndReason {
  MISS
  BOMB
  QUIT
}

model Achievement {
  id          String             @id @default(cuid())
  key         String             @unique
  title       String
  description String
  users       UserAchievement[]
}

model UserAchievement {
  id            String      @id @default(cuid())
  userId        String
  achievementId String
  user          User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  achievement   Achievement @relation(fields: [achievementId], references: [id], onDelete: Cascade)
  unlockedAt    DateTime    @default(now())
  @@unique([userId, achievementId])
}

model GameConfig {
  id          String   @id @default("default")
  version     Int      @default(1)
  json        String   // DifficultyConfig JSON
  updatedAt   DateTime @updatedAt
  updatedBy   String?
}
```

`DifficultyConfig` JSON 形状（前后端共用类型）：

```ts
export type DifficultyConfig = {
  spawnIntervalMs: { base: number; perLevel: number; min: number };
  fruitsPerWave: { startDoubleLevel: number; startTripleLevel: number; doubleChance: number; tripleChance: number };
  throwSpeed: { base: number; perLevel: number; max: number };
  gravity: { base: number; perLevel: number; max: number };
  bombChance: { startLevel: number; base: number; perLevel: number; max: number };
  fruitRadius: { base: number; perLevel: number; min: number };
  comboWindowMs: { base: number; perLevel: number; min: number };
  fruitsToLevelUp: { base: number; perLevel: number };
  lives: number;
  bombEndsGame: boolean;
  scorePerFruit: number;
  comboBonus: number; // extra per fruit in combo starting 3rd
};
```

默认值必须与 PRD 动态难度表一致，写在 `src/game/constants.ts`。

## 游戏核心算法

### 坐标与循环

- Canvas 内部逻辑分辨率：1280×720，CSS 缩放适配。
- `engine.ts`：`dt = min(now - last, 33)`，暂停时不累加 spawner。
- 每帧顺序：input → blade 更新 → spawn → integrate physics → slice test → particles → render → hud snapshot 回调 React（节流 10Hz）。

### 抛物线生成（spawner）

- 出生点：底部随机 x ∈ [120, 1160]，y = 760（画布外）。
- 初速度：`vx` 指向屏幕中轴略带随机（使水果飞向可见区），`vy` 为向上负值，由 `throwSpeed` 映射。
- 波次：到达 `spawnIntervalMs` 后生成 1～N 个，相邻水果 x 错开 ≥ 80px。
- Level 由 `scoring` 在切开计数变化时计算：  
  `level = 1 + floor(sliced / (base + perLevel * currentLevelApprox))`  
  实现上用累计切开数对照前缀和阈值表，避免递归定义。

### 切割判定（blade）

- 记录最近 6～10 个指针采样点 `(x,y,t)`，构成折线。
- 水果碰撞体：圆，半径 `fruitRadius(level)`。
- 判定：折线任一线段到圆心距离 ≤ 半径，且最近 80ms 内指针位移 > 18px（防止点按秒杀）。
- 同一水果每局只切一次；切开后生成两个 `half` 实体，继承速度并叠加法线方向冲量 ±3.2，旋转角速度随机。
- 炸弹同碰撞，命中触发 `endedReason = BOMB`。

### 计分

- 基础分：`scorePerFruit`（默认 10）×（1 + floor((level-1)/3)）。
- Combo：窗口内第 n 个（n≥3）额外 `comboBonus * (n-2)`。
- 服务端重算：`expectedScore` 用同样公式，允许 ±15% 或 ±50 分（取较大）容差，超出则 400。

### 音频加载

```ts
const AUDIO_MANIFEST = [
  { key: 'bgm', src: '/audio/bgm.mp3', loop: true, volume: 0.35 },
  { key: 'slice-1', src: '/audio/slice-1.mp3', volume: 0.7 },
  { key: 'slice-2', src: '/audio/slice-2.mp3', volume: 0.7 },
  { key: 'slice-3', src: '/audio/slice-3.mp3', volume: 0.7 },
  { key: 'bomb', src: '/audio/bomb.mp3', volume: 0.9 },
  { key: 'miss', src: '/audio/miss.mp3', volume: 0.6 },
  { key: 'combo', src: '/audio/combo.mp3', volume: 0.75 },
  { key: 'level-up', src: '/audio/level-up.mp3', volume: 0.7 },
  { key: 'game-over', src: '/audio/game-over.mp3', volume: 0.8 },
];
```

- `assets.ts` 并行 `fetch` + `decodeAudioData`；进度 = loaded/total。
- 首次 pointerdown 调用 `audio.unlock()`（创建/resume AudioContext，播 0s 静音 buffer）。
- 切片音三选一随机，避免单调。
- BGM 在 `playing` 状态 loop；暂停时 gain 降到 0.08。

### 占位资源策略（必须实现）

仓库不能依赖外部付费素材。提供 `scripts/generate-placeholder-assets.mjs`：

- 图片：Node canvas 或纯 SVG 栅格化彩色圆形水果 + 炸弹球形。
- 音频：用 `ffmpeg` 生成短促 beep / 噪声 sweep 作为占位 wav/mp3；若环境无 ffmpeg，则提交极小的预置 mp3（可在 prompt 中用 base64 写出最小合法 mp3，或运行时 WebAudio 振荡器合成——**必须有一条能成功发声的路径**）。
- 首选实现：**运行时合成 + 文件占位双通道**。文件存在则用文件；否则 `OscillatorNode` 按事件类型播放不同频率（切片 880Hz 短脉冲，炸弹 80Hz 噪声，BGM 简单和弦循环）。这样验证「按路径加载」与「无文件也能演示音效」同时成立。

## API / Server Actions

| 方法 | 路径 / Action | 说明 |
| --- | --- | --- |
| POST | `createUser` Server Action | 注册 |
| Auth.js | `/api/auth/*` | 登录登出会话 |
| GET | `/api/config` | 返回当前 DifficultyConfig + version |
| PUT | `/api/config` | ADMIN only |
| POST | `/api/sessions` | 提交对局，校验后写入，尝试解锁成就 |
| GET | `/api/sessions` | 当前用户最近 20 局 |
| GET | `/api/leaderboard?limit=50` | 每用户最高分聚合 |
| GET | `/api/health` | 探活 |

排行榜查询示例：按用户取 `MAX(score)`，再排序。可用 Prisma `groupBy` 或 raw SQL。

## 认证与权限

- Credentials：email + password（bcrypt）。
- Session strategy：JWT（便于无独立 Node server 部署）。
- 中间件：`/history`、`/admin/*` 需登录；`/admin/*` 需 `role === ADMIN`。
- `/play` 对游客开放。
- 种子脚本：创建 `admin@sliceninja.dev` / `Admin1234!`（仅开发）。

## 数据管理与状态

- 大厅页 Server Component 读排行榜 Top 10。
- `GameCanvas` 为 `"use client"`，通过 imperative handle `start/pause/destroy`。
- 对局结束再 `fetch POST /api/sessions`，游戏中不打热路径网络。
- Config：进入 `/play` 时拉一次，写入 `sessionStorage` 按 version 缓存。

## 部署方案

- Vercel，Node runtime。
- 环境变量：`DATABASE_URL`、`AUTH_SECRET`、`AUTH_URL`。
- SQLite 仅本地；生产改 PostgreSQL provider，无需改业务代码。
- `public/audio` 与 `public/images` 随静态资源 CDN 分发。

## 性能与移动端

- 粒子上限 120，超出回收。
- 触控：`touch-action: none`，`preventDefault` on canvas。
- 低端机：检测 fps < 45 连续 2s 则关闭部分粒子。
- 页面不可选中文字；游戏中隐藏双击缩放。
