/**
 * Claim service — Common Workflow (สไลด์ 6):
 * สร้างคำขอ → ตรวจสอบสิทธิ์ → แนบเอกสาร → HR ตรวจ → หัวหน้าอนุมัติ → บัญชีบันทึกจ่าย
 */
import { STATUS_LABEL } from "../domain/constants";
import { beYear, dateOf, todayLocal, yearOf } from "../domain/dates";
import { canApprove, validateClaim } from "./queries";
export { canApprove, paymentRows, validateClaim, openFundRound, type PaymentRow } from "./queries";
import { approversFor, canTransition, claimValue, computePayDate, fundRoundUsage } from "../domain/rules";
import type { Claim, ClaimEvent, Database, Employee } from "../domain/types";
import { commit, getDB, uid } from "../data/db";
import { verifySecret } from "../security/hash";
import { assertCan, audit, can, fullName, nowISO, requireEmployee, sendEmail, ServiceError } from "./core";

export type { ClaimInput } from "./queries";
import type { ClaimInput } from "./queries";
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

/** ผู้ยื่นเป็น HR → ข้ามขั้น HR ตรวจ (ห้ามตรวจคำขอตัวเอง) */
function skipsHrReview(db: Database, emp: Employee) {
  return can(db, emp, "claim.review");
}

export function submitClaim(actorId: string, input: ClaimInput): Claim {
  return commit((db) => {
    const actor = requireEmployee(db, actorId);
    const onBehalf = input.employeeId !== actor.id;
    if (onBehalf) {
      assertCan(db, actor, "claim.file_on_behalf");
      if (!input.onBehalfReason?.trim()) throw new ServiceError("กรุณาระบุเหตุผลที่ยื่นแทน");
    } else assertCan(db, actor, "self.claim");

    const v = validateClaim(db, input);
    if (!v.ok) throw new ServiceError(v.errors.join("\n"));

    const skip = !onBehalf && skipsHrReview(db, v.employee);
    const c: Claim = {
      id: uid("c"),
      no: nextClaimNo(db),
      employeeId: v.employee.id,
      benefitTypeId: v.benefit.id,
      fundRoundId: v.fundRound?.id ?? null,
      amount: v.benefit.mode === "assigned" ? 0 : Math.round(input.amount * 100) / 100,
      assignedAmount: null,
      receiptDate: input.receiptDate,
      note: input.note?.trim() || undefined,
      attachments: input.attachments,
      status: skip ? "pending_manager" : "pending_hr",
      submittedAt: nowISO(),
      docsCompleteAt: skip ? nowISO() : null,
      filedById: onBehalf ? actor.id : null,
      filedReason: onBehalf ? input.onBehalfReason!.trim() : null,
      history: [],
    };
    c.history.push({
      at: c.submittedAt,
      actorId: actor.id,
      action: "submit",
      toStatus: c.status,
      note: onBehalf
        ? `HR ยื่นแทน: ${c.filedReason}`
        : skip
          ? "ผู้ยื่นเป็น HR — ข้ามขั้น HR ตรวจ ส่งหัวหน้าตรวจเอกสารและอนุมัติ"
          : undefined,
    });
    db.claims.unshift(c);

    audit(db, actor, {
      action: onBehalf ? "file_on_behalf" : "submit",
      entity: "claim",
      entityId: c.id,
      summary: `${c.no}: ยื่นคำขอ${v.benefit.name} ${v.benefit.mode === "assigned" ? "(รอ HR กำหนดยอด)" : money(c.amount)}${onBehalf ? ` แทน ${fullName(v.employee)}` : ""}`,
      after: { status: c.status, amount: c.amount, benefit: v.benefit.code, filedBy: c.filedById },
    });
    sendEmail(db, {
      to: [v.employee.email],
      subject: `${c.no} ได้รับคำขอแล้ว`,
      body: `ระบบได้รับคำขอเบิก${v.benefit.name} ${v.benefit.mode === "assigned" ? "" : money(c.amount)} ของคุณแล้ว สถานะ: ${STATUS_LABEL[c.status]}`,
      event: "submit",
    });
    if (skip) {
      const approvers = approversFor(v.employee, db.employees, todayLocal()).map((id) => requireEmployee(db, id).email);
      sendEmail(db, { to: approvers, subject: `${c.no} รอการอนุมัติ`, body: `${fullName(v.employee)} ยื่นเบิก${v.benefit.name} ${money(c.amount)} รอคุณพิจารณา`, event: "pending_manager" });
    } else
      sendEmail(db, { to: [db.settings.email.hrInbox], subject: `${c.no} รอ HR ตรวจ`, body: `มีคำขอใหม่จาก ${v.employee.code} (${v.benefit.name}) รอตรวจเอกสาร`, event: "pending_hr" });
    return c;
  });
}

