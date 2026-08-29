/**
 * E2E 玩法机制验证：Level 升级可见、漏切 3 次出局、暂停冻结水果。
 */
import { chromium } from "playwright-core";

const BASE = "http://localhost:3000";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newGamePage(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/play`, { waitUntil: "networkidle", timeout: 90000 });
  await page.getByRole("button", { name: "挥刀开始" }).click({ timeout: 30000 });
  await sleep(600);
  return { page, errors };
}

const canvasBox = async (page) => page.locator("canvas").boundingBox();

async function drag(page, box, x0, y0, x1, y1) {
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx + (x0 - 0.5) * box.width, cy + (y0 - 0.5) * box.height);
  await page.mouse.down();
  for (let i = 1; i <= 14; i++) {
    const t = i / 14;
    await page.mouse.move(cx + (x0 + (x1 - x0) * t - 0.5) * box.width, cy + (y0 + (y1 - y0) * t - 0.5) * box.height);
    await sleep(16);
  }
  await page.mouse.up();
}

const readLevel = async (page) => {
  const m = (await page.textContent("body")).match(/Lv\.(\d+)/);
  return m ? Number(m[1]) : 0;
};
const readScore = async (page) => {
  const m = (await page.textContent("body")).match(/分数\s+([\d,]+)/);
  return m ? Number(m[1].replace(/,/g, "")) : 0;
};
const readLives = async (page) => {
  const t = await page.locator('[aria-label^="生命"]').getAttribute("aria-label");
  return t ? Number(t.replace(/\D/g, "")) : -1;
};

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });

  // A1: Level 升级 —— 连续切开足够多水果
  {
    const { page } = await newGamePage(browser);
    const box = await canvasBox(page);
    const levels = [];
    for (let round = 0; round < 30; round++) {
      await drag(page, box, 0.2, 0.2, 0.8, 0.8);
      await drag(page, box, 0.8, 0.3, 0.2, 0.7);
      await sleep(120);
      if (round % 3 === 0) levels.push(await readLevel(page));
    }
    console.log(`A1 levels observed: ${levels.join(" -> ")}`);
    const maxLevel = Math.max(...levels);
    console.log(`A1 level-up happened (reached Lv.${maxLevel} > 1): ${maxLevel > 1}`);
    await page.close();
  }

  // A2: 漏切 3 次出局 —— 不切任何水果
  {
    const { page } = await newGamePage(browser);
    const livesSeen = [];
    for (let i = 0; i < 25; i++) {
      await sleep(1000);
      const l = await readLives(page);
      if (l >= 0 && (livesSeen.length === 0 || livesSeen[livesSeen.length - 1] !== l)) livesSeen.push(l);
      const body = await page.textContent("body");
      if (/本局结束/.test(body)) break;
    }
    console.log(`A2 lives sequence: ${livesSeen.join(" -> ")}`);
    const body = await page.textContent("body");
    const overByMiss = /漏切三次/.test(body);
    console.log(`A2 game over by 3 misses: ${overByMiss}`);
    await page.screenshot({ path: "scripts/e2e-miss-over.png" });
    await page.close();
  }

  // A3: 暂停冻结 —— 分数不再增长，水果停住
  {
    const { page } = await newGamePage(browser);
    const box = await canvasBox(page);
    await sleep(2500); // 让第一批水果升到空中
    await drag(page, box, 0.3, 0.3, 0.7, 0.7); // 切一两刀确保在运行
    await sleep(400);
    const before = await readScore(page);
    await page.getByRole("button", { name: "暂停" }).click();
    await sleep(500);
    const pausedShown = /已暂停/.test(await page.textContent("body"));
    const during = await readScore(page);
    await sleep(2500);
    const after = await readScore(page);
    await page.getByRole("button", { name: "继续" }).click();
    await sleep(400);
    const resumed = !/已暂停/.test(await page.textContent("body"));
    console.log(`A3 pause overlay: ${pausedShown}; score before=${before} during=${during} after=${after}; frozen=${during === after}; resumed=${resumed}`);
    await page.close();
  }

  await browser.close();
  console.log("ALL MECHANICS DONE");
}

main().catch((e) => { console.error("MECH FAILED:", e); process.exit(1); });
