"use client";
import { ChevronDown, UsersRound } from "lucide-react";
import { useState } from "react";
import { Page } from "@/components/AppShell";
import { ClaimRowLink } from "@/components/claims";
import { Avatar, Badge, Card, Empty } from "@/components/ui";
import { EMPLOYMENT_TYPE_LABEL } from "@/lib/domain/constants";
import { beYear, todayLocal, yearOf } from "@/lib/domain/dates";
import { cx, money } from "@/lib/format";
import { useDB, useMe } from "@/lib/hooks";
import { teamOf } from "@/lib/services/approval";
import { fullName } from "@/lib/services/core";

/** ภาพรวมทีม — ลูกทีมในสายบังคับบัญชา ยอดเบิกปีนี้ และคำขอของแต่ละคน */
export default function TeamPage() {
  const db = useDB();
  const me = useMe()!;
  const year = yearOf(todayLocal());
  const [openId, setOpenId] = useState<string | null>(null);
  const team = teamOf(db, me.id);
  const direct = new Set(db.employees.filter((e) => e.supervisorId === me.id).map((e) => e.id));
  const claimsOf = (id: string) => db.claims.filter((c) => c.employeeId === id && yearOf(c.receiptDate) === year);
  const used = (id: string) => claimsOf(id).filter((c) => c.status === "approved" || c.status === "paid").reduce((s, c) => s + c.amountApproved, 0);
  const inProgress = (id: string) => claimsOf(id).filter((c) => ["pending_hr", "pending_manager", "returned"].includes(c.status)).length;
  const teamUsed = team.reduce((s, e) => s + used(e.id), 0);

  return (
    <Page title="ทีมของฉัน" perm="team.view">
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs text-zinc-500">ลูกทีม</p>
          <p className="text-2xl font-semibold">{team.filter((e) => e.active).length}</p>
          <p className="text-[11px] text-zinc-500">โดยตรง {direct.size} คน</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-zinc-500">ยอดเบิกปี {beYear(year)}</p>
          <p className="text-2xl font-semibold tabular">{money(teamUsed, false)}</p>
          <p className="text-[11px] text-zinc-500">บาท (อนุมัติ/จ่ายแล้ว)</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-zinc-500">กำลังดำเนินการ</p>
          <p className="text-2xl font-semibold text-amber-600">{team.reduce((s, e) => s + inProgress(e.id), 0)}</p>
          <p className="text-[11px] text-zinc-500">คำขอ</p>
        </Card>
      </div>

      <Card className="divide-y divide-zinc-100 overflow-hidden">
        {team.map((e) => {
          const pos = db.positions.find((p) => p.id === e.positionId);
          const sup = db.employees.find((x) => x.id === e.supervisorId);
          const list = claimsOf(e.id);
          const isOpen = openId === e.id;
          return (
            <div key={e.id}>
              <button type="button" onClick={() => setOpenId(isOpen ? null : e.id)} aria-expanded={isOpen} className={cx("flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50", !e.active && "opacity-60")}>
                <Avatar name={e.firstName} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {fullName(e)} {!e.active && <Badge tone="gray">พ้นสภาพ</Badge>}
                  </span>
                  <span className="block truncate text-xs text-zinc-500">
                    {e.code} · {pos?.name} · {EMPLOYMENT_TYPE_LABEL[e.employmentType]}
                    {!direct.has(e.id) && sup && ` · ภายใต้ ${sup.firstName}`}
                  </span>
                </span>
                <span className="text-right text-xs">
                  <span className="block font-medium tabular text-ink-900">{money(used(e.id))}</span>
                  {inProgress(e.id) > 0 ? <span className="text-amber-600">ดำเนินการ {inProgress(e.id)}</span> : <span className="text-zinc-400">{list.length} คำขอ</span>}
                </span>
                <ChevronDown className={cx("size-4 text-zinc-400 transition", isOpen && "rotate-180")} />
              </button>
              {isOpen && (
                <div className="border-t border-zinc-100 bg-zinc-50/60">
                  {list.length ? list.map((c) => <ClaimRowLink key={c.id} c={c} db={db} href={`/claim?id=${c.id}`} />) : <p className="px-4 py-3 text-sm text-zinc-500">ยังไม่มีคำขอในปีนี้</p>}
                </div>
              )}
            </div>
          );
        })}
      </Card>
      {team.length === 0 && <Empty icon={<UsersRound className="size-8" />} title="ยังไม่มีลูกทีมในสายบังคับบัญชา">HR กำหนดหัวหน้างานได้ที่หน้า ข้อมูลพนักงาน</Empty>}
    </Page>
  );
}
