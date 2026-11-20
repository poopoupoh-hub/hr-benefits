import { beforeEach, describe, expect, it } from "vitest";
import { NAV } from "../../components/nav";
import { CLAIM_FILTERS } from "../domain/constants";
import { todayLocal } from "../domain/dates";
import { entitlementOf } from "../domain/rules";
import type { Role } from "../domain/types";
import { getDB, resetDB } from "../data/db";
import { scopeDatabase } from "../data/scope";
import { setRolePermission, setUserRole, updateEmployee } from "./admin";
import { requestClaimChange, requestLimitChange, reviewChange } from "./changes";
import { approveClaim, recordPayment, rejectClaim, returnClaim, submitClaim, updateClaim } from "./claims";
import { can } from "./core";
import { paymentRows } from "./queries";

const att = (docType: string) => ({ id: "f-" + docType, name: "x.jpg", size: 1, type: "image/jpeg", docType, uploadedAt: new Date().toISOString() });
const today = todayLocal();
const den = (amount: number, receiptNo = "R-" + Math.random().toString(36).slice(2, 8)) => ({
  benefitTypeId: "b-den",
  receiptNo,
  vendorName: "คลินิกทดสอบ",
  amountRequested: amount,
  receiptDate: today,
  attachments: [att("ใบเสร็จ")],
});
const claimOf = (id: string) => getDB().claims.find((c) => c.id === id)!;

describe("ข้อ 1 — Role และสิทธิ์", () => {
  beforeEach(() => resetDB());

  it("แต่ละ role เห็นเฉพาะเมนูของตัวเอง", () => {
    const db = getDB();
    const menus = (role: Role) => NAV.filter((n) => db.rbac[role].includes(n.perm)).map((n) => n.href);
    expect(menus("employee")).toEqual(["/me", "/me/new", "/me/claims", "/me/org"]);
    expect(menus("finance")).toContain("/finance");
    expect(menus("finance")).not.toContain("/hr");
    expect(menus("finance")).not.toContain("/audit");
    expect(menus("hr")).toContain("/hr/limits");
    expect(menus("hr")).not.toContain("/audit");
    expect(menus("admin")).toContain("/audit");
    expect(menus("admin")).not.toContain("/hr");
    expect(db.rbac.hr_head).toContain("change.review");
    expect(db.rbac.hr).not.toContain("change.review");
  });

  it("ไม่มี PIN / Manager / CEO เหลือในระบบ", () => {
    const db = getDB();
    expect(Object.keys(db.rbac).sort()).toEqual(["admin", "employee", "finance", "hr", "hr_head"]);
    expect(JSON.stringify(db.employees)).not.toMatch(/pin|manager|delegat/i);
  });

  it("Admin ให้ตัวเองอนุมัติไม่ได้ / ถอด audit.view ของ admin ไม่ได้ / ให้ finance ดู audit ไม่ได้", () => {
    expect(() => setRolePermission("e-0050", "admin", "claim.review", true)).toThrow();
    expect(() => setRolePermission("e-0050", "admin", "audit.view", false)).toThrow();
    expect(() => setRolePermission("e-0050", "finance", "audit.view", true)).toThrow();
    expect(() => setUserRole("e-0001", "e-0001", "admin")).toThrow();
  });
});

