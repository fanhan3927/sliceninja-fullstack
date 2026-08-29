#!/usr/bin/env node
/**
 * SliceNinja 占位资源生成器
 * 生成 PRD「多媒体硬性约定」路径下的占位图片与占位音频：
 *
 *   public/images/fruits/{watermelon,apple,orange,banana,kiwi,pineapple}.png
 *   public/images/bomb.png
 *   public/images/dojo-bg.jpg
 *   public/audio/{bgm,slice-1,slice-2,slice-3,bomb,miss,combo,level-up,game-over}.mp3
 *
 * 实现说明（无外部依赖，纯 Node）：
 *  - 图片：自写 PNG 编码器（zlib deflate + CRC32），程序化绘制彩色水果圆盘 / 炸弹 / 道场背景。
 *  - 音频：JS 直接合成 PCM（正弦/方波 + 包络），
 *      · 若 PATH 中有 ffmpeg → 转成真正 mp3；
 *      · 无 ffmpeg  → 写入 WAV 数据（文件扩展名保持 .mp3，浏览器按内容解码，不影响播放）。
 *  - 即便所有文件缺失，游戏内 AudioManager 还会用 OscillatorNode 实时合成，保证能出声。
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");

/* ---------------- PNG 编码（无依赖） ---------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** rgba: Uint8Array(w*h*4) → PNG Buffer */
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------------- 简易光栅绘制器 ---------------- */

class Bitmap {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 4);
  }

  blend(x, y, r, g, b, a) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = (y * this.w + x) * 4;
    const sa = a / 255;
    const da = this.data[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa <= 0) return;
    this.data[i] = Math.round((r * sa + this.data[i] * da * (1 - sa)) / oa);
    this.data[i + 1] = Math.round((g * sa + this.data[i + 1] * da * (1 - sa)) / oa);
    this.data[i + 2] = Math.round((b * sa + this.data[i + 2] * da * (1 - sa)) / oa);
    this.data[i + 3] = Math.round(oa * 255);
  }

  clear(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = this.data[i + 1] = this.data[i + 2] = this.data[i + 3] = 0;
  }

  /** 抗锯齿圆盘（softness 控制边缘过渡像素数） */
  fillCircle(cx, cy, radius, [r, g, b, a = 255], softness = 1.2) {
    const x0 = Math.max(0, Math.floor(cx - radius - 2));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + radius + 2));
    const y0 = Math.max(0, Math.floor(cy - radius - 2));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + radius + 2));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const cov = Math.min(1, Math.max(0, 0.5 + (radius - d) / softness));
        if (cov > 0) this.blend(x, y, r, g, b, Math.round(a * cov));
      }
    }
  }

  clearCircle(cx, cy, radius, softness = 1.2) {
    const x0 = Math.max(0, Math.floor(cx - radius - 2));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + radius + 2));
    const y0 = Math.max(0, Math.floor(cy - radius - 2));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + radius + 2));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const cov = Math.min(1, Math.max(0, 0.5 + (radius - d) / softness));
        if (cov > 0.5) this.clear(x, y);
      }
    }
  }

  fillRing(cx, cy, rOuter, rInner, color) {
    const x0 = Math.max(0, Math.floor(cx - rOuter - 2));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + rOuter + 2));
    const y0 = Math.max(0, Math.floor(cy - rOuter - 2));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + rOuter + 2));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d >= rInner && d <= rOuter) {
          const cov = Math.min(1, Math.max(0, Math.min(d - rInner, rOuter - d) + 0.5));
          this.blend(x, y, ...color, Math.round((color[3] ?? 255) * cov));
        }
      }
    }
  }

  fillEllipse(cx, cy, rx, ry, color, rot = 0, softness = 1.2) {
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const R = Math.max(rx, ry) + 2;
    const x0 = Math.max(0, Math.floor(cx - R));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + R));
    const y0 = Math.max(0, Math.floor(cy - R));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + R));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const u = dx * cos + dy * sin;
        const v = -dx * sin + dy * cos;
        const d = Math.hypot(u / rx, v / ry);
        const cov = Math.min(1, Math.max(0, 0.5 + (1 - d) / softness));
        if (cov > 0) this.blend(x, y, ...color, Math.round((color[3] ?? 255) * cov));
      }
    }
  }

  fillRect(x, y, w, h, color, rot = 0) {
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const R = Math.hypot(w, h) / 2 + 2;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const x0 = Math.max(0, Math.floor(cx - R));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + R));
    const y0 = Math.max(0, Math.floor(cy - R));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + R));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dx = px + 0.5 - cx;
        const dy = py + 0.5 - cy;
        const u = dx * cos + dy * sin;
        const v = -dx * sin + dy * cos;
        if (Math.abs(u) <= w / 2 && Math.abs(v) <= h / 2) this.blend(px, py, ...color);
      }
    }
  }

  /** 多边形扫描线填充（凸/凹均可，y 方向取交集） */
  fillPolygon(pts, color) {
    const ys = pts.map((p) => p[1]);
    const y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const y1 = Math.min(this.h - 1, Math.ceil(Math.max(...ys)));
    for (let y = y0; y <= y1; y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
          xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const x0 = Math.max(0, Math.ceil(xs[i]));
        const x1 = Math.min(this.w - 1, Math.floor(xs[i + 1]));
        for (let x = x0; x <= x1; x++) this.blend(x, y, ...color);
      }
    }
  }

  toPNG() {
    return encodePNG(this.w, this.h, this.data);
  }
}

