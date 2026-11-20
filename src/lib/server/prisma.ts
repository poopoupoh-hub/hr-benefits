/**
 * Prisma client (ฝั่งเซิร์ฟเวอร์เท่านั้น)
 * เลือก driver ตาม DATABASE_URL อัตโนมัติ: file:... → SQLite, postgres(ql)://... → PostgreSQL
 */
import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// คำนวณวันตัดรอบ/วันจ่ายตามเวลาประเทศไทย แม้เซิร์ฟเวอร์ตั้งเป็น UTC
process.env.TZ = process.env.APP_TIMEZONE || "Asia/Bangkok";

function createClient() {
  const url = process.env.DATABASE_URL || "file:./prisma/dev.db";
  const adapter = /^postgres(ql)?:\/\//.test(url) ? new PrismaPg({ connectionString: url }) : new PrismaBetterSqlite3({ url });
  return new PrismaClient({ adapter });
}

const g = globalThis as unknown as { __prisma?: PrismaClient };
export const prisma: PrismaClient = g.__prisma ?? createClient();
if (process.env.NODE_ENV !== "production") g.__prisma = prisma;
