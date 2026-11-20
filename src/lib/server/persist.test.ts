/**
 * Integration test: service layer + Prisma + SQLite จริง (ไฟล์ชั่วคราว)
 */
import Database from "better-sqlite3";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const dir = mkdtempSync(path.join(tmpdir(), "hrb-"));
const file = path.join(dir, "test.db");
process.env.DATABASE_URL = `file:${file}`;
{
  // ใช้ migration ทุกตัวตามลำดับ เหมือน prisma migrate deploy
  const raw = new Database(file);
  const migDir = path.resolve("prisma/migrations");
  for (const m of readdirSync(migDir).filter((x) => /^\d/.test(x)).sort()) raw.exec(readFileSync(path.join(migDir, m, "migration.sql"), "utf8"));
  raw.close();
}

type M = typeof import("./unitOfWork") & typeof import("./persist") & typeof import("./prisma");
let m: M;
let claims: typeof import("../services/claims");
let admin: typeof import("../services/admin");
let auth: typeof import("../services/auth");
let changes: typeof import("../services/changes");
let seed: typeof import("../data/seed");
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
const att = { id: "seed-a4", name: "x.jpg", size: 1, type: "image/jpeg", docType: "ใบเสร็จ", uploadedAt: new Date().toISOString() };

beforeAll(async () => {
  m = { ...(await import("./unitOfWork")), ...(await import("./persist")), ...(await import("./prisma")) } as M;
  claims = await import("../services/claims");
  admin = await import("../services/admin");
  auth = await import("../services/auth");
  changes = await import("../services/changes");
  seed = await import("../data/seed");
  await m.replaceAll(m.prisma, seed.createSeed());
});

