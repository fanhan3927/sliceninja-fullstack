# 分步提示词（直接复制给 Coding Agent）

按顺序执行。每一步完成后再开始下一步。始终遵守同目录 `PRD.md`、`TECH_DESIGN.md`、`AGENTS.md`。

---

## 1. 初始化项目

请使用 `create-next-app` 创建 Next.js 15 App Router + TypeScript + Tailwind + ESLint 项目（源码目录 `src/`）。

安装依赖：

- `prisma @prisma/client`
- `next-auth@beta`（Auth.js v5）或当前稳定的 NextAuth v5 包名
- `bcryptjs` + `@types/bcryptjs`
- `zod`

创建 `.env`：

```
DATABASE_URL="file:./dev.db"
AUTH_SECRET="dev-secret-change-me"
AUTH_URL="http://localhost:3000"
```

创建 `.env.example` 同上。根布局使用深色背景 `#140c08`，引入 `Noto Serif SC`（标题）与系统等宽数字字体。写一份简短 `README.md`：项目简介、三步启动、资源路径说明。

**验收**：`npm run dev` 能打开默认页；`src/` 结构存在。

---

## 2. 数据库与 Prisma Schema

按 `TECH_DESIGN.md` 写出完整 `prisma/schema.prisma`（datasource sqlite）。包含：

- User, Preference, GameSession, Achievement, UserAchievement, GameConfig
- Role / EndReason 枚举
- 索引

提供 `src/lib/prisma.ts` 单例（防止 dev hot reload 多实例）。

运行：

```
npx prisma migrate dev --name init
```

编写 `prisma/seed.ts`：

- 管理员 `admin@sliceninja.dev` / `Admin1234!`
- 演示用户 `demo@sliceninja.dev` / `Demo1234!`
- 默认 `GameConfig` id=`default`，json 为 PRD 难度表
- 成就：first_game, combo_5, combo_8, combo_12, level_5, level_10, sliced_100

在 `package.json` 加 `"prisma": { "seed": "tsx prisma/seed.ts" }` 或等价，并安装 `tsx`。

**验收**：`npx prisma db seed` 成功；Studio 能看到用户与 config。

---

## 3. 认证系统

实现 Auth.js Credentials：

- `src/lib/password.ts`：bcrypt hash / compare
- `src/lib/auth.ts`：session 含 `id, role, name, email`
- `src/app/api/auth/[...nextauth]/route.ts`
- Server Actions：`register`（校验 email 格式、密码 ≥8、email 唯一）
- 页面：`/login`、`/register`（居中卡片，深色木纹风）
- `src/middleware.ts`：保护 `/history`、`/admin`
- 导航：未登录显示登录/注册；已登录显示名字、最高分入口、退出

**验收**：用 demo 账号可登录；错误密码有提示；未登录访问 `/history` 被重定向。

---

## 4. 难度纯函数 + 资源清单（先于画布）

实现并导出：

- `src/game/types.ts` — FruitKind, Entity, BladePoint, RuntimeParams, DifficultyConfig, GameSnapshot
- `src/game/constants.ts` — DEFAULT_DIFFICULTY（数字与 PRD 完全一致）
- `src/game/difficulty.ts` — `mergeConfig` + `getDifficulty(level, config)`
- `src/game/assets.ts` — IMAGE_MANIFEST / AUDIO_MANIFEST，路径必须与 PRD 一字不差
- `src/game/audio.ts` — AudioManager：`load(onProgress)`、`unlock()`、`play(key)`、`playSlice()` 随机三切片、`setBgm`、`setMuted`、文件失败则振荡器合成
- `scripts/generate-placeholder-assets.mjs` — 生成 public 下占位 PNG（彩色圆+文字）与尽可能的占位音频；文档说明若无 ffmpeg 则依赖合成音

在 `difficulty.ts` 用注释写出 Level 1 与 Level 5 的计算结果，并 `console.assert` 在模块加载时校验 Level 1 的 interval===1400、bombChance===0。

**验收**：单独把 `getDifficulty` 在 node 里跑一下或在注释中可人工复核；manifest 路径正确。

---

## 5. 游戏引擎（本步是核心，必须一次写完可跑）

在 `src/game/` 实现：

