/**
 * 生产建表脚本：把 prisma/prod-schema.sql（Postgres DDL）应用到目标库。
 * 用法：DATABASE_URL="postgresql://..." node scripts/apply-prod-schema.mjs
 *
 * 注意：Neon 连接代理不支持单次多语句 simple query（08P01），
 * 因此这里按 `;\n` 把 DDL 拆成单条语句逐条执行。
 * 依赖：pg（devDependencies）。
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("缺少 DATABASE_URL 环境变量");
  process.exit(1);
}

const sqlPath = fileURLToPath(new URL("../prisma/prod-schema.sql", import.meta.url));
const sql = readFileSync(sqlPath, "utf8");

// 先剔除注释行，再按分号+换行拆分（DDL 内部无分号字面量），逐条执行
const cleaned = sql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");
const statements = cleaned
  .split(/;\s*\n/)
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

if (statements.length === 0) {
  console.error("✗ 未解析出任何 SQL 语句");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: true } });
try {
  await client.connect();
  for (const stmt of statements) {
    await client.query(stmt);
  }
  console.log(`✓ 建表完成（${statements.length} 条语句已应用）`);
} catch (e) {
  console.error("✗ 建表失败:", e.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
