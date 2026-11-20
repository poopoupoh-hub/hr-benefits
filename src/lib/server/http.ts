import { NextResponse, type NextRequest } from "next/server";
import type { Database, Employee } from "../domain/types";
import { ServiceError } from "../services/core";
import { readSessionToken, SESSION_COOKIE, sessionMatches, sessionUser } from "./session";
import { prisma } from "./prisma";
import { loadDatabase } from "./persist";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** ตรวจ session แล้วคืนรหัสผู้ใช้ (อ่านเฉพาะแถวของผู้ใช้คนนั้น) */
export async function requireUserId(req: NextRequest): Promise<string> {
  const p = readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!p) throw new HttpError(401, "กรุณาเข้าสู่ระบบ");
  const e = await prisma.employee.findUnique({ where: { id: p.uid }, select: { id: true, active: true, passwordHash: true } });
  if (!e || !sessionMatches(p, e)) throw new HttpError(401, "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่");
  return e.id;
}

/** ผู้ใช้จาก session พร้อมข้อมูลทั้งหมดที่เห็นได้ */
export async function requireUserWithDb(req: NextRequest, withLogs = false): Promise<{ me: Employee; db: Database }> {
  const db = await loadDatabase(prisma, { withLogs });
  const me = sessionUser(req, db.employees);
  if (!me) throw new HttpError(401, "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่");
  return { me, db };
}

/** ป้องกัน CSRF: รับเฉพาะคำขอจากเว็บเดียวกัน */
export function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (!host || new URL(origin).host !== host) throw new HttpError(403, "Cross-origin request ไม่ได้รับอนุญาต");
  }
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
  if (e instanceof ServiceError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  console.error("[api]", e);
  return NextResponse.json({ ok: false, error: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่" }, { status: 500 });
}

export const noStore = { "Cache-Control": "no-store" };
