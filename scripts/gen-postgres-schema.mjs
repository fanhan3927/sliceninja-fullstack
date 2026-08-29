/**
 * 从 prisma/schema.prisma 生成生产用 Postgres schema（prisma/schema.postgres.prisma）。
 * 模型完全一致，仅切换 provider：本地 SQLite / 生产 PostgreSQL，互不影响。
 * 用法：node scripts/gen-postgres-schema.mjs
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "prisma", "schema.prisma");
const OUT = join(ROOT, "prisma", "schema.postgres.prisma");

const src = readFileSync(SRC, "utf8");

const header = `// 本文件由 scripts/gen-postgres-schema.mjs 自动生成，请勿手改。
// 生产部署（Vercel + Neon 等 Postgres）使用；本地开发继续用 prisma/schema.prisma（SQLite）。
// 重新生成：node scripts/gen-postgres-schema.mjs
`;

const out = header + src.replace('provider = "sqlite"', 'provider = "postgresql"');
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out);
console.log(`已生成 ${OUT}`);
