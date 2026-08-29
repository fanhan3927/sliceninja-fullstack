import type { DefaultSession } from "next-auth";

/**
 * 类型增强（Auth.js v5 官方模式）。
 * 注意：next-auth 的 Session/User/JWT 由 @auth/core 再导出，这里的 interface 声明
 * 会以「本模块内新声明」的形式参与解析，因此 session.user 可携带 id / role。
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "USER" | "ADMIN";
    } & DefaultSession["user"];
  }

  interface User {
    role?: "USER" | "ADMIN";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: "USER" | "ADMIN";
  }
}
