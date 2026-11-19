/**
 * สายอนุมัติ (อ่านอย่างเดียว ใช้ได้ทั้ง service และหน้าจอ)
 *
 * ผู้อนุมัติคำขอ = หัวหน้างานคนแรกในสายบังคับบัญชาของผู้ยื่น ที่
 *   - ยังทำงานอยู่ และมีสิทธิ์ "claim.approve"
 *   - ไม่ใช่ผู้ยื่นเอง และไม่ใช่ HR ผู้ตรวจเอกสารของคำขอนั้น (แยกผู้ตรวจกับผู้อนุมัติ)
 * ถ้าในสายบังคับบัญชาไม่มีใครเข้าเงื่อนไข (เช่น ผู้บริหารสูงสุด) → หัวหน้างานที่ตำแหน่งระดับสูงสุดคนอื่น
 * ถ้าผู้อนุมัติตั้ง "ผู้อนุมัติสำรอง" ไว้และอยู่ในช่วงวันที่ → ผู้อนุมัติสำรองอนุมัติแทนได้
 */
import { todayLocal } from "../domain/dates";
import type { Claim, Database, Employee } from "../domain/types";
import { can } from "./core";

export interface ApproverRoute {
  approver: Employee;
  /** supervisor = หัวหน้าโดยตรง · escalated = ข้ามขึ้นไป (หัวหน้าตรงไม่มีสิทธิ์/เป็นผู้ตรวจ) · fallback = หัวหน้างานระดับสูงสุดคนอื่น */
  route: "supervisor" | "escalated" | "fallback";
}

const byId = (db: Database, id: string | null | undefined) => (id ? db.employees.find((e) => e.id === id) : undefined);

function eligibleApprover(db: Database, e: Employee | undefined, skip: Set<string>): boolean {
  return !!e && e.active && !skip.has(e.id) && can(db, e, "claim.approve");
}

export function resolveApprover(db: Database, employeeId: string, verifierId?: string | null): ApproverRoute | null {
  const claimant = byId(db, employeeId);
  if (!claimant) return null;
  const skip = new Set([claimant.id, ...(verifierId ? [verifierId] : [])]);
  let cur = claimant.supervisorId;
  let hops = 0;
  const seen = new Set<string>();
  while (cur && !seen.has(cur) && hops < 50) {
    seen.add(cur);
    const e = byId(db, cur);
    if (e && eligibleApprover(db, e, skip)) return { approver: e, route: hops === 0 ? "supervisor" : "escalated" };
    cur = e?.supervisorId ?? null;
    hops++;
  }
  const level = (e: Employee) => db.positions.find((p) => p.id === e.positionId)?.level ?? 0;
  const head = db.employees.filter((e) => eligibleApprover(db, e, skip)).sort((a, b) => level(b) - level(a) || a.code.localeCompare(b.code))[0];
  return head ? { approver: head, route: "fallback" } : null;
}

/** ผู้อนุมัติของคำขอที่รอหัวหน้าอนุมัติ — ใช้ค่าที่บันทึกไว้ ถ้ายังใช้ได้; ไม่เช่นนั้นคำนวณใหม่ (เช่น หัวหน้าลาออก) */
export function effectiveApprover(db: Database, c: Pick<Claim, "employeeId" | "approverId" | "verifiedById">): Employee | null {
  const skip = new Set([c.employeeId, ...(c.verifiedById ? [c.verifiedById] : [])]);
  const stored = byId(db, c.approverId);
  if (stored && eligibleApprover(db, stored, skip)) return stored;
  return resolveApprover(db, c.employeeId, c.verifiedById)?.approver ?? null;
}

/** ผู้ที่ตั้งเป็นผู้อนุมัติสำรองได้: ทำงานอยู่ และมีสิทธิ์อนุมัติ (หัวหน้างานคนอื่น) */
export function canBeDelegate(db: Database, e: Employee | undefined): e is Employee {
  return !!e && e.active && can(db, e, "claim.approve");
}

/** ผู้อนุมัติสำรองที่มีผลวันนี้ */
export function activeDelegate(db: Database, approver: Employee | null | undefined, today = todayLocal()): Employee | null {
  const d = approver?.delegation;
  if (!d || d.from > today || d.to < today) return null;
  const e = byId(db, d.toId);
  return canBeDelegate(db, e) ? e : null;
}

export interface ApproveAuthority {
  ok: boolean;
  /** อนุมัติในฐานะผู้อนุมัติสำรองของใคร */
  onBehalfOf?: Employee;
  reason?: string;
}

/** ผู้ใช้คนนี้อนุมัติ/ไม่อนุมัติคำขอนี้ (ขั้นหัวหน้า) ได้หรือไม่ */
export function approveAuthority(db: Database, actor: Employee | null | undefined, c: Claim, today = todayLocal()): ApproveAuthority {
  if (!actor || !actor.active) return { ok: false, reason: "ไม่พบผู้ใช้" };
  if (c.status !== "pending_manager") return { ok: false, reason: "คำขอนี้ไม่ได้รอหัวหน้าอนุมัติ" };
  if (c.employeeId === actor.id) return { ok: false, reason: "ไม่สามารถอนุมัติคำขอของตนเองได้" };
  if (c.verifiedById === actor.id) return { ok: false, reason: "ผู้ตรวจเอกสารเป็นผู้อนุมัติคำขอเดียวกันไม่ได้" };
  const approver = effectiveApprover(db, c);
  if (!approver) return { ok: false, reason: "ไม่พบผู้อนุมัติของคำขอนี้ — กรุณาให้ HR กำหนดหัวหน้างาน" };
  if (approver.id === actor.id) return can(db, actor, "claim.approve") ? { ok: true } : { ok: false, reason: "คุณไม่มีสิทธิ์อนุมัติ" };
  const delegate = activeDelegate(db, approver, today);
  if (delegate?.id === actor.id) return { ok: true, onBehalfOf: approver };
  return { ok: false, reason: "คุณไม่ใช่ผู้อนุมัติของคำขอนี้" };
}

/** ลูกทีมทั้งหมดในสายบังคับบัญชา (ทางตรงและทางอ้อม) */
export function teamOf(db: Database, managerId: string): Employee[] {
  const out: Employee[] = [];
  const queue = [managerId];
  const seen = new Set(queue);
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of db.employees)
      if (e.supervisorId === id && !seen.has(e.id)) {
        seen.add(e.id);
        out.push(e);
        queue.push(e.id);
      }
  }
  return out;
}

/** คำขอที่รอผู้ใช้คนนี้อนุมัติ (รวมที่อนุมัติแทนในฐานะผู้อนุมัติสำรอง) */
export function approvalQueue(db: Database, actor: Employee, today = todayLocal()): Claim[] {
  return db.claims.filter((c) => c.status === "pending_manager" && approveAuthority(db, actor, c, today).ok).sort((a, b) => (a.verifiedAt ?? "").localeCompare(b.verifiedAt ?? ""));
}
