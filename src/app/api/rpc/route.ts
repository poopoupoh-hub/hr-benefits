import { NextResponse, type NextRequest } from "next/server";
import type { AttachmentMeta } from "@/lib/domain/types";
import { verifyAttachments } from "@/lib/server/files";
import { assertSameOrigin, errorResponse, HttpError, noStore, requireUserId } from "@/lib/server/http";
import { ATTACHMENT_ARG, NEEDS_LOGS, READ_ONLY, RPC_METHODS, type RpcName } from "@/lib/server/rpc";
import { setSessionCookie } from "@/lib/server/session";
import { readDatabase, runUnitOfWork } from "@/lib/server/unitOfWork";

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    if (!req.headers.get("content-type")?.includes("application/json")) throw new HttpError(415, "ต้องส่งข้อมูลแบบ JSON");
    const actorId = await requireUserId(req);
    const body = (await req.json()) as { method?: string; args?: unknown[] };
    const method = body.method as RpcName;
    if (!method || !Object.hasOwn(RPC_METHODS, method)) throw new HttpError(404, "ไม่พบคำสั่ง");
    const args = Array.isArray(body.args) ? [...body.args] : [];

    // ไฟล์แนบ: ตรวจความเป็นเจ้าของ และใช้ metadata จากฐานข้อมูล
    const ai = ATTACHMENT_ARG[method];
    if (ai !== undefined && args[ai] && typeof args[ai] === "object") {
      const input = args[ai] as { attachments?: AttachmentMeta[] };
      const claimId = method === "updateClaim" ? String(args[0]) : method === "validateClaim" ? (args[1] as string | undefined) : undefined;
      input.attachments = await verifyAttachments(actorId, input.attachments ?? [], claimId);
    }

    const fn = RPC_METHODS[method] as (...a: unknown[]) => unknown;
    const result = await runUnitOfWork(() => fn(actorId, ...args), { withLogs: NEEDS_LOGS.has(method), readOnly: READ_ONLY.has(method) });
    const res = NextResponse.json({ ok: true, result: result ?? null }, { headers: noStore });
    // เปลี่ยนรหัสผ่านตัวเอง → ออก session ใหม่ (session เดิมทุกเครื่องจะใช้ไม่ได้)
    if (method === "changeOwnPassword" || (method === "resetPassword" && args[0] === actorId)) {
      const me = (await readDatabase()).employees.find((e) => e.id === actorId);
      if (me) setSessionCookie(req, res, me);
    }
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
