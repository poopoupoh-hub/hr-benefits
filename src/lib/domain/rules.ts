/**
 * Business rules (Application Layer) — ฟังก์ชันบริสุทธิ์ ไม่แตะ storage
 * มี unit test ครอบคลุม (src/lib/domain/rules.test.ts)
 */
import { IN_PROGRESS_STATUSES, RESERVING_STATUSES } from "./constants";
import { addDays, diffDays, isWeekend, lastDayOfMonth, parseISODate, yearOf } from "./dates";
import type { BenefitLimit, BenefitType, Claim, ClaimStatus, Employee, FundRound, ISODate, PaymentMethod, Position, Settings } from "./types";

/* ------------------------------------------------------------------ */
/* ระดับตำแหน่ง → วงเงิน                                                */
/* ------------------------------------------------------------------ */
export function levelOf(e: Pick<Employee, "positionId">, positions: Position[]): number {
  return positions.find((p) => p.id === e.positionId)?.level ?? 1;
}

/** เลือกวงเงินตาม level ของพนักงาน — ใช้ฉบับล่าสุดที่มีผลแล้ว (effectiveFrom <= วันที่อ้างอิง) */
export function resolveLimit(limits: BenefitLimit[], benefitId: string, level: number, onDate: ISODate): BenefitLimit | null {
  let best: BenefitLimit | null = null;
  for (const l of limits) {
    if (l.benefitId !== benefitId || level < l.minLevel || level > l.maxLevel || l.effectiveFrom > onDate) continue;
    if (!best || l.effectiveFrom > best.effectiveFrom || (l.effectiveFrom === best.effectiveFrom && l.createdAt >= best.createdAt)) best = l;
  }
  return best;
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

/** ยอดที่ใช้ไปในปี — นับต่อเนื่องแม้ย้ายตำแหน่งกลางปี (ไม่รีเซ็ต) */
export function usageOf(claims: Claim[], employeeId: string, benefitId: string, year: number, excludeClaimId?: string): Usage {
  const u: Usage = { usedAmount: 0, pendingAmount: 0, usedTimes: 0, pendingTimes: 0 };
  for (const c of claims) {
    if (c.id === excludeClaimId || c.employeeId !== employeeId || c.benefitTypeId !== benefitId) continue;
    if (claimYear(c) !== year || !RESERVING_STATUSES.includes(c.status)) continue;
    if (IN_PROGRESS_STATUSES.includes(c.status)) {
      u.pendingAmount += c.amountApproved;
      u.pendingTimes += 1;
    } else {
      u.usedAmount += c.amountApproved;
      u.usedTimes += 1;
    }
  }
  return u;
}

export interface ApprovedResult {
  approved: number;
  /** เหตุผลที่ยอดถูกตัด หรือที่เบิกไม่ได้ */
  reason: string | null;
}


/** ตัดยอดตามลำดับ: วงเงินต่อครั้ง → วงเงินคงเหลือต่อปี → จำนวนครั้ง */
export function computeApproved(
  requested: number,
  limit: Pick<BenefitLimit, "perClaim" | "perYear" | "maxCount"> | null,
  usedAmount: number,
  usedCount: number,
): ApprovedResult {
  if (!limit) return { approved: 0, reason: "ไม่มีวงเงินสำหรับระดับตำแหน่งนี้" };
  if (limit.maxCount != null && usedCount >= limit.maxCount) return { approved: 0, reason: `ใช้สิทธิ์ครบ ${limit.maxCount} ครั้งของปีนี้แล้ว` };
  if (limit.perYear != null && usedAmount >= limit.perYear) return { approved: 0, reason: "ใช้วงเงินต่อปีครบแล้ว" };
  if (!Number.isFinite(requested) || requested <= 0) return { approved: 0, reason: "กรุณากรอกยอดตามใบเสร็จ" };
  let approved = Math.round(requested * 100) / 100;
  let reason: string | null = null;
  if (limit.perClaim != null && approved > limit.perClaim) {
    approved = limit.perClaim;
    reason = "เกินวงเงินต่อครั้ง";
  }
  if (limit.perYear != null) {
    const remaining = Math.max(limit.perYear - usedAmount, 0);
    if (approved > remaining) {
      approved = remaining;
      reason = "เกินวงเงินคงเหลือต่อปี";
    }
  }
  return { approved, reason };
}

export function eligibility(e: Employee, b: BenefitType, today: ISODate): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!b.active) reasons.push("สวัสดิการนี้ปิดใช้งาน");
  if (!e.active || e.employmentType === "terminated") reasons.push("พนักงานพ้นสภาพ / ปิดสถานะ");
  else if (!b.eligibleTypes.includes(e.employmentType)) reasons.push("ประเภทพนักงานไม่มีสิทธิ์สวัสดิการนี้");
  if (e.contractEndDate && diffDays(today, e.contractEndDate) > 0) reasons.push("สัญญาจ้างสิ้นสุดแล้ว");
  if (b.minServiceDays && diffDays(today, e.startDate) < b.minServiceDays) reasons.push(`อายุงานไม่ถึง ${b.minServiceDays} วัน`);
  return { eligible: reasons.length === 0, reasons };
}

