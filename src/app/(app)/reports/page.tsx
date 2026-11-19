"use client";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { Page } from "@/components/AppShell";
import { Button, Card, Progress, Select } from "@/components/ui";
import { beYear, todayLocal, yearOf } from "@/lib/domain/dates";
import { claimYear } from "@/lib/domain/rules";
import { downloadCSV, money } from "@/lib/format";
import { useDB } from "@/lib/hooks";

/** รายงานยอดเบิกรวมต่อสวัสดิการต่อปี (แทนหน้าตั้งงบประมาณรายปี) — นับเฉพาะที่อนุมัติ/จ่ายแล้ว ใช้ยอดเบิกได้จริง */
export default function Reports() {
  const db = useDB();
  const thisYear = yearOf(todayLocal());
  const years = useMemo(() => [...new Set([thisYear, ...db.claims.map(claimYear)])].sort((a, b) => b - a), [db.claims, thisYear]);
  const [year, setYear] = useState(thisYear);
  const [dept, setDept] = useState("");

  const rows = useMemo(() => {
    const deptOf = (id: string) => db.employees.find((e) => e.id === id)?.departmentId;
    const counted = db.claims.filter((c) => (c.status === "approved" || c.status === "paid") && claimYear(c) === year && (!dept || deptOf(c.employeeId) === dept));
    return db.benefitTypes
      .map((b) => {
        const mine = counted.filter((c) => c.benefitTypeId === b.id);
        return {
          benefit: b,
          count: mine.length,
          people: new Set(mine.map((c) => c.employeeId)).size,
          requested: mine.reduce((s, c) => s + c.amountRequested, 0),
          total: mine.reduce((s, c) => s + c.amountApproved, 0),
          paid: mine.filter((c) => c.status === "paid").reduce((s, c) => s + c.amountApproved, 0),
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [db, year, dept]);

  const grand = rows.reduce((s, r) => s + r.total, 0);
  const max = Math.max(1, ...rows.map((r) => r.total));
  const deptName = db.departments.find((d) => d.id === dept)?.name ?? "ทุกฝ่าย";

  const exportCsv = () =>
    downloadCSV(`benefit-total-${beYear(year)}${dept ? `-${dept}` : ""}.csv`, [
      ["ปี", "ฝ่าย", "ประเภทสวัสดิการ", "จำนวนรายการ", "จำนวนคน", "ยอดขอ", "ยอดอนุมัติ", "จ่ายแล้ว"],
      ...rows.map((r) => [beYear(year), deptName, r.benefit.name, r.count, r.people, r.requested, r.total, r.paid]),
      ["", "", "รวม", rows.reduce((s, r) => s + r.count, 0), "", rows.reduce((s, r) => s + r.requested, 0), grand, rows.reduce((s, r) => s + r.paid, 0)],
    ]);

  return (
    <Page title="รายงานยอดเบิก" perm="report.view" wide>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-36" aria-label="ปี">
          {years.map((y) => (
            <option key={y} value={y}>
              ปี {beYear(y)}
            </option>
          ))}
        </Select>
        <Select value={dept} onChange={(e) => setDept(e.target.value)} className="w-48" aria-label="ฝ่าย">
          <option value="">ทุกฝ่าย</option>
          {db.departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <Button variant="secondary" size="sm" className="ml-auto" icon={<Download className="size-4" />} onClick={exportCsv}>
          Export CSV
        </Button>
      </div>

      <div className="mt-4 rounded-3xl bg-ink-900 p-5 text-white">
        <p className="text-sm text-zinc-400">
          ยอดเบิกรวม (อนุมัติ + จ่ายแล้ว) ปี {beYear(year)} · {deptName}
        </p>
        <p className="mt-1 text-3xl font-semibold tabular">{money(grand)}</p>
      </div>

      <Card className="mt-4 divide-y divide-zinc-100">
        {rows.map((r, i) => (
          <div key={r.benefit.id} className="p-4 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-medium">
                <span className="mr-2 text-zinc-400">{i + 1}.</span>
                {r.benefit.name} <span className="text-xs font-normal text-zinc-400">{r.benefit.category}</span>
              </p>
              <p className="font-semibold tabular">{money(r.total)}</p>
            </div>
            <Progress value={(r.total / max) * 100} className="mt-2" />
            <p className="mt-1.5 text-xs text-zinc-500">
              {r.count} รายการ · {r.people} คน · ยอดขอ {money(r.requested)} · จ่ายแล้ว {money(r.paid)}
            </p>
          </div>
        ))}
      </Card>
      <p className="mt-3 text-xs text-zinc-400">นับตามปีของวันที่ในใบเสร็จ · ใช้ยอดเบิกได้จริง (หลังตัดตามวงเงิน)</p>
    </Page>
  );
}
