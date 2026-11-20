/**
 * คำขอแก้ไข (Maker–Checker)
 * - HR ขอแก้ผลคำขอที่อนุมัติ/ไม่อนุมัติแล้ว หรือขอแก้วงเงิน → ยังไม่มีผลทันที
 * - หัวหน้า HR อนุมัติจึงมีผล; อนุมัติคำขอของตัวเองได้แต่ต้องยืนยันรหัสผ่าน (selfApproved)
 * - วงเงินใหม่ = เพิ่ม BenefitLimit แถวใหม่ ไม่ทับแถวเดิม
 */
import { LEVELS, STATUS_LABEL } from "../domain/constants";
import { todayLocal } from "../domain/dates";
import { computePayDate } from "../domain/rules";
import type { BenefitLimit, ChangeRequest, ClaimStatus, Database } from "../domain/types";
import { commit, uid } from "../data/db";
import { verifySecret } from "../security/hash";
import { recomputeApproved } from "./claims";
import { assertCan, logAudit, nowISO, requireEmployee, ServiceError } from "./core";
import { hasPendingChange } from "./queries";

export type LimitDraft = Pick<BenefitLimit, "minLevel" | "maxLevel" | "perClaim" | "perYear" | "maxCount">;

const limitFields = (l: Partial<LimitDraft>) =>
  Object.fromEntries(
    (["minLevel", "maxLevel", "perClaim", "perYear", "maxCount"] as const).filter((k) => l[k] != null).map((k) => [k, l[k]]),
  ) as Record<string, number>;

function addRequest(db: Database, cr: ChangeRequest) {
  db.changeRequests.unshift(cr);
}

export function requestClaimChange(actorId: string, claimId: string, to: "approved" | "rejected", reason: string) {
  return commit((db) => {
    const actor = requireEmployee(db, actorId);
    assertCan(db, actor, "change.request");
    const c = db.claims.find((x) => x.id === claimId);
    if (!c) throw new ServiceError("ไม่พบคำขอ");
    if (c.status === "paid") throw new ServiceError("คำขอที่จ่ายแล้ว ขอแก้ผลไม่ได้");
    if (c.status !== "approved" && c.status !== "rejected") throw new ServiceError("ขอแก้ผลได้เฉพาะคำขอที่อนุมัติหรือไม่อนุมัติแล้ว");
    if (c.status === to) throw new ServiceError("ผลใหม่ต้องต่างจากผลเดิม");
    if (!reason?.trim()) throw new ServiceError("กรุณาระบุเหตุผลที่ขอแก้");
    if (hasPendingChange(db, c.id)) throw new ServiceError("มีคำขอแก้ไขของรายการนี้ค้างอยู่แล้ว");
    const cr: ChangeRequest = {
      id: uid("cr"),
      kind: "claim_status",
      targetId: c.id,
      before: { status: c.status },
      after: { status: to },
      reason: reason.trim(),
      requestedBy: actor.id,
      requestedAt: nowISO(),
      status: "pending",
    };
    addRequest(db, cr);
    logAudit(db, actor, {
      action: "change_request",
      entity: "claim",
      entityId: c.id,
      summary: `${c.no}: ขอแก้ผล ${STATUS_LABEL[c.status]} → ${STATUS_LABEL[to]} — ${cr.reason} (${cr.id})`,
      before: cr.before,
      after: cr.after,
    });
    return cr;
  });
}

export function requestLimitChange(actorId: string, benefitId: string, baseLimitId: string | null, draft: LimitDraft, reason: string) {
  return commit((db) => {
    const actor = requireEmployee(db, actorId);
    assertCan(db, actor, "change.request");
    const benefit = db.benefitTypes.find((b) => b.id === benefitId);
    if (!benefit) throw new ServiceError("ไม่พบสวัสดิการ");
    const min = Number(draft.minLevel);
    const max = Number(draft.maxLevel);
    if (!LEVELS.includes(min as 1) || !LEVELS.includes(max as 1) || min > max) throw new ServiceError("ช่วงระดับต้องอยู่ระหว่าง 1–4 และระดับต่ำสุดไม่เกินระดับสูงสุด");
    const nums = [draft.perClaim, draft.perYear, draft.maxCount];
    if (nums.every((n) => n == null)) throw new ServiceError("ต้องกำหนดวงเงินอย่างน้อย 1 ช่อง");
    if (nums.some((n) => n != null && !(Number(n) > 0))) throw new ServiceError("วงเงิน/จำนวนครั้งต้องมากกว่า 0");
    if (draft.perClaim != null && draft.perYear != null && draft.perClaim > draft.perYear) throw new ServiceError("วงเงินต่อครั้งต้องไม่เกินวงเงินต่อปี");
    if (!reason?.trim()) throw new ServiceError("กรุณาระบุเหตุผลที่ขอแก้วงเงิน");
    const base = baseLimitId ? db.benefitLimits.find((l) => l.id === baseLimitId) : null;
    const cr: ChangeRequest = {
      id: uid("cr"),
      kind: "benefit_limit",
      targetId: benefitId,
      before: base ? limitFields(base) : {},
      after: limitFields({ ...draft, minLevel: min, maxLevel: max }),
      reason: reason.trim(),
      requestedBy: actor.id,
      requestedAt: nowISO(),
      status: "pending",
    };
    addRequest(db, cr);
    logAudit(db, actor, {
      action: "change_request",
      entity: "benefit_limit",
      entityId: benefitId,
      summary: `ขอแก้วงเงิน ${benefit.name} ระดับ ${min}–${max} — ${cr.reason} (${cr.id})`,
      before: cr.before,
      after: cr.after,
    });
    return cr;
  });
}

