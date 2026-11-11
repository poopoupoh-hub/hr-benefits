"use client";
import { ClipboardCheck } from "lucide-react";
import { useState } from "react";
import { Page } from "@/components/AppShell";
import { ClaimCard } from "@/components/claims";
import { ClaimDetail } from "@/components/ClaimDetail";
import { Card, Empty, Modal, Segmented } from "@/components/ui";
import { useDB, useMe } from "@/lib/hooks";

export default function HrQueue() {
  const db = useDB();
  const me = useMe()!;
  const [tab, setTab] = useState<"pending" | "returned" | "manager">("pending");
  const [openId, setOpenId] = useState<string | null>(null);
  const pending = db.claims.filter((c) => c.status === "pending_hr" && c.employeeId !== me.id).sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  const returned = db.claims.filter((c) => c.status === "returned");
  const atManager = db.claims.filter((c) => c.status === "pending_manager");
  const list = { pending, returned, manager: atManager }[tab];
  const open = db.claims.find((c) => c.id === openId);
  const today = new Date();
  const overdue = pending.filter((c) => (today.getTime() - new Date(c.submittedAt).getTime()) / 86400000 > 3).length;

  return (
    <Page title="คำขอรอตรวจ" perm="claim.review">
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs text-zinc-500">รอ HR ตรวจ</p>
          <p className="text-2xl font-semibold text-amber-600">{pending.length}</p>
          {overdue > 0 && <p className="text-[11px] text-red-600">ค้างเกิน 3 วัน {overdue} รายการ</p>}
        </Card>
        <Card className="p-4">
          <p className="text-xs text-zinc-500">รอผู้ยื่นแก้ไข</p>
          <p className="text-2xl font-semibold text-brand-600">{returned.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-zinc-500">รอหัวหน้า</p>
          <p className="text-2xl font-semibold text-sky-600">{atManager.length}</p>
        </Card>
      </div>
      <Segmented
        className="mb-4"
        value={tab}
        onChange={setTab}
        options={[
          { value: "pending", label: `รอตรวจ (${pending.length})` },
          { value: "returned", label: "ส่งกลับแก้ไข" },
          { value: "manager", label: "รอหัวหน้า" },
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {list.map((c) => (
          <ClaimCard key={c.id} c={c} db={db} showEmployee onClick={() => setOpenId(c.id)} />
        ))}
      </div>
      {list.length === 0 && <Empty icon={<ClipboardCheck className="size-8" />} title="ไม่มีรายการ" />}
      <Modal open={!!open} onClose={() => setOpenId(null)} title="ตรวจคำขอ">
        {open && <ClaimDetail c={open} compact onDone={() => setOpenId(null)} />}
      </Modal>
    </Page>
  );
}
