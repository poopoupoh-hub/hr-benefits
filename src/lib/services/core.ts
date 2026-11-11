/**
 * Service Layer — บริการกลาง: ตรวจสิทธิ์ (RBAC), บันทึก Audit Log, ส่งอีเมล
 * ทุก service ที่แก้ข้อมูลต้องผ่าน assertCan() และ audit() เสมอ
 */
import { FORBIDDEN_PERMISSIONS } from "../domain/constants";
import type { AuditLog, Database, Employee, Permission } from "../domain/types";
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

export function audit(
  db: Database,
  actor: Employee | null,
  entry: Omit<AuditLog, "id" | "at" | "actorId" | "actorRole">,
) {
  db.auditLogs.unshift({
    id: uid("al"),
    at: nowISO(),
    actorId: actor?.id ?? null,
    actorRole: actor?.role ?? null,
    ...entry,
  });
}

const SECRET_FIELDS = new Set(["passwordHash", "pinHash"]);

/** คืนค่าเฉพาะฟิลด์ที่เปลี่ยน (ข้อมูลก่อน–หลัง) */
export function diff<T extends object>(before: T, after: T) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    if (SECRET_FIELDS.has(k) || k === "updatedAt") continue;
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
