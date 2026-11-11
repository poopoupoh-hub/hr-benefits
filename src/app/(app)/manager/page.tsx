"use client";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { Page } from "@/components/AppShell";
import { ClaimCard } from "@/components/claims";
import { ClaimDetail } from "@/components/ClaimDetail";
import { Alert, Empty, Modal, Segmented } from "@/components/ui";
import { claimValue } from "@/lib/domain/rules";
import { money } from "@/lib/format";
import { useDB, useMe } from "@/lib/hooks";
import { canApprove } from "@/lib/services/queries";
import { fullName } from "@/lib/services/core";

export default function ManagerQueue() {
  const db = useDB();
  const me = useMe()!;
  const [tab, setTab] = useState<"pending" | "done">("pending");
  const [openId, setOpenId] = useState<string | null>(null);
  const pending = db.claims.filter((c) => c.status === "pending_manager" && canApprove(db, me, c));
  const done = db.claims.filter((c) => c.approverId === me.id || c.history.some((h) => h.action === "reject" && h.actorId === me.id));
  const delegatedFrom = db.employees.filter((e) => e.delegation?.employeeId === me.id);
  const total = pending.reduce((s, c) => s + claimValue(c, db.benefitTypes.find((b) => b.id === c.benefitTypeId)), 0);
  const open = db.claims.find((c) => c.id === openId);
  const list = tab === "pending" ? pending : done;

  return (
    <Page title="คำขอรออนุมัติ" perm="claim.approve">
      <p className="mb-3 text-sm text-zinc-500">
        ลูกทีมของ {fullName(me)} · {pending.length} รายการ · รวม {money(total)}
      </p>
      {delegatedFrom.length > 0 && (
        <Alert tone="info" className="mb-3">
          คุณเป็นผู้อนุมัติสำรองแทน {delegatedFrom.map((e) => fullName(e)).join(", ")} ในช่วงที่กำหนด
        </Alert>
      )}
      <Segmented
        className="mb-4"
        value={tab}
        onChange={setTab}
        options={[
          { value: "pending", label: `รออนุมัติ (${pending.length})` },
          { value: "done", label: "พิจารณาแล้ว" },
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {list.map((c) => (
          <ClaimCard key={c.id} c={c} db={db} showEmployee onClick={() => setOpenId(c.id)} />
        ))}
      </div>
      {list.length === 0 && <Empty icon={<CheckCircle2 className="size-8" />} title={tab === "pending" ? "ไม่มีคำขอรออนุมัติ" : "ยังไม่มีประวัติการพิจารณา"} />}
      <Modal open={!!open} onClose={() => setOpenId(null)} title="พิจารณาคำขอ">
        {open && <ClaimDetail c={open} compact onDone={() => setOpenId(null)} />}
      </Modal>
    </Page>
  );
}
