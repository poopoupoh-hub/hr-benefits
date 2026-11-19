"use client";
import { CalendarDays, Download, Lock } from "lucide-react";
import { useMemo, useState } from "react";
import { Page } from "@/components/AppShell";
import { ConfirmMoneyDialog } from "@/components/claims";
import { Alert, Badge, Button, Card, Empty, Field, Input, Modal, Segmented, useAction } from "@/components/ui";
import { PAYMENT_METHOD_LABEL } from "@/lib/domain/constants";
import { todayLocal } from "@/lib/domain/dates";
import { paymentError, type PaymentInput } from "@/lib/domain/rules";
import type { PaymentMethod } from "@/lib/domain/types";
import { cx, dateTH, downloadCSV, money } from "@/lib/format";
import { useCan, useDB } from "@/lib/hooks";
import { paymentRows, type PaymentRow } from "@/lib/services/queries";
import { api } from "@/lib/client/api";

const EMPTY = (today: string): PaymentInput => ({ method: "transfer", paidAt: today, transferRef: "", chequeNo: "", chequeDate: "", note: "" });

export default function FinancePage() {
  const db = useDB();
  const can = useCan();
  const act = useAction();
  const today = todayLocal();
  const [tab, setTab] = useState<"approved" | "paid">("approved");
  const [row, setRow] = useState<PaymentRow | null>(null);
  const [form, setForm] = useState<PaymentInput>(EMPTY(today));
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const rows = useMemo(() => paymentRows(db), [db]);
  const list = rows
    .filter((r) => r.status === tab)
    .sort((a, b) => (tab === "approved" ? a.payDate.localeCompare(b.payDate) : (b.paidAt ?? "").localeCompare(a.paidAt ?? "")) || a.claimNo.localeCompare(b.claimNo));
  const total = list.reduce((s, r) => s + r.amountApproved, 0);
  const set = (p: Partial<PaymentInput>) => setForm((f) => ({ ...f, ...p }));

  /** Export CSV — 1 แถวต่อ 1 คำขอ */
  const exportCsv = () =>
    downloadCSV(`payments-${tab}-${today}.csv`, [
      ["เลขคำขอ", "พนักงาน", "เลขใบเสร็จ", "ร้าน", "ยอดอนุมัติ", "วิธีจ่าย", "ref", "วันที่จ่าย"],
      ...list.map((r) => [r.claimNo, r.employeeCode, r.receiptNo, r.vendorName, r.amountApproved, r.method ? PAYMENT_METHOD_LABEL[r.method] : "", r.ref ?? "", r.paidAt ?? ""]),
    ]);

  const openPay = (r: PaymentRow) => {
    setRow(r);
    setForm(EMPTY(today));
    setErr(null);
    setConfirm(false);
  };
  const review = () => {
    const e = paymentError(form, today);
    setErr(e);
    if (!e) setConfirm(true);
  };

  return (
    <Page title="บันทึกการจ่าย" perm="payment.view">
      <Alert tone="warn" icon={<CalendarDays className="size-4" />}>
        กำหนดจ่าย: อนุมัติภายในวันที่ {db.settings.cutoffDay} → สิ้นเดือนนั้น · หลังวันที่ {db.settings.cutoffDay} → สิ้นเดือนถัดไป · ตรงวันหยุดเลื่อนเป็นวันทำการก่อนหน้า
      </Alert>
      <div className="my-4 flex flex-wrap items-center justify-between gap-2">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "approved", label: `รอจ่าย (${rows.filter((r) => r.status === "approved").length})` },
            { value: "paid", label: "จ่ายแล้ว" },
          ]}
        />
        <Button variant="secondary" size="sm" icon={<Download className="size-4" />} disabled={!list.length} onClick={exportCsv}>
          Export CSV
        </Button>
      </div>
      <p className="mb-2 text-sm text-zinc-500">
        {list.length} รายการ · รวม {money(total)}
      </p>

      <Card className="divide-y divide-zinc-100">
        {list.map((r) => {
          const overdue = tab === "approved" && r.payDate < today;
          return (
            <div key={r.claimId} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {r.claimNo} <span className="text-xs font-normal text-zinc-400">· {r.employeeCode} · {r.department}</span>
                </p>
                <p className="truncate text-xs text-zinc-500">
                  {r.benefitName} · ใบเสร็จ {r.receiptNo || "-"} · {r.vendorName || "-"}
                </p>
                <p className={cx("text-xs", overdue ? "text-red-600" : "text-zinc-500")}>
                  {tab === "approved" ? (
                    <>
                      กำหนดจ่าย {dateTH(r.payDate)} {overdue && <Badge tone="red">เลยกำหนด</Badge>}
                    </>
                  ) : (
                    <span className="text-emerald-700">
                      {r.method && PAYMENT_METHOD_LABEL[r.method]} · {r.paidAt && dateTH(r.paidAt)} · {r.ref ?? "-"}
                    </span>
                  )}
                </p>
              </div>
              <p className="font-semibold tabular">{money(r.amountApproved)}</p>
              {tab === "approved" &&
                can("payment.record") &&
                (r.locked ? (
                  <Badge tone="amber">ล็อก: มีคำขอแก้ผลค้าง</Badge>
                ) : (
                  <Button size="sm" onClick={() => openPay(r)}>
                    บันทึกการจ่าย
                  </Button>
                ))}
            </div>
          );
        })}
      </Card>
      {list.length === 0 && <Empty title={tab === "approved" ? "ไม่มีรายการรอจ่าย" : "ยังไม่มีรายการที่จ่ายแล้ว"} />}
      <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-zinc-400">
        <Lock className="size-3" /> หน้านี้ไม่แสดงชื่อพนักงาน / เอกสาร / หมายเหตุ เพื่อลดความเสี่ยง PDPA
      </p>

      <Modal
        open={!!row && !confirm}
        onClose={() => setRow(null)}
        title={`บันทึกการจ่าย ${row?.claimNo ?? ""}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRow(null)}>
              ยกเลิก
            </Button>
            <Button onClick={review}>ตรวจสอบและบันทึก</Button>
          </>
        }
      >
        {row && (
          <div className="space-y-3">
            <div className="rounded-2xl bg-zinc-50 p-3 text-center">
              <p className="text-sm text-zinc-500">ยอดอนุมัติ</p>
              <p className="text-2xl font-semibold tabular">{money(row.amountApproved)}</p>
            </div>
            <Field label="วิธีจ่าย" required>
              <Segmented
                value={form.method}
                onChange={(m) => set({ method: m as PaymentMethod })}
                options={(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => ({ value: m, label: PAYMENT_METHOD_LABEL[m] }))}
              />
            </Field>
            <Field label="วันที่จ่าย" required hint="ห้ามเป็นวันในอนาคต">
              <Input type="date" max={today} value={form.paidAt} onChange={(e) => set({ paidAt: e.target.value })} />
            </Field>
            {form.method === "transfer" && (
              <Field label="เลขอ้างอิงการโอน" required>
                <Input value={form.transferRef} onChange={(e) => set({ transferRef: e.target.value })} placeholder="เช่น TRF-691130-0001" />
              </Field>
            )}
            {form.method === "cheque" && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="เลขที่เช็ค" required>
                  <Input value={form.chequeNo} onChange={(e) => set({ chequeNo: e.target.value })} />
                </Field>
                <Field label="วันที่บนเช็ค" required>
                  <Input type="date" value={form.chequeDate} onChange={(e) => set({ chequeDate: e.target.value })} />
                </Field>
              </div>
            )}
            <Field label="หมายเหตุ (ถ้ามี)">
              <Input value={form.note} onChange={(e) => set({ note: e.target.value })} />
            </Field>
            {err && <Alert tone="error">{err}</Alert>}
          </div>
        )}
      </Modal>

      <ConfirmMoneyDialog
        open={!!row && confirm}
        onClose={() => {
          setConfirm(false);
          setRow(null);
        }}
        title="ยืนยันบันทึกการจ่าย"
        claimNo={row?.claimNo}
        amount={row?.amountApproved}
        detail={
          <span>
            จ่ายด้วย{PAYMENT_METHOD_LABEL[form.method]} วันที่ {form.paidAt && dateTH(form.paidAt)}
            {form.method === "transfer" && ` · อ้างอิง ${form.transferRef}`}
            {form.method === "cheque" && ` · เช็ค ${form.chequeNo}`}
          </span>
        }
        confirmLabel="ยืนยันจ่าย"
        onConfirm={() => act(() => api.recordPayment(row!.claimId, form), `${row!.claimNo}: บันทึกการจ่ายแล้ว แจ้งพนักงานทางอีเมล`).then((ok) => !!ok)}
      />
    </Page>
  );
}
