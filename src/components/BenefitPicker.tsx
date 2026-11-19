"use client";
import { ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BenefitType } from "@/lib/domain/types";
import { cx } from "@/lib/format";

/** Dropdown เลือกสวัสดิการแบบค้นหาได้ จัดกลุ่มตามหมวด (category) */
export function BenefitPicker({
  benefits,
  value,
  onChange,
  note,
}: {
  benefits: BenefitType[];
  value: string;
  onChange: (id: string) => void;
  /** ข้อความท้ายตัวเลือก เช่น "เหลือ 3,000 บาท" / "ไม่มีสิทธิ์" */
  note?: (b: BenefitType) => { text: string; muted?: boolean } | null;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const selected = benefits.find((b) => b.id === value);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const map = new Map<string, BenefitType[]>();
    for (const b of benefits) {
      if (term && !`${b.name} ${b.code} ${b.category} ${b.description ?? ""}`.toLowerCase().includes(term)) continue;
      map.set(b.category, [...(map.get(b.category) ?? []), b]);
    }
    return [...map.entries()];
  }, [benefits, q]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-11 w-full items-center justify-between rounded-xl border border-zinc-300 bg-white px-3 text-left text-sm outline-none transition hover:border-zinc-400 focus-visible:border-brand-500 focus-visible:ring-4 focus-visible:ring-brand-500/15"
      >
        {selected ? (
          <span>
            {selected.name} <span className="text-xs text-zinc-400">· {selected.category}</span>
          </span>
        ) : (
          <span className="text-zinc-400">— เลือกสวัสดิการ —</span>
        )}
        <ChevronDown className="size-4 text-zinc-400" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-zinc-200 bg-white p-2 shadow-lg">
          <label className="mb-2 flex items-center gap-2 rounded-lg border border-zinc-200 px-2">
            <Search className="size-4 text-zinc-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาสวัสดิการ" className="h-9 w-full text-sm outline-none" />
          </label>
          <div className="max-h-72 overflow-y-auto" role="listbox">
            {groups.map(([cat, items]) => (
              <div key={cat} className="mb-1">
                <p className="px-2 py-1 text-[11px] font-semibold tracking-wide text-zinc-400">{cat}</p>
                {items.map((b) => {
                  const n = note?.(b);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      role="option"
                      aria-selected={b.id === value}
                      onClick={() => {
                        onChange(b.id);
                        setOpen(false);
                        setQ("");
                      }}
                      className={cx("flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-zinc-50", b.id === value && "bg-brand-50 font-medium text-brand-700")}
                    >
                      <span>{b.name}</span>
                      {n && <span className={cx("shrink-0 text-[11px]", n.muted ? "text-zinc-400" : "text-zinc-500")}>{n.text}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
            {groups.length === 0 && <p className="py-4 text-center text-sm text-zinc-400">ไม่พบสวัสดิการ</p>}
          </div>
        </div>
      )}
    </div>
  );
}
