/**
 * E2E 全栈验证（共享 browser context，cookie 跨页面保持，模拟真实用户）：
 * B) 管理配置覆盖难度 → 新对局炸弹率生效 → 切炸弹 BOMB 结束 → 还原配置
 * C) 注册新用户 → 打一局 → 自动存档 → 历史/排行榜出现名字
 * D) 移动端宽度：滑切不滚动页面
 * E) 音频文件 404：合成音降级提示，游戏照常可玩
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(ctx, email, password) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 90000 });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 30000 });
  return page;
}

const putConfig = async (page, body) =>
  page.evaluate(async (b) => {
    const res = await fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    });
    return { status: res.status, body: await res.json() };
  }, body);

const drag = async (page, box, x0, y0, x1, y1) => {
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx + (x0 - 0.5) * box.width, cy + (y0 - 0.5) * box.height);
  await page.mouse.down();
  for (let i = 1; i <= 14; i++) {
    const t = i / 14;
    await page.mouse.move(cx + (x0 + (x1 - x0) * t - 0.5) * box.width, cy + (y0 + (y1 - y0) * t - 0.5) * box.height);
    await sleep(16);
  }
  await page.mouse.up();
};

async function openGame(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/play`, { waitUntil: "networkidle", timeout: 90000 });
  await page.getByRole("button", { name: "挥刀开始" }).click({ timeout: 30000 });
  await sleep(600);
  return { page, errors };
}

/** 少量挥刀后停手，等漏切出局（必然结束） */
async function playUntilMissOver(ctx) {
  const { page, errors } = await openGame(ctx);
  const box = await page.locator("canvas").boundingBox();
  for (let r = 0; r < 2; r++) {
    for (const [a, b, c, d] of [[0.2,0.2,0.8,0.8],[0.8,0.3,0.2,0.7]]) { await drag(page, box, a, b, c, d); await sleep(100); }
  }
  for (let i = 0; i < 30; i++) {
    await sleep(1500);
    if ((await page.textContent("body")).includes("本局结束")) break;
  }
  await sleep(2500); // 等 POST /api/sessions 完成
  return { page, errors };
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });

  // B) 管理员配置 → 炸弹游戏（bombChance 有 0.32 上限，用快速出果 + 持续中心纵切保证切到炸弹）
  {
    const ctx = await browser.newContext();
    const admin = await login(ctx, "admin@sliceninja.dev", "Admin1234!");
    const put = await putConfig(admin, {
      bombChance: { base: 1, startLevel: 1 },
      spawnIntervalMs: { base: 500, perLevel: -40, min: 420 },
    });
    console.log(`B1 admin PUT config: status=${put.status} version=${put.body?.version}`);
    await admin.close();

    let bombOver = false;
    let attempts = 0;
    while (!bombOver && attempts < 2) {
      attempts += 1;
      const game = await openGame(ctx);
      const box = await game.page.locator("canvas").boundingBox();
      let ended = false;
      for (let i = 0; i < 120 && !ended; i++) {
        // 中心上下纵切（覆盖水果抛物线中段）+ 斜切
        const vert = i % 2 === 0;
        if (vert) await drag(game.page, box, 0.5, 0.85, 0.5, 0.12);
        else await drag(game.page, box, 0.2, 0.2, 0.8, 0.8);
        await sleep(50);
        ended = (await game.page.textContent("body")).includes("本局结束");
      }
      const body = await game.page.textContent("body");
      bombOver = /切中炸弹/.test(body);
      const missOver = /漏切三次/.test(body);
      console.log(`B2 attempt ${attempts}: ended=${ended} bomb=${bombOver} miss=${missOver}`);
      if (game.errors.length) console.log(`B2 errors: ${game.errors.join("|")}`);
      await game.page.close();
    }
    console.log(`B2 bomb game over confirmed: ${bombOver}`);

    const admin2 = await login(ctx, "admin@sliceninja.dev", "Admin1234!");
    const restore = await putConfig(admin2, {});
    const cfg = await admin2.evaluate(() => fetch("/api/config").then((r) => r.json()));
    console.log(`B3 restore: status=${restore.status} version=${cfg.version} bombBase=${cfg.config.bombChance.base} interval=${cfg.config.spawnIntervalMs.base}`);
    await admin2.close();
    await ctx.close();
  }

  // C) 注册 → 对局 → 存档 → 历史/排行榜（同一 context）
  {
    const ctx = await browser.newContext();
    const email = `ninja${Date.now()}@test.dev`;
    const reg = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
    await reg.goto(`${BASE}/register`, { waitUntil: "networkidle", timeout: 90000 });
    await reg.fill('input[name="name"]', "测试忍者");
    await reg.fill('input[name="email"]', email);
    await reg.fill('input[name="password"]', "Test1234!");
    await reg.getByRole("button", { name: "注册并登录" }).click();
    await reg.waitForURL(`${BASE}/`, { timeout: 30000 });
    const me = await reg.evaluate(() => fetch("/api/me").then((r) => r.json()));
    console.log(`C1 registered=${email} session=${me.user ? me.user.name : "NULL!"}`);
    await reg.close();

    const { page, errors } = await playUntilMissOver(ctx);
    const body = await page.textContent("body");
    const saved = /已保存/.test(body);
    console.log(`C2 session saved (已保存): ${saved}`);
    console.log(`C2 errors: ${errors.length ? errors.join("|") : "none"}`);

    await page.goto(`${BASE}/history`, { waitUntil: "networkidle", timeout: 60000 });
    const histBody = await page.textContent("body");
    const histHasRow = /分数/.test(histBody) && /Level/.test(histBody) && !/还没有对局记录/.test(histBody);
    console.log(`C3 history has rows: ${histHasRow}`);

    const lb = await page.evaluate(() => fetch("/api/leaderboard?limit=50").then((r) => r.json()));
    const onBoard = lb.entries.some((e) => e.name === "测试忍者");
    console.log(`C4 new user on leaderboard: ${onBoard} (${lb.entries.length} entries)`);
    await page.close();
    await ctx.close();
  }

  // D) 移动端宽度：滑切不滚动
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/play`, { waitUntil: "networkidle", timeout: 90000 });
    await page.getByRole("button", { name: "挥刀开始" }).click({ timeout: 30000 });
    await sleep(600);
    const box = await page.locator("canvas").boundingBox();
    const scrollBefore = await page.evaluate(() => window.scrollY);
    for (let r = 0; r < 3; r++) {
      await drag(page, box, 0.2, 0.3, 0.8, 0.7);
      await drag(page, box, 0.8, 0.7, 0.2, 0.3);
      await sleep(150);
    }
    const scrollAfter = await page.evaluate(() => window.scrollY);
    const scoreDiv = page.locator("div.font-num.text-3xl").first();
    const scoreText = await scoreDiv.textContent().catch(() => "?");
    console.log(`D1 mobile drag: scrollY ${scrollBefore} -> ${scrollAfter} (no scroll: ${scrollBefore === scrollAfter && scrollAfter === 0}); score=${scoreText}`);
    await page.close();
    await ctx.close();
  }

  // E) 音频 404 → 合成音降级提示 + 可玩
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
    await page.route("**/audio/*", (route) => route.abort());
    await page.goto(`${BASE}/play`, { waitUntil: "networkidle", timeout: 90000 });
    const loader = await page.textContent("body");
    const hint = /合成音效/.test(loader);
    await page.getByRole("button", { name: "挥刀开始" }).click({ timeout: 30000 });
    await sleep(600);
    const box = await page.locator("canvas").boundingBox();
    await drag(page, box, 0.3, 0.3, 0.7, 0.7);
    await sleep(1500);
    const playable = await page.locator("canvas").isVisible();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    console.log(`E1 audio 404: synth hint=${hint}; canvas visible=${playable}; pageerrors=${errs.length}`);
    await page.close();
    await ctx.close();
  }

  await browser.close();
  console.log("ALL E2E DONE");
}

main().catch((e) => { console.error("E2E FAILED:", e); process.exit(1); });
