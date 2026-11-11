"use client";
import { useState } from "react";
import { EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_LABEL, ROLE_LABEL, ROLE_ORDER } from "@/lib/domain/constants";
import { todayLocal } from "@/lib/domain/dates";
import type { Employee, EmploymentType, Role } from "@/lib/domain/types";
import { useCan, useDB } from "@/lib/hooks";
import { fullName } from "@/lib/services/core";
import { Button, Field, Input, Modal, Select, useAction } from "./ui";
import { api } from "@/lib/client/api";
import type { EmployeeInput } from "@/lib/services/admin";

function nextCode(db: ReturnType<typeof useDB>) {
  const max = Math.max(0, ...db.employees.map((e) => Number(e.code.replace(/\D/g, "")) || 0));
  return `EMP-${String(max + 1).padStart(4, "0")}`;
}

export function EmployeeForm({ initial, onClose }: { initial: Employee | null; onClose: () => void }) {
  const db = useDB();
  const act = useAction();
  const [f, setF] = useState<EmployeeInput>(
    initial
      ? {
          code: initial.code,
          firstName: initial.firstName,
          lastName: initial.lastName,
          email: initial.email,
          phone: initial.phone ?? "",
          departmentId: initial.departmentId,
          positionId: initial.positionId,
          managerId: initial.managerId,
          employmentType: initial.employmentType,
          startDate: initial.startDate,
          contractEndDate: initial.contractEndDate ?? "",
        }
      : {
          code: nextCode(db),
          firstName: "",
          lastName: "",
          email: "",
          phone: "",
          departmentId: db.departments[0]?.id ?? "",
          positionId: "",
          managerId: null,
          employmentType: "probation",
          startDate: todayLocal(),
          contractEndDate: "",
        },
  );
  const can = useCan();
  const [role, setRole] = useState<Role>("employee");
  const set = <K extends keyof EmployeeInput>(k: K, v: EmployeeInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const positions = db.positions.filter((p) => p.departmentId === f.departmentId);
  const managers = db.employees.filter((e) => e.active && e.id !== initial?.id && (e.role === "manager" || db.rbac[e.role].includes("claim.approve")));
  const save = () => {
    act(() => (initial ? api.updateEmployee(initial.id, f) : api.createEmployee({ ...f, role })), initial ? "บันทึกการแก้ไขแล้ว (บันทึกประวัติ)" : "เพิ่มพนักงานแล้ว — รหัสผ่านเริ่มต้น 1234").then((ok) => ok && onClose());
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? `แก้ไข ${initial.code}` : "เพิ่มพนักงาน"}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button onClick={save}>บันทึก</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="รหัสพนักงาน" required>
          <Input value={f.code} onChange={(e) => set("code", e.target.value.toUpperCase())} />
        </Field>
        <Field label="ประเภทพนักงาน" required hint="กำหนดสิทธิ์สวัสดิการ">
          <Select value={f.employmentType} onChange={(e) => set("employmentType", e.target.value as EmploymentType)}>
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EMPLOYMENT_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="ชื่อ" required>
          <Input value={f.firstName} onChange={(e) => set("firstName", e.target.value)} />
        </Field>
        <Field label="นามสกุล" required>
          <Input value={f.lastName} onChange={(e) => set("lastName", e.target.value)} />
        </Field>
        <Field label="อีเมล" required hint="ใช้รับการแจ้งเตือน">
          <Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="เบอร์โทร">
          <Input value={f.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="แผนก" required>
          <Select
            value={f.departmentId}
            onChange={(e) => {
              set("departmentId", e.target.value);
              set("positionId", "");
            }}
          >
            {db.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="ตำแหน่ง" required>
          <Select value={f.positionId} onChange={(e) => set("positionId", e.target.value)}>
            <option value="">— เลือก —</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="หัวหน้างาน (ผู้อนุมัติ)" className="sm:col-span-2">
          <Select value={f.managerId ?? ""} onChange={(e) => set("managerId", e.target.value || null)}>
            <option value="">— ไม่มี (ระดับสูงสุด) —</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {fullName(m)} · {db.positions.find((p) => p.id === m.positionId)?.name}
              </option>
            ))}
          </Select>
        </Field>
        {!initial && can("user.manage") && (
          <Field label="Role ของบัญชีผู้ใช้" className="sm:col-span-2">
            <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLE_ORDER.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="วันเริ่มงาน" required>
          <Input type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} />
        </Field>
        <Field label="วันหมดสัญญา" required={f.employmentType === "contract"}>
          <Input type="date" value={f.contractEndDate ?? ""} onChange={(e) => set("contractEndDate", e.target.value)} />
        </Field>
      </div>
      <p className="mt-3 text-xs text-zinc-500">การแก้ไขทุกครั้งจะถูกบันทึกข้อมูลก่อน–หลังใน Audit Log · การกำหนด Role ทำโดยผู้ดูแลระบบ</p>
    </Modal>
  );
}

