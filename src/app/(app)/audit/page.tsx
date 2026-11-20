"use client";
import { Download, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Page } from "@/components/AppShell";
import { AuditRow } from "@/components/AuditList";
import { Alert, Button, Card, Empty, Input, Select } from "@/components/ui";
import type { AuditLog } from "@/lib/domain/types";
import { downloadCSV } from "@/lib/format";
import { fetchAudit } from "@/lib/client/api";
import { useAsync, useDB } from "@/lib/hooks";
import { fullName } from "@/lib/services/core";

const ENTITY_LABEL: Record<AuditLog["entity"], string> = {
  claim: "คำขอ",
  payment: "การจ่ายเงิน",
  change_request: "คำขอแก้ไข",
  employee: "พนักงาน",
  benefit: "สวัสดิการ",
  benefit_limit: "วงเงิน",
  delegation: "ผู้อนุมัติสำรอง",
  fund: "รอบงบ",
  settings: "ตั้งค่า",
  rbac: "สิทธิ์/Role",
  department: "ฝ่าย",
  position: "ตำแหน่ง",
  auth: "การเข้าสู่ระบบ",
  system: "ระบบ",
};

const ACTION_LABEL: Record<string, string> = {
  submit: "ยื่นคำขอ",
  update: "แก้ไข",
  resubmit: "แก้ไขแล้วส่งใหม่",
  verify: "HR ตรวจเอกสารผ่าน",
  approve: "หัวหน้าอนุมัติ",
  reject: "ไม่อนุมัติ",
  delegate: "ตั้งผู้อนุมัติสำรอง",
  delegate_cancel: "ยกเลิกผู้อนุมัติสำรอง",
  return: "ส่งกลับแก้ไข",
  record_payment: "บันทึกการจ่าย",
  change_request: "ส่งคำขอแก้ไข",
  change_approve: "อนุมัติคำขอแก้ไข",
  change_reject: "ปฏิเสธคำขอแก้ไข",
  create: "เพิ่มข้อมูล",
  delete: "ลบข้อมูล",
  activate: "เปิดสถานะ",
  deactivate: "ปิดสถานะ",
  role_change: "เปลี่ยน Role",
  login: "เข้าสู่ระบบ",
  login_failed: "เข้าสู่ระบบไม่สำเร็จ",
  reset_password: "รีเซ็ต/เปลี่ยนรหัสผ่าน",
  backup: "สำรองข้อมูล",
  restore: "กู้คืนข้อมูล",
};

export default function AuditPage() {
  const db = useDB();
  const [q, setQ] = useState("");
  const [entity, setEntity] = useState<"" | AuditLog["entity"]>("");
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(100);

  // ค้นหา (หน่วงการพิมพ์เล็กน้อย)
  const [qDebounced, setQDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const query = { q: qDebounced, entity, action, actor, from, to, limit };
  const res = useAsync(() => fetchAudit(query), [JSON.stringify(query), db]);
  const list = res.data?.items ?? [];
  const total = res.data?.total ?? 0;

  const exportCsv = async () => {
    const all = await fetchAudit({ ...query, limit: 500 });
    downloadCSV("audit-log.csv", [
      ["เวลา", "ผู้ดำเนินการ", "Role", "การกระทำ", "ประเภทข้อมูล", "รหัสข้อมูล", "รายละเอียด", "ข้อมูลก่อน", "ข้อมูลหลัง"],
      ...all.items.map((l) => [l.at, fullName(db.employees.find((e) => e.id === l.actorId)), l.actorRole, l.action, ENTITY_LABEL[l.entity], l.entityId, l.summary, l.before ? JSON.stringify(l.before) : "", l.after ? JSON.stringify(l.after) : ""]),
    ]);
  };

  return (
    <Page title="Audit Log" perm="audit.view" wide>
      <Alert tone="info" className="mb-3">
        บันทึกแบบเพิ่มได้อย่างเดียว — แก้ไขหรือลบไม่ได้ · เก็บเฉพาะฟิลด์ที่เปลี่ยน · ไม่เก็บข้อมูลสุขภาพ (PDPA)
      </Alert>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-[1fr_150px_170px_200px_140px_140px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา เช่น CLM-2569-0001, EMP-0003" className="pl-9" />
        </div>
        <Select value={entity} onChange={(e) => setEntity(e.target.value as AuditLog["entity"] | "")} aria-label="ประเภทข้อมูล">
          <option value="">ทุกประเภท</option>
          {(Object.keys(ENTITY_LABEL) as AuditLog["entity"][]).map((k) => (
            <option key={k} value={k}>
              {ENTITY_LABEL[k]}
            </option>
          ))}
        </Select>
        <Select value={action} onChange={(e) => setAction(e.target.value)} aria-label="Action">
          <option value="">ทุก Action</option>
          {(res.data?.actions ?? Object.keys(ACTION_LABEL)).map((a) => (
            <option key={a} value={a}>
              {ACTION_LABEL[a] ?? a}
            </option>
          ))}
        </Select>
        <Select value={actor} onChange={(e) => setActor(e.target.value)} aria-label="ผู้ดำเนินการ">
          <option value="">ผู้ดำเนินการทั้งหมด</option>
          {db.employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.code} {fullName(e)}
            </option>
          ))}
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="ตั้งแต่วันที่" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="ถึงวันที่" />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <p className="text-sm text-zinc-500">{res.loading ? "กำลังโหลด…" : `${total.toLocaleString("th-TH")} รายการ · แตะเพื่อดูข้อมูลก่อน–หลังการแก้ไข`}</p>
        <Button size="sm" variant="secondary" icon={<Download className="size-4" />} onClick={exportCsv} disabled={!list.length}>
          Export
        </Button>
      </div>
      <Card className="mt-3 divide-y divide-zinc-100 empty:hidden">
        {list.map((l) => (
          <AuditRow key={l.id} log={l} db={db} />
        ))}
      </Card>
      {res.error && <p className="mt-3 text-sm text-red-600">{res.error}</p>}
      {!res.loading && list.length === 0 && <Empty title="ไม่พบรายการ" />}
      {total > list.length && (
        <Button variant="secondary" className="mt-3 w-full" onClick={() => setLimit(Math.min(500, limit + 100))} disabled={limit >= 500}>
          แสดงเพิ่ม ({(total - list.length).toLocaleString("th-TH")}){limit >= 500 && " — ใช้ตัวกรองเพื่อแคบลง"}
        </Button>
      )}
      <p className="mt-3 text-xs text-zinc-400">นโยบายเก็บรักษา: {db.settings.auditRetentionDays.toLocaleString("th-TH")} วัน · Audit Log แก้ไขหรือลบไม่ได้จากหน้าจอ</p>
    </Page>
  );
}
