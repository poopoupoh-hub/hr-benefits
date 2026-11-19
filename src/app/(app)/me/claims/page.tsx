"use client";
import { FileText } from "lucide-react";
import { useState } from "react";
import { Page } from "@/components/AppShell";
import { ClaimCard } from "@/components/claims";
import { Empty, Segmented, Select } from "@/components/ui";
import { CLAIM_FILTERS, type ClaimFilterKey } from "@/lib/domain/constants";
import { beYear, yearOf } from "@/lib/domain/dates";
import { useDB, useMe } from "@/lib/hooks";

export default function MyClaims() {
  const db = useDB();
  const me = useMe()!;
  const [f, setF] = useState<ClaimFilterKey>("all");
  const mine = db.claims.filter((c) => c.employeeId === me.id);
  const years = [...new Set(mine.map((c) => yearOf(c.receiptDate)))].sort((a, b) => b - a);
  const [year, setYear] = useState<string>("all");
  const statuses = CLAIM_FILTERS.find((x) => x.key === f)!.statuses;
  const list = mine.filter((c) => statuses.includes(c.status) && (year === "all" || yearOf(c.receiptDate) === Number(year)));
  return (
    <Page title="รายการของฉัน" perm="self.claim">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Segmented
          className="scrollbar-none overflow-x-auto sm:flex-1"
          value={f}
          onChange={setF}
          options={CLAIM_FILTERS.map((x) => ({ value: x.key, label: x.label }))}
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
