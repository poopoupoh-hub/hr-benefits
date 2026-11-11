/**
 * Domain types — โครงสร้างข้อมูลหลักของระบบ
 * ไฟล์นี้เป็น "สัญญา" ระหว่าง UI กับ Backend: เมื่อเลือกฐานข้อมูลจริง ให้ทำ schema ตามนี้
 * (ดู docs/DATABASE.sql สำหรับ DDL ตัวอย่าง)
 */

export type Role = "employee" | "manager" | "hr" | "finance" | "admin";

/** ประเภทพนักงาน — ใช้กำหนดสิทธิ์สวัสดิการ */
export type EmploymentType = "permanent" | "probation" | "contract" | "terminated";

export type ISODate = string; // YYYY-MM-DD
export type ISODateTime = string; // ISO 8601

export interface Department {
  id: string;
  code: string;
  name: string;
}

export interface Position {
  id: string;
  name: string;
  departmentId: string;
}

export interface Delegation {
  /** ผู้อนุมัติสำรอง */
  employeeId: string;
  from: ISODate;
  to: ISODate;
}

export interface Employee {
  id: string;
  code: string; // EMP-0001
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  departmentId: string;
  positionId: string;
  managerId: string | null;
  employmentType: EmploymentType;
  startDate: ISODate;
  contractEndDate?: ISODate | null;
  role: Role;
  active: boolean;
  /** SHA-256 hex (เดโม) — Backend จริงควรใช้ bcrypt/argon2 ฝั่งเซิร์ฟเวอร์ */
  passwordHash: string;
  pinHash: string;
  delegation?: Delegation | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** โหมดของสวัสดิการ: พนักงานแจ้งยอดเอง หรือ HR กำหนดเงินช่วยเหลือ (เช่น งบภัยพิบัติ) */
export type BenefitMode = "claim" | "assigned";

export interface TypeLimit {
  annualLimit?: number | null;
  perClaimLimit?: number | null;
  maxTimesPerYear?: number | null;
}

export interface BenefitType {
  id: string;
  code: string;
  name: string;
  description?: string;
  mode: BenefitMode;
  /** วงเงินต่อคนต่อปี (null = ไม่จำกัด) */
  annualLimit: number | null;
  /** วงเงินต่อครั้ง (null = ไม่จำกัด) */
  perClaimLimit: number | null;
  /** จำนวนครั้งต่อปี (null = ไม่จำกัด) */
  maxTimesPerYear: number | null;
  eligibleTypes: EmploymentType[];
  /** วงเงินเฉพาะประเภทพนักงาน (ระดับพนักงาน) — ทับค่าทั่วไป */
  typeOverrides?: Partial<Record<EmploymentType, TypeLimit>>;
  requiredDocs: string[];
  /** อายุงานขั้นต่ำ (วัน) */
  minServiceDays?: number | null;
  /** ยื่นได้ภายในกี่วันนับจากวันที่ในใบเสร็จ */
  claimWindowDays?: number | null;
  /** ข้อมูลสุขภาพ — ซ่อนจากฝ่ายบัญชี (PDPA) */
  sensitive: boolean;
  active: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** งบประมาณรายปีระดับองค์กร ต่อประเภทสวัสดิการ */
export interface AnnualBudget {
  id: string;
  year: number; // ค.ศ.
  benefitTypeId: string;
  /** null = คำนวณอัตโนมัติ (จำนวนคนมีสิทธิ์ × วงเงิน) */
  amount: number | null;
}

/** รอบงบ เช่น งบภัยพิบัติ (สวัสดิการโหมด assigned) */
export interface FundRound {
  id: string;
  benefitTypeId: string;
  name: string;
  budget: number;
  openFrom: ISODate;
  openTo: ISODate;
  /** วงเงินช่วยเหลือสูงสุดต่อคนในรอบนี้ */
  maxPerPerson: number | null;
  status: "open" | "closed";
  createdAt: ISODateTime;
}

export type ClaimStatus =
  | "pending_hr" // รอ HR ตรวจ
  | "returned" // ส่งกลับแก้ไข
  | "pending_manager" // รอหัวหน้าอนุมัติ
  | "approved" // อนุมัติแล้ว รอจ่าย
  | "paid" // จ่ายแล้ว
  | "rejected" // ไม่อนุมัติ (คืนสิทธิ์)
  | "cancelled"; // ผู้ยื่นยกเลิก (คืนสิทธิ์)

export interface AttachmentMeta {
  id: string; // key ใน file store (แยกจากฐานข้อมูลหลัก)
  name: string;
  size: number;
  type: string;
  docType: string; // เช่น "ใบเสร็จ"
  uploadedAt: ISODateTime;
}

export type ClaimAction =
  | "submit"
  | "resubmit"
  | "hr_pass"
  | "hr_return"
  | "hr_reject"
  | "assign_amount"
  | "approve"
  | "reject"
  | "mark_paid"
  | "cancel"
  | "edit";

export interface ClaimEvent {
  at: ISODateTime;
  actorId: string;
  action: ClaimAction;
  note?: string;
  fromStatus?: ClaimStatus;
  toStatus?: ClaimStatus;
}

export interface Claim {
  id: string;
  no: string; // CLM-2569-0001
  employeeId: string;
  benefitTypeId: string;
  fundRoundId?: string | null;
  /** ยอดที่ขอ (โหมด assigned = 0 จนกว่า HR กำหนด) */
  amount: number;
  /** ยอดที่ HR กำหนด (โหมด assigned) */
  assignedAmount?: number | null;
  receiptDate: ISODate;
  note?: string;
  attachments: AttachmentMeta[];
  status: ClaimStatus;
  submittedAt: ISODateTime;
  /** ยื่นแทนโดย HR */
  filedById?: string | null;
  filedReason?: string | null;
  docsCompleteAt?: ISODateTime | null;
  approverId?: string | null;
  approvedAt?: ISODateTime | null;
  /** วันจ่ายเงินที่คำนวณ */
  payDate?: ISODate | null;
  paidAt?: ISODateTime | null;
  paidById?: string | null;
  paymentRef?: string | null;
  rejectReason?: string | null;
  returnReason?: string | null;
  history: ClaimEvent[];
}

export interface Holiday {
  date: ISODate;
  name: string;
}

export interface Settings {
  /** อนุมัติภายในวันที่ N → จ่ายสิ้นเดือนนั้น; หลังวันที่ N → สิ้นเดือนถัดไป */
  cutoffDay: number;
  holidays: Holiday[];
  orgBudgetMode: "warn" | "block";
  email: {
    enabled: boolean;
    provider: "mock" | "smtp" | "api";
    fromAddress: string;
    smtpHost?: string;
    financeInbox: string;
    hrInbox: string;
  };
  backup: {
    lastBackupAt?: ISODateTime | null;
    autoReminderDays: number;
  };
  auditRetentionDays: number;
  orgName: string;
}

export interface AuditLog {
  id: string;
  at: ISODateTime;
  actorId: string | null;
  actorRole: Role | null;
  action: string; // create | update | delete | approve | status_change | login | ...
  entity: "employee" | "benefit" | "claim" | "payment" | "settings" | "rbac" | "department" | "position" | "budget" | "fund" | "auth" | "system";
  entityId: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
}

export interface EmailMessage {
  id: string;
  at: ISODateTime;
  to: string[];
  subject: string;
  body: string;
  event: string;
  status: "sent" | "skipped";
}

export type Permission =
  | "self.claim"
  | "team.view"
  | "claim.approve"
  | "claim.review"
  | "claim.file_on_behalf"
  | "employee.view"
  | "employee.manage"
  | "org.manage"
  | "benefit.manage"
  | "budget.manage"
  | "payroll.settings"
  | "report.export"
  | "payment.view"
  | "payment.mark_paid"
  | "audit.view"
  | "user.manage"
  | "rbac.manage"
  | "system.manage";

export type RbacMatrix = Record<Role, Permission[]>;

export interface Database {
  version: number;
  departments: Department[];
  positions: Position[];
  employees: Employee[];
  benefitTypes: BenefitType[];
  budgets: AnnualBudget[];
  fundRounds: FundRound[];
  claims: Claim[];
  settings: Settings;
  rbac: RbacMatrix;
  auditLogs: AuditLog[];
  emails: EmailMessage[];
  counters: Record<string, number>;
}