/** แก้ไขคำขอ (ก่อน HR ตรวจ) หรือแก้ไขแล้วส่งใหม่ (สถานะส่งกลับแก้ไข) */
export function updateClaim(actorId: string, claimId: string, patch: Omit<ClaimInput, "employeeId" | "benefitTypeId">): Claim {
  return commit((db) => {
    const actor = requireEmployee(db, actorId);
    const c = getClaim(db, claimId);
    const isOwner = c.employeeId === actor.id;
    const isFiler = c.filedById === actor.id && can(db, actor, "claim.file_on_behalf");
    if (!isOwner && !isFiler) throw new ServiceError("แก้ไขได้เฉพาะผู้ยื่นคำขอ");
    if (!["pending_hr", "returned"].includes(c.status)) throw new ServiceError("แก้ไขได้เฉพาะคำขอที่ยังไม่ผ่านการตรวจ หรือถูกส่งกลับแก้ไข");

    const input: ClaimInput = { ...patch, employeeId: c.employeeId, benefitTypeId: c.benefitTypeId, fundRoundId: c.fundRoundId };
    const v = validateClaim(db, input, c.id);
    if (!v.ok) throw new ServiceError(v.errors.join("\n"));
    const before = { amount: c.amount, receiptDate: c.receiptDate, note: c.note, attachments: c.attachments.map((a) => a.name) };
    c.amount = v.benefit.mode === "assigned" ? 0 : patch.amount;
    c.receiptDate = patch.receiptDate;
    c.note = patch.note?.trim() || undefined;
    c.attachments = patch.attachments;
    const wasReturned = c.status === "returned";
    if (wasReturned) {
      const emp = requireEmployee(db, c.employeeId);
      const skip = isOwner && skipsHrReview(db, emp);
      pushEvent(c, actor, "resubmit", skip ? "pending_manager" : "pending_hr", "แก้ไขแล้วส่งใหม่");
      c.returnReason = null;
      sendEmail(db, { to: [db.settings.email.hrInbox], subject: `${c.no} แก้ไขแล้วส่งใหม่`, body: `คำขอ ${c.no} ถูกแก้ไขและส่งกลับมาตรวจอีกครั้ง`, event: "resubmit" });
    } else c.history.push({ at: nowISO(), actorId: actor.id, action: "edit", note: "แก้ไขคำขอ" });
    audit(db, actor, {
      action: wasReturned ? "resubmit" : "update",
      entity: "claim",
      entityId: c.id,
      summary: `${c.no}: ${wasReturned ? "แก้ไขแล้วส่งใหม่" : "แก้ไขคำขอ"}`,
      before,
      after: { amount: c.amount, receiptDate: c.receiptDate, note: c.note, attachments: c.attachments.map((a) => a.name) },
    });
    return c;
  });
}

export function cancelClaim(actorId: string, claimId: string) {
  return commit((db) => {
    const actor = requireEmployee(db, actorId);
    const c = getClaim(db, claimId);
    if (c.employeeId !== actor.id && c.filedById !== actor.id) throw new ServiceError("ยกเลิกได้เฉพาะผู้ยื่นคำขอ");
    if (!canTransition("cancel", c.status)) throw new ServiceError("ยกเลิกได้เฉพาะคำขอที่ยังไม่ผ่านการตรวจ");
    pushEvent(c, actor, "cancel", "cancelled", "ผู้ยื่นยกเลิก — คืนสิทธิ์");
    audit(db, actor, { action: "status_change", entity: "claim", entityId: c.id, summary: `${c.no}: ยกเลิกคำขอ (คืนสิทธิ์)`, after: { status: "cancelled" } });
    return c;
  });
}

