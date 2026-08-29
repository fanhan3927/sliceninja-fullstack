"use client";

import type { GameSnapshot } from "@/game/types";

/** 顶栏 HUD：不挡刀路（半透明），分数 / 连击 / Level / 生命 / 最高分 / 操作按钮 */
export function Hud({
  snapshot,
  best,
  muted,
  paused,
  onToggleMute,
  onTogglePause,
  canPause,
}: {
  snapshot: GameSnapshot | null;
  best: number;
  muted: boolean;
  paused: boolean;
  onToggleMute: () => void;
  onTogglePause: () => void;
  canPause: boolean;
}) {
  const s = snapshot;
  const lives = s?.lives ?? 3;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 bg-gradient-to-b from-black/55 to-transparent px-3 pb-8 pt-2 sm:px-5">
      {/* 分数 */}
      <div className="min-w-0">
        <div className="text-xs tracking-wider text-parchment/80">分数</div>
        <div className="font-num text-3xl font-black leading-none text-leaf sm:text-4xl">
          {s ? s.score.toLocaleString() : "0"}
        </div>
        <div className="font-num mt-1 text-xs text-parchment/70">
          最高 {best.toLocaleString()}
        </div>
      </div>

      {/* 连击 / Level */}
      <div className="flex flex-col items-center">
        <div
          className={`font-num text-2xl font-black transition-opacity sm:text-3xl ${
            s?.comboActive ? "text-gold opacity-100" : "text-parchment/30 opacity-60"
          }`}
        >
          {s?.comboActive && s.combo >= 2 ? `×${s.combo}` : "—"}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="rounded-md bg-gold/15 px-2 py-0.5 font-num text-sm font-bold text-gold">
            Lv.{s?.level ?? 1}
          </span>
          {s ? (
            <span className="hidden rounded-md bg-black/30 px-2 py-0.5 font-num text-[11px] text-parchment/60 sm:inline">
              再切 {s.nextLevelIn} 升 Lv.{s.level + 1}
            </span>
          ) : null}
        </div>
      </div>

      {/* 生命 + 按钮 */}
      <div className="flex flex-col items-end gap-2">
        <div className="flex gap-1 text-lg" aria-label={`生命 ${lives}`}>
          {Array.from({ length: 3 }).map((_, i) => (
            <span
              key={i}
              className={
                i < lives ? "text-ember drop-shadow" : "text-parchment/20"
              }
            >
              ✖
            </span>
          ))}
        </div>
        <div className="pointer-events-auto flex gap-2">
          <button
            type="button"
            onClick={onTogglePause}
            disabled={!canPause}
            className="rounded-md border border-gold/30 bg-black/40 px-2.5 py-1 text-sm text-gold backdrop-blur transition hover:bg-gold/15 disabled:opacity-40"
            aria-label={paused ? "继续" : "暂停"}
          >
            {paused ? "▶" : "⏸"}
          </button>
          <button
            type="button"
            onClick={onToggleMute}
            className="rounded-md border border-gold/30 bg-black/40 px-2.5 py-1 text-sm text-gold backdrop-blur transition hover:bg-gold/15"
            aria-label={muted ? "取消静音" : "静音"}
          >
            {muted ? "🔇" : "🔊"}
          </button>
        </div>
        {s ? (
          <span className="font-num text-[10px] text-parchment/40">{s.fps}fps</span>
        ) : null}
      </div>
    </div>
  );
}
