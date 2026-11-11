/**
 * ตัดข้อมูลตามสิทธิ์ก่อนส่งให้หน้าจอ (Row/Column-level security)
 * - ไม่ส่ง password/PIN hash ออกไปเด็ดขาด
 * - พนักงานเห็นเฉพาะคำขอของตนเอง หัวหน้าเห็นของทีม HR เห็นทั้งหมด
 * - บัญชี/ผู้ดูแลระบบเห็นเฉพาะยอดเงินและสถานะ (ไม่มีเอกสาร หมายเหตุ ชื่อ) — PDPA
 */
import { approversFor } from "../domain/rules";
import { todayLocal } from "../domain/dates";
import type { Claim, Database, Employee } from "../domain/types";
import { can } from "../services/core";

export type PublicEmployee = Employee;

function stripSecrets(e: Employee): Employee {
  return { ...e, passwordHash: "", pinHash: "" };
}

function directory(e: Employee): Employee {
  return {
    ...stripSecrets(e),
    phone: undefined,
    startDate: "",
    contractEndDate: null,
    createdAt: "",
    updatedAt: "",
  };
}

function masked(e: Employee): Employee {
  return { ...directory(e), firstName: e.code, lastName: "", email: "", managerId: null, delegation: null };
}

function financialOnly(c: Claim): Claim {
  return {
    ...c,
    note: undefined,
    attachments: [],
    history: [],
    filedReason: null,
    rejectReason: null,
    returnReason: null,
  };
}

export function scopeDatabase(db: Database, me: Employee): Database {
  const p = (perm: Parameters<typeof can>[2]) => can(db, me, perm);
  const today = todayLocal();
  const seeAllEmployees = p("employee.view");
  const financeView = p("payment.view") && !seeAllEmployees;

  const teamIds = new Set(
    db.employees.filter((e) => e.managerId === me.id || approversFor(e, db.employees, today).includes(me.id)).map((e) => e.id),
  );

  const employees = db.employees.map((e) => {
    if (e.id === me.id || seeAllEmployees) return stripSecrets(e);
    if ((p("team.view") || p("claim.approve")) && teamIds.has(e.id)) return stripSecrets(e);
    if (financeView && !["hr", "finance", "admin"].includes(e.role)) return masked(e);
    return directory(e);
  });

  const fullClaim = (c: Claim) =>
    p("claim.review") ||
    c.employeeId === me.id ||
    c.filedById === me.id ||
    c.approverId === me.id ||
    ((p("team.view") || p("claim.approve")) && teamIds.has(c.employeeId));
  const financialClaim = (c: Claim) =>
    ((p("payment.view") || p("report.export")) && (c.status === "approved" || c.status === "paid")) || p("system.manage");

  const claims: Claim[] = [];
  for (const c of db.claims) {
    if (fullClaim(c)) claims.push(c);
    else if (financialClaim(c)) claims.push(financialOnly(c));
  }

  return {
    ...db,
    employees,
    claims,
    auditLogs: [],
    emails: [],
    counters: {},
    settings: p("system.manage") ? db.settings : { ...db.settings, email: { ...db.settings.email, smtpHost: "" } },
  };
}
