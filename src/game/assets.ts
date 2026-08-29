/**
 * 资源清单 —— 路径与 PRD「多媒体硬性约定」一字不差。
 * AudioManager / 加载器只允许使用这里的 URL。
 */

import type { FruitKind, LoadProgress } from "./types";

export type ImageKey = FruitKind | "bomb" | "dojo-bg";

export interface ImageManifestEntry {
  key: ImageKey;
  src: string;
}

export const IMAGE_MANIFEST: readonly ImageManifestEntry[] = [
  { key: "watermelon", src: "/images/fruits/watermelon.png" },
  { key: "apple", src: "/images/fruits/apple.png" },
  { key: "orange", src: "/images/fruits/orange.png" },
  { key: "banana", src: "/images/fruits/banana.png" },
  { key: "kiwi", src: "/images/fruits/kiwi.png" },
  { key: "pineapple", src: "/images/fruits/pineapple.png" },
  { key: "bomb", src: "/images/bomb.png" },
  { key: "dojo-bg", src: "/images/dojo-bg.jpg" },
] as const;

export interface AudioManifestEntry {
  key: AudioKey;
  src: string;
  loop: boolean;
  volume: number;
}

export type AudioKey =
  | "bgm"
  | "slice-1"
  | "slice-2"
  | "slice-3"
  | "bomb"
  | "miss"
  | "combo"
  | "level-up"
  | "game-over";

/** 音频清单（与 TECH_DESIGN.md 完全一致） */
export const AUDIO_MANIFEST: readonly AudioManifestEntry[] = [
  { key: "bgm", src: "/audio/bgm.mp3", loop: true, volume: 0.35 },
  { key: "slice-1", src: "/audio/slice-1.mp3", loop: false, volume: 0.7 },
  { key: "slice-2", src: "/audio/slice-2.mp3", loop: false, volume: 0.7 },
  { key: "slice-3", src: "/audio/slice-3.mp3", loop: false, volume: 0.7 },
  { key: "bomb", src: "/audio/bomb.mp3", loop: false, volume: 0.9 },
  { key: "miss", src: "/audio/miss.mp3", loop: false, volume: 0.6 },
  { key: "combo", src: "/audio/combo.mp3", loop: false, volume: 0.75 },
  { key: "level-up", src: "/audio/level-up.mp3", loop: false, volume: 0.7 },
  { key: "game-over", src: "/audio/game-over.mp3", loop: false, volume: 0.8 },
] as const;

export const SLICE_KEYS: readonly AudioKey[] = ["slice-1", "slice-2", "slice-3"] as const;

/** 加载单张图片：失败 resolve(null)（渲染器走占位圆盘），不阻断开局 */
export function loadImage(entry: ImageManifestEntry, timeoutMs = 8000): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(ok ? img : null);
    };
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = entry.src;
  });
}

export interface AssetLoadResult {
  images: Partial<Record<ImageKey, HTMLImageElement>>;
  imageFailed: ImageKey[];
  audioFailed: AudioKey[];
}

/** 并行加载图片 + 音频，统一汇报进度 */
export async function loadAssets(
  loadAudio: (onAudioProgress: (loaded: number, total: number) => void) => Promise<AudioKey[]>,
  onProgress?: (p: LoadProgress) => void
): Promise<AssetLoadResult> {
  const progress: LoadProgress = {
    imagesLoaded: 0,
    imagesTotal: IMAGE_MANIFEST.length,
    audioLoaded: 0,
    audioTotal: AUDIO_MANIFEST.length,
  };
  const emit = () => onProgress?.({ ...progress });

  const imagesPromise = (async () => {
    const images: Partial<Record<ImageKey, HTMLImageElement>> = {};
    const failed: ImageKey[] = [];
    await Promise.all(
      IMAGE_MANIFEST.map(async (entry) => {
        const img = await loadImage(entry);
        if (img) images[entry.key] = img;
        else failed.push(entry.key);
        progress.imagesLoaded += 1;
        emit();
      })
    );
    return { images, failed };
  })();

  const audioPromise = (async () => {
    const failed = await loadAudio((loaded) => {
      progress.audioLoaded = loaded;
      emit();
    });
    return failed;
  })();

  const [{ images, failed: imageFailed }, audioFailed] = await Promise.all([
    imagesPromise,
    audioPromise,
  ]);
  emit();

  return { images, imageFailed, audioFailed };
}
