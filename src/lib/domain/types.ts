/**
 * Domain types — โครงสร้างข้อมูลหลักของระบบ (type กลาง ใช้ร่วมกันทั้ง UI / service / ฐานข้อมูล)
 */

export type Role = "employee" | "hr" | "hr_head" | "finance" | "admin";

/** ประเภทพนักงาน — ใช้กำหนดสิทธิ์สวัสดิการ */
export type EmploymentType = "permanent" | "probation" | "contract" | "terminated";

export type ISODate = string; // YYYY-MM-DD
export type ISODateTime = string; // ISO 8601

export interface Department {
  id: string;
  code: string;
  name: string;
}

/** ตำแหน่ง/ระดับ — แยกจากฝ่าย; level ใช้กำหนดวงเงินสวัสดิการ */
export interface Position {
  id: string;
  name: string;
  /** 1 เจ้าหน้าที่, 2 ผู้ช่วยผู้จัดการ, 3 ผู้จัดการ, 4 ผู้บริหาร */
  level: number;
}

export interface Employee {
  id: string;
  code: string; // EMP-0001 (ใช้เป็น username)
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  departmentId: string;
  positionId: string;
  supervisorId: string | null;
  employmentType: EmploymentType;
  startDate: ISODate;
  contractEndDate?: ISODate | null;
  role: Role;
  active: boolean;
  /** PBKDF2 hash */
  passwordHash: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** โหมดของสวัสดิการ: พนักงานแจ้งยอดเอง หรือ HR กำหนดเงินช่วยเหลือ (เช่น งบภัยพิบัติ) */
export type BenefitMode = "claim" | "assigned";

export interface BenefitType {
  id: string;
  code: string;
  name: string;
  /** หมวด ใช้จัดกลุ่มใน Dropdown เช่น สุขภาพ / ครอบครัว / ช่วยเหลือ */
  category: string;
  description?: string;
  mode: BenefitMode;
  eligibleTypes: EmploymentType[];
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

/** วงเงินตามระดับตำแหน่ง — เพิ่มแถวใหม่เมื่อเปลี่ยน ไม่แก้ทับแถวเดิม */
export interface BenefitLimit {
  id: string;
  benefitId: string;
  minLevel: number;
  maxLevel: number;
  perClaim?: number | null;
  perYear?: number | null;
  maxCount?: number | null;
  effectiveFrom: ISODate;
  createdAt: ISODateTime;
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
  | "rejected" // ไม่อนุมัติ (คืนสิทธิ์)
  | "approved" // อนุมัติแล้ว รอจ่าย
  | "paid"; // จ่ายแล้ว

export interface AttachmentMeta {
  id: string; // key ใน file store (แยกจากฐานข้อมูลหลัก)
  name: string;
  size: number;
  type: string;
  docType: string; // เช่น "ใบเสร็จ"
  uploadedAt: ISODateTime;
}

export type ClaimAction = "submit" | "resubmit" | "edit" | "approve" | "reject" | "return" | "mark_paid" | "change_result";

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
  /** เลขที่ใบเสร็จ */
  receiptNo: string;
  /** ร้าน / บริษัท / โรงพยาบาล */
  vendorName: string;
  /** ยอดตามใบเสร็จ (โหมด assigned = 0) */
  amountRequested: number;
  /** ยอดที่เบิกได้จริงหลังตัดตามวงเงิน (โหมด assigned = ยอดที่ HR กำหนดตอนอนุมัติ) */
  amountApproved: number;
  receiptDate: ISODate;
  note?: string;
  attachments: AttachmentMeta[];
  status: ClaimStatus;
  submittedAt: ISODateTime;
  /** ผู้พิจารณา (อนุมัติ / ไม่อนุมัติ) และเวลา */
  decidedById?: string | null;
  decidedAt?: ISODateTime | null;
  /** วันจ่ายเงินที่คำนวณ */
  payDate?: ISODate | null;
  rejectReason?: string | null;
  returnReason?: string | null;
  history: ClaimEvent[];
}

export type PaymentMethod = "cash" | "transfer" | "cheque";

/** บันทึกการจ่ายเงินรายคำขอ */
export interface Payment {
  claimId: string;
  method: PaymentMethod;
  paidAt: ISODate;
  transferRef?: string | null;
  chequeNo?: string | null;
  chequeDate?: ISODate | null;
  recordedBy: string;
  recordedAt: ISODateTime;
  note?: string | null;
}

export type ChangeRequestKind = "claim_status" | "benefit_limit";
export type ChangeRequestStatus = "pending" | "approved" | "rejected";

/** คำขอแก้ไข (Maker–Checker): HR ขอ → หัวหน้า HR อนุมัติจึงมีผล */
export interface ChangeRequest {
  id: string;
  kind: ChangeRequestKind;
  /** claimId หรือ benefitId */
  targetId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  reason: string;
  requestedBy: string;
  requestedAt: ISODateTime;
  status: ChangeRequestStatus;
  reviewedBy?: string | null;
  reviewedAt?: ISODateTime | null;
  reviewNote?: string | null;
  selfApproved?: boolean;
}

export interface Holiday {
  date: ISODate;
  name: string;
}

export interface Settings {
  /** อนุมัติภายในวันที่ N → จ่ายสิ้นเดือนนั้น; หลังวันที่ N → สิ้นเดือนถัดไป */
  cutoffDay: number;
  holidays: Holiday[];
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

/** Audit Log — เพิ่มได้อย่างเดียว เก็บ before/after เฉพาะฟิลด์ที่เปลี่ยน */
export interface AuditLog {
  id: string;
  at: ISODateTime;
  actorId: string | null;
  actorRole: Role | null;
  action: string;
  entity:
    | "employee"
    | "benefit"
    | "benefit_limit"
    | "claim"
    | "payment"
    | "change_request"
    | "settings"
    | "rbac"
    | "department"
    | "position"
    | "fund"
    | "auth"
    | "system";
  entityId: string | null;
  /** คำอธิบาย/หมายเหตุ */
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
  | "claim.review"
  | "change.request"
  | "change.review"
  | "employee.view"
  | "employee.manage"
  | "org.manage"
  | "benefit.manage"
  | "payroll.settings"
  | "report.view"
  | "payment.view"
  | "payment.record"
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
  benefitLimits: BenefitLimit[];
  fundRounds: FundRound[];
  claims: Claim[];
  payments: Payment[];
  changeRequests: ChangeRequest[];
  settings: Settings;
  rbac: RbacMatrix;
  auditLogs: AuditLog[];
  emails: EmailMessage[];
  counters: Record<string, number>;
}
