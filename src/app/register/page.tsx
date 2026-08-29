import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "注册" };

export default async function RegisterPage({
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
          加入道场
        </h1>
        <p className="mt-2 text-center text-sm text-parchment">
          注册即留存每一局战绩与成就
        </p>

        <RegisterForm next={nextPath} />

        <p className="mt-6 text-center text-sm text-parchment">
          已有账号？
          <Link
            href={`/login?next=${encodeURIComponent(nextPath)}`}
            className="ml-1 text-gold underline decoration-gold/40 hover:decoration-gold"
          >
            直接登录
          </Link>
        </p>
      </div>
    </main>
  );
}
