"use client";
import { ClipboardCheck } from "lucide-react";
import { useState } from "react";
import { Page } from "@/components/AppShell";
import { ClaimCard } from "@/components/claims";
import { ClaimDetail } from "@/components/ClaimDetail";
import { FlowGuide } from "@/components/FlowGuide";
import { Card, Empty, Modal, Segmented } from "@/components/ui";
import { useDB, useMe } from "@/lib/hooks";

type Tab = "pending" | "manager" | "returned" | "decided";

/** ขั้นที่ 1 — HR ตรวจเอกสาร/คุณสมบัติ แล้วส่งให้หัวหน้างานอนุมัติ */
export default function HrQueue() {
  const db = useDB();
  const me = useMe()!;
  const [tab, setTab] = useState<Tab>("pending");
  const [openId, setOpenId] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const pending = db.claims.filter((c) => c.status === "pending_hr" && c.employeeId !== me.id).sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  const atManager = db.claims.filter((c) => c.status === "pending_manager").sort((a, b) => (a.verifiedAt ?? "").localeCompare(b.verifiedAt ?? ""));
  const returned = db.claims.filter((c) => c.status === "returned");
  /** ตัดสินแล้วแต่ยังไม่จ่าย — ขอแก้ผลได้ */
  const decided = db.claims.filter((c) => c.status === "approved" || c.status === "rejected").sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""));
  const mine = db.claims.filter((c) => c.status === "pending_hr" && c.employeeId === me.id);
  const list = { pending, manager: atManager, returned, decided }[tab];
  const open = db.claims.find((c) => c.id === openId);
  const days = (iso?: string | null) => (iso ? (now - new Date(iso).getTime()) / 86400000 : 0);
  const overdue = pending.filter((c) => days(c.submittedAt) > 3).length;
  const mgrOverdue = atManager.filter((c) => days(c.verifiedAt) > 3).length;

  return (
    <Page title="ตรวจเอกสารคำขอ" perm="claim.review">
      <FlowGuide active="verify" className="mb-4" />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-zinc-500">รอ HR ตรวจ (งานของคุณ)</p>
          <p className="text-2xl font-semibold text-amber-600">{pending.length}</p>
          {overdue > 0 && <p className="text-[11px] text-red-600">ค้างเกิน 3 วัน {overdue} รายการ</p>}
        </Card>
        <Card className="p-4">
          <p className="text-xs text-zinc-500">ส่งหัวหน้าแล้ว รออนุมัติ</p>
          <p className="text-2xl font-semibold text-sky-600">{atManager.length}</p>
          {mgrOverdue > 0 && <p className="text-[11px] text-red-600">หัวหน้ายังไม่อนุมัติเกิน 3 วัน {mgrOverdue} รายการ</p>}
        </Card>
        <Card className="p-4">
          <p className="text-xs text-zinc-500">รอผู้ยื่นแก้ไข</p>
          <p className="text-2xl font-semibold text-brand-600">{returned.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-zinc-500">คำขอแก้ไขค้าง</p>
          <p className="text-2xl font-semibold text-violet-600">{db.changeRequests.filter((r) => r.status === "pending").length}</p>
        </Card>
      </div>
      <Segmented
        className="mb-4"
        value={tab}
        onChange={setTab}
        options={[
          { value: "pending", label: `รอตรวจ (${pending.length})` },
          { value: "manager", label: `รอหัวหน้า (${atManager.length})` },
          { value: "returned", label: "ส่งกลับแก้ไข" },
          { value: "decided", label: "ตัดสินแล้ว" },
        ]}
      />
      {tab === "manager" && <p className="mb-3 text-xs text-zinc-500">ติดตามอย่างเดียว — หัวหน้างานของผู้ยื่นเป็นผู้อนุมัติ/ไม่อนุมัติ</p>}
      {tab === "decided" && <p className="mb-3 text-xs text-zinc-500">ยังไม่จ่ายเงิน — ถ้าผลผิด กด &quot;ขอแก้ผล&quot; เพื่อส่งให้ HR คนอื่นอนุมัติ (Maker–Checker)</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {list.map((c) => (
          <ClaimCard key={c.id} c={c} db={db} showEmployee onClick={() => setOpenId(c.id)} />
        ))}
      </div>
      {list.length === 0 && <Empty icon={<ClipboardCheck className="size-8" />} title="ไม่มีรายการ" />}
      {tab === "pending" && mine.length > 0 && (
        <p className="mt-4 text-center text-xs text-zinc-500">คำขอของคุณเอง {mine.length} รายการไม่แสดงในคิวนี้ — ต้องให้ HR คนอื่นตรวจ</p>
      )}
      <Modal open={!!open} onClose={() => setOpenId(null)} title={open?.status === "pending_hr" ? "ตรวจเอกสารคำขอ" : "รายละเอียดคำขอ"}>
        {open && <ClaimDetail c={open} compact onDone={() => setOpenId(null)} />}
      </Modal>
    </Page>
  );
}
