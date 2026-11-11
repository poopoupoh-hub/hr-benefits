import { beforeEach, describe, expect, it } from "vitest";
import { getDB, resetDB } from "../data/db";
import { todayLocal } from "../domain/dates";
import { setRolePermission, setUserRole, updateEmployee } from "./admin";
import { approveClaim, hrPass, hrReturn, markPaid, paymentRows, rejectClaim, submitClaim, updateClaim } from "./claims";

const att = (docType: string) => ({ id: "f-" + docType, name: "x.jpg", size: 1, type: "image/jpeg", docType, uploadedAt: new Date().toISOString() });
const today = todayLocal();

describe("Common workflow ผ่าน service layer", () => {
  beforeEach(() => resetDB());

  it("ยื่น → HR ตรวจ → หัวหน้าอนุมัติ (PIN) → บัญชีจ่าย", () => {
    const c = submitClaim("e-0001", { employeeId: "e-0001", benefitTypeId: "b-den", amount: 900, receiptDate: today, attachments: [att("ใบเสร็จ")] });
    expect(c.status).toBe("pending_hr");
    expect(() => approveClaim("e-0020", c.id, "1234")).toThrow(); // ยังไม่ผ่าน HR
    hrPass("e-0010", c.id);
    expect(() => approveClaim("e-0020", c.id, "0000")).toThrow("PIN ไม่ถูกต้อง");
    const a = approveClaim("e-0020", c.id, "1234");
    expect(a.status).toBe("approved");
    expect(a.payDate).toBeTruthy();
    markPaid("e-0030", [c.id], "TRF-001");
    const done = getDB().claims.find((x) => x.id === c.id)!;
    expect(done.status).toBe("paid");
    expect(done.history.map((h) => h.action)).toEqual(["submit", "hr_pass", "approve", "mark_paid"]);
    expect(getDB().auditLogs.some((l) => l.entityId === c.id && l.action === "mark_paid")).toBe(true);
    expect(getDB().emails.some((m) => m.subject.includes(c.no))).toBe(true);
  });

  it("ส่งกลับแก้ไข → ส่งใหม่", () => {
    const c = submitClaim("e-0001", { employeeId: "e-0001", benefitTypeId: "b-den", amount: 900, receiptDate: today, attachments: [att("ใบเสร็จ")] });
    expect(() => hrReturn("e-0010", c.id, "")).toThrow();
    hrReturn("e-0010", c.id, "ใบเสร็จไม่ชัด");
    const r = updateClaim("e-0001", c.id, { amount: 800, receiptDate: today, attachments: [att("ใบเสร็จ")] });
    expect(r.status).toBe("pending_hr");
    expect(r.amount).toBe(800);
  });

  it("ไม่อนุมัติ → คืนสิทธิ์ และต้องมีเหตุผล", () => {
    const c = submitClaim("e-0001", { employeeId: "e-0001", benefitTypeId: "b-den", amount: 3000, receiptDate: today, attachments: [att("ใบเสร็จ")] });
    hrPass("e-0010", c.id);
    expect(() => rejectClaim("e-0020", c.id, " ")).toThrow();
    rejectClaim("e-0020", c.id, "ไม่อยู่ในเงื่อนไข");
    // ยื่นเต็มวงเงินได้อีกครั้ง เพราะคืนสิทธิ์แล้ว
    expect(() => submitClaim("e-0001", { employeeId: "e-0001", benefitTypeId: "b-den", amount: 3000, receiptDate: today, attachments: [att("ใบเสร็จ")] })).not.toThrow();
  });

  it("RBAC: Admin อนุมัติไม่ได้ / บัญชีตรวจไม่ได้ / HR ตรวจของตัวเองไม่ได้", () => {
    const c = submitClaim("e-0001", { employeeId: "e-0001", benefitTypeId: "b-den", amount: 500, receiptDate: today, attachments: [att("ใบเสร็จ")] });
    expect(() => hrPass("e-0030", c.id)).toThrow("ไม่มีสิทธิ์");
    hrPass("e-0010", c.id);
    expect(() => approveClaim("e-0050", c.id, "1234")).toThrow();
    expect(() => setRolePermission("e-0050", "admin", "claim.approve", true)).toThrow("Least Privilege");
    expect(() => setUserRole("e-0001", "e-0001", "admin")).toThrow();
    const own = submitClaim("e-0010", { employeeId: "e-0010", benefitTypeId: "b-den", amount: 500, receiptDate: today, attachments: [att("ใบเสร็จ")] });
    expect(own.status).toBe("pending_manager"); // ข้ามขั้น HR ตรวจตัวเอง
  });

  it("HR ยื่นแทนต้องระบุเหตุผล และบันทึกผู้ทำแทน", () => {
    const input = { employeeId: "e-0004", benefitTypeId: "b-den", amount: 500, receiptDate: today, attachments: [att("ใบเสร็จ")] };
    expect(() => submitClaim("e-0010", input)).toThrow("เหตุผล");
    expect(() => submitClaim("e-0001", { ...input, onBehalfReason: "x" })).toThrow("ไม่มีสิทธิ์");
    const c = submitClaim("e-0010", { ...input, onBehalfReason: "พนักงานลาคลอด" });
    expect(c.filedById).toBe("e-0010");
  });

  it("กำหนดเงินช่วยเหลือภัยพิบัติ ตรวจงบคงเหลือของรอบ", () => {
    expect(() => hrPass("e-0010", "c-0008", { assignedAmount: 25000 })).toThrow("วงเงินสูงสุดต่อคน");
    const c = hrPass("e-0010", "c-0008", { assignedAmount: 15000 });
    expect(c.assignedAmount).toBe(15000);
    expect(c.status).toBe("pending_manager");
  });

  it("แก้ข้อมูลพนักงานบันทึกข้อมูลก่อน–หลัง", () => {
    const e = getDB().employees.find((x) => x.id === "e-0002")!;
    updateEmployee("e-0010", e.id, { ...e, employmentType: "permanent" });
    const log = getDB().auditLogs[0];
    expect(log.entity).toBe("employee");
    expect(log.before).toEqual({ employmentType: "probation" });
    expect(log.after).toEqual({ employmentType: "permanent" });
  });

  it("มุมมองบัญชีไม่มีชื่อพนักงาน", () => {
    const rows = paymentRows(getDB());
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toContain("สมชาย");
  });
});
