"use client";
import { AlertTriangle, DatabaseBackup, Mail, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Page } from "@/components/AppShell";
import { AuditRow } from "@/components/AuditList";
import { Alert, Card, Progress, Segmented, SectionTitle } from "@/components/ui";
import { IN_PROGRESS_STATUSES } from "@/lib/domain/constants";
import { beYear, dateOf, diffDays, todayLocal, yearOf } from "@/lib/domain/dates";
import { claimValue, orgBudgetOf } from "@/lib/domain/rules";
import type { ClaimStatus } from "@/lib/domain/types";
import { dateTimeFullTH, money } from "@/lib/format";
import { fetchAudit, fetchEmails } from "@/lib/client/api";
import { useAsync, useDB, useMe } from "@/lib/hooks";
import { fullName } from "@/lib/services/core";

const PIPE: { s: ClaimStatus; label: string; tone: "gray" | "amber" | "blue" | "green" | "red" | "brand" }[] = [
  { s: "pending_hr", label: "รอ HR", tone: "gray" },
  { s: "returned", label: "ส่งกลับแก้ไข", tone: "brand" },
  { s: "pending_manager", label: "รอหัวหน้า", tone: "amber" },
  { s: "approved", label: "อนุมัติแล้ว (รอจ่าย)", tone: "green" },
  { s: "paid", label: "จ่ายแล้ว", tone: "blue" },
  { s: "rejected", label: "ไม่อนุมัติ", tone: "red" },
];