/** ตรวจกติกาก่อนยื่น (ไม่บันทึก) — หน้าจอเรียกเพื่อแสดงผลแบบ real-time */
export function validateClaimFor(actorId: string, input: ClaimInput, excludeClaimId?: string) {
  const db = getDB();
  const actor = requireEmployee(db, actorId);
  if (input.employeeId !== actor.id) assertCan(db, actor, "claim.file_on_behalf");
  else assertCan(db, actor, "self.claim");
  const v = validateClaim(db, input, excludeClaimId);
  return {
    ok: v.ok,
    errors: v.errors,
    warnings: v.warnings,
    entitlement: v.entitlement,
    fundRound: v.fundRound ? { id: v.fundRound.id, name: v.fundRound.name, openTo: v.fundRound.openTo, maxPerPerson: v.fundRound.maxPerPerson } : null,
  };
}
export type ClaimValidation = ReturnType<typeof validateClaimFor>;

/* ------------------------------- HR -------------------------------- */
export function hrPass(actorId: string, claimId: string, opts: { note?: string; assignedAmount?: number } = {}) {
  return commit((db) => {
    const actor = requireEmployee(db, actorId);
    assertCan(db, actor, "claim.review");
    const c = getClaim(db, claimId);
    if (c.employeeId === actor.id) throw new ServiceError("ไม่สามารถตรวจคำขอของตนเองได้");
    if (!canTransition("hr_pass", c.status)) throw new ServiceError("คำขอนี้ไม่ได้อยู่ในสถานะรอ HR ตรวจ");
    const emp = requireEmployee(db, c.employeeId);
    const benefit = db.benefitTypes.find((b) => b.id === c.benefitTypeId)!;

    // ตรวจซ้ำ ณ วันที่ยื่น (กติกาอาจถูกแก้ระหว่างทาง)
    const v = validateClaim(
      db,
      { employeeId: c.employeeId, benefitTypeId: c.benefitTypeId, amount: c.amount, receiptDate: c.receiptDate, attachments: c.attachments, fundRoundId: c.fundRoundId },
      c.id,
      dateOf(c.submittedAt),
    );
    const blocking = v.errors.filter((e) => !e.startsWith("รอบงบนี้ปิดรับ"));
    if (blocking.length) throw new ServiceError("ไม่ผ่านการตรวจสิทธิ์อัตโนมัติ:\n" + blocking.join("\n"));

    if (benefit.mode === "assigned") {
      const amt = Number(opts.assignedAmount);
      if (!(amt > 0)) throw new ServiceError("กรุณากำหนดจำนวนเงินช่วยเหลือ");
      const round = db.fundRounds.find((r) => r.id === c.fundRoundId);
      if (!round) throw new ServiceError("ไม่พบรอบงบของคำขอนี้");
      if (round.maxPerPerson != null && amt > round.maxPerPerson)
        throw new ServiceError(`เกินวงเงินสูงสุดต่อคนของรอบ (${money(round.maxPerPerson)})`);
      const u = fundRoundUsage(round, db.claims);
      if (amt > u.remaining) throw new ServiceError(`งบคงเหลือของรอบไม่พอ (คงเหลือ ${money(u.remaining)})`);
      c.assignedAmount = amt;
      c.history.push({ at: nowISO(), actorId: actor.id, action: "assign_amount", note: `กำหนดเงินช่วยเหลือ ${money(amt)}` });
    }
    const approvers = approversFor(emp, db.employees, todayLocal());
    if (!approvers.length) throw new ServiceError("พนักงานยังไม่มีหัวหน้าผู้อนุมัติ กรุณากำหนดหัวหน้างานก่อน");

    c.docsCompleteAt = nowISO();
    pushEvent(c, actor, "hr_pass", "pending_manager", opts.note?.trim() || "เอกสารครบ ผ่านการตรวจสิทธิ์");
    audit(db, actor, {
      action: "review_pass",
      entity: "claim",
      entityId: c.id,
      summary: `${c.no}: HR ตรวจผ่าน ส่งต่อหัวหน้า${c.assignedAmount ? ` (กำหนด ${money(c.assignedAmount)})` : ""}`,
      before: { status: "pending_hr" },
      after: { status: "pending_manager", assignedAmount: c.assignedAmount ?? undefined },
    });
    sendEmail(db, {
      to: approvers.map((id) => requireEmployee(db, id).email),
      subject: `${c.no} รอการอนุมัติ`,
      body: `${fullName(emp)} ยื่นเบิก${benefit.name} ${money(claimValue(c, benefit))} — HR ตรวจผ่านแล้ว รอคุณอนุมัติ`,
      event: "pending_manager",
    });
    sendEmail(db, { to: [emp.email], subject: `${c.no} HR ตรวจผ่านแล้ว`, body: `คำขอของคุณผ่านการตรวจเอกสาร อยู่ระหว่างรอหัวหน้าอนุมัติ`, event: "hr_pass" });
    return c;
  });
}

