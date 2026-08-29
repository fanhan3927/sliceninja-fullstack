import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

/**
 * 路由保护：/history、/admin 需登录；/admin 还需 ADMIN 角色。
 * 业务页内部仍会二次校验 session（纵深防御）。
 */
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const path = nextUrl.pathname;
  const isLoggedIn = !!req.auth;
  const isAdminArea = path.startsWith("/admin");
  const isHistoryArea = path.startsWith("/history");

  if (!isLoggedIn && (isAdminArea || isHistoryArea)) {
    const loginUrl = new URL("/login", nextUrl.origin);
    loginUrl.searchParams.set("next", path);
    return Response.redirect(loginUrl);
  }

  if (isAdminArea && req.auth?.user.role !== "ADMIN") {
    return Response.redirect(new URL("/", nextUrl.origin));
  }
});

export const config = {
  matcher: ["/history/:path*", "/admin/:path*"],
};
