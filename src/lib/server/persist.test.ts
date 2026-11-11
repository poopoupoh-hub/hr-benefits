/**
 * Integration test: service layer + Prisma + SQLite จริง (ไฟล์ชั่วคราว)
 */
import Database from "better-sqlite3";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const dir = mkdtempSync(path.join(tmpdir(), "hrb-"));
const file = path.join(dir, "test.db");
process.env.DATABASE_URL = `file:${file}`;
new Database(file).exec(readFileSync(path.resolve("prisma/migrations/20261104000000_init/migration.sql"), "utf8"));

type M = typeof import("./unitOfWork") & typeof import("./persist") & typeof import("./prisma");
let m: M;
let claims: typeof import("../services/claims");
let admin: typeof import("../services/admin");
let auth: typeof import("../services/auth");
let seed: typeof import("../data/seed");
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
const att = { id: "seed-a4", name: "x.jpg", size: 1, type: "image/jpeg", docType: "ใบเสร็จ", uploadedAt: new Date().toISOString() };

beforeAll(async () => {
  m = { ...(await import("./unitOfWork")), ...(await import("./persist")), ...(await import("./prisma")) } as M;
  claims = await import("../services/claims");
  admin = await import("../services/admin");
  auth = await import("../services/auth");
  seed = await import("../data/seed");
  await m.replaceAll(m.prisma, seed.createSeed());
});

describe("ฐานข้อมูลจริง (Prisma + SQLite)", () => {
  it("โหลดข้อมูลกลับมาได้ครบเหมือนตอนบันทึก", async () => {
    const s = seed.createSeed();
    const db = await m.loadDatabase(m.prisma, { withLogs: true });
    expect(db.employees.length).toBe(s.employees.length);
    expect(db.claims.length).toBe(s.claims.length);
    expect(db.claims.find((c) => c.id === "c-0001")!.history.length).toBe(4);
    expect(db.benefitTypes.find((b) => b.code === "MED")!.typeOverrides).toEqual({ contract: { annualLimit: 10000 } });
    expect(db.settings.holidays.length).toBe(s.settings.holidays.length);
    expect(db.rbac.admin).not.toContain("claim.approve");
    expect(db.auditLogs.length).toBe(s.auditLogs.length);
    // โหลด 2 ครั้งต้องได้ผลเหมือนกัน และ persist โดยไม่มีการเปลี่ยนแปลงต้องไม่ทำอะไร
    const again = await m.loadDatabase(m.prisma, { withLogs: true });
    expect(JSON.stringify(again)).toBe(JSON.stringify(db));
  });

  it("workflow ครบวงจรบันทึกลงฐานข้อมูลและคงอยู่", async () => {
    const c = await m.runUnitOfWork(() =>
      claims.submitClaim("e-0001", { employeeId: "e-0001", benefitTypeId: "b-den", amount: 700, receiptDate: today(), attachments: [{ ...att, id: "f-new" }] }),
    );
    await m.runUnitOfWork(() => claims.hrPass("e-0010", c.id));
    await expect(m.runUnitOfWork(() => claims.approveClaim("e-0020", c.id, "0000"))).rejects.toThrow("PIN ไม่ถูกต้อง");
    await m.runUnitOfWork(() => claims.approveClaim("e-0020", c.id, "1234"));
    await m.runUnitOfWork(() => claims.markPaid("e-0030", [c.id], "TRF-1"));
    const db = await m.loadDatabase(m.prisma);
    const saved = db.claims.find((x) => x.id === c.id)!;
    expect(saved.status).toBe("paid");
    expect(saved.amount).toBe(700);
    expect(saved.attachments.map((a) => a.id)).toEqual(["f-new"]);
    expect(saved.history.map((h) => h.action)).toEqual(["submit", "hr_pass", "approve", "mark_paid"]);
    const logs = await m.prisma.auditLog.findMany({ where: { entityId: c.id } });
    expect(logs.length).toBe(4);
    // PIN ผิดถูกบันทึกแม้คำสั่งล้มเหลว
    expect(await m.prisma.auditLog.count({ where: { action: "pin_failed" } })).toBe(1);
    expect(await m.prisma.emailMessage.count()).toBeGreaterThan(3);
    expect(db.counters.claim_2026 ?? db.counters[`claim_${new Date().getFullYear()}`]).toBeGreaterThan(0);
  });

  it("ล้มเหลวกลางทาง = ไม่บันทึกอะไร (transaction)", async () => {
    const before = await m.prisma.claim.count();
    await expect(
      m.runUnitOfWork(() => claims.submitClaim("e-0001", { employeeId: "e-0001", benefitTypeId: "b-opd", amount: 5000, receiptDate: today(), attachments: [att] })),
    ).rejects.toThrow();
    expect(await m.prisma.claim.count()).toBe(before);
  });

  it("แก้ไขพนักงาน/แผนก/ตำแหน่ง และลบได้", async () => {
    const db = await m.loadDatabase(m.prisma);
    const e = db.employees.find((x) => x.id === "e-0002")!;
    await m.runUnitOfWork(() => admin.updateEmployee("e-0010", e.id, { ...e, employmentType: "permanent", managerId: "e-0040" }));
    await m.runUnitOfWork(() => admin.saveDepartment("e-0010", { code: "mkt", name: "การตลาด" }));
    const d2 = await m.loadDatabase(m.prisma);
    expect(d2.employees.find((x) => x.id === "e-0002")!.employmentType).toBe("permanent");
    const mkt = d2.departments.find((x) => x.code === "MKT")!;
    await m.runUnitOfWork(() => admin.savePosition("e-0010", { name: "Marketer", departmentId: mkt.id }));
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
    expect(await m.prisma.claim.count()).toBe(8);
    await m.runUnitOfWork(() => admin.restoreBackup("e-0050", json));
    expect(await m.prisma.claim.count()).toBe(claimsBefore);
    expect(await m.prisma.auditLog.count({ where: { action: "restore" } })).toBe(1);
  });
});
