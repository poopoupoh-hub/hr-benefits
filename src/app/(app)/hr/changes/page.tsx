"use client";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Page } from "@/components/AppShell";
import { ConfirmMoneyDialog } from "@/components/claims";
import { Alert, Badge, Card, Empty, Field, Input, SectionTitle, useAction } from "@/components/ui";
import { api } from "@/lib/client/api";
import { STATUS_LABEL } from "@/lib/domain/constants";
import type { ChangeRequest, Claim } from "@/lib/domain/types";
import { dateTimeTH } from "@/lib/format";
import { useCan, useDB, useMe } from "@/lib/hooks";
import { fullName } from "@/lib/services/core";
import { Button } from "@/components/ui";

const CR_STATUS: Record<ChangeRequest["status"], { label: string; tone: "amber" | "green" | "red" }> = {
  pending: { label: "รออนุมัติ", tone: "amber" },
  approved: { label: "อนุมัติแล้ว", tone: "green" },
  rejected: { label: "ปฏิเสธ", tone: "red" },
};

const num = (v: unknown) => (v == null ? "—" : Number(v).toLocaleString("th-TH"));
const limitText = (v: Record<string, unknown>) =>
  Object.keys(v).length ? `ระดับ ${v.minLevel}–${v.maxLevel} · ต่อครั้ง ${num(v.perClaim)} · ต่อปี ${num(v.perYear)} · ${num(v.maxCount)} ครั้ง` : "ยังไม่มีวงเงิน";

