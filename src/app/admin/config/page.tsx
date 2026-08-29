import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_DIFFICULTY } from "@/game/constants";
import { ConfigEditor } from "@/components/admin/ConfigEditor";

export const metadata: Metadata = { title: "管理配置" };

/** 管理配置：仅 ADMIN；textarea JSON + 保存（见 AGENTS.md，不做可视化编辑器） */
export default async function AdminConfigPage() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") redirect("/");

  const row = await prisma.gameConfig.findUnique({ where: { id: "default" } });
  let jsonText = JSON.stringify(DEFAULT_DIFFICULTY, null, 2);
  let version = 1;
  let updatedAt: string | null = null;

  if (row) {
    version = row.version;
    updatedAt = row.updatedAt.toISOString();
    try {
      const parsed = JSON.parse(row.json);
      jsonText = JSON.stringify(parsed, null, 2);
    } catch {
      /* 损坏则显示默认 */
    }
  }

  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-4 pb-16 pt-10">
      <div className="mb-6">
        <h1 className="font-serif-display text-4xl font-black text-gold">难度配置</h1>
        <p className="mt-1 text-sm text-parchment">
          管理员模式 · 修改将影响所有玩家新对局
        </p>
      </div>

      <ConfigEditor
        initialJson={jsonText}
        initialVersion={version}
        initialUpdatedAt={updatedAt}
      />
    </main>
  );
}
