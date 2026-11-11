-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    CONSTRAINT "Position_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "departmentId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "managerId" TEXT,
    "employmentType" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "contractEndDate" TEXT,
    "role" TEXT NOT NULL DEFAULT 'employee',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "passwordHash" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "delegateId" TEXT,
    "delegateFrom" TEXT,
    "delegateTo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Employee_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Employee_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BenefitType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'claim',
    "annualLimit" DECIMAL,
    "perClaimLimit" DECIMAL,
    "maxTimesPerYear" INTEGER,
    "eligibleTypes" TEXT NOT NULL,
    "typeOverrides" TEXT NOT NULL DEFAULT '{}',
    "requiredDocs" TEXT NOT NULL,
    "minServiceDays" INTEGER,
    "claimWindowDays" INTEGER,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AnnualBudget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "benefitTypeId" TEXT NOT NULL,
    "amount" DECIMAL,
    CONSTRAINT "AnnualBudget_benefitTypeId_fkey" FOREIGN KEY ("benefitTypeId") REFERENCES "BenefitType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FundRound" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "benefitTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "budget" DECIMAL NOT NULL,
    "openFrom" TEXT NOT NULL,
    "openTo" TEXT NOT NULL,
    "maxPerPerson" DECIMAL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FundRound_benefitTypeId_fkey" FOREIGN KEY ("benefitTypeId") REFERENCES "BenefitType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "no" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "benefitTypeId" TEXT NOT NULL,
    "fundRoundId" TEXT,
    "amount" DECIMAL NOT NULL DEFAULT 0,
    "assignedAmount" DECIMAL,
    "receiptDate" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL,
    "submittedAt" DATETIME NOT NULL,
    "filedById" TEXT,
    "filedReason" TEXT,
    "docsCompleteAt" DATETIME,
    "approverId" TEXT,
    "approvedAt" DATETIME,
    "payDate" TEXT,
    "paidAt" DATETIME,
    "paidById" TEXT,
    "paymentRef" TEXT,
    "rejectReason" TEXT,
    "returnReason" TEXT,
    CONSTRAINT "Claim_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Claim_benefitTypeId_fkey" FOREIGN KEY ("benefitTypeId") REFERENCES "BenefitType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Claim_fundRoundId_fkey" FOREIGN KEY ("fundRoundId") REFERENCES "FundRound" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClaimAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "claimId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "uploadedAt" DATETIME NOT NULL,
    CONSTRAINT "ClaimAttachment_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClaimEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "claimId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "at" DATETIME NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "note" TEXT,
    CONSTRAINT "ClaimEvent_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StoredFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "uploaderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Holiday" (
    "date" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "role" TEXT NOT NULL,
    "permission" TEXT NOT NULL,

    PRIMARY KEY ("role", "permission")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "at" DATETIME NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "before" TEXT,
    "after" TEXT
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "at" DATETIME NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "status" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Counter" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_code_key" ON "Employee"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email");

-- CreateIndex
CREATE UNIQUE INDEX "BenefitType_code_key" ON "BenefitType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "AnnualBudget_year_benefitTypeId_key" ON "AnnualBudget"("year", "benefitTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_no_key" ON "Claim"("no");

-- CreateIndex
CREATE INDEX "Claim_employeeId_benefitTypeId_status_idx" ON "Claim"("employeeId", "benefitTypeId", "status");

-- CreateIndex
CREATE INDEX "Claim_status_payDate_idx" ON "Claim"("status", "payDate");

-- CreateIndex
CREATE INDEX "ClaimAttachment_claimId_idx" ON "ClaimAttachment"("claimId");

-- CreateIndex
CREATE INDEX "ClaimEvent_claimId_seq_idx" ON "ClaimEvent"("claimId", "seq");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "EmailMessage_at_idx" ON "EmailMessage"("at");
