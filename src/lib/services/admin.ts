/**
 * Master data services — พนักงาน, แผนก/ตำแหน่ง, สวัสดิการ, งบประมาณ, ตั้งค่า, RBAC, ผู้ใช้
 */
import { FORBIDDEN_PERMISSIONS, REQUIRED_PERMISSIONS, ROLE_LABEL } from "../domain/constants";
import type { BenefitLimit, BenefitType, Database, Department, Employee, FundRound, Holiday, Permission, Position, Role, Settings } from "../domain/types";
import { LEVELS } from "../domain/constants";
import { todayLocal } from "../domain/dates";
import { commit, getDB, replaceDB, resetDB, uid } from "../data/db";
import { DB_VERSION } from "../data/seed";
import { hashSecret, verifySecret } from "../security/hash";
import { assertCan, can, diff, logAudit, fullName, nowISO, requireEmployee, ServiceError } from "./core";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ----------------------------- พนักงาน ----------------------------- */
export type EmployeeInput = Pick<
  Employee,
  | "code"
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "departmentId"
  | "positionId"
  | "supervisorId"
  | "employmentType"
  | "startDate"
  | "contractEndDate"
>;

function validateEmployee(db: Database, input: EmployeeInput, selfId?: string) {
  const errs: string[] = [];
  if (!/^EMP-\d{4}$/.test(input.code)) errs.push("รหัสพนักงานต้องอยู่ในรูปแบบ EMP-0000");
  if (db.employees.some((e) => e.code === input.code && e.id !== selfId)) errs.push("รหัสพนักงานซ้ำ");
  if (!input.firstName.trim() || !input.lastName.trim()) errs.push("กรุณากรอกชื่อ-นามสกุล");
  if (!EMAIL_RE.test(input.email)) errs.push("อีเมลไม่ถูกต้อง");
  if (db.employees.some((e) => e.email.toLowerCase() === input.email.toLowerCase() && e.id !== selfId)) errs.push("อีเมลซ้ำกับพนักงานอื่น");
  if (!db.departments.some((d) => d.id === input.departmentId)) errs.push("กรุณาเลือกแผนก");
  if (!db.positions.some((p) => p.id === input.positionId)) errs.push("กรุณาเลือกตำแหน่ง");
  if (!input.startDate) errs.push("กรุณาระบุวันเริ่มงาน");
  if (input.contractEndDate && input.startDate && input.contractEndDate < input.startDate) errs.push("วันหมดสัญญาต้องหลังวันเริ่มงาน");
  if (input.employmentType === "contract" && !input.contractEndDate) errs.push("พนักงานสัญญาจ้างต้องระบุวันหมดสัญญา");
  if (input.supervisorId) {
    if (input.supervisorId === selfId) errs.push("หัวหน้างานต้องไม่ใช่ตนเอง");
    // ป้องกันสายบังคับบัญชาวน
    let cur: string | null | undefined = input.supervisorId;
    let guard = 0;
    while (cur && guard++ < 50) {
      if (cur === selfId) {
        errs.push("สายบังคับบัญชาวนกลับมาที่ตนเอง");
        break;
      }
      cur = db.employees.find((e) => e.id === cur)?.supervisorId;
    }
  }
  if (errs.length) throw new ServiceError(errs.join("\n"));
}

