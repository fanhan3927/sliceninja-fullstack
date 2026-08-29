# SliceNinja · 水果切割（全栈 Web 版）

浏览器上的水果切割游戏复刻：Canvas 手感、连击与动态难度、音效多媒体、账号战绩与排行榜。
技术栈：Next.js 15 (App Router) · TypeScript strict · Tailwind CSS v4 · Prisma + SQLite（本地）/ PostgreSQL（生产） · Auth.js v5 · Zod。

## 本地三步启动

```bash
npm install                 # 安装依赖（postinstall 自动 prisma generate）
npx prisma migrate dev      # 初始化数据库
npm run db:seed             # 写入演示账号 / 默认难度配置 / 7 项成就（可重复执行）
npm run dev                 # http://localhost:3000
```

演示账号（seed 生成，仅本地开发，**生产必须改密/禁用**）：

- 管理员：`admin@sliceninja.dev` / `Admin1234!`
- 演示用户：`demo@sliceninja.dev` / `Demo1234!`

环境变量见 `.env.example`（`.env` 已被 gitignore，不会被提交）：

```
DATABASE_URL="file:./dev.db"
AUTH_SECRET="dev-secret-change-me"
AUTH_URL="http://localhost:3000"
```

## 占位资源

仓库内置 `scripts/generate-placeholder-assets.mjs`，一键生成 PRD 约定路径下的占位图与占位音：

```bash
node scripts/generate-placeholder-assets.mjs
```

- 图片：纯 Node 生成 PNG（彩色水果圆盘 / 炸弹 / 道场背景），无 canvas 依赖。
- 音频：JS 合成 PCM；PATH 中有 ffmpeg 时转成真 mp3，无 ffmpeg 时写入 WAV 数据（浏览器按内容解码，扩展名不影响）。
- 双通道兜底：即便所有音频文件缺失/404，游戏内 `AudioManager` 会用 WebAudio 振荡器实时合成音效（切片高频、炸弹低频、BGM 五声循环），游戏不崩、不哑。

资源约定路径（加载代码按此 URL，见 `src/game/assets.ts`）：

```
public/audio/bgm.mp3  slice-1..3.mp3  bomb.mp3  miss.mp3  combo.mp3  level-up.mp3  game-over.mp3
public/images/fruits/{watermelon,apple,orange,banana,kiwi,pineapple}.png
public/images/bomb.png
public/images/dojo-bg.jpg
```

## 目录结构

```
src/
  app/
    page.tsx                    # 大厅（Hero + 玩法 + 排行榜 Top10）
    play/page.tsx               # 游戏页（全屏 canvas）
    leaderboard/ history/ login/ register/ admin/config/
    api/  auth  config  sessions  leaderboard  health  me  preferences
  components/ layout/ game/ admin/
  game/                         # 纯 TS 游戏引擎（无 React）
    engine.ts physics.ts blade.ts fruit.ts particles.ts spawner.ts
    scoring.ts renderer.ts input.ts audio.ts assets.ts difficulty.ts
    constants.ts types.ts
  lib/  prisma.ts auth.ts auth.config.ts password.ts config.ts
        score-guard.ts achievements.ts leaderboard.ts validators.ts
  middleware.ts                 # 保护 /history、/admin
prisma/ schema.prisma seed.ts
scripts/ generate-placeholder-assets.mjs  e2e-*.mjs
```

## 核心玩法与难度

- 1280×720 逻辑画布，鼠标/触控滑动切割；刀光折线 × 圆碰撞 + 80ms 位移 > 18px 速度阈值判定切割。
- 漏切 3 次或切中炸弹即 Game Over；连击 ≥3 额外加分；切开分瓣旋转飞散 + 果汁粒子（上限 120）。
- 难度纯函数 `getDifficulty(level, config)`（`src/game/difficulty.ts`）与 PRD 表一致：
  Level 1 出果 1400ms、无炸弹；每级间隔 -80ms（下限 420）、炸弹率 L2 起 0.08 + 0.035/级（上限 0.32）等；模块加载期 console.assert 校验 L1/L5 期望值。