export function hrReturn(actorId: string, claimId: string, reason: string) {
  return commit((db) => {
    const actor = requireEmployee(db, actorId);
    assertCan(db, actor, "claim.review");
    const c = getClaim(db, claimId);
    if (c.employeeId === actor.id) throw new ServiceError("ไม่สามารถตรวจคำขอของตนเองได้");
    if (c.status !== "pending_hr") throw new ServiceError("ส่งกลับได้เฉพาะคำขอที่รอ HR ตรวจ");
    if (!reason.trim()) throw new ServiceError("กรุณาระบุเหตุผลที่ส่งกลับแก้ไข");
    pushEvent(c, actor, "hr_return", "returned", reason.trim());
    c.returnReason = reason.trim();
    const emp = requireEmployee(db, c.employeeId);
    audit(db, actor, { action: "return", entity: "claim", entityId: c.id, summary: `${c.no}: ส่งกลับแก้ไข — ${reason}`, before: { status: "pending_hr" }, after: { status: "returned" } });
    sendEmail(db, { to: [emp.email, findFiler(db, c)], subject: `${c.no} ถูกส่งกลับแก้ไข`, body: `เหตุผล: ${reason}\nกรุณาแก้ไขและส่งคำขออีกครั้ง`, event: "hr_return" });
    return c;
  });
}

export function hrReject(actorId: string, claimId: string, reason: string) {
  return commit((db) => {
    const actor = requireEmployee(db, actorId);
    assertCan(db, actor, "claim.review");
    const c = getClaim(db, claimId);
    if (c.employeeId === actor.id) throw new ServiceError("ไม่สามารถตรวจคำขอของตนเองได้");
    if (!canTransition("hr_reject", c.status)) throw new ServiceError("ปฏิเสธได้เฉพาะคำขอที่รอ HR ตรวจ");
    if (!reason.trim()) throw new ServiceError("กรุณาระบุเหตุผล");
    pushEvent(c, actor, "hr_reject", "rejected", reason.trim());
    c.rejectReason = reason.trim();
    const emp = requireEmployee(db, c.employeeId);
    audit(db, actor, { action: "reject", entity: "claim", entityId: c.id, summary: `${c.no}: HR ปฏิเสธ (คืนสิทธิ์) — ${reason}`, before: { status: "pending_hr" }, after: { status: "rejected" } });
    sendEmail(db, { to: [emp.email], subject: `${c.no} ไม่ผ่านการตรวจสอบ`, body: `เหตุผล: ${reason}\nสิทธิ์ของคุณถูกคืนแล้ว`, event: "hr_reject" });
    return c;
  });
}

function findFiler(db: Database, c: Claim) {
  return c.filedById ? db.employees.find((e) => e.id === c.filedById)?.email : undefined;
}

/* ----------------------------- Manager ----------------------------- */

