"use client";
import { KeyRound, Plus, Search } from "lucide-react";
import { useState } from "react";
import { Page } from "@/components/AppShell";
import { EmployeeForm } from "@/components/EmployeeForm";
import { Avatar, Badge, Button, Card, Field, Input, Modal, Select, useAction } from "@/components/ui";
import { EMPLOYMENT_TYPE_LABEL, ROLE_LABEL, ROLE_ORDER } from "@/lib/domain/constants";
import type { Employee, Role } from "@/lib/domain/types";
import { useDB } from "@/lib/hooks";
import { fullName } from "@/lib/services/core";
import { api } from "@/lib/client/api";

export default function UsersPage() {
  const db = useDB();
  const act = useAction();
  const [q, setQ] = useState("");
  const [role, setRole] = useState<"" | Role>("");
  const [cred, setCred] = useState<{ u: Employee; value: string } | null>(null);
  const [create, setCreate] = useState(false);
  const s = q.trim().toLowerCase();
  const list = db.employees.filter((e) => (!role || e.role === role) && (!s || `${e.code} ${fullName(e)} ${e.email}`.toLowerCase().includes(s)));
  const counts = ROLE_ORDER.map((r) => [r, db.employees.filter((e) => e.role === r && e.active).length] as const);

  return (
    <Page
      title="ผู้ใช้"
      perm="user.manage"
      wide
      actions={
        <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setCreate(true)}>
          สร้างบัญชี
        </Button>
      }
    >
      <div className="scrollbar-none -mx-1 mb-3 flex gap-2 overflow-x-auto px-1">
        {counts.map(([r, n]) => (
          <button key={r} onClick={() => setRole(role === r ? "" : r)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${role === r ? "border-brand-500 bg-brand-50 text-brand-700" : "border-zinc-200 bg-white"}`}>
            {ROLE_LABEL[r]} · {n}
          </button>
        ))}
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาผู้ใช้" className="pl-9" />
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {list.map((u) => (
          <Card key={u.id} className={`p-4 ${u.active ? "" : "opacity-60"}`}>
            <div className="flex items-start gap-3">
              <Avatar name={u.firstName} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{fullName(u)}</p>
                <p className="truncate text-xs text-zinc-500">
                  {u.code} · {db.positions.find((p) => p.id === u.positionId)?.name} · {db.departments.find((d) => d.id === u.departmentId)?.code}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge>{EMPLOYMENT_TYPE_LABEL[u.employmentType]}</Badge>
                  {!u.active && <Badge tone="red">ปิดบัญชี</Badge>}
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Select value={u.role} disabled={!u.active} onChange={(e) => act(() => api.setUserRole(u.id, e.target.value as Role), "เปลี่ยน Role แล้ว (บันทึก Audit Log)")} className="h-9 flex-1" aria-label={`Role ของ ${u.code}`}>
                {ROLE_ORDER.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
              <Button size="sm" variant="secondary" className="h-9" icon={<KeyRound className="size-3.5" />} onClick={() => setCred({ u, value: "" })}>
                รหัสผ่าน
              </Button>
            </div>
          </Card>
        ))}
      </div>
      <Modal
        open={!!cred}
        onClose={() => setCred(null)}
        size="sm"
        title={`รีเซ็ตรหัสผ่าน · ${cred?.u.code}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCred(null)}>
              ยกเลิก
            </Button>
            <Button onClick={() => cred && act(() => api.resetPassword(cred.u.id, cred.value), "รีเซ็ตแล้ว").then((ok) => ok && setCred(null))}>บันทึก</Button>
          </>
        }
      >
        {cred && (
          <Field label="รหัสผ่านใหม่ (อย่างน้อย 4 ตัว)">
            <Input autoFocus type="password" value={cred.value} onChange={(e) => setCred({ ...cred, value: e.target.value })} />
          </Field>
        )}
      </Modal>
      {create && <EmployeeForm initial={null} onClose={() => setCreate(false)} />}
    </Page>
  );
}
