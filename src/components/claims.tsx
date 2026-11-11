"use client";
import { CalendarDays, Check, ChevronRight, FileText, Paperclip, Shield, Trash2, Upload, X } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { ACCEPTED_FILE_TYPES, EMPLOYMENT_TYPE_LABEL, MAX_FILE_SIZE, STATUS_LABEL } from "@/lib/domain/constants";
import type { AttachmentMeta, BenefitType, Claim, ClaimStatus, Database } from "@/lib/domain/types";
import { fetchFile, uploadFile } from "@/lib/client/api";
import { claimValue, type Entitlement } from "@/lib/domain/rules";
import { cx, dateTH, dateTimeTH, fileSize, money } from "@/lib/format";
import { fullName } from "@/lib/services/core";
import { Alert, Badge, Button, Card, Modal, Select, useToast } from "./ui";

const STATUS_TONE: Record<ClaimStatus, "gray" | "amber" | "blue" | "green" | "red" | "orange" | "violet"> = {
  pending_hr: "amber",
  returned: "orange",
  pending_manager: "blue",
  approved: "violet",
  paid: "green",
  rejected: "red",
  cancelled: "gray",
};

export function StatusBadge({ status }: { status: ClaimStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

export function ClaimCard({ c, db, showEmployee, href, onClick, selected }: { c: Claim; db: Database; showEmployee?: boolean; href?: string; onClick?: () => void; selected?: boolean }) {
  const b = db.benefitTypes.find((x) => x.id === c.benefitTypeId);
  const e = db.employees.find((x) => x.id === c.employeeId);
  const dept = db.departments.find((d) => d.id === e?.departmentId);
  const value = claimValue(c, b);
  const body = (
    <Card className={cx("p-4 transition hover:border-zinc-300", selected && "border-brand-500 ring-4 ring-brand-500/10")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{b?.name}</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {c.no} · {dateTH(c.receiptDate)}
          </p>
          {showEmployee && e && (
            <p className="mt-0.5 truncate text-xs text-zinc-500">
              {fullName(e)} · {dept?.code} · {EMPLOYMENT_TYPE_LABEL[e.employmentType]}
            </p>
          )}
        </div>
        <StatusBadge status={c.status} />
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <p className="text-lg font-semibold tabular">{b?.mode === "assigned" && c.assignedAmount == null ? <span className="text-sm text-zinc-500">รอ HR กำหนดยอด</span> : money(value)}</p>
        <div className="text-right text-xs">
          {c.filedById && <Badge tone="gray">HR ยื่นแทน</Badge>}
          {c.payDate && c.status === "approved" && <p className="text-violet-700">กำหนดจ่าย {dateTH(c.payDate)}</p>}
          {c.status === "paid" && <p className="text-emerald-700">เงินเข้า {dateTH(c.payDate)}</p>}
          {c.status === "returned" && <p className="text-brand-700">ต้องแก้ไข</p>}
        </div>
      </div>
    </Card>
  );
  if (href)
    return (
      <Link href={href} className="block">
        {body}
      </Link>
    );
  if (onClick)
    return (
      <button onClick={onClick} className="block w-full text-left">
        {body}
      </button>
    );
  return body;
}

const ACTION_LABEL: Record<string, string> = {
  submit: "ยื่นคำขอ",
  resubmit: "แก้ไขแล้วส่งใหม่",
  hr_pass: "HR ตรวจผ่าน ส่งต่อหัวหน้า",
  hr_return: "HR ส่งกลับแก้ไข",
  hr_reject: "HR ปฏิเสธคำขอ (คืนสิทธิ์)",
  assign_amount: "HR กำหนดเงินช่วยเหลือ",
  approve: "อนุมัติ",
  reject: "ไม่อนุมัติ (คืนสิทธิ์)",
  mark_paid: "บันทึกจ่ายเงินแล้ว",
  cancel: "ยกเลิกคำขอ",
  edit: "แก้ไขคำขอ",
};

export function Timeline({ c, db }: { c: Claim; db: Database }) {
  return (
    <ol className="relative space-y-4 pl-6 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-zinc-200">
      {c.history.map((h, i) => {
        const actor = db.employees.find((e) => e.id === h.actorId);
        const last = i === c.history.length - 1;
        return (
          <li key={i} className="relative">
            <span className={cx("absolute -left-6 top-1 size-[15px] rounded-full border-[3px] border-white", last ? "bg-brand-500 ring-2 ring-brand-100" : "bg-zinc-300")} />
            <p className="text-sm font-medium">{ACTION_LABEL[h.action] ?? h.action}</p>
            <p className="text-xs text-zinc-500">
              {fullName(actor)} · {dateTimeTH(h.at)}
            </p>
            {h.note && <p className="mt-1 rounded-lg bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-600">{h.note}</p>}
          </li>
        );
      })}
    </ol>
  );
}

export function AttachmentList({ items, canView = true }: { items: AttachmentMeta[]; canView?: boolean }) {
  const [missing, setMissing] = useState<AttachmentMeta | null>(null);
  const [preview, setPreview] = useState<{ url: string; meta: AttachmentMeta } | null>(null);
  const toast = useToast();
  const open = async (a: AttachmentMeta) => {
    let blob: Blob | null;
    try {
      blob = await fetchFile(a.id);
    } catch (e) {
      return toast((e as Error).message, "error");
    }
    if (!blob) return setMissing(a);
    const url = URL.createObjectURL(blob);
    if (a.type.startsWith("image/")) setPreview({ url, meta: a });
    else window.open(url, "_blank", "noopener");
  };
  if (!items.length) return <p className="text-sm text-zinc-500">ไม่มีไฟล์แนบ</p>;
  return (
    <div className="space-y-2">
      {items.map((a) => (
        <div key={a.id} className="flex items-center gap-3 rounded-xl border border-zinc-200 px-3 py-2.5">
          <FileText className="size-5 shrink-0 text-brand-500" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{a.name}</p>
            <p className="text-xs text-zinc-500">
              {a.docType} · {fileSize(a.size)}
            </p>
          </div>
          {canView && (
            <button onClick={() => open(a)} className="text-xs font-medium text-brand-600 hover:underline">
              ดูไฟล์
            </button>
          )}
        </div>
      ))}
      <Modal open={!!missing} onClose={() => setMissing(null)} title={missing?.name ?? ""} size="sm">
        <div className="grid aspect-[3/4] place-items-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50 text-center text-sm text-zinc-500">
          <div>
            <FileText className="mx-auto mb-2 size-10 text-zinc-300" />
            ไม่พบไฟล์จริงในที่เก็บไฟล์
            <br />
            (ไฟล์ตัวอย่างจากข้อมูลสมมติ)
          </div>
        </div>
      </Modal>
      <Modal
        open={!!preview}
        onClose={() => {
          if (preview) URL.revokeObjectURL(preview.url);
          setPreview(null);
        }}
        title={preview?.meta.name ?? ""}
        size="lg"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {preview && <img src={preview.url} alt={preview.meta.name} className="mx-auto max-h-[70dvh] rounded-xl" />}
      </Modal>
    </div>
  );
}

/** แนบเอกสาร: เลือกประเภทเอกสารต่อไฟล์ ไฟล์ถูกเก็บใน file store แยกจากฐานข้อมูลหลัก */
export function AttachmentPicker({ value, onChange, requiredDocs }: { value: AttachmentMeta[]; onChange: (v: AttachmentMeta[]) => void; requiredDocs: string[] }) {
  const toast = useToast();
  const ref = useRef<HTMLInputElement>(null);
  const missing = requiredDocs.filter((d) => !value.some((a) => a.docType === d));
  const [docType, setDocType] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const currentType = docType && requiredDocs.includes(docType) ? docType : missing[0] ?? requiredDocs[0] ?? "อื่น ๆ";

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const added: AttachmentMeta[] = [];
    setUploading(true);
    for (const f of Array.from(files)) {
      if (!ACCEPTED_FILE_TYPES.includes(f.type)) {
        toast(`${f.name}: รองรับเฉพาะ JPG, PNG, WEBP, PDF`, "error");
        continue;
      }
      if (f.size > MAX_FILE_SIZE) {
        toast(`${f.name}: ขนาดเกิน 5 MB`, "error");
        continue;
      }
      try {
        added.push(await uploadFile(f, currentType));
      } catch (e) {
        toast(`${f.name}: ${(e as Error).message}`, "error");
      }
    }
    setUploading(false);
    onChange([...value, ...added]);
    setDocType("");
    if (ref.current) ref.current.value = "";
  };

  return (
    <div className="space-y-2">
      {requiredDocs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {requiredDocs.map((d) => {
            const ok = value.some((a) => a.docType === d);
            return (
              <Badge key={d} tone={ok ? "green" : "gray"} dot={false}>
                {ok ? <Check className="size-3" /> : <Paperclip className="size-3" />} {d}
              </Badge>
            );
          })}
        </div>
      )}
      {value.map((a) => (
        <div key={a.id} className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
          <FileText className="size-5 shrink-0 text-brand-500" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{a.name}</p>
            <p className="text-xs text-zinc-500">
              {a.docType} · {fileSize(a.size)}
            </p>
          </div>
          <button type="button" onClick={() => onChange(value.filter((x) => x.id !== a.id))} className="rounded-full p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600" aria-label={`ลบ ${a.name}`}>
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      <div className="flex flex-col gap-2 rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50/50 p-3 sm:flex-row sm:items-center">
        <Select value={currentType} onChange={(e) => setDocType(e.target.value)} className="h-10 sm:max-w-[240px]" aria-label="ประเภทเอกสาร">
          {[...new Set([...requiredDocs, "อื่น ๆ"])].map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
        <Button type="button" variant="outline-brand" loading={uploading} icon={<Upload className="size-4" />} onClick={() => ref.current?.click()} className="sm:flex-1">
          เลือกไฟล์ / ถ่ายรูป
        </Button>
        <input ref={ref} type="file" accept={ACCEPTED_FILE_TYPES.join(",")} multiple className="hidden" onChange={(e) => onFiles(e.target.files)} data-testid="file-input" />
      </div>
      <p className="text-xs text-zinc-500">รองรับ JPG, PNG, WEBP, PDF ไม่เกิน 5 MB ต่อไฟล์</p>
    </div>
  );
}

export function EntitlementBox({ ent, benefit }: { ent: Entitlement; benefit: BenefitType }) {
  const lines: string[] = [];
  if (ent.annualLimit != null) lines.push(`วงเงิน ${money(ent.annualLimit)}/ปี`);
  if (ent.perClaimLimit != null) lines.push(`สูงสุด ${money(ent.perClaimLimit)} ต่อครั้ง`);
  if (ent.maxTimesPerYear != null) lines.push(`${ent.maxTimesPerYear} ครั้ง/ปี`);
  const headline =
    benefit.mode === "assigned"
      ? "HR เป็นผู้กำหนดยอดเงินช่วยเหลือ"
      : ent.remainingAmount != null
        ? money(ent.remainingAmount)
        : ent.remainingTimes != null
          ? `${ent.remainingTimes} ครั้ง`
          : "ไม่จำกัด";
  return (
    <div className="rounded-2xl bg-ink-900 p-4 text-white">
      <p className="text-xs text-zinc-400">สิทธิ์คงเหลือปีนี้</p>
      <p className="mt-0.5 text-xl font-semibold">{headline}</p>
      <p className="mt-0.5 text-xs text-zinc-400">{lines.join(" · ") || "ไม่จำกัดวงเงิน"}</p>
      {ent.usage.pendingAmount > 0 || ent.usage.pendingTimes > 0 ? (
        <p className="mt-2 text-xs text-amber-300">
          อยู่ระหว่างดำเนินการ {ent.usage.pendingTimes} รายการ{benefit.mode === "claim" ? ` (${money(ent.usage.pendingAmount)})` : ""} — นับรวมในยอดใช้แล้ว
        </p>
      ) : null}
      {!ent.eligible && <p className="mt-2 text-xs text-red-300">ไม่มีสิทธิ์: {ent.reasons.join(", ")}</p>}
    </div>
  );
}

export function PayDateHint({ date, prefix = "ถ้าอนุมัติวันนี้ คาดว่าเงินเข้า", note }: { date: string; prefix?: string; note?: string | null }) {
  return (
    <Alert tone="success" icon={<CalendarDays className="size-4" />}>
      {prefix} <b>{dateTH(date)}</b>
      {note && <span className="block text-xs text-emerald-700/80">{note}</span>}
    </Alert>
  );
}

export function CheckList({ errors, warnings }: { errors: string[]; warnings?: string[] }) {
  if (!errors.length && !warnings?.length)
    return (
      <Alert tone="success" icon={<Check className="size-4" />}>
        ผ่านการตรวจกติกาเบื้องต้น
      </Alert>
    );
  return (
    <div className="space-y-2">
      {errors.map((e) => (
        <Alert key={e} tone="error" icon={<X className="size-4" />}>
          {e}
        </Alert>
      ))}
      {warnings?.map((w) => (
        <Alert key={w} tone="warn" icon={<Shield className="size-4" />}>
          {w}
        </Alert>
      ))}
    </div>
  );
}

export function PinDialog({ open, onClose, onConfirm, amountText }: { open: boolean; onClose: () => void; onConfirm: (pin: string) => Promise<boolean>; amountText: string }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const close = () => {
    setPin("");
    setErr("");
    onClose();
  };
  const submit = async () => {
    setBusy(true);
    const ok = await onConfirm(pin);
    setBusy(false);
    if (ok) close();
    else {
      setErr("PIN ไม่ถูกต้อง");
      setPin("");
    }
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title="ยืนยันตัวตน"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            ย้อนกลับ
          </Button>
          <Button variant="success" disabled={pin.length < 4} loading={busy} onClick={submit}>
            ยืนยันอนุมัติ
          </Button>
        </>
      }
    >
      <div className="py-2 text-center">
        <Shield className="mx-auto size-10 text-brand-500" />
        <p className="mt-3 text-sm text-zinc-600">กรอก PIN เพื่อยืนยันการอนุมัติ {amountText}</p>
        <input
          autoFocus
          inputMode="numeric"
          type="password"
          maxLength={6}
          value={pin}
          onChange={(e) => {
            setErr("");
            setPin(e.target.value.replace(/\D/g, ""));
          }}
          onKeyDown={(e) => e.key === "Enter" && pin.length >= 4 && !busy && submit()}
          aria-label="PIN"
          className="mx-auto mt-4 block h-14 w-44 rounded-2xl border-2 border-brand-200 text-center text-2xl tracking-[0.5em] focus:border-brand-500 focus:outline-none"
        />
        <p className={cx("mt-2 text-xs", err ? "text-red-600" : "text-zinc-400")}>{err || "PIN เดโม: 1234"}</p>
      </div>
    </Modal>
  );
}

export function ClaimRowLink({ c, db, href }: { c: Claim; db: Database; href: string }) {
  const b = db.benefitTypes.find((x) => x.id === c.benefitTypeId);
  const e = db.employees.find((x) => x.id === c.employeeId);
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {b?.name} <span className="font-normal text-zinc-500">· {fullName(e)}</span>
        </p>
        <p className="text-xs text-zinc-500">
          {c.no} · ยื่น {dateTimeTH(c.submittedAt)}
        </p>
      </div>
      <span className="text-sm font-medium tabular">{b?.mode === "assigned" && c.assignedAmount == null ? <span className="text-xs text-zinc-500">รอกำหนดยอด</span> : money(claimValue(c, b))}</span>
      <StatusBadge status={c.status} />
      <ChevronRight className="size-4 text-zinc-300" />
    </Link>
  );
}
