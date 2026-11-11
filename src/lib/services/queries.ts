/**
 * Query helpers (อ่านอย่างเดียว ไม่แก้ข้อมูล) — ใช้ได้ทั้งฝั่งเซิร์ฟเวอร์และหน้าจอ
 */
import { todayLocal, yearOf } from "../domain/dates";
import { approversFor, checkClaim, claimValue, orgBudgetOf } from "../domain/rules";
import type { AttachmentMeta, Claim, Database, Employee } from "../domain/types";
import { can, requireEmployee, ServiceError } from "./core";

export interface ClaimInput {
  employeeId: string;
  benefitTypeId: string;
  amount: number;
  receiptDate: string;
  note?: string;
  attachments: AttachmentMeta[];
  fundRoundId?: string | null;
  /** ต้องระบุเมื่อ HR ยื่นแทน */
  onBehalfReason?: string;
}

export function openFundRound(db: Database, benefitTypeId: string, today = todayLocal()) {
  return db.fundRounds.find(
    (r) => r.benefitTypeId === benefitTypeId && r.status === "open" && r.openFrom <= today && r.openTo >= today,
  );
}

export function validateClaim(db: Database, input: ClaimInput, excludeClaimId?: string, today = todayLocal()) {
  const employee = requireEmployee(db, input.employeeId);
  const benefit = db.benefitTypes.find((b) => b.id === input.benefitTypeId);
  if (!benefit) throw new ServiceError("ไม่พบประเภทสวัสดิการ");
  const fundRound =
    benefit.mode === "assigned"
      ? (input.fundRoundId ? db.fundRounds.find((r) => r.id === input.fundRoundId) : openFundRound(db, benefit.id, today)) ?? null
      : null;
  const year = input.receiptDate ? yearOf(input.receiptDate) : yearOf(today);
  const orgBudget = orgBudgetOf(benefit, year, db.employees, db.claims.filter((c) => c.id !== excludeClaimId), db.budgets, today);
  const result = checkClaim({
    employee,
    benefit,
    amount: input.amount,
    receiptDate: input.receiptDate,
    docTypes: input.attachments.map((a) => a.docType),
    today,
    claims: db.claims,
    excludeClaimId,
    orgBudget,
    orgBudgetMode: db.settings.orgBudgetMode,
    fundRound,
  });
  if (!employee.managerId || approversFor(employee, db.employees, today).length === 0)
    result.errors.push("ยังไม่ได้กำหนดหัวหน้างานผู้อนุมัติ กรุณาติดต่อ HR");
  result.ok = result.errors.length === 0;
  return { ...result, employee, benefit, fundRound, orgBudget };
}


export function canApprove(db: Database, actor: Employee, c: Claim, today = todayLocal()) {
  if (!can(db, actor, "claim.approve")) return false;
  if (c.employeeId === actor.id) return false;
  const emp = db.employees.find((e) => e.id === c.employeeId);
  if (!emp) return false;
  return approversFor(emp, db.employees, today).includes(actor.id);
}


/** มุมมองสำหรับฝ่ายบัญชี — ไม่มีชื่อ ข้อมูลส่วนตัว หรือเอกสารสุขภาพ (PDPA) */
export interface PaymentRow {
  claimId: string;
  claimNo: string;
  employeeCode: string;
  department: string;
  benefitCode: string;
  benefitName: string;
  amount: number;
  payDate: string;
  approvedAt: string;
  status: "approved" | "paid";
  paidAt?: string | null;
  paymentRef?: string | null;
}

export function paymentRows(db: Database): PaymentRow[] {
  return db.claims
    .filter((c) => c.status === "approved" || c.status === "paid")
    .map((c) => {
      const e = db.employees.find((x) => x.id === c.employeeId);
      const b = db.benefitTypes.find((x) => x.id === c.benefitTypeId);
      return {
        claimId: c.id,
        claimNo: c.no,
        employeeCode: e?.code ?? "-",
        department: db.departments.find((d) => d.id === e?.departmentId)?.code ?? "-",
        benefitCode: b?.code ?? "-",
        benefitName: b?.name ?? "-",
        amount: claimValue(c, b),
        payDate: c.payDate ?? "-",
        approvedAt: c.approvedAt ?? "",
        status: c.status as "approved" | "paid",
        paidAt: c.paidAt,
        paymentRef: c.paymentRef,
      };
    });
}
