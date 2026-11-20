/** เวอร์ชันโครงสร้างข้อมูล (ใช้ตรวจไฟล์สำรอง) */
export const DB_VERSION = 6;

import type { ClaimStatus, EmploymentType, PaymentMethod, Permission, RbacMatrix, Role } from "./types";

export const ROLE_LABEL: Record<Role, string> = {
  employee: "พนักงาน",
  manager: "หัวหน้างาน (Manager)",
  hr: "HR",
  finance: "บัญชี / การเงิน",
  admin: "ผู้ดูแลระบบ (Admin)",
};

export const ROLE_ORDER: Role[] = ["employee", "manager", "hr", "finance", "admin"];

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  permanent: "ประจำ",
  probation: "ทดลองงาน",
  contract: "สัญญาจ้าง",
  terminated: "พ้นสภาพ",
};

export const EMPLOYMENT_TYPES: EmploymentType[] = ["permanent", "probation", "contract", "terminated"];

export const LEVELS = [1, 2, 3, 4] as const;
export const LEVEL_LABEL: Record<number, string> = { 1: "เจ้าหน้าที่", 2: "ผู้ช่วยผู้จัดการ", 3: "ผู้จัดการ", 4: "ผู้บริหาร" };

export const STATUS_LABEL: Record<ClaimStatus, string> = {
  pending_hr: "รอ HR ตรวจเอกสาร",
  pending_manager: "รอหัวหน้าอนุมัติ",
  returned: "ส่งกลับแก้ไข",
  rejected: "ไม่อนุมัติ",
  approved: "อนุมัติแล้ว รอจ่าย",
  paid: "จ่ายแล้ว",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "เงินสด",
  transfer: "โอนเงิน",
  cheque: "เช็ค",
};

/** สถานะที่ "ใช้สิทธิ์" อยู่ (นับรวมในยอดใช้) — rejected = คืนสิทธิ์ */
export const RESERVING_STATUSES: ClaimStatus[] = ["pending_hr", "pending_manager", "returned", "approved", "paid"];
export const IN_PROGRESS_STATUSES: ClaimStatus[] = ["pending_hr", "pending_manager", "returned"];


export const PERMISSION_LABEL: Record<Permission, { label: string; group: string }> = {
  "self.claim": { label: "ดูสิทธิ์ตนเอง / ยื่นคำร้อง", group: "พนักงาน" },
  "claim.review": { label: "ตรวจเอกสาร/คุณสมบัติ → ส่งหัวหน้าอนุมัติ / ส่งกลับ / ไม่อนุมัติ", group: "HR" },
  "claim.approve": { label: "อนุมัติ / ไม่อนุมัติคำขอของลูกทีม (ขั้นสุดท้าย)", group: "หัวหน้างาน" },
  "team.view": { label: "ดูข้อมูลและคำขอของลูกทีม", group: "หัวหน้างาน" },
  "change.request": { label: "ส่งคำขอแก้ผล / แก้วงเงิน", group: "HR" },
  "change.review": { label: "อนุมัติคำขอแก้ไขของ HR คนอื่น (Maker–Checker)", group: "HR" },
  "employee.view": { label: "ดูข้อมูลพนักงานทั้งหมด", group: "HR" },
  "employee.manage": { label: "เพิ่ม / แก้ไข / ปิดสถานะพนักงาน", group: "HR" },
  "org.manage": { label: "จัดการฝ่าย / ตำแหน่ง", group: "HR" },
  "benefit.manage": { label: "ตั้งค่าประเภทสวัสดิการ / วงเงิน / รอบงบ", group: "HR" },
  "payroll.settings": { label: "ตั้งวันตัดรอบ / วันหยุด", group: "HR" },
  "report.view": { label: "ดูรายงานยอดเบิก", group: "รายงาน" },
  "payment.view": { label: "ดูรายการรอจ่าย", group: "บัญชี" },
  "payment.record": { label: "บันทึกการจ่ายเงิน", group: "บัญชี" },
  "audit.view": { label: "ดู Audit Log", group: "ตรวจสอบ" },
  "user.manage": { label: "สร้างบัญชีผู้ใช้ / กำหนด Role", group: "ผู้ดูแลระบบ" },
  "rbac.manage": { label: "กำหนดสิทธิ์ของแต่ละ Role", group: "ผู้ดูแลระบบ" },
  "system.manage": { label: "ตั้งค่าระบบ / อีเมล / สำรองข้อมูล", group: "ผู้ดูแลระบบ" },
};

