"use client";
import { Stamp, UserCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Page } from "@/components/AppShell";
import { ClaimCard } from "@/components/claims";
import { ClaimDetail } from "@/components/ClaimDetail";
import { FlowGuide } from "@/components/FlowGuide";
import { Alert, Card, Empty, Modal, Segmented } from "@/components/ui";
import { todayLocal } from "@/lib/domain/dates";
import { payDateExplain } from "@/lib/domain/rules";
import { dateTH, money } from "@/lib/format";
import { useDB, useMe } from "@/lib/hooks";
import { activeDelegate, approvalQueue } from "@/lib/services/approval";
import { fullName } from "@/lib/services/core";

type Tab = "queue" | "history";

/** ขั้นที่ 2 — หัวหน้างานอนุมัติ / ไม่อนุมัติคำขอของลูกทีม ที่ HR ตรวจเอกสารแล้ว */
export default function ManagerQueue() {
  const db = useDB();
  const me = useMe()!;
  const [tab, setTab] = useState<Tab>("queue");
  const [openId, setOpenId] = useState<string | null>(null);
  const today = todayLocal();
  const queue = approvalQueue(db, me, today);
  const history = db.claims
    .filter((c) => c.decidedById === me.id && c.history.some((h) => h.actorId === me.id && (h.action === "approve" || (h.action === "reject" && h.fromStatus === "pending_manager"))))
    .sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""));
  const month = today.slice(0, 7);
  const approvedThisMonth = history.filter((c) => c.status !== "rejected" && c.decidedAt?.slice(0, 7) === month);
  const list = tab === "queue" ? queue : history;
  const open = db.claims.find((c) => c.id === openId);
  const pay = payDateExplain(today, db.settings);
  const myDelegate = activeDelegate(db, me, today);
  const coveringFor = db.employees.filter((e) => e.id !== me.id && activeDelegate(db, e, today)?.id === me.id);
  const queueTotal = queue.reduce((s, c) => s + c.amountApproved, 0);

  return (
    <Page title="คำขอรออนุมัติ" perm="claim.approve">
      <FlowGuide active="approve" className="mb-4" />

      {coveringFor.length > 0 && (
        <Alert tone="info" icon={<UserCheck className="size-4" />} className="mb-4">
          คุณเป็น <b>ผู้อนุมัติสำรอง</b> ของ {coveringFor.map((e) => `${fullName(e)} (ถึง ${dateTH(e.delegation?.to)})`).join(", ")} — คำขอของทีมนั้นแสดงในคิวนี้ด้วย
        </Alert>
      )}
      {myDelegate && (
        <Alert tone="warn" icon={<UserCheck className="size-4" />} className="mb-4">
          ช่วงนี้ {fullName(myDelegate)} อนุมัติแทนคุณได้ ถึง {dateTH(me.delegation?.to)} —{" "}
          <Link href="/manager/delegate" className="underline">
            จัดการผู้อนุมัติสำรอง
          </Link>
        </Alert>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-zinc-500">รอคุณอนุมัติ</p>
          <p className="text-2xl font-semibold text-sky-600">{queue.length}</p>
          <p className="text-[11px] text-zinc-500 tabular">รวม {money(queueTotal)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-zinc-500">อนุมัติแล้วเดือนนี้</p>
          <p className="text-2xl font-semibold text-emerald-600">{approvedThisMonth.length}</p>
          <p className="text-[11px] text-zinc-500 tabular">รวม {money(approvedThisMonth.reduce((s, c) => s + c.amountApproved, 0))}</p>
        </Card>
        <Card className="col-span-2 p-4">
          <p className="text-xs text-zinc-500">ถ้าอนุมัติวันนี้ เงินเข้าพนักงาน</p>
          <p className="text-2xl font-semibold text-ink-900">{dateTH(pay.actual)}</p>
          <p className="text-[11px] text-zinc-500">
            {pay.late ? `เลยวันตัดรอบ (วันที่ ${db.settings.cutoffDay}) แล้ว — เข้ารอบเดือนถัดไป` : `อนุมัติภายในวันที่ ${db.settings.cutoffDay} ทันรอบสิ้นเดือนนี้`}
            {pay.shifted && ` · เลื่อนจาก ${dateTH(pay.nominal)} (${pay.reason})`}
          </p>
        </Card>
      </div>

      <Segmented
        className="mb-4"
        value={tab}
        onChange={setTab}
        options={[
          { value: "queue", label: `รออนุมัติ (${queue.length})` },
          { value: "history", label: "ที่ฉันพิจารณาแล้ว" },
        ]}
      />
      {tab === "queue" && queue.length > 0 && <p className="mb-3 text-xs text-zinc-500">ทุกรายการ HR ตรวจเอกสาร/สิทธิ์/วงเงินแล้ว — คุณตัดสินขั้นสุดท้าย (ระบบถามยืนยันอีกครั้งก่อนอนุมัติ)</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {list.map((c) => (
          <ClaimCard key={c.id} c={c} db={db} showEmployee onClick={() => setOpenId(c.id)} />
        ))}
      </div>
      {list.length === 0 && (
        <Empty icon={<Stamp className="size-8" />} title={tab === "queue" ? "ไม่มีคำขอรออนุมัติ" : "ยังไม่มีคำขอที่คุณพิจารณา"}>
          {tab === "queue" && "คำขอจะมาถึงคุณหลัง HR ตรวจเอกสารผ่านแล้ว"}
        </Empty>
      )}
      <Modal open={!!open} onClose={() => setOpenId(null)} title={open?.status === "pending_manager" ? "พิจารณาอนุมัติ" : "รายละเอียดคำขอ"}>
        {open && <ClaimDetail c={open} compact onDone={() => setOpenId(null)} />}
      </Modal>
    </Page>
  );
}
