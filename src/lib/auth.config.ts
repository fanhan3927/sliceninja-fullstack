import type { NextAuthConfig } from "next-auth";

/**
 * Edge 安全的共享 Auth 配置：被 middleware 与主 auth.ts 共用。
 * 注意：这里禁止引入 Prisma / bcrypt 等 Node 专属依赖（middleware 运行在 Edge Runtime）。
 * Credentials Provider（含数据库查询）只在 src/lib/auth.ts 中注册。
 *
 * token / session 形状由我们注入（见 src/types/next-auth.d.ts 增强），
 * 但 @auth/core 内部签名引用的是其自身类型，这里对参数做局部窄化以保持干净编译。
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    /** 登录时把 id / role 写进 JWT */
    jwt({ token, user }) {
      const u = user as { id?: string; role?: "USER" | "ADMIN" } | undefined;
      const t = token as { id?: string; role?: "USER" | "ADMIN" };
      if (u?.id) t.id = u.id;
      if (u?.role) t.role = u.role;
      return token;
    },
    /** 把 JWT 中的 id / role 映射进 session（session 含 id, role, name, email） */
    session({ session, token }) {
      const s = session as {
        user?: { id?: string; role?: "USER" | "ADMIN"; name?: string | null; email?: string | null };
      };
      const t = token as { id?: string; role?: "USER" | "ADMIN"; name?: string | null; email?: string | null };
      if (s.user) {
        s.user.id = t.id ?? "";
        s.user.role = t.role ?? "USER";
        if (t.name) s.user.name = t.name;
        if (t.email) s.user.email = t.email;
      }
      return session;
    },
  },
  providers: [], // middleware 复用此配置解码 JWT；真正的 Provider 在 auth.ts 中追加
} satisfies NextAuthConfig;
