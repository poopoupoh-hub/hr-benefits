import { beforeEach, describe, expect, it } from "vitest";
import { NAV } from "../../components/nav";
import { CLAIM_FILTERS } from "../domain/constants";
import { addDays, todayLocal } from "../domain/dates";
import { entitlementOf } from "../domain/rules";
import type { Role } from "../domain/types";
import { getDB, resetDB } from "../data/db";
import { scopeDatabase } from "../data/scope";
import { setEmployeeActive, setRolePermission, setUserRole, updateEmployee } from "./admin";
import { approvalQueue, resolveApprover, teamOf } from "./approval";
import { requestClaimChange, requestLimitChange, reviewChange } from "./changes";
import { approveClaim, recordPayment, rejectClaim, returnClaim, setDelegation, submitClaim, updateClaim, verifyClaim } from "./claims";
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
const who = (id: string) => getDB().employees.find((e) => e.id === id)!;

describe("ข้อ 1 — Role และสิทธิ์", () => {
  beforeEach(() => resetDB());

  it("แต่ละ role เห็นเฉพาะเมนูของตัวเอง", () => {
    const db = getDB();
    const menus = (role: Role) => NAV.filter((n) => db.rbac[role].includes(n.perm)).map((n) => n.href);
    expect(menus("employee")).toEqual(["/me", "/me/new", "/me/claims", "/me/org"]);
    expect(menus("manager")).toEqual(expect.arrayContaining(["/manager", "/manager/team", "/manager/delegate"]));
    expect(menus("manager")).not.toContain("/hr");
    expect(menus("hr")).toContain("/hr");
    expect(menus("hr")).not.toContain("/manager"); // HR ตรวจ แต่ไม่อนุมัติ
    expect(menus("hr")).toContain("/hr/changes");
    expect(menus("finance")).toContain("/finance");
    expect(menus("finance")).not.toContain("/hr");
    expect(menus("finance")).not.toContain("/audit");
    expect(menus("admin")).toContain("/audit");
    expect(menus("admin")).not.toContain("/hr");
    expect(menus("admin")).not.toContain("/manager");
  });

  it("มี 5 บทบาทเท่านั้น: พนักงาน / หัวหน้างาน / HR / บัญชี / ผู้ดูแลระบบ", () => {
    const db = getDB();
    expect(Object.keys(db.rbac).sort()).toEqual(["admin", "employee", "finance", "hr", "manager"]);
    expect(new Set(db.employees.map((e) => e.role))).toEqual(new Set(["employee", "manager", "hr", "finance", "admin"]));
  });

  it("แยกหน้าที่: Admin/บัญชี/HR อนุมัติขั้นสุดท้ายไม่ได้ · หัวหน้างานตรวจเอกสารแทน HR ไม่ได้", () => {
    expect(() => setRolePermission("e-0050", "admin", "claim.approve", true)).toThrow();
    expect(() => setRolePermission("e-0050", "finance", "claim.approve", true)).toThrow();
    expect(() => setRolePermission("e-0050", "hr", "claim.approve", true)).toThrow();
    expect(() => setRolePermission("e-0050", "manager", "claim.review", true)).toThrow();
    expect(() => setRolePermission("e-0050", "admin", "audit.view", false)).toThrow();
    expect(() => setUserRole("e-0001", "e-0001", "admin")).toThrow();
  });
});

