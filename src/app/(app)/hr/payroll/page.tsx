"use client";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Page } from "@/components/AppShell";
import { Alert, Button, Card, Field, Input, SectionTitle, Select, useAction } from "@/components/ui";
import { beYear, todayLocal } from "@/lib/domain/dates";
import { payDateExplain } from "@/lib/domain/rules";
import type { Holiday, Settings } from "@/lib/domain/types";
import { dateLongTH, dateTH } from "@/lib/format";
import { useDB } from "@/lib/hooks";
import { api } from "@/lib/client/api";

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export default function PayrollSettings() {
  const db = useDB();
  const act = useAction();
  const [cutoff, setCutoff] = useState(db.settings.cutoffDay);
  const [mode, setMode] = useState<Settings["orgBudgetMode"]>(db.settings.orgBudgetMode);
  const [holidays, setHolidays] = useState<Holiday[]>(db.settings.holidays);
  const [nd, setNd] = useState({ date: "", name: "" });
  const [filterYear, setFilterYear] = useState(todayLocal().slice(0, 4));
  const dirty = cutoff !== db.settings.cutoffDay || mode !== db.settings.orgBudgetMode || JSON.stringify(holidays) !== JSON.stringify(db.settings.holidays);

  const today = todayLocal();
  const preview = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 + i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const early = `${y}-${String(m).padStart(2, "0")}-${String(Math.min(cutoff, 28)).padStart(2, "0")}`;
    const late = `${y}-${String(m).padStart(2, "0")}-${String(Math.min(cutoff + 1, 28)).padStart(2, "0")}`;
    return { label: `${MONTHS[m - 1]} ${beYear(y)}`, early: payDateExplain(early, { cutoffDay: cutoff, holidays }), late: payDateExplain(late, { cutoffDay: cutoff, holidays }) };
  });
  const years = [...new Set(holidays.map((h) => h.date.slice(0, 4)))].sort();

  return (
    <Page title="วันตัดรอบ / วันหยุด" perm="payroll.settings" wide>
      <Alert tone="warn" icon={<CalendarDays className="size-4" />}>
        อนุมัติภายในวันที่ {cutoff} → จ่ายสิ้นเดือนนั้น · หลังวันที่ {cutoff} → สิ้นเดือนถัดไป · ตรงวันหยุด/เสาร์-อาทิตย์ เลื่อนเป็นวันทำการก่อนหน้า
      </Alert>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <Card className="space-y-3 p-4">
            <Field label="วันตัดรอบ (วันที่ของเดือน)" hint="1–28">
              <Input type="number" min={1} max={28} value={cutoff} onChange={(e) => setCutoff(Math.max(1, Math.min(28, Number(e.target.value) || 1)))} />
            </Field>
            <Field label="เมื่อยอดเบิกเกินงบประมาณองค์กร">
              <Select value={mode} onChange={(e) => setMode(e.target.value as Settings["orgBudgetMode"])}>
                <option value="warn">เตือน แต่ยังยื่นได้</option>
                <option value="block">ไม่อนุญาตให้ยื่น</option>
              </Select>
            </Field>
          </Card>

          <SectionTitle className="mt-6">ตัวอย่างวันจ่ายเงิน 6 เดือนข้างหน้า</SectionTitle>
          <Card className="divide-y divide-zinc-100">
            {preview.map((p) => (
              <div key={p.label} className="grid grid-cols-[72px_1fr_1fr] gap-2 px-4 py-2.5 text-sm">
                <span className="font-medium">{p.label}</span>
                <span>
                  <span className="block text-[11px] text-zinc-500">อนุมัติ ≤ วันที่ {cutoff}</span>
                  {dateTH(p.early.actual)}
                  {p.early.shifted && <span className="block text-[11px] text-brand-600">เลื่อน: {p.early.reason}</span>}
                </span>
                <span>
                  <span className="block text-[11px] text-zinc-500">อนุมัติหลังวันที่ {cutoff}</span>
                  {dateTH(p.late.actual)}
                  {p.late.shifted && <span className="block text-[11px] text-brand-600">เลื่อน: {p.late.reason}</span>}
                </span>
              </div>
            ))}
          </Card>
        </div>

        <div>
          <SectionTitle
            className="mt-0"
            action={
              <Select value={filterYear} onChange={(e) => setFilterYear(e.target.value)} className="h-9 w-28" aria-label="ปี">
                {years.map((y) => (
                  <option key={y} value={y}>
                    {beYear(Number(y))}
                  </option>
                ))}
              </Select>
            }
          >
            ตารางวันหยุดบริษัท
          </SectionTitle>
          <Card className="p-3">
            <div className="flex gap-2">
              <Input type="date" value={nd.date} onChange={(e) => setNd({ ...nd, date: e.target.value })} className="h-10 w-40" aria-label="วันที่" />
              <Input value={nd.name} onChange={(e) => setNd({ ...nd, name: e.target.value })} placeholder="ชื่อวันหยุด" className="h-10" />
              <Button
                className="shrink-0"
                icon={<Plus className="size-4" />}
                disabled={!nd.date || !nd.name.trim()}
                onClick={() => {
                  if (holidays.some((h) => h.date === nd.date)) return;
                  setHolidays([...holidays, { date: nd.date, name: nd.name.trim() }].sort((a, b) => a.date.localeCompare(b.date)));
                  setFilterYear(nd.date.slice(0, 4));
                  setNd({ date: "", name: "" });
                }}
                aria-label="เพิ่มวันหยุด"
              />
            </div>
            <div className="mt-2 divide-y divide-zinc-100">
              {holidays
                .filter((h) => h.date.startsWith(filterYear))
                .map((h) => (
                  <div key={h.date} className="flex items-center justify-between py-2 text-sm">
                    <span>
                      <span className="font-medium">{h.name}</span>
                      <span className="block text-xs text-zinc-500">{dateLongTH(h.date)}</span>
                    </span>
                    <button onClick={() => setHolidays(holidays.filter((x) => x.date !== h.date))} className="p-1.5 text-zinc-400 hover:text-red-600" aria-label={`ลบ ${h.name}`}>
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] mt-6 flex justify-end gap-2 lg:bottom-4">
        {dirty && (
          <Button
            variant="secondary"
            onClick={() => {
              setCutoff(db.settings.cutoffDay);
              setMode(db.settings.orgBudgetMode);
              setHolidays(db.settings.holidays);
            }}
          >
            ยกเลิกการแก้ไข
          </Button>
        )}
        <Button disabled={!dirty} onClick={() => act(() => api.updatePayrollSettings({ cutoffDay: cutoff, holidays, orgBudgetMode: mode }), "บันทึกการตั้งค่าแล้ว")}>
          บันทึกการตั้งค่า
        </Button>
      </div>
    </Page>
  );
}