| 文件 | 职责 |
| --- | --- |
| `physics.ts` | 重力积分、出界检测（y > 720+radius 为 miss） |
| `blade.ts` | 指针点列、折线-圆相交、速度阈值 |
| `fruit.ts` / 实体工厂 | 水果与炸弹、切开生成两瓣 |
| `particles.ts` | 果汁/火花，上限 120 |
| `spawner.ts` | 按 RuntimeParams 计时抛出，多连抛 |
| `scoring.ts` | 分数、连击窗口、升级所需切开数 |
| `renderer.ts` | 背景图或渐变木纹、水果图或占位圆、刀光渐隐折线、炸弹引线闪烁 |
| `input.ts` | mouse + touch，坐标映射到 1280×720 逻辑空间 |
| `engine.ts` | start/pause/reset/destroy，rAF，向 UI 推送 snapshot |

规则落地：

- 3 次 miss → Game Over
- 切炸弹 → Game Over（config.bombEndsGame）
- 升级时回调 `onLevelUp` 以便播音
- dt clamp 33ms；pause 停止 spawn 与物理

不要接 React。用一个 `createGame(canvas, { config, audio, onSnapshot, onEvent })` 工厂即可。

**验收**：可用临时 HTML/页面 new 出引擎，移动鼠标能切圆并计分（下一步再接 UI）。

---

## 6. 游戏页面、Loading、HUD、音效接入

实现：

- `src/app/play/page.tsx` + `GameCanvas.tsx` + `LoaderOverlay.tsx` + `Hud.tsx` + `GameOverModal.tsx`
- 进入页面：`GET /api/config`（下一步若 API 未好，先用 DEFAULT_DIFFICULTY）
- Loader 显示图片/音频进度，完成后出现「挥刀开始」（第一次 pointer 调用 `audio.unlock()` 再 `engine.start()` 并播 BGM）
- HUD：Score、Combo、Level、生命（3 个叉）、静音按钮、暂停
- 事件：slice → playSlice；bomb → bomb 音；miss → miss 音；combo≥3 → combo 音；level-up → level-up 音；end → game-over 音停 BGM
- canvas 样式：`touch-action: none; cursor: crosshair;`
- 移动端阻止页面滚动

视觉：刀光白金渐隐；切开分瓣旋转飞开；Level Up 大字 0.8s。

**验收**：完整一局可玩，有声（或合成声），升级后出果变密变快。

---

## 7. 核心 API

实现 Route Handlers（Zod + 鉴权）：

- `GET /api/config` — 读 GameConfig，解析 json，失败回落 DEFAULT
- `PUT /api/config` — 仅 ADMIN，写 json + version++
- `POST /api/sessions` — 登录用户；`score-guard.ts` 按公式校验；写入 GameSession；扫描成就并插入 UserAchievement
- `GET /api/sessions` — 当前用户最近 20
- `GET /api/leaderboard?limit=50` — 每用户最高分
- `GET /api/health` — `{ ok: true }`

Game Over 且已登录时由客户端 POST 一次，body：

```ts
{ score, maxCombo, levelReached, fruitsSliced, fruitsMissed, bombsHit, durationMs, endedReason }
```

**验收**：用 demo 登录打完一局，Prisma 中出现记录；伪造超高分被 400。

---

## 8. 大厅、排行榜、历史、管理配置

- `/` 大厅：标题、玩法 3 条、开始切割、排行榜 Top 10（Server Component）、登录态欢迎
- `/leaderboard` 完整 Top 50
- `/history` 最近 20 局表
- `/admin/config` textarea 编辑 JSON + 保存（非管理员 403/重定向）
- 公共 Navbar / Footer 简洁

**验收**：游客能看榜和开玩；demo 能看历史；admin 能改 spawn 间隔并在新对局生效。

---

## 9. 联调、体验与本地验证清单

逐项勾过并修 bug：

1. 冷启动 `npx prisma migrate dev && npm run db:seed && npm run dev`
2. 运行 `node scripts/generate-placeholder-assets.mjs`（若脚本存在）
3. 不登录开一局：切中有刀光和音、漏 3 个结束
4. 故意不切，确认 miss 计数
5. 切炸弹结束
6. 撑到 Level 3+，确认间隔变短、开始出炸弹
7. 注册新用户，再打一局，历史+排行榜出现名字
8. 关闭网络后音频文件 404 时仍有合成音，游戏不崩
9. 手机宽度下可滑切且页面不滚动
10. 暂停后水果停在空中，继续后恢复

补错误边界：API 失败 toast；加载失败仍可「强制开始（静音占位）」。

---

## 10. 部署准备（可选）

- README 增加 Vercel 步骤与生产 `DATABASE_URL`（Postgres）注意
- `prisma/schema.prisma` 用环境变量切 provider 的说明（可保持 sqlite 本地，文档里写生产改 postgres）
- 确认 `.env` 不被提交
- 生产关闭 seed 默认密码说明，要求改密

**验收**：文档足以让另一人在空目录按 README 跑起来。