describe("ข้อ 2 — Flow: พนักงานยื่น → HR ตรวจ → หัวหน้าอนุมัติ → บัญชีจ่าย", () => {
  beforeEach(() => resetDB());

  it("ครบทุกขั้น และข้ามขั้นไม่ได้", () => {
    const c = submitClaim("e-0001", den(900));
    expect(c.status).toBe("pending_hr");
    expect(() => approveClaim("e-0020", c.id)).toThrow("รอหัวหน้าอนุมัติ"); // หัวหน้าอนุมัติก่อน HR ตรวจไม่ได้
    expect(() => verifyClaim("e-0020", c.id)).toThrow("ไม่มีสิทธิ์"); // หัวหน้าตรวจเอกสารแทน HR ไม่ได้
    expect(() => verifyClaim("e-0030", c.id)).toThrow("ไม่มีสิทธิ์");

    const v = verifyClaim("e-0010", c.id);
    expect(v.status).toBe("pending_manager");
    expect(v.verifiedById).toBe("e-0010");
    expect(v.approverId).toBe("e-0020"); // หัวหน้างานโดยตรงของสมชาย
    expect(v.payDate).toBeFalsy(); // ยังไม่กำหนดวันจ่ายจนกว่าหัวหน้าอนุมัติ

    expect(() => approveClaim("e-0010", c.id)).toThrow(); // HR อนุมัติไม่ได้
    expect(() => approveClaim("e-0040", c.id)).toThrow("ไม่ใช่ผู้อนุมัติ"); // หัวหน้าคนอื่นอนุมัติไม่ได้
    expect(() => recordPayment("e-0030", c.id, { method: "cash", paidAt: today })).toThrow("รอจ่าย");

    const a = approveClaim("e-0020", c.id);
    expect(a.status).toBe("approved");
    expect(a.decidedById).toBe("e-0020");
    expect(a.payDate).toBeTruthy();
    expect(() => approveClaim("e-0020", c.id)).toThrow(); // อนุมัติซ้ำไม่ได้

    recordPayment("e-0030", c.id, { method: "transfer", paidAt: today, transferRef: "TRF-001" });
    expect(claimOf(c.id).status).toBe("paid");
    expect(claimOf(c.id).history.map((h) => h.action)).toEqual(["submit", "verify", "approve", "mark_paid"]);
    const mails = getDB().emails.map((m) => m.to.join(",") + "|" + m.event);
    expect(mails).toContain("emp-0020@company.example|pending_manager"); // แจ้งหัวหน้าเมื่อถึงคิว
  });

  it("HR: ส่งกลับ (ต้องมีเหตุผล) → ผู้ยื่นแก้ → กลับมาที่ HR ไม่ใช่หัวหน้า", () => {
    const c = submitClaim("e-0001", den(900));
    expect(() => returnClaim("e-0010", c.id, "")).toThrow("เหตุผล");
    returnClaim("e-0010", c.id, "ใบเสร็จไม่ชัด");
    expect(() => verifyClaim("e-0010", c.id)).toThrow();
    const r = updateClaim("e-0001", c.id, { ...den(800, "R-NEW") });
    expect(r.status).toBe("pending_hr");
  });

  it("ไม่อนุมัติได้ทั้งสองขั้น (ต้องมีเหตุผล) และคืนสิทธิ์", () => {
    const c1 = submitClaim("e-0001", den(3000));
    expect(() => rejectClaim("e-0010", c1.id, " ")).toThrow("เหตุผล");
    rejectClaim("e-0010", c1.id, "ไม่อยู่ในเงื่อนไข"); // HR ไม่ผ่านการตรวจ
    expect(claimOf(c1.id).status).toBe("rejected");
    const c2 = submitClaim("e-0001", den(3000)); // คืนสิทธิ์แล้ว ยื่นใหม่ได้
    verifyClaim("e-0010", c2.id);
    expect(() => returnClaim("e-0020", c2.id, "x")).toThrow(); // หัวหน้าไม่ส่งกลับผู้ยื่น
    rejectClaim("e-0020", c2.id, "ไม่เกี่ยวกับการทำงาน");
    expect(claimOf(c2.id).status).toBe("rejected");
    expect(claimOf(c2.id).decidedById).toBe("e-0020");
    expect(() => submitClaim("e-0001", den(3000))).not.toThrow();
  });

  it("ผู้ยื่นแก้ไขไม่ได้เมื่อ HR ส่งต่อหัวหน้าแล้ว", () => {
    const c = submitClaim("e-0001", den(900));
    verifyClaim("e-0010", c.id);
    expect(() => updateClaim("e-0001", c.id, den(500))).toThrow();
  });
});

