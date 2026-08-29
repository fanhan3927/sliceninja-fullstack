import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getLeaderboard } from "@/lib/leaderboard";

export const metadata: Metadata = {
  title: "SliceNinja · 水果切割道场",
  description: "滑动切割水果，避开炸弹，冲击排行榜。",
};

/** 大厅：标题 + 玩法 3 条 + 主按钮 + 排行榜 Top 10（Server Component 直查） */
export default async function Home() {
  const session = await auth();
  const top = await getLeaderboard(10);
  const user = session?.user;

  const rules = [
    ["🍉", "滑动切割", "鼠标 / 触控挥出刀光，切开飞出的水果"],
    ["💣", "避开炸弹", "切中炸弹立即结束，漏切三次同样出局"],
    ["🔥", "连击升级", "连击加分，Level 越高出果越密越快"],
  ];

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col items-center px-4 pb-16 pt-10">
      {/* Hero */}
      <section className="text-center">
        <p className="text-sm tracking-[0.4em] text-gold/70">水果切割 · 道场试炼</p>
        <h1 className="font-serif-display mt-2 text-6xl font-black leading-none text-gold drop-shadow-[0_4px_24px_rgba(240,181,66,0.35)] md:text-8xl">
          Slice<span className="text-antique">Ninja</span>
        </h1>
        <p className="mx-auto mt-4 max-w-md text-parchment">
          挥刀如风，果落如雨。一刀一果皆功夫，三命一轮定乾坤。
        </p>

        {user ? (
          <p className="mt-4 text-sm text-parchment/80">
            欢迎回来，<span className="font-bold text-gold">{user.name}</span>
            {user.role === "ADMIN" ? "（管理员）" : ""}
          </p>
        ) : null}

        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/play"
            className="btn-gold w-56 rounded-xl px-8 py-4 text-center text-lg font-black tracking-widest"
          >
            开始切割
          </Link>
          <Link
            href="/leaderboard"
            className="btn-ghost w-56 rounded-xl px-8 py-4 text-center font-bold"
          >
            查看排行榜
          </Link>
        </div>
      </section>

      {/* 玩法 3 条 */}
      <section className="mt-12 grid w-full gap-4 sm:grid-cols-3">
        {rules.map(([icon, title, desc]) => (
          <div key={title} className="card-wood rounded-xl p-5">
            <div className="text-2xl">{icon}</div>
            <h2 className="mt-2 font-serif-display text-lg font-bold text-gold">{title}</h2>
            <p className="mt-1 text-sm text-parchment/80">{desc}</p>
          </div>
        ))}
      </section>

      {/* 排行榜 Top 10 */}
      <section className="mt-12 w-full">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-serif-display text-2xl font-black text-antique">
            道场排行
          </h2>
          <Link href="/leaderboard" className="text-sm text-gold hover:underline">
            完整 Top 50 →
          </Link>
        </div>
        <div className="card-wood overflow-hidden rounded-xl">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gold/15 text-xs tracking-wider text-parchment/60">
                <th className="px-4 py-2.5 font-normal">#</th>
                <th className="px-4 py-2.5 font-normal">忍者</th>
                <th className="px-4 py-2.5 text-right font-normal">最高分</th>
              </tr>
            </thead>
            <tbody>
              {top.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-parchment/60">
                    还没有战绩 —— 拿起刀，成为第一个上榜的人
                  </td>
                </tr>
              ) : (
                top.map((e) => (
                  <tr key={e.rank} className="border-b border-gold/5 last:border-0 hover:bg-gold/5">
                    <td
                      className={`px-4 py-2.5 font-num ${
                        e.rank === 1 ? "text-2xl font-black text-gold" : "text-parchment/70"
                      }`}
                    >
                      {e.rank}
                    </td>
                    <td className="px-4 py-2.5 text-antique">{e.name}</td>
                    <td className="px-4 py-2.5 text-right font-num font-bold text-leaf">
                      {e.score.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
