/**
 * ข้อมูลฝั่งหน้าจอ — สำเนาข้อมูลที่ผู้ใช้มีสิทธิ์เห็น (ตัดตามบทบาทโดยเซิร์ฟเวอร์แล้ว)
 * โหลดจาก GET /api/state และโหลดใหม่ทุกครั้งหลังทำรายการ / กลับมาที่หน้าต่าง
 */
import type { Database, Employee, Role } from "../domain/types";

export interface DemoAccount {
  code: string;
  name: string;
  role: Role;
  employmentType: Employee["employmentType"];
}

export interface AppState {
  loaded: boolean;
  me: Employee | null;
  db: Database | null;
  public: { orgName: string; demoAccounts: DemoAccount[] } | null;
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

let inflight: Promise<void> | null = null;

export function refresh(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store", credentials: "same-origin" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `โหลดข้อมูลไม่สำเร็จ (${res.status})`);
      set({ loaded: true, me: j.me ?? null, db: j.db ?? null, public: j.public ?? null, error: null });
    } catch (e) {
      set({ ...state, loaded: true, error: e instanceof Error ? e.message : String(e) });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function clearState() {
  set({ loaded: true, me: null, db: null, public: state.public, error: null });
}
