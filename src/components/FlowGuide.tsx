import { ArrowRight } from "lucide-react";
import { cx } from "@/lib/format";

const STEPS = [
  { key: "submit", label: "พนักงานยื่น", sub: "แนบใบเสร็จ/เอกสาร" },
  { key: "verify", label: "HR ตรวจเอกสาร", sub: "สิทธิ์ · วงเงิน · เอกสาร" },
  { key: "approve", label: "หัวหน้าอนุมัติ", sub: "ยืนยันซ้ำ · เห็นวันเงินเข้า" },
  { key: "pay", label: "บัญชีจ่าย", sub: "บันทึกการจ่าย" },
] as const;

/** แถบอธิบายขั้นตอนอนุมัติ — ไฮไลต์ขั้นที่ผู้ใช้หน้านี้รับผิดชอบ */
export function FlowGuide({ active, className }: { active: (typeof STEPS)[number]["key"]; className?: string }) {
  return (
    <ol className={cx("scrollbar-none flex items-stretch gap-1.5 overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-2 text-xs", className)} aria-label="ขั้นตอนอนุมัติคำขอ">
      {STEPS.map((s, i) => (
        <li key={s.key} className="flex min-w-0 shrink-0 items-center gap-1.5 sm:flex-1">
          <span
            aria-current={s.key === active ? "step" : undefined}
            className={cx("flex-1 rounded-xl px-3 py-2", s.key === active ? "bg-brand-500 text-white shadow-sm" : "bg-zinc-50 text-zinc-600")}
          >
            <span className="block font-semibold">
              {i + 1}. {s.label}
            </span>
            <span className={cx("block text-[11px]", s.key === active ? "text-white/85" : "text-zinc-500")}>{s.sub}</span>
          </span>
          {i < STEPS.length - 1 && <ArrowRight className="size-3.5 shrink-0 text-zinc-300" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}