describe("ข้อ 3 — สายอนุมัติ (ใครเป็นผู้อนุมัติ)", () => {
  beforeEach(() => resetDB());

  it("HR ตรวจคำขอตัวเองไม่ได้ · ผู้ตรวจ = หัวหน้าโดยตรง → ข้ามขึ้นไปหัวหน้าลำดับถัดไป", () => {
    expect(() => verifyClaim("e-0010", "c-0010")).toThrow("ตนเอง");
    const v = verifyClaim("e-0011", "c-0010"); // HR อีกคน (ประภา) ตรวจคำขอของวิภา
    expect(v.approverId).toBe("e-0040"); // ประภาเป็น HR อนุมัติไม่ได้ → ข้ามขึ้นไปประเสริฐ
    expect(() => approveClaim("e-0011", "c-0010")).toThrow("ผู้ตรวจ");
    expect(approveClaim("e-0040", "c-0010").status).toBe("approved");
  });

  it("ผู้บริหารสูงสุด (ไม่มีหัวหน้า) → หัวหน้างานระดับสูงสุดคนอื่น", () => {
    expect(resolveApprover(getDB(), "e-0040", "e-0010")).toMatchObject({ route: "fallback", approver: { id: "e-0020" } });
  });

  it("หัวหน้าโดยตรงไม่มีสิทธิ์อนุมัติ → ข้ามไปหัวหน้าคนถัดไป", () => {
    expect(resolveApprover(getDB(), "e-0030", "e-0010")).toMatchObject({ route: "supervisor", approver: { id: "e-0040" } });
    const e = who("e-0001");
    updateEmployee("e-0010", e.id, { ...e, supervisorId: "e-0004" }); // มานี (พนักงานทั่วไป) เป็นหัวหน้า
    expect(resolveApprover(getDB(), "e-0001", "e-0010")).toMatchObject({ route: "escalated", approver: { id: "e-0020" } });
  });

  it("หัวหน้าลาออกระหว่างรออนุมัติ → ระบบส่งต่อให้หัวหน้าคนถัดไปอัตโนมัติ", () => {
    // ย้ายลูกทีมของธนาไปอยู่ใต้ประเสริฐก่อน แล้วปิดสถานะธนา
    for (const id of ["e-0001", "e-0002", "e-0003", "e-0004", "e-0005", "e-0050"]) {
      const e = who(id);
      if (e.active) updateEmployee("e-0010", id, { ...e, supervisorId: "e-0020" === e.supervisorId ? "e-0040" : e.supervisorId });
    }
    // c-0002 (pending_manager) เก็บ approverId = ธนา
    setEmployeeActive("e-0010", "e-0020", false);
    expect(approvalQueue(getDB(), who("e-0040")).map((c) => c.id)).toContain("c-0002");
    expect(approveClaim("e-0040", "c-0002").status).toBe("approved");
  });

  it("ผู้อนุมัติสำรอง: อนุมัติแทนได้เฉพาะในช่วงวันที่ และบันทึกว่าอนุมัติแทน", () => {
    expect(() => setDelegation("e-0020", { toId: "e-0030", from: today, to: today })).toThrow("ไม่สามารถเป็นผู้อนุมัติ"); // บัญชีเป็นผู้อนุมัติไม่ได้
    expect(() => setDelegation("e-0001", { toId: "e-0040", from: today, to: today })).toThrow("ไม่มีสิทธิ์"); // พนักงานทั่วไปตั้งไม่ได้
    setDelegation("e-0020", { toId: "e-0040", from: addDays(today, 1), to: addDays(today, 5) });
    expect(() => approveClaim("e-0040", "c-0002")).toThrow(); // ยังไม่ถึงวันเริ่ม
    setDelegation("e-0020", { toId: "e-0040", from: today, to: addDays(today, 5), note: "ลาพักร้อน" });
    expect(approvalQueue(getDB(), who("e-0040")).map((c) => c.id)).toContain("c-0002");
    const a = approveClaim("e-0040", "c-0002");
    expect(a.status).toBe("approved");
    expect(a.history.at(-1)?.note).toContain("อนุมัติแทน");
    expect(getDB().auditLogs.some((l) => l.entity === "delegation" && l.action === "delegate")).toBe(true);
    setDelegation("e-0020", null);
    expect(who("e-0020").delegation).toBeNull();
  });
});

