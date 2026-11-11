/**
 * ตั้งค่าโปรเจกต์ครั้งแรก (ใช้ได้ทั้ง Windows / macOS / Linux)
 *   1) สร้างไฟล์ .env จาก .env.example พร้อมสุ่ม SESSION_SECRET
 *   2) สร้าง Prisma Client
 *   3) สร้างตารางในฐานข้อมูล (prisma migrate deploy)
 *   4) ใส่ข้อมูลตัวอย่าง (ถ้าฐานข้อมูลยังว่าง)
 */
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const step = (n, msg) => console.log(`\n\x1b[33m[${n}/4]\x1b[0m ${msg}`);
const run = (cmd) => execSync(cmd, { stdio: "inherit", shell: true });

step(1, "เตรียมไฟล์ .env");
if (!existsSync(".env")) {
  copyFileSync(".env.example", ".env");
  const env = readFileSync(".env", "utf8").replace("change-me-to-a-long-random-string", randomBytes(32).toString("hex"));
  writeFileSync(".env", env);
  console.log("  ✔ สร้าง .env แล้ว (สุ่ม SESSION_SECRET ให้อัตโนมัติ)");
} else console.log("  • มีไฟล์ .env อยู่แล้ว — ใช้ค่าเดิม");
mkdirSync("storage/uploads", { recursive: true });

step(2, "สร้าง Prisma Client");
run("npx prisma generate");

step(3, "สร้างตารางในฐานข้อมูล");
run("npx prisma migrate deploy");

step(4, "ใส่ข้อมูลตัวอย่าง");
run("npx tsx prisma/seed.ts");

console.log("\n\x1b[32m✔ พร้อมใช้งาน!\x1b[0m  รันคำสั่ง  \x1b[1mnpm run dev\x1b[0m  แล้วเปิด http://localhost:3000\n");
