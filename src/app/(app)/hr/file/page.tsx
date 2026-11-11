"use client";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Page } from "@/components/AppShell";
import { ClaimForm } from "@/components/ClaimForm";
import { Alert, Avatar, Button, Card, Input } from "@/components/ui";
import { EMPLOYMENT_TYPE_LABEL } from "@/lib/domain/constants";
import { useDB, useMe } from "@/lib/hooks";
import { fullName } from "@/lib/services/core";

export default function FileOnBehalf() {
  const db = useDB();
  const me = useMe()!;
  const router = useRouter();
  const [q, setQ] = useState("");
  const [empId, setEmpId] = useState<string | null>(null);
  const emp = db.employees.find((e) => e.id === empId);
  const s = q.trim().toLowerCase();
  const list = db.employees.filter((e) => e.active && e.id !== me.id && (!s || `${e.code} ${fullName(e)}`.toLowerCase().includes(s)));

  return (
    <Page title="ยื่นเบิกแทนพนักงาน" perm="claim.file_on_behalf" back="/hr">
      <div className="mx-auto max-w-xl">
        <Alert tone="info" className="mb-4">
          ระบบจะบันทึกผู้ทำรายการแทนและเหตุผลไว้ในคำขอและ Audit Log · คำขอที่ HR ยื่นแทนยังต้องผ่านการตรวจและอนุมัติตามขั้นตอนปกติ
        </Alert>
        {!emp ? (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
              <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหารหัสหรือชื่อพนักงาน" className="pl-9" />
            </div>
            <div className="mt-3 space-y-2">
              {list.map((e) => (
                <button key={e.id} onClick={() => setEmpId(e.id)} className="block w-full text-left">
                  <Card className="flex items-center gap-3 p-3 hover:border-brand-200">
                    <Avatar name={e.firstName} />
                    <div className="flex-1">
                      <p className="font-medium">{fullName(e)}</p>
                      <p className="text-xs text-zinc-500">
                        {e.code} · {db.departments.find((d) => d.id === e.departmentId)?.name} · {EMPLOYMENT_TYPE_LABEL[e.employmentType]}
                      </p>
                    </div>
                  </Card>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <Card className="mb-4 flex items-center gap-3 p-3">
              <Avatar name={emp.firstName} />
              <div className="flex-1">
                <p className="font-medium">{fullName(emp)}</p>
                <p className="text-xs text-zinc-500">
                  {emp.code} · {EMPLOYMENT_TYPE_LABEL[emp.employmentType]}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setEmpId(null)}>
                เปลี่ยน
              </Button>
            </Card>
            <ClaimForm key={emp.id} employeeId={emp.id} onBehalf onDone={(c) => router.push(`/claim?id=${c.id}`)} />
          </>
        )}
      </div>
    </Page>
  );
}