/** คำขอแก้ไข (Maker–Checker) — หัวหน้า HR เห็นกล่อง "รออนุมัติการแก้ไข" */
export default function ChangesPage() {
  const db = useDB();
  const me = useMe()!;
  const can = useCan();
  const act = useAction();
  const reviewer = can("change.review");
  const [action, setAction] = useState<{ cr: ChangeRequest; approve: boolean } | null>(null);
  const [password, setPassword] = useState("");
  const [note, setNote] = useState("");

  const pending = db.changeRequests.filter((r) => r.status === "pending");
  const done = db.changeRequests.filter((r) => r.status !== "pending");

  const describe = (cr: ChangeRequest) => {
    if (cr.kind === "claim_status") {
      const c = db.claims.find((x) => x.id === cr.targetId);
      return {
        title: `แก้ผลคำขอ ${c?.no ?? cr.targetId}`,
        sub: `${fullName(db.employees.find((e) => e.id === c?.employeeId))} · ${db.benefitTypes.find((b) => b.id === c?.benefitTypeId)?.name ?? ""}`,
        before: STATUS_LABEL[cr.before.status as Claim["status"]],
        after: STATUS_LABEL[cr.after.status as Claim["status"]],
        claim: c,
      };
    }
    return {
      title: `แก้วงเงิน ${db.benefitTypes.find((b) => b.id === cr.targetId)?.name ?? cr.targetId}`,
      sub: "เพิ่มวงเงินฉบับใหม่ มีผลวันที่อนุมัติ (ไม่ทับฉบับเดิม)",
      before: limitText(cr.before),
      after: limitText(cr.after),
      claim: undefined,
    };
  };

  const Item = ({ cr }: { cr: ChangeRequest }) => {
    const x = describe(cr);
    const st = CR_STATUS[cr.status];
    return (
      <Card className="p-4 text-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold">
              {x.claim ? (
                <Link href={`/claim?id=${x.claim.id}`} className="hover:underline">
                  {x.title}
                </Link>
              ) : (
                x.title
              )}
            </p>
            <p className="text-xs text-zinc-500">{x.sub}</p>
          </div>
          <Badge tone={st.tone}>{st.label}</Badge>
        </div>
        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl bg-zinc-50 p-3 text-xs">
          <div>
            <p className="text-zinc-500">ค่าเดิม</p>
            <p className="font-medium">{x.before}</p>
          </div>
          <ArrowRight className="size-4 text-zinc-400" />
          <div>
            <p className="text-zinc-500">ค่าใหม่</p>
            <p className="font-semibold text-brand-700">{x.after}</p>
          </div>
        </div>
        <p className="mt-2 text-xs text-zinc-700">เหตุผล: {cr.reason}</p>
        <p className="mt-1 text-[11px] text-zinc-400">
          ขอโดย {fullName(db.employees.find((e) => e.id === cr.requestedBy))} · {dateTimeTH(cr.requestedAt)}
          {cr.reviewedBy && ` · พิจารณาโดย ${fullName(db.employees.find((e) => e.id === cr.reviewedBy))} ${cr.reviewedAt ? dateTimeTH(cr.reviewedAt) : ""}`}
          {cr.selfApproved && " · อนุมัติคำขอของตนเอง (ยืนยันรหัสผ่านแล้ว)"}
        </p>
        {cr.reviewNote && <p className="mt-1 text-xs text-zinc-600">หมายเหตุผู้พิจารณา: {cr.reviewNote}</p>}
        {reviewer && cr.status === "pending" && (
          <div className="mt-3 flex gap-2 [&>*]:flex-1">
            <Button variant="outline-danger" onClick={() => open(cr, false)}>
              ปฏิเสธ
            </Button>
            <Button variant="success" onClick={() => open(cr, true)}>
              อนุมัติ
            </Button>
          </div>
        )}
      </Card>
    );
  };

  const open = (cr: ChangeRequest, approve: boolean) => {
    setAction({ cr, approve });
    setPassword("");
    setNote("");
  };
  const self = action?.cr.requestedBy === me.id;
  const d = action ? describe(action.cr) : null;

  return (
    <Page title={reviewer ? "รออนุมัติการแก้ไข" : "คำขอแก้ไข"} perm="change.request" wide>
      {!reviewer && <Alert tone="info" className="mb-4">คำขอแก้ผล / แก้วงเงิน จะมีผลเมื่อหัวหน้า HR อนุมัติ</Alert>}
      <SectionTitle>รออนุมัติ ({pending.length})</SectionTitle>
      <div className="grid gap-3 lg:grid-cols-2">
        {pending.map((cr) => (
          <Item key={cr.id} cr={cr} />
        ))}
      </div>
      {pending.length === 0 && <Empty title="ไม่มีคำขอแก้ไขค้าง" />}

      {done.length > 0 && (
        <>
          <SectionTitle className="mt-8">พิจารณาแล้ว ({done.length})</SectionTitle>
          <div className="grid gap-3 lg:grid-cols-2">
            {done.map((cr) => (
              <Item key={cr.id} cr={cr} />
            ))}
          </div>
        </>
      )}

      <ConfirmMoneyDialog
        open={!!action}
        onClose={() => setAction(null)}
        title={action?.approve ? "ยืนยันอนุมัติการแก้ไข" : "ปฏิเสธคำขอแก้ไข"}
        claimNo={d?.claim?.no}
        amount={action?.approve && d?.claim ? d.claim.amountApproved || d.claim.amountRequested : undefined}
        detail={
          d && (
            <span>
              {d.title}: {d.before} → <b>{d.after}</b>
            </span>
          )
        }
        confirmLabel={action?.approve ? "ยืนยันอนุมัติ" : "ยืนยันปฏิเสธ"}
        tone={action?.approve ? "success" : "danger"}
        disabled={!!(action?.approve && self && !password)}
        onConfirm={() =>
          act(() => api.reviewChange(action!.cr.id, action!.approve, { password, note }), action!.approve ? "อนุมัติแล้ว — มีผลทันที" : "ปฏิเสธคำขอแก้ไขแล้ว").then((ok) => !!ok)
        }
      >
        {action?.approve && self && (
          <Field label="นี่คือคำขอของคุณเอง — ยืนยันรหัสผ่าน" required hint="ระบบจะบันทึกว่าอนุมัติคำขอของตนเอง (selfApproved)">
            <Input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        )}
        <Field label="หมายเหตุผู้พิจารณา (ถ้ามี)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </ConfirmMoneyDialog>
    </Page>
  );
}