export function approveClaim(actorId: string, claimId: string, pin: string) {
  const actor0 = requireEmployee(getDB(), actorId);
  if (!verifySecret(pin, actor0.pinHash)) {
    commit((db) => audit(db, requireEmployee(db, actorId), { action: "pin_failed", entity: "auth", entityId: actorId, summary: `PIN ไม่ถูกต้อง ขณะอนุมัติคำขอ ${getClaim(db, claimId).no}` }));
    throw new ServiceError("PIN ไม่ถูกต้อง");
  }
  return commit((db) => {
    const actor = requireEmployee(db, actorId);
    const c = getClaim(db, claimId);
    if (!canApprove(db, actor, c)) throw new ServiceError("คุณไม่ใช่ผู้อนุมัติของคำขอนี้");
    if (!canTransition("approve", c.status)) throw new ServiceError("คำขอนี้ไม่ได้อยู่ในสถานะรออนุมัติ");
    const benefit = db.benefitTypes.find((b) => b.id === c.benefitTypeId)!;
    const emp = requireEmployee(db, c.employeeId);
    c.approverId = actor.id;
    c.approvedAt = nowISO();
    c.payDate = computePayDate(todayLocal(), db.settings);
    pushEvent(c, actor, "approve", "approved", emp.managerId !== actor.id ? "อนุมัติโดยผู้อนุมัติสำรอง" : undefined);
    audit(db, actor, {
      action: "approve",
      entity: "claim",
      entityId: c.id,
      summary: `${c.no}: อนุมัติ ${money(claimValue(c, benefit))} — กำหนดจ่าย ${c.payDate}`,
      before: { status: "pending_manager" },
      after: { status: "approved", payDate: c.payDate },
    });
    sendEmail(db, { to: [emp.email], subject: `${c.no} อนุมัติแล้ว`, body: `คำขอเบิก${benefit.name} ${money(claimValue(c, benefit))} ได้รับการอนุมัติ คาดว่าเงินเข้า ${c.payDate}`, event: "approve" });
    sendEmail(db, { to: [db.settings.email.financeInbox], subject: `${c.no} อนุมัติแล้ว รอจ่าย`, body: `${emp.code} · ${money(claimValue(c, benefit))} · รอบจ่าย ${c.payDate}`, event: "approve" });
    return c;
  });
}

export function rejectClaim(actorId: string, claimId: string, reason: string) {
  return commit((db) => {
    const actor = requireEmployee(db, actorId);
    const c = getClaim(db, claimId);
    if (!canApprove(db, actor, c)) throw new ServiceError("คุณไม่ใช่ผู้อนุมัติของคำขอนี้");
    if (!canTransition("reject", c.status)) throw new ServiceError("คำขอนี้ไม่ได้อยู่ในสถานะรออนุมัติ");
    if (!reason.trim()) throw new ServiceError("กรุณาระบุเหตุผลที่ไม่อนุมัติ");
    pushEvent(c, actor, "reject", "rejected", reason.trim());
    c.rejectReason = reason.trim();
    const emp = requireEmployee(db, c.employeeId);
    audit(db, actor, { action: "reject", entity: "claim", entityId: c.id, summary: `${c.no}: ไม่อนุมัติ (คืนสิทธิ์) — ${reason}`, before: { status: "pending_manager" }, after: { status: "rejected" } });
    sendEmail(db, { to: [emp.email], subject: `${c.no} ไม่อนุมัติ`, body: `เหตุผล: ${reason}\nสิทธิ์ของคุณถูกคืนแล้ว`, event: "reject" });
    return c;
  });
}

/* ----------------------------- Finance ----------------------------- */
export function markPaid(actorId: string, claimIds: string[], paymentRef: string) {
  return commit((db) => {
    const actor = requireEmployee(db, actorId);
    assertCan(db, actor, "payment.mark_paid");
    if (!paymentRef.trim()) throw new ServiceError("กรุณาระบุเลขอ้างอิงการโอน / หลักฐานการจ่าย");
    if (!claimIds.length) throw new ServiceError("ไม่มีรายการที่เลือก");
    for (const id of claimIds) {
      const c = getClaim(db, id);
      if (!canTransition("mark_paid", c.status)) throw new ServiceError(`${c.no} ไม่ได้อยู่ในสถานะรอจ่าย`);
      const benefit = db.benefitTypes.find((b) => b.id === c.benefitTypeId)!;
      c.paidAt = nowISO();
      c.paidById = actor.id;
      c.paymentRef = paymentRef.trim();
      pushEvent(c, actor, "mark_paid", "paid", paymentRef.trim());
      const emp = requireEmployee(db, c.employeeId);
      audit(db, actor, { action: "mark_paid", entity: "payment", entityId: c.id, summary: `${c.no}: บันทึกจ่ายแล้ว (${paymentRef})`, before: { status: "approved" }, after: { status: "paid", paymentRef } });
      sendEmail(db, { to: [emp.email], subject: `${c.no} จ่ายเงินแล้ว`, body: `คำขอเบิก${benefit.name} ${money(claimValue(c, benefit))} ได้รับการโอนเงินแล้ว (อ้างอิง ${paymentRef})`, event: "mark_paid" });
    }
  });
}

