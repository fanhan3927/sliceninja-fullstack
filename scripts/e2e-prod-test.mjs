/**
 * 生产环境上线验证（跳过会修改生产配置的用例）：
 * 1) 注册新用户 → 2) 打一局 → 存档(已保存) → 3) 历史有记录 → 4) 排行榜出现
 * 5) 移动端宽度滑切不滚动 → 6) 音频 404 合成音降级可玩
 * 用法：BASE_URL=https://... node scripts/e2e-prod-test.mjs
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL;
if (!BASE) {
  console.error("请设置 BASE_URL");
  process.exit(1);
}
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function clickStart(page) {
  await page.getByRole("button", { name: "挥刀开始" }).waitFor({ timeout: 60000 });
  await sleep(1000); // 等资源进度动画稳定
  await page.getByRole("button", { name: "挥刀开始" }).click({ timeout: 15000 });
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });

  // 1-4) 注册 → 对局 → 存档 → 历史/排行榜
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const email = `prod${Date.now()}@test.dev`;
    const reg = await ctx.newPage();
    await reg.goto(`${BASE}/register`, { waitUntil: "load", timeout: 90000 });
    await reg.fill('input[name="name"]', "线上忍者");
    await reg.fill('input[name="email"]', email);
    await reg.fill('input[name="password"]', "Test1234!");
    await reg.getByRole("button", { name: "注册并登录" }).click();
    await reg.waitForURL(`${BASE}/`, { timeout: 45000 });
    const me = await reg.evaluate(() => fetch("/api/me").then((r) => r.json()));
    console.log(`P1 registered=${email} session=${me.user ? me.user.name : "NULL!"}`);
    await reg.close();

    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${BASE}/play`, { waitUntil: "load", timeout: 90000 });
    await clickStart(page);
    await sleep(600);
    const box = await page.locator("canvas").boundingBox();
    for (let r = 0; r < 2; r++) {
      for (const [a, b, c, d] of [[0.2,0.2,0.8,0.8],[0.8,0.3,0.2,0.7]]) { await drag(page, box, a, b, c, d); await sleep(100); }
    }
    for (let i = 0; i < 30 && !(await page.textContent("body")).includes("本局结束"); i++) await sleep(1500);
    await sleep(2500);
    const body = await page.textContent("body");
    const saved = /已保存/.test(body);
    console.log(`P2 game over + 已保存: ${saved}`);
    console.log(`P2 pageerrors: ${errors.length ? errors.join("|") : "none"}`);

    await page.goto(`${BASE}/history`, { waitUntil: "load", timeout: 90000 });
    const histBody = await page.textContent("body");
    console.log(`P3 history has rows: ${/分数/.test(histBody) && !/还没有对局记录/.test(histBody)}`);

    const lb = await page.evaluate(() => fetch("/api/leaderboard?limit=50").then((r) => r.json()));
    const onBoard = lb.entries.some((e) => e.name === "线上忍者");
    console.log(`P4 on leaderboard: ${onBoard} (${lb.entries.length} entries)`);
    await page.close();
    await ctx.close();
  }

  // 5) 移动端
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/play`, { waitUntil: "load", timeout: 90000 });
    await clickStart(page);
    await sleep(600);
    const box = await page.locator("canvas").boundingBox();
    const before = await page.evaluate(() => window.scrollY);
    for (let r = 0; r < 3; r++) {
      await drag(page, box, 0.2, 0.3, 0.8, 0.7);
      await drag(page, box, 0.8, 0.7, 0.2, 0.3);
      await sleep(150);
    }
    const after = await page.evaluate(() => window.scrollY);
    const score = await page.locator("div.font-num.text-3xl").first().textContent().catch(() => "?");
    console.log(`P5 mobile: scrollY ${before}->${after} (ok=${before === 0 && after === 0}); score=${score}`);
    await page.close();
    await ctx.close();
  }

  // 6) 音频 404 降级
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.route("**/audio/*", (route) => route.abort());
    await page.goto(`${BASE}/play`, { waitUntil: "load", timeout: 90000 });
    const loader = await page.textContent("body");
    const hint = /合成音效/.test(loader);
    await clickStart(page);
    await sleep(600);
    const visible = await page.locator("canvas").isVisible();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    console.log(`P6 audio 404: hint=${hint}; canvas=${visible}; pageerrors=${errs.length}`);
    await page.close();
    await ctx.close();
  }

  await browser.close();
  console.log("PROD E2E DONE");
}

main().catch((e) => { console.error("PROD E2E FAILED:", e); process.exit(1); });
