import type { Metadata } from "next";
import Link from "next/link";
import { getLeaderboard } from "@/lib/leaderboard";

export const metadata: Metadata = { title: "排行榜" };

export default async function LeaderboardPage() {
  const entries = await getLeaderboard(50);

  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-4 pb-16 pt-10">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-serif-display text-4xl font-black text-gold">排行榜</h1>
          <p className="mt-1 text-sm text-parchment">每名忍者取最高分，并列按最早达成时间</p>
        </div>
        <Link href="/play" className="btn-gold rounded-lg px-5 py-2 text-sm font-bold">
          去切一局
        </Link>
      </div>

      <div className="card-wood overflow-hidden rounded-xl">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gold/15 text-xs tracking-wider text-parchment/60">
              <th className="px-4 py-3 font-normal">#</th>
              <th className="px-4 py-3 font-normal">忍者</th>
              <th className="px-4 py-3 text-right font-normal">最高分</th>
              <th className="hidden px-4 py-3 text-right font-normal sm:table-cell">
                达成时间
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-14 text-center text-parchment/60">
                  暂无战绩，快来成为第一名
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr
                  key={e.rank}
                  className="border-b border-gold/5 last:border-0 hover:bg-gold/5"
                >
                  <td
                    className={`px-4 py-3 font-num ${
                      e.rank === 1
                        ? "text-2xl font-black text-gold"
                        : e.rank <= 3
                          ? "text-lg font-bold text-gold/80"
                          : "text-parchment/70"
                    }`}
                  >
                    {e.rank}
                  </td>
                  <td className="px-4 py-3 text-antique">{e.name}</td>
                  <td className="px-4 py-3 text-right font-num font-bold text-leaf">
                    {e.score.toLocaleString()}
                  </td>
                  <td className="hidden px-4 py-3 text-right font-num text-parchment/50 sm:table-cell">
                    {new Date(e.createdAt).toLocaleString("zh-CN")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
