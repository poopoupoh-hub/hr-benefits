"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { Database, Permission } from "./domain/types";
import { getServerState, getState, subscribe } from "./client/store";
import { can } from "./services/core";

export function useAppState() {
  return useSyncExternalStore(subscribe, getState, getServerState);
}

/** ข้อมูลที่ผู้ใช้มีสิทธิ์เห็น — null เมื่อยังไม่ได้เข้าสู่ระบบ */
export function useDBOrNull(): Database | null {
  return useAppState().db;
}

export function useDB(): Database {
  const db = useDBOrNull();
  if (!db) throw new Error("useDB ต้องใช้หลังเข้าสู่ระบบ");
  return db;
}

/** undefined = กำลังโหลด, null = ยังไม่ได้เข้าสู่ระบบ */
export function useSessionUserId(): string | null | undefined {
  const s = useAppState();
  return s.loaded ? (s.me?.id ?? null) : undefined;
}

export function useMe() {
  return useAppState().me;
}

export function useCan() {
  const s = useAppState();
  return useCallback((p: Permission) => !!s.db && can(s.db, s.me, p), [s.db, s.me]);
}

/** โหลดข้อมูลแบบ async พร้อมสถานะ (ใช้กับ Audit Log / อีเมล) */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    fn()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e) => alive && setState({ data: null, error: e instanceof Error ? e.message : String(e), loading: false }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}
