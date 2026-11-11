"use client";
import { useState } from "react";
import { Page } from "@/components/AppShell";
import { Avatar, Badge, Button, Card, Field, Input, Progress, SectionTitle, Select, useAction } from "@/components/ui";
import { EMPLOYMENT_TYPE_LABEL, IN_PROGRESS_STATUSES } from "@/lib/domain/constants";
import { todayLocal, yearOf } from "@/lib/domain/dates";
import { claimValue, eligibility, entitlementOf } from "@/lib/domain/rules";
import { dateTH, money } from "@/lib/format";
import { useCan, useDB, useMe } from "@/lib/hooks";
import { fullName } from "@/lib/services/core";
import { api } from "@/lib/client/api";

export default function TeamPage() {
  const db = useDB();
  const me = useMe()!;
  const can = useCan();
  const act = useAction();
  const today = todayLocal();
  const year = yearOf(today);
  const team = db.employees.filter((e) => e.managerId === me.id);
  const candidates = db.employees.filter((e) => e.active && e.id !== me.id && e.role !== "admin" && db.rbac[e.role].includes("claim.approve"));
  const [delId, setDelId] = useState(me.delegation?.employeeId ?? "");
  const [from, setFrom] = useState(me.delegation?.from ?? today);
  const [to, setTo] = useState(me.delegation?.to ?? today);
  const teamClaims = db.claims.filter((c) => team.some((t) => t.id === c.employeeId) && yearOf(c.receiptDate) === year);
  const paidSum = teamClaims.filter((c) => c.status === "paid" || c.status === "approved").reduce((s, c) => s + claimValue(c, db.benefitTypes.find((b) => b.id === c.benefitTypeId)), 0);

  return (
    <Page title="ทีมของฉัน" perm="team.view">
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs text-zinc-500">ลูกทีม</p>
          <p className="text-2xl font-semibold">{team.filter((t) => t.active).length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-zinc-500">กำลังดำเนินการ</p>
          <p className="text-2xl font-semibold text-amber-600">{teamClaims.filter((c) => IN_PROGRESS_STATUSES.includes(c.status)).length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-zinc-500">อนุมัติปีนี้</p>
          <p className="text-lg font-semibold text-emerald-600 tabular sm:text-2xl">{money(paidSum)}</p>
        </Card>
      </div>

      <SectionTitle className="mt-6">รายชื่อและโครงสร้างในสายงาน</SectionTitle>
      <div className="space-y-2">
        {team.map((e) => {
          const pos = db.positions.find((p) => p.id === e.positionId);
          const sub = db.employees.filter((x) => x.managerId === e.id).length;
          const ents = db.benefitTypes.filter((b) => b.active && b.annualLimit != null && eligibility(e, b, today).eligible).map((b) => entitlementOf(e, b, db.claims, year, today));
          const lim = ents.reduce((s, x) => s + (x.annualLimit ?? 0), 0);
          const used = ents.reduce((s, x) => s + x.usage.usedAmount + x.usage.pendingAmount, 0);
          return (
            <Card key={e.id} className={`flex items-center gap-3 p-3.5 ${e.active ? "" : "opacity-50"}`}>
              <Avatar name={e.firstName} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{fullName(e)}</p>
                <p className="truncate text-xs text-zinc-500">
                  {e.code} · {pos?.name} {sub > 0 && `· ลูกทีม ${sub} คน`}
                </p>
                {lim > 0 && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <Progress value={(used / lim) * 100} className="flex-1" />
                    <span className="text-[11px] text-zinc-500 tabular">
                      ใช้ {money(used, false)}/{money(lim, false)}
                    </span>
                  </div>
                )}
              </div>
              <Badge>{e.active ? EMPLOYMENT_TYPE_LABEL[e.employmentType] : "พ้นสภาพ"}</Badge>
            </Card>
          );
        })}
      </div>

      {can("claim.approve") && (
        <>
          <SectionTitle className="mt-6">ผู้อนุมัติสำรองเมื่อไม่อยู่</SectionTitle>
          <Card className="space-y-3 p-4">
            {me.delegation && (
              <p className="rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-800">
                ปัจจุบัน: {fullName(db.employees.find((e) => e.id === me.delegation!.employeeId))} · {dateTH(me.delegation.from)} – {dateTH(me.delegation.to)}
              </p>
            )}
            <Field label="ผู้อนุมัติสำรอง">
              <Select value={delId} onChange={(e) => setDelId(e.target.value)}>
                <option value="">— เลือก —</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {fullName(c)} ({db.positions.find((p) => p.id === c.positionId)?.name})
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="ตั้งแต่">
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label="ถึง">
                <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
              </Field>
            </div>
            <div className="flex gap-2">
              {me.delegation && (
                <Button variant="secondary" onClick={() => act(() => api.setDelegation(null), "ยกเลิกผู้อนุมัติสำรองแล้ว")}>
                  ยกเลิก
                </Button>
              )}
              <Button className="flex-1" disabled={!delId} onClick={() => act(() => api.setDelegation({ employeeId: delId, from, to }), "บันทึกผู้อนุมัติสำรองแล้ว")}>
                บันทึก
              </Button>
            </div>
          </Card>
        </>
      )}
    </Page>
  );
}
