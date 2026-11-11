/**
 * แปลงข้อมูลระหว่างตารางในฐานข้อมูล (Prisma) ↔ โมเดลของระบบ (Database)
 * - loadDatabase: อ่านข้อมูลทั้งหมดที่ service ต้องใช้ (ไม่รวม Audit Log/อีเมล เพื่อความเร็ว)
 * - persistChanges: เทียบก่อน–หลัง แล้วเขียนเฉพาะแถวที่เปลี่ยนใน transaction เดียว
 * - replaceAll: เขียนทับทั้งชุด (seed / กู้คืนข้อมูล)
 */
import { DEFAULT_RBAC } from "../domain/constants";
import type {
  AnnualBudget,
  AuditLog,
  BenefitType,
  Claim,
  Database,
  EmailMessage,
  Employee,
  FundRound,
  RbacMatrix,
  Role,
  Settings,
} from "../domain/types";
import { DB_VERSION, SEED_SETTINGS } from "../data/seed";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;
type Db = PrismaClient | Tx;

const d = (s: string | null | undefined) => (s ? new Date(s) : null);
const iso = (x: Date | null | undefined) => (x ? x.toISOString() : null);
const num = (x: Prisma.Decimal | number | null | undefined) => (x == null ? null : Number(x));
const json = (v: unknown) => JSON.stringify(v ?? null);
const parse = <T>(s: string | null | undefined, fallback: T): T => {
  if (s == null) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

/* ------------------------------ domain → row ------------------------------ */
const employeeRow = (e: Employee) => ({
  id: e.id,
  code: e.code,
  firstName: e.firstName,
  lastName: e.lastName,
  email: e.email,
  phone: e.phone ?? null,
  departmentId: e.departmentId,
  positionId: e.positionId,
  managerId: e.managerId ?? null,
  employmentType: e.employmentType,
  startDate: e.startDate,
  contractEndDate: e.contractEndDate ?? null,
  role: e.role,
  active: e.active,
  passwordHash: e.passwordHash,
  pinHash: e.pinHash,
  delegateId: e.delegation?.employeeId ?? null,
  delegateFrom: e.delegation?.from ?? null,
  delegateTo: e.delegation?.to ?? null,
  createdAt: d(e.createdAt)!,
  updatedAt: d(e.updatedAt)!,
});

const benefitRow = (b: BenefitType) => ({
  id: b.id,
  code: b.code,
  name: b.name,
  description: b.description ?? null,
  mode: b.mode,
  annualLimit: b.annualLimit,
  perClaimLimit: b.perClaimLimit,
  maxTimesPerYear: b.maxTimesPerYear,
  eligibleTypes: json(b.eligibleTypes),
  typeOverrides: json(b.typeOverrides ?? {}),
  requiredDocs: json(b.requiredDocs),
  minServiceDays: b.minServiceDays ?? null,
  claimWindowDays: b.claimWindowDays ?? null,
  sensitive: b.sensitive,
  active: b.active,
  createdAt: d(b.createdAt)!,
  updatedAt: d(b.updatedAt)!,
});

const budgetRow = (b: AnnualBudget) => ({ id: b.id, year: b.year, benefitTypeId: b.benefitTypeId, amount: b.amount });

const fundRow = (r: FundRound) => ({
  id: r.id,
  benefitTypeId: r.benefitTypeId,
  name: r.name,
  budget: r.budget,
  openFrom: r.openFrom,
  openTo: r.openTo,
  maxPerPerson: r.maxPerPerson,
  status: r.status,
  createdAt: d(r.createdAt)!,
});

const claimRow = (c: Claim) => ({
  id: c.id,
  no: c.no,
  employeeId: c.employeeId,
  benefitTypeId: c.benefitTypeId,
  fundRoundId: c.fundRoundId ?? null,
  amount: c.amount,
  assignedAmount: c.assignedAmount ?? null,
  receiptDate: c.receiptDate,
  note: c.note ?? null,
  status: c.status,
  submittedAt: d(c.submittedAt)!,
  filedById: c.filedById ?? null,
  filedReason: c.filedReason ?? null,
  docsCompleteAt: d(c.docsCompleteAt),
  approverId: c.approverId ?? null,
  approvedAt: d(c.approvedAt),
  payDate: c.payDate ?? null,
  paidAt: d(c.paidAt),
  paidById: c.paidById ?? null,
  paymentRef: c.paymentRef ?? null,
  rejectReason: c.rejectReason ?? null,
  returnReason: c.returnReason ?? null,
});

const attachmentRows = (c: Claim) =>
  c.attachments.map((a, i) => ({ id: a.id, claimId: c.id, position: i, name: a.name, size: a.size, type: a.type, docType: a.docType, uploadedAt: d(a.uploadedAt)! }));

const eventRows = (c: Claim, from = 0) =>
  c.history.slice(from).map((h, i) => ({
    claimId: c.id,
    seq: from + i,
    at: d(h.at)!,
    actorId: h.actorId,
    action: h.action,
    fromStatus: h.fromStatus ?? null,
    toStatus: h.toStatus ?? null,
    note: h.note ?? null,
  }));

const auditRow = (l: AuditLog) => ({
  id: l.id,
  at: d(l.at)!,
  actorId: l.actorId,
  actorRole: l.actorRole,
  action: l.action,
  entity: l.entity,
  entityId: l.entityId,
  summary: l.summary,
  before: l.before === undefined ? null : json(l.before),
  after: l.after === undefined ? null : json(l.after),
});

const emailRow = (m: EmailMessage) => ({ id: m.id, at: d(m.at)!, to: json(m.to), subject: m.subject, body: m.body, event: m.event, status: m.status });

const SETTING_KEYS = ["cutoffDay", "orgBudgetMode", "email", "backup", "auditRetentionDays", "orgName"] as const;

/* ------------------------------ row → domain ------------------------------ */
type Row<K extends keyof PrismaClient> = PrismaClient[K] extends { findMany: (...a: never[]) => Promise<(infer R)[]> } ? R : never;

export function toAuditLog(r: Row<"auditLog">): AuditLog {
  return {
    id: r.id,
    at: iso(r.at)!,
    actorId: r.actorId,
    actorRole: r.actorRole as Role | null,
    action: r.action,
    entity: r.entity as AuditLog["entity"],
    entityId: r.entityId,
    summary: r.summary,
    before: r.before == null ? undefined : parse(r.before, undefined),
    after: r.after == null ? undefined : parse(r.after, undefined),
  };
}

export function toEmail(r: Row<"emailMessage">): EmailMessage {
  return { id: r.id, at: iso(r.at)!, to: parse(r.to, []), subject: r.subject, body: r.body, event: r.event, status: r.status as EmailMessage["status"] };
}

export async function loadDatabase(prisma: PrismaClient, opts: { withLogs?: boolean } = {}): Promise<Database> {
  const [departments, positions, employees, benefits, budgets, funds, claims, holidays, settings, perms, counters, logs, emails] = await prisma.$transaction([
    prisma.department.findMany({ orderBy: { code: "asc" } }),
    prisma.position.findMany(),
    prisma.employee.findMany({ orderBy: { code: "asc" } }),
    prisma.benefitType.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.annualBudget.findMany(),
    prisma.fundRound.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.claim.findMany({
      orderBy: { submittedAt: "desc" },
      include: { attachments: { orderBy: { position: "asc" } }, events: { orderBy: { seq: "asc" } } },
    }),
    prisma.holiday.findMany({ orderBy: { date: "asc" } }),
    prisma.setting.findMany(),
    prisma.rolePermission.findMany(),
    prisma.counter.findMany(),
    prisma.auditLog.findMany({ where: opts.withLogs ? {} : { id: "__none__" }, orderBy: { at: "desc" } }),
    prisma.emailMessage.findMany({ where: opts.withLogs ? {} : { id: "__none__" }, orderBy: { at: "desc" } }),
  ]);

  const settingMap = Object.fromEntries(settings.map((s) => [s.key, parse(s.value, null)]));
  const st: Settings = { ...structuredClone(SEED_SETTINGS), holidays: holidays.map((h) => ({ date: h.date, name: h.name })) };
  for (const k of SETTING_KEYS) if (settingMap[k] != null) (st as unknown as Record<string, unknown>)[k] = settingMap[k];

  const rbac = Object.fromEntries((Object.keys(DEFAULT_RBAC) as Role[]).map((r) => [r, perms.filter((p) => p.role === r).map((p) => p.permission)])) as RbacMatrix;

  return {
    version: DB_VERSION,
    departments: departments.map((x) => ({ id: x.id, code: x.code, name: x.name })),
    positions: positions.map((x) => ({ id: x.id, name: x.name, departmentId: x.departmentId })),
    employees: employees.map((e) => ({
      id: e.id,
      code: e.code,
      firstName: e.firstName,
      lastName: e.lastName,
      email: e.email,
      phone: e.phone ?? undefined,
      departmentId: e.departmentId,
      positionId: e.positionId,
      managerId: e.managerId,
      employmentType: e.employmentType as Employee["employmentType"],
      startDate: e.startDate,
      contractEndDate: e.contractEndDate,
      role: e.role as Role,
      active: e.active,
      passwordHash: e.passwordHash,
      pinHash: e.pinHash,
      delegation: e.delegateId ? { employeeId: e.delegateId, from: e.delegateFrom!, to: e.delegateTo! } : null,
      createdAt: iso(e.createdAt)!,
      updatedAt: iso(e.updatedAt)!,
    })),
    benefitTypes: benefits.map((b) => ({
      id: b.id,
      code: b.code,
      name: b.name,
      description: b.description ?? undefined,
      mode: b.mode as BenefitType["mode"],
      annualLimit: num(b.annualLimit),
      perClaimLimit: num(b.perClaimLimit),
      maxTimesPerYear: b.maxTimesPerYear,
      eligibleTypes: parse(b.eligibleTypes, []),
      typeOverrides: parse(b.typeOverrides, {}),
      requiredDocs: parse(b.requiredDocs, []),
      minServiceDays: b.minServiceDays,
      claimWindowDays: b.claimWindowDays,
      sensitive: b.sensitive,
      active: b.active,
      createdAt: iso(b.createdAt)!,
      updatedAt: iso(b.updatedAt)!,
    })),
    budgets: budgets.map((b) => ({ id: b.id, year: b.year, benefitTypeId: b.benefitTypeId, amount: num(b.amount) })),
    fundRounds: funds.map((r) => ({
      id: r.id,
      benefitTypeId: r.benefitTypeId,
      name: r.name,
      budget: num(r.budget)!,
      openFrom: r.openFrom,
      openTo: r.openTo,
      maxPerPerson: num(r.maxPerPerson),
      status: r.status as FundRound["status"],
      createdAt: iso(r.createdAt)!,
    })),
    claims: claims.map((c) => ({
      id: c.id,
      no: c.no,
      employeeId: c.employeeId,
      benefitTypeId: c.benefitTypeId,
      fundRoundId: c.fundRoundId,
      amount: num(c.amount)!,
      assignedAmount: num(c.assignedAmount),
      receiptDate: c.receiptDate,
      note: c.note ?? undefined,
      attachments: c.attachments.map((a) => ({ id: a.id, name: a.name, size: a.size, type: a.type, docType: a.docType, uploadedAt: iso(a.uploadedAt)! })),
      status: c.status as Claim["status"],
      submittedAt: iso(c.submittedAt)!,
      filedById: c.filedById,
      filedReason: c.filedReason,
      docsCompleteAt: iso(c.docsCompleteAt),
      approverId: c.approverId,
      approvedAt: iso(c.approvedAt),
      payDate: c.payDate,
      paidAt: iso(c.paidAt),
      paidById: c.paidById,
      paymentRef: c.paymentRef,
      rejectReason: c.rejectReason,
      returnReason: c.returnReason,
      history: c.events.map((h) => ({
        at: iso(h.at)!,
        actorId: h.actorId,
        action: h.action as Claim["history"][number]["action"],
        fromStatus: (h.fromStatus ?? undefined) as Claim["status"] | undefined,
        toStatus: (h.toStatus ?? undefined) as Claim["status"] | undefined,
        note: h.note ?? undefined,
      })),
    })),
    settings: st,
    rbac,
    auditLogs: logs.map(toAuditLog),
    emails: emails.map(toEmail),
    counters: Object.fromEntries(counters.map((c) => [c.key, c.value])),
  };
}

/* ------------------------------ เขียนลงฐานข้อมูล ------------------------------ */
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** เรียงพนักงานให้หัวหน้ามาก่อนลูกทีม (เพื่อ foreign key) */
function managerFirst(list: Employee[]) {
  const byId = new Map(list.map((e) => [e.id, e]));
  const out: Employee[] = [];
  const seen = new Set<string>();
  const visit = (e: Employee, depth = 0) => {
    if (seen.has(e.id) || depth > 100) return;
    const m = e.managerId ? byId.get(e.managerId) : undefined;
    if (m) visit(m, depth + 1);
    seen.add(e.id);
    out.push(e);
  };
  list.forEach((e) => visit(e));
  return out;
}

interface Delegate<R> {
  create(args: { data: R }): Promise<unknown>;
  update(args: { where: { id: string }; data: R }): Promise<unknown>;
  delete(args: { where: { id: string } }): Promise<unknown>;
}

async function syncById<T extends { id: string }, R>(model: Delegate<R>, before: T[], after: T[], toRow: (x: T) => R) {
  const prev = new Map(before.map((x) => [x.id, toRow(x)]));
  for (const x of after) {
    const row = toRow(x);
    const old = prev.get(x.id);
    if (!old) await model.create({ data: row });
    else if (!same(old, row)) await model.update({ where: { id: x.id }, data: row });
  }
  return before.filter((x) => !after.some((y) => y.id === x.id)).map((x) => x.id);
}

async function deleteIds(model: { delete(args: { where: { id: string } }): Promise<unknown> }, ids: string[]) {
  for (const id of ids) await model.delete({ where: { id } });
}

async function writeSettings(tx: Db, before: Settings | null, after: Settings) {
  for (const k of SETTING_KEYS) {
    if (before && same(before[k], after[k])) continue;
    await tx.setting.upsert({ where: { key: k }, create: { key: k, value: json(after[k]) }, update: { value: json(after[k]) } });
  }
  if (!before || !same(before.holidays, after.holidays)) {
    await tx.holiday.deleteMany();
    if (after.holidays.length) await tx.holiday.createMany({ data: after.holidays.map((h) => ({ date: h.date, name: h.name })) });
  }
}

async function writeRbac(tx: Db, before: RbacMatrix | null, after: RbacMatrix) {
  for (const role of Object.keys(after) as Role[]) {
    if (before && same([...before[role]].sort(), [...after[role]].sort())) continue;
    await tx.rolePermission.deleteMany({ where: { role } });
    if (after[role].length) await tx.rolePermission.createMany({ data: after[role].map((permission) => ({ role, permission })) });
  }
}

export async function persistChanges(prisma: PrismaClient, before: Database, after: Database) {
  await prisma.$transaction(
    async (tx) => {
      const delDepts = await syncById(tx.department, before.departments, after.departments, (x) => ({ ...x }));
      const delPos = await syncById(tx.position, before.positions, after.positions, (x) => ({ ...x }));
      await syncById(tx.employee, managerFirst(before.employees), managerFirst(after.employees), employeeRow);
      await syncById(tx.benefitType, before.benefitTypes, after.benefitTypes, benefitRow);
      await syncById(tx.annualBudget, before.budgets, after.budgets, budgetRow);
      await syncById(tx.fundRound, before.fundRounds, after.fundRounds, fundRow);

      const prevClaims = new Map(before.claims.map((c) => [c.id, c]));
      for (const c of after.claims) {
        const old = prevClaims.get(c.id);
        if (!old) {
          await tx.claim.create({ data: claimRow(c) });
          if (c.attachments.length) await tx.claimAttachment.createMany({ data: attachmentRows(c) });
          if (c.history.length) await tx.claimEvent.createMany({ data: eventRows(c) });
          continue;
        }
        if (!same(claimRow(old), claimRow(c))) await tx.claim.update({ where: { id: c.id }, data: claimRow(c) });
        if (!same(old.attachments, c.attachments)) {
          await tx.claimAttachment.deleteMany({ where: { claimId: c.id } });
          if (c.attachments.length) await tx.claimAttachment.createMany({ data: attachmentRows(c) });
        }
        if (!same(old.history, c.history)) {
          const prefixSame = same(old.history, c.history.slice(0, old.history.length));
          if (!prefixSame) await tx.claimEvent.deleteMany({ where: { claimId: c.id } });
          const rows = eventRows(c, prefixSame ? old.history.length : 0);
          if (rows.length) await tx.claimEvent.createMany({ data: rows });
        }
      }

      await writeSettings(tx, before.settings, after.settings);
      await writeRbac(tx, before.rbac, after.rbac);
      for (const [key, value] of Object.entries(after.counters))
        if (before.counters[key] !== value) await tx.counter.upsert({ where: { key }, create: { key, value }, update: { value } });

      // Audit Log / อีเมล: เพิ่มอย่างเดียว (append-only)
      const oldLogs = new Set(before.auditLogs.map((l) => l.id));
      const newLogs = after.auditLogs.filter((l) => !oldLogs.has(l.id));
      if (newLogs.length) await tx.auditLog.createMany({ data: newLogs.map(auditRow) });
      const oldMails = new Set(before.emails.map((m) => m.id));
      const newMails = after.emails.filter((m) => !oldMails.has(m.id));
      if (newMails.length) await tx.emailMessage.createMany({ data: newMails.map(emailRow) });

      await deleteIds(tx.position, delPos);
      await deleteIds(tx.department, delDepts);
    },
    { timeout: 20000 },
  );
}

/** เขียนทับข้อมูลทั้งหมด (seed / กู้คืน) */
export async function replaceAll(prisma: PrismaClient, db: Database) {
  await prisma.$transaction(
    async (tx) => {
      await tx.claimEvent.deleteMany();
      await tx.claimAttachment.deleteMany();
      await tx.claim.deleteMany();
      await tx.fundRound.deleteMany();
      await tx.annualBudget.deleteMany();
      await tx.benefitType.deleteMany();
      await tx.employee.updateMany({ data: { managerId: null } });
      await tx.employee.deleteMany();
      await tx.position.deleteMany();
      await tx.department.deleteMany();
      await tx.holiday.deleteMany();
      await tx.setting.deleteMany();
      await tx.rolePermission.deleteMany();
      await tx.counter.deleteMany();
      await tx.auditLog.deleteMany();
      await tx.emailMessage.deleteMany();

      if (db.departments.length) await tx.department.createMany({ data: db.departments.map((x) => ({ ...x })) });
      if (db.positions.length) await tx.position.createMany({ data: db.positions.map((x) => ({ ...x })) });
      for (const e of managerFirst(db.employees)) await tx.employee.create({ data: employeeRow(e) });
      if (db.benefitTypes.length) await tx.benefitType.createMany({ data: db.benefitTypes.map(benefitRow) });
      if (db.budgets.length) await tx.annualBudget.createMany({ data: db.budgets.map(budgetRow) });
      if (db.fundRounds.length) await tx.fundRound.createMany({ data: db.fundRounds.map(fundRow) });
      for (const c of db.claims) await tx.claim.create({ data: claimRow(c) });
      const atts = db.claims.flatMap(attachmentRows);
      if (atts.length) await tx.claimAttachment.createMany({ data: atts });
      const evs = db.claims.flatMap((c) => eventRows(c));
      if (evs.length) await tx.claimEvent.createMany({ data: evs });
      await writeSettings(tx, null, db.settings);
      await writeRbac(tx, null, db.rbac);
      for (const [key, value] of Object.entries(db.counters)) await tx.counter.create({ data: { key, value } });
      if (db.auditLogs.length) await tx.auditLog.createMany({ data: db.auditLogs.map(auditRow) });
      if (db.emails.length) await tx.emailMessage.createMany({ data: db.emails.map(emailRow) });
    },
    { timeout: 60000 },
  );
}
