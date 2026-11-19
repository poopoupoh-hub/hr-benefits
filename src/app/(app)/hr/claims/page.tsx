"use client";
import { Download, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Page } from "@/components/AppShell";
import { ClaimRowLink } from "@/components/claims";
import { Button, Card, Empty, Input, Select } from "@/components/ui";
import { STATUS_LABEL } from "@/lib/domain/constants";
import { beYear, todayLocal, yearOf } from "@/lib/domain/dates";
import type { ClaimStatus } from "@/lib/domain/types";
import { dateTH, downloadCSV, money } from "@/lib/format";
import { useCan, useDB } from "@/lib/hooks";
import { fullName } from "@/lib/services/core";

export default function AllClaims() {
  const db = useDB();
  const can = useCan();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | ClaimStatus>("");
  const [benefit, setBenefit] = useState("");
  const [dept, setDept] = useState("");
  const [year, setYear] = useState(String(yearOf(todayLocal())));
  const years = [...new Set(db.claims.map((c) => yearOf(c.receiptDate)))].sort((a, b) => b - a);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return db.claims.filter((c) => {
      const e = db.employees.find((x) => x.id === c.employeeId);
      if (status && c.status !== status) return false;
      if (benefit && c.benefitTypeId !== benefit) return false;
      if (dept && e?.departmentId !== dept) return false;
      if (year && yearOf(c.receiptDate) !== Number(year)) return false;
      if (s && !`${c.no} ${e?.code} ${fullName(e)} ${c.receiptNo} ${c.vendorName}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [db, q, status, benefit, dept, year]);
  const total = list.reduce((s, c) => s + c.amountApproved, 0);

  const exportCsv = () =>
    downloadCSV(`claims-${year || "all"}.csv`, [
      ["เลขที่", "รหัสพนักงาน", "ชื่อ-นามสกุล", "ฝ่าย", "ประเภทสวัสดิการ", "เลขใบเสร็จ", "ร้าน", "ยอดขอ", "ยอดได้จริง", "วันที่ในเอกสาร", "วันที่ยื่น", "สถานะ", "วันจ่าย", "อ้างอิงการจ่าย"],
      ...list.map((c) => {
        const e = db.employees.find((x) => x.id === c.employeeId);
        const b = db.benefitTypes.find((x) => x.id === c.benefitTypeId);
        const p = db.payments.find((x) => x.claimId === c.id);
        return [
          c.no,
          e?.code,
          fullName(e),
          db.departments.find((d) => d.id === e?.departmentId)?.name,
          b?.name,
          c.receiptNo,
          c.vendorName,
          c.amountRequested,
          c.amountApproved,
          c.receiptDate,
          c.submittedAt.slice(0, 10),
          STATUS_LABEL[c.status],
          p?.paidAt ?? c.payDate ?? "",
          p?.transferRef ?? p?.chequeNo ?? "",
        ];
      }),
    ]);

  return (
    <Page title="คำขอทั้งหมด" perm="claim.review" wide>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-2">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาเลขที่ / รหัส / ชื่อ / ใบเสร็จ / ร้าน" className="pl-9" />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value as ClaimStatus | "")} aria-label="สถานะ">
          <option value="">ทุกสถานะ</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select value={benefit} onChange={(e) => setBenefit(e.target.value)} aria-label="ประเภทสวัสดิการ">
          <option value="">ทุกสวัสดิการ</option>
          {db.benefitTypes.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          <Select value={dept} onChange={(e) => setDept(e.target.value)} aria-label="แผนก">
            <option value="">ทุกฝ่าย</option>
            {db.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Select value={year} onChange={(e) => setYear(e.target.value)} aria-label="ปี" className="w-28">
            <option value="">ทุกปี</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {beYear(y)}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-zinc-500">
          {list.length} รายการ · รวม {money(total)}
        </span>
        {can("report.view") && (
          <Button variant="secondary" size="sm" icon={<Download className="size-4" />} onClick={exportCsv} disabled={!list.length}>
            Export CSV
          </Button>
        )}
      </div>
      <Card className="mt-3 divide-y divide-zinc-100 overflow-hidden">
        {list.map((c) => (
          <ClaimRowLink key={c.id} c={c} db={db} href={`/claim?id=${c.id}`} />
        ))}
      </Card>
      {list.length === 0 && <div className="mt-3"><Empty title="ไม่พบคำขอตามเงื่อนไข" /></div>}
      <p className="mt-3 text-xs text-zinc-400">ข้อมูล ณ {dateTH(todayLocal())}</p>
    </Page>
  );
}
