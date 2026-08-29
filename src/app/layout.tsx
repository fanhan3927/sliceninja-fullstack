import type { Metadata, Viewport } from "next";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SliceNinja · 水果切割道场",
    template: "%s · SliceNinja",
  },
  description:
    "SliceNinja —— 浏览器上的水果切割游戏：挥刀、连击、升级，挑战排行榜。",
};

export const viewport: Viewport = {
  themeColor: "#140c08",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      {/*
        字体策略：Noto Serif SC 通过 Google Fonts <link> 引入（display=swap），
        网络不可用时优雅回退到本地衬线字体栈，不阻塞构建。
      */}
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- 刻意用 <link> 优雅降级：网络不可用时回退本地衬线字体，不阻塞构建 */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@600;900&display=swap"
        />
      </head>
      <body className="min-h-dvh bg-night text-antique antialiased">
        <Navbar />
        {children}
        <Footer />
      </body>
    </html>
  );
}
