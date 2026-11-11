import { connection, NextResponse, type NextRequest } from "next/server";
import { readStoredFile } from "@/lib/server/files";
import { errorResponse, HttpError, requireUserWithDb } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { scopeDatabase } from "@/lib/server/scope";

/** ดาวน์โหลดไฟล์แนบ — เฉพาะผู้อัปโหลด หรือผู้ที่มีสิทธิ์เห็นคำขอฉบับเต็ม (บัญชี/ผู้ดูแลระบบไม่เห็นเอกสาร) */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await connection(); // ทำงานตอนมีคำขอจริงเท่านั้น (ไม่ prerender)
  try {
    const { id } = await ctx.params;
    const { me, db } = await requireUserWithDb(req);
    const stored = await prisma.storedFile.findUnique({ where: { id } });
    const visible = scopeDatabase(db, me).claims.some((c) => c.attachments.some((a) => a.id === id));
    if (!visible && stored?.uploaderId !== me.id) throw new HttpError(stored || visible ? 403 : 404, "ไม่พบไฟล์ หรือคุณไม่มีสิทธิ์ดูไฟล์นี้");
    const f = await readStoredFile(id);
    if (!f) throw new HttpError(404, "ไม่พบไฟล์ในที่เก็บไฟล์ (อาจเป็นไฟล์ตัวอย่างจากข้อมูลสมมติ)");
    return new NextResponse(new Uint8Array(f.data), {
      headers: {
        "Content-Type": f.row.mimeType,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(f.row.name)}`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