export const ALL_PERMISSIONS = Object.keys(PERMISSION_LABEL) as Permission[];

const HR_BASE: Permission[] = [
  "self.claim",
  "claim.review",
  "change.request",
  "employee.view",
  "employee.manage",
  "org.manage",
  "benefit.manage",
  "payroll.settings",
  "report.view",
  "change.review",
];

/** 5 บทบาท: พนักงาน / หัวหน้างาน / HR / บัญชี / ผู้ดูแลระบบ */
export const DEFAULT_RBAC: RbacMatrix = {
  employee: ["self.claim"],
  manager: ["self.claim", "team.view", "claim.approve"],
  hr: HR_BASE,
  finance: ["self.claim", "payment.view", "payment.record", "report.view"],
  admin: ["self.claim", "audit.view", "user.manage", "rbac.manage", "system.manage"],
};

/**
 * สิทธิ์ที่ห้ามให้ Role ใดเด็ดขาด (Segregation of duties / Least privilege)
 * - Admin อนุมัติคำขอ/จ่ายเงินไม่ได้
 * - HR ตรวจเอกสารได้ แต่ไม่ใช่ผู้อนุมัติขั้นสุดท้าย (แยกผู้ตรวจกับผู้อนุมัติ)
 * - หัวหน้างานอนุมัติได้ แต่ไม่ตรวจเอกสารแทน HR และไม่เห็นข้อมูลพนักงานนอกทีม
 * - บัญชีห้ามเห็นข้อมูลพนักงานแบบเต็ม และห้ามอนุมัติ
 * - Audit Log ดูได้เฉพาะผู้ดูแลระบบ
 */
export const FORBIDDEN_PERMISSIONS: Partial<Record<Role, Permission[]>> = {
  admin: ["claim.review", "claim.approve", "change.review", "payment.record"],
  finance: ["employee.view", "employee.manage", "claim.review", "claim.approve", "change.review", "audit.view"],
  manager: ["claim.review", "employee.view", "employee.manage", "change.review", "audit.view", "payment.record", "rbac.manage", "user.manage", "system.manage"],
  hr: ["claim.approve", "audit.view", "payment.record"],
  employee: ["rbac.manage", "user.manage", "system.manage", "audit.view"],
};

/** สิทธิ์ที่ต้องมีเสมอ เพื่อไม่ให้ระบบล็อกตัวเอง */
export const REQUIRED_PERMISSIONS: Partial<Record<Role, Permission[]>> = {
  admin: ["rbac.manage", "user.manage", "audit.view"],
};

export const DOC_TYPES = ["ใบเสร็จ", "ใบรับรองแพทย์", "สำเนาสูติบัตรบุตร", "ใบแจ้งความ / หนังสือรับรองภัยพิบัติ", "รูปถ่ายความเสียหาย", "อื่น ๆ"];

export const BENEFIT_CATEGORIES = ["สุขภาพ", "ครอบครัว", "การศึกษา", "ช่วยเหลือ", "อื่น ๆ"];

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const ACCEPTED_FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export type ClaimFilterKey = "all" | "active" | "approved" | "paid" | "rejected";

/** การ์ดสถานะบน Dashboard พนักงาน — ใช้ชุดเดียวกับหน้ารายการ ตัวเลขบนการ์ดจึงตรงกับรายการเสมอ */
export const CLAIM_FILTERS: { key: ClaimFilterKey; label: string; statuses: ClaimStatus[] }[] = [
  { key: "all", label: "ยื่นทั้งหมด", statuses: ["pending_hr", "pending_manager", "returned", "approved", "paid", "rejected"] },
  { key: "active", label: "กำลังดำเนินการ", statuses: ["pending_hr", "pending_manager", "returned"] },
  { key: "approved", label: "รอจ่าย", statuses: ["approved"] },
  { key: "paid", label: "จ่ายแล้ว", statuses: ["paid"] },
  { key: "rejected", label: "ไม่อนุมัติ", statuses: ["rejected"] },
];
