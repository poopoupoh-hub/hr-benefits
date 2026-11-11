/**
 * เรียก Backend จากหน้าจอ
 * api.<ชื่อคำสั่ง>(...) → POST /api/rpc — ผู้ทำรายการมาจาก session cookie (ไม่ต้องส่ง)
 */
import type { AttachmentMeta, AuditLog, EmailMessage } from "../domain/types";
import type { RpcMethods } from "../server/rpc";
import { clearState, refresh } from "./store";

type WithoutActor<F> = F extends (actorId: string, ...rest: infer A) => infer R ? (...args: A) => Promise<Awaited<R>> : never;
export type Api = { [K in keyof RpcMethods]: WithoutActor<RpcMethods[K]> };

const NO_REFRESH = new Set(["validateClaim", "exportBackup"]);

async function rpc(method: string, args: unknown[]) {
  const res = await fetch("/api/rpc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ method, args }),
  });
  const j = await res.json().catch(() => ({ ok: false, error: `เซิร์ฟเวอร์ตอบกลับผิดพลาด (${res.status})` }));
  if (res.status === 401) await refresh();
  if (!j.ok) {
    // บางคำสั่งบันทึกข้อมูลก่อนแจ้งผิดพลาด (เช่น PIN ผิด) จึงโหลดใหม่ด้วย
    if (!NO_REFRESH.has(method)) refresh();
    throw new Error(j.error ?? "เกิดข้อผิดพลาด");
  }
  if (!NO_REFRESH.has(method)) await refresh();
  return j.result;
}

export const api = new Proxy({} as Api, {
  get: (_t, name) => (typeof name === "string" && name !== "then" ? (...args: unknown[]) => rpc(name, args) : undefined),
});

async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.ok === false) throw new Error(j.error ?? `เกิดข้อผิดพลาด (${res.status})`);
  return j;
}

export async function login(code: string, password: string): Promise<{ role: string }> {
  const j = await post("/api/auth/login", { code, password });
  await refresh();
  return j;
}

export async function logout() {
  await post("/api/auth/logout").catch(() => undefined);
  clearState();
  await refresh();
}

export async function uploadFile(file: File, docType: string): Promise<AttachmentMeta> {
  const form = new FormData();
  form.append("file", file);
  form.append("docType", docType);
  const res = await fetch("/api/files", { method: "POST", body: form, credentials: "same-origin" });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.ok) throw new Error(j.error ?? "อัปโหลดไฟล์ไม่สำเร็จ");
  return j.file;
}

export async function fetchFile(id: string): Promise<Blob | null> {
  const res = await fetch(`/api/files/${encodeURIComponent(id)}`, { credentials: "same-origin" });
  if (res.status === 404) return null;
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error ?? "เปิดไฟล์ไม่สำเร็จ");
  }
  return res.blob();
}

export interface AuditQuery {
  entity?: string;
  entities?: string;
  entityId?: string;
  actor?: string;
  from?: string;
  to?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export async function fetchAudit(q: AuditQuery): Promise<{ total: number; items: AuditLog[]; full: boolean }> {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== "") sp.set(k, String(v));
  const res = await fetch(`/api/audit?${sp}`, { cache: "no-store", credentials: "same-origin" });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error ?? "โหลด Audit Log ไม่สำเร็จ");
  return j;
}

export async function fetchEmails(): Promise<EmailMessage[]> {
  const res = await fetch("/api/emails", { cache: "no-store", credentials: "same-origin" });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error ?? "โหลดอีเมลไม่สำเร็จ");
  return j.items;
}