export function reviewChange(actorId: string, requestId: string, approve: boolean, opts: { note?: string; password?: string } = {}) {
  return commit((db) => {
    const actor = requireEmployee(db, actorId);
    assertCan(db, actor, "change.review");
    const cr = db.changeRequests.find((r) => r.id === requestId);
    if (!cr || cr.status !== "pending") throw new ServiceError("ไม่พบคำขอแก้ไขที่รออนุมัติ");
    const self = cr.requestedBy === actor.id;
    if (approve && self && !verifySecret(opts.password ?? "", actor.passwordHash)) throw new ServiceError("รหัสผ่านไม่ถูกต้อง");

    let label = "";
    if (cr.kind === "claim_status") {
      const c = db.claims.find((x) => x.id === cr.targetId);
      if (!c) throw new ServiceError("ไม่พบคำขอ");
      label = c.no;
      if (approve) {
        if (c.status === "paid") throw new ServiceError("คำขอนี้จ่ายแล้ว แก้ผลไม่ได้");
        if (c.status !== cr.before.status) throw new ServiceError("สถานะคำขอเปลี่ยนไปแล้ว กรุณาปฏิเสธคำขอแก้ไขนี้");
        const to = cr.after.status as ClaimStatus;
        const fromStatus = c.status;
        if (to === "approved") {
          c.amountApproved = recomputeApproved(db, c, { assignedAmount: c.amountApproved || undefined });
          c.payDate = computePayDate(todayLocal(), db.settings);
          c.rejectReason = null;
        } else {
          c.rejectReason = cr.reason;
          c.payDate = null;
        }
        c.decidedById = actor.id;
        c.decidedRole = actor.role;
        c.decidedAt = nowISO();
        c.history.push({ at: nowISO(), actorId: actor.id, action: "change_result", fromStatus, toStatus: to, note: `แก้ผลตามคำขอแก้ไข: ${cr.reason}` });
        c.status = to;
      }
    } else {
      const benefit = db.benefitTypes.find((b) => b.id === cr.targetId);
      label = benefit?.name ?? cr.targetId;
      if (approve) {
        const a = cr.after as unknown as LimitDraft;
        db.benefitLimits.push({
          id: uid("lim"),
          benefitId: cr.targetId,
          minLevel: a.minLevel,
          maxLevel: a.maxLevel,
          perClaim: a.perClaim ?? null,
          perYear: a.perYear ?? null,
          maxCount: a.maxCount ?? null,
          effectiveFrom: todayLocal(),
          createdAt: nowISO(),
        });
      }
    }

    cr.status = approve ? "approved" : "rejected";
    cr.reviewedBy = actor.id;
    cr.reviewedAt = nowISO();
    cr.reviewNote = opts.note?.trim() || null;
    cr.selfApproved = approve && self ? true : undefined;
    logAudit(db, actor, {
      action: approve ? "change_approve" : "change_reject",
      entity: cr.kind === "claim_status" ? "claim" : "benefit_limit",
      entityId: cr.targetId,
      summary: `${approve ? "อนุมัติ" : "ปฏิเสธ"}คำขอแก้ไข ${label} (${cr.id})${approve && self ? " — อนุมัติคำขอของตนเอง (selfApproved)" : ""}${cr.reviewNote ? ` · ${cr.reviewNote}` : ""}`,
      before: cr.before,
      after: cr.after,
    });
    return cr;
  });
}
