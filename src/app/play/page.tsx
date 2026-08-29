import type { Metadata } from "next";
import { GameCanvas } from "@/components/game/GameCanvas";

export const metadata: Metadata = {
  title: "开始切割",
  description: "滑动切割水果，避开炸弹，冲击排行榜。",
};

/** 游戏页：整屏沉浸，禁止页面滚动（移动端滑切不穿透） */
export default function PlayPage() {
  return (
    <main className="flex h-dvh flex-col overflow-hidden overscroll-none">
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <GameCanvas />
      </div>
    </main>
  );
}