/* ---------------- 水果 / 炸弹 / 背景绘制 ---------------- */

const S = 256;
const C = S / 2;
const R = 100;

function drawWatermelon(b) {
  b.fillCircle(C, C, R, [47, 158, 68]);
  // 深绿条纹（旋转椭圆）
  for (let i = -2; i <= 2; i++) {
    b.fillEllipse(C, C, R * 0.95, 14, [30, 122, 48], (i * Math.PI) / 5, 0.9);
  }
  b.fillCircle(C - 30, C - 34, 16, [255, 255, 255], 0.9); // 高光
}

function drawApple(b) {
  b.fillCircle(C, C + 6, R, [214, 69, 69]);
  b.fillCircle(C - 28, C - 28, 14, [255, 255, 255], 0.9); // 高光
  b.fillRect(C - 6, C - R - 18, 12, 30, [107, 66, 31], -0.15); // 果柄
  b.fillEllipse(C + 14, C - R - 6, 24, 10, [72, 128, 52], -0.6); // 叶
}

function drawOrange(b) {
  b.fillCircle(C, C, R, [247, 144, 9]);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    b.fillCircle(C + Math.cos(a) * R * 0.55, C + Math.sin(a) * R * 0.55, 4, [194, 106, 0], 0.8);
  }
  b.fillCircle(C - 28, C - 30, 15, [255, 220, 160], 0.85); // 高光
  b.fillCircle(C, C - R, 6, [107, 66, 31]); // 果蒂
}

function drawBanana(b) {
  b.fillCircle(C + 12, C + 34, R * 0.82, [245, 197, 66]);
  b.clearCircle(C - 6, C - 30, R * 0.62); // 抠出月牙
  b.fillCircle(C + R * 0.62, C + 20, 14, [199, 154, 29], 0.8); // 两端
  b.fillCircle(C - R * 0.62, C - 14, 14, [199, 154, 29], 0.8);
}

function drawKiwi(b) {
  b.fillCircle(C, C, R, [138, 90, 51]); // 棕色外皮
  b.fillCircle(C, C, R * 0.62, [138, 201, 38]); // 果肉
  b.fillCircle(C, C, 22, [234, 247, 208]); // 白芯
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    b.fillEllipse(C + Math.cos(a) * 46, C + Math.sin(a) * 46, 7, 3.4, [46, 72, 20], a);
  }
}

function drawPineapple(b) {
  b.fillEllipse(C, C + 30, R * 0.78, R * 1.0, [232, 176, 46]); // 果身
  for (let i = -3; i <= 3; i++) {
    b.fillRect(C + i * 20 - 3, C - 52, 6, 100, [200, 147, 29], i % 2 ? 0.5 : -0.5);
  }
  for (let i = 0; i < 5; i++) {
    const px = C - 44 + i * 22;
    const py = C - 58 - (i % 2) * 8;
    b.fillPolygon(
      [
        [px, py + 44],
        [px + 22, py + 44],
        [px + 11, py - 24],
      ],
      [64, 130, 50]
    );
  }
}

function drawBomb(b) {
  b.fillCircle(C, C, R, [38, 33, 30]);
  b.fillCircle(C - 26, C - 30, 18, [120, 112, 104], 0.7); // 高光
  // 引线（棕色曲线，沿二次贝塞尔的小圆串）
  for (let t = 0; t <= 1; t += 0.1) {
    const x = C + 70 * t - 40 * t * t - 20;
    const y = C - 78 * t + 46 * t * t;
    b.fillCircle(x, y, 7, [102, 76, 46]);
  }
  // 火花
  b.fillCircle(C + 10, C - 34, 10, [255, 176, 32]);
  b.fillCircle(C + 10, C - 34, 5, [255, 240, 190]);
}

