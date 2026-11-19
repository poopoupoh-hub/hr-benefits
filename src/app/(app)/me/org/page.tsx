"use client";
import { Mail, Phone } from "lucide-react";
import { Page } from "@/components/AppShell";
import { Avatar, Badge, Card, SectionTitle } from "@/components/ui";
import { EMPLOYMENT_TYPE_LABEL, ROLE_LABEL } from "@/lib/domain/constants";
import { dateTH } from "@/lib/format";
import type { Employee } from "@/lib/domain/types";
import { useDB, useMe } from "@/lib/hooks";
import { fullName } from "@/lib/services/core";

function Person({ e, label, highlight }: { e: Employee; label?: string; highlight?: boolean }) {
  const db = useDB();
  const pos = db.positions.find((p) => p.id === e.positionId);
  return (
    <Card className={`flex items-center gap-3 p-3.5 ${highlight ? "border-brand-200 ring-4 ring-brand-500/10" : ""}`}>
      <Avatar name={e.firstName} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {fullName(e)} {label && <Badge tone="orange" className="ml-1">{label}</Badge>}
        </p>
        <p className="truncate text-xs text-zinc-500">
          {e.code} · {pos?.name}
        </p>
      </div>
      <a href={`mailto:${e.email}`} className="rounded-full p-2 text-zinc-400 hover:bg-zinc-100" aria-label={`อีเมล ${e.firstName}`}>
        <Mail className="size-4" />
      </a>
    </Card>
  );
}

export default function OrgPage() {
  const db = useDB();
  const me = useMe()!;
  const dept = db.departments.find((d) => d.id === me.departmentId);
  const pos = db.positions.find((p) => p.id === me.positionId);
  const chain: Employee[] = [];
  let cur = db.employees.find((e) => e.id === me.supervisorId);
  while (cur && chain.length < 10) {
    chain.unshift(cur);
    cur = db.employees.find((e) => e.id === cur!.supervisorId);
  }
  const peers = db.employees.filter((e) => e.active && e.supervisorId === me.supervisorId && e.id !== me.id && me.supervisorId);
  const reports = db.employees.filter((e) => e.active && e.supervisorId === me.id);

  return (
    <Page title="โครงสร้างองค์กร" perm="self.claim">
      <Card className="p-5">
        <div className="flex items-center gap-4">
          <Avatar name={me.firstName} className="size-14 text-lg" />
          <div>
            <p className="text-lg font-semibold">{fullName(me)}</p>
            <p className="text-sm text-zinc-500">
              {pos?.name} · แผนก {dept?.name}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Badge>{EMPLOYMENT_TYPE_LABEL[me.employmentType]}</Badge>
              <Badge tone="orange">{ROLE_LABEL[me.role]}</Badge>
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-zinc-500">รหัสพนักงาน</p>
            <p className="font-medium">{me.code}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">วันเริ่มงาน</p>
            <p className="font-medium">{dateTH(me.startDate)}</p>
          </div>
          {me.contractEndDate && (
            <div>
              <p className="text-xs text-zinc-500">วันหมดสัญญา</p>
              <p className="font-medium">{dateTH(me.contractEndDate)}</p>
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs text-zinc-500">ติดต่อ</p>
            <p className="flex items-center gap-1 truncate font-medium">
              <Phone className="size-3" /> {me.phone ?? "-"}
            </p>
          </div>
        </div>
      </Card>

      <SectionTitle className="mt-6">สายบังคับบัญชา</SectionTitle>
      {chain.length === 0 ? (
        <p className="text-sm text-zinc-500">คุณอยู่ระดับสูงสุดขององค์กร</p>
      ) : (
        <div className="space-y-2">
          {chain.map((e, i) => (
            <div key={e.id} style={{ marginLeft: `${i * 16}px` }}>
              <Person e={e} label={i === chain.length - 1 ? "หัวหน้าของฉัน" : undefined} highlight={i === chain.length - 1} />
            </div>
          ))}
        </div>
      )}

      {reports.length > 0 && (
        <>
          <SectionTitle>ลูกทีมของฉัน ({reports.length})</SectionTitle>
          <div className="grid gap-2 sm:grid-cols-2">
            {reports.map((e) => (
              <Person key={e.id} e={e} />
            ))}
          </div>
        </>
      )}
      {peers.length > 0 && (
        <>
          <SectionTitle>เพื่อนร่วมทีม ({peers.length})</SectionTitle>
          <div className="grid gap-2 sm:grid-cols-2">
            {peers.map((e) => (
              <Person key={e.id} e={e} />
            ))}
          </div>
        </>
      )}
    </Page>
  );
}
