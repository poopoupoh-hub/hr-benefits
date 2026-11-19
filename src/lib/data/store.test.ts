import { describe, expect, it } from "vitest";
import { DB_VERSION } from "../domain/constants";
import { BrowserStore, DB_KEY, type KeyValueStorage } from "./db";
import { sniff } from "./files";
import { hashSecret, verifySecret } from "../security/hash";

/** localStorage จำลอง (ใช้ร่วมกันได้หลาย "แท็บ") */
function fakeStorage(quota = Infinity): KeyValueStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      if (v.length > quota) {
        const e = new Error("exceeded the quota");
        e.name = "QuotaExceededError";
        throw e;
      }
      map.set(k, v);
    },
    removeItem: (k) => void map.delete(k),
  };
}

describe("BrowserStore (localStorage)", () => {
  it("ครั้งแรกสร้างข้อมูลตัวอย่างและบันทึกลง localStorage", () => {
    const ls = fakeStorage();
    const s = new BrowserStore(ls);
    expect(s.getDB().employees.length).toBeGreaterThan(5);
    expect(JSON.parse(ls.map.get(DB_KEY)!).version).toBe(DB_VERSION);
  });

  it("commit เขียนลง storage · เปิดใหม่ (รีเฟรชหน้า) ข้อมูลยังอยู่", () => {
    const ls = fakeStorage();
    new BrowserStore(ls).commit((d) => {
      d.settings.orgName = "บริษัททดสอบ";
    });
    expect(new BrowserStore(ls).getDB().settings.orgName).toBe("บริษัททดสอบ");
  });

  it("สองแท็บแก้พร้อมกัน ไม่เขียนทับกัน (อ่านค่าล่าสุดก่อน commit)", () => {
    const ls = fakeStorage();
    const tabA = new BrowserStore(ls);
    const tabB = new BrowserStore(ls);
    tabA.getDB();
    tabB.getDB();
    tabA.commit((d) => void d.departments.push({ id: "d-a", code: "A", name: "A" }));
    tabB.commit((d) => void d.departments.push({ id: "d-b", code: "B", name: "B" }));
    const ids = new BrowserStore(ls).getDB().departments.map((d) => d.id);
    expect(ids).toEqual(expect.arrayContaining(["d-a", "d-b"]));
  });

  it("mutator throw → ไม่บันทึกอะไร", () => {
    const ls = fakeStorage();
    const s = new BrowserStore(ls);
    s.getDB();
    const before = ls.map.get(DB_KEY);
    expect(before).toBeTruthy();
    expect(() =>
      s.commit((d) => {
        d.settings.orgName = "X";
        throw new Error("fail");
      }),
    ).toThrow("fail");
    expect(ls.map.get(DB_KEY)).toBe(before);
  });

  it("ข้อมูลเวอร์ชันเก่า/เสีย → เริ่มข้อมูลตัวอย่างใหม่", () => {
    const ls = fakeStorage();
    ls.setItem(DB_KEY, JSON.stringify({ version: 1, employees: [] }));
    expect(new BrowserStore(ls).getDB().version).toBe(DB_VERSION);
    ls.setItem(DB_KEY, "{not json");
    expect(new BrowserStore(ls).getDB().version).toBe(DB_VERSION);
  });

  it("พื้นที่เต็ม → แจ้งข้อความภาษาไทย และข้อมูลเดิมไม่เสีย", () => {
    const seeded = fakeStorage();
    new BrowserStore(seeded).getDB();
    const raw = seeded.map.get(DB_KEY)!;
    const ls = fakeStorage(raw.length + 10);
    ls.map.set(DB_KEY, raw);
    const s = new BrowserStore(ls);
    expect(() => s.commit((d) => void (d.settings.orgName = "x".repeat(1000)))).toThrow("localStorage");
    expect(ls.map.get(DB_KEY)).toBe(raw);
    expect(s.getDB().settings.orgName).not.toContain("xxxx");
  });
});

describe("รหัสผ่าน / ไฟล์แนบ", () => {
  it("PBKDF2 hash ตรวจได้ และ salt ต่างกันทุกครั้ง", () => {
    const h = hashSecret("1234", 1000);
    expect(h).toMatch(/^pbkdf2\$1000\$/);
    expect(verifySecret("1234", h)).toBe(true);
    expect(verifySecret("12345", h)).toBe(false);
    expect(hashSecret("1234", 1000)).not.toBe(h);
    expect(verifySecret("1234", "garbage")).toBe(false);
  });

  it("ตรวจชนิดไฟล์จากเนื้อไฟล์ (magic bytes)", () => {
    expect(sniff(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniff(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniff(new TextEncoder().encode("%PDF-1.7"))).toBe("application/pdf");
    expect(sniff(new TextEncoder().encode("<html>"))).toBeNull();
  });
});
