"use client";

export interface LoaderProgress {
  imagesLoaded: number;
  imagesTotal: number;
  audioLoaded: number;
  audioTotal: number;
}

/**
 * 资源加载遮罩：显示「图片 x/y · 音频 x/y」与双进度条；
 * 全部就绪（或部分失败）后出现「挥刀开始」。
 * 音频文件缺失不会阻断开局 —— 显示合成音效提示，仍可开始（强制开始路径）。
 */
export function LoaderOverlay({
  progress,
  done,
  audioFailedCount,
  onStart,
}: {
  progress: LoaderProgress;
  done: boolean;
  audioFailedCount: number;
  onStart: () => void;
}) {
  const imagesPct =
    progress.imagesTotal > 0
      ? Math.round((progress.imagesLoaded / progress.imagesTotal) * 100)
      : 0;
  const audioPct =
    progress.audioTotal > 0
      ? Math.round((progress.audioLoaded / progress.audioTotal) * 100)
      : 0;

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-wood-950/90 backdrop-blur-sm">
      <p className="font-serif-display text-3xl font-black tracking-wide text-gold">
        挥刀入道场
      </p>

      <div className="w-72 space-y-3">
        <div>
          <div className="mb-1 flex justify-between text-xs text-parchment">
            <span>图片</span>
            <span className="font-num">
              {progress.imagesLoaded}/{progress.imagesTotal}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-black/50">
            <div
              className="h-full rounded-full bg-gradient-to-r from-gold-deep to-gold transition-all duration-300"
              style={{ width: `${imagesPct}%` }}
            />
          </div>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-xs text-parchment">
            <span>音频</span>
            <span className="font-num">
              {progress.audioLoaded}/{progress.audioTotal}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-black/50">
            <div
              className="h-full rounded-full bg-gradient-to-r from-ember to-gold transition-all duration-300"
              style={{ width: `${audioPct}%` }}
            />
          </div>
        </div>
      </div>

      {!done ? (
        <p className="text-xs text-parchment/60">正在打磨刀锋…</p>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={onStart}
            className="btn-gold rounded-xl px-10 py-3.5 text-lg font-black tracking-widest"
          >
            挥刀开始
          </button>
          {audioFailedCount > 0 ? (
            <p className="text-xs text-parchment/70">
              {audioFailedCount} 个音频文件缺失，已启用合成音效，可强制开始
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
