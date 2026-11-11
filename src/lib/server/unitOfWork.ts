/**
 * Unit of Work — รัน service (ซึ่งเขียนแบบ synchronous) บนข้อมูลที่โหลดจากฐานข้อมูล
 * แล้วบันทึกเฉพาะส่วนที่เปลี่ยนใน transaction เดียว
 *
 * งานที่แก้ข้อมูลถูกจัดคิวทีละงาน (mutex) เพื่อป้องกันข้อมูลชนกัน เช่น ยื่นซ้อนเกินวงเงิน
 * หมายเหตุ: ถ้าจะรันหลาย instance ให้เปลี่ยน mutex เป็น advisory lock ของ PostgreSQL
 */
import { MemoryStore, setActiveStore } from "../data/db";
import type { Database } from "../domain/types";
import { loadDatabase, persistChanges, replaceAll } from "./persist";
import { prisma } from "./prisma";

let chain: Promise<unknown> = Promise.resolve();

function exclusive<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job, job);
  chain = run.catch(() => undefined);
  return run;
}

export function runUnitOfWork<T>(fn: () => T, opts: { withLogs?: boolean; readOnly?: boolean } = {}): Promise<T> {
  return exclusive(async () => {
    const base = await loadDatabase(prisma, { withLogs: opts.withLogs });
    const store = new MemoryStore(structuredClone(base) as Database);
    setActiveStore(store);
    let result: T | undefined;
    let error: unknown;
    try {
      result = fn();
    } catch (e) {
      error = e;
    } finally {
      setActiveStore(null);
    }
    // บันทึกแม้ service จะ throw — เพราะบาง service บันทึก audit ก่อนแจ้งข้อผิดพลาด (เช่น PIN ผิด)
    if (!opts.readOnly) {
      if (store.replaced) await replaceAll(prisma, store.current);
      else await persistChanges(prisma, base, store.current);
    }
    if (error) throw error;
    return result as T;
  });
}

/** อ่านข้อมูลล่าสุด (ไม่ต้องเข้าคิว) */
export const readDatabase = (withLogs = false) => loadDatabase(prisma, { withLogs });
