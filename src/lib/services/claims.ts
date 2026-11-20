/**
 * Claim service — workflow:
 * พนักงานยื่น → HR / หัวหน้า HR ตรวจ (อนุมัติ / ไม่อนุมัติ / ส่งกลับ) → บัญชีบันทึกการจ่าย
 * ทุกคำสั่งตรวจสิทธิ์ตาม Role + ลำดับสถานะ (TRANSITIONS) ก่อนเสมอ แล้วลง Audit Log
 */
import { PAYMENT_METHOD_LABEL, STATUS_LABEL } from "../domain/constants";
import { beYear, dateOf, todayLocal, yearOf } from "../domain/dates";
import { canTransition, computePayDate, fundRoundUsage, paymentError, type PaymentInput } from "../domain/rules";
import type { Claim, ClaimEvent, Database, Employee, Payment } from "../domain/types";
import { commit, getDB, uid } from "../data/db";
import { assertCan, logAudit, nowISO, requireEmployee, sendEmail, ServiceError } from "./core";
import { hasPendingChange, validateClaim, type ClaimInput } from "./queries";

export { paymentRows, validateClaim, openFundRound, type PaymentRow, type ClaimInput } from "./queries";

const money = (n: number) => `${n.toLocaleString("th-TH")} บาท`;

function pushEvent(c: Claim, actor: Employee, action: ClaimEvent["action"], toStatus: Claim["status"], note?: string) {
  c.history.push({ at: nowISO(), actorId: actor.id, action, fromStatus: c.status, toStatus, note });
  c.status = toStatus;
}

function nextClaimNo(db: Database) {
  const y = yearOf(todayLocal());
  const key = `claim_${y}`;
  db.counters[key] = (db.counters[key] ?? 0) + 1;
  return `CLM-${beYear(y)}-${String(db.counters[key]).padStart(4, "0")}`;
}

function getClaim(db: Database, id: string) {
  const c = db.claims.find((x) => x.id === id);
  if (!c) throw new ServiceError("ไม่พบคำขอ");
  return c;
}

const claimState = (c: Claim) => ({ status: c.status, amountRequested: c.amountRequested, amountApproved: c.amountApproved, payDate: c.payDate ?? null });

export function submitClaim(actorId: string, input: ClaimInput): Claim {
  return commit((db) => {
    const actor = requireEmployee(db, actorId);
    assertCan(db, actor, "self.claim");
    const v = validateClaim(db, actor.id, input);
    if (!v.ok) throw new ServiceError(v.errors.join("\n"));
    const assigned = v.benefit.mode === "assigned";
    const c: Claim = {
      id: uid("c"),
      no: nextClaimNo(db),
      employeeId: actor.id,
      benefitTypeId: v.benefit.id,
      fundRoundId: v.fundRound?.id ?? null,
      receiptNo: input.receiptNo.trim(),
      vendorName: input.vendorName.trim(),
      amountRequested: assigned ? 0 : Math.round(Number(input.amountRequested) * 100) / 100,
      amountApproved: assigned ? 0 : v.approved,
      receiptDate: input.receiptDate,
      note: input.note?.trim() || undefined,
      attachments: input.attachments,
      status: "pending_hr",
      submittedAt: nowISO(),
      history: [],
    };
    c.history.push({ at: c.submittedAt, actorId: actor.id, action: "submit", toStatus: c.status, note: v.approvedReason ? `ยอดถูกตัด: ${v.approvedReason}` : undefined });
    db.claims.unshift(c);
    logAudit(db, actor, {
      action: "submit",
      entity: "claim",
      entityId: c.id,
      summary: `${c.no}: ยื่นคำขอ${v.benefit.name} ${assigned ? "(รอ HR กำหนดยอด)" : `ขอ ${money(c.amountRequested)} เบิกได้ ${money(c.amountApproved)}`}`,
      after: claimState(c),
    });
    sendEmail(db, { to: [actor.email], subject: `${c.no} ได้รับคำขอแล้ว`, body: `ระบบได้รับคำขอเบิก${v.benefit.name} ของคุณแล้ว สถานะ: ${STATUS_LABEL[c.status]}`, event: "submit" });
    sendEmail(db, { to: [db.settings.email.hrInbox], subject: `${c.no} รอ HR ตรวจ`, body: `มีคำขอใหม่จาก ${actor.code} (${v.benefit.name}) รอตรวจ`, event: "pending_hr" });
    return c;
  });
}

