"use client";
import { AlertTriangle, Plus } from "lucide-react";
import Link from "next/link";
import { ClaimCard } from "@/components/claims";
import { Page } from "@/components/AppShell";
import { Alert, Card, Empty, Progress, SectionTitle } from "@/components/ui";
import { EMPLOYMENT_TYPE_LABEL, IN_PROGRESS_STATUSES } from "@/lib/domain/constants";
import { beYear, todayLocal, yearOf } from "@/lib/domain/dates";
import { eligibility, entitlementOf } from "@/lib/domain/rules";
import { money } from "@/lib/format";
import { useDB, useMe } from "@/lib/hooks";

export default function MyHome() {
  const db = useDB();
  const me = useMe()!;
  const today = todayLocal();
  const year = yearOf(today);
  const mine = db.claims.filter((c) => c.employeeId === me.id);
  const pos = db.positions.find((p) => p.id === me.positionId);
  const inProgress = mine.filter((c) => IN_PROGRESS_STATUSES.includes(c.status)).length;
  const awaitingPay = mine.filter((c) => c.status === "approved");
  const returned = mine.filter((c) => c.status === "returned");
  const benefits = db.benefitTypes.filter((b) => b.active && eligibility(me, b, today).eligible);

  return (
    <Page title={`สวัสดี, ${me.firstName}`} perm="self.claim">
      <div className="rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 p-5 text-white shadow-lg shadow-brand-500/20">
        <p className="text-sm text-white/80">
          {me.code} · {pos?.name} · {EMPLOYMENT_TYPE_LABEL[me.employmentType]}
        </p>
        <div className="mt-3 flex gap-10">
          <div>
            <p className="text-3xl font-semibold">{inProgress}</p>
            <p className="text-sm text-white/80">กำลังดำเนินการ</p>
          </div>
          <div>
            <p className="text-3xl font-semibold">{awaitingPay.length}</p>
            <p className="text-sm text-white/80">รอรับเงิน</p>
          </div>
          {awaitingPay[0]?.payDate && (
            <div className="hidden sm:block">
              <p className="text-3xl font-semibold">{money(awaitingPay.reduce((s, c) => s + (c.assignedAmount ?? c.amount), 0), false)}</p>
              <p className="text-sm text-white/80">บาท ที่จะได้รับ</p>
            </div>
          )}
        </div>
      </div>

      {returned.length > 0 && (
        <Link href={`/claim?id=${returned[0].id}`}>
          <Alert tone="warn" icon={<AlertTriangle className="size-4" />} className="mt-4">
            มีคำขอถูกส่งกลับแก้ไข {returned.length} รายการ — แตะเพื่อแก้ไข
          </Alert>
        </Link>
      )}

      <SectionTitle className="mt-6">สิทธิ์คงเหลือปี {beYear(year)}</SectionTitle>
      {benefits.length === 0 ? (
        <Empty title="ไม่มีสวัสดิการที่มีสิทธิ์">ประเภทพนักงานของคุณยังไม่มีสิทธิ์สวัสดิการ</Empty>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {benefits.map((b) => {
            const e = entitlementOf(me, b, db.claims, year, today);
            let main = "HR กำหนดยอด";
            let pct = 100;
            let sub = "";
            if (e.annualLimit != null) {
              main = money(e.remainingAmount);
              pct = (e.remainingAmount! / e.annualLimit) * 100;
              sub = `จาก ${money(e.annualLimit)}`;
            } else if (e.maxTimesPerYear != null) {
              main = `${e.remainingTimes}/${e.maxTimesPerYear} ครั้ง`;
              pct = (e.remainingTimes! / e.maxTimesPerYear) * 100;
              sub = e.perClaimLimit ? `ครั้งละไม่เกิน ${money(e.perClaimLimit)}` : "";
            }
            return (
              <Link key={b.id} href={`/me/new?b=${b.id}`}>
                <Card className="h-full p-4 transition hover:border-brand-200">
                  <p className="text-xs text-zinc-500">{b.name}</p>
                  <p className="mt-1 font-semibold tabular">{main}</p>
                  <Progress value={pct} className="mt-3" tone={pct < 20 ? "red" : "brand"} />
                  <p className="mt-1.5 text-[11px] text-zinc-400">
                    {sub}
                    {e.usage.pendingTimes > 0 && <span className="text-amber-600"> · รอดำเนินการ {e.usage.pendingTimes}</span>}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <SectionTitle
        action={
          <Link href="/me/claims" className="text-sm text-brand-600">
            ดูทั้งหมด
          </Link>
        }
      >
        รายการล่าสุด
      </SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        {mine.slice(0, 4).map((c) => (
          <ClaimCard key={c.id} c={c} db={db} href={`/claim?id=${c.id}`} />
        ))}
        {mine.length === 0 && <Empty title="ยังไม่มีคำขอ">เริ่มยื่นเบิกสวัสดิการได้เลย</Empty>}
      </div>

      <Link
        href="/me/new"
        className="mt-6 flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand-500 font-medium text-white shadow-lg shadow-brand-500/25 hover:bg-brand-600"
      >
        <Plus className="size-5" /> ยื่นเบิกสวัสดิการ
      </Link>
    </Page>
  );
}
