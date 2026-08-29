"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(loginAction, {});

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <input type="hidden" name="next" value={next} />

      <label className="block">
        <span className="mb-1 block text-sm text-parchment">邮箱</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="w-full rounded-lg border border-gold/20 bg-black/35 px-3 py-2.5 text-antique outline-none placeholder:text-parchment/40 focus:border-gold/60"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm text-parchment">密码</span>
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          className="w-full rounded-lg border border-gold/20 bg-black/35 px-3 py-2.5 text-antique outline-none placeholder:text-parchment/40 focus:border-gold/60"
        />
      </label>

      {state.error ? (
        <p className="rounded-lg border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="btn-gold w-full rounded-lg py-2.5 font-bold disabled:opacity-60"
      >
        {pending ? "验证中…" : "登录"}
      </button>
    </form>
  );
}
