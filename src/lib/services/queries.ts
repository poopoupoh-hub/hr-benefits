/**
 * Query helpers (อ่านอย่างเดียว ไม่แก้ข้อมูล) — ใช้ได้ทั้งฝั่งเซิร์ฟเวอร์และหน้าจอ
 */
import { todayLocal } from "../domain/dates";
import { checkClaim } from "../domain/rules";
import type { AttachmentMeta, Database, PaymentMethod } from "../domain/types";
import { requireEmployee, ServiceError } from "./core";

export interface ClaimInput {
  benefitTypeId: string;
  receiptNo: string;
  vendorName: string;
  amountRequested: number;
  receiptDate: string;
  note?: string;
  attachments: AttachmentMeta[];
  fundRoundId?: string | null;
}

export function openFundRound(db: Database, benefitTypeId: string, today = todayLocal()) {
  return db.fundRounds.find((r) => r.benefitTypeId === benefitTypeId && r.status === "open" && r.openFrom <= today && r.openTo >= today);
}

export function validateClaim(db: Database, employeeId: string, input: ClaimInput, excludeClaimId?: string, today = todayLocal()) {
  const employee = requireEmployee(db, employeeId);
  const benefit = db.benefitTypes.find((b) => b.id === input.benefitTypeId);
  if (!benefit) throw new ServiceError("ไม่พบประเภทสวัสดิการ");
  const fundRound =
    benefit.mode === "assigned"
      ? ((input.fundRoundId ? db.fundRounds.find((r) => r.id === input.fundRoundId) : openFundRound(db, benefit.id, today)) ?? null)
      : null;
  const result = checkClaim({
    employee,
    benefit,
    amountRequested: Number(input.amountRequested),
    receiptNo: input.receiptNo ?? "",
    vendorName: input.vendorName ?? "",
    receiptDate: input.receiptDate,
    docTypes: input.attachments.map((a) => a.docType),
    today,
    claims: db.claims,
    limits: db.benefitLimits,
    positions: db.positions,
    excludeClaimId,
    fundRound,
  });
  return { ...result, employee, benefit, fundRound };
}

/** มุมมองสำหรับฝ่ายบัญชี — ไม่มีชื่อ ข้อมูลส่วนตัว หรือเอกสารสุขภาพ (PDPA) */
export interface PaymentRow {
  claimId: string;
  claimNo: string;
  employeeCode: string;
  department: string;
  benefitCode: string;
  benefitName: string;
  receiptNo: string;
  vendorName: string;
  amountApproved: number;
  payDate: string;
  decidedAt: string;
  status: "approved" | "paid";
  /** มีคำขอแก้ผลค้างอยู่ → ล็อกการจ่าย */
  locked: boolean;
  method?: PaymentMethod | null;
  paidAt?: string | null;
  ref?: string | null;
}

export function paymentRows(db: Database): PaymentRow[] {
  return db.claims
    .filter((c) => c.status === "approved" || c.status === "paid")
    .map((c) => {
      const e = db.employees.find((x) => x.id === c.employeeId);
      const b = db.benefitTypes.find((x) => x.id === c.benefitTypeId);
      const p = db.payments.find((x) => x.claimId === c.id);
      return {
        claimId: c.id,
        claimNo: c.no,
        employeeCode: e?.code ?? "-",
        department: db.departments.find((d) => d.id === e?.departmentId)?.code ?? "-",
        benefitCode: b?.code ?? "-",
        benefitName: b?.name ?? "-",
        receiptNo: c.receiptNo,
        vendorName: c.vendorName,
        amountApproved: c.amountApproved,
        payDate: c.payDate ?? "-",
        decidedAt: c.decidedAt ?? "",
        status: c.status as "approved" | "paid",
        locked: db.changeRequests.some((r) => r.kind === "claim_status" && r.targetId === c.id && r.status === "pending"),
        method: p?.method ?? null,
        paidAt: p?.paidAt ?? null,
        ref: p?.transferRef ?? p?.chequeNo ?? null,
      };
    });
}

export function hasPendingChange(db: Database, claimId: string) {
  return db.changeRequests.some((r) => r.kind === "claim_status" && r.targetId === claimId && r.status === "pending");
}
