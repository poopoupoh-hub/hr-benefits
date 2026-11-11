import { connection, NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { toAuditLog } from "@/lib/server/persist";
import { errorResponse, HttpError, noStore, requireUserWithDb } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { can } from "@/lib/services/core";

/** ผู้ที่ไม่มีสิทธิ์ดูข้อมูลพนักงาน (เช่น บัญชี) เห็นเฉพาะ log ด้านการเงิน */
const FINANCE_SCOPE = ["claim", "payment", "budget", "fund"];

export async function GET(req: NextRequest) {
  await connection(); // ทำงานตอนมีคำขอจริงเท่านั้น (ไม่ prerender)
  try {
    const { me, db } = await requireUserWithDb(req);
    const sp = req.nextUrl.searchParams;
    const entityId = sp.get("entityId");
    // ประวัติของพนักงานรายคน: HR/ผู้ดูแล หรือดูของตัวเอง
    const ownHistory = entityId === me.id;
    if (!can(db, me, "audit.view") && !ownHistory && !(entityId && can(db, me, "employee.view"))) throw new HttpError(403, "คุณไม่มีสิทธิ์ดู Audit Log");
    const full = can(db, me, "employee.view") || can(db, me, "system.manage");

    const and: Prisma.AuditLogWhereInput[] = [];
    if (!full) and.push({ entity: { in: FINANCE_SCOPE } });
    const entity = sp.get("entity");
    if (entity) and.push({ entity });
    if (entityId) and.push({ entityId });
    const entities = sp.get("entities");
    if (entities) and.push({ entity: { in: entities.split(",") } });
    const actor = sp.get("actor");
    if (actor) and.push({ actorId: actor });
    const from = sp.get("from");
    if (from) and.push({ at: { gte: new Date(`${from}T00:00:00`) } });
    const to = sp.get("to");
    if (to) and.push({ at: { lte: new Date(`${to}T23:59:59.999`) } });
    const q = sp.get("q")?.trim();
    if (q) and.push({ OR: [{ summary: { contains: q } }, { action: { contains: q } }] });
    const where: Prisma.AuditLogWhereInput = and.length ? { AND: and } : {};
    const limit = Math.min(500, Math.max(1, Number(sp.get("limit")) || 100));
    const offset = Math.max(0, Number(sp.get("offset")) || 0);
    const [total, rows] = await prisma.$transaction([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({ where, orderBy: { at: "desc" }, skip: offset, take: limit }),
    ]);
    return NextResponse.json({ total, items: rows.map(toAuditLog), full }, { headers: noStore });
  } catch (e) {
    return errorResponse(e);
  }
}
