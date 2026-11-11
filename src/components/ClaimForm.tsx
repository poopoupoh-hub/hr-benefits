"use client";
import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import type { AttachmentMeta, Claim } from "@/lib/domain/types";
import { todayLocal } from "@/lib/domain/dates";
import { entitlementOf, eligibility, payDateExplain } from "@/lib/domain/rules";
import { cx, dateTH, money } from "@/lib/format";
import { useDB } from "@/lib/hooks";
import type { ClaimInput, ClaimValidation } from "@/lib/services/claims";
import { AttachmentPicker, CheckList, EntitlementBox, PayDateHint } from "./claims";
import { Alert, Button, Field, Input, Textarea, useToast } from "./ui";
import { api } from "@/lib/client/api";

export function ClaimForm({
  employeeId,
  editing,
  onBehalf,
  onDone,
  initialBenefitId,
}: {
  initialBenefitId?: string;
  employeeId: string;
  editing?: Claim;
  onBehalf?: boolean;
  onDone: (c: Claim) => void;
}) {
  const db = useDB();
  const toast = useToast();
  const today = todayLocal();
  const emp = db.employees.find((e) => e.id === employeeId)!;
  const benefits = db.benefitTypes.filter((b) => b.active);

  const [benefitId, setBenefitId] = useState(editing?.benefitTypeId ?? initialBenefitId ?? "");
  const [amount, setAmount] = useState(editing ? String(editing.amount || "") : "");
  const [receiptDate, setReceiptDate] = useState(editing?.receiptDate ?? today);
  const [note, setNote] = useState(editing?.note ?? "");
  const [attachments, setAttachments] = useState<AttachmentMeta[]>(editing?.attachments ?? []);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const benefit = benefits.find((b) => b.id === benefitId) ?? db.benefitTypes.find((b) => b.id === benefitId);
  const input: ClaimInput | null = benefit
    ? {
        employeeId,
        benefitTypeId: benefit.id,
        amount: Number(amount) || 0,
        receiptDate,
        note,
        attachments,
        fundRoundId: editing?.fundRoundId,
        onBehalfReason: onBehalf ? reason : undefined,
      }
    : null;

  // ตรวจกติกาทันที — เซิร์ฟเวอร์เป็นผู้ตรวจ (เห็นงบองค์กรและข้อมูลล่าสุด) แบบ debounce
  const key = input ? JSON.stringify([employeeId, benefitId, amount, receiptDate, attachments.map((a) => [a.id, a.docType]), db.claims.length]) : "";
  const scopeKey = `${employeeId}|${benefitId}`;
  const [checked, setChecked] = useState<{ key: string; scopeKey: string; result: ClaimValidation } | null>(null);
  useEffect(() => {
    if (!input) return;
    let alive = true;
    const t = setTimeout(() => {
      api
        .validateClaim(input, editing?.id)
        .then((result) => alive && setChecked({ key, scopeKey, result }))
        .catch((e) => alive && setChecked({ key, scopeKey, result: { ok: false, errors: [(e as Error).message], warnings: [], entitlement: null as never, fundRound: null } }));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // แสดงผลล่าสุดของสวัสดิการเดียวกันระหว่างรอผลใหม่ (ฟอร์มไม่กระพริบขณะพิมพ์)
  const check = checked && checked.scopeKey === scopeKey && checked.result.entitlement ? checked.result : null;
  const checkError = checked && checked.scopeKey === scopeKey && !checked.result.entitlement ? checked.result.errors[0] : null;
  const pay = payDateExplain(today, db.settings);
  const assigned = benefit?.mode === "assigned";

  const submit = async () => {
    setTouched(true);
    if (!input || !check) return;
    if (onBehalf && !reason.trim()) return toast("กรุณาระบุเหตุผลที่ยื่นแทน", "error");
    setBusy(true);
    try {
      const latest = checked?.key === key ? checked.result : await api.validateClaim(input, editing?.id);
      if (!latest.ok) {
        setChecked({ key, scopeKey, result: latest });
        return toast(latest.errors[0], "error");
      }
      const c = await (editing ? api.updateClaim(editing.id, input) : api.submitClaim(input));
      toast(editing ? (editing.status === "returned" ? "ส่งคำขอใหม่เรียบร้อย" : "บันทึกการแก้ไขแล้ว") : `ส่งคำขอ ${c.no} เรียบร้อย`);
      onDone(c);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {!editing && (
        <div>
          <p className="mb-2 text-[13px] font-medium">ประเภทสวัสดิการ</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {benefits.map((b) => {
              const el = eligibility(emp, b, today);
              const ent = entitlementOf(emp, b, db.claims, Number(today.slice(0, 4)), today);
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBenefitId(b.id)}
                  className={cx(
                    "rounded-xl border px-3 py-2.5 text-left text-sm transition",
                    benefitId === b.id ? "border-brand-500 bg-brand-50 text-brand-700 ring-4 ring-brand-500/10" : "border-zinc-200 bg-white hover:border-zinc-300",
                    !el.eligible && "opacity-60",
                  )}
                >
                  <span className="block font-medium">{b.name}</span>
                  <span className="block text-[11px] text-zinc-500">
                    {!el.eligible
                      ? "ไม่มีสิทธิ์"
                      : b.mode === "assigned"
                        ? "HR กำหนดยอด"
                        : ent.remainingAmount != null
                          ? `เหลือ ${money(ent.remainingAmount)}`
                          : `เหลือ ${ent.remainingTimes} ครั้ง`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {benefit && !check && (
        <div className="space-y-3">
          {checkError ? (
            <Alert tone="error">{checkError}</Alert>
          ) : (
            <div className="h-24 animate-pulse rounded-2xl bg-zinc-200/70" aria-label="กำลังตรวจสิทธิ์" />
          )}
        </div>
      )}

      {benefit && check && (
        <>
          <EntitlementBox ent={check.entitlement} benefit={benefit} />
          {benefit.description && (
            <p className="-mt-2 flex gap-1.5 text-xs text-zinc-500">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              {benefit.description}
            </p>
          )}
          {assigned && (
            <Alert tone="info">
              {check.fundRound ? (
                <>
                  รอบงบ: <b>{check.fundRound.name}</b> · เปิดรับถึง {dateTH(check.fundRound.openTo)}
                  {check.fundRound.maxPerPerson != null && <> · สูงสุด {money(check.fundRound.maxPerPerson)}/คน</>}
                  <span className="block text-xs">ไม่ต้องกรอกยอดเงิน — HR จะประเมินและกำหนดเงินช่วยเหลือจากเอกสาร</span>
                </>
              ) : (
                "ยังไม่มีรอบงบที่เปิดรับสำหรับสวัสดิการนี้"
              )}
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-3">
            {!assigned && (
              <Field label="จำนวนเงิน (บาท)" required>
                <Input type="number" inputMode="decimal" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
              </Field>
            )}
            <Field label={assigned ? "วันที่เกิดเหตุ" : "วันที่ในใบเสร็จ"} required className={assigned ? "col-span-2" : ""}>
              <Input type="date" value={receiptDate} max={today} onChange={(e) => setReceiptDate(e.target.value)} />
            </Field>
          </div>

          <Field label="แนบเอกสาร" required={benefit.requiredDocs.length > 0}>
            <AttachmentPicker value={attachments} onChange={setAttachments} requiredDocs={benefit.requiredDocs} />
          </Field>

          <Field label="หมายเหตุ (ถ้ามี)">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={assigned ? "อธิบายความเสียหายโดยย่อ" : ""} />
          </Field>

          {onBehalf && (
            <Field label="เหตุผลที่ยื่นแทน" required error={touched && !reason.trim() ? "จำเป็นต้องระบุ" : undefined} hint="จะถูกบันทึกพร้อมชื่อผู้ทำรายการใน Audit Log">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น พนักงานลาคลอด ไม่สะดวกเข้าระบบ" />
            </Field>
          )}

          {!assigned && <PayDateHint date={pay.actual} note={pay.shifted ? `สิ้นเดือนตรง${pay.reason?.replace("ตรง", "")} จึงเลื่อนเป็นวันทำการก่อนหน้า` : pay.late ? `อนุมัติหลังวันที่ ${db.settings.cutoffDay} จะเข้ารอบเดือนถัดไป` : null} />}
          {(touched || Number(amount) > 0 || attachments.length > 0) && <CheckList errors={check.errors} warnings={check.warnings} />}

          <Button size="lg" className="w-full" onClick={submit} loading={busy}>
            {editing ? (editing.status === "returned" ? "แก้ไขแล้วส่งใหม่" : "บันทึกการแก้ไข") : "ส่งคำขอเบิก"}
          </Button>
        </>
      )}
    </div>
  );
}
