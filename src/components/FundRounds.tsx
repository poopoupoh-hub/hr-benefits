"use client";
import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, Field, Input, Modal, Progress, SectionTitle, Select, useAction } from "@/components/ui";
import { api } from "@/lib/client/api";
import { todayLocal } from "@/lib/domain/dates";
import { fundRoundUsage } from "@/lib/domain/rules";
import type { FundRound } from "@/lib/domain/types";
import { dateTH, money } from "@/lib/format";
import { useDB } from "@/lib/hooks";

/** รอบงบช่วยเหลือ (สวัสดิการแบบ HR กำหนดยอด เช่น ภัยพิบัติ) */
export function FundRounds() {
  const db = useDB();
  const act = useAction();
  const today = todayLocal();
  const [round, setRound] = useState<(Partial<FundRound> & { _id?: string }) | null>(null);
  const assignedTypes = db.benefitTypes.filter((b) => b.mode === "assigned");
  if (!assignedTypes.length) return null;

  const saveRound = () => {
    if (!round) return;
    act(
      () =>
        api.saveFundRound(
          {
            benefitTypeId: round.benefitTypeId ?? assignedTypes[0].id,
            name: round.name ?? "",
            budget: Number(round.budget) || 0,
            openFrom: round.openFrom ?? "",
            openTo: round.openTo ?? "",
            maxPerPerson: round.maxPerPerson == null || String(round.maxPerPerson) === "" ? null : Number(round.maxPerPerson),
            status: round.status ?? "open",
          },
          round._id,
        ),
      "บันทึกรอบงบแล้ว",
    ).then((ok) => ok && setRound(null));
  };

  return (
    <>
      <SectionTitle
        className="mt-8"
        action={
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setRound({ benefitTypeId: assignedTypes[0].id, openFrom: today, openTo: today, status: "open" })}>
            เปิดรอบงบใหม่
          </Button>
        }
      >
        รอบงบช่วยเหลือ (HR กำหนดยอด)
      </SectionTitle>
      <div className="grid gap-3 lg:grid-cols-2">
        {db.fundRounds.map((r) => {
          const u = fundRoundUsage(r, db.claims);
          const open = r.status === "open" && r.openTo >= today;
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
                  <Badge tone={open ? "green" : "gray"}>{open ? "เปิดรับ" : "ปิดแล้ว"}</Badge>
                  <button onClick={() => setRound({ ...r, _id: r.id })} className="p-1 text-zinc-400 hover:text-ink-900" aria-label="แก้ไขรอบงบ">
                    <Pencil className="size-4" />
                  </button>
                </div>
              </div>
              <Progress value={(u.assigned / r.budget) * 100} className="mt-3" />
              <p className="mt-1.5 text-xs text-zinc-500">
                กำหนดแล้ว {money(u.assigned)} จาก {money(r.budget)} · คงเหลือ {money(u.remaining)} · {u.count} คำขอ
                {r.maxPerPerson != null && ` · สูงสุด ${money(r.maxPerPerson)}/คน`}
              </p>
            </Card>
          );
        })}
      </div>

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
    </>
  );
}
