-- ปรับระบบตามความต้องการ 12 พ.ย.:
-- Role ใหม่ (hr_head, ไม่มี manager), ลบ PIN / ผู้อนุมัติสำรอง, วงเงินตามระดับ (BenefitLimit),
-- ยอดขอ vs ยอดได้จริง, บันทึกการจ่ายรายคำขอ (Payment), คำขอแก้ไข (ChangeRequest), ลบงบประมาณรายปี
-- มี data migration ในไฟล์นี้ เพื่อไม่ให้ข้อมูลเดิมหาย

-- DropIndex
DROP INDEX "AnnualBudget_year_benefitTypeId_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "AnnualBudget";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "BenefitLimit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "benefitId" TEXT NOT NULL,
    "minLevel" INTEGER NOT NULL,
    "maxLevel" INTEGER NOT NULL,
    "perClaim" DECIMAL,
    "perYear" DECIMAL,
    "maxCount" INTEGER,
    "effectiveFrom" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BenefitLimit_benefitId_fkey" FOREIGN KEY ("benefitId") REFERENCES "BenefitType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Data: วงเงินเดิมของแต่ละสวัสดิการ → วงเงินทุกระดับ (1–4)
INSERT INTO "BenefitLimit" ("id", "benefitId", "minLevel", "maxLevel", "perClaim", "perYear", "maxCount", "effectiveFrom")
SELECT 'lim-' || "id", "id", 1, 4, "perClaimLimit", "annualLimit", "maxTimesPerYear", '2026-01-01'
FROM "BenefitType"
WHERE "annualLimit" IS NOT NULL OR "perClaimLimit" IS NOT NULL OR "maxTimesPerYear" IS NOT NULL;

-- CreateTable
CREATE TABLE "Payment" (
    "claimId" TEXT NOT NULL PRIMARY KEY,
    "method" TEXT NOT NULL,
    "paidAt" TEXT NOT NULL,
    "transferRef" TEXT,
    "chequeNo" TEXT,
    "chequeDate" TEXT,
    "recordedBy" TEXT NOT NULL,
    "recordedAt" DATETIME NOT NULL,
    "note" TEXT,
    CONSTRAINT "Payment_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Data: คำขอที่จ่ายแล้ว → บันทึกการจ่าย (วิธีเดิมไม่ได้เก็บ จึงถือเป็นโอนเงิน + เลขอ้างอิงเดิม)
INSERT INTO "Payment" ("claimId", "method", "paidAt", "transferRef", "recordedBy", "recordedAt")
SELECT "id", 'transfer',
       CASE typeof("paidAt") WHEN 'integer' THEN date("paidAt" / 1000, 'unixepoch', 'localtime') ELSE substr("paidAt", 1, 10) END,
       COALESCE("paymentRef", '-'), COALESCE("paidById", '-'), "paidAt"
FROM "Claim"
WHERE "status" = 'paid' AND "paidAt" IS NOT NULL;

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "before" TEXT NOT NULL,
    "after" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "requestedAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME,
    "reviewNote" TEXT,
    "selfApproved" BOOLEAN NOT NULL DEFAULT false
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Position" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1
);
INSERT INTO "new_Position" ("id", "name") SELECT "id", "name" FROM "Position";
DROP TABLE "Position";
ALTER TABLE "new_Position" RENAME TO "Position";
CREATE TABLE "new_Employee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "departmentId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "supervisorId" TEXT,
    "employmentType" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "contractEndDate" TEXT,
    "role" TEXT NOT NULL DEFAULT 'employee',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Employee_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Employee_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Employee" ("active", "code", "contractEndDate", "createdAt", "departmentId", "email", "employmentType", "firstName", "id", "lastName", "passwordHash", "phone", "positionId", "role", "startDate", "updatedAt", "supervisorId") SELECT "active", "code", "contractEndDate", "createdAt", "departmentId", "email", "employmentType", "firstName", "id", "lastName", "passwordHash", "phone", "positionId", CASE "role" WHEN 'manager' THEN 'employee' ELSE "role" END, "startDate", "updatedAt", "managerId" FROM "Employee";
DROP TABLE "Employee";
ALTER TABLE "new_Employee" RENAME TO "Employee";
CREATE UNIQUE INDEX "Employee_code_key" ON "Employee"("code");
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email");
CREATE TABLE "new_BenefitType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'อื่น ๆ',
    "description" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'claim',
    "eligibleTypes" TEXT NOT NULL,
    "requiredDocs" TEXT NOT NULL,
    "minServiceDays" INTEGER,
    "claimWindowDays" INTEGER,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_BenefitType" ("active", "claimWindowDays", "code", "createdAt", "description", "eligibleTypes", "id", "minServiceDays", "mode", "name", "requiredDocs", "sensitive", "updatedAt") SELECT "active", "claimWindowDays", "code", "createdAt", "description", "eligibleTypes", "id", "minServiceDays", "mode", "name", "requiredDocs", "sensitive", "updatedAt" FROM "BenefitType";
