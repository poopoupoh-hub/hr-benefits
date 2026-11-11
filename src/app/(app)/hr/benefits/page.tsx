"use client";
import { Plus, Settings2 } from "lucide-react";
import { useState } from "react";
import { Page } from "@/components/AppShell";
import type { BenefitInput } from "@/lib/services/admin";
import { Alert, Badge, Button, Card, Checkbox, Field, Input, Modal, Progress, Select, Switch, Textarea, useAction } from "@/components/ui";
import { DOC_TYPES, EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_LABEL } from "@/lib/domain/constants";
import { todayLocal, yearOf } from "@/lib/domain/dates";
import { orgBudgetOf } from "@/lib/domain/rules";
import type { BenefitType, EmploymentType } from "@/lib/domain/types";
import { money } from "@/lib/format";
import { useDB } from "@/lib/hooks";
import { api } from "@/lib/client/api";

const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));
const str = (n: number | null | undefined) => (n == null ? "" : String(n));

function limitText(b: Pick<BenefitType, "annualLimit" | "perClaimLimit" | "maxTimesPerYear" | "mode">) {
  const p: string[] = [];
  if (b.mode === "assigned") p.push("HR กำหนดยอดตามรอบงบ");
  if (b.annualLimit != null) p.push(`วงเงิน ${money(b.annualLimit)} / ปี`);
  if (b.perClaimLimit != null) p.push(`ครั้งละ ≤ ${money(b.perClaimLimit)}`);
  if (b.maxTimesPerYear != null) p.push(`ปีละ ≤ ${b.maxTimesPerYear} ครั้ง`);
  return p.join(" · ");
}

