import { NextResponse, type NextRequest } from "next/server";
import { assertSameOrigin, errorResponse, noStore } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";
import { runUnitOfWork } from "@/lib/server/unitOfWork";
import { login } from "@/lib/services/auth";

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const { code, password } = (await req.json()) as { code?: string; password?: string };
    if (typeof code !== "string" || typeof password !== "string") throw new Error("bad request");
    const emp = await runUnitOfWork(() => login(code, password));
    const res = NextResponse.json({ ok: true, role: emp.role }, { headers: noStore });
    setSessionCookie(req, res, emp);
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
