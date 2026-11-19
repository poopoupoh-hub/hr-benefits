"use client";
import { CalendarDays, Check, ChevronRight, FileText, Paperclip, Shield, Trash2, Upload, X } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { ACCEPTED_FILE_TYPES, EMPLOYMENT_TYPE_LABEL, MAX_FILE_SIZE, STATUS_LABEL } from "@/lib/domain/constants";
import type { AttachmentMeta, BenefitType, Claim, ClaimStatus, Database } from "@/lib/domain/types";
import { fetchFile, uploadFile } from "@/lib/client/api";
import type { Entitlement } from "@/lib/domain/rules";
import { cx, dateTH, dateTimeTH, fileSize, money } from "@/lib/format";
import { fullName } from "@/lib/services/core";
import { Alert, Badge, Button, Card, Modal, Select, useToast } from "./ui";

const STATUS_TONE: Record<ClaimStatus, "gray" | "amber" | "blue" | "green" | "red" | "orange" | "violet"> = {
  pending_hr: "amber",
  pending_manager: "blue",
  returned: "orange",
  approved: "violet",
  paid: "green",
  rejected: "red",
};

/** ยอดที่แสดงบนการ์ด: ยอดเบิกได้จริง (โหมด HR กำหนดยอด = ยังไม่กำหนดจนกว่าอนุมัติ) */
export function claimAmountText(c: Claim, b?: BenefitType) {
  if (b?.mode === "assigned" && !c.amountApproved) return null;
  return money(c.amountApproved);
}