/** แก้ไขคำขอ (ก่อน HR ตรวจ) หรือแก้ไขแล้วส่งใหม่ (สถานะส่งกลับแก้ไข) — เฉพาะเจ้าของคำขอ */
export function updateClaim(actorId: string, claimId: string, patch: Omit<ClaimInput, "benefitTypeId" | "fundRoundId">): Claim {
  return commit((db) => {
    const actor = requireEmployee(db, actorId);
    assertCan(db, actor, "self.claim");
    const c = getClaim(db, claimId);
    if (c.employeeId !== actor.id) throw new ServiceError("แก้ไขได้เฉพาะเจ้าของคำขอ");
    if (c.status !== "pending_hr" && !canTransition("resubmit", c.status)) throw new ServiceError("แก้ไขได้เฉพาะคำขอที่ยังไม่ผ่านการตรวจ หรือถูกส่งกลับแก้ไข");
    const v = validateClaim(db, actor.id, { ...patch, benefitTypeId: c.benefitTypeId, fundRoundId: c.fundRoundId }, c.id);
    if (!v.ok) throw new ServiceError(v.errors.join("\n"));
    const before = claimState(c);
    const assigned = v.benefit.mode === "assigned";
    c.receiptNo = patch.receiptNo.trim();
    c.vendorName = patch.vendorName.trim();
    c.amountRequested = assigned ? 0 : Math.round(Number(patch.amountRequested) * 100) / 100;
    c.amountApproved = assigned ? 0 : v.approved;
    c.receiptDate = patch.receiptDate;
    c.note = patch.note?.trim() || undefined;
    c.attachments = patch.attachments;
    const resubmit = c.status === "returned";
    if (resubmit) {
      pushEvent(c, actor, "resubmit", "pending_hr", "แก้ไขแล้วส่งใหม่");
      c.returnReason = null;
      sendEmail(db, { to: [db.settings.email.hrInbox], subject: `${c.no} แก้ไขแล้วส่งใหม่`, body: `คำขอ ${c.no} ถูกแก้ไขและส่งกลับมาตรวจอีกครั้ง`, event: "resubmit" });
    } else c.history.push({ at: nowISO(), actorId: actor.id, action: "edit", note: "แก้ไขคำขอ" });
    logAudit(db, actor, {
      action: resubmit ? "resubmit" : "update",
      entity: "claim",
      entityId: c.id,
      summary: `${c.no}: ${resubmit ? "แก้ไขแล้วส่งใหม่" : "แก้ไขคำขอ"}`,
      before,
      after: claimState(c),
    });
    return c;
  });
}

/** ตรวจกติกาก่อนยื่น (ไม่บันทึก) — หน้าจอเรียกเพื่อแสดงยอดเบิกได้จริงแบบ real-time */
export function validateClaimFor(actorId: string, input: ClaimInput, excludeClaimId?: string) {
  const db = getDB();
  const actor = requireEmployee(db, actorId);
  assertCan(db, actor, "self.claim");
  const v = validateClaim(db, actor.id, input, excludeClaimId);
  return {
    ok: v.ok,
    errors: v.errors,
    warnings: v.warnings,
    entitlement: v.entitlement,
    approved: v.approved,
    approvedReason: v.approvedReason,
    fundRound: v.fundRound ? { id: v.fundRound.id, name: v.fundRound.name, openTo: v.fundRound.openTo, maxPerPerson: v.fundRound.maxPerPerson } : null,
  };
}
export type ClaimValidation = ReturnType<typeof validateClaimFor>;

/* ------------------------- HR / หัวหน้า HR ------------------------- */
function reviewable(db: Database, actor: Employee, c: Claim) {
  assertCan(db, actor, "claim.review");
  if (c.employeeId === actor.id) throw new ServiceError("ไม่สามารถพิจารณาคำขอของตนเองได้");
}

