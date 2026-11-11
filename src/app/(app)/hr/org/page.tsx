"use client";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Page } from "@/components/AppShell";
import { Badge, Button, Card, Field, Input, Modal, SectionTitle, Select, useAction } from "@/components/ui";
import type { Department, Position } from "@/lib/domain/types";
import { useDB } from "@/lib/hooks";
import { fullName } from "@/lib/services/core";
import { api } from "@/lib/client/api";

export default function OrgManage() {
  const db = useDB();
  const act = useAction();
  const [dept, setDept] = useState<Partial<Department> | null>(null);
  const [pos, setPos] = useState<Partial<Position> | null>(null);

  return (
    <Page title="แผนก / ตำแหน่ง" perm="org.manage" wide>
      <SectionTitle
        action={
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setDept({ code: "", name: "" })}>
            เพิ่มแผนก
          </Button>
        }
      >
        แผนกและตำแหน่ง
      </SectionTitle>
      <div className="grid gap-3 lg:grid-cols-2">
        {db.departments.map((d) => {
          const positions = db.positions.filter((p) => p.departmentId === d.id);
          const count = db.employees.filter((e) => e.departmentId === d.id && e.active).length;
          const heads = [...new Set(db.employees.filter((e) => e.departmentId === d.id && e.role === "manager").map((e) => fullName(e)))];
          return (
            <Card key={d.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {d.name} <Badge className="ml-1">{d.code}</Badge>
                  </p>
                  <p className="text-xs text-zinc-500">
                    พนักงาน {count} คน{heads.length > 0 && ` · หัวหน้า: ${heads.join(", ")}`}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setDept(d)} aria-label="แก้ไขแผนก" />
                  <Button size="sm" variant="ghost" className="text-red-600" icon={<Trash2 className="size-3.5" />} onClick={() => act(() => api.deleteDepartment(d.id), "ลบแผนกแล้ว")} aria-label="ลบแผนก" />
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                {positions.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-1.5 text-sm">
                    <span>
                      {p.name} <span className="text-xs text-zinc-400">· {db.employees.filter((e) => e.positionId === p.id && e.active).length} คน</span>
                    </span>
                    <span className="flex gap-1">
                      <button className="p-1 text-zinc-400 hover:text-ink-900" onClick={() => setPos(p)} aria-label={`แก้ไข ${p.name}`}>
                        <Pencil className="size-3.5" />
                      </button>
                      <button className="p-1 text-zinc-400 hover:text-red-600" onClick={() => act(() => api.deletePosition(p.id), "ลบตำแหน่งแล้ว")} aria-label={`ลบ ${p.name}`}>
                        <Trash2 className="size-3.5" />
                      </button>
                    </span>
                  </div>
                ))}
                <button onClick={() => setPos({ name: "", departmentId: d.id })} className="w-full rounded-lg border border-dashed border-zinc-300 py-1.5 text-xs text-zinc-500 hover:border-brand-500 hover:text-brand-600">
                  + เพิ่มตำแหน่ง
                </button>
              </div>
            </Card>
          );
        })}
      </div>

      <Modal
        open={!!dept}
        onClose={() => setDept(null)}
        title={dept?.id ? "แก้ไขแผนก" : "เพิ่มแผนก"}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDept(null)}>
              ยกเลิก
            </Button>
            <Button onClick={() => act(() => api.saveDepartment(dept as Department), "บันทึกแผนกแล้ว").then((ok) => ok && setDept(null))}>บันทึก</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="รหัสแผนก" required>
            <Input value={dept?.code ?? ""} onChange={(e) => setDept({ ...dept, code: e.target.value })} placeholder="เช่น MKT" />
          </Field>
          <Field label="ชื่อแผนก" required>
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
          <Field label="แผนก" required>
            <Select value={pos?.departmentId ?? ""} onChange={(e) => setPos({ ...pos, departmentId: e.target.value })}>
              {db.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>
    </Page>
  );
}