describe("ฐานข้อมูลจริง (Prisma + SQLite)", () => {
  it("โหลดข้อมูลกลับมาได้ครบเหมือนตอนบันทึก", async () => {
    const s = seed.createSeed();
    const db = await m.loadDatabase(m.prisma, { withLogs: true });
    expect(db.employees.length).toBe(s.employees.length);
    expect(db.claims.length).toBe(s.claims.length);
    expect(db.claims.find((c) => c.id === "c-0001")!.history.length).toBe(s.claims.find((c) => c.id === "c-0001")!.history.length);
    expect(db.benefitLimits.length).toBe(s.benefitLimits.length);
    expect(db.payments.length).toBe(s.payments.length);
    expect(db.benefitTypes.find((b) => b.code === "MED")!.category).toBe("สุขภาพ");
    expect(db.settings.holidays.length).toBe(s.settings.holidays.length);
    expect(db.rbac.admin).not.toContain("claim.review");
    expect(db.rbac.hr_head).toContain("change.review");
    expect(db.auditLogs.length).toBe(s.auditLogs.length);
    // โหลด 2 ครั้งต้องได้ผลเหมือนกัน และ persist โดยไม่มีการเปลี่ยนแปลงต้องไม่ทำอะไร
    const again = await m.loadDatabase(m.prisma, { withLogs: true });
    expect(JSON.stringify(again)).toBe(JSON.stringify(db));
  });

  it("workflow ครบวงจรบันทึกลงฐานข้อมูลและคงอยู่", async () => {
    const c = await m.runUnitOfWork(() =>
      claims.submitClaim("e-0001", { benefitTypeId: "b-opd", receiptNo: "DB-1", vendorName: "คลินิก", amountRequested: 1500, receiptDate: today(), attachments: [{ ...att, id: "f-new" }] }),
    );
    await expect(m.runUnitOfWork(() => claims.approveClaim("e-0030", c.id))).rejects.toThrow("ไม่มีสิทธิ์");
    await m.runUnitOfWork(() => claims.approveClaim("e-0010", c.id));
    await expect(m.runUnitOfWork(() => claims.recordPayment("e-0030", c.id, { method: "cheque", paidAt: today() }))).rejects.toThrow("เลขที่เช็ค");
    await m.runUnitOfWork(() => claims.recordPayment("e-0030", c.id, { method: "transfer", paidAt: today(), transferRef: "TRF-1" }));
    const db = await m.loadDatabase(m.prisma);
    const saved = db.claims.find((x) => x.id === c.id)!;
    expect(saved.status).toBe("paid");
    expect(saved.amountRequested).toBe(1500);
    expect(saved.amountApproved).toBe(1000);
    expect(saved.receiptNo).toBe("DB-1");
    expect(saved.attachments.map((a) => a.id)).toEqual(["f-new"]);
    expect(saved.history.map((h) => h.action)).toEqual(["submit", "approve", "mark_paid"]);
    expect(db.payments.find((p) => p.claimId === c.id)?.transferRef).toBe("TRF-1");
    const logs = await m.prisma.auditLog.findMany({ where: { entityId: c.id } });
    expect(logs.length).toBe(3);
    expect(await m.prisma.emailMessage.count()).toBeGreaterThan(2);
  });

  it("คำขอแก้ไข + วงเงินใหม่บันทึกลงฐานข้อมูล", async () => {
    const cr = await m.runUnitOfWork(() =>
      changes.requestLimitChange("e-0010", "b-med", "lim-med-1", { minLevel: 1, maxLevel: 2, perYear: 25000, perClaim: null, maxCount: null }, "ปรับนโยบาย"),
    );
    await m.runUnitOfWork(() => changes.reviewChange("e-0011", cr.id, true));
    const db = await m.loadDatabase(m.prisma);
    expect(db.changeRequests.find((x) => x.id === cr.id)?.status).toBe("approved");
    expect(db.benefitLimits.filter((l) => l.benefitId === "b-med" && l.minLevel === 1).map((l) => l.perYear).sort()).toEqual([20000, 25000]);
  });

  it("ล้มเหลวกลางทาง = ไม่บันทึกอะไร (transaction)", async () => {
    const before = await m.prisma.claim.count();
    await expect(
      m.runUnitOfWork(() => claims.submitClaim("e-0001", { benefitTypeId: "b-opd", receiptNo: "", vendorName: "", amountRequested: 500, receiptDate: today(), attachments: [att] })),
    ).rejects.toThrow();
    expect(await m.prisma.claim.count()).toBe(before);
  });

  it("แก้ไขพนักงาน/แผนก/ตำแหน่ง และลบได้", async () => {
    const db = await m.loadDatabase(m.prisma);
    const e = db.employees.find((x) => x.id === "e-0002")!;
    await m.runUnitOfWork(() => admin.updateEmployee("e-0010", e.id, { ...e, employmentType: "permanent", supervisorId: "e-0040" }));
    await m.runUnitOfWork(() => admin.saveDepartment("e-0010", { code: "mkt", name: "การตลาด" }));
    const d2 = await m.loadDatabase(m.prisma);
    expect(d2.employees.find((x) => x.id === "e-0002")!.employmentType).toBe("permanent");
    const mkt = d2.departments.find((x) => x.code === "MKT")!;
    await m.runUnitOfWork(() => admin.savePosition("e-0010", { name: "Marketer", level: 1 }));
    const pos = (await m.loadDatabase(m.prisma)).positions.find((p) => p.name === "Marketer")!;
    await m.runUnitOfWork(() => admin.deletePosition("e-0010", pos.id));
    await m.runUnitOfWork(() => admin.deleteDepartment("e-0010", mkt.id));
    expect(await m.prisma.department.count({ where: { code: "MKT" } })).toBe(0);
  });

  it("เข้าสู่ระบบด้วยรหัสผ่าน scrypt และบันทึกการเข้าสู่ระบบที่ล้มเหลว", async () => {
    await expect(m.runUnitOfWork(() => auth.login("EMP-0001", "wrong"))).rejects.toThrow();
    expect((await m.runUnitOfWork(() => auth.login("emp-0001", "1234"))).id).toBe("e-0001");
    expect(await m.prisma.auditLog.count({ where: { action: "login_failed" } })).toBeGreaterThan(0);
  });

  it("สำรองและกู้คืนข้อมูล", async () => {
    const json = await m.runUnitOfWork(() => admin.exportBackup("e-0050"), { withLogs: true });
    const claimsBefore = await m.prisma.claim.count();
    await m.runUnitOfWork(() => admin.resetDemo("e-0050"));
    expect(await m.prisma.claim.count()).toBe(seed.createSeed().claims.length);
    await m.runUnitOfWork(() => admin.restoreBackup("e-0050", json));
    expect(await m.prisma.claim.count()).toBe(claimsBefore);
    expect(await m.prisma.auditLog.count({ where: { action: "restore" } })).toBe(1);
  });
});
