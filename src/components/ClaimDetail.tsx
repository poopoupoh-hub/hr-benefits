"use client";
import { AlertTriangle, ChevronDown, Copy, FilePen, Pencil } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { EMPLOYMENT_TYPE_LABEL, PAYMENT_METHOD_LABEL, STATUS_LABEL } from "@/lib/domain/constants";
import { dateOf, todayLocal } from "@/lib/domain/dates";
import { findDuplicateReceipts, fundRoundUsage, levelOf, payDateExplain } from "@/lib/domain/rules";
import type { Claim, Database, Employee } from "@/lib/domain/types";
import { dateTH, dateTimeFullTH, money } from "@/lib/format";
import { useCan, useDB, useMe } from "@/lib/hooks";
import { validateClaim } from "@/lib/services/queries";
import { deciderLabel, fullName } from "@/lib/services/core";
import { AttachmentList, ConfirmMoneyDialog, FlowStepper, PayDateHint, StatusBadge, Timeline } from "./claims";
import { Alert, Button, Card, Field, Input, KV, Modal, Textarea, useAction } from "./ui";
import { api } from "@/lib/client/api";

export function canViewClaim(_db: Database, me: Employee, c: Claim, can: ReturnType<typeof useCan>) {
  return c.employeeId === me.id || can("claim.review");
}

type ReasonKind = "return" | "reject" | "change" | null;

