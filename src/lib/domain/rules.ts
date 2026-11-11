/**
 * Business rules (Application Layer) — ฟังก์ชันบริสุทธิ์ ไม่แตะ storage
 * ย้ายไปรันฝั่ง Backend ได้ทันที และมี unit test ครอบคลุม (src/lib/domain/rules.test.ts)
 */
import { IN_PROGRESS_STATUSES, RESERVING_STATUSES } from "./constants";
import { addDays, diffDays, isWeekend, lastDayOfMonth, parseISODate, yearOf } from "./dates";
import type {
  AnnualBudget,
  BenefitType,
  Claim,
  Employee,
  EmploymentType,
  FundRound,
  ISODate,
  Settings,
  TypeLimit,
} from "./types";

/* ------------------------------------------------------------------ */
/* วงเงินที่มีผลกับพนักงานแต่ละประเภท (ระดับพนักงาน → ระดับสวัสดิการ)   */
/* ------------------------------------------------------------------ */
export function effectiveLimits(b: BenefitType, t: EmploymentType): Required<TypeLimit> {
  const o = b.typeOverrides?.[t] ?? {};
  const pick = (v: number | null | undefined, fallback: number | null) =>
    v === undefined || v === null ? fallback : v;
  return {
    annualLimit: pick(o.annualLimit, b.annualLimit),
    perClaimLimit: pick(o.perClaimLimit, b.perClaimLimit),
    maxTimesPerYear: pick(o.maxTimesPerYear, b.maxTimesPerYear),
  };
}

/** ยอดเงินของคำขอที่ใช้คำนวณสิทธิ์ */
export function claimValue(c: Claim, b?: BenefitType): number {
  if (b?.mode === "assigned" || c.assignedAmount != null) return c.assignedAmount ?? 0;
  return c.amount;
}

export function claimYear(c: Pick<Claim, "receiptDate">): number {
  return yearOf(c.receiptDate);
}

export interface Usage {
  /** อนุมัติ/จ่ายแล้ว */
  usedAmount: number;
  /** อยู่ระหว่างดำเนินการ (จองสิทธิ์) */
  pendingAmount: number;
  usedTimes: number;
  pendingTimes: number;
}

export function usageOf(
  claims: Claim[],
  employeeId: string,
  benefit: BenefitType,
  year: number,
  excludeClaimId?: string,
): Usage {
  const u: Usage = { usedAmount: 0, pendingAmount: 0, usedTimes: 0, pendingTimes: 0 };
  for (const c of claims) {
    if (c.id === excludeClaimId) continue;
    if (c.employeeId !== employeeId || c.benefitTypeId !== benefit.id) continue;
    if (claimYear(c) !== year) continue;
    if (!RESERVING_STATUSES.includes(c.status)) continue;
    const v = claimValue(c, benefit);
    if (IN_PROGRESS_STATUSES.includes(c.status)) {
      u.pendingAmount += v;
      u.pendingTimes += 1;
    } else {
      u.usedAmount += v;
      u.usedTimes += 1;
    }
  }
  return u;
}

export interface Entitlement {
  eligible: boolean;
  reasons: string[];
  annualLimit: number | null;
  perClaimLimit: number | null;
  maxTimesPerYear: number | null;
  usage: Usage;
  /** วงเงินคงเหลือ (หักทั้งที่ใช้แล้วและที่จองอยู่) — null = ไม่จำกัด */
  remainingAmount: number | null;
  remainingTimes: number | null;
  /** ยื่นได้สูงสุดในครั้งถัดไป */
  maxNextClaim: number | null;
}

export function eligibility(e: Employee, b: BenefitType, today: ISODate): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!b.active) reasons.push("สวัสดิการนี้ปิดใช้งาน");
  if (!e.active || e.employmentType === "terminated") reasons.push("พนักงานพ้นสภาพ / ปิดสถานะ");
  else if (!b.eligibleTypes.includes(e.employmentType)) reasons.push("ประเภทพนักงานไม่มีสิทธิ์สวัสดิการนี้");
  if (e.contractEndDate && diffDays(today, e.contractEndDate) > 0) reasons.push("สัญญาจ้างสิ้นสุดแล้ว");
  if (b.minServiceDays && diffDays(today, e.startDate) < b.minServiceDays)
    reasons.push(`อายุงานไม่ถึง ${b.minServiceDays} วัน`);
  return { eligible: reasons.length === 0, reasons };
}