export interface Entitlement {
  eligible: boolean;
  reasons: string[];
  level: number;
  limit: BenefitLimit | null;
  perClaim: number | null;
  perYear: number | null;
  maxCount: number | null;
  usage: Usage;
  /** วงเงินคงเหลือต่อปี (หักทั้งที่ใช้แล้วและที่จองอยู่) — null = ไม่จำกัด */
  remainingAmount: number | null;
  remainingTimes: number | null;
}

export function entitlementOf(
  e: Employee,
  b: BenefitType,
  ctx: { claims: Claim[]; limits: BenefitLimit[]; positions: Position[] },
  year: number,
  today: ISODate,
  excludeClaimId?: string,
): Entitlement {
  const { eligible, reasons } = eligibility(e, b, today);
  const level = levelOf(e, ctx.positions);
  const limit = resolveLimit(ctx.limits, b.id, level, today);
  const usage = usageOf(ctx.claims, e.id, b.id, year, excludeClaimId);
  const reserved = usage.usedAmount + usage.pendingAmount;
  const times = usage.usedTimes + usage.pendingTimes;
  return {
    eligible,
    reasons,
    level,
    limit,
    perClaim: limit?.perClaim ?? null,
    perYear: limit?.perYear ?? null,
    maxCount: limit?.maxCount ?? null,
    usage,
    remainingAmount: limit?.perYear == null ? null : Math.max(0, limit.perYear - reserved),
    remainingTimes: limit?.maxCount == null ? null : Math.max(0, limit.maxCount - times),
  };
}

export function fundRoundUsage(round: FundRound, claims: Claim[]) {
  let assigned = 0;
  let count = 0;
  for (const c of claims) {
    if (c.fundRoundId !== round.id || !RESERVING_STATUSES.includes(c.status)) continue;
    assigned += c.amountApproved;
    count++;
  }
  return { assigned, count, remaining: round.budget - assigned };
}

/* ------------------------------------------------------------------ */
/* ตรวจสอบคำขอก่อนยื่น                                                 */
/* ------------------------------------------------------------------ */
export interface ClaimCheckInput {
  employee: Employee;
  benefit: BenefitType;
  amountRequested: number;
  receiptNo: string;
  vendorName: string;
  receiptDate: ISODate;
  docTypes: string[];
  today: ISODate;
  claims: Claim[];
  limits: BenefitLimit[];
  positions: Position[];
  excludeClaimId?: string;
  fundRound?: FundRound | null;
}

export interface ClaimCheck {
  ok: boolean;
  errors: string[];
  warnings: string[];
  entitlement: Entitlement;
  /** ยอดเบิกได้จริงที่คำนวณ (โหมด assigned = 0 จนกว่า HR กำหนด) */
  approved: number;
  /** เหตุผลที่ยอดถูกตัด / เบิกไม่ได้ */
  approvedReason: string | null;
}

