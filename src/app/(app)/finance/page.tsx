"use client";
import { CalendarDays, Download, Lock } from "lucide-react";
import { useMemo, useState } from "react";
import { Page } from "@/components/AppShell";
import { Alert, Badge, Button, Card, Checkbox, Empty, Field, Input, Modal, Segmented, useAction } from "@/components/ui";
import { beYear, todayLocal } from "@/lib/domain/dates";
import { dateTH, dateTimeFullTH, downloadCSV, money } from "@/lib/format";
import { useCan, useDB } from "@/lib/hooks";
import { paymentRows, type PaymentRow } from "@/lib/services/queries";
import { api } from "@/lib/client/api";

export default function FinancePage() {
  const db = useDB();
  const can = useCan();
  const act = useAction();
  const [tab, setTab] = useState<"approved" | "paid">("approved");
  const [pay, setPay] = useState<{ round: string; ids: string[] } | null>(null);
  const [ref, setRef] = useState("");
  const today = todayLocal();
  const rows = useMemo(() => paymentRows(db), [db]);

  const groups = useMemo(() => {
    const m = new Map<string, PaymentRow[]>();
    for (const r of rows.filter((x) => x.status === tab)) m.set(r.payDate, [...(m.get(r.payDate) ?? []), r]);
    return [...m.entries()].sort((a, b) => (tab === "approved" ? a[0].localeCompare(b[0]) : b[0].localeCompare(a[0])));
  }, [rows, tab]);

  const exportRound = (round: string, list: PaymentRow[]) =>
    downloadCSV(`payment-round-${round}.csv`, [
      ["รอบจ่าย", "เลขที่คำขอ", "รหัสพนักงาน", "แผนก", "รหัสสวัสดิการ", "ประเภทสวัสดิการ", "จำนวนเงิน", "สถานะ", "อ้างอิงการจ่าย"],
      ...list.map((r) => [round, r.claimNo, r.employeeCode, r.department, r.benefitCode, r.benefitName, r.amount, r.status === "paid" ? "จ่ายแล้ว" : "รอจ่าย", r.paymentRef ?? ""]),
      ["", "", "", "", "", "รวม", list.reduce((s, r) => s + r.amount, 0), "", ""],
    ]);

  return (
    <Page title="รอบจ่ายเงิน" perm="payment.view">
      <Alert tone="warn" icon={<CalendarDays className="size-4" />}>
        อนุมัติภายในวันที่ {db.settings.cutoffDay} → จ่ายสิ้นเดือนนั้น · หลังวันที่ {db.settings.cutoffDay} → สิ้นเดือนถัดไป · ตรงวันหยุดเลื่อนเป็นวันทำการก่อนหน้า
      </Alert>
      <Segmented
        className="my-4"
        value={tab}
        onChange={setTab}
        options={[
          { value: "approved", label: `รอจ่าย (${rows.filter((r) => r.status === "approved").length})` },
          { value: "paid", label: "จ่ายแล้ว" },
        ]}
      />
      <div className="space-y-3">
        {groups.map(([round, list]) => {
          const sum = list.reduce((s, r) => s + r.amount, 0);
          const overdue = tab === "approved" && round < today;
          return (
            <Card key={round} className={`p-4 ${overdue ? "border-red-200" : ""}`}>
              <div className="flex items-start gap-3">
                <CalendarDays className="mt-0.5 size-5 text-brand-500" />
                <div className="flex-1">
                  <p className="font-semibold">
                    รอบ {dateTH(round)} {overdue && <Badge tone="red">เลยกำหนด</Badge>}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {list.length} รายการ · รวม {money(sum)}
                  </p>
                </div>
              </div>
              <div className="mt-3 divide-y divide-zinc-100">
                {list.map((r) => (
                  <div key={r.claimId} className="flex items-center justify-between py-2 text-sm">
                    <span>
                      <span className="font-medium">{r.employeeCode}</span> <span className="text-xs text-zinc-400">· {r.department} · {r.claimNo}</span>
                      <span className="block text-xs text-zinc-500">{r.benefitName}</span>
                      {r.paidAt && <span className="block text-[11px] text-emerald-700">จ่าย {dateTimeFullTH(r.paidAt)} · {r.paymentRef}</span>}
                    </span>
                    <span className="font-medium tabular">{money(r.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2 [&>*]:flex-1">
                {can("report.export") && (
                  <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => exportRound(round, list)}>
                    Export CSV
                  </Button>
                )}
                {tab === "approved" && can("payment.mark_paid") && (
                  <Button
                    onClick={() => {
                      setRef(`PAY-${beYear(Number(round.slice(0, 4)))}-${round.slice(5, 7)}`);
                      setPay({ round, ids: list.map((r) => r.claimId) });
                    }}
                  >
                    บันทึกจ่ายแล้ว
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
        {groups.length === 0 && <Empty title={tab === "approved" ? "ไม่มีรายการรอจ่าย" : "ยังไม่มีรายการที่จ่ายแล้ว"} />}
      </div>
      <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-zinc-400">
        <Lock className="size-3" /> หน้านี้ไม่แสดงชื่อ / ข้อมูลสุขภาพ / เอกสารแนบ เพื่อลดความเสี่ยง PDPA
      </p>

      <Modal
        open={!!pay}
        onClose={() => setPay(null)}
        title={`บันทึกจ่าย · รอบ ${pay ? dateTH(pay.round) : ""}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPay(null)}>
              ยกเลิก
            </Button>
            <Button disabled={!pay?.ids.length || !ref.trim()} onClick={() => pay && act(() => api.markPaid(pay.ids, ref), `บันทึกจ่าย ${pay.ids.length} รายการแล้ว แจ้งพนักงานทางอีเมล`).then((ok) => ok && setPay(null))}>
              ยืนยันจ่ายแล้ว
            </Button>
          </>
        }
      >
        {pay && (
          <div className="space-y-3">
            <Field label="เลขอ้างอิงการโอน / หลักฐานการจ่าย" required hint="บันทึกเป็นหลักฐานการจ่ายเงินในคำขอและ Audit Log">
              <Input value={ref} onChange={(e) => setRef(e.target.value)} />
            </Field>
            <div className="rounded-xl border border-zinc-200 p-3">
              {rows
                .filter((r) => r.status === "approved" && r.payDate === pay.round)
                .map((r) => (
                  <div key={r.claimId} className="flex items-center justify-between py-1">
                    <Checkbox
                      checked={pay.ids.includes(r.claimId)}
                      onChange={(v) => setPay({ ...pay, ids: v ? [...pay.ids, r.claimId] : pay.ids.filter((x) => x !== r.claimId) })}
                      label={`${r.employeeCode} · ${r.benefitName}`}
                    />
                    <span className="text-sm tabular">{money(r.amount)}</span>
                  </div>
                ))}
            </div>
            <p className="text-right text-sm font-semibold">
              รวม {money(rows.filter((r) => pay.ids.includes(r.claimId)).reduce((s, r) => s + r.amount, 0))}
            </p>
          </div>
        )}
      </Modal>
    </Page>
  );
}
