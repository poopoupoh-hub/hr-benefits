/**
 * Data Access Layer — ที่เก็บข้อมูลที่ service layer ใช้อ่าน/เขียน
 *
 * service ทุกตัวเรียก getDB() / commit() ผ่านไฟล์นี้ โดยไม่รู้ว่าข้อมูลเก็บที่ไหน
 * - ในเบราว์เซอร์: BrowserStore เก็บข้อมูลทั้งชุดเป็น JSON ใน localStorage (คีย์ "hr-benefits:db")
 *   ทุก commit เขียนลง localStorage ทันที และอ่านค่าล่าสุดก่อนแก้ทุกครั้ง (เปิดหลายแท็บพร้อมกันได้ ข้อมูลไม่ทับกัน)
 * - unit test / ตอน build (ไม่มี window): MemoryStore ในหน่วยความจำที่เริ่มจากข้อมูลตัวอย่าง (seed)
 *
 * ไฟล์แนบเก็บแยกใน IndexedDB (src/lib/data/files.ts) ตาม NFR "เก็บไฟล์แนบแยกจากฐานข้อมูลหลัก"
 */
import { DB_VERSION } from "../domain/constants";
import type { Database } from "../domain/types";
import { createSeed } from "./seed";

export const DB_KEY = "hr-benefits:db";

export interface Store {
  getDB(): Database;
  /** แก้ไขแบบ transaction: mutate สำเนา → ถ้าไม่ throw จึงบันทึกผล */
  commit<T>(mutator: (draft: Database) => T): T;
  /** แทนที่ข้อมูลทั้งชุด (กู้คืน / รีเซ็ต) */
  replace(db: Database): void;
}

export class MemoryStore implements Store {
  current: Database;
  constructor(initial: Database) {
    this.current = initial;
  }
  getDB() {
    return this.current;
  }
  commit<T>(mutator: (draft: Database) => T): T {
    const draft = structuredClone(this.current);
    const result = mutator(draft);
    this.current = draft;
    return result;
  }
  replace(db: Database) {
    this.current = db;
  }
}

/** ส่วนของ Web Storage API ที่ใช้ (ทดสอบด้วย object ธรรมดาได้) */
export type KeyValueStorage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;

export class StorageFullError extends Error {
  constructor() {
    super("พื้นที่จัดเก็บของเบราว์เซอร์ (localStorage) เต็ม — ผู้ดูแลระบบควรสำรองข้อมูลแล้วล้าง Audit Log/อีเมลเก่า หรือรีเซ็ตข้อมูล");
    this.name = "StorageFullError";
  }
}

export class BrowserStore implements Store {
  private raw: string | null = null;
  private cache: Database | null = null;
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly key = DB_KEY,
  ) {}

  /** อ่านค่าล่าสุดจาก storage (parse ใหม่เฉพาะเมื่อแท็บอื่นเขียนทับ) */
  private sync(): Database {
    const raw = this.storage.getItem(this.key);
    if (raw !== null && raw === this.raw && this.cache) return this.cache;
    let db: Database | null = null;
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Database;
        if (parsed?.version === DB_VERSION && Array.isArray(parsed.employees)) db = parsed;
        else console.warn(`[hr-benefits] ข้อมูลใน localStorage เป็นเวอร์ชัน ${parsed?.version} (ระบบ ${DB_VERSION}) — เริ่มข้อมูลตัวอย่างใหม่`);
      } catch {
        console.warn("[hr-benefits] ข้อมูลใน localStorage เสีย — เริ่มข้อมูลตัวอย่างใหม่");
      }
    }
    if (!db) {
      db = createSeed();
      this.write(db);
      return db;
    }
    this.raw = raw;
    this.cache = db;
    return db;
  }

  private write(db: Database) {
    const raw = JSON.stringify(db);
    try {
      this.storage.setItem(this.key, raw);
    } catch (e) {
      if (e instanceof Error && /quota/i.test(e.name + e.message)) throw new StorageFullError();
      throw e;
    }
    this.raw = raw;
    this.cache = db;
  }

  getDB() {
    return this.sync();
  }

  commit<T>(mutator: (draft: Database) => T): T {
    const draft = structuredClone(this.sync());
    const result = mutator(draft);
    this.write(draft);
    return result;
  }

  replace(db: Database) {
    this.write(db);
  }

  /** ขนาดข้อมูลที่ใช้ (ไบต์โดยประมาณ — localStorage เก็บเป็น UTF-16) */
  usageBytes() {
    return (this.storage.getItem(this.key)?.length ?? 0) * 2;
  }
}

let active: Store | null = null;

function store(): Store {
  if (!active) active = typeof window !== "undefined" && window.localStorage ? new BrowserStore(window.localStorage) : new MemoryStore(createSeed());
  return active;
}

/** เปลี่ยนที่เก็บข้อมูล (ใช้ใน unit test) */
export function setActiveStore(s: Store | null) {
  active = s;
}
export const activeStore = () => store();

export const getDB = () => store().getDB();
export const commit = <T>(mutator: (draft: Database) => T): T => store().commit(mutator);
export const replaceDB = (db: Database) => store().replace(db);
export const resetDB = () => store().replace(createSeed());

export { uid } from "./uid";
