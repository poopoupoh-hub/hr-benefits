/** เวอร์ชันโครงสร้างข้อมูล (ใช้ตรวจไฟล์สำรอง) */
export const DB_VERSION = 3;

import type { ClaimStatus, EmploymentType, Permission, RbacMatrix, Role } from "./types";

export const ROLE_LABEL: Record<Role, string> = {
  employee: "พนักงาน",
  manager: "หัวหน้า (Manager)",
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

export const STATUS_LABEL: Record<ClaimStatus, string> = {
  pending_hr: "รอ HR ตรวจ",
  returned: "ส่งกลับแก้ไข",
  pending_manager: "รอหัวหน้าอนุมัติ",
  approved: "อนุมัติแล้ว รอจ่าย",
  paid: "จ่ายแล้ว",
  rejected: "ไม่อนุมัติ",
  cancelled: "ยกเลิก",
};

/** สถานะที่ "จอง" สิทธิ์อยู่ (นับรวมในยอดใช้) — rejected/cancelled = คืนสิทธิ์ */
export const RESERVING_STATUSES: ClaimStatus[] = ["pending_hr", "returned", "pending_manager", "approved", "paid"];
export const IN_PROGRESS_STATUSES: ClaimStatus[] = ["pending_hr", "returned", "pending_manager"];

export const PERMISSION_LABEL: Record<Permission, { label: string; group: string }> = {
  "self.claim": { label: "ดูสิทธิ์ตนเอง / ยื่นคำร้อง", group: "พนักงาน" },
  "team.view": { label: "ดูข้อมูลทีมในสายงาน", group: "หัวหน้า" },
  "claim.approve": { label: "อนุมัติ / ไม่อนุมัติคำขอ", group: "หัวหน้า" },
  "claim.review": { label: "ตรวจเอกสารและคุณสมบัติ", group: "HR" },
  "claim.file_on_behalf": { label: "ยื่นเบิกแทนพนักงาน", group: "HR" },
  "employee.view": { label: "ดูข้อมูลพนักงานทั้งหมด", group: "HR" },
  "employee.manage": { label: "เพิ่ม / แก้ไข / ปิดสถานะพนักงาน", group: "HR" },
  "org.manage": { label: "จัดการแผนก / ตำแหน่ง", group: "HR" },
  "benefit.manage": { label: "ตั้งค่าประเภทและวงเงินสวัสดิการ", group: "HR" },
  "budget.manage": { label: "งบประมาณรายปี / รอบงบ", group: "HR" },
  "payroll.settings": { label: "ตั้งวันตัดรอบ / วันหยุด", group: "HR" },
  "report.export": { label: "Export รายงาน", group: "รายงาน" },
  "payment.view": { label: "ดูรอบจ่ายเงิน", group: "บัญชี" },
  "payment.mark_paid": { label: "บันทึกสถานะจ่ายแล้ว", group: "บัญชี" },
  "audit.view": { label: "ดู Audit Log", group: "ตรวจสอบ" },
  "user.manage": { label: "สร้างบัญชีผู้ใช้ / กำหนด Role", group: "ผู้ดูแลระบบ" },
  "rbac.manage": { label: "กำหนดสิทธิ์ของแต่ละ Role", group: "ผู้ดูแลระบบ" },
  "system.manage": { label: "ตั้งค่าระบบ / อีเมล / สำรองข้อมูล", group: "ผู้ดูแลระบบ" },
};

export const ALL_PERMISSIONS = Object.keys(PERMISSION_LABEL) as Permission[];

export const DEFAULT_RBAC: RbacMatrix = {
  employee: ["self.claim"],
  manager: ["self.claim", "team.view", "claim.approve"],
  hr: [
    "self.claim",
    "claim.review",
    "claim.file_on_behalf",
    "employee.view",
    "employee.manage",
    "org.manage",
    "benefit.manage",
    "budget.manage",
    "payroll.settings",
    "report.export",
    "audit.view",
  ],
  finance: ["self.claim", "payment.view", "payment.mark_paid", "report.export", "audit.view"],
  admin: ["self.claim", "employee.view", "benefit.manage", "budget.manage", "audit.view", "user.manage", "rbac.manage", "system.manage"],
};

/**
 * สิทธิ์ที่ห้ามให้ Role ใดเด็ดขาด (Segregation of duties / Least privilege)
 * - Admin อนุมัติคำขอไม่ได้
 * - บัญชีห้ามเห็นข้อมูลพนักงานแบบเต็ม
 */
export const FORBIDDEN_PERMISSIONS: Partial<Record<Role, Permission[]>> = {
  admin: ["claim.approve", "claim.review", "payment.mark_paid"],
  finance: ["employee.view", "employee.manage", "claim.review", "claim.approve"],
  employee: ["rbac.manage", "user.manage", "system.manage"],
};

/** สิทธิ์ที่ต้องมีเสมอ เพื่อไม่ให้ระบบล็อกตัวเอง */
export const REQUIRED_PERMISSIONS: Partial<Record<Role, Permission[]>> = {
  admin: ["rbac.manage", "user.manage"],
};

export const DOC_TYPES = ["ใบเสร็จ", "ใบรับรองแพทย์", "สำเนาสูติบัตรบุตร", "ใบแจ้งความ / หนังสือรับรองภัยพิบัติ", "รูปถ่ายความเสียหาย", "อื่น ๆ"];

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const ACCEPTED_FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