export default function AdminDashboard() {
  const db = useDB();
  const me = useMe()!;
  const [tab, setTab] = useState<"overview" | "budget" | "activity">("overview");
  const activity = useAsync(() => (tab === "activity" ? fetchAudit({ limit: 15 }) : Promise.resolve(null)), [tab, db]);
  const emails = useAsync(() => fetchEmails(), [db]);
  const today = todayLocal();
  const year = yearOf(today);
  const yearClaims = db.claims.filter((c) => yearOf(c.receiptDate) === year);
  const v = (c: (typeof yearClaims)[number]) => claimValue(c, db.benefitTypes.find((b) => b.id === c.benefitTypeId));
  const sum = (s: ClaimStatus[]) => yearClaims.filter((c) => s.includes(c.status)).reduce((a, c) => a + v(c), 0);
  const count = (s: ClaimStatus[]) => yearClaims.filter((c) => s.includes(c.status)).length;
  const paid = sum(["paid"]);
  const max = Math.max(1, ...PIPE.map((p) => count([p.s])));
  const lastBackup = db.settings.backup.lastBackupAt;
  const backupStale = !lastBackup || diffDays(today, dateOf(lastBackup)) > db.settings.backup.autoReminderDays;

  return (
    <Page title="Dashboard" perm="system.manage">
      <div className="rounded-3xl bg-gradient-to-br from-ink-800 to-ink-950 p-5 text-white">
        <p className="text-sm text-zinc-400">ยินดีต้อนรับกลับ</p>
        <p className="text-lg font-semibold">{fullName(me)}</p>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div>
            <p className="text-2xl font-semibold">{yearClaims.length}</p>
            <p className="text-xs text-zinc-400">คำขอทั้งหมดปี {beYear(year)}</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-amber-400">{count(IN_PROGRESS_STATUSES)}</p>
            <p className="text-xs text-zinc-400">รอดำเนินการ</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-emerald-400 tabular">{money(paid)}</p>
            <p className="text-xs text-zinc-400">จ่ายแล้วปีนี้</p>
          </div>
        </div>
      </div>

      {backupStale && (
        <Link href="/admin/settings">
          <Alert tone="warn" icon={<AlertTriangle className="size-4" />} className="mt-4">
            {lastBackup ? `สำรองข้อมูลล่าสุด ${dateTimeFullTH(lastBackup)} — เกิน ${db.settings.backup.autoReminderDays} วันแล้ว` : "ยังไม่เคยสำรองข้อมูล"} · แตะเพื่อสำรองข้อมูล
          </Alert>
        </Link>
      )}

      <Segmented
        className="mt-4"
        value={tab}
        onChange={setTab}
        options={[
          { value: "overview", label: "ภาพรวม" },
          { value: "budget", label: "งบประมาณ" },
          { value: "activity", label: "กิจกรรม" },
        ]}
      />

      {tab === "overview" && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["รอดำเนินการ", count(IN_PROGRESS_STATUSES), sum(IN_PROGRESS_STATUSES), "text-brand-600"],
              ["อนุมัติ รอจ่าย", count(["approved"]), sum(["approved"]), "text-violet-600"],
              ["จ่ายแล้ว", count(["paid"]), paid, "text-emerald-600"],
              ["ไม่อนุมัติ", count(["rejected"]), sum(["rejected"]), "text-red-600"],
            ].map(([l, n, s, c]) => (
              <Card key={l as string} className="p-4">
                <p className="text-xs text-zinc-500">{l}</p>
                <p className={`mt-1 text-2xl font-semibold ${c}`}>{n as number}</p>
                <p className="text-xs text-zinc-400 tabular">≈ {money(s as number)}</p>
              </Card>
            ))}
          </div>
          <Card className="mt-4 p-4">
            <p className="mb-3 font-semibold">Pipeline คำขอ</p>
            <div className="space-y-3">
              {PIPE.map((p) => (
                <div key={p.s}>
                  <div className="flex justify-between text-sm">
                    <span>{p.label}</span>
                    <span className="font-medium">{count([p.s])}</span>
                  </div>
                  <Progress value={(count([p.s]) / max) * 100} tone={p.tone} className="mt-1 h-2" />
                </div>
              ))}
            </div>
          </Card>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Link href="/admin/users">
              <Card className="p-4 hover:border-zinc-300">
                <Users className="size-5 text-brand-500" />
                <p className="mt-2 text-xl font-semibold">{db.employees.filter((e) => e.active).length}</p>
                <p className="text-xs text-zinc-500">ผู้ใช้ที่ใช้งาน</p>
              </Card>
            </Link>
            <Link href="/admin/emails">
              <Card className="p-4 hover:border-zinc-300">
                <Mail className="size-5 text-brand-500" />
                <p className="mt-2 text-xl font-semibold">{emails.data?.length ?? "–"}</p>
                <p className="text-xs text-zinc-500">อีเมล {db.settings.email.enabled ? "เปิดใช้" : "ปิดอยู่"}</p>
              </Card>
            </Link>
            <Link href="/admin/settings">
              <Card className="p-4 hover:border-zinc-300">
                <DatabaseBackup className="size-5 text-brand-500" />
                <p className="mt-2 text-sm font-semibold">{lastBackup ? dateTimeFullTH(lastBackup) : "ยังไม่เคย"}</p>
                <p className="text-xs text-zinc-500">สำรองข้อมูลล่าสุด</p>
              </Card>
            </Link>
          </div>
        </>
      )}

      {tab === "budget" && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-zinc-500">งบรวมทั้งองค์กร (พนักงานที่มีสิทธิ์ × วงเงิน)</p>
          {db.benefitTypes
            .filter((b) => b.mode === "claim")
            .map((b) => {
              const ob = orgBudgetOf(b, year, db.employees, db.claims, db.budgets, today);
              const pct = ob.budget ? ((ob.used + ob.pending) / ob.budget) * 100 : 0;
              return (
                <Card key={b.id} className="p-4">
                  <div className="flex justify-between">
                    <div>
                      <p className="font-semibold">{b.name}</p>
                      <p className="text-xs text-zinc-500">
                        {ob.eligibleCount} คนมีสิทธิ์
                        {b.annualLimit != null && ` · วงเงิน/คน ${money(b.annualLimit)}`}
                        {b.perClaimLimit != null && ` · ครั้งละ ≤ ${money(b.perClaimLimit)}`}
                        {b.maxTimesPerYear != null && ` · ปีละ ≤ ${b.maxTimesPerYear} ครั้ง`}
                      </p>
                    </div>
                    <Link href="/hr/benefits" className="text-sm font-medium text-brand-600">
                      แก้ไข
                    </Link>
                  </div>
                  <Progress value={pct} className="mt-3" />
                  <div className="mt-3 grid grid-cols-3 text-center text-xs">
                    <div>
                      <p className="text-zinc-500">วงเงินรวม</p>
                      <p className="font-semibold tabular">{money(ob.budget)}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500">ใช้ไป/กัน</p>
                      <p className="font-semibold text-brand-600 tabular">{money(ob.used + ob.pending)}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500">คงเหลือ</p>
                      <p className="font-semibold text-emerald-600 tabular">{money(ob.remaining)}</p>
                    </div>
                  </div>
                  <p className="mt-2 flex justify-between text-[11px] text-zinc-400">
                    <span>จ่ายจริง: {money(ob.paid)}</span>
                    <span>{pct.toFixed(0)}% ของงบ</span>
                  </p>
                </Card>
              );
            })}
        </div>
      )}

      {tab === "activity" && (
        <>
          <SectionTitle className="mt-4" action={<Link href="/audit" className="text-sm text-brand-600">ดูทั้งหมด</Link>}>
            กิจกรรมล่าสุด
          </SectionTitle>
          <Card className="divide-y divide-zinc-100">
            {activity.loading && <p className="p-4 text-sm text-zinc-500">กำลังโหลด…</p>}
            {activity.error && <p className="p-4 text-sm text-red-600">{activity.error}</p>}
            {activity.data?.items.map((l) => (
              <AuditRow key={l.id} log={l} db={db} />
            ))}
          </Card>
        </>
      )}
    </Page>
  );
}
