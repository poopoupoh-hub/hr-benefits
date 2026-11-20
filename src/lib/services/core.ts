/**
 * Service Layer — บริการกลาง: ตรวจสิทธิ์ (RBAC), บันทึก Audit Log, ส่งอีเมล
 * ทุก service ที่แก้ข้อมูลต้องผ่าน assertCan() และ logAudit() เสมอ
 */
import { FORBIDDEN_PERMISSIONS, ROLE_LABEL } from "../domain/constants";
import type { AuditLog, Claim, Database, Employee, Permission } from "../domain/types";
import { uid } from "../data/uid";

export class ServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceError";
  }
}

export const nowISO = () => new Date().toISOString();

export function can(db: Database, actor: Employee | null | undefined, perm: Permission): boolean {
  if (!actor || !actor.active) return false;
  if (FORBIDDEN_PERMISSIONS[actor.role]?.includes(perm)) return false;
  return db.rbac[actor.role]?.includes(perm) ?? false;
}

export function assertCan(db: Database, actor: Employee | null | undefined, perm: Permission): asserts actor is Employee {
  if (!can(db, actor, perm)) throw new ServiceError("คุณไม่มีสิทธิ์ทำรายการนี้");
}

/** ฟิลด์ที่ห้ามลง before/after: รหัสผ่าน และข้อมูลที่อาจเป็นข้อมูลสุขภาพ (PDPA) */
const HIDDEN_FIELDS = new Set(["passwordHash", "note", "vendorName", "receiptNo", "attachments", "history", "diagnosis", "updatedAt"]);

function sanitize(v: unknown): unknown {
  if (!v || typeof v !== "object" || Array.isArray(v)) return v;
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !HIDDEN_FIELDS.has(k)));
}

/**
 * เพิ่มรายการ Audit Log (append-only — ระบบไม่มีฟังก์ชันแก้หรือลบ)
 * ถ้าส่ง before/after มาแต่ไม่มีอะไรเปลี่ยนจริง จะไม่บันทึก
 */
export function logAudit(db: Database, actor: Employee | null, entry: Omit<AuditLog, "id" | "at" | "actorId" | "actorRole">): boolean {
  const before = sanitize(entry.before);
  const after = sanitize(entry.after);
  if (entry.before !== undefined && entry.after !== undefined && JSON.stringify(before) === JSON.stringify(after)) return false;
  db.auditLogs.unshift({
    id: uid("al"),
    at: nowISO(),
    actorId: actor?.id ?? null,
    actorRole: actor?.role ?? null,
    ...entry,
    before,
    after,
  });
  return true;
}

/** คืนค่าเฉพาะฟิลด์ที่เปลี่ยน (ข้อมูลก่อน–หลัง) */
export function diff<T extends object>(before: T, after: T) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    if (HIDDEN_FIELDS.has(k)) continue;
    const bv = (before as Record<string, unknown>)[k];
    const av = (after as Record<string, unknown>)[k];
    if (JSON.stringify(bv) !== JSON.stringify(av)) {
      b[k] = bv;
      a[k] = av;
    }
  }
  return { before: b, after: a, changed: Object.keys(a) };
}

export function sendEmail(db: Database, msg: { to: (string | undefined)[]; subject: string; body: string; event: string }) {
  const to = [...new Set(msg.to.filter(Boolean) as string[])];
  if (!to.length) return;
  const enabled = db.settings.email.enabled;
  db.emails.unshift({
    id: uid("m"),
    at: nowISO(),
    to,
    subject: `[สวัสดิการ] ${msg.subject}`,
    body: msg.body,
    event: msg.event,
    status: enabled ? "sent" : "skipped",
  });
}

export function findEmployee(db: Database, id: string | null | undefined) {
  return id ? db.employees.find((e) => e.id === id) : undefined;
}

export function requireEmployee(db: Database, id: string) {
  const e = findEmployee(db, id);
  if (!e) throw new ServiceError("ไม่พบพนักงาน");
  return e;
}

export const fullName = (e?: Pick<Employee, "firstName" | "lastName"> | null) => (e ? `${e.firstName} ${e.lastName}` : "-");

/** ผู้ตัดสินคำขอ พร้อมบทบาท ณ เวลาที่ตัดสิน เช่น "วิภา บุคคล (HR)" — ข้อมูลเก่าที่ไม่มี decidedRole ใช้บทบาทปัจจุบัน */
export function deciderLabel(db: Pick<Database, "employees">, c: Pick<Claim, "decidedById" | "decidedRole">) {
  const e = c.decidedById ? db.employees.find((x) => x.id === c.decidedById) : undefined;
  if (!e) return null;
  const role = c.decidedRole ?? e.role;
  return `${fullName(e)} (${ROLE_LABEL[role]})`;
}
