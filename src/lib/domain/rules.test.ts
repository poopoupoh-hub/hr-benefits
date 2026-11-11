import { describe, expect, it } from "vitest";
import { createSeed, SEED_SETTINGS } from "../data/seed";
import { approversFor, checkClaim, computePayDate, entitlementOf, orgBudgetOf, payDateExplain } from "./rules";
import type { Claim } from "./types";

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

describe("สิทธิ์และวงเงิน", () => {
  it("ประกันส่วนเกิน: นับครั้งรวมที่รอดำเนินการ", () => {
    const e = entitlementOf(emp("EMP-0001"), ben("OPD"), db.claims, 2026, TODAY);
    expect(e.usage.pendingTimes).toBe(2);
    expect(e.remainingTimes).toBe(28);
    expect(e.maxNextClaim).toBe(1000);
  });
  it("ค่ารักษา: หักยอดที่จ่ายแล้ว", () => {
    const e = entitlementOf(emp("EMP-0001"), ben("MED"), db.claims, 2026, TODAY);
    expect(e.usage.usedAmount).toBe(2500);
    expect(e.remainingAmount).toBe(17500);
  });
  it("คำขอที่ไม่อนุมัติ = คืนสิทธิ์", () => {
    const e = entitlementOf(emp("EMP-0004"), ben("MED"), db.claims, 2026, TODAY);
    expect(e.remainingAmount).toBe(20000);
  });
  it("วงเงินตามประเภทพนักงาน (สัญญาจ้าง 10,000)", () => {
    const e = entitlementOf(emp("EMP-0003"), ben("MED"), db.claims, 2026, TODAY);
    expect(e.annualLimit).toBe(10000);
    expect(e.remainingAmount).toBe(8200);
  });
  it("ทดลองงานไม่มีสิทธิ์ค่ารักษา", () => {
    const e = entitlementOf(emp("EMP-0002"), ben("MED"), db.claims, 2026, TODAY);
    expect(e.eligible).toBe(false);
  });
  it("อายุงานไม่ถึง 365 วัน → ไม่มีสิทธิ์ค่าเล่าเรียนบุตร", () => {
    const e = { ...emp("EMP-0001"), startDate: "2026-06-01" };
    expect(entitlementOf(e, ben("EDU"), db.claims, 2026, TODAY).eligible).toBe(false);
  });
  it("ยอดปีใหม่เริ่มต้นใหม่ (ตัดยอดตามปีปฏิทิน)", () => {
    const e = entitlementOf(emp("EMP-0001"), ben("MED"), db.claims, 2027, "2027-01-10");
    expect(e.remainingAmount).toBe(20000);
  });
});

describe("checkClaim — ตรวจกติกาทันที", () => {
  const base = { employee: emp("EMP-0001"), today: TODAY, claims: db.claims };
  it("เกินวงเงินต่อครั้ง", () => {
    const r = checkClaim({ ...base, benefit: ben("OPD"), amount: 1500, receiptDate: "2026-10-29", docTypes: ["ใบเสร็จ"] });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("เบิกได้ไม่เกิน 1,000 บาท ต่อครั้ง");
  });
  it("ขาดเอกสาร", () => {
    const r = checkClaim({ ...base, benefit: ben("MED"), amount: 500, receiptDate: "2026-10-29", docTypes: ["ใบเสร็จ"] });
    expect(r.errors.some((x) => x.includes("ใบรับรองแพทย์"))).toBe(true);
  });
  it("วันที่ในอนาคต / เกินกำหนดยื่น", () => {
    expect(checkClaim({ ...base, benefit: ben("OPD"), amount: 100, receiptDate: "2026-11-10", docTypes: ["ใบเสร็จ"] }).ok).toBe(false);
    expect(checkClaim({ ...base, benefit: ben("OPD"), amount: 100, receiptDate: "2026-08-01", docTypes: ["ใบเสร็จ"] }).ok).toBe(false);
  });
  it("ผ่านเมื่อครบเงื่อนไข", () => {
    const r = checkClaim({ ...base, benefit: ben("OPD"), amount: 900, receiptDate: "2026-11-01", docTypes: ["ใบเสร็จ"] });
    expect(r.ok).toBe(true);
  });
  it("ใช้ครบจำนวนครั้ง", () => {
    const many: Claim[] = Array.from({ length: 30 }, (_, i) => ({
      ...db.claims[1],
      id: "x" + i,
      status: "paid",
    }));
    const r = checkClaim({ ...base, claims: many, benefit: ben("OPD"), amount: 100, receiptDate: "2026-11-01", docTypes: ["ใบเสร็จ"] });
    expect(r.errors.some((x) => x.includes("ครบ 30 ครั้ง"))).toBe(true);
  });
  it("พนักงานพ้นสภาพยื่นไม่ได้", () => {
    const r = checkClaim({ ...base, employee: emp("EMP-0005"), benefit: ben("DEN"), amount: 100, receiptDate: "2026-11-01", docTypes: ["ใบเสร็จ"] });
    expect(r.ok).toBe(false);
  });
});

describe("งบประมาณองค์กร และผู้อนุมัติ", () => {
  it("งบอัตโนมัติ = จำนวนคนมีสิทธิ์ × วงเงิน", () => {
    const b = orgBudgetOf(ben("DEN"), 2026, db.employees, db.claims, [], TODAY);
    expect(b.auto).toBe(true);
    expect(b.budget).toBe(b.eligibleCount * 3000);
    expect(b.used).toBe(1200);
  });
  it("งบที่ HR กำหนดทับค่าอัตโนมัติ", () => {
    const b = orgBudgetOf(ben("DEN"), 2026, db.employees, db.claims, [{ id: "x", year: 2026, benefitTypeId: "b-den", amount: 5000 }], TODAY);
    expect(b.budget).toBe(5000);
    expect(b.remaining).toBe(3800);
  });
  it("ผู้อนุมัติสำรองตามช่วงวัน", () => {
    const emps = structuredClone(db.employees);
    emps.find((e) => e.id === "e-0020")!.delegation = { employeeId: "e-0040", from: "2026-11-01", to: "2026-11-10" };
    expect(approversFor(emps.find((e) => e.id === "e-0001")!, emps, TODAY)).toEqual(["e-0020", "e-0040"]);
    expect(approversFor(emps.find((e) => e.id === "e-0001")!, emps, "2026-11-20")).toEqual(["e-0020"]);
  });
});