export function entitlementOf(
  e: Employee,
  b: BenefitType,
  claims: Claim[],
  year: number,
  today: ISODate,
  excludeClaimId?: string,
): Entitlement {
  const { eligible, reasons } = eligibility(e, b, today);
  const lim = effectiveLimits(b, e.employmentType);
  const usage = usageOf(claims, e.id, b, year, excludeClaimId);
  const reserved = usage.usedAmount + usage.pendingAmount;
  const times = usage.usedTimes + usage.pendingTimes;
  const remainingAmount = lim.annualLimit == null ? null : Math.max(0, lim.annualLimit - reserved);
  const remainingTimes = lim.maxTimesPerYear == null ? null : Math.max(0, lim.maxTimesPerYear - times);
  let maxNextClaim: number | null = null;
  if (remainingAmount != null) maxNextClaim = remainingAmount;
  if (lim.perClaimLimit != null) maxNextClaim = maxNextClaim == null ? lim.perClaimLimit : Math.min(maxNextClaim, lim.perClaimLimit);
  if (remainingTimes === 0) maxNextClaim = 0;
  return {
    eligible,
    reasons,
    annualLimit: lim.annualLimit,
    perClaimLimit: lim.perClaimLimit,
    maxTimesPerYear: lim.maxTimesPerYear,
    usage,
    remainingAmount,
    remainingTimes,
    maxNextClaim,
  };
}

/* ------------------------------------------------------------------ */
/* งบประมาณรายปีขององค์กร                                              */
/* ------------------------------------------------------------------ */
export interface OrgBudget {
  budget: number | null;
  auto: boolean;
  eligibleCount: number;
  used: number; // อนุมัติ + จ่าย
  paid: number;
  pending: number;
  remaining: number | null;
}

export function orgBudgetOf(
  b: BenefitType,
  year: number,
  employees: Employee[],
  claims: Claim[],
  budgets: AnnualBudget[],
  today: ISODate,
): OrgBudget {
  const eligibleEmps = employees.filter((e) => eligibility(e, b, today).eligible);
  const override = budgets.find((x) => x.year === year && x.benefitTypeId === b.id);
  let budget: number | null = null;
  let auto = true;
  if (override && override.amount != null) {
    budget = override.amount;
    auto = false;
  } else {
    const sum = eligibleEmps.reduce((s, e) => {
      const l = effectiveLimits(b, e.employmentType);
      if (l.annualLimit != null) return s + l.annualLimit;
      if (l.perClaimLimit != null && l.maxTimesPerYear != null) return s + l.perClaimLimit * l.maxTimesPerYear;
      return s;
    }, 0);
    budget = sum > 0 ? sum : null;
  }
  let used = 0,
    paid = 0,
    pending = 0;
  for (const c of claims) {
    if (c.benefitTypeId !== b.id || claimYear(c) !== year) continue;
    const v = claimValue(c, b);
    if (c.status === "approved") used += v;
    else if (c.status === "paid") {
      used += v;
      paid += v;
    } else if (IN_PROGRESS_STATUSES.includes(c.status)) pending += v;
  }
  return {
    budget,
    auto,
    eligibleCount: eligibleEmps.length,
    used,
    paid,
    pending,
    remaining: budget == null ? null : budget - used - pending,
  };
}

export function fundRoundUsage(round: FundRound, claims: Claim[]) {
  let assigned = 0;
  let count = 0;
  for (const c of claims) {
    if (c.fundRoundId !== round.id) continue;
    if (!RESERVING_STATUSES.includes(c.status)) continue;
    assigned += c.assignedAmount ?? 0;
    count++;
  }
  return { assigned, count, remaining: round.budget - assigned };
}

/* ------------------------------------------------------------------ */
/* ตรวจสอบคำขอก่อนยื่น (ตรวจกติกาทันที)                                */
/* ------------------------------------------------------------------ */
export interface ClaimCheckInput {
  employee: Employee;
  benefit: BenefitType;
  amount: number;
  receiptDate: ISODate;
  docTypes: string[];
  today: ISODate;
  claims: Claim[];
  excludeClaimId?: string;
  orgBudget?: OrgBudget;
  orgBudgetMode?: Settings["orgBudgetMode"];
  fundRound?: FundRound | null;
}

export interface ClaimCheck {
  ok: boolean;
  errors: string[];
  warnings: string[];
  entitlement: Entitlement;
}

const fmt = (n: number) => n.toLocaleString("th-TH");