function BenefitForm({ initial, onClose }: { initial: BenefitType | null; onClose: () => void }) {
  const act = useAction();
  const [f, setF] = useState<BenefitInput>(
    initial
      ? (({ id: _i, createdAt: _c, updatedAt: _u, ...rest }) => (void _i, void _c, void _u, rest))(initial)
      : {
          code: "",
          name: "",
          description: "",
          mode: "claim",
          annualLimit: null,
          perClaimLimit: null,
          maxTimesPerYear: null,
          eligibleTypes: ["permanent"],
          typeOverrides: {},
          requiredDocs: ["ใบเสร็จ"],
          minServiceDays: null,
          claimWindowDays: null,
          sensitive: false,
          active: true,
        },
  );
  const [customDoc, setCustomDoc] = useState("");
  const set = <K extends keyof BenefitInput>(k: K, v: BenefitInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const toggleType = (t: EmploymentType, on: boolean) => set("eligibleTypes", on ? [...f.eligibleTypes, t] : f.eligibleTypes.filter((x) => x !== t));
  const toggleDoc = (d: string, on: boolean) => set("requiredDocs", on ? [...f.requiredDocs, d] : f.requiredDocs.filter((x) => x !== d));
  const docs = [...new Set([...DOC_TYPES.filter((d) => d !== "อื่น ๆ"), ...f.requiredDocs])];

  const save = () => {
    const overrides = Object.fromEntries(Object.entries(f.typeOverrides ?? {}).filter(([t, v]) => f.eligibleTypes.includes(t as EmploymentType) && v && v.annualLimit != null));
    act(() => api.saveBenefit({ ...f, typeOverrides: overrides }, initial?.id), initial ? "บันทึกการตั้งค่าแล้ว" : "เพิ่มประเภทสวัสดิการแล้ว").then((ok) => ok && onClose());
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
        <Field label="คำอธิบาย">
          <Textarea value={f.description ?? ""} onChange={(e) => set("description", e.target.value)} className="min-h-[60px]" />
        </Field>
        <Field label="รูปแบบการเบิก">
          <Select value={f.mode} onChange={(e) => set("mode", e.target.value as BenefitInput["mode"])}>
            <option value="claim">พนักงานแจ้งยอดตามใบเสร็จ</option>
            <option value="assigned">HR กำหนดเงินช่วยเหลือ (เปิดเป็นรอบงบ เช่น ภัยพิบัติ)</option>
          </Select>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="วงเงิน/ปี (บาท)" hint="ว่าง = ไม่จำกัด">
            <Input type="number" min={0} value={str(f.annualLimit)} onChange={(e) => set("annualLimit", numOrNull(e.target.value))} />
          </Field>
          <Field label="วงเงิน/ครั้ง" hint="ว่าง = ไม่จำกัด">
            <Input type="number" min={0} value={str(f.perClaimLimit)} onChange={(e) => set("perClaimLimit", numOrNull(e.target.value))} />
          </Field>
          <Field label="ครั้ง/ปี" hint="ว่าง = ไม่จำกัด">
            <Input type="number" min={0} value={str(f.maxTimesPerYear)} onChange={(e) => set("maxTimesPerYear", numOrNull(e.target.value))} />
          </Field>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-medium">ประเภทพนักงานที่มีสิทธิ์ และวงเงินเฉพาะประเภท</p>
          <div className="space-y-2 rounded-xl border border-zinc-200 p-3">
            {EMPLOYMENT_TYPES.filter((t) => t !== "terminated").map((t) => {
              const on = f.eligibleTypes.includes(t);
              return (
                <div key={t} className="flex items-center gap-3">
                  <div className="w-32">
                    <Checkbox checked={on} onChange={(v) => toggleType(t, v)} label={EMPLOYMENT_TYPE_LABEL[t]} />
                  </div>
                  <Input
                    type="number"
                    min={0}
                    disabled={!on}
                    className="h-9 flex-1"
                    placeholder={f.annualLimit != null ? `ใช้ค่าทั่วไป (${f.annualLimit.toLocaleString("th-TH")})` : "วงเงิน/ปี เฉพาะประเภทนี้"}
                    value={str(f.typeOverrides?.[t]?.annualLimit)}
                    onChange={(e) => set("typeOverrides", { ...f.typeOverrides, [t]: { annualLimit: numOrNull(e.target.value) } })}
                    aria-label={`วงเงินเฉพาะ ${EMPLOYMENT_TYPE_LABEL[t]}`}
                  />
                </div>
              );
            })}
            <p className="text-xs text-zinc-500">พนักงานพ้นสภาพไม่มีสิทธิ์โดยอัตโนมัติ</p>
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

export default function BenefitsPage() {
  const db = useDB();
  const [edit, setEdit] = useState<BenefitType | "new" | null>(null);
  const today = todayLocal();
  const year = yearOf(today);
  return (
    <Page
      title="ตั้งค่าสวัสดิการ"
      perm="benefit.manage"
      wide
      actions={
        <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEdit("new")}>
          เพิ่ม
        </Button>
      }
    >
      <Alert tone="info" className="mb-4">
        แตะรายการเพื่อแก้ไขวงเงิน — การเปลี่ยนแปลงมีผลทันทีกับคำขอที่ยื่นใหม่ · รองรับการเพิ่มประเภทสวัสดิการได้ไม่จำกัด
      </Alert>
      <div className="grid gap-3 lg:grid-cols-2">
        {db.benefitTypes.map((b) => {
          const ob = orgBudgetOf(b, year, db.employees, db.claims, db.budgets, today);
          const pct = ob.budget ? ((ob.used + ob.pending) / ob.budget) * 100 : 0;
          return (
            <Card key={b.id} className={`p-4 ${b.active ? "" : "opacity-60"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {b.name} <span className="text-xs font-normal text-zinc-400">{b.code}</span>
                  </p>
                  <p className="text-sm text-zinc-600">{limitText(b)}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    สิทธิ์: {b.eligibleTypes.map((t) => EMPLOYMENT_TYPE_LABEL[t] + (b.typeOverrides?.[t]?.annualLimit != null ? ` (${money(b.typeOverrides[t]!.annualLimit!)})` : "")).join(", ")} · เอกสาร:{" "}
                    {b.requiredDocs.join(", ") || "-"}
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
              {ob.budget != null && (
                <>
                  <Progress value={pct} className="mt-3" tone={pct > 90 ? "red" : "brand"} />
                  <p className="mt-1.5 text-xs text-zinc-500">
                    งบปีนี้ {money(ob.budget)} · ใช้/จอง {money(ob.used + ob.pending)} ({pct.toFixed(0)}%)
                  </p>
                </>
              )}
            </Card>
          );
        })}
      </div>
      {edit && <BenefitForm initial={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </Page>
  );
}
