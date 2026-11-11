"use client";
import { AlertTriangle, ChevronDown, Pencil } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { EMPLOYMENT_TYPE_LABEL } from "@/lib/domain/constants";
import { dateOf, todayLocal } from "@/lib/domain/dates";
import { claimValue, fundRoundUsage, payDateExplain } from "@/lib/domain/rules";
import type { Claim, Database, Employee } from "@/lib/domain/types";
import { dateTH, dateTimeFullTH, money } from "@/lib/format";
import { useCan, useDB, useMe } from "@/lib/hooks";
import { canApprove, validateClaim } from "@/lib/services/queries";
import { fullName } from "@/lib/services/core";
import { AttachmentList, PayDateHint, PinDialog, StatusBadge, Timeline } from "./claims";
import { Alert, Button, Card, Field, Input, KV, Modal, Textarea, useAction, useToast } from "./ui";
import { api } from "@/lib/client/api";

export function canViewClaim(db: Database, me: Employee, c: Claim, can: ReturnType<typeof useCan>) {
  const emp = db.employees.find((e) => e.id === c.employeeId);
  return (
    c.employeeId === me.id ||
    c.filedById === me.id ||
    can("claim.review") ||
    canApprove(db, me, c) ||
    (can("team.view") && emp?.managerId === me.id) ||
    (can("claim.approve") && c.approverId === me.id)
  );
}

type ReasonKind = "return" | "hr_reject" | "reject" | "cancel" | null;