describe("ข้อ 2 — สถานะและลำดับขั้น", () => {
  beforeEach(() => resetDB());

  it("ยื่น → HR อนุมัติ → บัญชีจ่าย (มีวิธีจ่าย)", () => {
    const c = submitClaim("e-0001", den(900));
    expect(c.status).toBe("pending_hr");
    expect(() => recordPayment("e-0030", c.id, { method: "cash", paidAt: today })).toThrow("รอจ่าย"); // ข้ามขั้นไม่ได้
    expect(() => approveClaim("e-0030", c.id)).toThrow("ไม่มีสิทธิ์"); // บัญชีอนุมัติไม่ได้
    expect(() => approveClaim("e-0050", c.id)).toThrow("ไม่มีสิทธิ์"); // admin อนุมัติไม่ได้
    const a = approveClaim("e-0010", c.id);
    expect(a.status).toBe("approved");
    expect(a.payDate).toBeTruthy();
    expect(() => approveClaim("e-0010", c.id)).toThrow(); // อนุมัติซ้ำไม่ได้
    expect(() => recordPayment("e-0010", c.id, { method: "cash", paidAt: today })).toThrow("ไม่มีสิทธิ์"); // HR จ่ายไม่ได้
    recordPayment("e-0030", c.id, { method: "transfer", paidAt: today, transferRef: "TRF-001" });
    const done = claimOf(c.id);
    expect(done.status).toBe("paid");
    expect(done.history.map((h) => h.action)).toEqual(["submit", "approve", "mark_paid"]);
    expect(getDB().payments.find((p) => p.claimId === c.id)?.transferRef).toBe("TRF-001");
  });

  it("ไม่อนุมัติ/ส่งกลับ ต้องมีเหตุผล · ส่งกลับ → แก้ → ส่งใหม่", () => {
    const c = submitClaim("e-0001", den(900));
    expect(() => rejectClaim("e-0010", c.id, " ")).toThrow("เหตุผล");
    expect(() => returnClaim("e-0010", c.id, "")).toThrow("เหตุผล");
    returnClaim("e-0010", c.id, "ใบเสร็จไม่ชัด");
    expect(claimOf(c.id).returnReason).toBe("ใบเสร็จไม่ชัด");
    expect(() => approveClaim("e-0010", c.id)).toThrow(); // returned อนุมัติตรงไม่ได้
    const r = updateClaim("e-0001", c.id, { ...den(800, "R-NEW") });
    expect(r.status).toBe("pending_hr");
    expect(r.amountRequested).toBe(800);
  });

  it("HR อนุมัติคำขอของตัวเองไม่ได้", () => {
    expect(() => approveClaim("e-0010", "c-0010")).toThrow();
    expect(claimOf("c-0010").status).toBe("pending_hr");
    expect(approveClaim("e-0011", "c-0010").status).toBe("approved"); // หัวหน้า HR อนุมัติให้ได้
  });

  it("ไม่อนุมัติ = คืนสิทธิ์", () => {
    const c = submitClaim("e-0001", den(3000));
    rejectClaim("e-0010", c.id, "ไม่อยู่ในเงื่อนไข");
    expect(() => submitClaim("e-0001", den(3000))).not.toThrow();
  });
});

describe("ข้อ 3 — ฟอร์มยื่นเบิก", () => {
  beforeEach(() => resetDB());

  it("ประกันส่วนเกิน 1,500 → เบิกได้จริง 1,000", () => {
    const c = submitClaim("e-0001", { ...den(1500), benefitTypeId: "b-opd" });
    expect(c.amountRequested).toBe(1500);
    expect(c.amountApproved).toBe(1000);
  });

  it("ธนา (EMP-0020) ใช้ครบ 30 ครั้งแล้ว ยื่นไม่ได้", () => {
    expect(() => submitClaim("e-0020", { ...den(500), benefitTypeId: "b-opd" })).toThrow("30");
  });

  it("ต้องมีเลขใบเสร็จและชื่อร้าน / ยื่นแทนคนอื่นไม่ได้", () => {
    expect(() => submitClaim("e-0001", { ...den(500), receiptNo: "" })).toThrow();
    expect(() => submitClaim("e-0001", { ...den(500), vendorName: " " })).toThrow();
    expect(() => submitClaim("e-0010", { ...den(500), employeeId: "e-0004" } as never)).not.toThrow(); // employeeId ถูกละเลย
    expect(getDB().claims[0].employeeId).toBe("e-0010");
  });
});

describe("ข้อ 4 — Dashboard", () => {
  beforeEach(() => resetDB());

  it("ตัวเลขการ์ดตรงกับรายการที่กรอง", () => {
    const mine = getDB().claims.filter((c) => c.employeeId === "e-0001");
    const counts = Object.fromEntries(CLAIM_FILTERS.map((f) => [f.key, mine.filter((c) => f.statuses.includes(c.status)).length]));
    expect(counts.all).toBe(mine.length);
    expect(counts.all).toBe(counts.active + counts.approved + counts.paid + counts.rejected);
  });
});