export function createEmployee(actorId: string, input: EmployeeInput & { role?: Role }) {
  return commit((db) => {
    const actor = requireEmployee(db, actorId);
    if (!can(db, actor, "employee.manage")) assertCan(db, actor, "user.manage");
    const role: Role = input.role && can(db, actor, "user.manage") ? input.role : "employee";
    validateEmployee(db, input);
    const { role: _r, ...fields } = input;
    void _r;
    const e: Employee = {
      ...fields,
      phone: input.phone?.trim() || undefined,
      contractEndDate: input.contractEndDate || null,
      supervisorId: input.supervisorId || null,
      id: uid("e"),
      role,
      active: input.employmentType !== "terminated",
      passwordHash: hashSecret("1234"),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    db.employees.push(e);
    const { passwordHash: _p, ...safe } = e;
    void _p;
    logAudit(db, actor, { action: "create", entity: "employee", entityId: e.id, summary: `เพิ่มพนักงาน ${e.code} ${fullName(e)}`, after: safe });
    return e;
  });
}

export function updateEmployee(actorId: string, id: string, input: EmployeeInput) {
  return commit((db) => {
    const actor = requireEmployee(db, actorId);
    assertCan(db, actor, "employee.manage");
    const e = requireEmployee(db, id);
    validateEmployee(db, input, id);
    const before = structuredClone(e);
    Object.assign(e, {
      ...input,
      phone: input.phone?.trim() || undefined,
      contractEndDate: input.contractEndDate || null,
      supervisorId: input.supervisorId || null,
      updatedAt: nowISO(),
    });
    if (input.employmentType === "terminated") e.active = false;
    else if (before.employmentType === "terminated") e.active = true;
    const d = diff(before, e);
    if (!d.changed.length) return e;
    logAudit(db, actor, {
      action: "update",
      entity: "employee",
      entityId: e.id,
      summary: `แก้ไขข้อมูลพนักงาน ${e.code} ${fullName(e)} (${d.changed.join(", ")})`,
      before: d.before,
      after: d.after,
    });
    return e;
  });
}

/** ปิดสถานะ = พ้นสภาพ (ไม่ลบข้อมูลจริง เพื่อเก็บประวัติ) */
export function setEmployeeActive(actorId: string, id: string, active: boolean) {
  return commit((db) => {
    const actor = requireEmployee(db, actorId);
    assertCan(db, actor, "employee.manage");
    const e = requireEmployee(db, id);
    if (e.id === actor.id) throw new ServiceError("ไม่สามารถปิดสถานะบัญชีของตนเองได้");
    if (!active && db.employees.some((x) => x.supervisorId === e.id && x.active))
      throw new ServiceError("พนักงานคนนี้ยังเป็นหัวหน้าของผู้อื่น กรุณาย้ายลูกทีมก่อน");
    const before = { active: e.active, employmentType: e.employmentType };
    e.active = active;
    if (!active) e.employmentType = "terminated";
    else if (e.employmentType === "terminated") e.employmentType = "permanent";
    e.updatedAt = nowISO();
    logAudit(db, actor, {
      action: active ? "activate" : "deactivate",
      entity: "employee",
      entityId: e.id,
      summary: `${active ? "เปิด" : "ปิด"}สถานะพนักงาน ${e.code} ${fullName(e)}`,
      before,
      after: { active: e.active, employmentType: e.employmentType },
    });
  });
}

/* ---------------------------- แผนก / ตำแหน่ง ---------------------------- */
export function saveDepartment(actorId: string, d: Partial<Department> & Pick<Department, "code" | "name">) {
  return commit((db) => {
    const actor = requireEmployee(db, actorId);
    assertCan(db, actor, "org.manage");
    if (!d.code.trim() || !d.name.trim()) throw new ServiceError("กรุณากรอกรหัสและชื่อแผนก");
    if (db.departments.some((x) => x.code.toLowerCase() === d.code.trim().toLowerCase() && x.id !== d.id)) throw new ServiceError("รหัสแผนกซ้ำ");
    if (d.id) {
      const cur = db.departments.find((x) => x.id === d.id)!;
      const before = { ...cur };
      cur.code = d.code.trim().toUpperCase();
      cur.name = d.name.trim();
      logAudit(db, actor, { action: "update", entity: "department", entityId: cur.id, summary: `แก้ไขแผนก ${cur.code}`, before, after: { ...cur } });
    } else {
      const nd = { id: uid("d"), code: d.code.trim().toUpperCase(), name: d.name.trim() };
      db.departments.push(nd);
      logAudit(db, actor, { action: "create", entity: "department", entityId: nd.id, summary: `เพิ่มแผนก ${nd.code} ${nd.name}`, after: nd });
    }
  });
}

export function deleteDepartment(actorId: string, id: string) {
  return commit((db) => {
    const actor = requireEmployee(db, actorId);
    assertCan(db, actor, "org.manage");
    if (db.employees.some((e) => e.departmentId === id)) throw new ServiceError("ยังมีพนักงานในฝ่ายนี้ ลบไม่ได้");
    const d = db.departments.find((x) => x.id === id);
    db.departments = db.departments.filter((x) => x.id !== id);
    logAudit(db, actor, { action: "delete", entity: "department", entityId: id, summary: `ลบฝ่าย ${d?.code}`, before: d });
  });
}

/** ตำแหน่ง/ระดับ — แยกจากฝ่าย (ตำแหน่งเดียวกันอยู่ได้หลายฝ่าย) */
export function savePosition(actorId: string, p: Partial<Position> & Pick<Position, "name" | "level">) {
  return commit((db) => {
    const actor = requireEmployee(db, actorId);
    assertCan(db, actor, "org.manage");
    if (!p.name.trim()) throw new ServiceError("กรุณากรอกชื่อตำแหน่ง");
    if (!LEVELS.includes(Number(p.level) as 1)) throw new ServiceError("ระดับต้องเป็น 1–4");
    if (p.id) {
      const cur = db.positions.find((x) => x.id === p.id);
      if (!cur) throw new ServiceError("ไม่พบตำแหน่ง");
      const before = { ...cur };
      cur.name = p.name.trim();
      cur.level = Number(p.level);
      logAudit(db, actor, { action: "update", entity: "position", entityId: cur.id, summary: `แก้ไขตำแหน่ง ${cur.name}`, ...diff(before, cur) });
    } else {
      const np: Position = { id: uid("p"), name: p.name.trim(), level: Number(p.level) };
      db.positions.push(np);
      logAudit(db, actor, { action: "create", entity: "position", entityId: np.id, summary: `เพิ่มตำแหน่ง ${np.name} (ระดับ ${np.level})`, after: np });
    }
  });
}

export function deletePosition(actorId: string, id: string) {
  return commit((db) => {
    const actor = requireEmployee(db, actorId);
    assertCan(db, actor, "org.manage");
    if (db.employees.some((e) => e.positionId === id)) throw new ServiceError("ยังมีพนักงานในตำแหน่งนี้ ลบไม่ได้");
    const p = db.positions.find((x) => x.id === id);
    db.positions = db.positions.filter((x) => x.id !== id);
    logAudit(db, actor, { action: "delete", entity: "position", entityId: id, summary: `ลบตำแหน่ง ${p?.name}`, before: p });
  });
}

/* ------------------------------ สวัสดิการ ------------------------------ */
export type BenefitInput = Omit<BenefitType, "id" | "createdAt" | "updatedAt">;
export type InitialLimit = Pick<BenefitLimit, "minLevel" | "maxLevel" | "perClaim" | "perYear" | "maxCount">;

function validateBenefit(db: Database, b: BenefitInput, selfId?: string) {
  const errs: string[] = [];
  if (!/^[A-Z0-9_]{2,10}$/.test(b.code)) errs.push("รหัสสวัสดิการต้องเป็นตัวพิมพ์ใหญ่/ตัวเลข 2-10 ตัว");
  if (db.benefitTypes.some((x) => x.code === b.code && x.id !== selfId)) errs.push("รหัสสวัสดิการซ้ำ");
  if (!b.name.trim()) errs.push("กรุณากรอกชื่อสวัสดิการ");
  if (!b.category?.trim()) errs.push("กรุณาเลือกหมวดสวัสดิการ");
  if (!b.eligibleTypes.length) errs.push("ต้องเลือกประเภทพนักงานที่มีสิทธิ์อย่างน้อย 1 ประเภท");
  if (errs.length) throw new ServiceError(errs.join("\n"));
}

/**
 * บันทึกข้อมูลสวัสดิการ (ชื่อ หมวด เอกสาร สิทธิ์ตามประเภทพนักงาน)
 * วงเงินแก้ผ่าน "คำขอแก้วงเงิน" เท่านั้น — ยกเว้นตอนสร้างสวัสดิการใหม่ที่ยังไม่มีวงเงิน
 */
export function saveBenefit(actorId: string, input: BenefitInput, id?: string, initialLimits: InitialLimit[] = []) {
  return commit((db) => {
    const actor = requireEmployee(db, actorId);
    assertCan(db, actor, "benefit.manage");
    const clean: BenefitInput = { ...input, code: input.code.trim().toUpperCase(), name: input.name.trim(), category: input.category.trim() };
    validateBenefit(db, clean, id);
    if (id) {
      const cur = db.benefitTypes.find((b) => b.id === id);
      if (!cur) throw new ServiceError("ไม่พบสวัสดิการ");
      const before = structuredClone(cur);
      Object.assign(cur, clean, { updatedAt: nowISO() });
      const d = diff(before, cur);
      if (d.changed.length)
        logAudit(db, actor, { action: "update", entity: "benefit", entityId: id, summary: `แก้ไขสวัสดิการ ${cur.name} (${d.changed.join(", ")})`, before: d.before, after: d.after });
      return cur;
    }
    const nb: BenefitType = { ...clean, id: uid("b"), createdAt: nowISO(), updatedAt: nowISO() };
    db.benefitTypes.push(nb);
    for (const l of initialLimits) {
      if (!(l.minLevel >= 1 && l.maxLevel <= 4 && l.minLevel <= l.maxLevel)) throw new ServiceError("ช่วงระดับของวงเงินไม่ถูกต้อง");
      if ([l.perClaim, l.perYear, l.maxCount].every((n) => n == null)) throw new ServiceError("วงเงินต้องกำหนดอย่างน้อย 1 ช่อง");
      db.benefitLimits.push({ id: uid("lim"), benefitId: nb.id, ...l, effectiveFrom: todayLocal(), createdAt: nowISO() });
    }
    logAudit(db, actor, { action: "create", entity: "benefit", entityId: nb.id, summary: `เพิ่มประเภทสวัสดิการ ${nb.name}`, after: { ...nb, limits: initialLimits } });
    return nb;
  });
}

export function saveFundRound(actorId: string, input: Omit<FundRound, "id" | "createdAt">, id?: string) {
  return commit((db) => {
    const actor = requireEmployee(db, actorId);
    assertCan(db, actor, "benefit.manage");
    const b = db.benefitTypes.find((x) => x.id === input.benefitTypeId);
    if (!b || b.mode !== "assigned") throw new ServiceError("รอบงบใช้ได้กับสวัสดิการแบบ HR กำหนดยอดเท่านั้น");
    if (!input.name.trim()) throw new ServiceError("กรุณาตั้งชื่อรอบ");
    if (!(input.budget > 0)) throw new ServiceError("งบของรอบต้องมากกว่า 0");
    if (!input.openFrom || !input.openTo || input.openTo < input.openFrom) throw new ServiceError("ช่วงวันที่เปิดรับไม่ถูกต้อง");
    if (id) {
      const cur = db.fundRounds.find((r) => r.id === id);
      if (!cur) throw new ServiceError("ไม่พบรอบงบ");
      const before = { ...cur };
      Object.assign(cur, input);
      logAudit(db, actor, { action: "update", entity: "fund", entityId: id, summary: `แก้ไขรอบงบ ${cur.name}`, ...diff(before, cur) });
    } else {
      const r: FundRound = { ...input, id: uid("f"), createdAt: nowISO() };
      db.fundRounds.unshift(r);
      logAudit(db, actor, { action: "create", entity: "fund", entityId: r.id, summary: `เปิดรอบงบ ${r.name} (งบ ${r.budget.toLocaleString("th-TH")} บาท)`, after: r });
    }
  });
}

/* ------------------------------ ตั้งค่า ------------------------------ */
export function updatePayrollSettings(actorId: string, patch: { cutoffDay: number; holidays: Holiday[] }) {
  return commit((db) => {
    const actor = requireEmployee(db, actorId);
    assertCan(db, actor, "payroll.settings");
    if (!(patch.cutoffDay >= 1 && patch.cutoffDay <= 28)) throw new ServiceError("วันตัดรอบต้องอยู่ระหว่าง 1–28");
    const seen = new Set<string>();
    for (const h of patch.holidays) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(h.date) || !h.name.trim()) throw new ServiceError("ข้อมูลวันหยุดไม่ครบ");
      if (seen.has(h.date)) throw new ServiceError(`วันหยุดซ้ำ: ${h.date}`);
      seen.add(h.date);
    }
    const before = { cutoffDay: db.settings.cutoffDay, holidays: db.settings.holidays.length };
    db.settings.cutoffDay = patch.cutoffDay;
    db.settings.holidays = [...patch.holidays].sort((a, b) => a.date.localeCompare(b.date));
    logAudit(db, actor, {
      action: "update",
      entity: "settings",
      entityId: "payroll",
      summary: "แก้ไขวันตัดรอบ / ตารางวันหยุด",
      before,
      after: { cutoffDay: patch.cutoffDay, holidays: patch.holidays.length },
    });
  });
}

