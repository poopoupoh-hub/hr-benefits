/**
 * ใส่ข้อมูลตัวอย่าง (Mock data) ลงฐานข้อมูล
 *   npm run db:seed            → ใส่ข้อมูลเมื่อฐานข้อมูลยังว่าง
 *   npm run db:seed -- --force → ล้างข้อมูลทั้งหมดแล้วใส่ใหม่
 */
import { createSeed } from "../src/lib/data/seed";
import { replaceAll } from "../src/lib/server/persist";
import { prisma } from "../src/lib/server/prisma";

async function main() {
  const force = process.argv.includes("--force") || process.env.SEED_FORCE === "1";
  const count = await prisma.employee.count();
  if (count > 0 && !force) {
    console.log(`ฐานข้อมูลมีพนักงานอยู่แล้ว ${count} คน — ข้ามการใส่ข้อมูลตัวอย่าง (ใช้ --force เพื่อล้างและใส่ใหม่)`);
    return;
  }
  const db = createSeed();
  await replaceAll(prisma, db);
  console.log(`✔ ใส่ข้อมูลตัวอย่างแล้ว: พนักงาน ${db.employees.length} คน, สวัสดิการ ${db.benefitTypes.length} ประเภท, คำขอ ${db.claims.length} รายการ`);
  console.log("  บัญชีทดสอบ: EMP-0001 (พนักงาน), EMP-0010 (HR), EMP-0020 (หัวหน้า), EMP-0030 (บัญชี), EMP-0050 (ผู้ดูแลระบบ) — รหัสผ่าน/PIN: 1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