describe("สิทธิ์การเห็นข้อมูล (scope) และงบภัยพิบัติ", () => {
  beforeEach(() => resetDB());
  const who = (id: string) => getDB().employees.find((e) => e.id === id)!;

  it("พนักงานเห็นเฉพาะคำขอของตัวเอง · บัญชีไม่เห็นหมายเหตุ/เอกสาร · ไม่มี password hash", () => {
    const db = getDB();
    const emp = scopeDatabase(db, who("e-0001"));
    expect(emp.claims.every((c) => c.employeeId === "e-0001")).toBe(true);
    expect(emp.employees.every((e) => e.passwordHash === "")).toBe(true);
    const fin = scopeDatabase(db, who("e-0030"));
    expect(fin.claims.every((c) => c.status === "approved" || c.status === "paid")).toBe(true);
    expect(fin.claims.every((c) => c.attachments.length === 0 && !c.note)).toBe(true);
    expect(fin.auditLogs).toEqual([]);
  });

  it("งบภัยพิบัติ: HR กำหนดเงินช่วยเหลือตอนอนุมัติ (ตรวจงบคงเหลือ)", () => {
    expect(() => approveClaim("e-0010", "c-0008")).toThrow("กำหนดจำนวนเงิน");
    expect(() => approveClaim("e-0010", "c-0008", { assignedAmount: 25000 })).toThrow("สูงสุดต่อคน");
    expect(approveClaim("e-0010", "c-0008", { assignedAmount: 15000 }).amountApproved).toBe(15000);
  });
});

describe("ข้อ 5 — การจ่ายเงิน", () => {
  beforeEach(() => resetDB());

  it("เลือกเช็คแต่ไม่กรอกเลขเช็ค → บันทึกไม่ได้ / วันที่จ่ายในอนาคตไม่ได้", () => {
    expect(() => recordPayment("e-0030", "c-0003", { method: "cheque", paidAt: today, chequeDate: today })).toThrow("เลขที่เช็ค");
    expect(() => recordPayment("e-0030", "c-0003", { method: "cash", paidAt: "2999-01-01" })).toThrow("อนาคต");
    expect(claimOf("c-0003").status).toBe("approved");
  });

  it("มุมมองบัญชีไม่มีชื่อพนักงาน (1 แถวต่อคำขอ)", () => {
    const rows = paymentRows(getDB());
    expect(new Set(rows.map((r) => r.claimId)).size).toBe(rows.length);
    expect(JSON.stringify(rows)).not.toContain("สมชาย");
  });
});

describe("ข้อ 6 — Audit log", () => {
  beforeEach(() => resetDB());

  it("HR แก้ประเภทพนักงาน → log มี before/after · บันทึกซ้ำไม่มีอะไรเปลี่ยน = ไม่มี log", () => {
    const e = getDB().employees.find((x) => x.id === "e-0002")!;
    updateEmployee("e-0010", e.id, { ...e, employmentType: "permanent" });
    const log = getDB().auditLogs[0];
    expect(log.entity).toBe("employee");
    expect(log.before).toEqual({ employmentType: "probation" });
    expect(log.after).toEqual({ employmentType: "permanent" });
    const n = getDB().auditLogs.length;
    const e2 = getDB().employees.find((x) => x.id === "e-0002")!;
    updateEmployee("e-0010", e2.id, { ...e2 });
    expect(getDB().auditLogs.length).toBe(n);
  });

  it("เฉพาะ admin ดู audit ได้", () => {
    const db = getDB();
    const who = (id: string) => db.employees.find((e) => e.id === id)!;
    expect(can(db, who("e-0050"), "audit.view")).toBe(true);
    for (const id of ["e-0001", "e-0010", "e-0011", "e-0030"]) expect(can(db, who(id), "audit.view")).toBe(false);
  });

  it("log ไม่มีข้อมูลสุขภาพ (หมายเหตุ/ไฟล์แนบ)", () => {
    const c = submitClaim("e-0001", { ...den(900), note: "ปวดฟันกรามซี่ใน" });
    approveClaim("e-0010", c.id);
    expect(JSON.stringify(getDB().auditLogs.filter((l) => l.entityId === c.id))).not.toContain("ปวดฟัน");
  });
});

describe("ข้อ 7 — โครงสร้างองค์กรและวงเงินตามระดับ", () => {
  beforeEach(() => resetDB());

  it("ค่ารักษา ระดับ 1 กับระดับ 4 ได้วงเงินต่างกัน", () => {
    const db = getDB();
    const ctx = { claims: db.claims, limits: db.benefitLimits, positions: db.positions };
    const med = db.benefitTypes.find((b) => b.id === "b-med")!;
    const l1 = entitlementOf(db.employees.find((e) => e.id === "e-0001")!, med, ctx, 2026, today);
    const l4 = entitlementOf(db.employees.find((e) => e.id === "e-0040")!, med, ctx, 2026, today);
    expect(l1.perYear).toBe(20000);
    expect(l4.perYear).toBe(80000);
  });
});

