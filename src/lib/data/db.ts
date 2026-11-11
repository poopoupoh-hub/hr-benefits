/**
 * Data Access Layer — "unit of work" ที่ service layer ใช้อ่าน/เขียนข้อมูล
 *
 * service ทุกตัวเรียก getDB() / commit() ผ่านไฟล์นี้ โดยไม่รู้ว่าข้อมูลมาจากไหน
 * - ฝั่งเซิร์ฟเวอร์: src/lib/server/unitOfWork.ts โหลดข้อมูลจากฐานข้อมูล (Prisma) มาใส่ store
 *   ให้ service ทำงาน แล้วบันทึกเฉพาะส่วนที่เปลี่ยนกลับลงฐานข้อมูลใน transaction เดียว
 * - unit test: ใช้ store ในหน่วยความจำที่เริ่มจากข้อมูลตัวอย่าง (seed)
 */
import type { Database } from "../domain/types";
import { createSeed } from "./seed";

export class MemoryStore {
  current: Database;
  /** true เมื่อมีการแทนที่ข้อมูลทั้งชุด (กู้คืน / รีเซ็ต) */
  replaced = false;
  constructor(initial: Database) {
    this.current = initial;
  }
  getDB() {
    return this.current;
  }
  /** แก้ไขแบบ transaction: mutate สำเนา → ถ้าไม่ throw จึงยืนยันผล */
  commit<T>(mutator: (draft: Database) => T): T {
    const draft = structuredClone(this.current);
    const result = mutator(draft);
    this.current = draft;
    return result;
  }
  replace(db: Database) {
    this.current = db;
    this.replaced = true;
  }
}

let active: MemoryStore | null = null;

function store(): MemoryStore {
  if (!active) active = new MemoryStore(createSeed());
  return active;
}

/** ใช้โดย unit of work ฝั่งเซิร์ฟเวอร์ — ตั้ง store สำหรับคำขอปัจจุบัน */
export function setActiveStore(s: MemoryStore | null) {
  active = s;
}

export const getDB = () => store().getDB();
export const commit = <T>(mutator: (draft: Database) => T): T => store().commit(mutator);
export const replaceDB = (db: Database) => store().replace(db);
export const resetDB = () => store().replace(createSeed());

export { uid } from "./uid";
