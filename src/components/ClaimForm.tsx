"use client";
import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import type { AttachmentMeta, Claim } from "@/lib/domain/types";
import { todayLocal, yearOf } from "@/lib/domain/dates";
import { eligibility, entitlementOf, payDateExplain } from "@/lib/domain/rules";
import { cx, dateTH, money } from "@/lib/format";
import { useDB, useMe } from "@/lib/hooks";
import type { ClaimInput, ClaimValidation } from "@/lib/services/claims";
import { BenefitPicker } from "./BenefitPicker";
import { AttachmentPicker, CheckList, EntitlementBox, PayDateHint } from "./claims";
import { Alert, Button, Field, Input, Textarea, useToast } from "./ui";
import { api } from "@/lib/client/api";

const n = (x: number) => x.toLocaleString("th-TH");

export function ClaimForm({ editing, onDone, initialBenefitId }: { initialBenefitId?: string; editing?: Claim; onDone: (c: Claim) => void }) {
  const db = useDB();
  const me = useMe()!;
  const toast = useToast();
  const today = todayLocal();
  const benefits = db.benefitTypes.filter((b) => b.active);

  const [benefitId, setBenefitId] = useState(editing?.benefitTypeId ?? initialBenefitId ?? "");
  const [receiptNo, setReceiptNo] = useState(editing?.receiptNo ?? "");
  const [vendorName, setVendorName] = useState(editing?.vendorName ?? "");
  const [amount, setAmount] = useState(editing ? String(editing.amountRequested || "") : "");
  const [receiptDate, setReceiptDate] = useState(editing?.receiptDate ?? today);
  const [note, setNote] = useState(editing?.note ?? "");
  const [attachments, setAttachments] = useState<AttachmentMeta[]>(editing?.attachments ?? []);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const benefit = benefits.find((b) => b.id === benefitId) ?? db.benefitTypes.find((b) => b.id === benefitId);
  const assigned = benefit?.mode === "assigned";
  const input: ClaimInput | null = benefit
    ? { benefitTypeId: benefit.id, receiptNo, vendorName, amountRequested: Number(amount) || 0, receiptDate, note, attachments, fundRoundId: editing?.fundRoundId }
    : null;

  // ตรวจกติกาทันที — เซิร์ฟเวอร์เป็นผู้ตรวจ (ข้อมูลล่าสุด) แบบ debounce
  const key = input ? JSON.stringify([benefitId, receiptNo, vendorName, amount, receiptDate, attachments.map((a) => [a.id, a.docType]), db.claims.length]) : "";
  const [checked, setChecked] = useState<{ key: string; benefitId: string; result: ClaimValidation } | null>(null);
  useEffect(() => {
    if (!input) return;
    let alive = true;
    const t = setTimeout(() => {
      api
        .validateClaim(input, editing?.id)
        .then((result) => alive && setChecked({ key, benefitId, result }))
        .catch(
          (e) =>
            alive &&
            setChecked({ key, benefitId, result: { ok: false, errors: [(e as Error).message], warnings: [], entitlement: null as never, approved: 0, approvedReason: null, fundRound: null } }),
        );
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // แสดงผลล่าสุดของสวัสดิการเดียวกันระหว่างรอผลใหม่ (ฟอร์มไม่กระพริบขณะพิมพ์)
  const check = checked && checked.benefitId === benefitId && checked.result.entitlement ? checked.result : null;
  const checkError = checked && checked.benefitId === benefitId && !checked.result.entitlement ? checked.result.errors[0] : null;
  const pay = payDateExplain(today, db.settings);
  const requested = Number(amount) || 0;
  /** ยอดเบิกได้จริง = 0 → ปิดปุ่มส่ง พร้อมเหตุผล */
  const zeroReason = !assigned && check && check.approved <= 0 ? check.approvedReason : null;

  const submit = async () => {
    setTouched(true);
    if (!input || !check) return;
    setBusy(true);
    try {
      const latest = checked?.key === key ? checked.result : await api.validateClaim(input, editing?.id);
      if (!latest.ok) {
        setChecked({ key, benefitId, result: latest });
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
        <Field label="ประเภทสวัสดิการ" required>
          <BenefitPicker
            benefits={benefits}
            value={benefitId}
            onChange={setBenefitId}
            note={(b) => {
              if (!eligibility(me, b, today).eligible) return { text: "ไม่มีสิทธิ์", muted: true };
              if (b.mode === "assigned") return { text: "HR กำหนดยอด" };
              const ent = entitlementOf(me, b, { claims: db.claims, limits: db.benefitLimits, positions: db.positions }, yearOf(today), today);
              if (!ent.limit) return { text: "ไม่มีวงเงิน", muted: true };
              if (ent.remainingAmount != null) return { text: `เหลือ ${money(ent.remainingAmount)}` };
              if (ent.remainingTimes != null) return { text: `เหลือ ${ent.remainingTimes} ครั้ง` };
              return null;
            }}
          />
        </Field>
      )}

      {benefit && !check && (
        <div className="space-y-3">
          {checkError ? <Alert tone="error">{checkError}</Alert> : <div className="h-24 animate-pulse rounded-2xl bg-zinc-200/70" aria-label="กำลังตรวจสิทธิ์" />}
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

          {!assigned && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="เลขที่ใบเสร็จ" required>
                <Input value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} placeholder="เช่น RC-12345" />
              </Field>
              <Field label="ร้าน / บริษัท / โรงพยาบาล" required>
                <Input value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="ชื่อตามหัวใบเสร็จ" />
              </Field>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {!assigned && (
              <Field label="ยอดตามใบเสร็จ (บาท)" required>
                <Input type="number" inputMode="decimal" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
              </Field>
            )}
            <Field label={assigned ? "วันที่เกิดเหตุ" : "วันที่ในใบเสร็จ"} required className={assigned ? "col-span-2" : ""}>
              <Input type="date" value={receiptDate} max={today} onChange={(e) => setReceiptDate(e.target.value)} />
            </Field>
          </div>

          {!assigned && requested > 0 && (
            <p
              className={cx(
                "rounded-xl px-3 py-2.5 text-sm",
                check.approved <= 0 ? "bg-red-50 text-red-700" : check.approved < requested ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800",
              )}
              aria-live="polite"
            >
              ขอเบิก {n(requested)} → เบิกได้จริง <b className="tabular">{n(check.approved)}</b>
              {check.approvedReason && ` (${check.approvedReason})`}
            </p>
          )}

          <Field label="แนบเอกสาร" required={benefit.requiredDocs.length > 0}>
            <AttachmentPicker value={attachments} onChange={setAttachments} requiredDocs={benefit.requiredDocs} />
          </Field>

          <Field label="หมายเหตุ (ถ้ามี)">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={assigned ? "อธิบายความเสียหายโดยย่อ" : ""} />
          </Field>

          {!assigned && (
            <PayDateHint
              date={pay.actual}
              note={pay.shifted ? `สิ้นเดือนตรง${pay.reason?.replace("ตรง", "")} จึงเลื่อนเป็นวันทำการก่อนหน้า` : pay.late ? `อนุมัติหลังวันที่ ${db.settings.cutoffDay} จะเข้ารอบเดือนถัดไป` : null}
            />
          )}
          {(touched || requested > 0 || attachments.length > 0) && <CheckList errors={check.errors} warnings={check.warnings} />}

          {zeroReason && <p className="text-center text-sm text-red-600">ส่งไม่ได้: {zeroReason}</p>}
          <Button size="lg" className="w-full" onClick={submit} loading={busy} disabled={!!zeroReason}>
            {editing ? (editing.status === "returned" ? "แก้ไขแล้วส่งใหม่" : "บันทึกการแก้ไข") : "ส่งคำขอเบิก"}
            {!assigned && check.approved > 0 && ` · ${money(check.approved)}`}
          </Button>
        </>
      )}
    </div>
  );
}
