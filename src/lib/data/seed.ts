/**
 * ข้อมูลตั้งต้น (Mock data) — ใช้เมื่อเปิดระบบครั้งแรก หรือกด "รีเซ็ตข้อมูลเดโม"
 * รหัสผ่านทุกบัญชี: 1234 (username = รหัสพนักงาน เช่น EMP-0001)
 */
import { DEFAULT_RBAC, STATUS_LABEL } from "../domain/constants";
import { computePayDate } from "../domain/rules";
import type { AttachmentMeta, AuditLog, BenefitLimit, BenefitType, Claim, ClaimEvent, Database, Employee, Payment, Settings } from "../domain/types";
import { hashSecret } from "../security/hash";

export { DB_VERSION } from "../domain/constants";
import { DB_VERSION } from "../domain/constants";

const T0 = "2026-01-05T09:00:00+07:00";
const pw = hashSecret("1234");

function emp(
  id: string,
  code: string,
  firstName: string,
  lastName: string,
  departmentId: string,
  positionId: string,
  supervisorId: string | null,
  employmentType: Employee["employmentType"],
  startDate: string,
  role: Employee["role"],
  extra: Partial<Employee> = {},
): Employee {
  return {
    id,
    code,
    firstName,
    lastName,
    email: `${code.toLowerCase()}@company.example`,
    phone: "08" + code.replace(/\D/g, "").padStart(8, "1"),
    departmentId,
    positionId,
    supervisorId,
    employmentType,
    startDate,
    contractEndDate: null,
    role,
    active: true,
    passwordHash: pw,
    createdAt: T0,
    updatedAt: T0,
    ...extra,
  };
}

export const SEED_SETTINGS: Settings = {
  cutoffDay: 5,
  holidays: [
    { date: "2026-01-01", name: "วันขึ้นปีใหม่" },
    { date: "2026-03-03", name: "วันมาฆบูชา" },
    { date: "2026-04-06", name: "วันจักรี" },
    { date: "2026-04-13", name: "วันสงกรานต์" },
    { date: "2026-04-14", name: "วันสงกรานต์" },
    { date: "2026-04-15", name: "วันสงกรานต์" },
    { date: "2026-05-01", name: "วันแรงงานแห่งชาติ" },
    { date: "2026-05-04", name: "วันฉัตรมงคล" },
    { date: "2026-06-03", name: "วันเฉลิมพระชนมพรรษาพระราชินี" },
    { date: "2026-07-28", name: "วันเฉลิมพระชนมพรรษา ร.10" },
    { date: "2026-08-12", name: "วันแม่แห่งชาติ" },
    { date: "2026-10-13", name: "วันนวมินทรมหาราช" },
    { date: "2026-10-23", name: "วันปิยมหาราช" },
    { date: "2026-12-07", name: "ชดเชยวันพ่อแห่งชาติ" },
    { date: "2026-12-10", name: "วันรัฐธรรมนูญ" },
    { date: "2026-12-31", name: "วันสิ้นปี" },
    { date: "2027-01-01", name: "วันขึ้นปีใหม่" },
  ],
  email: {
    enabled: true,
    provider: "mock",
    fromAddress: "hr-benefits@company.example",
    smtpHost: "",
    financeInbox: "finance@company.example",
    hrInbox: "hr@company.example",
  },
  backup: { lastBackupAt: null, autoReminderDays: 7 },
  auditRetentionDays: 1825,
  orgName: "บริษัท จัดการข้อมูลพนักงานและสวัสดิการ จำกัด",
};

const benefit = (b: Omit<BenefitType, "createdAt" | "updatedAt" | "active">): BenefitType => ({ ...b, active: true, createdAt: T0, updatedAt: T0 });

