import { describe, expect, it } from "vitest";
import { createSeed, SEED_SETTINGS } from "../data/seed";
import { canTransition, checkClaim, computeApproved, computePayDate, entitlementOf, findDuplicateReceipts, payDateExplain, paymentError, resolveLimit } from "./rules";

const db = createSeed();
const emp = (code: string) => db.employees.find((e) => e.code === code)!;
const ben = (code: string) => db.benefitTypes.find((b) => b.code === code)!;
const TODAY = "2026-11-04";

describe("computePayDate — รอบตัดและวันจ่าย", () => {
  const S = SEED_SETTINGS;
  it("อนุมัติภายในวันที่ 5 → จ่ายสิ้นเดือนนั้น", () => {
    expect(computePayDate("2026-11-04", S)).toBe("2026-11-30");
    expect(computePayDate("2026-11-05", S)).toBe("2026-11-30");
  });
  it("หลังวันที่ 5 → สิ้นเดือนถัดไป", () => {
    expect(computePayDate("2026-11-06", S)).toBe("2026-12-30"); // 31 ธ.ค. วันหยุด → 30
  });
  it("สิ้นเดือนตรงเสาร์-อาทิตย์ → เลื่อนเป็นวันทำการก่อนหน้า", () => {
    expect(computePayDate("2026-10-02", S)).toBe("2026-10-30"); // 31 ต.ค. 2026 = เสาร์
    expect(computePayDate("2027-01-03", S)).toBe("2027-01-29"); // 31 ม.ค. 2027 = อาทิตย์
  });
  it("ข้ามปี: อนุมัติหลังตัดรอบเดือนธันวาคม → มกราคมปีถัดไป", () => {
    expect(computePayDate("2026-12-20", S)).toBe("2027-01-29");
  });
  it("อธิบายเหตุผลการเลื่อนวัน", () => {
    const x = payDateExplain("2026-12-01", S);
    expect(x.nominal).toBe("2026-12-31");
    expect(x.shifted).toBe(true);
    expect(x.reason).toContain("วันสิ้นปี");
  });
  it("ใช้วันตัดรอบที่ตั้งค่าได้", () => {
    expect(computePayDate("2026-11-10", { cutoffDay: 15, holidays: [] })).toBe("2026-11-30");
  });
});

const ctx = { claims: db.claims, limits: db.benefitLimits, positions: db.positions };

describe("วงเงินตามระดับตำแหน่ง (resolveLimit)", () => {
  it("สวัสดิการเดียวกัน ระดับ 1 กับระดับ 4 ได้วงเงินต่างกัน", () => {
    expect(resolveLimit(db.benefitLimits, "b-med", 1, TODAY)?.perYear).toBe(20000);
    expect(resolveLimit(db.benefitLimits, "b-med", 4, TODAY)?.perYear).toBe(80000);
  });
  it("ใช้ฉบับล่าสุดที่มีผลแล้ว — ฉบับที่ยังไม่ถึงวันไม่ถูกใช้", () => {
    const base = resolveLimit(db.benefitLimits, "b-med", 1, TODAY)!;
    const later = { ...base, id: "new", perYear: 25000, effectiveFrom: "2026-11-01", createdAt: "2026-11-01T00:00:00Z" };
    const future = { ...base, id: "future", perYear: 99999, effectiveFrom: "2027-01-01", createdAt: "2026-11-01T00:00:00Z" };
    expect(resolveLimit([...db.benefitLimits, later, future], "b-med", 1, TODAY)?.perYear).toBe(25000);
  });
});