/** คำนวณยอดเบิกได้จริงใหม่ ณ ตอนพิจารณา (กติกา/ยอดใช้อาจเปลี่ยนระหว่างทาง) */
export function recomputeApproved(db: Database, c: Claim, opts: { assignedAmount?: number } = {}) {
  const benefit = db.benefitTypes.find((b) => b.id === c.benefitTypeId)!;
  if (benefit.mode === "assigned") {
    const amt = Number(opts.assignedAmount);
    if (!(amt > 0)) throw new ServiceError("กรุณากำหนดจำนวนเงินช่วยเหลือ");
    const round = db.fundRounds.find((r) => r.id === c.fundRoundId);
    if (!round) throw new ServiceError("ไม่พบรอบงบของคำขอนี้");
    if (round.maxPerPerson != null && amt > round.maxPerPerson) throw new ServiceError(`เกินวงเงินสูงสุดต่อคนของรอบ (${money(round.maxPerPerson)})`);
    const u = fundRoundUsage(round, db.claims.filter((x) => x.id !== c.id));
    if (amt > u.remaining) throw new ServiceError(`งบคงเหลือของรอบไม่พอ (คงเหลือ ${money(u.remaining)})`);
    return amt;
  }
  const v = validateClaim(
    db,
    c.employeeId,
    { benefitTypeId: c.benefitTypeId, receiptNo: c.receiptNo, vendorName: c.vendorName, amountRequested: c.amountRequested, receiptDate: c.receiptDate, attachments: c.attachments, fundRoundId: c.fundRoundId },
    c.id,
    dateOf(c.submittedAt),
  );
  if (!v.ok) throw new ServiceError("ไม่ผ่านการตรวจสิทธิ์อัตโนมัติ:\n" + v.errors.join("\n"));
  return v.approved;
}

export function approveClaim(actorId: string, claimId: string, opts: { assignedAmount?: number; note?: string } = {}) {
  return commit((db) => {
    const actor = requireEmployee(db, actorId);
    const c = getClaim(db, claimId);
    reviewable(db, actor, c);
    if (!canTransition("approve", c.status)) throw new ServiceError("คำขอนี้ไม่ได้อยู่ในสถานะรอ HR ตรวจ");
    const before = claimState(c);
    c.amountApproved = recomputeApproved(db, c, opts);
    c.decidedById = actor.id;
    c.decidedAt = nowISO();
    c.payDate = computePayDate(todayLocal(), db.settings);
    pushEvent(c, actor, "approve", "approved", opts.note?.trim() || undefined);
    const emp = requireEmployee(db, c.employeeId);
    const benefit = db.benefitTypes.find((b) => b.id === c.benefitTypeId)!;
    logAudit(db, actor, {
      action: "approve",
      entity: "claim",
      entityId: c.id,
      summary: `${c.no}: อนุมัติ ${money(c.amountApproved)} — กำหนดจ่าย ${c.payDate}`,
      before,
      after: claimState(c),
    });
    sendEmail(db, { to: [emp.email], subject: `${c.no} อนุมัติแล้ว`, body: `คำขอเบิก${benefit.name} ${money(c.amountApproved)} ได้รับการอนุมัติ คาดว่าเงินเข้า ${c.payDate}`, event: "approve" });
    sendEmail(db, { to: [db.settings.email.financeInbox], subject: `${c.no} อนุมัติแล้ว รอจ่าย`, body: `${emp.code} · ${money(c.amountApproved)} · รอบจ่าย ${c.payDate}`, event: "approve" });
    return c;
  });
}

export function rejectClaim(actorId: string, claimId: string, reason: string) {
  return commit((db) => {
    const actor = requireEmployee(db, actorId);
    const c = getClaim(db, claimId);
    reviewable(db, actor, c);
    if (!canTransition("reject", c.status)) throw new ServiceError("ไม่อนุมัติได้เฉพาะคำขอที่รอ HR ตรวจ");
    if (!reason?.trim()) throw new ServiceError("กรุณาระบุเหตุผลที่ไม่อนุมัติ");
    const before = claimState(c);
    c.decidedById = actor.id;
    c.decidedAt = nowISO();
    c.rejectReason = reason.trim();
    pushEvent(c, actor, "reject", "rejected", reason.trim());
    const emp = requireEmployee(db, c.employeeId);
    logAudit(db, actor, { action: "reject", entity: "claim", entityId: c.id, summary: `${c.no}: ไม่อนุมัติ (คืนสิทธิ์) — ${reason.trim()}`, before, after: claimState(c) });
    sendEmail(db, { to: [emp.email], subject: `${c.no} ไม่อนุมัติ`, body: `เหตุผล: ${reason}\nสิทธิ์ของคุณถูกคืนแล้ว`, event: "reject" });
    return c;
  });
}

