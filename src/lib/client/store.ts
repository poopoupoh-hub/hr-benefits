/**
 * ข้อมูลฝั่งหน้าจอ — สำเนาข้อมูลที่ผู้ใช้มีสิทธิ์เห็น (ตัดตามบทบาทด้วย scopeDatabase แล้ว)
 * อ่านจาก localStorage และโหลดใหม่ทุกครั้งหลังทำรายการ / เมื่อแท็บอื่นแก้ข้อมูล (storage event)
 */
import { getDB } from "../data/db";
import { scopeDatabase } from "../data/scope";
import { sessionUser } from "../data/session";
import type { Database, Employee } from "../domain/types";

export interface AppState {
  loaded: boolean;
  me: Employee | null;
  db: Database | null;
  public: { orgName: string } | null;
  error: string | null;
}

let state: AppState = { loaded: false, me: null, db: null, public: null, error: null };
const listeners = new Set<() => void>();
const SERVER_STATE: AppState = { loaded: false, me: null, db: null, public: null, error: null };

export const getState = () => state;
export const getServerState = () => SERVER_STATE;
export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function set(next: AppState) {
  state = next;
  listeners.forEach((l) => l());
}

export function refresh(): Promise<void> {
  try {
    const db = getDB();
    const me = sessionUser(db.employees);
    if (!me) set({ loaded: true, me: null, db: null, public: { orgName: db.settings.orgName }, error: null });
    else {
      const scoped = scopeDatabase(db, me);
      set({ loaded: true, me: scoped.employees.find((e) => e.id === me.id) ?? null, db: scoped, public: null, error: null });
    }
  } catch (e) {
    set({ ...state, loaded: true, error: e instanceof Error ? e.message : String(e) });
  }
  return Promise.resolve();
}

export function clearState() {
  set({ loaded: true, me: null, db: null, public: state.public, error: null });
}