- 难度可由管理员通过 `/admin/config` 覆盖（textarea JSON + 保存，version 自增），客户端进 `/play` 时拉取并缓存。

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/*` | Auth.js 登录登出 |
| GET | `/api/config` | 当前难度配置 + version |
| PUT | `/api/config` | 仅 ADMIN，合并写配置，version++ |
| POST | `/api/sessions` | 登录用户提交对局（score-guard 校验，防伪造分数；解锁成就） |
| GET | `/api/sessions` | 当前用户最近 20 局 |
| GET | `/api/leaderboard?limit=50` | 每用户最高分，并列按最早达成时间 |
| GET | `/api/me` | 登录态：user / 最高分 / 偏好 |
| GET/PUT | `/api/preferences` | 静音偏好同步 |
| GET | `/api/health` | `{ ok: true }` |

分数校验：服务端用同公式重算理论上界（含连击），容差 max(15%, 50 分)，并校验 Level 与切开数自洽、漏切 ≤ 生命上限，超界 400。

## E2E 冒烟测试（可选）

```bash
# 需要本机 Chrome（脚本默认路径 C:/Program Files/Google/Chrome/Application/chrome.exe，可自行修改）
npm run dev   # 先起服务
node scripts/e2e-play-test.mjs       # 游客完整一局：加载→切割→计分→Game Over
node scripts/e2e-mechanics-test.mjs  # 升级 / 漏切出局 / 暂停冻结
node scripts/e2e-fullstack-test.mjs  # 管理配置炸弹局 / 注册存档 / 排行榜 / 移动端 / 音频404降级
```

## 部署到 Vercel（生产）

仓库已内置生产就绪文件：`vercel.json`（构建命令自动用 Postgres schema 生成 Prisma Client）、`prisma/schema.postgres.prisma`（由 `scripts/gen-postgres-schema.mjs` 从 SQLite schema 生成，模型一致）、`prisma/prod-schema.sql`（Postgres DDL）、`prisma/seed-prod.ts`（只写成就与默认配置，不建任何账号）。

```bash
# 1) 数据库：Neon（免费）或 Supabase 建一个 Postgres，复制连接串
# 2) 应用 DDL（建表）—— 注意：Neon 代理不支持单次多语句，脚本会逐条执行：
DATABASE_URL="$DATABASE_URL" node scripts/apply-prod-schema.mjs
# 3) 写入成就与默认难度配置（可选但推荐）：
DATABASE_URL="$DATABASE_URL" npx tsx prisma/seed-prod.ts
```

Vercel 项目设置：

1. Import 仓库 `sliceninja-fullstack`（框架自动识别 Next.js；`vercel.json` 已配置构建命令与 `hkg1` 区域）。
2. 环境变量：
   - `DATABASE_URL=postgresql://...`（生产库，Schema 已就绪）
   - `AUTH_SECRET=<openssl rand -base64 32>`（强随机，切勿用 dev 值）
   - `AUTH_URL=https://<你的项目>.vercel.app`
   - `AUTH_TRUST_HOST=true`
3. 部署。登录注册走 `User` 表；`public/audio`、`public/images` 由 Vercel CDN 自动分发。

> 变更本地 SQLite schema 后，重新生成生产文件：
> `node scripts/gen-postgres-schema.mjs && npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.postgres.prisma --script > prisma/prod-schema.sql`
> 注意：重新生成 DDL 是「从空库」全量脚本，仅适用于首次建库或可重建的生产库；已有数据的库请自行编写增量迁移。

> SQLite 仅限本地开发；生产用 Postgres，`AUTH_SECRET` 用随机值，且绝不执行 `db:seed`（默认密码仅本地）。

## 安全注意

- `.env` 已被 gitignore（`.env.example` 除外，可提交）。
- seed 的默认密码（Admin1234! / Demo1234!）仅用于本地；生产部署后立即删除或改密，建议关闭 seed（不执行 `db:seed`）。
- 分数提交服务端强校验（score-guard），已登录才接受；管理员接口二次校验 `role === ADMIN`（middleware + 页面 + API 三层）。
- 登录跳转目标仅接受站内相对路径，防开放重定向。

## 完成定义对照（AGENTS.md）

- [x] 游客可玩完整一局：出果、切割、音效、漏切/炸弹结束
- [x] Level 提升后出果明显变快，HUD Level 数字变化
- [x] Loading 读取 PRD 约定资源路径（图片 x/y · 音频 x/y）
- [x] 注册登录后成绩出现在历史与排行榜
- [x] `prisma migrate` 后空库可启动
- [x] README 写明本地启动三步与占位资源生成命令
