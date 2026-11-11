import { NextResponse, type NextRequest } from "next/server";
import { assertSameOrigin, errorResponse } from "@/lib/server/http";
import { clearSessionCookie } from "@/lib/server/session";

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const res = NextResponse.json({ ok: true });
    clearSessionCookie(res);
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
