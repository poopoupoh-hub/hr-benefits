"use client";
import { FileText } from "lucide-react";
import { useState } from "react";
import { Page } from "@/components/AppShell";
import { ClaimCard } from "@/components/claims";
import { Empty, Segmented, Select } from "@/components/ui";
import { IN_PROGRESS_STATUSES } from "@/lib/domain/constants";
import { beYear, yearOf } from "@/lib/domain/dates";
import type { ClaimStatus } from "@/lib/domain/types";
import { useDB, useMe } from "@/lib/hooks";

type F = "all" | "progress" | "approved" | "paid" | "closed";
const MATCH: Record<F, (s: ClaimStatus) => boolean> = {
  all: () => true,
  progress: (s) => IN_PROGRESS_STATUSES.includes(s),
  approved: (s) => s === "approved",
  paid: (s) => s === "paid",
  closed: (s) => s === "rejected" || s === "cancelled",
};

export default function MyClaims() {
  const db = useDB();
  const me = useMe()!;
  const [f, setF] = useState<F>("all");
  const mine = db.claims.filter((c) => c.employeeId === me.id);
  const years = [...new Set(mine.map((c) => yearOf(c.receiptDate)))].sort((a, b) => b - a);
  const [year, setYear] = useState<string>("all");
  const list = mine.filter((c) => MATCH[f](c.status) && (year === "all" || yearOf(c.receiptDate) === Number(year)));
  return (
    <Page title="รายการของฉัน" perm="self.claim">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Segmented
          className="scrollbar-none overflow-x-auto sm:flex-1"
          value={f}
          onChange={setF}
          options={[
            { value: "all", label: "ทั้งหมด" },
            { value: "progress", label: "ดำเนินการ" },
            { value: "approved", label: "รอจ่าย" },
            { value: "paid", label: "จ่ายแล้ว" },
            { value: "closed", label: "ปิด/ไม่อนุมัติ" },
          ]}
        />
        <Select value={year} onChange={(e) => setYear(e.target.value)} className="sm:w-36" aria-label="ปี">
          <option value="all">ทุกปี</option>
          {years.map((y) => (
            <option key={y} value={y}>
              ปี {beYear(y)}
            </option>
          ))}
        </Select>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {list.map((c) => (
          <ClaimCard key={c.id} c={c} db={db} href={`/claim?id=${c.id}`} />
        ))}
      </div>
      {list.length === 0 && (
        <div className="mt-4">
          <Empty icon={<FileText className="size-8" />} title="ไม่มีรายการ" />
        </div>
      )}
    </Page>
  );
}
