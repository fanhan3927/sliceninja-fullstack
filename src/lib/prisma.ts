import { PrismaClient } from "@prisma/client";

/**
 * Prisma 单例：Next.js dev 模式热重载会反复执行模块，
 * 把实例挂在 globalThis 上避免连接/引擎多实例堆积。
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
