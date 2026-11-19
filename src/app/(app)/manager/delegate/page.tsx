"use client";
import { UserCheck } from "lucide-react";
import { useState } from "react";
import { Page } from "@/components/AppShell";
import { Alert, Button, Card, Field, Input, Select, Textarea, useAction } from "@/components/ui";
import { api } from "@/lib/client/api";
import { addDays, todayLocal } from "@/lib/domain/dates";
import { dateTH } from "@/lib/format";
import { useDB, useMe } from "@/lib/hooks";
import { activeDelegate, canBeDelegate } from "@/lib/services/approval";
import { fullName } from "@/lib/services/core";

/** หัวหน้างานกำหนดผู้อนุมัติสำรองเมื่อไม่อยู่ (ตามสไลด์ User Requirements ของ Manager) */
export default function DelegatePage() {
  const db = useDB();
  const me = useMe()!;
  const act = useAction();
  const today = todayLocal();
  const current = me.delegation ?? null;
  const currentTo = current ? db.employees.find((e) => e.id === current.toId) : undefined;
  const effective = activeDelegate(db, me, today);
  const candidates = db.employees.filter((e) => e.id !== me.id && canBeDelegate(db, e));
  const [toId, setToId] = useState(current?.toId ?? "");
  const [from, setFrom] = useState(current?.from ?? today);
  const [to, setTo] = useState(current?.to ?? addDays(today, 7));
  const [note, setNote] = useState(current?.note ?? "");
  const coveringFor = db.employees.filter((e) => e.delegation?.toId === me.id && e.delegation.to >= today);

  return (
    <Page title="ผู้อนุมัติสำรอง" perm="claim.approve">
      <div className="mx-auto max-w-xl space-y-4">
        <p className="text-sm text-zinc-600">
          เมื่อคุณลา/ไม่อยู่ ให้ผู้อนุมัติสำรองอนุมัติคำขอที่ส่งถึงคุณแทนได้ในช่วงวันที่กำหนด — คุณยังอนุมัติเองได้ตามปกติ และทุกรายการบันทึกว่า &quot;อนุมัติแทน&quot; ใน Audit Log
        </p>

        {current && currentTo && (
          <Alert tone={effective ? "success" : "info"} icon={<UserCheck className="size-4" />}>
            <b>{fullName(currentTo)}</b> เป็นผู้อนุมัติสำรอง {dateTH(current.from)} – {dateTH(current.to)}
            <span className="block text-xs">{effective ? "มีผลอยู่ตอนนี้" : current.to < today ? "หมดอายุแล้ว" : "ยังไม่ถึงวันเริ่ม"}</span>
          </Alert>
        )}

        <Card className="space-y-3 p-4">
          <Field label="ผู้อนุมัติสำรอง" required hint="เลือกได้เฉพาะผู้ที่มีสิทธิ์อนุมัติ (หัวหน้างานคนอื่น)">
            <Select value={toId} onChange={(e) => setToId(e.target.value)}>
              <option value="">— เลือก —</option>
              {candidates.map((e) => (
                <option key={e.id} value={e.id}>
                  {fullName(e)} ({e.code} · {db.positions.find((p) => p.id === e.positionId)?.name})
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ตั้งแต่วันที่" required>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="ถึงวันที่" required>
              <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
          <Field label="หมายเหตุ">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ลาพักร้อน" />
          </Field>
          <div className="flex gap-2 [&>*]:flex-1">
            {current && (
              <Button variant="outline-danger" onClick={() => act(() => api.setDelegation(null), "ยกเลิกผู้อนุมัติสำรองแล้ว").then((ok) => ok && setToId(""))}>
                ยกเลิกผู้อนุมัติสำรอง
              </Button>
            )}
            <Button disabled={!toId || !from || !to} onClick={() => act(() => api.setDelegation({ toId, from, to, note }), "บันทึกผู้อนุมัติสำรองแล้ว แจ้งอีเมลผู้รับมอบหมาย")}>
              บันทึก
            </Button>
          </div>
        </Card>

        {coveringFor.length > 0 && (
          <Card className="p-4">
            <p className="mb-2 text-sm font-medium">คุณได้รับมอบหมายให้อนุมัติแทน</p>
            {coveringFor.map((e) => (
              <p key={e.id} className="text-sm text-zinc-600">
                {fullName(e)} · {dateTH(e.delegation?.from)} – {dateTH(e.delegation?.to)}
              </p>
            ))}
          </Card>
        )}
      </div>
    </Page>
  );
}
