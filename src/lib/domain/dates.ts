import type { ISODate } from "./types";

/** ทำงานกับวันที่แบบ YYYY-MM-DD โดยไม่ขึ้นกับ timezone (ใช้ UTC ภายใน) */

export function parseISODate(d: ISODate): Date {
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function toISODate(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

/** วันนี้ตามเวลาเครื่องผู้ใช้ (local) ในรูป YYYY-MM-DD */
export function todayLocal(now: Date = new Date()): ISODate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** แปลง ISO datetime เป็นวันที่ local */
export function dateOf(dt: string): ISODate {
  return todayLocal(new Date(dt));
}

export function addDays(d: ISODate, n: number): ISODate {
  const x = parseISODate(d);
  x.setUTCDate(x.getUTCDate() + n);
  return toISODate(x);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISODate(a).getTime() - parseISODate(b).getTime()) / 86400000);
}

export function lastDayOfMonth(year: number, month1: number): ISODate {
  // month1: 1-12
  return toISODate(new Date(Date.UTC(year, month1, 0)));
}

export function isWeekend(d: ISODate): boolean {
  const wd = parseISODate(d).getUTCDay();
  return wd === 0 || wd === 6;
}

export function yearOf(d: ISODate): number {
  return Number(d.slice(0, 4));
}

/** ค.ศ. → พ.ศ. */
export function beYear(y: number): number {
  return y + 543;
}