describe("computeApproved — ตัดยอดตามวงเงิน", () => {
  const opd = resolveLimit(db.benefitLimits, "b-opd", 1, TODAY);
  it("ประกันส่วนเกิน วงเงิน 1,000/ครั้ง กรอก 1,500 → เบิกได้ 1,000", () => {
    expect(computeApproved(1500, opd, 0, 0)).toEqual({ approved: 1000, reason: "เกินวงเงินต่อครั้ง" });
  });
  it("เกินวงเงินคงเหลือต่อปี", () => {
    expect(computeApproved(2000, { perYear: 3000 }, 1500, 1)).toEqual({ approved: 1500, reason: "เกินวงเงินคงเหลือต่อปี" });
  });
  it("ใช้ครบจำนวนครั้ง / วงเงินหมด / ไม่มีวงเงิน → 0", () => {
    expect(computeApproved(500, opd, 0, 30).approved).toBe(0);
    expect(computeApproved(500, { perYear: 3000 }, 3000, 2).approved).toBe(0);
    expect(computeApproved(500, null, 0, 0).approved).toBe(0);
  });
});

describe("สิทธิ์และวงเงิน (entitlementOf)", () => {
  it("ประกันส่วนเกิน: นับครั้งรวมที่รอดำเนินการ", () => {
    const e = entitlementOf(emp("EMP-0001"), ben("OPD"), ctx, 2026, TODAY);
    expect(e.usage.pendingTimes).toBe(2);
    expect(e.remainingTimes).toBe(28);
  });
  it("ค่ารักษา: หักยอดเบิกได้จริงที่จ่ายแล้ว", () => {
    const e = entitlementOf(emp("EMP-0001"), ben("MED"), ctx, 2026, TODAY);
    expect(e.usage.usedAmount).toBe(2500);
    expect(e.remainingAmount).toBe(17500);
  });
  it("คำขอที่ไม่อนุมัติ = คืนสิทธิ์", () => {
    expect(entitlementOf(emp("EMP-0004"), ben("MED"), ctx, 2026, TODAY).remainingAmount).toBe(20000);
  });
  it("ทดลองงานไม่มีสิทธิ์ค่ารักษา / อายุงานไม่ถึง", () => {
    expect(entitlementOf(emp("EMP-0002"), ben("MED"), ctx, 2026, TODAY).eligible).toBe(false);
    expect(entitlementOf({ ...emp("EMP-0001"), startDate: "2026-06-01" }, ben("EDU"), ctx, 2026, TODAY).eligible).toBe(false);
  });
  it("ยอดปีใหม่เริ่มต้นใหม่", () => {
    expect(entitlementOf(emp("EMP-0001"), ben("MED"), ctx, 2027, "2027-01-10").remainingAmount).toBe(20000);
  });
  it("ย้ายตำแหน่งกลางปี: ใช้วงเงินระดับใหม่ ยอดที่ใช้แล้วนับต่อ", () => {
    const promoted = { ...emp("EMP-0001"), positionId: "p-l4" };
    const e = entitlementOf(promoted, ben("MED"), ctx, 2026, TODAY);
    expect(e.perYear).toBe(80000);
    expect(e.remainingAmount).toBe(80000 - 2500);
  });
});