export function ClaimDetail({ c, onDone, compact }: { c: Claim; onDone?: () => void; compact?: boolean }) {
  const db = useDB();
  const me = useMe()!;
  const can = useCan();
  const act = useAction();
  const toast = useToast();
  const [reasonKind, setReasonKind] = useState<ReasonKind>(null);
  const [reason, setReason] = useState("");
  const [pinOpen, setPinOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(!compact);
  const b = db.benefitTypes.find((x) => x.id === c.benefitTypeId)!;
  const emp = db.employees.find((x) => x.id === c.employeeId)!;
  const dept = db.departments.find((d) => d.id === emp.departmentId);
  const pos = db.positions.find((p) => p.id === emp.positionId);
  const round = c.fundRoundId ? db.fundRounds.find((r) => r.id === c.fundRoundId) : null;
  const filer = c.filedById ? db.employees.find((e) => e.id === c.filedById) : null;
  const value = claimValue(c, b);

  const isOwner = c.employeeId === me.id || c.filedById === me.id;
  const hrCanAct = can("claim.review") && c.status === "pending_hr" && c.employeeId !== me.id;
  const mgrCanAct = c.status === "pending_manager" && canApprove(db, me, c);
  const ownerCanEdit = isOwner && (c.status === "pending_hr" || c.status === "returned");

  const review = hrCanAct
    ? validateClaim(db, { employeeId: c.employeeId, benefitTypeId: c.benefitTypeId, amount: c.amount, receiptDate: c.receiptDate, attachments: c.attachments, fundRoundId: c.fundRoundId }, c.id, dateOf(c.submittedAt))
    : null;
  const [assigned, setAssigned] = useState<string>(c.assignedAmount ? String(c.assignedAmount) : "");
  const roundUse = round ? fundRoundUsage(round, db.claims.filter((x) => x.id !== c.id)) : null;
  const pay = payDateExplain(todayLocal(), db.settings);

  const doReason = async () => {
    const ok = await act(async () => {
      if (reasonKind === "return") await api.hrReturn(c.id, reason);
      else if (reasonKind === "hr_reject") await api.hrReject(c.id, reason);
      else if (reasonKind === "reject") await api.rejectClaim(c.id, reason);
      else if (reasonKind === "cancel") await api.cancelClaim(c.id);
      return true;
    }, { return: "ส่งกลับแก้ไขแล้ว แจ้งอีเมลผู้ยื่น", hr_reject: "ปฏิเสธคำขอแล้ว (คืนสิทธิ์)", reject: "บันทึกไม่อนุมัติแล้ว (คืนสิทธิ์)", cancel: "ยกเลิกคำขอแล้ว (คืนสิทธิ์)" }[reasonKind!]);
    if (ok) {
      setReasonKind(null);
      setReason("");
      onDone?.();
    }
  };

  return (
    <div className="space-y-4">
      {c.status === "returned" && c.returnReason && (
        <Alert tone="warn" icon={<AlertTriangle className="size-4" />}>
          <b>ถูกส่งกลับแก้ไข:</b> {c.returnReason}
        </Alert>
      )}
      {c.status === "rejected" && c.rejectReason && (
        <Alert tone="error">
          <b>ไม่อนุมัติ:</b> {c.rejectReason}
          <span className="block text-xs">สิทธิ์และวงเงินถูกคืนแล้ว</span>
        </Alert>
      )}

      {!isOwner || c.filedById ? (
        <div className="rounded-xl bg-zinc-50 px-4 py-3">
          <p className="font-semibold">{fullName(emp)}</p>
          <p className="text-xs text-zinc-500">
            {emp.code} · {pos?.name} · {dept?.name} · {EMPLOYMENT_TYPE_LABEL[emp.employmentType]}
          </p>
          {filer && (
            <p className="mt-1.5 text-xs text-brand-700">
              ยื่นแทนโดย {fullName(filer)} — {c.filedReason}
            </p>
          )}
        </div>
      ) : null}

      <Card className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm text-zinc-500">{b.name}</p>
            <p className="text-2xl font-semibold tabular">{b.mode === "assigned" && c.assignedAmount == null ? "รอ HR กำหนดยอด" : money(value)}</p>
          </div>
          <StatusBadge status={c.status} />
        </div>
        <div className="mt-3 divide-y divide-zinc-100">
          <KV k="เลขที่" v={c.no} />
          <KV k={b.mode === "assigned" ? "วันที่เกิดเหตุ" : "วันที่ในใบเสร็จ"} v={dateTH(c.receiptDate)} />
          <KV k="วันที่ยื่น" v={dateTimeFullTH(c.submittedAt)} />
          {round && <KV k="รอบงบ" v={round.name} />}
          {c.docsCompleteAt && <KV k="เอกสารครบ" v={dateTimeFullTH(c.docsCompleteAt)} />}
          {c.approvedAt && <KV k="อนุมัติโดย" v={`${fullName(db.employees.find((e) => e.id === c.approverId))} · ${dateTimeFullTH(c.approvedAt)}`} />}
          {c.payDate && <KV k={c.status === "paid" ? "วันเงินเข้า" : "กำหนดจ่าย"} v={<span className="text-emerald-700">{dateTH(c.payDate)}</span>} />}
          {c.paymentRef && <KV k="อ้างอิงการจ่าย" v={c.paymentRef} />}
          {c.note && <KV k="หมายเหตุ" v={<span className="font-normal">{c.note}</span>} />}
        </div>
      </Card>

      {hrCanAct && b.mode === "assigned" && round && roundUse && (
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
          <p className="text-xs text-zinc-400">ตรวจสิทธิ์อัตโนมัติ (ณ วันที่ยื่น)</p>
          {review.ok ? (
            <p className="mt-1">✓ มีสิทธิ์ตามประเภทพนักงาน · เอกสารครบ</p>
          ) : (
            review.errors.map((e) => (
              <p key={e} className="mt-1 text-red-300">
                ✕ {e}
              </p>
            ))
          )}
          <p className="mt-1 text-zinc-300">
            {review.entitlement.remainingAmount != null && <>คงเหลือ {money(review.entitlement.remainingAmount)} (ไม่รวมคำขอนี้) </>}
            {review.entitlement.remainingTimes != null && <>เหลือ {review.entitlement.remainingTimes} ครั้ง </>}
            {review.entitlement.perClaimLimit != null && <>(ครั้งละ ≤ {money(review.entitlement.perClaimLimit)})</>}
          </p>
          {review.warnings.map((w) => (
            <p key={w} className="mt-1 text-amber-300">
              ! {w}
            </p>
          ))}
        </div>
      )}


      {mgrCanAct && <PayDateHint date={pay.actual} prefix="อนุมัติวันนี้ → เงินเข้า" note={pay.shifted ? `เลื่อนจาก ${dateTH(pay.nominal)} เพราะ${pay.reason}` : null} />}

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

      {(hrCanAct || mgrCanAct || ownerCanEdit) && (
        <div className={`${compact ? "sticky bottom-0" : "sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-3"} z-10 -mx-1 flex flex-wrap gap-2 rounded-2xl border border-zinc-200 bg-white/95 p-2 shadow-lg backdrop-blur [&>*]:flex-1`}>
          {hrCanAct && (
            <>
              <Button variant="outline-danger" onClick={() => setReasonKind("hr_reject")}>
                ปฏิเสธ
              </Button>
              <Button variant="outline-brand" onClick={() => setReasonKind("return")}>
                ส่งกลับแก้ไข
              </Button>
              <Button
                onClick={() => {
                  act(() => api.hrPass(c.id, { assignedAmount: Number(assigned) || undefined }), "ตรวจผ่าน ส่งต่อหัวหน้าแล้ว").then((ok) => ok && onDone?.());
                }}
              >
                ผ่าน → หัวหน้า
              </Button>
            </>
          )}
          {mgrCanAct && (
            <>
              <Button variant="outline-danger" onClick={() => setReasonKind("reject")}>
                ไม่อนุมัติ
              </Button>
              <Button variant="success" onClick={() => setPinOpen(true)}>
                อนุมัติ
              </Button>
            </>
          )}
          {ownerCanEdit && !hrCanAct && !mgrCanAct && (
            <>
              <Button variant="outline-danger" onClick={() => setReasonKind("cancel")}>
                ยกเลิกคำขอ
              </Button>
              <Link href={`/claim/edit?id=${c.id}`} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600">
                <Pencil className="size-4" /> {c.status === "returned" ? "แก้ไขและส่งใหม่" : "แก้ไขคำขอ"}
              </Link>
            </>
          )}
        </div>
      )}

      <Modal
        open={!!reasonKind}
        onClose={() => setReasonKind(null)}
        size="sm"
        title={{ return: "ส่งกลับแก้ไข", hr_reject: "ปฏิเสธคำขอ", reject: "ไม่อนุมัติคำขอ", cancel: "ยกเลิกคำขอ" }[reasonKind ?? "return"]}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReasonKind(null)}>
              ย้อนกลับ
            </Button>
            <Button variant={reasonKind === "return" ? "primary" : "danger"} disabled={reasonKind !== "cancel" && !reason.trim()} onClick={doReason}>
              ยืนยัน
            </Button>
          </>
        }
      >
        {reasonKind === "cancel" ? (
          <p className="text-sm text-zinc-600">ยืนยันยกเลิกคำขอ {c.no}? สิทธิ์และวงเงินจะถูกคืน</p>
        ) : (
          <Field label="เหตุผล (แจ้งผู้ยื่นทางอีเมล)" required>
            <Textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder={reasonKind === "return" ? "เช่น ใบเสร็จไม่ชัด กรุณาแนบใหม่" : "ระบุเหตุผล"} />
          </Field>
        )}
      </Modal>

      <PinDialog
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        amountText={money(value)}
        onConfirm={async (pin) => {
          try {
            await api.approveClaim(c.id, pin);
            toast("อนุมัติแล้ว แจ้งผู้ยื่นและฝ่ายบัญชี");
            onDone?.();
            return true;
          } catch (e) {
            const msg = (e as Error).message;
            if (msg === "PIN ไม่ถูกต้อง") return false;
            toast(msg, "error");
            return true;
          }
        }}
      />
    </div>
  );
}
