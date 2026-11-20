/**
 * เรียก service จากหน้าจอ — ทำงานในเบราว์เซอร์ทั้งหมด ข้อมูลเก็บใน localStorage (ไม่มี Backend/ฐานข้อมูล)
 * api.<ชื่อคำสั่ง>(...) → RPC_METHODS[ชื่อ](ผู้ใช้จาก session, ...) — หน้าจอส่งผู้ทำรายการเองไม่ได้
 * ทุกคำสั่งคืน Promise เหมือนเดิม เมื่อย้ายไปมี Backend จริง แก้เฉพาะไฟล์นี้ หน้าจอไม่ต้องเปลี่ยน
 */
import { getDB } from "../data/db";
import { readStoredFile, saveUpload, verifyAttachments, clearFiles } from "../data/files";
import { scopeDatabase } from "../data/scope";
import { clearSession, createSession, sessionUser } from "../data/session";
import type { AttachmentMeta, AuditLog, EmailMessage, Employee } from "../domain/types";
import * as auth from "../services/auth";
import { can } from "../services/core";
import { ATTACHMENT_ARG, READ_ONLY, RPC_METHODS, type RpcMethods, type RpcName } from "./rpc";
import { clearState, refresh } from "./store";

type WithoutActor<F> = F extends (actorId: string, ...rest: infer A) => infer R ? (...args: A) => Promise<Awaited<R>> : never;
export type Api = { [K in keyof RpcMethods]: WithoutActor<RpcMethods[K]> };

function requireMe(): Employee {
  const me = sessionUser(getDB().employees);
  if (!me) {
    refresh();
    throw new Error("หมดเวลาการใช้งาน กรุณาเข้าสู่ระบบใหม่");
  }
  return me;
}

async function rpc(method: RpcName, args: unknown[]) {
  const me = requireMe();
  const a = [...args];
  // ไฟล์แนบ: ตรวจความเป็นเจ้าของ และใช้ metadata จากที่เก็บไฟล์
  const ai = ATTACHMENT_ARG[method];
  if (ai !== undefined && a[ai] && typeof a[ai] === "object") {
    const input = { ...(a[ai] as { attachments?: AttachmentMeta[] }) };
    const existing = method === "updateClaim" ? (getDB().claims.find((c) => c.id === a[0])?.attachments ?? []) : [];
    input.attachments = await verifyAttachments(me.id, input.attachments ?? [], existing);
    a[ai] = input;
  }
  const fn = RPC_METHODS[method] as (...x: unknown[]) => unknown;
  try {
    const result = fn(me.id, ...a);
    // เปลี่ยนรหัสผ่านตัวเอง → ออก session ใหม่ (session เดิมในแท็บอื่นจะใช้ไม่ได้)
    if (method === "changeOwnPassword" || (method === "resetPassword" && a[0] === me.id)) {
      const fresh = getDB().employees.find((e) => e.id === me.id);
      if (fresh) createSession(fresh);
    }
    if (method === "resetDemo" || method === "restoreBackup") {
      if (method === "resetDemo") await clearFiles().catch(() => undefined);
      const fresh = getDB().employees.find((e) => e.id === me.id);
      if (fresh?.active) createSession(fresh);
    }
    return result ?? null;
  } finally {
    if (!READ_ONLY.has(method)) await refresh();
  }
}

export const api = new Proxy({} as Api, {
  get: (_t, name) => (typeof name === "string" && Object.hasOwn(RPC_METHODS, name) ? (...args: unknown[]) => rpc(name as RpcName, args) : undefined),
});

/** เข้าสู่ระบบ — role อ่านจากข้อมูลพนักงาน ผู้ใช้ไม่ต้องเลือกเอง */
export async function login(code: string, password: string): Promise<{ role: string }> {
  if (typeof code !== "string" || typeof password !== "string" || !code.trim() || !password) throw new Error("กรุณากรอกรหัสพนักงาน/อีเมล และรหัสผ่าน");
  try {
    const emp = auth.login(code, password);
    createSession(emp);
    return { role: emp.role };
  } finally {
    await refresh();
  }
}

export async function logout() {
  clearSession();
  clearState();
  await refresh();
}

export async function uploadFile(file: File, docType: string): Promise<AttachmentMeta> {
  const me = requireMe();
  return saveUpload(file, me.id, docType);
}

/** เปิดไฟล์แนบ — เฉพาะผู้อัปโหลด หรือผู้ที่มีสิทธิ์เห็นคำขอฉบับเต็ม (บัญชีไม่เห็นเอกสาร) */
export async function fetchFile(id: string): Promise<Blob | null> {
  const me = requireMe();
  const stored = await readStoredFile(id);
  const visible = scopeDatabase(getDB(), me).claims.some((c) => c.attachments.some((a) => a.id === id));
  if (!visible && stored?.uploaderId !== me.id) {
    if (!stored && !getDB().claims.some((c) => c.attachments.some((a) => a.id === id))) return null;
    throw new Error("ไม่พบไฟล์ หรือคุณไม่มีสิทธิ์ดูไฟล์นี้");
  }
  return stored?.blob ?? null;
}

export interface AuditQuery {
  entity?: string;
  action?: string;
  entities?: string;
  entityId?: string;
  actor?: string;
  from?: string;
  to?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

/** ค้นหา Audit Log — เฉพาะผู้ดูแลระบบ (audit.view) อ่านอย่างเดียว */
export async function fetchAudit(q: AuditQuery): Promise<{ total: number; items: AuditLog[]; full: boolean; actions?: string[] }> {
  const me = requireMe();
  const db = getDB();
  if (!can(db, me, "audit.view")) throw new Error("คุณไม่มีสิทธิ์ดู Audit Log");
  const entities = q.entities ? new Set(q.entities.split(",")) : null;
  const from = q.from ? new Date(`${q.from}T00:00:00`).getTime() : null;
  const to = q.to ? new Date(`${q.to}T23:59:59.999`).getTime() : null;
  const s = q.q?.trim().toLowerCase();
  const rows = db.auditLogs
    .filter((l) => {
      if (q.entity && l.entity !== q.entity) return false;
      if (q.entityId && l.entityId !== q.entityId) return false;
      if (entities && !entities.has(l.entity)) return false;
      if (q.actor && l.actorId !== q.actor) return false;
      if (q.action && l.action !== q.action) return false;
      const t = new Date(l.at).getTime();
      if (from !== null && t < from) return false;
      if (to !== null && t > to) return false;
      if (s && !`${l.summary} ${l.action}`.toLowerCase().includes(s)) return false;
      return true;
    })
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const limit = Math.min(500, Math.max(1, Number(q.limit) || 100));
  const offset = Math.max(0, Number(q.offset) || 0);
  return { total: rows.length, items: rows.slice(offset, offset + limit), full: true, actions: [...new Set(db.auditLogs.map((l) => l.action))].sort() };
}

export async function fetchEmails(): Promise<EmailMessage[]> {
  const me = requireMe();
  const db = getDB();
  if (!can(db, me, "system.manage")) throw new Error("คุณไม่มีสิทธิ์ดูอีเมลของระบบ");
  return db.emails.slice(0, 300);
}