const benefits: BenefitType[] = [
  benefit({
    id: "b-med",
    code: "MED",
    name: "ค่ารักษาพยาบาล",
    category: "สุขภาพ",
    description: "ค่ารักษาพยาบาลผู้ป่วยนอก/ใน ที่ประกันกลุ่มไม่ครอบคลุม",
    mode: "claim",
    eligibleTypes: ["permanent", "contract"],
    requiredDocs: ["ใบเสร็จ", "ใบรับรองแพทย์"],
    minServiceDays: null,
    claimWindowDays: 90,
    sensitive: true,
  }),
  benefit({
    id: "b-opd",
    code: "OPD",
    name: "ประกันส่วนเกิน",
    category: "สุขภาพ",
    description: "ส่วนเกินจากวงเงินประกันกลุ่ม OPD",
    mode: "claim",
    eligibleTypes: ["permanent"],
    requiredDocs: ["ใบเสร็จ"],
    minServiceDays: null,
    claimWindowDays: 60,
    sensitive: true,
  }),
  benefit({
    id: "b-den",
    code: "DEN",
    name: "ค่าทันตกรรม",
    category: "สุขภาพ",
    description: "ขูดหินปูน อุดฟัน ถอนฟัน",
    mode: "claim",
    eligibleTypes: ["permanent", "contract"],
    requiredDocs: ["ใบเสร็จ"],
    minServiceDays: null,
    claimWindowDays: 90,
    sensitive: true,
  }),
  benefit({
    id: "b-edu",
    code: "EDU",
    name: "ค่าเล่าเรียนบุตร",
    category: "การศึกษา",
    description: "ค่าเล่าเรียนบุตรตามใบเสร็จสถานศึกษา",
    mode: "claim",
    eligibleTypes: ["permanent"],
    requiredDocs: ["ใบเสร็จ", "สำเนาสูติบัตรบุตร"],
    minServiceDays: 365,
    claimWindowDays: null,
    sensitive: false,
  }),
  benefit({
    id: "b-dis",
    code: "DIS",
    name: "เงินช่วยเหลือภัยพิบัติ",
    category: "ช่วยเหลือ",
    description: "HR เปิดรอบงบเมื่อเกิดภัยพิบัติ และกำหนดเงินช่วยเหลือตามความเสียหาย",
    mode: "assigned",
    eligibleTypes: ["permanent", "probation", "contract"],
    requiredDocs: ["ใบแจ้งความ / หนังสือรับรองภัยพิบัติ", "รูปถ่ายความเสียหาย"],
    minServiceDays: null,
    claimWindowDays: null,
    sensitive: false,
  }),
];

/** วงเงินตามระดับตำแหน่ง (ตัวอย่าง — ต้องยืนยันกับนโยบายจริง) */
const limit = (id: string, benefitId: string, minLevel: number, maxLevel: number, l: Pick<BenefitLimit, "perClaim" | "perYear" | "maxCount">): BenefitLimit => ({
  id,
  benefitId,
  minLevel,
  maxLevel,
  perClaim: l.perClaim ?? null,
  perYear: l.perYear ?? null,
  maxCount: l.maxCount ?? null,
  effectiveFrom: "2026-01-01",
  createdAt: T0,
});

const benefitLimits: BenefitLimit[] = [
  limit("lim-med-1", "b-med", 1, 2, { perYear: 20000 }),
  limit("lim-med-3", "b-med", 3, 3, { perYear: 40000 }),
  limit("lim-med-4", "b-med", 4, 4, { perYear: 80000 }),
  limit("lim-opd-1", "b-opd", 1, 3, { perClaim: 1000, maxCount: 30 }),
  limit("lim-opd-4", "b-opd", 4, 4, { perClaim: 2000, maxCount: 30 }),
  limit("lim-den-1", "b-den", 1, 2, { perYear: 3000 }),
  limit("lim-den-3", "b-den", 3, 4, { perYear: 6000 }),
  limit("lim-edu-1", "b-edu", 1, 4, { perYear: 10000 }),
  limit("lim-dis-1", "b-dis", 1, 4, { maxCount: 1 }),
];

function att(id: string, name: string, docType: string, at: string): AttachmentMeta {
  return { id, name, size: 184_000, type: name.endsWith(".pdf") ? "application/pdf" : "image/jpeg", docType, uploadedAt: at };
}

function ev(at: string, actorId: string, action: ClaimEvent["action"], fromStatus?: Claim["status"], toStatus?: Claim["status"], note?: string): ClaimEvent {
  return { at, actorId, action, fromStatus, toStatus, note };
}

