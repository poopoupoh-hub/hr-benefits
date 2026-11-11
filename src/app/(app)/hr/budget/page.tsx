"use client";
import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Page } from "@/components/AppShell";
import { Badge, Button, Card, Field, Input, Modal, Progress, SectionTitle, Select, useAction } from "@/components/ui";
import { beYear, todayLocal, yearOf } from "@/lib/domain/dates";
import { fundRoundUsage, orgBudgetOf } from "@/lib/domain/rules";
import type { FundRound } from "@/lib/domain/types";
import { dateTH, money } from "@/lib/format";
import { useDB } from "@/lib/hooks";
import { api } from "@/lib/client/api";

export default function BudgetPage() {
  const db = useDB();
  const act = useAction();
  const today = todayLocal();
  const [year, setYear] = useState(yearOf(today));
  const [editB, setEditB] = useState<{ id: string; name: string; value: string } | null>(null);
  const [round, setRound] = useState<(Partial<FundRound> & { _id?: string }) | null>(null);
  const assignedTypes = db.benefitTypes.filter((b) => b.mode === "assigned");

  const rows = db.benefitTypes.filter((b) => b.mode === "claim").map((b) => ({ b, ob: orgBudgetOf(b, year, db.employees, db.claims, db.budgets, today) }));
  const tot = rows.reduce((s, r) => ({ budget: s.budget + (r.ob.budget ?? 0), used: s.used + r.ob.used, pending: s.pending + r.ob.pending, paid: s.paid + r.ob.paid }), { budget: 0, used: 0, pending: 0, paid: 0 });

  const saveRound = () => {
    if (!round) return;
    const { _id, id: _ignore, createdAt: _c, ...rest } = round;
    void _ignore;
    void _c;
    act(
      () =>
        api.saveFundRound({
            benefitTypeId: rest.benefitTypeId ?? assignedTypes[0]?.id ?? "",
            name: rest.name ?? "",
            budget: Number(rest.budget) || 0,
            openFrom: rest.openFrom ?? "",
            openTo: rest.openTo ?? "",
            maxPerPerson: rest.maxPerPerson == null || String(rest.maxPerPerson) === "" ? null : Number(rest.maxPerPerson),
            status: rest.status ?? "open",
          },
          _id,
        ),
      "บันทึกรอบงบแล้ว",
    ).then((ok) => ok && setRound(null));
  };

  return (
    <Page title="งบประมาณรายปี" perm="budget.manage" wide>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">งบรวมทั้งองค์กร (ค่าเริ่มต้น = จำนวนพนักงานที่มีสิทธิ์ × วงเงิน) — ตัดยอดตามปีปฏิทิน</p>
        <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-32" aria-label="ปีงบประมาณ">
          {[yearOf(today) - 1, yearOf(today), yearOf(today) + 1].map((y) => (
            <option key={y} value={y}>
              ปี {beYear(y)}
            </option>
          ))}
        </Select>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["งบรวม", tot.budget, "text-ink-900"],
          ["อนุมัติแล้ว", tot.used, "text-brand-600"],
          ["รอดำเนินการ", tot.pending, "text-amber-600"],
          ["คงเหลือ", tot.budget - tot.used - tot.pending, "text-emerald-600"],
        ].map(([l, v, c]) => (
          <Card key={l as string} className="p-4">
            <p className="text-xs text-zinc-500">{l}</p>
            <p className={`mt-1 text-lg font-semibold tabular ${c}`}>{money(v as number)}</p>
          </Card>
        ))}
      </div>

      <SectionTitle className="mt-6">แยกตามประเภทสวัสดิการ</SectionTitle>
      <div className="grid gap-3 lg:grid-cols-2">
        {rows.map(({ b, ob }) => {
          const pct = ob.budget ? ((ob.used + ob.pending) / ob.budget) * 100 : 0;
          return (
            <Card key={b.id} className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">{b.name}</p>
                  <p className="text-xs text-zinc-500">
                    {ob.eligibleCount} คนมีสิทธิ์ · {ob.auto ? "คำนวณอัตโนมัติ" : <Badge tone="orange">กำหนดเอง</Badge>}
                  </p>
                </div>
                <button className="text-sm font-medium text-brand-600" onClick={() => setEditB({ id: b.id, name: b.name, value: ob.auto ? "" : String(ob.budget ?? "") })}>
                  แก้ไข
                </button>
              </div>
              <Progress value={pct} className="mt-3" tone={pct > 90 ? "red" : "brand"} />
              <div className="mt-3 grid grid-cols-3 text-center text-xs">
                <div>
                  <p className="text-zinc-500">วงเงินรวม</p>
                  <p className="font-semibold tabular">{money(ob.budget)}</p>
                </div>
                <div>
                  <p className="text-zinc-500">ใช้ไป/จอง</p>
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

      <SectionTitle
        className="mt-8"
        action={
          assignedTypes.length > 0 && (
            <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setRound({ benefitTypeId: assignedTypes[0].id, openFrom: today, openTo: today, status: "open" })}>
              เปิดรอบงบใหม่
            </Button>
          )
        }
      >
        รอบงบช่วยเหลือ (HR กำหนดยอด)
      </SectionTitle>
      <div className="grid gap-3 lg:grid-cols-2">
        {db.fundRounds.map((r) => {
          const u = fundRoundUsage(r, db.claims);
          const pending = db.claims.filter((c) => c.fundRoundId === r.id && c.status === "pending_hr").length;
          return (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{r.name}</p>
                  <p className="text-xs text-zinc-500">
                    {db.benefitTypes.find((b) => b.id === r.benefitTypeId)?.name} · {dateTH(r.openFrom)} – {dateTH(r.openTo)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={r.status === "open" && r.openTo >= today ? "green" : "gray"}>{r.status === "open" && r.openTo >= today ? "เปิดรับ" : "ปิดแล้ว"}</Badge>
                  <button onClick={() => setRound({ ...r, _id: r.id })} className="p-1 text-zinc-400 hover:text-ink-900" aria-label="แก้ไขรอบงบ">
                    <Pencil className="size-4" />
                  </button>
                </div>
              </div>
              <Progress value={(u.assigned / r.budget) * 100} className="mt-3" />
              <p className="mt-1.5 text-xs text-zinc-500">
                กำหนดแล้ว {money(u.assigned)} จาก {money(r.budget)} · คงเหลือ {money(u.remaining)} · {u.count} คำขอ{pending > 0 && ` (รอ HR ประเมิน ${pending})`}
                {r.maxPerPerson != null && ` · สูงสุด ${money(r.maxPerPerson)}/คน`}
              </p>
            </Card>
          );
        })}
      </div>

      <Modal
        open={!!editB}
        onClose={() => setEditB(null)}
        size="sm"
        title={`งบปี ${beYear(year)} · ${editB?.name}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditB(null)}>
              ยกเลิก
            </Button>
            <Button onClick={() => editB && act(() => api.setBudget(editB.id, year, editB.value.trim() === "" ? null : Number(editB.value)), "บันทึกงบประมาณแล้ว").then((ok) => ok && setEditB(null))}>บันทึก</Button>
          </>
        }
      >
        <Field label="งบประมาณ (บาท)" hint="เว้นว่างเพื่อคำนวณอัตโนมัติจากจำนวนพนักงานที่มีสิทธิ์ × วงเงิน">
          <Input type="number" min={0} value={editB?.value ?? ""} onChange={(e) => editB && setEditB({ ...editB, value: e.target.value })} />
        </Field>
      </Modal>

      <Modal
        open={!!round}
        onClose={() => setRound(null)}
        title={round?._id ? "แก้ไขรอบงบ" : "เปิดรอบงบใหม่"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRound(null)}>
              ยกเลิก
            </Button>
            <Button onClick={saveRound}>บันทึก</Button>
          </>
        }
      >
        {round && (
          <div className="space-y-3">
            <Field label="สวัสดิการ">
              <Select value={round.benefitTypeId} onChange={(e) => setRound({ ...round, benefitTypeId: e.target.value })}>
                {assignedTypes.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="ชื่อรอบ" required>
              <Input value={round.name ?? ""} onChange={(e) => setRound({ ...round, name: e.target.value })} placeholder="เช่น น้ำท่วม ต.ค. 2569" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="งบของรอบ (บาท)" required>
                <Input type="number" min={0} value={round.budget ?? ""} onChange={(e) => setRound({ ...round, budget: Number(e.target.value) })} />
              </Field>
              <Field label="สูงสุดต่อคน (บาท)" hint="ว่าง = ไม่จำกัด">
                <Input type="number" min={0} value={round.maxPerPerson ?? ""} onChange={(e) => setRound({ ...round, maxPerPerson: e.target.value === "" ? null : Number(e.target.value) })} />
              </Field>
              <Field label="เปิดรับตั้งแต่" required>
                <Input type="date" value={round.openFrom ?? ""} onChange={(e) => setRound({ ...round, openFrom: e.target.value })} />
              </Field>
              <Field label="ถึง" required>
                <Input type="date" value={round.openTo ?? ""} onChange={(e) => setRound({ ...round, openTo: e.target.value })} />
              </Field>
            </div>
            <Field label="สถานะ">
              <Select value={round.status} onChange={(e) => setRound({ ...round, status: e.target.value as FundRound["status"] })}>
                <option value="open">เปิดรับ</option>
                <option value="closed">ปิดรับ</option>
              </Select>
            </Field>
          </div>
        )}
      </Modal>
    </Page>
  );
}