export function returnClaim(actorId: string, claimId: string, reason: string) {
  return commit((db) => {
    const actor = requireEmployee(db, actorId);
    const c = getClaim(db, claimId);
    reviewable(db, actor, c);
    if (!canTransition("return", c.status)) throw new ServiceError("ส่งกลับได้เฉพาะคำขอที่รอ HR ตรวจ");
    if (!reason?.trim()) throw new ServiceError("กรุณาระบุเหตุผลที่ส่งกลับแก้ไข");
    const before = claimState(c);
    c.returnReason = reason.trim();
    pushEvent(c, actor, "return", "returned", reason.trim());
    const emp = requireEmployee(db, c.employeeId);
    logAudit(db, actor, { action: "return", entity: "claim", entityId: c.id, summary: `${c.no}: ส่งกลับแก้ไข — ${reason.trim()}`, before, after: claimState(c) });
    sendEmail(db, { to: [emp.email], subject: `${c.no} ถูกส่งกลับแก้ไข`, body: `เหตุผล: ${reason}\nกรุณาแก้ไขและส่งคำขออีกครั้ง`, event: "return" });
    return c;
  });
}

/* ----------------------------- บัญชี ----------------------------- */
/** บันทึกการจ่ายรายคำขอ — วิธีจ่าย + เลขอ้างอิงตามวิธี */
export function recordPayment(actorId: string, claimId: string, input: PaymentInput) {
  return commit((db) => {
    const actor = requireEmployee(db, actorId);
    assertCan(db, actor, "payment.record");
    const c = getClaim(db, claimId);
    if (!canTransition("mark_paid", c.status)) throw new ServiceError(`${c.no} ไม่ได้อยู่ในสถานะรอจ่าย`);
    if (hasPendingChange(db, c.id)) throw new ServiceError(`${c.no} มีคำขอแก้ผลค้างอยู่ ยังบันทึกการจ่ายไม่ได้`);
    const err = paymentError(input, todayLocal());
    if (err) throw new ServiceError(err);
    const p: Payment = {
      claimId: c.id,
      method: input.method,
      paidAt: input.paidAt,
      transferRef: input.method === "transfer" ? input.transferRef!.trim() : null,
      chequeNo: input.method === "cheque" ? input.chequeNo!.trim() : null,
      chequeDate: input.method === "cheque" ? input.chequeDate! : null,
      recordedBy: actor.id,
      recordedAt: nowISO(),
      note: input.note?.trim() || null,
    };
    db.payments.push(p);
    const ref = p.transferRef ?? p.chequeNo;
    pushEvent(c, actor, "mark_paid", "paid", `${PAYMENT_METHOD_LABEL[p.method]}${ref ? ` · ${ref}` : ""}`);
    const emp = requireEmployee(db, c.employeeId);
    logAudit(db, actor, {
      action: "record_payment",
      entity: "payment",
      entityId: c.id,
      summary: `${c.no}: บันทึกการจ่าย ${money(c.amountApproved)} (${PAYMENT_METHOD_LABEL[p.method]}${ref ? ` ${ref}` : ""})`,
      before: { status: "approved" },
      after: { status: "paid", method: p.method, paidAt: p.paidAt, transferRef: p.transferRef, chequeNo: p.chequeNo, chequeDate: p.chequeDate, amount: c.amountApproved },
    });
    sendEmail(db, { to: [emp.email], subject: `${c.no} จ่ายเงินแล้ว`, body: `จ่ายเงิน ${money(c.amountApproved)} แล้ว (${PAYMENT_METHOD_LABEL[p.method]}${ref ? ` อ้างอิง ${ref}` : ""})`, event: "mark_paid" });
    return p;
  });
}
