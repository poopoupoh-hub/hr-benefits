"use client";
import { History, Pencil, Plus, Search, UserX, UserCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { Page } from "@/components/AppShell";
import { AuditRow } from "@/components/AuditList";
import { EmployeeForm } from "@/components/EmployeeForm";
import { Avatar, Badge, Button, Card, Empty, Input, Modal, Select, useAction } from "@/components/ui";
import { EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_LABEL, ROLE_LABEL } from "@/lib/domain/constants";
import type { Employee, EmploymentType } from "@/lib/domain/types";
import { dateTH } from "@/lib/format";
import { fetchAudit } from "@/lib/client/api";
import { useAsync, useCan, useDB, useMe } from "@/lib/hooks";
import { fullName } from "@/lib/services/core";
import { api } from "@/lib/client/api";

function EmployeeHistory({ employeeId }: { employeeId: string }) {
  const db = useDB();
  const { data, loading, error } = useAsync(() => fetchAudit({ entityId: employeeId, entities: "employee,rbac,auth", limit: 200 }), [employeeId, db]);
  return (
    <Card className="divide-y divide-zinc-100">
      {loading && <p className="p-4 text-sm text-zinc-500">กำลังโหลด…</p>}
      {error && <p className="p-4 text-sm text-red-600">{error}</p>}
      {data?.items.map((l) => (
        <AuditRow key={l.id} log={l} db={db} />
      ))}
      {data && data.items.length === 0 && <p className="p-4 text-sm text-zinc-500">ยังไม่มีประวัติการแก้ไขข้อมูล</p>}
    </Card>
  );
}

export default function EmployeesPage() {
  const db = useDB();
  const me = useMe()!;
  const can = useCan();
  const act = useAction();
  const manage = can("employee.manage");
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [type, setType] = useState<"" | EmploymentType>("");
  const [edit, setEdit] = useState<Employee | null | "new">(null);
  const [hist, setHist] = useState<Employee | null>(null);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return db.employees
      .filter((e) => (!dept || e.departmentId === dept) && (!type || e.employmentType === type) && (!s || `${e.code} ${fullName(e)} ${e.email}`.toLowerCase().includes(s)))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.code.localeCompare(b.code));
  }, [db, q, dept, type]);

  return (
    <Page
      title="ข้อมูลพนักงาน"
      perm="employee.view"
      wide
      actions={
        manage && (
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEdit("new")}>
            เพิ่ม
          </Button>
        )
      }
    >
      <p className="mb-3 text-sm text-zinc-500">แตะพนักงานเพื่อแก้ไขตำแหน่ง แผนก และประเภท (ซึ่งกำหนดสิทธิ์สวัสดิการ)</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_180px_160px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหารหัส ชื่อ อีเมล" className="pl-9" />
        </div>
        <Select value={dept} onChange={(e) => setDept(e.target.value)} aria-label="แผนก">
          <option value="">ทุกแผนก</option>
          {db.departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <Select value={type} onChange={(e) => setType(e.target.value as EmploymentType | "")} aria-label="ประเภท">
          <option value="">ทุกประเภท</option>
          {EMPLOYMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {EMPLOYMENT_TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
      </div>
      <p className="mt-3 text-xs text-zinc-500">{list.length} คน</p>
      <div className="mt-2 grid gap-3 lg:grid-cols-2">
        {list.map((e) => {
          const pos = db.positions.find((p) => p.id === e.positionId);
          const d = db.departments.find((x) => x.id === e.departmentId);
          const mgr = db.employees.find((x) => x.id === e.managerId);
          return (
            <Card key={e.id} className={`p-4 ${e.active ? "" : "bg-zinc-50 opacity-70"}`}>
              <div className="flex items-start gap-3">
                <Avatar name={e.firstName} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{fullName(e)}</p>
                  <p className="text-xs text-zinc-500">
                    {e.code} · {pos?.name} · {d?.code}
                  </p>
                  <p className="text-xs text-zinc-500">
                    เริ่ม {dateTH(e.startDate)}
                    {e.contractEndDate && ` · หมดสัญญา ${dateTH(e.contractEndDate)}`}
                    {mgr && ` · หัวหน้า ${mgr.firstName}`}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone={e.employmentType === "terminated" ? "red" : "gray"}>{EMPLOYMENT_TYPE_LABEL[e.employmentType]}</Badge>
                    {e.role !== "employee" && <Badge tone="orange">{ROLE_LABEL[e.role]}</Badge>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  {manage && (
                    <Button size="sm" variant="secondary" icon={<Pencil className="size-3.5" />} onClick={() => setEdit(e)}>
                      แก้ไข
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" icon={<History className="size-3.5" />} onClick={() => setHist(e)}>
                    ประวัติ
                  </Button>
                  {manage && e.id !== me.id && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className={e.active ? "text-red-600" : "text-emerald-600"}
                      icon={e.active ? <UserX className="size-3.5" /> : <UserCheck className="size-3.5" />}
                      onClick={() => act(() => api.setEmployeeActive(e.id, !e.active), e.active ? "ปิดสถานะแล้ว (พ้นสภาพ)" : "เปิดสถานะแล้ว")}
                    >
                      {e.active ? "ปิดสถานะ" : "เปิดสถานะ"}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      {list.length === 0 && <Empty title="ไม่พบพนักงาน" />}
      {edit && <EmployeeForm initial={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
      <Modal open={!!hist} onClose={() => setHist(null)} title={`ประวัติการแก้ไข · ${hist?.code}`} size="lg">
        {hist && <EmployeeHistory employeeId={hist.id} />}
      </Modal>
    </Page>
  );
}
