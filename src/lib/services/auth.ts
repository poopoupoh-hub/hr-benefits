/**
 * Authentication service — ตรวจรหัสพนักงาน + รหัสผ่าน
 * การออก session อยู่ที่ src/lib/data/session.ts (localStorage)
 */
import { commit, getDB } from "../data/db";
import { verifySecret } from "../security/hash";
import { logAudit, ServiceError } from "./core";

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const fails = new Map<string, { n: number; until: number }>();

/** เข้าสู่ระบบด้วย "รหัสพนักงาน" หรือ "อีเมล" + รหัสผ่าน — บทบาท (role) ดึงจากข้อมูลพนักงาน ผู้ใช้ไม่ต้องเลือกเอง */
export function login(code: string, password: string) {
  const raw = code.trim();
  const c = raw.toUpperCase();
  const f = fails.get(c);
  if (f && f.n >= MAX_FAILS && Date.now() < f.until) throw new ServiceError("เข้าสู่ระบบผิดเกิน 5 ครั้ง กรุณารอ 15 นาที หรือติดต่อผู้ดูแลระบบ");
  const emp = getDB().employees.find((e) => e.code === c || (raw.includes("@") && e.email.toLowerCase() === raw.toLowerCase()));
  if (!emp || !verifySecret(password, emp.passwordHash)) {
    const n = (f && Date.now() < f.until ? f.n : 0) + 1;
    fails.set(c, { n, until: Date.now() + LOCK_MS });
    commit((d) => logAudit(d, null, { action: "login_failed", entity: "auth", entityId: emp?.id ?? null, summary: `เข้าสู่ระบบไม่สำเร็จ: ${c}` }));
    throw new ServiceError("รหัสพนักงาน/อีเมล หรือรหัสผ่านไม่ถูกต้อง");
  }
  if (!emp.active) throw new ServiceError("บัญชีนี้ถูกปิดสถานะแล้ว");
  fails.delete(c);
  commit((d) => logAudit(d, d.employees.find((e) => e.id === emp.id)!, { action: "login", entity: "auth", entityId: emp.id, summary: `${emp.code} เข้าสู่ระบบ` }));
  return emp;
}
