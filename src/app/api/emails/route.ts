import { connection, NextResponse, type NextRequest } from "next/server";
import { toEmail } from "@/lib/server/persist";
import { errorResponse, HttpError, noStore, requireUserWithDb } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { can } from "@/lib/services/core";

export async function GET(req: NextRequest) {
  await connection(); // ทำงานตอนมีคำขอจริงเท่านั้น (ไม่ prerender)
  try {
    const { me, db } = await requireUserWithDb(req);
    if (!can(db, me, "system.manage")) throw new HttpError(403, "คุณไม่มีสิทธิ์ดูอีเมลของระบบ");
    const rows = await prisma.emailMessage.findMany({ orderBy: { at: "desc" }, take: 300 });
    return NextResponse.json({ items: rows.map(toEmail) }, { headers: noStore });
  } catch (e) {
    return errorResponse(e);
  }
}
