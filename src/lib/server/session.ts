/**
 * Session — cookie แบบ HttpOnly ที่ลงลายมือชื่อด้วย HMAC-SHA256 (SESSION_SECRET)
 * ผูกกับรหัสผ่านปัจจุบัน: เปลี่ยน/รีเซ็ตรหัสผ่านแล้ว session เดิมใช้ไม่ได้ทันที
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import type { Employee } from "../domain/types";

export const SESSION_COOKIE = "hrb_session";
const TTL_SEC = 8 * 60 * 60;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16 && !s.startsWith("change-me")) return s;
  if (process.env.NODE_ENV === "production") throw new Error("กรุณาตั้งค่า SESSION_SECRET ในไฟล์ .env (อย่างน้อย 16 ตัวอักษร)");
  return "dev-only-insecure-secret-please-run-npm-run-setup";
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (data: string) => createHmac("sha256", secret()).update(data).digest("base64url");
const pwVersion = (e: Pick<Employee, "passwordHash">) => createHmac("sha256", secret()).update(e.passwordHash).digest("base64url").slice(0, 12);

interface Payload {
  uid: string;
  exp: number;
  pv: string;
}

export function createSessionToken(e: Employee) {
  const payload: Payload = { uid: e.id, exp: Math.floor(Date.now() / 1000) + TTL_SEC, pv: pwVersion(e) };
  const data = b64(JSON.stringify(payload));
  return `${data}.${sign(data)}`;
}

export function readSessionToken(token: string | undefined): Payload | null {
  if (!token) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = Buffer.from(sign(data));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const p = JSON.parse(Buffer.from(data, "base64url").toString()) as Payload;
    if (p.exp < Date.now() / 1000) return null;
    return p;
  } catch {
    return null;
  }
}

/** หาผู้ใช้จาก cookie — คืน null ถ้า session ไม่ถูกต้อง หมดอายุ บัญชีถูกปิด หรือรหัสผ่านเปลี่ยน */
export function sessionUser(req: NextRequest, employees: Employee[]): Employee | null {
  const p = readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!p) return null;
  const e = employees.find((x) => x.id === p.uid);
  return e && sessionMatches(p, e) ? e : null;
}

export function sessionMatches(p: { uid: string; pv: string }, e: Pick<Employee, "id" | "active" | "passwordHash">) {
  return e.id === p.uid && e.active && pwVersion(e) === p.pv;
}

export function setSessionCookie(req: NextRequest, res: NextResponse, e: Employee) {
  const https = req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  res.cookies.set(SESSION_COOKIE, createSessionToken(e), {
    httpOnly: true,
    sameSite: "lax",
    secure: https,
    path: "/",
    maxAge: TTL_SEC,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}