export function checkClaim(i: ClaimCheckInput): ClaimCheck {
  const year = i.receiptDate ? yearOf(i.receiptDate) : yearOf(i.today);
  const ent = entitlementOf(i.employee, i.benefit, i.claims, year, i.today, i.excludeClaimId);
  const errors: string[] = [...ent.reasons];
  const warnings: string[] = [];
  const assigned = i.benefit.mode === "assigned";

  if (!i.receiptDate) errors.push("กรุณาระบุวันที่ในเอกสาร");
  else {
    if (diffDays(i.receiptDate, i.today) > 0) errors.push("วันที่ในเอกสารต้องไม่เป็นวันในอนาคต");
    if (i.benefit.claimWindowDays && diffDays(i.today, i.receiptDate) > i.benefit.claimWindowDays)
      errors.push(`ต้องยื่นภายใน ${i.benefit.claimWindowDays} วันนับจากวันที่ในเอกสาร`);
  }

  if (!assigned) {
    if (!(i.amount > 0)) errors.push("กรุณาระบุจำนวนเงินมากกว่า 0");
    if (ent.perClaimLimit != null && i.amount > ent.perClaimLimit)
      errors.push(`เบิกได้ไม่เกิน ${fmt(ent.perClaimLimit)} บาท ต่อครั้ง`);
    if (ent.remainingAmount != null && i.amount > ent.remainingAmount)
      errors.push(`เกินวงเงินคงเหลือปี ${year + 543} (${fmt(ent.remainingAmount)} บาท)`);
    if (ent.remainingTimes === 0) errors.push(`ใช้สิทธิ์ครบ ${ent.maxTimesPerYear} ครั้งในปีนี้แล้ว`);
    if (i.orgBudget && i.orgBudget.remaining != null && i.amount > i.orgBudget.remaining) {
      const msg = `งบประมาณองค์กรของสวัสดิการนี้คงเหลือ ${fmt(Math.max(0, i.orgBudget.remaining))} บาท`;
      if (i.orgBudgetMode === "block") errors.push(msg);
      else warnings.push(msg);
    }
  } else {
    if (!i.fundRound) errors.push("ยังไม่มีรอบงบที่เปิดรับสำหรับสวัสดิการนี้");
    else if (i.fundRound.status !== "open" || diffDays(i.today, i.fundRound.openTo) > 0 || diffDays(i.fundRound.openFrom, i.today) > 0)
      errors.push("รอบงบนี้ปิดรับคำร้องแล้ว");
    if (ent.remainingTimes === 0) errors.push("ยื่นครบจำนวนครั้งของปีนี้แล้ว");
  }

  const missing = i.benefit.requiredDocs.filter((d) => !i.docTypes.includes(d));
  if (missing.length) errors.push(`ต้องแนบเอกสาร: ${missing.join(", ")}`);

  return { ok: errors.length === 0, errors, warnings, entitlement: ent };
}

/* ------------------------------------------------------------------ */
/* คำนวณวันจ่ายเงิน                                                    */
/* ------------------------------------------------------------------ */
/**
 * กติกา (สไลด์ 10, 14): อนุมัติ/เอกสารครบภายในวันที่ cutoffDay → จ่ายสิ้นเดือนนั้น
 * หลังวันที่ cutoffDay → สิ้นเดือนถัดไป; ถ้าตรงวันหยุด/เสาร์-อาทิตย์ เลื่อนเป็นวันทำการก่อนหน้า
 */
export function computePayDate(decisionDate: ISODate, settings: Pick<Settings, "cutoffDay" | "holidays">): ISODate {
  const d = parseISODate(decisionDate);
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth() + 1;
  if (d.getUTCDate() > settings.cutoffDay) {
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return shiftToWorkingDay(lastDayOfMonth(y, m), settings.holidays.map((h) => h.date));
}

export function shiftToWorkingDay(d: ISODate, holidays: ISODate[]): ISODate {
  let x = d;
  let guard = 0;
  while ((isWeekend(x) || holidays.includes(x)) && guard++ < 31) x = addDays(x, -1);
  return x;
}

export function payDateExplain(decisionDate: ISODate, settings: Pick<Settings, "cutoffDay" | "holidays">) {
  const d = parseISODate(decisionDate);
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth() + 1;
  const late = d.getUTCDate() > settings.cutoffDay;
  if (late) {
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  const nominal = lastDayOfMonth(y, m);
  const actual = shiftToWorkingDay(nominal, settings.holidays.map((h) => h.date));
  const holiday = settings.holidays.find((h) => h.date === nominal);
  return {
    late,
    nominal,
    actual,
    shifted: nominal !== actual,
    reason: nominal !== actual ? (holiday ? `ตรงวันหยุด (${holiday.name})` : "ตรงวันเสาร์-อาทิตย์") : null,
  };
}

/* ------------------------------------------------------------------ */
/* Workflow — การเปลี่ยนสถานะที่อนุญาต                                 */
/* ------------------------------------------------------------------ */
export const TRANSITIONS: Record<string, { from: Claim["status"][]; to: Claim["status"] }> = {
  hr_pass: { from: ["pending_hr"], to: "pending_manager" },
  hr_return: { from: ["pending_hr", "pending_manager"], to: "returned" },
  hr_reject: { from: ["pending_hr"], to: "rejected" },
  resubmit: { from: ["returned"], to: "pending_hr" },
  approve: { from: ["pending_manager"], to: "approved" },
  reject: { from: ["pending_manager"], to: "rejected" },
  mark_paid: { from: ["approved"], to: "paid" },
  cancel: { from: ["pending_hr", "returned"], to: "cancelled" },
};

export function canTransition(action: keyof typeof TRANSITIONS, status: Claim["status"]) {
  return TRANSITIONS[action].from.includes(status);
}

/** ผู้อนุมัติของคำขอ: หัวหน้าสายตรง หรือผู้อนุมัติสำรองในช่วงที่มอบหมาย */
export function approversFor(emp: Employee, employees: Employee[], today: ISODate): string[] {
  if (!emp.managerId) return [];
  const mgr = employees.find((x) => x.id === emp.managerId);
  if (!mgr) return [];
  const ids = [mgr.id];
  const del = mgr.delegation;
  if (del && diffDays(today, del.from) >= 0 && diffDays(del.to, today) >= 0) ids.push(del.employeeId);
  return ids;
}
