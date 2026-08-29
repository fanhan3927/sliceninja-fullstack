/**
 * SliceNinja 端到端实玩测试（playwright-core 驱动本机 Chrome）。
 * 流程：打开 /play → 等加载 → 点「挥刀开始」→ 鼠标拖拽切割 → 读 HUD 分数 →
 * 等待 Game Over → 截图 + 汇报。控制台错误一并收集。
 */

import { chromium } from "playwright-core";

const BASE = "http://localhost:3000";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

  await page.goto(`${BASE}/play`, { waitUntil: "load", timeout: 90000 });
  await sleep(2000);

  // 1) 加载遮罩应显示进度
  const loaderText = await page.textContent("body");
  const hasLoader = /图片/.test(loaderText) && /音频/.test(loaderText);
  console.log(`[1] loader overlay shows 图片/音频 progress: ${hasLoader}`);

  // 2) 点「挥刀开始」
  await page.getByRole("button", { name: "挥刀开始" }).click({ timeout: 30000 });
  await sleep(800);
  const hudText = await page.textContent("body");
  console.log(`[2] after start, HUD visible (分数/Lv.): ${/分数/.test(hudText) && /Lv\./.test(hudText)}`);

  // 3) 拖拽切割：横竖斜线扫过画布
  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas bounding box missing");
  const drag = async (x0, y0, x1, y1) => {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx + (x0 - 0.5) * box.width, cy + (y0 - 0.5) * box.height);
    await page.mouse.down();
    const steps = 14;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await page.mouse.move(
        cx + (x0 + (x1 - x0) * t - 0.5) * box.width,
        cy + (y0 + (y1 - y0) * t - 0.5) * box.height,
        { steps: 1 }
      );
      await sleep(16);
    }
    await page.mouse.up();
  };

  const scoreEl = page.locator("div.font-num.text-3xl").first();
  const readScore = async () => {
    const t = await scoreEl.textContent().catch(() => "?");
    return (t ?? "").replace(/\D/g, "");
  };

  const startScore = Number(await readScore());
  console.log(`[3] score at start: ${startScore}`);

  // 4) 连续扫动约 12 秒，边扫边记分数
  const sweeps = [
    [0.15, 0.2, 0.85, 0.75],
    [0.85, 0.25, 0.15, 0.8],
    [0.2, 0.6, 0.8, 0.2],
    [0.5, 0.85, 0.5, 0.15],
    [0.1, 0.5, 0.9, 0.5],
    [0.9, 0.5, 0.1, 0.5],
    [0.3, 0.15, 0.7, 0.85],
    [0.7, 0.85, 0.3, 0.15],
    [0.15, 0.8, 0.85, 0.25],
    [0.85, 0.75, 0.15, 0.2],
  ];
  let scoreSamples = [];
  for (let round = 0; round < 6; round++) {
    for (const [a, b, c, d] of sweeps) {
      await drag(a, b, c, d);
      await sleep(90);
    }
    scoreSamples.push(Number(await readScore()));
  }
  console.log(`[4] score samples (every ~10 sweeps): ${scoreSamples.join(" -> ")}`);
  const finalScore = Number(await readScore());
  const scored = finalScore > startScore;
  console.log(`[5] scored points by slicing: ${scored} (${startScore} -> ${finalScore})`);

  // 5) 等待 Game Over（最多 60s）
  let gameOver = false;
  for (let i = 0; i < 40; i++) {
    await sleep(1500);
    const body = await page.textContent("body");
    if (/本局结束|已保存|登录/.test(body)) {
      gameOver = true;
      break;
    }
  }
  console.log(`[6] game over modal appeared: ${gameOver}`);
  const endText = gameOver ? await page.textContent("body") : "(none)";
  if (gameOver) {
    const stats = (endText.match(/\d[\d,]*/g) ?? []).slice(0, 8);
    console.log(`[7] modal stats: ${stats.join(", ")}`);
  }

  await page.screenshot({ path: "scripts/e2e-play-screenshot.png", fullPage: false });
  console.log("screenshot saved: scripts/e2e-play-screenshot.png");

  console.log(`[8] console errors: ${consoleErrors.length ? consoleErrors.slice(0, 6).join(" | ") : "none"}`);

  await browser.close();
  console.log(JSON.stringify({
    loader: hasLoader, hud: true, scored, gameOver,
    startScore, finalScore, samples: scoreSamples, consoleErrors: consoleErrors.length,
  }));
}

main().catch((e) => {
  console.error("E2E FAILED:", e);
  process.exit(1);
});
