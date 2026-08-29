import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEffectiveConfig } from "@/lib/config";
import { mergeConfig } from "@/game/difficulty";
import { difficultyConfigSchema } from "@/lib/validators";

/**
 * GET /api/config —— 当前难度配置 + version（客户端失败回落默认值）
 * PUT /api/config —— ADMIN only，写 json + version++
 */
export async function GET() {
  const { config, version } = await getEffectiveConfig();
  return NextResponse.json({ config, version });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (session?.user.role !== "ADMIN") {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = difficultyConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "配置格式错误" },
      { status: 400 }
    );
  }

  // 与默认配置合并后全量落库（保证任何缺省字段都有值）
  const merged = mergeConfig(parsed.data);
  const row = await prisma.gameConfig.upsert({
    where: { id: "default" },
    update: {
      json: JSON.stringify(merged),
      version: { increment: 1 },
      updatedBy: session.user.id,
    },
    create: {
      id: "default",
      json: JSON.stringify(merged),
      version: 1,
      updatedBy: session.user.id,
    },
  });

  return NextResponse.json({ ok: true, version: row.version, config: merged });
}
