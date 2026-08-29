"use client";

import Link from "next/link";
import type { EndReason, GameSnapshot } from "@/game/types";

export interface AchievementUnlocked {
  key: string;
  title: string;
  description: string;
}

export function GameOverModal({
  snapshot,
  reason,
  best,
  saveState,
  newAchievements,
  onRestart,
}: {
  snapshot: GameSnapshot;
  reason: EndReason;
  best: number;
  saveState: "idle" | "saving" | "saved" | "error";
  newAchievements: AchievementUnlocked[];
  onRestart: () => void;
}) {
  const reasonText = reason === "BOMB" ? "切中炸弹，道场爆炸" : "漏切三次，遗憾出局";
  const isNewBest = snapshot.score > best;

  const rows: Array<[string, string]> = [
    ["分数", snapshot.score.toLocaleString()],
    ["Level", String(snapshot.level)],
    ["最高连击", `×${snapshot.maxCombo}`],
    ["切开", String(snapshot.fruitsSliced)],
    ["漏切", String(snapshot.fruitsMissed)],
    ["炸弹", String(snapshot.bombsHit)],
    ["时长", `${(snapshot.elapsedMs / 1000).toFixed(1)}s`],
  ];

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="card-wood w-full max-w-md rounded-2xl p-6 text-center">
        <h2 className="font-serif-display text-3xl font-black text-gold">
          本局结束
        </h2>
        <p className="mt-1 text-sm text-parchment">{reasonText}</p>

        {isNewBest ? (
          <p className="mx-auto mt-2 inline-block rounded-full border border-gold/50 bg-gold/15 px-3 py-0.5 text-xs font-bold text-gold">
            🏆 新纪录！
          </p>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-2 text-left">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="rounded-lg border border-gold/10 bg-black/25 px-3 py-2"
            >
              <div className="text-[11px] text-parchment/60">{label}</div>
              <div className="font-num text-lg font-black text-antique">{value}</div>
            </div>
          ))}
        </div>

        {saveState === "saved" ? (
          <p className="mt-3 text-sm font-bold text-leaf">✓ 已保存到战绩</p>
        ) : saveState === "error" ? (
          <p className="mt-3 text-sm text-ember">保存失败，请检查网络后重试</p>
        ) : saveState === "idle" ? (
          <p className="mt-3 text-sm text-parchment/80">
            <Link
              href="/login?next=/play"
              className="text-gold underline decoration-gold/40 hover:decoration-gold"
            >
              登录
            </Link>
            {" 后战绩自动入库、可冲排行榜"}
          </p>
        ) : (
          <p className="mt-3 text-sm text-parchment/70">正在保存…</p>
        )}

        {newAchievements.length > 0 ? (
          <div className="mt-3 space-y-1 rounded-lg border border-gold/25 bg-gold/10 p-3 text-left">
            <p className="text-xs font-bold text-gold">成就解锁 ✨</p>
            {newAchievements.map((a) => (
              <p key={a.key} className="text-xs text-antique">
                {a.title} —— {a.description}
              </p>
            ))}
          </div>
        ) : null}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onRestart}
            className="btn-gold flex-1 rounded-xl px-4 py-3 font-bold"
          >
            再来一局
          </button>
          <Link
            href="/"
            className="btn-ghost flex-1 rounded-xl px-4 py-3 text-center font-bold"
          >
            返回大厅
          </Link>
        </div>
      </div>
    </div>
  );
}
