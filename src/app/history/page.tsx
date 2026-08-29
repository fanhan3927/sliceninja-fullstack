import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "我的战绩" };

const REASON_TEXT: Record<string, string> = {
  MISS: "漏切出局",
  BOMB: "切中炸弹",
  QUIT: "中途退出",
};

export default async function HistoryPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?next=/history");

  const sessions = await prisma.gameSession.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <main className="mx-auto min-h-dvh max-w-4xl px-4 pb-16 pt-10">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-serif-display text-4xl font-black text-gold">我的战绩</h1>
          <p className="mt-1 text-sm text-parchment">
            {session.user.name} · 最近 {sessions.length} 局
          </p>
        </div>
        <Link href="/play" className="btn-gold rounded-lg px-5 py-2 text-sm font-bold">
          再来一局
        </Link>
      </div>

      {sessions.length === 0 ? (
        <div className="card-wood rounded-xl px-6 py-14 text-center text-parchment/70">
          还没有对局记录 —— 去打一局，战绩会自动出现在这里
        </div>
      ) : (
        <div className="card-wood overflow-x-auto rounded-xl">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-gold/15 text-xs tracking-wider text-parchment/60">
                <th className="px-4 py-3 font-normal">时间</th>
                <th className="px-4 py-3 text-right font-normal">分数</th>
                <th className="px-4 py-3 text-center font-normal">Level</th>
                <th className="px-4 py-3 text-center font-normal">连击</th>
                <th className="px-4 py-3 text-center font-normal">切开/漏切</th>
                <th className="px-4 py-3 text-center font-normal">结局</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-gold/5 last:border-0 hover:bg-gold/5"
                >
                  <td className="px-4 py-3 font-num text-parchment/70">
                    {s.createdAt.toLocaleString("zh-CN")}
                  </td>
                  <td className="px-4 py-3 text-right font-num font-bold text-leaf">
                    {s.score.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-center font-num">{s.levelReached}</td>
                  <td className="px-4 py-3 text-center font-num">×{s.maxCombo}</td>
                  <td className="px-4 py-3 text-center font-num">
                    {s.fruitsSliced}/{s.fruitsMissed}
                  </td>
                  <td className="px-4 py-3 text-center text-parchment/80">
                    {REASON_TEXT[s.endedReason] ?? s.endedReason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