export function ClaimDetail({ c, onDone, compact }: { c: Claim; onDone?: () => void; compact?: boolean }) {
  const db = useDB();
  const me = useMe()!;
  const can = useCan();
  const act = useAction();
  const [reasonKind, setReasonKind] = useState<ReasonKind>(null);
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(!compact);
  const b = db.benefitTypes.find((x) => x.id === c.benefitTypeId)!;
  const emp = db.employees.find((x) => x.id === c.employeeId)!;
  const dept = db.departments.find((d) => d.id === emp.departmentId);
  const pos = db.positions.find((p) => p.id === emp.positionId);
  const round = c.fundRoundId ? db.fundRounds.find((r) => r.id === c.fundRoundId) : null;
  const payment = db.payments.find((p) => p.claimId === c.id);
  const decider = c.decidedById ? db.employees.find((e) => e.id === c.decidedById) : null;
  const assignedMode = b.mode === "assigned";
  const cut = !assignedMode && c.amountApproved < c.amountRequested;

  const isOwner = c.employeeId === me.id;
  const reviewer = can("claim.review");
  const hrCanAct = reviewer && c.status === "pending_hr" && !isOwner;
  const ownerCanEdit = isOwner && (c.status === "pending_hr" || c.status === "returned");
  const pendingChange = db.changeRequests.find((r) => r.kind === "claim_status" && r.targetId === c.id && r.status === "pending");
  const canRequestChange = can("change.request") && (c.status === "approved" || c.status === "rejected") && !pendingChange;
  const changeTo = c.status === "approved" ? "rejected" : "approved";

  const review = hrCanAct
    ? validateClaim(
        db,
        c.employeeId,
        { benefitTypeId: c.benefitTypeId, receiptNo: c.receiptNo, vendorName: c.vendorName, amountRequested: c.amountRequested, receiptDate: c.receiptDate, attachments: c.attachments, fundRoundId: c.fundRoundId },
        c.id,
        dateOf(c.submittedAt),
      )
    : null;
  const dups = reviewer ? findDuplicateReceipts(db.claims, c) : [];
  const [assigned, setAssigned] = useState<string>(c.amountApproved ? String(c.amountApproved) : "");
  const roundUse = round ? fundRoundUsage(round, db.claims.filter((x) => x.id !== c.id)) : null;
  const pay = payDateExplain(todayLocal(), db.settings);
  const approveAmount = assignedMode ? Number(assigned) || 0 : (review?.approved ?? c.amountApproved);

  const doReason = async () => {
    const msg = { return: "ส่งกลับแก้ไขแล้ว แจ้งอีเมลผู้ยื่น", reject: "บันทึกไม่อนุมัติแล้ว (คืนสิทธิ์)", change: "ส่งคำขอแก้ผลแล้ว รอหัวหน้า HR อนุมัติ" }[reasonKind!];
    const ok = await act(async () => {
      if (reasonKind === "return") await api.returnClaim(c.id, reason);
      else if (reasonKind === "reject") await api.rejectClaim(c.id, reason);
      else if (reasonKind === "change") await api.requestClaimChange(c.id, changeTo, reason);
      return true;
    }, msg);
    if (ok) {
      setReasonKind(null);
      setReason("");
      onDone?.();
    }
  };

  return (
    <div className="space-y-4">
      <Card className="px-3 py-4">
        <FlowStepper c={c} db={db} />
      </Card>

      {c.status === "returned" && c.returnReason && (
        <Alert tone="warn" icon={<AlertTriangle className="size-4" />}>
          <b>เหตุผลที่ถูกส่งกลับ:</b> {c.returnReason}
        </Alert>
      )}
      {c.status === "rejected" && c.rejectReason && (
        <Alert tone="error">
          <b>ไม่อนุมัติ{decider ? ` โดย ${deciderLabel(db, c)}` : ""}:</b> {c.rejectReason}
          <span className="block text-xs">สิทธิ์และวงเงินถูกคืนแล้ว</span>
        </Alert>
      )}
      {pendingChange && (
        <Alert tone="warn" icon={<FilePen className="size-4" />}>
          มีคำขอแก้ผลเป็น &quot;{STATUS_LABEL[pendingChange.after.status as Claim["status"]]}&quot; รอหัวหน้า HR อนุมัติ — ล็อกการจ่ายไว้ก่อน
        </Alert>
      )}

      {!isOwner && (
        <div className="rounded-xl bg-zinc-50 px-4 py-3">
          <p className="font-semibold">{fullName(emp)}</p>
          <p className="text-xs text-zinc-500">
            {emp.code} · {pos?.name} (ระดับ {levelOf(emp, db.positions)}) · {dept?.name} · {EMPLOYMENT_TYPE_LABEL[emp.employmentType]}
          </p>
        </div>
      )}

      <Card className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-zinc-500">{b.name}</p>
          <StatusBadge status={c.status} />
        </div>
        {assignedMode ? (
          <p className="mt-1 text-2xl font-semibold tabular">{c.amountApproved ? money(c.amountApproved) : "รอ HR กำหนดยอด"}</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-zinc-50 p-3">
              <p className="text-xs text-zinc-500">ยอดขอเบิก (ตามใบเสร็จ)</p>
              <p className="text-lg font-semibold tabular">{money(c.amountRequested)}</p>
            </div>
            <div className={cut ? "rounded-xl bg-amber-50 p-3" : "rounded-xl bg-emerald-50 p-3"}>
              <p className="text-xs text-zinc-500">ยอดเบิกได้จริง</p>
              <p className={`text-lg font-semibold tabular ${cut ? "text-amber-700" : "text-emerald-700"}`}>{money(c.amountApproved)}</p>
            </div>
          </div>
        )}
        {cut && <p className="mt-2 text-xs text-amber-700">ยอดถูกตัดตามวงเงินสิทธิ์</p>}
        <div className="mt-3 divide-y divide-zinc-100">
          <KV k="เลขที่คำขอ" v={c.no} />
          {!assignedMode && <KV k="เลขที่ใบเสร็จ" v={c.receiptNo || "-"} />}
          {!assignedMode && <KV k="ร้าน / บริษัท / โรงพยาบาล" v={c.vendorName || "-"} />}
          <KV k={assignedMode ? "วันที่เกิดเหตุ" : "วันที่ในใบเสร็จ"} v={dateTH(c.receiptDate)} />
          <KV k="วันที่ยื่น" v={dateTimeFullTH(c.submittedAt)} />
          {round && <KV k="รอบงบ" v={round.name} />}
          {decider && c.decidedAt && <KV k={c.status === "rejected" ? "ไม่อนุมัติโดย" : "อนุมัติโดย"} v={`${deciderLabel(db, c)} · ${dateTimeFullTH(c.decidedAt)}`} />}
          {c.payDate && c.status === "approved" && <KV k="กำหนดจ่าย" v={<span className="text-emerald-700">{dateTH(c.payDate)}</span>} />}
          {c.note && <KV k="หมายเหตุ" v={<span className="font-normal">{c.note}</span>} />}
        </div>
      </Card>

      {c.status === "paid" && payment && (
        <Card className="border-emerald-200 bg-emerald-50/60 p-4">
          <p className="mb-1 text-sm font-semibold text-emerald-800">จ่ายเงินแล้ว</p>
          <div className="divide-y divide-emerald-100">
            <KV k="วิธีจ่าย" v={PAYMENT_METHOD_LABEL[payment.method]} />
            <KV k="วันที่จ่าย" v={dateTH(payment.paidAt)} />
            {payment.transferRef && <KV k="เลขอ้างอิงการโอน" v={payment.transferRef} />}
            {payment.chequeNo && <KV k="เลขที่เช็ค" v={`${payment.chequeNo}${payment.chequeDate ? ` (ลงวันที่ ${dateTH(payment.chequeDate)})` : ""}`} />}
          </div>
        </Card>
      )}

      {dups.length > 0 && (
        <Alert tone="error" icon={<Copy className="size-4" />}>
          <b>ใบเสร็จนี้อาจถูกใช้ซ้ำ</b> (เลขที่ใบเสร็จ + ร้านเดียวกัน)
          {dups.map((d) => (
            <span key={d.id} className="block text-xs">
              {d.no} · {fullName(db.employees.find((e) => e.id === d.employeeId))} · {STATUS_LABEL[d.status]}
            </span>
          ))}
        </Alert>
      )}

      {hrCanAct && assignedMode && round && roundUse && (
        <Field label="กำหนดเงินช่วยเหลือ (บาท)" required hint={`งบรอบคงเหลือ ${money(roundUse.remaining)}${round.maxPerPerson ? ` · สูงสุด ${money(round.maxPerPerson)}/คน` : ""}`}>
          <Input type="number" min={0} value={assigned} onChange={(e) => setAssigned(e.target.value)} placeholder="0" />
        </Field>
      )}
      <div>
        <p className="mb-2 text-sm font-medium">เอกสารแนบ</p>
        <AttachmentList items={c.attachments} />
        {b.requiredDocs.length > 0 && <p className="mt-1.5 text-xs text-zinc-500">เอกสารที่ต้องมี: {b.requiredDocs.join(", ")}</p>}
      </div>

      {review && (
        <div className="rounded-2xl bg-ink-900 p-4 text-sm text-white">
          <p className="text-xs text-zinc-400">ตรวจสิทธิ์อัตโนมัติ (ณ วันที่ยื่น · ระดับ {review.entitlement.level})</p>
          {review.ok ? <p className="mt-1">✓ มีสิทธิ์ · เอกสารครบ</p> : review.errors.map((e) => <p key={e} className="mt-1 text-red-300">✕ {e}</p>)}
          {!assignedMode && (
            <p className="mt-1 text-zinc-300">
              ขอ {money(c.amountRequested)} → เบิกได้ {money(review.approved)}
              {review.approvedReason && ` (${review.approvedReason})`}
            </p>
          )}
        </div>
      )}

      {hrCanAct && <PayDateHint date={pay.actual} prefix="อนุมัติวันนี้ → เงินเข้า" note={pay.shifted ? `เลื่อนจาก ${dateTH(pay.nominal)} เพราะ${pay.reason}` : null} />}
      {reviewer && c.status === "pending_hr" && isOwner && <Alert tone="info">นี่คือคำขอของคุณ — ต้องให้ HR คนอื่นหรือหัวหน้า HR เป็นผู้พิจารณา</Alert>}

      <div>
        <button onClick={() => setShowHistory(!showHistory)} className="mb-2 flex w-full items-center justify-between rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium">
          ประวัติการดำเนินการ ({c.history.length})
          <ChevronDown className={`size-4 transition ${showHistory ? "rotate-180" : ""}`} />
        </button>
        {showHistory && (
          <Card className="p-4">
            <Timeline c={c} db={db} />
          </Card>
        )}
      </div>

      {(hrCanAct || ownerCanEdit || canRequestChange) && (
        <div
          className={`${compact ? "sticky bottom-0" : "sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-3"} z-10 -mx-1 flex flex-wrap gap-2 rounded-2xl border border-zinc-200 bg-white/95 p-2 shadow-lg backdrop-blur [&>*]:flex-1`}
        >
          {hrCanAct && (
            <>
              <Button variant="outline-danger" onClick={() => setReasonKind("reject")}>
                ไม่อนุมัติ
              </Button>
              <Button variant="outline-brand" onClick={() => setReasonKind("return")}>
                ส่งกลับแก้ไข
              </Button>
              <Button variant="success" disabled={!review?.ok || approveAmount <= 0} onClick={() => setConfirmOpen(true)}>
                อนุมัติ
              </Button>
            </>
          )}
          {canRequestChange && (
            <Button variant="outline-brand" icon={<FilePen className="size-4" />} onClick={() => setReasonKind("change")}>
              ขอแก้ผล
            </Button>
          )}
          {ownerCanEdit && !hrCanAct && (
            <Link href={`/claim/edit?id=${c.id}`} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600">
              <Pencil className="size-4" /> {c.status === "returned" ? "แก้ไขแล้วส่งใหม่" : "แก้ไขคำขอ"}
            </Link>
          )}
        </div>
      )}

      <Modal
        open={!!reasonKind}
        onClose={() => setReasonKind(null)}
        size="sm"
        title={{ return: "ส่งกลับแก้ไข", reject: "ไม่อนุมัติคำขอ", change: `ขอแก้ผลเป็น "${STATUS_LABEL[changeTo]}"` }[reasonKind ?? "return"]}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReasonKind(null)}>
              ย้อนกลับ
            </Button>
            <Button variant={reasonKind === "reject" ? "danger" : "primary"} disabled={!reason.trim()} onClick={doReason}>
              {reasonKind === "change" ? "ส่งคำขอแก้" : "ยืนยัน"}
            </Button>
          </>
        }
      >
        {reasonKind === "change" && (
          <p className="mb-3 text-sm text-zinc-600">
            {c.no}: {STATUS_LABEL[c.status]} → <b>{STATUS_LABEL[changeTo]}</b> — ยังไม่มีผลทันที ต้องให้หัวหน้า HR อนุมัติก่อน
          </p>
        )}
        <Field label={reasonKind === "change" ? "เหตุผลที่ขอแก้" : "เหตุผล (แจ้งผู้ยื่นทางอีเมล)"} required>
          <Textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder={reasonKind === "return" ? "เช่น ใบเสร็จไม่ชัด กรุณาแนบใหม่" : "ระบุเหตุผล"} />
        </Field>
      </Modal>

      <ConfirmMoneyDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="ยืนยันอนุมัติ"
        claimNo={c.no}
        amount={approveAmount}
        detail={cut || (review && review.approved < c.amountRequested && !assignedMode) ? `ขอเบิก ${money(c.amountRequested)} — อนุมัติตามสิทธิ์${review?.approvedReason ? ` (${review.approvedReason})` : ""}` : `กำหนดจ่าย ${dateTH(pay.actual)}`}
        confirmLabel="ยืนยันอนุมัติ"
        onConfirm={() =>
          act(() => api.approveClaim(c.id, { assignedAmount: assignedMode ? Number(assigned) || undefined : undefined }), "อนุมัติแล้ว แจ้งผู้ยื่นและฝ่ายบัญชี").then((ok) => {
            if (ok) onDone?.();
            return !!ok;
          })
        }
      />
    </div>
  );
}
