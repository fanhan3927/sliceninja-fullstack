/**
 * AudioManager —— Web Audio 封装。
 *
 * 【音频解锁（浏览器自动播放策略）】
 * AudioContext 创建后默认处于 suspended 状态，脚本直接出声会被浏览器拦截。
 * 约定：进入对局后的第一次用户手势（pointerdown「挥刀开始」）里调用 unlock()：
 *   1) ctx.resume() 把上下文恢复为 running；
 *   2) 播放一个 1 帧静音 buffer，把该手势登记为「用户激活」；
 * 此后所有脚本触发的 BufferSource 才允许发声。unlock 之前的 play() 一律静默丢弃。
 *
 * 双通道保证出声：音频文件按 AUDIO_MANIFEST 路径 fetch + decodeAudioData；
 * 任何文件缺失 / 404 / 解码失败时，play() 自动回退到 OscillatorNode 实时合成
 * （切片高频短脉冲、炸弹低频噪声、BGM 简单五声循环），游戏不会崩、不会哑。
 */

import { AUDIO_MANIFEST, SLICE_KEYS, type AudioKey } from "./assets";

const SYNTH_BGM_SECONDS = 9.6;
const SYNTH_BGM_SAMPLE_RATE = 22050;

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<AudioKey, AudioBuffer>();
  private failedKeys = new Set<AudioKey>();
  private bgmSource: AudioBufferSourceNode | null = null;
  private bgmGain: GainNode | null = null;
  private synthBgmBuffer: AudioBuffer | null = null;
  private muted = false;
  private ducked = false;
  private unlocked = false;
  private bgmWanted = false;

  private ensureCtx(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const w = window as unknown as {
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      };
      const Ctor = w.AudioContext ?? w.webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
      this.master = null;
    }
    return this.ctx;
  }

  /** 按清单并行 fetch + decode；单个失败只记录，不阻断（进度照常推进） */
  async load(onAudioProgress?: (loaded: number, total: number) => void): Promise<AudioKey[]> {
    const ctx = this.ensureCtx();
    const total = AUDIO_MANIFEST.length;
    let loaded = 0;
    const report = () => {
      loaded += 1;
      onAudioProgress?.(loaded, total);
    };

    await Promise.all(
      AUDIO_MANIFEST.map(async (entry) => {
        try {
          if (!ctx) throw new Error("audio context unavailable");
          const res = await fetch(entry.src, { cache: "force-cache" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const bytes = await res.arrayBuffer();
          const buf = await ctx.decodeAudioData(bytes);
          this.buffers.set(entry.key, buf);
        } catch {
          this.failedKeys.add(entry.key);
        } finally {
          report();
        }
      })
    );
    return [...this.failedKeys];
  }

  /** 见文件顶部【音频解锁】注释 —— 必须在首次用户手势内调用 */
  unlock(): void {
    const ctx = this.ensureCtx();
    if (!ctx || !this.master) return;
    if (ctx.state === "suspended") void ctx.resume();
    if (this.unlocked) return;
    this.unlocked = true;
    try {
      const silent = ctx.createBuffer(1, 1, SYNTH_BGM_SAMPLE_RATE);
      const src = ctx.createBufferSource();
      src.buffer = silent;
      src.connect(this.master);
      src.start(0);
    } catch {
      /* 静音 buffer 失败不影响主流程 */
    }
    // 手势晚到时补开 BGM
    if (this.bgmWanted) this.setBgm(true);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.02);
    }
    if (muted) this.stopBgmSource();
    else if (this.bgmWanted) this.setBgm(true);
  }

  /** 播放一次（文件通道优先，失败走合成） */
  play(key: AudioKey): void {
    if (this.muted || key === "bgm") return;
    const ctx = this.ensureCtx();
    if (!ctx || !this.master || ctx.state !== "running") return;
    const volume = AUDIO_MANIFEST.find((e) => e.key === key)?.volume ?? 0.7;
    const buf = this.buffers.get(key);
    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.value = volume;
      src.connect(gain);
      gain.connect(this.master);
      src.start();
      return;
    }
    this.playSynth(key, volume);
  }

  /** 切片音三选一随机，避免单调 */
  playSlice(): void {
    const pick = SLICE_KEYS[Math.floor(Math.random() * SLICE_KEYS.length)];
    this.play(pick);
  }

  /** BGM 开关：playing 状态 loop；由 setBgmDucked 控制暂停时压低 */
  setBgm(on: boolean): void {
    this.bgmWanted = on;
    if (!on) {
      this.stopBgmSource();
      return;
    }
    if (this.bgmSource || this.muted) return;
    const ctx = this.ensureCtx();
    if (!ctx || !this.master || ctx.state !== "running") return;

    const buf = this.buffers.get("bgm") ?? this.buildSynthBgm(ctx);
    if (!buf) return;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = this.ducked ? this.duckVolume() : this.bgmVolume();
    src.connect(gain);
    gain.connect(this.master);
    src.start();
    this.bgmSource = src;
    this.bgmGain = gain;
  }

  /** 暂停时 BGM 音量压到 0.08（TECH_DESIGN 约定），恢复时回到正常 */
  setBgmDucked(ducked: boolean): void {
    this.ducked = ducked;
    if (this.bgmGain && this.ctx) {
      this.bgmGain.gain.setTargetAtTime(
        ducked ? this.duckVolume() : this.bgmVolume(),
        this.ctx.currentTime,
        0.08
      );
    }
  }

  /** 页面卸载 / 引擎销毁时调用 */
  destroy(): void {
    this.stopBgmSource();
    if (this.ctx) void this.ctx.close().catch(() => undefined);
    this.ctx = null;
    this.master = null;
  }

  private bgmVolume(): number {
    return AUDIO_MANIFEST.find((e) => e.key === "bgm")?.volume ?? 0.35;
  }

  private duckVolume(): number {
    return 0.08;
  }

  private stopBgmSource(): void {
    if (this.bgmSource) {
      try {
        this.bgmSource.stop();
      } catch {
        /* already stopped */
      }
      this.bgmSource.disconnect();
      this.bgmSource = null;
      this.bgmGain = null;
    }
  }

  /* ---------------- 振荡器合成通道（文件失败时的兜底） ---------------- */

  private tone(
    freq: number,
    freqEnd: number,
    startOffset: number,
    dur: number,
    gain: number,
    type: OscillatorType
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + startOffset;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), t0 + dur);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  private noiseBurst(startOffset: number, dur: number, gain: number, lowpassHz: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + startOffset;
    const frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = lowpassHz;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t0);
  }

  private playSynth(key: AudioKey, volume: number): void {
    switch (key) {
      case "slice-1":
      case "slice-2":
      case "slice-3": {
        const base = 880 + Math.random() * 360;
        this.tone(base, base * 1.6, 0, 0.07, 0.22 * (volume / 0.7), "triangle");
        this.noiseBurst(0, 0.05, 0.1, 6000);
        break;
      }
      case "bomb":
        this.tone(90, 40, 0, 0.55, 0.5, "sawtooth");
        this.noiseBurst(0, 0.45, 0.4, 900);
        break;
      case "miss":
        this.tone(320, 150, 0, 0.16, 0.22 * (volume / 0.6), "square");
        break;
      case "combo": {
        const notes = [660, 880, 1108];
        notes.forEach((f, i) => this.tone(f, f, i * 0.07, 0.12, 0.2, "sine"));
        break;
      }
      case "level-up": {
        const notes = [523, 659, 784, 1046];
        notes.forEach((f, i) => this.tone(f, f, i * 0.09, 0.18, 0.2, "triangle"));
        break;
      }
      case "game-over": {
        const notes = [392, 311, 233];
        notes.forEach((f, i) => this.tone(f, f * 0.97, i * 0.22, 0.3, 0.22, "square"));
        break;
      }
      case "bgm":
        this.setBgm(true);
        break;
    }
  }

  /** 合成 BGM：五声音阶琶音 + 低音持续音的简单循环（仅在 bgm.mp3 缺失时构建一次） */
  private buildSynthBgm(ctx: AudioContext): AudioBuffer | null {
    if (this.synthBgmBuffer) return this.synthBgmBuffer;
    try {
      const rate = SYNTH_BGM_SAMPLE_RATE;
      const frames = Math.floor(rate * SYNTH_BGM_SECONDS);
      const data = new Float32Array(frames);
      // A 五声：A3 C4 D4 E4 G4 A4
      const scale = [220, 261.63, 293.66, 329.63, 392, 440];
      const pattern = [0, 2, 4, 5, 4, 2, 3, 1, 0, 2, 4, 5, 4, 3, 2, 1];
      const stepSec = 0.3;
      for (let i = 0; i < pattern.length * 3; i++) {
        const freq = scale[pattern[i % pattern.length]];
        const startSec = i * stepSec;
        const dur = stepSec * 0.92;
        const s0 = Math.floor(startSec * rate);
        const s1 = Math.min(frames, Math.floor((startSec + dur) * rate));
        for (let s = s0; s < s1; s++) {
          const t = (s - s0) / rate;
          const env = Math.exp(-3.2 * t) * (1 - Math.exp(-200 * t));
          data[s] += 0.16 * env * Math.sin(2 * Math.PI * freq * t);
          data[s] += 0.05 * env * Math.sin(2 * Math.PI * freq * 2 * t);
        }
      }
      // 低音持续（110Hz）+ 慢颤音
      for (let s = 0; s < frames; s++) {
        const t = s / rate;
        const trem = 0.75 + 0.25 * Math.sin(2 * Math.PI * 0.25 * t);
        data[s] += 0.05 * trem * Math.sin(2 * Math.PI * 110 * t);
      }
      const buf = ctx.createBuffer(1, frames, rate);
      buf.copyToChannel(data, 0);
      this.synthBgmBuffer = buf;
      return buf;
    } catch {
      return null;
    }
  }
}