/** 道场背景（1280×720）：深棕渐变 + 木纹噪声；无 ffmpeg 时输出 PNG 数据到 .jpg 文件（浏览器按内容嗅探可显示） */
function drawDojoBg() {
  const w = 1280;
  const h = 720;
  const b = new Bitmap(w, h);
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const r = Math.round(42 - 26 * t);
    const g = Math.round(26 - 16 * t);
    const bl = Math.round(16 - 9 * t);
    for (let x = 0; x < w; x++) {
      b.blend(x, y, r, g, bl, 255);
    }
  }
  // 板条分隔线 + 细微噪声
  for (let y = 0; y < h; y += 96) {
    for (let x = 0; x < w; x++) b.blend(x, y, 10, 6, 4, 90);
  }
  let seed = 42;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 2147483647) * 2 - 1;
  };
  for (let i = 0; i < w * h * 0.12; i++) {
    const x = Math.floor(rand() * w);
    const y = Math.floor(rand() * h);
    const v = Math.floor(rand() * 10) + 4;
    b.blend(x, y, v, v, v, 22);
  }
  return b.toPNG();
}

/* ---------------- 音频合成（PCM → WAV / mp3） ---------------- */

const SR = 22050;

/** 往 PCM 里叠加一个音符 */
function addNote(pcm, freq, startSec, durSec, gain, wave = "sine", endFreq = null) {
  const s0 = Math.max(0, Math.floor(startSec * SR));
  const s1 = Math.min(pcm.length, Math.floor((startSec + durSec) * SR));
  for (let s = s0; s < s1; s++) {
    const t = (s - s0) / SR;
    const f = endFreq ? freq + ((endFreq - freq) * t) / durSec : freq;
    let v = 0;
    if (wave === "sine") v = Math.sin(2 * Math.PI * f * t);
    else if (wave === "triangle") {
      const p = 2 * Math.abs(2 * ((f * t) % 1) - 1) - 1;
      v = p;
    } else if (wave === "square") {
      v = (f * t) % 1 < 0.5 ? 1 : -1;
    }
    const env = Math.exp(-4.5 * t) * (1 - Math.exp(-160 * t));
    pcm[s] += v * gain * env;
  }
}

function addNoise(pcm, startSec, durSec, gain, lowpass = 0.5) {
  const s0 = Math.max(0, Math.floor(startSec * SR));
  const s1 = Math.min(pcm.length, Math.floor((startSec + durSec) * SR));
  let lp = 0;
  for (let s = s0; s < s1; s++) {
    const t = (s - s0) / SR;
    lp = lp + lowpass * ((Math.random() * 2 - 1) - lp);
    const env = Math.exp(-3.2 * t);
    pcm[s] += lp * gain * env;
  }
}

function synthBgm() {
  const seconds = 9.6;
  const pcm = new Float32Array(SR * seconds);
  const scale = [220, 261.63, 293.66, 329.63, 392, 440];
  const pattern = [0, 2, 4, 5, 4, 2, 3, 1, 0, 2, 4, 5, 4, 3, 2, 1];
  const step = 0.3;
  for (let i = 0; i < pattern.length * 3; i++) {
    const f = scale[pattern[i % pattern.length]];
    addNote(pcm, f, i * step, step * 0.92, 0.14, "triangle");
  }
  for (let s = 0; s < pcm.length; s++) {
    const t = s / SR;
    pcm[s] += 0.05 * (0.75 + 0.25 * Math.sin(2 * Math.PI * 0.25 * t)) * Math.sin(2 * Math.PI * 110 * t);
  }
  return pcm;
}

function synthSlice(seed) {
  const pcm = new Float32Array(SR * 0.18);
  const base = 880 + seed * 320;
  addNote(pcm, base, 0, 0.08, 0.24, "triangle", base * 1.7);
  addNoise(pcm, 0, 0.07, 0.12, 0.7);
  return pcm;
}

function synthBomb() {
  const pcm = new Float32Array(SR * 0.6);
  addNote(pcm, 100, 0, 0.55, 0.5, "square", 38);
  addNoise(pcm, 0, 0.5, 0.4, 0.25);
  return pcm;
}

function synthMiss() {
  const pcm = new Float32Array(SR * 0.2);
  addNote(pcm, 330, 0, 0.17, 0.22, "square", 140);
  return pcm;
}