export function updateSystemSettings(actorId: string, patch: Pick<Settings, "email" | "auditRetentionDays" | "orgName">) {
  return commit((db) => {
    const actor = requireEmployee(db, actorId);
    assertCan(db, actor, "system.manage");
    if (!EMAIL_RE.test(patch.email.fromAddress) || !EMAIL_RE.test(patch.email.financeInbox) || !EMAIL_RE.test(patch.email.hrInbox))
      throw new ServiceError("รูปแบบอีเมลไม่ถูกต้อง");
    if (!(patch.auditRetentionDays >= 365)) throw new ServiceError("ต้องเก็บ Audit Log อย่างน้อย 365 วัน");
    const before = { email: db.settings.email, auditRetentionDays: db.settings.auditRetentionDays, orgName: db.settings.orgName };
    Object.assign(db.settings, patch);
    logAudit(db, actor, { action: "update", entity: "settings", entityId: "system", summary: "แก้ไขการตั้งค่าระบบ", ...diff(before, patch) });
  });
}

/* ------------------------------ RBAC / ผู้ใช้ ------------------------------ */
export function setRolePermission(actorId: string, role: Role, perm: Permission, enabled: boolean) {
  return commit((db) => {
    const actor = requireEmployee(db, actorId);
    assertCan(db, actor, "rbac.manage");
    if (enabled && FORBIDDEN_PERMISSIONS[role]?.includes(perm))
      throw new ServiceError(`ไม่อนุญาตให้ ${ROLE_LABEL[role]} มีสิทธิ์นี้ (แยกหน้าที่ตามหลัก Least Privilege)`);
    if (!enabled && REQUIRED_PERMISSIONS[role]?.includes(perm)) throw new ServiceError("สิทธิ์นี้จำเป็น ปิดไม่ได้ (ป้องกันระบบล็อกตัวเอง)");
    const list = new Set(db.rbac[role]);
    if (enabled) list.add(perm);
    else list.delete(perm);
    db.rbac[role] = [...list];
    logAudit(db, actor, { action: "update", entity: "rbac", entityId: role, summary: `${enabled ? "เพิ่ม" : "ถอน"}สิทธิ์ ${perm} ของ ${ROLE_LABEL[role]}`, before: { enabled: !enabled }, after: { enabled } });
  });
}

