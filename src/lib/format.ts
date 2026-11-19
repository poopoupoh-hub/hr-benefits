import { parseISODate } from "./domain/dates";

export const money = (n: number | null | undefined, unit = true) =>
  n == null ? "ไม่จำกัด" : `${n.toLocaleString("th-TH", { maximumFractionDigits: 2 })}${unit ? " บาท" : ""}`;

const dFmt = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dLong = new Intl.DateTimeFormat("th-TH", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const dtFmt = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const dtFull = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });

/** YYYY-MM-DD → 30 พ.ย. 2569 */
export const dateTH = (d?: string | null) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? dFmt.format(parseISODate(d)) : "-");
export const dateLongTH = (d?: string | null) => (d ? dLong.format(parseISODate(d)) : "-");
/** ISO datetime → 13 ก.ย. 09:00 */
export const dateTimeTH = (dt?: string | null) => (dt ? dtFmt.format(new Date(dt)) : "-");
export const dateTimeFullTH = (dt?: string | null) => (dt ? dtFull.format(new Date(dt)) : "-");

export const fileSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** ดาวน์โหลด CSV (มี BOM เพื่อให้ Excel อ่านภาษาไทยได้) */
export function downloadCSV(filename: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
  downloadBlob(filename, new Blob([csv], { type: "text/csv;charset=utf-8" }));
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