export function createSeed(): Database {
  const employees: Employee[] = [
    emp("e-0040", "EMP-0040", "ประเสริฐ", "มั่นคง", "d-mgt", "p-l4", null, "permanent", "2015-04-01", "employee"),
    emp("e-0020", "EMP-0020", "ธนา", "หัวหน้า", "d-it", "p-l3", "e-0040", "permanent", "2018-06-01", "employee"),
    emp("e-0001", "EMP-0001", "สมชาย", "ใจดี", "d-it", "p-l1", "e-0020", "permanent", "2022-03-01", "employee"),
    emp("e-0002", "EMP-0002", "สุดา", "รักงาน", "d-it", "p-l1", "e-0020", "probation", "2026-08-15", "employee"),
    emp("e-0003", "EMP-0003", "ปิติ", "ขยัน", "d-it", "p-l1", "e-0020", "contract", "2025-04-01", "employee", { contractEndDate: "2027-03-31" }),
    emp("e-0004", "EMP-0004", "มานี", "มีสุข", "d-it", "p-l2", "e-0020", "permanent", "2020-11-16", "employee"),
    emp("e-0011", "EMP-0011", "ประภา", "หัวหน้าบุคคล", "d-hr", "p-l3", "e-0040", "permanent", "2016-02-01", "hr_head"),
    emp("e-0010", "EMP-0010", "วิภา", "บุคคล", "d-hr", "p-l1", "e-0011", "permanent", "2019-01-07", "hr"),
    emp("e-0030", "EMP-0030", "กมล", "บัญชี", "d-fin", "p-l1", "e-0040", "permanent", "2021-02-01", "finance"),
    emp("e-0050", "EMP-0050", "ศิริ", "ผู้ดูแล", "d-it", "p-l2", "e-0020", "permanent", "2020-05-11", "admin"),
    emp("e-0005", "EMP-0005", "วีระ", "เคยอยู่", "d-it", "p-l1", "e-0020", "terminated", "2021-07-01", "employee", { active: false }),
  ];

  const S = SEED_SETTINGS;
  const claim = (c: Omit<Claim, "amountApproved"> & { amountApproved?: number }): Claim => ({ amountApproved: c.amountRequested, ...c });
  const claims: Claim[] = [
    claim({
      id: "c-0001",
      no: "CLM-2569-0001",
      employeeId: "e-0001",
      benefitTypeId: "b-med",
      receiptNo: "RC-55012",
      vendorName: "โรงพยาบาลกรุงเทพ",
      amountRequested: 2500,
      receiptDate: "2026-08-31",
      note: "ตรวจรักษาไข้หวัด",
      attachments: [
        att("seed-a1", "receipt_hospital.pdf", "ใบเสร็จ", "2026-09-01T09:00:00+07:00"),
        att("seed-a2", "medical_cert.pdf", "ใบรับรองแพทย์", "2026-09-01T09:00:00+07:00"),
      ],
      status: "paid",
      submittedAt: "2026-09-01T09:00:00+07:00",
      decidedById: "e-0010",
      decidedAt: "2026-09-02T11:00:00+07:00",
      payDate: computePayDate("2026-09-02", S),
      history: [
        ev("2026-09-01T09:00:00+07:00", "e-0001", "submit", undefined, "pending_hr"),
        ev("2026-09-02T11:00:00+07:00", "e-0010", "approve", "pending_hr", "approved", "เอกสารครบ"),
        ev("2026-09-30T15:00:00+07:00", "e-0030", "mark_paid", "approved", "paid", "โอนเงิน · PAY-2569-09-001"),
      ],
    }),
    claim({
      id: "c-0002",
      no: "CLM-2569-0002",
      employeeId: "e-0001",
      benefitTypeId: "b-opd",
      receiptNo: "INV-2210",
      vendorName: "คลินิกเวชกรรมสุขใจ",
      amountRequested: 800,
      receiptDate: "2026-10-21",
      attachments: [att("seed-a3", "receipt_opd.jpg", "ใบเสร็จ", "2026-10-21T10:10:00+07:00")],
      status: "pending_hr",
      submittedAt: "2026-10-21T10:10:00+07:00",
      history: [ev("2026-10-21T10:10:00+07:00", "e-0001", "submit", undefined, "pending_hr")],
    }),
    claim({
      id: "c-0003",
      no: "CLM-2569-0003",
      employeeId: "e-0004",
      benefitTypeId: "b-den",
      receiptNo: "DT-0098",
      vendorName: "คลินิกทันตกรรมยิ้มสวย",
      amountRequested: 1200,
      receiptDate: "2026-10-28",
      attachments: [att("seed-a4", "dental_receipt.jpg", "ใบเสร็จ", "2026-10-28T13:00:00+07:00")],
      status: "approved",
      submittedAt: "2026-10-28T13:00:00+07:00",
      decidedById: "e-0010",
      decidedAt: "2026-11-02T09:15:00+07:00",
      payDate: computePayDate("2026-11-02", S),
      history: [
        ev("2026-10-28T13:00:00+07:00", "e-0004", "submit", undefined, "pending_hr"),
        ev("2026-11-02T09:15:00+07:00", "e-0010", "approve", "pending_hr", "approved", "เอกสารครบ"),
      ],
    }),
    claim({
      id: "c-0004",
      no: "CLM-2569-0004",
      employeeId: "e-0001",
      benefitTypeId: "b-opd",
      receiptNo: "INV-2287",
      vendorName: "คลินิกเวชกรรมสุขใจ",
      amountRequested: 1500,
      amountApproved: 1000,
      receiptDate: "2026-10-29",
      attachments: [att("seed-a5", "receipt.jpg", "ใบเสร็จ", "2026-10-29T14:25:00+07:00")],
      status: "pending_hr",
      submittedAt: "2026-10-29T14:25:00+07:00",
      history: [ev("2026-10-29T14:25:00+07:00", "e-0001", "submit", undefined, "pending_hr", "ยอดถูกตัด: เกินวงเงินต่อครั้ง")],
    }),
    claim({
      id: "c-0005",
      no: "CLM-2569-0005",
      employeeId: "e-0003",
      benefitTypeId: "b-med",
      receiptNo: "RC-77120",
      vendorName: "โรงพยาบาลรามา",
      amountRequested: 1800,
      receiptDate: "2026-10-18",
      attachments: [
        att("seed-a6", "receipt_clinic.jpg", "ใบเสร็จ", "2026-10-19T08:40:00+07:00"),
        att("seed-a7", "cert_blur.jpg", "ใบรับรองแพทย์", "2026-10-19T08:40:00+07:00"),
      ],
      status: "returned",
      submittedAt: "2026-10-19T08:40:00+07:00",
      returnReason: "ใบรับรองแพทย์ไม่ชัด กรุณาแนบใหม่",
      history: [
        ev("2026-10-19T08:40:00+07:00", "e-0003", "submit", undefined, "pending_hr"),
        ev("2026-10-20T15:00:00+07:00", "e-0010", "return", "pending_hr", "returned", "ใบรับรองแพทย์ไม่ชัด กรุณาแนบใหม่"),
      ],
    }),
    claim({
      id: "c-0006",
      no: "CLM-2569-0006",
      employeeId: "e-0010",
      benefitTypeId: "b-edu",
      receiptNo: "SCH-2569-114",
      vendorName: "โรงเรียนอนุบาลดวงใจ",
      amountRequested: 6000,
      receiptDate: "2026-05-25",
      attachments: [
        att("seed-a8", "school_receipt.pdf", "ใบเสร็จ", "2026-05-26T09:00:00+07:00"),
        att("seed-a9", "birth_cert.pdf", "สำเนาสูติบัตรบุตร", "2026-05-26T09:00:00+07:00"),
      ],
      status: "paid",
      submittedAt: "2026-05-26T09:00:00+07:00",
      decidedById: "e-0011",
      decidedAt: "2026-05-27T10:00:00+07:00",
      payDate: computePayDate("2026-05-27", S),
      history: [
        ev("2026-05-26T09:00:00+07:00", "e-0010", "submit", undefined, "pending_hr"),
        ev("2026-05-27T10:00:00+07:00", "e-0011", "approve", "pending_hr", "approved", "HR ยื่นเอง — หัวหน้า HR เป็นผู้พิจารณา"),
        ev("2026-05-29T14:00:00+07:00", "e-0030", "mark_paid", "approved", "paid", "เช็ค · CHQ-0001452"),
      ],
    }),
    claim({
      id: "c-0007",
      no: "CLM-2569-0007",
      employeeId: "e-0004",
      benefitTypeId: "b-med",
      receiptNo: "AE-3301",
      vendorName: "คลินิกความงามสวยใส",
      amountRequested: 4000,
      receiptDate: "2026-09-20",
      attachments: [
        att("seed-a10", "receipt_aesthetic.pdf", "ใบเสร็จ", "2026-09-21T09:00:00+07:00"),
        att("seed-a11", "cert.pdf", "ใบรับรองแพทย์", "2026-09-21T09:00:00+07:00"),
      ],
      status: "rejected",
      submittedAt: "2026-09-21T09:00:00+07:00",
      decidedById: "e-0010",
      decidedAt: "2026-09-22T10:00:00+07:00",
      rejectReason: "เป็นค่าใช้จ่ายด้านความงาม ไม่อยู่ในเงื่อนไขสวัสดิการ",
      history: [
        ev("2026-09-21T09:00:00+07:00", "e-0004", "submit", undefined, "pending_hr"),
        ev("2026-09-22T10:00:00+07:00", "e-0010", "reject", "pending_hr", "rejected", "เป็นค่าใช้จ่ายด้านความงาม ไม่อยู่ในเงื่อนไขสวัสดิการ"),
      ],
    }),
    claim({
      id: "c-0008",
      no: "CLM-2569-0008",
      employeeId: "e-0003",
      benefitTypeId: "b-dis",
      fundRoundId: "f-flood-2569",
      receiptNo: "",
      vendorName: "",
      amountRequested: 0,
      receiptDate: "2026-10-25",
      note: "บ้านพักน้ำท่วมชั้นล่าง เครื่องใช้ไฟฟ้าเสียหาย",
      attachments: [
        att("seed-a12", "police_report.pdf", "ใบแจ้งความ / หนังสือรับรองภัยพิบัติ", "2026-10-26T10:00:00+07:00"),
        att("seed-a13", "damage_photo.jpg", "รูปถ่ายความเสียหาย", "2026-10-26T10:00:00+07:00"),
      ],
      status: "pending_hr",
      submittedAt: "2026-10-26T10:00:00+07:00",
      history: [ev("2026-10-26T10:00:00+07:00", "e-0003", "submit", undefined, "pending_hr")],
    }),
    claim({
      id: "c-0009",
      no: "CLM-2569-0009",
      employeeId: "e-0003",
      benefitTypeId: "b-den",
      receiptNo: "DT-0098",
      vendorName: "คลินิกทันตกรรมยิ้มสวย",
      amountRequested: 900,
      receiptDate: "2026-11-01",
      attachments: [att("seed-a14", "dental_piti.jpg", "ใบเสร็จ", "2026-11-02T09:00:00+07:00")],
      status: "pending_hr",
      submittedAt: "2026-11-02T09:00:00+07:00",
      history: [ev("2026-11-02T09:00:00+07:00", "e-0003", "submit", undefined, "pending_hr")],
    }),
    claim({
      id: "c-0010",
      no: "CLM-2569-0010",
      employeeId: "e-0010",
      benefitTypeId: "b-opd",
      receiptNo: "INV-3301",
      vendorName: "คลินิกเวชกรรมสุขใจ",
      amountRequested: 900,
      receiptDate: "2026-11-03",
      attachments: [att("seed-a15", "receipt_wipa.jpg", "ใบเสร็จ", "2026-11-04T08:00:00+07:00")],
      status: "pending_hr",
      submittedAt: "2026-11-04T08:00:00+07:00",
      history: [ev("2026-11-04T08:00:00+07:00", "e-0010", "submit", undefined, "pending_hr")],
    }),
  ];

  const payments: Payment[] = [
    { claimId: "c-0001", method: "transfer", paidAt: "2026-09-30", transferRef: "PAY-2569-09-001", recordedBy: "e-0030", recordedAt: "2026-09-30T15:00:00+07:00" },
    { claimId: "c-0006", method: "cheque", paidAt: "2026-05-29", chequeNo: "CHQ-0001452", chequeDate: "2026-05-29", recordedBy: "e-0030", recordedAt: "2026-05-29T14:00:00+07:00" },
  ];

  // ธนา ใช้สิทธิ์ประกันส่วนเกินครบ 30 ครั้งแล้ว (ไว้เดโมว่ายื่นเพิ่มไม่ได้)
  for (let i = 0; i < 30; i++) {
    const m = String(1 + (i % 10)).padStart(2, "0");
    const day = String(2 + Math.floor(i / 10) * 9).padStart(2, "0");
    const date = `2026-${m}-${day}`;
    const id = `c-t${String(i + 1).padStart(2, "0")}`;
    const ref = `PAY-OPD-${String(i + 1).padStart(3, "0")}`;
    claims.push(
      claim({
        id,
        no: `CLM-2569-${String(11 + i).padStart(4, "0")}`,
        employeeId: "e-0020",
        benefitTypeId: "b-opd",
        receiptNo: `OPD-T${i + 1}`,
        vendorName: "คลินิกเวชกรรมสุขใจ",
        amountRequested: 500,
        receiptDate: date,
        attachments: [att(`seed-t${i + 1}`, `opd_${i + 1}.jpg`, "ใบเสร็จ", `${date}T09:00:00+07:00`)],
        status: "paid",
        submittedAt: `${date}T09:00:00+07:00`,
        decidedById: "e-0010",
        decidedAt: `${date}T15:00:00+07:00`,
        payDate: computePayDate(date, S),
        history: [
          ev(`${date}T09:00:00+07:00`, "e-0020", "submit", undefined, "pending_hr"),
          ev(`${date}T15:00:00+07:00`, "e-0010", "approve", "pending_hr", "approved"),
          ev(`${date}T16:00:00+07:00`, "e-0030", "mark_paid", "approved", "paid", `โอนเงิน · ${ref}`),
        ],
      }),
    );
    payments.push({ claimId: id, method: "transfer", paidAt: date, transferRef: ref, recordedBy: "e-0030", recordedAt: `${date}T16:00:00+07:00` });
  }

  const auditLogs: AuditLog[] = [
    {
      id: "al-1",
      at: "2026-10-01T10:00:00+07:00",
      actorId: "e-0010",
      actorRole: "hr",
      action: "update",
      entity: "employee",
      entityId: "e-0003",
      summary: "แก้ไขข้อมูลพนักงาน EMP-0003 ปิติ ขยัน (contractEndDate)",
      before: { contractEndDate: "2026-12-31" },
      after: { contractEndDate: "2027-03-31" },
    },
    {
      id: "al-2",
      at: "2026-10-15T09:00:00+07:00",
      actorId: "e-0010",
      actorRole: "hr",
      action: "create",
      entity: "fund",
      entityId: "f-flood-2569",
      summary: "เปิดรอบงบภัยพิบัติ: น้ำท่วม ต.ค. 2569 (งบ 100,000 บาท)",
      after: { budget: 100000, maxPerPerson: 20000 },
    },
  ];
  // สร้าง audit จากประวัติคำขอ
  for (const c of claims)
    for (const h of c.history)
      auditLogs.push({
        id: `al-${c.id}-${h.at}`,
        at: h.at,
        actorId: h.actorId,
        actorRole: employees.find((e) => e.id === h.actorId)?.role ?? null,
        action: h.action === "mark_paid" ? "record_payment" : h.action,
        entity: h.action === "mark_paid" ? "payment" : "claim",
        entityId: c.id,
        summary: `${c.no}: ${h.fromStatus ? STATUS_LABEL[h.fromStatus] : "ยื่นคำขอ"} → ${h.toStatus ? STATUS_LABEL[h.toStatus] : "-"}`,
        before: h.fromStatus ? { status: h.fromStatus } : undefined,
        after: h.toStatus ? { status: h.toStatus } : undefined,
      });
  auditLogs.sort((a, b) => b.at.localeCompare(a.at));

  return {
    version: DB_VERSION,
    departments: [
      { id: "d-mgt", code: "MGT", name: "บริหาร" },
      { id: "d-it", code: "IT", name: "เทคโนโลยีสารสนเทศ" },
      { id: "d-hr", code: "HR", name: "ทรัพยากรบุคคล" },
      { id: "d-fin", code: "FIN", name: "บัญชีและการเงิน" },
    ],
    positions: [
      { id: "p-l1", name: "เจ้าหน้าที่", level: 1 },
      { id: "p-l2", name: "ผู้ช่วยผู้จัดการ", level: 2 },
      { id: "p-l3", name: "ผู้จัดการ", level: 3 },
      { id: "p-l4", name: "ผู้บริหาร", level: 4 },
    ],
    employees,
    benefitTypes: benefits,
    benefitLimits,
    fundRounds: [
      {
        id: "f-flood-2569",
        benefitTypeId: "b-dis",
        name: "น้ำท่วม ต.ค. 2569",
        budget: 100000,
        openFrom: "2026-10-15",
        openTo: "2026-12-31",
        maxPerPerson: 20000,
        status: "open",
        createdAt: "2026-10-15T09:00:00+07:00",
      },
    ],
    claims,
    payments,
    changeRequests: [],
    settings: S,
    rbac: structuredClone(DEFAULT_RBAC),
    auditLogs,
    emails: [
      {
        id: "m-1",
        at: "2026-09-30T15:00:00+07:00",
        to: ["emp-0001@company.example"],
        subject: "[สวัสดิการ] CLM-2569-0001 จ่ายเงินแล้ว",
        body: "จ่ายเงิน 2,500 บาท แล้ว (โอนเงิน อ้างอิง PAY-2569-09-001)",
        event: "mark_paid",
        status: "sent",
      },
    ],
    counters: { claim_2026: 40, emp: 50 },
  };
}
