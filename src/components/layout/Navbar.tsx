import Link from "next/link";
import { auth } from "@/lib/auth";
import { signOutAction } from "@/app/actions/auth";

/** 公共导航：登录态显示名字 / 历史战绩 / 退出；未登录显示登录注册 */
export async function Navbar() {
  const session = await auth();
  const user = session?.user;

  return (
    <header className="sticky top-0 z-40 border-b border-gold/15 bg-wood-950/80 backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="font-serif-display text-xl font-black text-gold">
          Slice<span className="text-antique">Ninja</span>
        </Link>

        <div className="ml-2 hidden gap-1 sm:flex">
          <Link
            href="/"
            className="rounded-md px-3 py-1.5 text-sm text-parchment hover:bg-gold/10 hover:text-gold"
          >
            大厅
          </Link>
          <Link
            href="/leaderboard"
            className="rounded-md px-3 py-1.5 text-sm text-parchment hover:bg-gold/10 hover:text-gold"
          >
            排行榜
          </Link>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <>
              <Link
                href="/history"
                className="hidden rounded-md px-2 py-1 text-sm text-parchment hover:bg-gold/10 hover:text-gold sm:block"
                title="我的战绩"
              >
                {user.name}
              </Link>
              {user.role === "ADMIN" ? (
                <Link
                  href="/admin/config"
                  className="rounded-md px-2 py-1 text-sm text-ember hover:bg-ember/10"
                  title="难度配置管理"
                >
                  管理
                </Link>
              ) : null}
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="btn-ghost rounded-md px-3 py-1.5 text-sm font-bold"
                >
                  退出
                </button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-md px-3 py-1.5 text-sm text-parchment hover:bg-gold/10 hover:text-gold"
              >
                登录
              </Link>
              <Link
                href="/register"
                className="btn-gold rounded-md px-3 py-1.5 text-sm font-bold"
              >
                注册
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
