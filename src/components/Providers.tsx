"use client";
import { useEffect, type ReactNode } from "react";
import { refresh } from "@/lib/client/store";
import { useAppState } from "@/lib/hooks";
import { ToastProvider } from "./ui";

/** อ่านข้อมูลจาก localStorage ครั้งแรก และโหลดใหม่เมื่อแท็บอื่นแก้ข้อมูล / กลับมาที่หน้าต่าง (เห็นงานของผู้ใช้คนอื่น) */
export function Providers({ children }: { children: ReactNode }) {
  const s = useAppState();
  useEffect(() => {
    refresh();
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    // แท็บอื่นเขียน localStorage (เช่น เปิด HR กับหัวหน้าคนละแท็บ) → อัปเดตหน้าจอทันที
    const onStorage = (e: StorageEvent) => (e.key === null || e.key.startsWith("hr-benefits:")) && refresh();
    window.addEventListener("storage", onStorage);
    const t = setInterval(() => document.visibilityState === "visible" && refresh(), 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("storage", onStorage);
      clearInterval(t);
    };
  }, []);
  return (
    <ToastProvider>
      {s.loaded ? (
        s.error && !s.me && !s.public ? (
          <div className="grid min-h-dvh place-items-center p-6 text-center text-sm text-red-600">
            <div>
              อ่านข้อมูลจากเบราว์เซอร์ (localStorage) ไม่สำเร็จ
              <br />
              <span className="text-zinc-500">{s.error}</span>
              <br />
              <button className="mt-3 rounded-lg border px-3 py-1.5 text-zinc-700" onClick={() => refresh()}>
                ลองใหม่
              </button>
            </div>
          </div>
        ) : (
          children
        )
      ) : (
        <div className="grid min-h-dvh place-items-center text-sm text-zinc-400">กำลังโหลด…</div>
      )}
    </ToastProvider>
  );
}