function synthCombo() {
  const pcm = new Float32Array(SR * 0.34);
  [660, 880, 1108].forEach((f, i) => addNote(pcm, f, i * 0.09, 0.12, 0.2, "sine"));
  return pcm;
}

function synthLevelUp() {
  const pcm = new Float32Array(SR * 0.55);
  [523, 659, 784, 1046].forEach((f, i) => addNote(pcm, f, i * 0.1, 0.2, 0.2, "triangle"));
  return pcm;
}

function synthGameOver() {
  const pcm = new Float32Array(SR * 0.95);
  [392, 311, 233].forEach((f, i) => addNote(pcm, f, i * 0.24, 0.32, 0.22, "square", f * 0.95));
  return pcm;
}

/** Float32 PCM → 16-bit 单声道 WAV Buffer */
function pcmToWav(pcm) {
  const n = pcm.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, pcm[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

/* ---------------- 主流程 ---------------- */

const AUDIO_SPECS = [
  ["bgm", synthBgm],
  ["slice-1", () => synthSlice(0)],
  ["slice-2", () => synthSlice(1)],
  ["slice-3", () => synthSlice(2)],
  ["bomb", synthBomb],
  ["miss", synthMiss],
  ["combo", synthCombo],
  ["level-up", synthLevelUp],
  ["game-over", synthGameOver],
];

function hasFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function ffmpegEncodeMp3(wav, outPath) {
  const tmp = outPath + ".wav.tmp";
  writeFileSync(tmp, wav);
  execFileSync(
    "ffmpeg",
    ["-y", "-i", tmp, "-codec:a", "libmp3lame", "-b:a", "96k", "-q:a", "5", outPath],
    { stdio: "ignore", timeout: 30000 }
  );
  rmSync(tmp, { force: true });
}

function ffmpegEncodeJpg(pngBytes, outPath) {
  const tmp = outPath + ".png.tmp";
  writeFileSync(tmp, pngBytes);
  execFileSync(
    "ffmpeg",
    ["-y", "-i", tmp, "-q:v", "4", outPath],
    { stdio: "ignore", timeout: 30000 }
  );
  rmSync(tmp, { force: true });
}

async function main() {
  mkdirSync(join(PUBLIC, "images", "fruits"), { recursive: true });
  mkdirSync(join(PUBLIC, "images"), { recursive: true });
  mkdirSync(join(PUBLIC, "audio"), { recursive: true });

  const ffmpeg = hasFfmpeg();
  console.log(`ffmpeg: ${ffmpeg ? "可用（输出真 mp3 / jpg）" : "不可用（写入 WAV/PNG 数据，浏览器按内容解码）"}`);

  // ---- 图片 ----
  const fruits = {
    watermelon: drawWatermelon,
    apple: drawApple,
    orange: drawOrange,
    banana: drawBanana,
    kiwi: drawKiwi,
    pineapple: drawPineapple,
  };
  for (const [name, draw] of Object.entries(fruits)) {
    const b = new Bitmap(S, S);
    draw(b);
    writeFileSync(join(PUBLIC, "images", "fruits", `${name}.png`), b.toPNG());
  }
  const bombBmp = new Bitmap(S, S);
  drawBomb(bombBmp);
  writeFileSync(join(PUBLIC, "images", "bomb.png"), bombBmp.toPNG());

  const bgPng = drawDojoBg();
  if (ffmpeg) {
    ffmpegEncodeJpg(bgPng, join(PUBLIC, "images", "dojo-bg.jpg"));
  } else {
    writeFileSync(join(PUBLIC, "images", "dojo-bg.jpg"), bgPng);
  }
  console.log("图片：6 种水果 + 炸弹 + 道场背景已写入 public/images/");

  // ---- 音频 ----
  for (const [name, synth] of AUDIO_SPECS) {
    const pcm = synth();
    const wav = pcmToWav(pcm);
    const out = join(PUBLIC, "audio", `${name}.mp3`);
    if (ffmpeg) ffmpegEncodeMp3(wav, out);
    else writeFileSync(out, wav);
  }
  console.log("音频：bgm / slice×3 / bomb / miss / combo / level-up / game-over 已写入 public/audio/");

  console.log("完成。若未安装 ffmpeg：音频文件为 WAV 数据（扩展名 .mp3），浏览器按内容解码可正常播放；");
  console.log("且 AudioManager 在文件缺失时还会用 OscillatorNode 合成音效，双通道保证出声。");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
