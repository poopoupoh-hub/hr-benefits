import { connection, NextResponse, type NextRequest } from "next/server";
import { errorResponse, noStore } from "@/lib/server/http";
import { scopeDatabase } from "@/lib/server/scope";
import { sessionUser } from "@/lib/server/session";
import { readDatabase } from "@/lib/server/unitOfWork";

/** ข้อมูลทั้งหมดที่ผู้ใช้ปัจจุบันมีสิทธิ์เห็น (ตัดตามบทบาทแล้ว) */
export async function GET(req: NextRequest) {
  await connection(); // ทำงานตอนมีคำขอจริงเท่านั้น (ไม่ prerender)
  try {
    const db = await readDatabase();
    const me = sessionUser(req, db.employees);
    if (!me) {
      // บัญชีทดสอบ: เปิดเป็นค่าเริ่มต้นตอนพัฒนา (production ต้องตั้ง SHOW_DEMO_ACCOUNTS="true" เองจึงจะแสดง)
      const showDemo = process.env.SHOW_DEMO_ACCOUNTS === "true" || (process.env.SHOW_DEMO_ACCOUNTS !== "false" && process.env.NODE_ENV !== "production");
      const demo =
        showDemo
          ? ["EMP-0001", "EMP-0003", "EMP-0020", "EMP-0010", "EMP-0011", "EMP-0030", "EMP-0050"]
              .map((c) => db.employees.find((e) => e.code === c && e.active))
              .filter(Boolean)
              .map((e) => ({ code: e!.code, name: `${e!.firstName} ${e!.lastName}`, role: e!.role, employmentType: e!.employmentType }))
          : [];
      return NextResponse.json({ me: null, public: { orgName: db.settings.orgName, demoAccounts: demo } }, { headers: noStore });
    }
    const scoped = scopeDatabase(db, me);
    return NextResponse.json({ me: scoped.employees.find((e) => e.id === me.id), db: scoped }, { headers: noStore });
  } catch (e) {
    return errorResponse(e);
  }
}
