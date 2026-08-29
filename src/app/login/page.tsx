import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "登录" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const nextPath = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="card-wood w-full max-w-md rounded-2xl p-8">
        <h1 className="font-serif-display text-center text-3xl font-black text-gold">
          登录道场
        </h1>
        <p className="mt-2 text-center text-sm text-parchment">
          登录后战绩自动入库，冲榜更有意义
        </p>

        <LoginForm next={nextPath} />

        <p className="mt-6 text-center text-sm text-parchment">
          还没有账号？
          <Link
            href={`/register?next=${encodeURIComponent(nextPath)}`}
            className="ml-1 text-gold underline decoration-gold/40 hover:decoration-gold"
          >
            立即注册
          </Link>
        </p>

        <div className="mt-6 rounded-lg border border-gold/15 bg-black/25 p-3 text-xs leading-5 text-parchment/80">
          <p className="font-bold text-gold/80">演示账号（本地 seed）</p>
          <p>用户：demo@sliceninja.dev / Demo1234!</p>
          <p>管理员：admin@sliceninja.dev / Admin1234!</p>
        </div>
      </div>
    </main>
  );
}
