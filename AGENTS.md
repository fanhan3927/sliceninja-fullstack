# SliceNinja 全栈开发指令（给 Coding Agent）

## 项目概述

使用 Next.js 15 App Router + TypeScript + Prisma + Tailwind 实现可上线的《水果忍者》Web 复刻。核心验收不在「再做一个官网」，而在：**Canvas 游戏循环完整、切割判定正确、Level 难度表生效、音频按约定路径加载并可播放、对局能写入数据库**。

开始任何文件改动前先读：

- `PRD.md` — 玩法、难度表、资源路径、验收表
- `TECH_DESIGN.md` — 目录、Schema、算法、API
- 本文件 — 规范与禁止事项

## 开发规范

- TypeScript strict；游戏实体全部显式类型，禁止 `any`。
- 游戏主循环、物理、生成器、切割、音频必须是 **纯 TS 模块**（`src/game/*`），React 只负责挂载 canvas、HUD 和弹窗。
- 不要把水果数组放进 `useState` 每帧 setState。
- 难度数值只允许来自 `src/game/constants.ts` 与服务端 config 合并后的对象，禁止在 `spawner.ts` 里写死 `1400` 这类魔法数。
- Tailwind 用于页面/HUD；Canvas 绘制不要用 DOM 水果节点冒充（必须画在 canvas 上）。
- 输入用 Zod；Server Actions / Route Handler 必须校验 session。
- 数据库变更只走 `prisma migrate`。
- 代码加必要注释：切割几何、难度公式、音频解锁这三处必须注释。

## 设计与 UX 要求

- 深色道场风，暖色强调（金刀光、红炸弹、绿分数字）。
- 大厅先于游戏：大标题 SliceNinja、一句玩法、主按钮「开始切割」、次按钮排行榜。
- 游戏内 HUD 不挡刀路：顶栏半透明。
- Loading 必须显示「图片 x/y · 音频 x/y」，禁止白屏直接进局。
- Game Over 展示：分数、Level、最高连击、切开/漏切、两个 CTA（再来一局 / 返回大厅）。登录用户额外显示「已保存」。
- 移动端画布可玩，禁止滑动穿透滚动页面。

## 多媒体硬性约定

必须创建目录与清单（文件可以是占位）：

```
public/audio/bgm.mp3
public/audio/slice-1.mp3
public/audio/slice-2.mp3
public/audio/slice-3.mp3
public/audio/bomb.mp3
public/audio/miss.mp3
public/audio/combo.mp3
public/audio/level-up.mp3
public/audio/game-over.mp3
public/images/fruits/watermelon.png
public/images/fruits/apple.png
public/images/fruits/orange.png
public/images/fruits/banana.png
public/images/fruits/kiwi.png
public/images/fruits/pineapple.png
public/images/bomb.png
public/images/dojo-bg.jpg
```

加载代码必须使用上述 URL。若二进制不便生成：

1. 写 `scripts/generate-placeholder-assets.mjs` 生成简单 PNG / 用 ffmpeg 生成短 mp3；**并且**
2. `AudioManager` 在 fetch 失败时用 OscillatorNode 合成对应音效（切片高频、炸弹低频、BGM 简单循环）。

两条通道都要写，保证评审机器上「能出声 + 路径正确」。

## 游戏逻辑硬性约定

实现 `getDifficulty(level, config) → RuntimeParams` 纯函数，单测或至少在文件内用断言注释列出 Level 1 与 Level 5 的期望值：

- Level 1：`spawnIntervalMs = 1400`，`bombChance = 0`，`throwSpeed = 7.2`
- Level 5：间隔 1400 - 80*4 = 1080，炸弹率 0.08+0.035*3 = 0.185（若 startLevel=2 且 Level5 已过 3 档）

公式必须与 PRD 一致，若有歧义以 PRD 表为准并在 `difficulty.ts` 顶部用注释写清。

切割：折线 vs 圆，速度阈值，切开分瓣。漏切 3 次结束。炸弹默认立即结束。

## 注意事项

- 保持实现完整但克制：不要上 WebGL 后处理、不要上 ECS 框架、不要上 monorepo。
- 不要引用《水果忍者》官方 IP 名称作为商品名（游戏内文案用 SliceNinja / 水果切割）。
- `.env` 示例：`DATABASE_URL="file:./dev.db"`，`AUTH_SECRET` 随机字符串。
- 先保证 `npm run dev` 可玩完整一局，再做排行榜抛光。
- 提交分数只在 Game Over 且已登录时发生一次。
- 管理员配置页可以很简陋（textarea JSON + 保存），不要做可视化曲线编辑器。

## 完成定义（Definition of Done）

- [ ] 游客可玩完整一局：出果、切割、音效、漏切/炸弹结束
- [ ] Level 提升后出果明显变快，HUD Level 数字变化
- [ ] Loading 读取 PRD 约定资源路径
- [ ] 注册登录后成绩出现在历史与排行榜
- [ ] `prisma migrate` 后空库可启动
- [ ] README 写明本地启动三步与占位资源生成命令
