/**
 * Session — เก็บใน localStorage (คีย์ "hr-benefits:session") อายุ 8 ชั่วโมง
 * ผูกกับรหัสผ่านปัจจุบัน: เปลี่ยน/รีเซ็ตรหัสผ่านแล้ว session เดิม (ทุกแท็บ) ใช้ไม่ได้ทันที
 */
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import type { Employee } from "../domain/types";

export const SESSION_KEY = "hr-benefits:session";
const TTL_MS = 8 * 60 * 60 * 1000;

interface Payload {
  uid: string;
  exp: number;
  pv: string;
}

const pwVersion = (e: Pick<Employee, "passwordHash">) => bytesToHex(sha256(utf8ToBytes(e.passwordHash))).slice(0, 12);

const ls = () => (typeof window !== "undefined" ? window.localStorage : null);

export function createSession(e: Employee) {
  const p: Payload = { uid: e.id, exp: Date.now() + TTL_MS, pv: pwVersion(e) };
  ls()?.setItem(SESSION_KEY, JSON.stringify(p));
}

export function clearSession() {
  ls()?.removeItem(SESSION_KEY);
}

function readSession(): Payload | null {
  const raw = ls()?.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Payload;
    if (!p?.uid || typeof p.exp !== "number" || p.exp < Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}

/** หาผู้ใช้จาก session — คืน null ถ้าไม่มี หมดอายุ บัญชีถูกปิด หรือรหัสผ่านเปลี่ยน */
export function sessionUser(employees: Employee[]): Employee | null {
  const p = readSession();
  if (!p) return null;
  const e = employees.find((x) => x.id === p.uid);
  if (!e || !e.active || pwVersion(e) !== p.pv) return null;
  return e;
}
