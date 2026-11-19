"use client";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Page } from "@/components/AppShell";
import { Badge, Button, Card, Field, Input, Modal, SectionTitle, Select, useAction } from "@/components/ui";
import { LEVELS, LEVEL_LABEL } from "@/lib/domain/constants";
import { levelOf } from "@/lib/domain/rules";
import type { Department, Position } from "@/lib/domain/types";
import { useDB } from "@/lib/hooks";
import { fullName } from "@/lib/services/core";
import { api } from "@/lib/client/api";

export default function OrgManage() {
  const db = useDB();
  const act = useAction();
  const [dept, setDept] = useState<Partial<Department> | null>(null);
  const [pos, setPos] = useState<Partial<Position> | null>(null);
  const positions = [...db.positions].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  return (
    <Page title="โครงสร้างองค์กร" perm="org.manage" wide>
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionTitle
            action={
              <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setDept({ code: "", name: "" })}>
                เพิ่มฝ่าย
              </Button>
            }
          >
            ฝ่าย
          </SectionTitle>
          <Card className="divide-y divide-zinc-100">
            {db.departments.map((d) => {
              const count = db.employees.filter((e) => e.departmentId === d.id && e.active).length;
              return (
                <div key={d.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
                  <span>
                    {d.name} <Badge className="ml-1">{d.code}</Badge> <span className="text-xs text-zinc-400">· {count} คน</span>
                  </span>
                  <span className="flex gap-1">
                    <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setDept(d)} aria-label={`แก้ไข ${d.name}`} />
                    <Button size="sm" variant="ghost" className="text-red-600" icon={<Trash2 className="size-3.5" />} onClick={() => act(() => api.deleteDepartment(d.id), "ลบฝ่ายแล้ว")} aria-label={`ลบ ${d.name}`} />
                  </span>
                </div>
              );
            })}
          </Card>
        </section>

        <section>
          <SectionTitle
            action={
              <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setPos({ name: "", level: 1 })}>
                เพิ่มตำแหน่ง
              </Button>
            }
          >
            ตำแหน่ง / ระดับ
          </SectionTitle>
          <Card className="divide-y divide-zinc-100">
            {positions.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
                <span>
                  <span className="mr-2 inline-flex size-6 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">{p.level}</span>
                  {p.name} <span className="text-xs text-zinc-400">· {LEVEL_LABEL[p.level]} · {db.employees.filter((e) => e.positionId === p.id && e.active).length} คน</span>
                </span>
                <span className="flex gap-1">
                  <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setPos(p)} aria-label={`แก้ไข ${p.name}`} />
                  <Button size="sm" variant="ghost" className="text-red-600" icon={<Trash2 className="size-3.5" />} onClick={() => act(() => api.deletePosition(p.id), "ลบตำแหน่งแล้ว")} aria-label={`ลบ ${p.name}`} />
                </span>
              </div>
            ))}
          </Card>
          <p className="mt-2 text-xs text-zinc-500">ระดับใช้กำหนดวงเงินสวัสดิการ (เมนูวงเงินตามระดับ) · ตำแหน่งไม่ผูกกับฝ่าย ใช้ร่วมกันได้ทุกฝ่าย</p>
        </section>
      </div>

      <SectionTitle className="mt-8">พนักงานแยกตามฝ่าย</SectionTitle>
      <p className="-mt-2 mb-3 text-xs text-zinc-500">แก้ฝ่าย ตำแหน่ง หัวหน้า และประเภทพนักงานได้ที่เมนู &quot;ข้อมูลพนักงาน&quot;</p>
      <div className="grid gap-3 lg:grid-cols-2">
        {db.departments.map((d) => {
          const members = db.employees
            .filter((e) => e.departmentId === d.id && e.active)
            .sort((a, b) => levelOf(b, db.positions) - levelOf(a, db.positions));
          if (!members.length) return null;
          return (
            <Card key={d.id} className="p-4">
              <p className="mb-2 font-semibold">{d.name}</p>
              <ul className="space-y-1 text-sm">
                {members.map((e) => (
                  <li key={e.id} className="flex justify-between gap-2">
                    <span>
                      {fullName(e)} <span className="text-xs text-zinc-400">· {db.positions.find((p) => p.id === e.positionId)?.name} (ระดับ {levelOf(e, db.positions)})</span>
                    </span>
                    <span className="truncate text-xs text-zinc-500">{e.supervisorId ? `หัวหน้า: ${fullName(db.employees.find((x) => x.id === e.supervisorId))}` : "—"}</span>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>

      <Modal
        open={!!dept}
        onClose={() => setDept(null)}
        title={dept?.id ? "แก้ไขฝ่าย" : "เพิ่มฝ่าย"}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDept(null)}>
              ยกเลิก
            </Button>
            <Button onClick={() => act(() => api.saveDepartment(dept as Department), "บันทึกฝ่ายแล้ว").then((ok) => ok && setDept(null))}>บันทึก</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="รหัสฝ่าย" required>
            <Input value={dept?.code ?? ""} onChange={(e) => setDept({ ...dept, code: e.target.value })} placeholder="เช่น MKT" />
          </Field>
          <Field label="ชื่อฝ่าย" required>
            <Input value={dept?.name ?? ""} onChange={(e) => setDept({ ...dept, name: e.target.value })} />
          </Field>
        </div>
      </Modal>
      <Modal
        open={!!pos}
        onClose={() => setPos(null)}
        title={pos?.id ? "แก้ไขตำแหน่ง" : "เพิ่มตำแหน่ง"}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPos(null)}>
              ยกเลิก
            </Button>
            <Button onClick={() => act(() => api.savePosition(pos as Position), "บันทึกตำแหน่งแล้ว").then((ok) => ok && setPos(null))}>บันทึก</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="ชื่อตำแหน่ง" required>
            <Input value={pos?.name ?? ""} onChange={(e) => setPos({ ...pos, name: e.target.value })} />
          </Field>
          <Field label="ระดับ" required hint="ระดับกำหนดวงเงินสวัสดิการ">
            <Select value={pos?.level ?? 1} onChange={(e) => setPos({ ...pos, level: Number(e.target.value) })}>
              {LEVELS.map((lv) => (
                <option key={lv} value={lv}>
                  {lv} · {LEVEL_LABEL[lv]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>
    </Page>
  );
}