describe("ข้อ 4 — สิทธิ์การเห็นข้อมูล (scope)", () => {
  beforeEach(() => resetDB());

  it("หัวหน้างานเห็นเฉพาะคำขอของทีม · พนักงานเห็นเฉพาะของตัวเอง · ไม่มี password hash", () => {
    const db = getDB();
    const mgr = scopeDatabase(db, who("e-0020"));
    const team = new Set(teamOf(db, "e-0020").map((e) => e.id));
    expect(mgr.claims.length).toBeGreaterThan(0);
    expect(mgr.claims.every((c) => team.has(c.employeeId) || c.employeeId === "e-0020" || c.approverId === "e-0020")).toBe(true);
    expect(mgr.claims.some((c) => c.employeeId === "e-0010")).toBe(false); // คำขอทีม HR ไม่เห็น
    const emp = scopeDatabase(db, who("e-0001"));
    expect(emp.claims.every((c) => c.employeeId === "e-0001")).toBe(true);
    expect(emp.employees.every((e) => e.passwordHash === "")).toBe(true);
  });
});

describe("ข้อ 5 — ฟอร์มยื่นเบิก / วงเงิน", () => {
  beforeEach(() => resetDB());

  it("ประกันส่วนเกิน 1,500 → เบิกได้จริง 1,000", () => {
    const c = submitClaim("e-0001", { ...den(1500), benefitTypeId: "b-opd" });
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

  it("ตัวเลขการ์ด Dashboard ตรงกับรายการที่กรอง", () => {
    const mine = getDB().claims.filter((c) => c.employeeId === "e-0001");
    const counts = Object.fromEntries(CLAIM_FILTERS.map((f) => [f.key, mine.filter((c) => f.statuses.includes(c.status)).length]));
    expect(counts.all).toBe(mine.length);
    expect(counts.all).toBe(counts.active + counts.approved + counts.paid + counts.rejected);
  });

  it("ค่ารักษา ระดับ 1 กับระดับ 4 ได้วงเงินต่างกัน", () => {
    const db = getDB();
    const ctx = { claims: db.claims, limits: db.benefitLimits, positions: db.positions };
    const med = db.benefitTypes.find((b) => b.id === "b-med")!;
    expect(entitlementOf(who("e-0001"), med, ctx, 2026, today).perYear).toBe(20000);
    expect(entitlementOf(who("e-0040"), med, ctx, 2026, today).perYear).toBe(80000);
  });

  it("งบภัยพิบัติ: HR กำหนดเงินช่วยเหลือตอนตรวจ (ตรวจงบคงเหลือ) → หัวหน้าอนุมัติ", () => {
    expect(() => verifyClaim("e-0010", "c-0008")).toThrow("กำหนดจำนวนเงิน");
    expect(() => verifyClaim("e-0010", "c-0008", { assignedAmount: 25000 })).toThrow("สูงสุดต่อคน");
    expect(verifyClaim("e-0010", "c-0008", { assignedAmount: 15000 }).amountApproved).toBe(15000);
    expect(approveClaim("e-0020", "c-0008").amountApproved).toBe(15000);
  });
});

describe("ข้อ 6 — การจ่ายเงิน", () => {
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

describe("ข้อ 7 — Audit log", () => {
  beforeEach(() => resetDB());

  it("HR แก้ประเภทพนักงาน → log มี before/after · บันทึกซ้ำไม่มีอะไรเปลี่ยน = ไม่มี log", () => {
    const e = who("e-0002");
    updateEmployee("e-0010", e.id, { ...e, employmentType: "permanent" });
    const log = getDB().auditLogs[0];
    expect(log.entity).toBe("employee");
    expect(log.before).toEqual({ employmentType: "probation" });
    expect(log.after).toEqual({ employmentType: "permanent" });
    const n = getDB().auditLogs.length;
    updateEmployee("e-0010", e.id, { ...who("e-0002") });
    expect(getDB().auditLogs.length).toBe(n);
  });

  it("เฉพาะ admin ดู audit ได้", () => {
    const db = getDB();
    expect(can(db, who("e-0050"), "audit.view")).toBe(true);
    for (const id of ["e-0001", "e-0010", "e-0011", "e-0020", "e-0030", "e-0040"]) expect(can(db, who(id), "audit.view")).toBe(false);
  });

  it("log ไม่มีข้อมูลสุขภาพ และบันทึกทั้งผู้ตรวจและผู้อนุมัติ", () => {
    const c = submitClaim("e-0001", { ...den(900), note: "ปวดฟันกรามซี่ใน" });
    verifyClaim("e-0010", c.id);
    approveClaim("e-0020", c.id);
    const logs = getDB().auditLogs.filter((l) => l.entityId === c.id);
    expect(JSON.stringify(logs)).not.toContain("ปวดฟัน");
    expect(logs.map((l) => `${l.action}:${l.actorId}`).reverse()).toEqual(["submit:e-0001", "verify:e-0010", "approve:e-0020"]);
  });
});

describe("ข้อ 8 — คำขอแก้ไข (Maker–Checker)", () => {
  beforeEach(() => resetDB());

  it("ไม่อนุมัติ → HR ขอแก้ → HR อีกคนอนุมัติ → approved", () => {
    const c = submitClaim("e-0001", den(900));
    rejectClaim("e-0010", c.id, "เอกสารไม่ครบ");
    const cr = requestClaimChange("e-0010", c.id, "approved", "ตรวจพบว่าเอกสารครบ");
    expect(claimOf(c.id).status).toBe("rejected");
    expect(() => reviewChange("e-0010", cr.id, true)).toThrow("ของตนเอง"); // ผู้ขออนุมัติเองไม่ได้
    expect(() => reviewChange("e-0020", cr.id, true)).toThrow("ไม่มีสิทธิ์"); // หัวหน้างานไม่มีสิทธิ์
    reviewChange("e-0011", cr.id, true);
    expect(claimOf(c.id).status).toBe("approved");
    expect(claimOf(c.id).amountApproved).toBe(900);
  });

  it("คำขอที่จ่ายแล้วขอแก้ไม่ได้ / ระหว่างรอแก้ผล บัญชีจ่ายไม่ได้", () => {
    expect(() => requestClaimChange("e-0010", "c-0001", "rejected", "x")).toThrow("จ่ายแล้ว");
    requestClaimChange("e-0010", "c-0003", "rejected", "ใบเสร็จซ้ำ");
    expect(() => recordPayment("e-0030", "c-0003", { method: "cash", paidAt: today })).toThrow("คำขอแก้ผลค้าง");
  });

  it("ผู้ส่งคำขอแก้ปฏิเสธคำขอตัวเองก็ไม่ได้ — HR อีกคนเท่านั้น", () => {
    const cr = requestClaimChange("e-0011", "c-0007", "approved", "ทบทวนใหม่");
    expect(() => reviewChange("e-0011", cr.id, false)).toThrow("ของตนเอง");
    expect(reviewChange("e-0010", cr.id, true).status).toBe("approved");
  });

  it("แก้วงเงิน = เพิ่มแถวใหม่ ไม่ทับของเดิม", () => {
    const before = getDB().benefitLimits.length;
    const cr = requestLimitChange("e-0010", "b-med", "lim-med-1", { minLevel: 1, maxLevel: 2, perYear: 25000, perClaim: null, maxCount: null }, "ปรับตามนโยบายใหม่");
    reviewChange("e-0011", cr.id, true);
    expect(getDB().benefitLimits.length).toBe(before + 1);
    expect(getDB().benefitLimits.find((l) => l.id === "lim-med-1")!.perYear).toBe(20000);
  });
});

describe("Test สุดท้าย — ติดตามใบเสร็จ 1 ใบตั้งแต่ยื่นจนจ่าย", () => {
  beforeEach(() => resetDB());

  it("ยื่น OPD 1,500 → ตัดเหลือ 1,000 → HR ตรวจ → หัวหน้าอนุมัติ → บัญชีจ่ายด้วยเช็ค → audit ครบ", () => {
    const c = submitClaim("e-0001", { ...den(1500, "TRACE-001"), benefitTypeId: "b-opd" });
    expect(c.amountApproved).toBe(1000);
    verifyClaim("e-0010", c.id);
    approveClaim("e-0020", c.id);
    recordPayment("e-0030", c.id, { method: "cheque", paidAt: today, chequeNo: "CHQ-77", chequeDate: today });
    const db = getDB();
    expect(db.claims.find((x) => x.id === c.id)!.status).toBe("paid");
    expect(paymentRows(db).find((r) => r.claimId === c.id)).toMatchObject({ amountApproved: 1000, ref: "CHQ-77", receiptNo: "TRACE-001" });
    const actions = db.auditLogs.filter((l) => l.entityId === c.id).map((l) => l.action).reverse();
    expect(actions).toEqual(["submit", "verify", "approve", "record_payment"]);
  });
});