export function setUserRole(actorId: string, userId: string, role: Role) {
  return commit((db) => {
    const actor = requireEmployee(db, actorId);
    assertCan(db, actor, "user.manage");
    const u = requireEmployee(db, userId);
    if (u.id === actor.id && role !== "admin") throw new ServiceError("ไม่สามารถลด Role ของตนเองได้");
    if (u.role === role) return;
    const before = u.role;
    u.role = role;
    u.updatedAt = nowISO();
    logAudit(db, actor, { action: "role_change", entity: "rbac", entityId: u.id, summary: `เปลี่ยน Role ${u.code} ${fullName(u)}: ${ROLE_LABEL[before]} → ${ROLE_LABEL[role]}`, before: { role: before }, after: { role } });
  });
}

export function resetPassword(actorId: string, userId: string, value: string) {
  return commit((db) => {
    const actor = requireEmployee(db, actorId);
    if (actorId !== userId) assertCan(db, actor, "user.manage");
    if (value.length < 4) throw new ServiceError("รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร");
    const u = requireEmployee(db, userId);
    u.passwordHash = hashSecret(value);
    logAudit(db, actor, { action: "reset_password", entity: "auth", entityId: u.id, summary: `${actorId === userId ? "เปลี่ยน" : "รีเซ็ต"}รหัสผ่านของ ${u.code}` });
  });
}

