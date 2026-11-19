"use client";
import { FilePen } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Page } from "@/components/AppShell";
import { Alert, Badge, Button, Card, Field, Input, Modal, Select, Textarea, useAction } from "@/components/ui";
import { api } from "@/lib/client/api";
import { LEVELS, LEVEL_LABEL } from "@/lib/domain/constants";
import { todayLocal } from "@/lib/domain/dates";
import { resolveLimit } from "@/lib/domain/rules";
import type { BenefitLimit, BenefitType } from "@/lib/domain/types";
import { dateTH, money } from "@/lib/format";
import { useDB } from "@/lib/hooks";
import { fullName } from "@/lib/services/core";

const show = (n?: number | null, unit = "") => (n == null ? "—" : `${n.toLocaleString("th-TH")}${unit}`);
const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

type Draft = { minLevel: string; maxLevel: string; perClaim: string; perYear: string; maxCount: string; reason: string };

/** วงเงินสวัสดิการตามระดับตำแหน่ง — การแก้ไขเป็น "คำขอแก้วงเงิน" ให้หัวหน้า HR อนุมัติ */
export default function LimitsPage() {
  const db = useDB();
  const act = useAction();
  const today = todayLocal();
  const [edit, setEdit] = useState<{ benefit: BenefitType; base: BenefitLimit | null } | null>(null);
  const [d, setD] = useState<Draft | null>(null);
  const benefits = db.benefitTypes.filter((b) => b.mode === "claim");
  const levelName = (lv: number) => db.positions.find((p) => p.level === lv)?.name ?? LEVEL_LABEL[lv];

  const open = (benefit: BenefitType, base: BenefitLimit | null, lv: number) => {
    setEdit({ benefit, base });
    setD({
      minLevel: String(base?.minLevel ?? lv),
      maxLevel: String(base?.maxLevel ?? lv),
      perClaim: base?.perClaim?.toString() ?? "",
      perYear: base?.perYear?.toString() ?? "",
      maxCount: base?.maxCount?.toString() ?? "",
      reason: "",
    });
  };
  const submit = () => {
    if (!edit || !d) return;
    act(
      () =>
        api.requestLimitChange(
          edit.benefit.id,
          edit.base?.id ?? null,
          { minLevel: Number(d.minLevel), maxLevel: Number(d.maxLevel), perClaim: numOrNull(d.perClaim), perYear: numOrNull(d.perYear), maxCount: numOrNull(d.maxCount) },
          d.reason,
        ),
      "ส่งคำขอแก้วงเงินแล้ว — มีผลเมื่อหัวหน้า HR อนุมัติ",
    ).then((ok) => ok && setEdit(null));
  };

  return (
    <Page title="วงเงินตามระดับตำแหน่ง" perm="benefit.manage" wide>
      <Alert tone="info" className="mb-4">
        การแก้วงเงินเป็น <b>คำขอแก้ไข</b> ยังไม่มีผลทันที — เมื่อ
        <Link href="/hr/changes" className="mx-1 font-medium underline">
          หัวหน้า HR อนุมัติ
        </Link>
        ระบบเพิ่มวงเงินฉบับใหม่ (ไม่ทับฉบับเดิม) · พนักงานที่ย้ายระดับกลางปีใช้วงเงินระดับใหม่ ยอดที่ใช้ไปแล้วนับต่อ
      </Alert>
      <div className="space-y-4">
        {benefits.map((b) => {
          const pending = db.changeRequests.filter((r) => r.kind === "benefit_limit" && r.targetId === b.id && r.status === "pending");
          const history = db.benefitLimits.filter((l) => l.benefitId === b.id).sort((x, y) => y.effectiveFrom.localeCompare(x.effectiveFrom) || y.createdAt.localeCompare(x.createdAt));
          return (
            <Card key={b.id} className="p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-semibold">
                  {b.name} <span className="text-xs font-normal text-zinc-400">{b.category}</span>
                </p>
                {pending.length > 0 && <Badge tone="amber">รออนุมัติ {pending.length}</Badge>}
              </div>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="text-xs text-zinc-500">
                    <tr>
                      <th className="py-1.5 text-left font-normal">ระดับ</th>
                      <th className="py-1.5 text-right font-normal">ต่อครั้ง</th>
                      <th className="py-1.5 text-right font-normal">ต่อปี</th>
                      <th className="py-1.5 text-right font-normal">ครั้ง/ปี</th>
                      <th className="py-1.5 text-right font-normal">มีผลตั้งแต่</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {LEVELS.map((lv) => {
                      const l = resolveLimit(db.benefitLimits, b.id, lv, today);
                      return (
                        <tr key={lv}>
                          <td className="py-2">
                            {lv} · {levelName(lv)}
                          </td>
                          <td className="py-2 text-right tabular">{show(l?.perClaim)}</td>
                          <td className="py-2 text-right tabular">{show(l?.perYear)}</td>
                          <td className="py-2 text-right tabular">{show(l?.maxCount)}</td>
                          <td className="py-2 text-right text-xs text-zinc-500">{l ? dateTH(l.effectiveFrom) : "ไม่มีวงเงิน"}</td>
                          <td className="py-2 pl-2 text-right">
                            <button className="text-xs font-medium text-brand-600" onClick={() => open(b, l, lv)}>
                              ขอแก้
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {pending.map((r) => (
                <p key={r.id} className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <FilePen className="mt-0.5 size-3.5 shrink-0" />
                  รออนุมัติ: ระดับ {String(r.after.minLevel)}–{String(r.after.maxLevel)} · ต่อครั้ง {show(r.after.perClaim as number)} · ต่อปี {show(r.after.perYear as number)} ·{" "}
                  {show(r.after.maxCount as number, " ครั้ง")} — {r.reason} (โดย {fullName(db.employees.find((e) => e.id === r.requestedBy))})
                </p>
              ))}
              <details className="mt-2 text-xs text-zinc-500">
                <summary className="cursor-pointer">ประวัติวงเงินทุกฉบับ ({history.length})</summary>
                <ul className="mt-1 space-y-0.5">
                  {history.map((l) => (
                    <li key={l.id}>
                      {dateTH(l.effectiveFrom)} · ระดับ {l.minLevel}–{l.maxLevel} · ต่อครั้ง {show(l.perClaim)} · ต่อปี {show(l.perYear)} · {show(l.maxCount, " ครั้ง")}
                    </li>
                  ))}
                </ul>
              </details>
            </Card>
          );
        })}
      </div>

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={`ขอแก้วงเงิน: ${edit?.benefit.name ?? ""}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEdit(null)}>
              ยกเลิก
            </Button>
            <Button onClick={submit} disabled={!d?.reason.trim()}>
              ส่งคำขอแก้วงเงิน
            </Button>
          </>
        }
      >
        {edit && d && (
          <div className="space-y-3">
            {edit.base && (
              <p className="rounded-xl bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
                ค่าเดิม: ระดับ {edit.base.minLevel}–{edit.base.maxLevel} · ต่อครั้ง {show(edit.base.perClaim)} · ต่อปี {show(edit.base.perYear)} · {show(edit.base.maxCount, " ครั้ง")}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              {(["minLevel", "maxLevel"] as const).map((k) => (
                <Field key={k} label={k === "minLevel" ? "ระดับต่ำสุด" : "ระดับสูงสุด"}>
                  <Select value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })}>
                    {LEVELS.map((lv) => (
                      <option key={lv} value={lv}>
                        {lv} · {levelName(lv)}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="ต่อครั้ง (บาท)" hint="ว่าง = ไม่จำกัด">
                <Input type="number" min={0} value={d.perClaim} onChange={(e) => setD({ ...d, perClaim: e.target.value })} />
              </Field>
              <Field label="ต่อปี (บาท)" hint="ว่าง = ไม่จำกัด">
                <Input type="number" min={0} value={d.perYear} onChange={(e) => setD({ ...d, perYear: e.target.value })} />
              </Field>
              <Field label="ครั้ง/ปี" hint="ว่าง = ไม่จำกัด">
                <Input type="number" min={0} value={d.maxCount} onChange={(e) => setD({ ...d, maxCount: e.target.value })} />
              </Field>
            </div>
            <Field label="เหตุผลที่ขอแก้" required>
              <Textarea value={d.reason} onChange={(e) => setD({ ...d, reason: e.target.value })} placeholder="เช่น ปรับตามประกาศสวัสดิการปี 2570" />
            </Field>
            {d.perYear && <p className="text-xs text-zinc-500">ต่อปีใหม่ {money(Number(d.perYear))} มีผลวันที่อนุมัติ</p>}
          </div>
        )}
      </Modal>
    </Page>
  );
}