describe("checkClaim — ตรวจกติกาทันที", () => {
  const base = { employee: emp("EMP-0001"), today: TODAY, claims: db.claims, limits: db.benefitLimits, positions: db.positions, receiptNo: "R-1", vendorName: "ร้าน A" };
  it("เกินวงเงินต่อครั้ง → ตัดยอด ไม่บล็อก", () => {
    const r = checkClaim({ ...base, benefit: ben("OPD"), amountRequested: 1500, receiptDate: "2026-10-29", docTypes: ["ใบเสร็จ"] });
    expect(r.ok).toBe(true);
    expect(r.approved).toBe(1000);
    expect(r.approvedReason).toBe("เกินวงเงินต่อครั้ง");
  });
  it("ขาดเอกสาร / ขาดเลขใบเสร็จหรือร้าน", () => {
    expect(checkClaim({ ...base, benefit: ben("MED"), amountRequested: 500, receiptDate: "2026-10-29", docTypes: ["ใบเสร็จ"] }).errors.some((x) => x.includes("ใบรับรองแพทย์"))).toBe(true);
    expect(checkClaim({ ...base, receiptNo: " ", benefit: ben("OPD"), amountRequested: 500, receiptDate: "2026-11-01", docTypes: ["ใบเสร็จ"] }).ok).toBe(false);
    expect(checkClaim({ ...base, vendorName: "", benefit: ben("OPD"), amountRequested: 500, receiptDate: "2026-11-01", docTypes: ["ใบเสร็จ"] }).ok).toBe(false);
  });
  it("วันที่ในอนาคต / เกินกำหนดยื่น", () => {
    expect(checkClaim({ ...base, benefit: ben("OPD"), amountRequested: 100, receiptDate: "2026-11-10", docTypes: ["ใบเสร็จ"] }).ok).toBe(false);
    expect(checkClaim({ ...base, benefit: ben("OPD"), amountRequested: 100, receiptDate: "2026-08-01", docTypes: ["ใบเสร็จ"] }).ok).toBe(false);
  });
  it("คนที่ใช้ครบ 30 ครั้งแล้ว ยื่นไม่ได้", () => {
    const r = checkClaim({ ...base, employee: emp("EMP-0020"), benefit: ben("OPD"), amountRequested: 100, receiptDate: "2026-11-01", docTypes: ["ใบเสร็จ"] });
    expect(r.ok).toBe(false);
    expect(r.approved).toBe(0);
    expect(r.errors.some((x) => x.includes("ครบ 30 ครั้ง"))).toBe(true);
  });
  it("พนักงานพ้นสภาพยื่นไม่ได้", () => {
    expect(checkClaim({ ...base, employee: emp("EMP-0005"), benefit: ben("DEN"), amountRequested: 100, receiptDate: "2026-11-01", docTypes: ["ใบเสร็จ"] }).ok).toBe(false);
  });
});

describe("ใบเสร็จซ้ำ / การจ่าย / ลำดับสถานะ", () => {
  it("เลขใบเสร็จ + ร้านเดียวกัน = ซ้ำ (ไม่สนตัวพิมพ์/ช่องว่าง)", () => {
    const c9 = db.claims.find((c) => c.id === "c-0009")!;
    expect(findDuplicateReceipts(db.claims, c9).map((c) => c.id)).toEqual(["c-0003"]);
    expect(findDuplicateReceipts(db.claims, { ...c9, vendorName: " คลินิกทันตกรรม  ยิ้มสวย" })).toHaveLength(0);
  });
  it("บังคับข้อมูลตามวิธีจ่าย และห้ามวันในอนาคต", () => {
    expect(paymentError({ method: "cheque", paidAt: TODAY, chequeDate: TODAY }, TODAY)).toContain("เลขที่เช็ค");
    expect(paymentError({ method: "cheque", paidAt: TODAY, chequeNo: "1" }, TODAY)).toContain("วันที่บนเช็ค");
    expect(paymentError({ method: "transfer", paidAt: TODAY }, TODAY)).toContain("อ้างอิง");
    expect(paymentError({ method: "cash", paidAt: "2026-12-01" }, TODAY)).toContain("อนาคต");
    expect(paymentError({ method: "cash", paidAt: TODAY }, TODAY)).toBeNull();
  });
  it("เปลี่ยนสถานะได้ตามลำดับเท่านั้น: HR ตรวจ → หัวหน้าอนุมัติ → จ่าย", () => {
    expect(canTransition("verify", "pending_hr")).toBe(true);
    expect(canTransition("approve", "pending_hr")).toBe(false); // ข้าม HR ไม่ได้
    expect(canTransition("approve", "pending_manager")).toBe(true);
    expect(canTransition("approve", "returned")).toBe(false);
    expect(canTransition("return", "pending_manager")).toBe(false); // หัวหน้าไม่ส่งกลับผู้ยื่น
    expect(canTransition("mark_paid", "pending_manager")).toBe(false);
    expect(canTransition("resubmit", "returned")).toBe(true);
    expect(canTransition("hr_reject", "approved")).toBe(false);
    expect(canTransition("manager_reject", "pending_manager")).toBe(true);
  });
});