export function checkClaim(i: ClaimCheckInput): ClaimCheck {
  const year = i.receiptDate ? yearOf(i.receiptDate) : yearOf(i.today);
  const ent = entitlementOf(i.employee, i.benefit, { claims: i.claims, limits: i.limits, positions: i.positions }, year, i.today, i.excludeClaimId);
  const errors: string[] = [...ent.reasons];
  const warnings: string[] = [];
  const assigned = i.benefit.mode === "assigned";

  if (!i.receiptDate) errors.push("กรุณาระบุวันที่ในเอกสาร");
  else {
    if (diffDays(i.receiptDate, i.today) > 0) errors.push("วันที่ในเอกสารต้องไม่เป็นวันในอนาคต");
    if (i.benefit.claimWindowDays && diffDays(i.today, i.receiptDate) > i.benefit.claimWindowDays)
      errors.push(`ต้องยื่นภายใน ${i.benefit.claimWindowDays} วันนับจากวันที่ในเอกสาร`);
  }

  let approved = 0;
  let approvedReason: string | null = null;
  if (!assigned) {
    if (!i.receiptNo.trim()) errors.push("กรุณากรอกเลขที่ใบเสร็จ");
    if (!i.vendorName.trim()) errors.push("กรุณากรอกชื่อร้าน / บริษัท / โรงพยาบาล");
    const used = ent.usage.usedAmount + ent.usage.pendingAmount;
    const times = ent.usage.usedTimes + ent.usage.pendingTimes;
    const r = computeApproved(i.amountRequested, ent.limit, used, times);
    approved = r.approved;
    approvedReason = r.reason;
    if (r.approved <= 0) errors.push(r.reason ?? "ยอดเบิกได้จริงเป็น 0");
  } else {
    if (!i.fundRound) errors.push("ยังไม่มีรอบงบที่เปิดรับสำหรับสวัสดิการนี้");
    else if (i.fundRound.status !== "open" || diffDays(i.today, i.fundRound.openTo) > 0 || diffDays(i.fundRound.openFrom, i.today) > 0)
      errors.push("รอบงบนี้ปิดรับคำร้องแล้ว");
    if (ent.remainingTimes === 0) errors.push("ยื่นครบจำนวนครั้งของปีนี้แล้ว");
  }

  const missing = i.benefit.requiredDocs.filter((d) => !i.docTypes.includes(d));
  if (missing.length) errors.push(`ต้องแนบเอกสาร: ${missing.join(", ")}`);

  return { ok: errors.length === 0, errors, warnings, entitlement: ent, approved, approvedReason };
}

/* ------------------------------------------------------------------ */
/* ใบเสร็จซ้ำ (เตือน HR — ไม่บล็อกการยื่น)                               */
/* ------------------------------------------------------------------ */
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export function findDuplicateReceipts(claims: Claim[], c: Pick<Claim, "id" | "receiptNo" | "vendorName">) {
  if (!norm(c.receiptNo) || !norm(c.vendorName)) return [];
  return claims.filter((x) => x.id !== c.id && norm(x.receiptNo) === norm(c.receiptNo) && norm(x.vendorName) === norm(c.vendorName));
}

/* ------------------------------------------------------------------ */
/* การจ่ายเงิน                                                          */
/* ------------------------------------------------------------------ */
export interface PaymentInput {
  method: PaymentMethod;
  paidAt: ISODate;
  transferRef?: string;
  chequeNo?: string;
  chequeDate?: ISODate;
  note?: string;
}

/** คืนข้อความ error ถ้าข้อมูลการจ่ายไม่ครบ, null ถ้าผ่าน */
export function paymentError(p: PaymentInput, today: ISODate): string | null {
  if (!["cash", "transfer", "cheque"].includes(p.method)) return "กรุณาเลือกวิธีจ่าย";
  if (!p.paidAt || !/^\d{4}-\d{2}-\d{2}$/.test(p.paidAt)) return "กรุณาระบุวันที่จ่าย";
  if (p.paidAt > today) return "วันที่จ่ายต้องไม่เป็นวันในอนาคต";
  if (p.method === "transfer" && !p.transferRef?.trim()) return "โอนเงินต้องกรอกเลขอ้างอิงการโอน";
  if (p.method === "cheque" && !p.chequeNo?.trim()) return "จ่ายด้วยเช็คต้องกรอกเลขที่เช็ค";
  if (p.method === "cheque" && !p.chequeDate) return "จ่ายด้วยเช็คต้องกรอกวันที่บนเช็ค";
  return null;
}

/* ------------------------------------------------------------------ */
/* คำนวณวันจ่ายเงิน                                                    */
/* ------------------------------------------------------------------ */
/**
 * อนุมัติภายในวันที่ cutoffDay → จ่ายสิ้นเดือนนั้น; หลังวันที่ cutoffDay → สิ้นเดือนถัดไป
 * ถ้าตรงวันหยุด/เสาร์-อาทิตย์ เลื่อนเป็นวันทำการก่อนหน้า
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
export const TRANSITIONS = {
  approve: { from: ["pending_hr"], to: "approved" },
  reject: { from: ["pending_hr"], to: "rejected" },
  return: { from: ["pending_hr"], to: "returned" },
  resubmit: { from: ["returned"], to: "pending_hr" },
  mark_paid: { from: ["approved"], to: "paid" },
} as const satisfies Record<string, { from: ClaimStatus[]; to: ClaimStatus }>;

export type TransitionAction = keyof typeof TRANSITIONS;

export function canTransition(action: TransitionAction, status: ClaimStatus) {
  return (TRANSITIONS[action].from as readonly ClaimStatus[]).includes(status);
}
