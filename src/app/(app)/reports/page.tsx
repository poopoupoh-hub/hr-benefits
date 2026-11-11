"use client";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { Page } from "@/components/AppShell";
import { Button, Card, SectionTitle, Select } from "@/components/ui";
import { beYear, todayLocal, yearOf } from "@/lib/domain/dates";
import { claimValue } from "@/lib/domain/rules";
import { downloadCSV, money } from "@/lib/format";
import { useCan, useDB } from "@/lib/hooks";
import { fullName } from "@/lib/services/core";

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export default function Reports() {
  const db = useDB();
  const can = useCan();
  const [year, setYear] = useState(yearOf(todayLocal()));
  const withNames = can("employee.view");

  const data = useMemo(() => {
    const approved = db.claims.filter((c) => (c.status === "approved" || c.status === "paid") && c.payDate && yearOf(c.payDate) === year);
    const v = (c: (typeof approved)[number]) => claimValue(c, db.benefitTypes.find((b) => b.id === c.benefitTypeId));
    const byMonth = MONTHS.map((_, i) => approved.filter((c) => Number(c.payDate!.slice(5, 7)) === i + 1).reduce((s, c) => s + v(c), 0));
    const byBenefit = db.benefitTypes.map((b) => ({ name: b.name, sum: approved.filter((c) => c.benefitTypeId === b.id).reduce((s, c) => s + v(c), 0), n: approved.filter((c) => c.benefitTypeId === b.id).length }));
    const byDept = db.departments.map((d) => ({
      name: d.name,
      sum: approved.filter((c) => db.employees.find((e) => e.id === c.employeeId)?.departmentId === d.id).reduce((s, c) => s + v(c), 0),
    }));
    return { approved, byMonth, byBenefit, byDept, total: approved.reduce((s, c) => s + v(c), 0), paid: approved.filter((c) => c.status === "paid").reduce((s, c) => s + v(c), 0) };
  }, [db, year]);
  const maxM = Math.max(1, ...data.byMonth);

  const exportSummary = () =>
    downloadCSV(`benefit-summary-${beYear(year)}.csv`, [
      ["ประเภทสวัสดิการ", "จำนวนรายการ", "ยอดอนุมัติ (บาท)"],
      ...data.byBenefit.map((b) => [b.name, b.n, b.sum]),
      ["รวม", data.approved.length, data.total],
    ]);
  const exportDetail = () =>
    downloadCSV(`benefit-detail-${beYear(year)}.csv`, [
      ["รอบจ่าย", "เลขที่", "รหัสพนักงาน", ...(withNames ? ["ชื่อ-นามสกุล"] : []), "แผนก", "ประเภท", "จำนวนเงิน", "สถานะ", "อ้างอิงการจ่าย"],
      ...data.approved.map((c) => {
        const e = db.employees.find((x) => x.id === c.employeeId);
        const b = db.benefitTypes.find((x) => x.id === c.benefitTypeId);
        return [c.payDate, c.no, e?.code, ...(withNames ? [fullName(e)] : []), db.departments.find((d) => d.id === e?.departmentId)?.code, b?.name, claimValue(c, b), c.status === "paid" ? "จ่ายแล้ว" : "รอจ่าย", c.paymentRef ?? ""];
      }),
    ]);

  return (
    <Page title="รายงานสวัสดิการ" perm="report.export" wide>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-36" aria-label="ปี">
          {[yearOf(todayLocal()) - 1, yearOf(todayLocal()), yearOf(todayLocal()) + 1].map((y) => (
            <option key={y} value={y}>
              ปี {beYear(y)}
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" icon={<Download className="size-4" />} onClick={exportSummary}>
            สรุปตามประเภท
          </Button>
          <Button size="sm" icon={<Download className="size-4" />} onClick={exportDetail}>
            รายละเอียดตามรอบจ่าย
          </Button>
        </div>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        นับตามรอบจ่ายในปีที่เลือก (อนุมัติแล้ว + จ่ายแล้ว){!withNames && " · ไฟล์ส่งออกไม่มีชื่อพนักงาน (PDPA)"}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-zinc-500">ยอดอนุมัติทั้งปี</p>
          <p className="mt-1 text-lg font-semibold tabular">{money(data.total)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-zinc-500">จ่ายแล้ว</p>
          <p className="mt-1 text-lg font-semibold text-emerald-600 tabular">{money(data.paid)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-zinc-500">รอจ่าย</p>
          <p className="mt-1 text-lg font-semibold text-violet-600 tabular">{money(data.total - data.paid)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-zinc-500">จำนวนรายการ</p>
          <p className="mt-1 text-lg font-semibold tabular">{data.approved.length}</p>
        </Card>
      </div>

      <SectionTitle className="mt-6">ยอดจ่ายรายเดือน (ตามรอบจ่าย)</SectionTitle>
      <Card className="p-4">
        <div className="flex h-44 items-end gap-1.5">
          {data.byMonth.map((v, i) => (
            <div key={i} className="group flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[10px] text-zinc-500 opacity-0 group-hover:opacity-100 tabular">{v ? money(v, false) : ""}</span>
              <div className="w-full rounded-t-md bg-brand-500/85 transition group-hover:bg-brand-600" style={{ height: `${(v / maxM) * 100}%`, minHeight: v ? 4 : 0 }} title={`${MONTHS[i]}: ${money(v)}`} />
              <span className="text-[10px] text-zinc-500">{MONTHS[i]}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {[
          ["แยกตามประเภทสวัสดิการ", data.byBenefit],
          ["แยกตามแผนก", data.byDept],
        ].map(([title, list]) => {
          const l = list as { name: string; sum: number }[];
          const max = Math.max(1, ...l.map((x) => x.sum));
          return (
            <div key={title as string}>
              <SectionTitle className="mt-0">{title as string}</SectionTitle>
              <Card className="space-y-3 p-4">
                {l.map((x) => (
                  <div key={x.name}>
                    <div className="flex justify-between text-sm">
                      <span>{x.name}</span>
                      <span className="font-medium tabular">{money(x.sum)}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-100">
                      <div className="h-full rounded-full bg-ink-800" style={{ width: `${(x.sum / max) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </Card>
            </div>
          );
        })}
      </div>
    </Page>
  );
}