describe("ข้อ 8 — คำขอแก้ไข (Maker–Checker)", () => {
  beforeEach(() => resetDB());

  it("ไม่อนุมัติ → HR ขอแก้ → หัวหน้า HR อนุมัติ → approved และมี log 3 รายการ", () => {
    const c = submitClaim("e-0001", den(900));
    rejectClaim("e-0010", c.id, "เอกสารไม่ครบ");
    const cr = requestClaimChange("e-0010", c.id, "approved", "ตรวจพบว่าเอกสารครบ");
    expect(claimOf(c.id).status).toBe("rejected"); // ยังไม่มีผลทันที
    expect(() => reviewChange("e-0010", cr.id, true)).toThrow("ไม่มีสิทธิ์"); // HR อนุมัติเองไม่ได้
    reviewChange("e-0011", cr.id, true);
    expect(claimOf(c.id).status).toBe("approved");
    expect(claimOf(c.id).amountApproved).toBe(900);
    const logs = getDB().auditLogs.filter((l) => l.entityId === c.id).map((l) => l.action);
    expect(logs).toEqual(expect.arrayContaining(["reject", "change_request", "change_approve"]));
  });

  it("คำขอที่จ่ายแล้วขอแก้ไม่ได้ / ระหว่างรอแก้ผล บัญชีจ่ายไม่ได้", () => {
    expect(() => requestClaimChange("e-0010", "c-0001", "rejected", "x")).toThrow("จ่ายแล้ว");
    requestClaimChange("e-0010", "c-0003", "rejected", "ใบเสร็จซ้ำ");
    expect(() => recordPayment("e-0030", "c-0003", { method: "cash", paidAt: today })).toThrow("คำขอแก้ผลค้าง");
  });

  it("หัวหน้า HR อนุมัติคำขอของตัวเองต้องใส่รหัสผ่าน และถูกติด selfApproved", () => {
    const cr = requestClaimChange("e-0011", "c-0007", "approved", "ทบทวนใหม่");
    expect(() => reviewChange("e-0011", cr.id, true, { password: "wrong" })).toThrow("รหัสผ่าน");
    const ok = reviewChange("e-0011", cr.id, true, { password: "1234" });
    expect(ok.selfApproved).toBe(true);
  });

  it("แก้วงเงิน = เพิ่มแถวใหม่ ไม่ทับของเดิม", () => {
    const before = getDB().benefitLimits.length;
    const cr = requestLimitChange("e-0010", "b-med", "lim-med-1", { minLevel: 1, maxLevel: 2, perYear: 25000, perClaim: null, maxCount: null }, "ปรับตามนโยบายใหม่");
    expect(getDB().benefitLimits.length).toBe(before);
    reviewChange("e-0011", cr.id, true);
    const db = getDB();
    expect(db.benefitLimits.length).toBe(before + 1);
    expect(db.benefitLimits.find((l) => l.id === "lim-med-1")!.perYear).toBe(20000);
  });
});

describe("Test สุดท้าย — ติดตามใบเสร็จ 1 ใบตั้งแต่ยื่นจนจ่าย", () => {
  beforeEach(() => resetDB());

  it("ยื่น OPD 1,500 → ตัดเหลือ 1,000 → HR อนุมัติ → บัญชีจ่ายด้วยเช็ค → audit ครบ", () => {
    const c = submitClaim("e-0001", { ...den(1500, "TRACE-001"), benefitTypeId: "b-opd" });
    expect(c.amountApproved).toBe(1000);
    approveClaim("e-0010", c.id);
    recordPayment("e-0030", c.id, { method: "cheque", paidAt: today, chequeNo: "CHQ-77", chequeDate: today });
    const db = getDB();
    const final = db.claims.find((x) => x.id === c.id)!;
    expect(final.status).toBe("paid");
    expect(final.receiptNo).toBe("TRACE-001");
    expect(db.payments.find((p) => p.claimId === c.id)).toMatchObject({ method: "cheque", chequeNo: "CHQ-77" });
    expect(paymentRows(db).find((r) => r.claimId === c.id)).toMatchObject({ amountApproved: 1000, ref: "CHQ-77", receiptNo: "TRACE-001" });
    const actions = db.auditLogs.filter((l) => l.entityId === c.id).map((l) => l.action).reverse();
    expect(actions).toEqual(["submit", "approve", "record_payment"]);
  });
});
