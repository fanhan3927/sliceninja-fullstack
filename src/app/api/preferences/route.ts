import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const prefsSchema = z.object({
  bgmMuted: z.boolean(),
  sfxMuted: z.boolean(),
});

/** GET /api/preferences —— 当前用户偏好；PUT —— 同步静音设置 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ preference: null });
  const preference = await prisma.preference.findUnique({
    where: { userId: session.user.id },
  });
  return NextResponse.json({ preference });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = prefsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "偏好格式错误" }, { status: 400 });
  }
  const preference = await prisma.preference.upsert({
    where: { userId: session.user.id },
    update: parsed.data,
    create: { userId: session.user.id, ...parsed.data },
  });
  return NextResponse.json({ ok: true, preference });
}