DROP TABLE "BenefitType";
ALTER TABLE "new_BenefitType" RENAME TO "BenefitType";
CREATE UNIQUE INDEX "BenefitType_code_key" ON "BenefitType"("code");
CREATE TABLE "new_Claim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "no" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "benefitTypeId" TEXT NOT NULL,
    "fundRoundId" TEXT,
    "receiptNo" TEXT NOT NULL DEFAULT '',
    "vendorName" TEXT NOT NULL DEFAULT '',
    "amountRequested" DECIMAL NOT NULL DEFAULT 0,
    "amountApproved" DECIMAL NOT NULL DEFAULT 0,
    "receiptDate" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL,
    "submittedAt" DATETIME NOT NULL,
    "decidedById" TEXT,
    "decidedAt" DATETIME,
    "payDate" TEXT,
    "rejectReason" TEXT,
    "returnReason" TEXT,
    CONSTRAINT "Claim_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Claim_benefitTypeId_fkey" FOREIGN KEY ("benefitTypeId") REFERENCES "BenefitType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Claim_fundRoundId_fkey" FOREIGN KEY ("fundRoundId") REFERENCES "FundRound" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Claim" ("benefitTypeId", "employeeId", "fundRoundId", "id", "no", "note", "payDate", "receiptDate", "rejectReason", "returnReason", "status", "submittedAt", "amountRequested", "amountApproved", "decidedById", "decidedAt")
SELECT "benefitTypeId", "employeeId", "fundRoundId", "id", "no", "note", "payDate", "receiptDate",
       CASE "status" WHEN 'cancelled' THEN 'ผู้ยื่นยกเลิกคำขอ' ELSE "rejectReason" END,
       "returnReason",
       CASE "status" WHEN 'pending_manager' THEN 'pending_hr' WHEN 'cancelled' THEN 'rejected' ELSE "status" END,
       "submittedAt", "amount", COALESCE("assignedAmount", "amount"), "approverId", "approvedAt"
FROM "Claim";
DROP TABLE "Claim";
ALTER TABLE "new_Claim" RENAME TO "Claim";
CREATE UNIQUE INDEX "Claim_no_key" ON "Claim"("no");
CREATE INDEX "Claim_receiptNo_vendorName_idx" ON "Claim"("receiptNo", "vendorName");
CREATE INDEX "Claim_employeeId_benefitTypeId_status_idx" ON "Claim"("employeeId", "benefitTypeId", "status");
CREATE INDEX "Claim_status_payDate_idx" ON "Claim"("status", "payDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "BenefitLimit_benefitId_effectiveFrom_idx" ON "BenefitLimit"("benefitId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "ChangeRequest_status_idx" ON "ChangeRequest"("status");

-- CreateIndex
CREATE INDEX "ChangeRequest_targetId_idx" ON "ChangeRequest"("targetId");


-- Data: ระดับตำแหน่ง (เดาจากชื่อ — HR ปรับได้ที่หน้าโครงสร้างองค์กร)
UPDATE "Position" SET "level" = 4 WHERE "name" LIKE '%ผู้อำนวยการ%' OR "name" LIKE '%Director%' OR "name" LIKE '%ผู้บริหาร%';
UPDATE "Position" SET "level" = 3 WHERE "level" = 1 AND ("name" LIKE '%Manager%' OR "name" LIKE '%ผู้จัดการ%');

-- Data: หมวดสวัสดิการ
UPDATE "BenefitType" SET "category" = 'สุขภาพ' WHERE "code" IN ('MED', 'OPD', 'DEN');
UPDATE "BenefitType" SET "category" = 'การศึกษา' WHERE "code" = 'EDU';
UPDATE "BenefitType" SET "category" = 'ช่วยเหลือ' WHERE "mode" = 'assigned';

-- Data: ชื่อขั้นตอนเดิมในประวัติคำขอ
UPDATE "ClaimEvent" SET "action" = 'return' WHERE "action" = 'hr_return';
UPDATE "ClaimEvent" SET "action" = 'reject' WHERE "action" = 'hr_reject';

-- Data: สิทธิ์ตาม Role ชุดใหม่ (ไม่มี manager, เพิ่ม hr_head, Audit Log เฉพาะ admin)
DELETE FROM "RolePermission";
INSERT INTO "RolePermission" ("role", "permission") VALUES
  ('employee', 'self.claim'),
  ('hr', 'self.claim'), ('hr', 'claim.review'), ('hr', 'change.request'), ('hr', 'employee.view'), ('hr', 'employee.manage'),
  ('hr', 'org.manage'), ('hr', 'benefit.manage'), ('hr', 'payroll.settings'), ('hr', 'report.view'),
  ('hr_head', 'self.claim'), ('hr_head', 'claim.review'), ('hr_head', 'change.request'), ('hr_head', 'employee.view'), ('hr_head', 'employee.manage'),
  ('hr_head', 'org.manage'), ('hr_head', 'benefit.manage'), ('hr_head', 'payroll.settings'), ('hr_head', 'report.view'), ('hr_head', 'change.review'),
  ('finance', 'self.claim'), ('finance', 'payment.view'), ('finance', 'payment.record'), ('finance', 'report.view'),
  ('admin', 'self.claim'), ('admin', 'audit.view'), ('admin', 'user.manage'), ('admin', 'rbac.manage'), ('admin', 'system.manage');

DELETE FROM "Setting" WHERE "key" = 'orgBudgetMode';
