/**
 * ตัดข้อมูลตามสิทธิ์ก่อนส่งให้หน้าจอ (Row/Column-level) — หน้าจอเห็นเฉพาะข้อมูลที่บทบาทนั้นควรเห็น
 * - ไม่ส่ง password hash ออกไปเด็ดขาด
 * - พนักงานเห็นเฉพาะคำขอของตนเอง · HR / หัวหน้า HR เห็นทั้งหมด
 * - บัญชีเห็นเฉพาะยอดเงิน สถานะ เลขใบเสร็จ/ร้าน (ใช้ทำจ่าย) ของคำขอที่อนุมัติ/จ่ายแล้ว — ไม่มีชื่อ เอกสาร หมายเหตุ (PDPA)
 *
 * หมายเหตุ: ระบบเวอร์ชัน localStorage ทำงานในเบราว์เซอร์ทั้งหมด การตัดข้อมูลนี้จึงเป็นการแยกหน้าที่ระดับหน้าจอ
 * เมื่อย้ายไปมีเซิร์ฟเวอร์ ให้เรียกฟังก์ชันนี้ฝั่งเซิร์ฟเวอร์ก่อนส่งข้อมูล (ไม่ต้องแก้)
 */
import type { Claim, Database, Employee } from "../domain/types";
import { can } from "../services/core";

function stripSecrets(e: Employee): Employee {
  return { ...e, passwordHash: "" };
}

function directory(e: Employee): Employee {
  return { ...stripSecrets(e), phone: undefined, startDate: "", contractEndDate: null, createdAt: "", updatedAt: "" };
}

function masked(e: Employee): Employee {
  return { ...directory(e), firstName: e.code, lastName: "", email: "", supervisorId: null };
}

function financialOnly(c: Claim): Claim {
  return { ...c, note: undefined, attachments: [], history: [], rejectReason: null, returnReason: null };
}

export function scopeDatabase(db: Database, me: Employee): Database {
  const p = (perm: Parameters<typeof can>[2]) => can(db, me, perm);
  const seeAllEmployees = p("employee.view");
  const reviewer = p("claim.review");
  const financeView = (p("payment.view") || p("report.view")) && !seeAllEmployees;

  const employees = db.employees.map((e) => {
    if (e.id === me.id || seeAllEmployees) return stripSecrets(e);
    if (financeView && !["hr", "hr_head", "finance", "admin"].includes(e.role)) return masked(e);
    return directory(e);
  });

  const claims: Claim[] = [];
  for (const c of db.claims) {
    if (reviewer || c.employeeId === me.id) claims.push(c);
    else if (financeView && (c.status === "approved" || c.status === "paid")) claims.push(financialOnly(c));
  }
  const visible = new Set(claims.map((c) => c.id));

  return {
    ...db,
    employees,
    claims,
    payments: db.payments.filter((x) => visible.has(x.claimId)),
    changeRequests: p("change.request") || p("change.review") ? db.changeRequests : [],
    auditLogs: [],
    emails: [],
    counters: {},
    settings: p("system.manage") ? db.settings : { ...db.settings, email: { ...db.settings.email, smtpHost: "" } },
  };
}