export function StatusBadge({ status }: { status: ClaimStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

export function ClaimCard({ c, db, showEmployee, href, onClick, selected }: { c: Claim; db: Database; showEmployee?: boolean; href?: string; onClick?: () => void; selected?: boolean }) {
  const b = db.benefitTypes.find((x) => x.id === c.benefitTypeId);
  const e = db.employees.find((x) => x.id === c.employeeId);
  const dept = db.departments.find((d) => d.id === e?.departmentId);
  const amount = claimAmountText(c, b);
  const cut = b?.mode !== "assigned" && c.amountApproved < c.amountRequested;
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
        <div>
          <p className="text-lg font-semibold tabular">{amount ?? <span className="text-sm text-zinc-500">รอ HR กำหนดยอด</span>}</p>
          {cut && <p className="text-[11px] text-zinc-500 tabular">ขอเบิก {money(c.amountRequested)}</p>}
        </div>
        <div className="text-right text-xs">
          {c.status === "pending_hr" && <p className="text-amber-700">ขั้นที่ 1/2 · HR ตรวจเอกสาร</p>}
          {c.status === "pending_manager" && (
            <p className="text-sky-700">ขั้นที่ 2/2 · รอ {db.employees.find((x) => x.id === c.approverId)?.firstName ?? "หัวหน้า"} อนุมัติ</p>
          )}
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

type StepState = "done" | "current" | "warn" | "fail" | "todo";

/** แถบขั้นตอน: ยื่น → HR ตรวจเอกสาร → หัวหน้าอนุมัติ → บัญชีจ่าย พร้อมชื่อผู้ดำเนินการแต่ละขั้น */
export function FlowStepper({ c, db }: { c: Claim; db: Database }) {
  const name = (id?: string | null) => (id ? fullName(db.employees.find((e) => e.id === id)) : null);
  const rejectedAtHr = c.status === "rejected" && !c.verifiedById;
  const rejectedAtMgr = c.status === "rejected" && !!c.verifiedById;
  const steps: { label: string; who: string; state: StepState; detail: string | null }[] = [
    { label: "ยื่นคำขอ", who: "พนักงาน", state: c.status === "returned" ? "warn" : "done", detail: c.status === "returned" ? "รอผู้ยื่นแก้ไข" : name(c.employeeId) },
    {
      label: "ตรวจเอกสาร",
      who: "HR",
      state: c.status === "pending_hr" ? "current" : rejectedAtHr ? "fail" : c.status === "returned" ? "todo" : "done",
      detail: c.status === "pending_hr" ? "กำลังรอ HR" : rejectedAtHr ? `ไม่ผ่าน · ${name(c.decidedById)}` : c.status === "returned" ? null : name(c.verifiedById),
    },
    {
      label: "อนุมัติ",
      who: "หัวหน้างาน",
      state: c.status === "pending_manager" ? "current" : rejectedAtMgr ? "fail" : c.status === "approved" || c.status === "paid" ? "done" : "todo",
      detail: c.status === "pending_manager" ? `รอ ${name(c.approverId) ?? "หัวหน้า"}` : rejectedAtMgr ? `ไม่อนุมัติ · ${name(c.decidedById)}` : c.status === "approved" || c.status === "paid" ? name(c.decidedById) : null,
    },
    {
      label: "จ่ายเงิน",
      who: "บัญชี",
      state: c.status === "paid" ? "done" : c.status === "approved" ? "current" : "todo",
      detail: c.status === "approved" && c.payDate ? `กำหนด ${dateTH(c.payDate)}` : c.status === "paid" ? "จ่ายแล้ว" : null,
    },
  ];
  const dot: Record<StepState, string> = {
    done: "bg-emerald-500 text-white",
    current: "bg-brand-500 text-white ring-4 ring-brand-100",
    warn: "bg-amber-500 text-white ring-4 ring-amber-100",
    fail: "bg-red-500 text-white",
    todo: "bg-zinc-200 text-zinc-500",
  };
  return (
    <ol className="grid grid-cols-4 gap-1" aria-label="ขั้นตอนคำขอ">
      {steps.map((st, i) => (
        <li key={st.label} className="relative flex flex-col items-center text-center" aria-current={st.state === "current" ? "step" : undefined}>
          {i > 0 && <span aria-hidden className={cx("absolute right-1/2 top-3.5 h-0.5 w-full -translate-x-3.5", st.state === "todo" ? "bg-zinc-200" : "bg-emerald-300")} />}
          <span className={cx("relative z-10 grid size-7 place-items-center rounded-full text-xs font-semibold", dot[st.state])}>
            {st.state === "done" ? <Check className="size-4" /> : st.state === "fail" ? <X className="size-4" /> : i + 1}
          </span>
          <span className="mt-1.5 text-[12.5px] font-medium leading-tight">{st.label}</span>
          <span className="text-[11px] text-zinc-500">{st.who}</span>
          {st.detail && <span className={cx("mt-0.5 line-clamp-2 text-[11px] leading-tight", st.state === "fail" ? "text-red-600" : st.state === "current" ? "text-brand-600" : "text-zinc-500")}>{st.detail}</span>}
        </li>
      ))}
    </ol>
  );
}

const ACTION_LABEL: Record<string, string> = {
  submit: "ยื่นคำขอ",
  resubmit: "แก้ไขแล้วส่งใหม่",
  edit: "แก้ไขคำขอ",
  verify: "HR ตรวจเอกสารผ่าน → ส่งหัวหน้าอนุมัติ",
  approve: "หัวหน้าอนุมัติ",
  reject: "ไม่อนุมัติ (คืนสิทธิ์)",
  return: "ส่งกลับแก้ไข",
  mark_paid: "บันทึกการจ่ายเงิน",
  change_result: "แก้ผลตามคำขอแก้ไข (HR อีกคนอนุมัติ)",
  // ข้อมูลเก่าก่อนปรับระบบ
  hr_pass: "HR ตรวจผ่าน",
  assign_amount: "HR กำหนดเงินช่วยเหลือ",
  cancel: "ยกเลิกคำขอ",
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

/** แนบเอกสาร: เลือกประเภทเอกสารต่อไฟล์ ไฟล์ถูกเก็บใน IndexedDB แยกจากข้อมูลหลัก */
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
  if (ent.perClaim != null) lines.push(`ต่อครั้ง ${money(ent.perClaim)}`);
  if (ent.perYear != null) lines.push(`ต่อปี ${money(ent.perYear)}`);
  if (ent.maxCount != null) lines.push(`${ent.maxCount} ครั้ง/ปี`);
  const headline =
    benefit.mode === "assigned"
      ? "HR เป็นผู้กำหนดยอดเงินช่วยเหลือ"
      : !ent.limit
        ? "ไม่มีวงเงินสำหรับระดับของคุณ"
        : ent.remainingAmount != null
          ? money(ent.remainingAmount)
          : ent.remainingTimes != null
            ? `${ent.remainingTimes} ครั้ง`
            : "ไม่จำกัด";
  return (
    <div className="rounded-2xl bg-ink-900 p-4 text-white">
      <p className="text-xs text-zinc-400">สิทธิ์คงเหลือปีนี้ · ระดับ {ent.level}</p>
      <p className="mt-0.5 text-xl font-semibold">{headline}</p>
      <p className="mt-0.5 text-xs text-zinc-400">{lines.join(" · ") || "ไม่จำกัดวงเงิน"}</p>
      {ent.remainingAmount != null && ent.remainingTimes != null && <p className="mt-0.5 text-xs text-zinc-400">เหลือ {ent.remainingTimes} ครั้ง</p>}
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

/** Dialog ยืนยันสำหรับทุกปุ่มที่กระทบเงิน — แสดงเลขคำขอ + ยอดเงินก่อนกดยืนยัน */
export function ConfirmMoneyDialog({
  open,
  onClose,
  onConfirm,
  title,
  claimNo,
  amount,
  detail,
  confirmLabel,
  tone = "success",
  disabled,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<boolean> | void;
  title: string;
  claimNo?: string;
  amount?: number | null;
  detail?: React.ReactNode;
  confirmLabel: string;
  tone?: "success" | "danger" | "primary";
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const ok = await onConfirm();
    setBusy(false);
    if (ok !== false) onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button variant={tone} disabled={disabled} loading={busy} onClick={submit}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {(claimNo || amount != null) && (
          <div className="rounded-2xl bg-zinc-50 p-4 text-center">
            {claimNo && <p className="text-sm text-zinc-500">เลขคำขอ {claimNo}</p>}
            {amount != null && <p className="mt-1 text-2xl font-semibold tabular">{money(amount)}</p>}
          </div>
        )}
        {detail && <div className="text-sm text-zinc-600">{detail}</div>}
        {children}
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
      <span className="text-sm font-medium tabular">{claimAmountText(c, b) ?? <span className="text-xs text-zinc-500">รอกำหนดยอด</span>}</span>
      <StatusBadge status={c.status} />
      <ChevronRight className="size-4 text-zinc-300" />
    </Link>
  );
}
