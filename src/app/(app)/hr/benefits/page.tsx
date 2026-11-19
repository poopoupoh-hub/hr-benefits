"use client";
import { Plus, Scale, Settings2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Page } from "@/components/AppShell";
import { FundRounds } from "@/components/FundRounds";
import type { BenefitInput } from "@/lib/services/admin";
import { Alert, Badge, Button, Card, Checkbox, Field, Input, Modal, Select, Switch, Textarea, useAction } from "@/components/ui";
import { BENEFIT_CATEGORIES, DOC_TYPES, EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_LABEL } from "@/lib/domain/constants";
import { todayLocal } from "@/lib/domain/dates";
import { resolveLimit } from "@/lib/domain/rules";
import type { BenefitType, EmploymentType } from "@/lib/domain/types";
import { money } from "@/lib/format";
import { useDB } from "@/lib/hooks";
import { api } from "@/lib/client/api";

const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));
const str = (n: number | null | undefined) => (n == null ? "" : String(n));

function BenefitForm({ initial, onClose }: { initial: BenefitType | null; onClose: () => void }) {
  const act = useAction();
  const [f, setF] = useState<BenefitInput>(
    initial
      ? (({ id: _i, createdAt: _c, updatedAt: _u, ...rest }) => (void _i, void _c, void _u, rest))(initial)
      : {
          code: "",
          name: "",
          category: BENEFIT_CATEGORIES[0],
          description: "",
          mode: "claim",
          eligibleTypes: ["permanent"],
          requiredDocs: ["ใบเสร็จ"],
          minServiceDays: null,
          claimWindowDays: null,
          sensitive: false,
          active: true,
        },
  );
  const [customDoc, setCustomDoc] = useState("");
  /** วงเงินเริ่มต้นทุกระดับ — ใช้เฉพาะตอนสร้างสวัสดิการใหม่ (แก้ภายหลังต้องส่งคำขอแก้วงเงิน) */
  const [lim, setLim] = useState({ perClaim: "", perYear: "", maxCount: "" });
  const set = <K extends keyof BenefitInput>(k: K, v: BenefitInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const toggleType = (t: EmploymentType, on: boolean) => set("eligibleTypes", on ? [...f.eligibleTypes, t] : f.eligibleTypes.filter((x) => x !== t));
  const toggleDoc = (d: string, on: boolean) => set("requiredDocs", on ? [...f.requiredDocs, d] : f.requiredDocs.filter((x) => x !== d));
  const docs = [...new Set([...DOC_TYPES.filter((d) => d !== "อื่น ๆ"), ...f.requiredDocs])];

  const save = () => {
    const l = { minLevel: 1, maxLevel: 4, perClaim: numOrNull(lim.perClaim), perYear: numOrNull(lim.perYear), maxCount: numOrNull(lim.maxCount) };
    const initialLimits = !initial && (l.perClaim != null || l.perYear != null || l.maxCount != null) ? [l] : [];
    act(() => api.saveBenefit(f, initial?.id, initialLimits), initial ? "บันทึกการตั้งค่าแล้ว" : "เพิ่มประเภทสวัสดิการแล้ว").then((ok) => ok && onClose());
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={initial ? `ตั้งค่า: ${initial.name}` : "เพิ่มประเภทสวัสดิการ"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button onClick={save}>บันทึก</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
          <Field label="รหัส" required>
            <Input value={f.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="MED" />
          </Field>
          <Field label="ชื่อสวัสดิการ" required>
            <Input value={f.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
        </div>
        <Field label="หมวด (ใช้จัดกลุ่มในหน้ายื่นเบิก)" required>
          <Select value={f.category} onChange={(e) => set("category", e.target.value)}>
            {[...new Set([...BENEFIT_CATEGORIES, f.category])].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="คำอธิบาย">
          <Textarea value={f.description ?? ""} onChange={(e) => set("description", e.target.value)} className="min-h-[60px]" />
        </Field>
        <Field label="รูปแบบการเบิก">
          <Select value={f.mode} onChange={(e) => set("mode", e.target.value as BenefitInput["mode"])}>
            <option value="claim">พนักงานแจ้งยอดตามใบเสร็จ</option>
            <option value="assigned">HR กำหนดเงินช่วยเหลือ (เปิดเป็นรอบงบ เช่น ภัยพิบัติ)</option>
          </Select>
        </Field>
        {initial ? (
          <Alert tone="info">วงเงินแก้ที่เมนู &quot;วงเงินตามระดับ&quot; — ต้องส่งคำขอให้ HR คนอื่นอนุมัติก่อนมีผล</Alert>
        ) : (
          <div>
            <p className="mb-2 text-[13px] font-medium">วงเงินเริ่มต้น (ทุกระดับ 1–4 — แยกตามระดับภายหลังได้ที่เมนูวงเงินตามระดับ)</p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="ต่อครั้ง (บาท)" hint="ว่าง = ไม่จำกัด">
                <Input type="number" min={0} value={lim.perClaim} onChange={(e) => setLim({ ...lim, perClaim: e.target.value })} />
              </Field>
              <Field label="ต่อปี (บาท)" hint="ว่าง = ไม่จำกัด">
                <Input type="number" min={0} value={lim.perYear} onChange={(e) => setLim({ ...lim, perYear: e.target.value })} />
              </Field>
              <Field label="ครั้ง/ปี" hint="ว่าง = ไม่จำกัด">
                <Input type="number" min={0} value={lim.maxCount} onChange={(e) => setLim({ ...lim, maxCount: e.target.value })} />
              </Field>
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 text-[13px] font-medium">ประเภทพนักงานที่มีสิทธิ์</p>
          <div className="grid gap-2 rounded-xl border border-zinc-200 p-3 sm:grid-cols-3">
            {EMPLOYMENT_TYPES.filter((t) => t !== "terminated").map((t) => (
              <Checkbox key={t} checked={f.eligibleTypes.includes(t)} onChange={(v) => toggleType(t, v)} label={EMPLOYMENT_TYPE_LABEL[t]} />
            ))}
            <p className="text-xs text-zinc-500 sm:col-span-3">พนักงานพ้นสภาพไม่มีสิทธิ์โดยอัตโนมัติ</p>
          </div>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-medium">เอกสารที่ต้องแนบ</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {docs.map((d) => (
              <Checkbox key={d} checked={f.requiredDocs.includes(d)} onChange={(v) => toggleDoc(d, v)} label={d} />
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <Input value={customDoc} onChange={(e) => setCustomDoc(e.target.value)} placeholder="เพิ่มชื่อเอกสารอื่น" className="h-9" />
            <Button
              size="sm"
              variant="secondary"
              className="h-9"
              disabled={!customDoc.trim()}
              onClick={() => {
                toggleDoc(customDoc.trim(), true);
                setCustomDoc("");
              }}
            >
              เพิ่ม
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="อายุงานขั้นต่ำ (วัน)" hint="ว่าง = ไม่กำหนด">
            <Input type="number" min={0} value={str(f.minServiceDays)} onChange={(e) => set("minServiceDays", numOrNull(e.target.value))} />
          </Field>
          <Field label="ยื่นภายใน (วัน) นับจากวันในเอกสาร" hint="ว่าง = ไม่กำหนด">
            <Input type="number" min={0} value={str(f.claimWindowDays)} onChange={(e) => set("claimWindowDays", numOrNull(e.target.value))} />
          </Field>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-zinc-200 p-3">
          <div>
            <p className="text-sm font-medium">ข้อมูลสุขภาพ (Sensitive)</p>
            <p className="text-xs text-zinc-500">เอกสารแนบจะไม่แสดงกับผู้ที่ไม่เกี่ยวข้อง (PDPA)</p>
          </div>
          <Switch checked={f.sensitive} onChange={(v) => set("sensitive", v)} label="ข้อมูลสุขภาพ" />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-zinc-200 p-3">
          <div>
            <p className="text-sm font-medium">เปิดใช้งาน</p>
            <p className="text-xs text-zinc-500">ปิดแล้วพนักงานจะยื่นใหม่ไม่ได้ คำขอเดิมยังดำเนินการต่อได้</p>
          </div>
          <Switch checked={f.active} onChange={(v) => set("active", v)} label="เปิดใช้งาน" />
        </div>
      </div>
    </Modal>
  );
}

function limitSummary(db: ReturnType<typeof useDB>, b: BenefitType, today: string) {
  if (b.mode === "assigned") return "HR กำหนดยอดตามรอบงบ";
  const parts = [1, 2, 3, 4].map((lv) => {
    const l = resolveLimit(db.benefitLimits, b.id, lv, today);
    if (!l) return `ระดับ ${lv}: -`;
    const x = [l.perClaim != null && `ครั้งละ ${money(l.perClaim)}`, l.perYear != null && `ปีละ ${money(l.perYear)}`, l.maxCount != null && `${l.maxCount} ครั้ง`].filter(Boolean).join(" · ");
    return `ระดับ ${lv}: ${x}`;
  });
  return parts.join(" | ");
}

export default function BenefitsPage() {
  const db = useDB();
  const [edit, setEdit] = useState<BenefitType | "new" | null>(null);
  const today = todayLocal();
  return (
    <Page
      title="ประเภทสวัสดิการ"
      perm="benefit.manage"
      wide
      actions={
        <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEdit("new")}>
          เพิ่ม
        </Button>
      }
    >
      <Alert tone="info" className="mb-4">
        แก้ชื่อ หมวด เอกสาร และสิทธิ์ตามประเภทพนักงานได้ที่นี่ · วงเงินแยกตามระดับตำแหน่ง แก้ที่{" "}
        <Link href="/hr/limits" className="font-medium underline">
          วงเงินตามระดับ
        </Link>{" "}
        (ต้องให้ HR คนอื่นอนุมัติ)
      </Alert>
      <div className="grid gap-3 lg:grid-cols-2">
        {db.benefitTypes.map((b) => (
          <Card key={b.id} className={`p-4 ${b.active ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold">
                  {b.name} <span className="text-xs font-normal text-zinc-400">{b.code}</span>
                </p>
                <p className="text-xs text-zinc-500">หมวด {b.category}</p>
                <p className="mt-1 flex gap-1 text-xs text-zinc-600">
                  <Scale className="mt-0.5 size-3.5 shrink-0 text-zinc-400" />
                  {limitSummary(db, b, today)}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  สิทธิ์: {b.eligibleTypes.map((t) => EMPLOYMENT_TYPE_LABEL[t as EmploymentType]).join(", ")} · เอกสาร: {b.requiredDocs.join(", ") || "-"}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {!b.active && <Badge tone="red">ปิดใช้งาน</Badge>}
                  {b.sensitive && <Badge tone="violet">ข้อมูลสุขภาพ</Badge>}
                  {b.minServiceDays ? <Badge>อายุงาน ≥ {b.minServiceDays} วัน</Badge> : null}
                  {b.claimWindowDays ? <Badge>ยื่นภายใน {b.claimWindowDays} วัน</Badge> : null}
                </div>
              </div>
              <Button size="sm" variant="secondary" icon={<Settings2 className="size-3.5" />} onClick={() => setEdit(b)}>
                แก้ไข
              </Button>
            </div>
          </Card>
        ))}
      </div>
      <FundRounds />
      {edit && <BenefitForm initial={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </Page>
  );
}