/* ------------------------------ สำรองข้อมูล ------------------------------ */
export function exportBackup(actorId: string): string {
  const db = getDB();
  assertCan(db, db.employees.find((e) => e.id === actorId), "system.manage");
  commit((d) => {
    d.settings.backup.lastBackupAt = nowISO();
    logAudit(d, requireEmployee(d, actorId), { action: "backup", entity: "system", entityId: null, summary: "สำรองข้อมูล (Export JSON)" });
  });
  return JSON.stringify(getDB(), null, 2);
}

export function restoreBackup(actorId: string, json: string) {
  const db = getDB();
  const actor = db.employees.find((e) => e.id === actorId);
  assertCan(db, actor, "system.manage");
  let parsed: Database;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ServiceError("ไฟล์สำรองไม่ใช่ JSON ที่ถูกต้อง");
  }
  for (const k of ["employees", "claims", "benefitTypes", "settings", "rbac", "auditLogs"] as const)
    if (!(k in parsed)) throw new ServiceError(`ไฟล์สำรองไม่สมบูรณ์ (ไม่มี ${k})`);
  if (parsed.version !== DB_VERSION) throw new ServiceError(`ไฟล์สำรองเป็นเวอร์ชัน ${parsed.version} ไม่ตรงกับระบบ (${DB_VERSION})`);
  if (!parsed.employees.some((e) => e.role === "admin" && e.active)) throw new ServiceError("ไฟล์สำรองไม่มีผู้ดูแลระบบที่ใช้งานได้");
  replaceDB(parsed);
  commit((d) => logAudit(d, d.employees.find((e) => e.id === actorId) ?? null, { action: "restore", entity: "system", entityId: null, summary: "กู้คืนข้อมูลจากไฟล์สำรอง" }));
}

export function changeOwnPassword(actorId: string, current: string, next: string) {
  const u = requireEmployee(getDB(), actorId);
  if (!verifySecret(current, u.passwordHash)) throw new ServiceError("รหัสผ่านปัจจุบันไม่ถูกต้อง");
  resetPassword(actorId, actorId, next);
}

/** รีเซ็ตข้อมูลกลับเป็นข้อมูลตัวอย่าง (ผู้ดูแลระบบเท่านั้น) */
export function resetDemo(actorId: string) {
  assertCan(getDB(), getDB().employees.find((e) => e.id === actorId), "system.manage");
  resetDB();
}

