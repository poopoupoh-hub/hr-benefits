import { NextResponse, type NextRequest } from "next/server";
import { saveUpload } from "@/lib/server/files";
import { assertSameOrigin, errorResponse, HttpError, noStore, requireUserWithDb } from "@/lib/server/http";
import { can } from "@/lib/services/core";

/** อัปโหลดไฟล์แนบ (multipart/form-data: file, docType) */
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const { me, db } = await requireUserWithDb(req);
    if (!can(db, me, "self.claim")) throw new HttpError(403, "คุณไม่มีสิทธิ์แนบเอกสาร");
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "ไม่พบไฟล์");
    const meta = await saveUpload(file, me.id, String(form.get("docType") ?? "อื่น ๆ"));
    return NextResponse.json({ ok: true, file: meta }, { headers: noStore });
  } catch (e) {
    return errorResponse(e);
  }
}
