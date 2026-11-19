"use client";
import { AlertTriangle, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ClaimCard } from "@/components/claims";
import { Page } from "@/components/AppShell";
import { Alert, Card, Empty, Progress, SectionTitle } from "@/components/ui";
import { CLAIM_FILTERS, EMPLOYMENT_TYPE_LABEL, type ClaimFilterKey } from "@/lib/domain/constants";
import { beYear, todayLocal, yearOf } from "@/lib/domain/dates";
import { eligibility, entitlementOf, levelOf } from "@/lib/domain/rules";
import { cx, money } from "@/lib/format";
import { useCan, useDB, useMe } from "@/lib/hooks";
import { approvalQueue } from "@/lib/services/approval";

const CARD_TONE: Record<ClaimFilterKey, string> = {
  all: "text-ink-900",
  active: "text-amber-600",
  approved: "text-violet-600",
  paid: "text-emerald-600",
  rejected: "text-red-600",
};

export default function MyHome() {
  const db = useDB();
  const me = useMe()!;
  const today = todayLocal();
  const year = yearOf(today);
  const [filter, setFilter] = useState<ClaimFilterKey>("all");
  const mine = db.claims.filter((c) => c.employeeId === me.id && yearOf(c.receiptDate) === year);
  const count = (k: ClaimFilterKey) => mine.filter((c) => CLAIM_FILTERS.find((f) => f.key === k)!.statuses.includes(c.status)).length;
  const list = mine.filter((c) => CLAIM_FILTERS.find((f) => f.key === filter)!.statuses.includes(c.status));
  const pos = db.positions.find((p) => p.id === me.positionId);
  const returned = mine.filter((c) => c.status === "returned");
  const ctx = { claims: db.claims, limits: db.benefitLimits, positions: db.positions };
  const can = useCan();
  const toApprove = can("claim.approve") ? approvalQueue(db, me).length : 0;

  return (
    <Page title={`สวัสดี, ${me.firstName}`} perm="self.claim">
      <div className="rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 p-5 text-white shadow-lg shadow-brand-500/20">
        <p className="text-sm text-white/80">
          {me.code} · {pos?.name} (ระดับ {levelOf(me, db.positions)}) · {EMPLOYMENT_TYPE_LABEL[me.employmentType]}
        </p>
        <p className="mt-1 text-lg font-semibold">สวัสดิการปี {beYear(year)}</p>
      </div>

      {toApprove > 0 && (
        <Link href="/manager">
          <Alert tone="info" className="mt-4">
            มีคำขอของลูกทีมรอคุณอนุมัติ {toApprove} รายการ — แตะเพื่อพิจารณา
          </Alert>
        </Link>
      )}

      {returned.length > 0 && (
        <Link href={`/claim?id=${returned[0].id}`}>
          <Alert tone="warn" icon={<AlertTriangle className="size-4" />} className="mt-4">
            มีคำขอถูกส่งกลับแก้ไข {returned.length} รายการ — แตะเพื่อดูเหตุผลและแก้ไข
          </Alert>
        </Link>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {CLAIM_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={cx(
              "rounded-2xl border bg-white p-3 text-left transition",
              filter === f.key ? "border-brand-500 ring-4 ring-brand-500/10" : "border-zinc-200 hover:border-zinc-300",
              f.key === "all" && "col-span-2 sm:col-span-1",
            )}
          >
            <p className="text-xs text-zinc-500">{f.label}</p>
            <p className={cx("text-2xl font-semibold tabular", CARD_TONE[f.key])}>{count(f.key)}</p>
          </button>
        ))}
      </div>

      <SectionTitle
        className="mt-4"
        action={
          <Link href="/me/claims" className="text-sm text-brand-600">
            ดูทุกปี
          </Link>
        }
      >
        {CLAIM_FILTERS.find((f) => f.key === filter)!.label} · {list.length} รายการ
      </SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        {list.map((c) => (
          <ClaimCard key={c.id} c={c} db={db} href={`/claim?id=${c.id}`} />
        ))}
      </div>
      {list.length === 0 && <Empty title="ไม่มีรายการ">เริ่มยื่นเบิกสวัสดิการได้เลย</Empty>}

      <SectionTitle className="mt-6">สิทธิ์ของฉัน</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {db.benefitTypes
          .filter((b) => b.active)
          .map((b) => {
            const el = eligibility(me, b, today);
            const e = entitlementOf(me, b, ctx, year, today);
            const usable = el.eligible && (b.mode === "assigned" || e.limit);
            const pct = e.perYear ? ((e.remainingAmount ?? 0) / e.perYear) * 100 : e.maxCount ? ((e.remainingTimes ?? 0) / e.maxCount) * 100 : 100;
            return (
              <Link key={b.id} href={usable ? `/me/new?b=${b.id}` : "#"} aria-disabled={!usable}>
                <Card className={cx("h-full p-4 transition", usable ? "hover:border-brand-200" : "opacity-50")}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{b.name}</p>
                    <span className="text-[11px] text-zinc-400">{b.category}</span>
                  </div>
                  {!el.eligible ? (
                    <p className="mt-2 text-xs text-zinc-500">ไม่มีสิทธิ์: {el.reasons.join(", ")}</p>
                  ) : b.mode === "assigned" ? (
                    <p className="mt-2 text-xs text-zinc-500">HR กำหนดยอดตามรอบงบ{e.maxCount != null && ` · ${e.remainingTimes}/${e.maxCount} ครั้ง`}</p>
                  ) : !e.limit ? (
                    <p className="mt-2 text-xs text-zinc-500">ไม่มีวงเงินสำหรับระดับของคุณ</p>
                  ) : (
                    <>
                      <dl className="mt-2 grid grid-cols-3 gap-1 text-center text-[11px] text-zinc-500">
                        <div>
                          <dt>ต่อครั้ง</dt>
                          <dd className="text-sm font-semibold text-ink-900 tabular">{e.perClaim != null ? money(e.perClaim, false) : "—"}</dd>
                        </div>
                        <div>
                          <dt>ต่อปี</dt>
                          <dd className="text-sm font-semibold text-ink-900 tabular">{e.perYear != null ? money(e.perYear, false) : "—"}</dd>
                        </div>
                        <div>
                          <dt>จำนวนครั้ง</dt>
                          <dd className="text-sm font-semibold text-ink-900 tabular">{e.maxCount ?? "—"}</dd>
                        </div>
                      </dl>
                      <Progress value={pct} className="mt-3" tone={pct < 20 ? "red" : "brand"} />
                      <p className="mt-1.5 text-xs text-zinc-600">
                        คงเหลือ {e.remainingAmount != null && money(e.remainingAmount)}
                        {e.remainingAmount != null && e.remainingTimes != null && " · "}
                        {e.remainingTimes != null && `${e.remainingTimes} ครั้ง`}
                        {e.remainingAmount == null && e.remainingTimes == null && "ตามวงเงินต่อครั้ง"}
                        {e.usage.pendingTimes > 0 && <span className="text-amber-600"> · รอดำเนินการ {e.usage.pendingTimes}</span>}
                      </p>
                    </>
                  )}
                </Card>
              </Link>
            );
          })}
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
