# สถาปัตยกรรมระบบ

## 1. ชั้นของระบบ (ตามสไลด์ "แนวทางสถาปัตยกรรมระบบ")

| ชั้น | หน้าที่ | ไฟล์ |
|---|---|---|
| Presentation | หน้าจอ, ฟอร์ม, ซ่อนเมนูตามสิทธิ์ | `src/app/**`, `src/components/**`, `src/lib/client/*` |
| Application | กติกาธุรกิจ (ฟังก์ชันบริสุทธิ์ มี unit test) | `src/lib/domain/rules.ts`, `types.ts`, `constants.ts` |
| Service | workflow, ตรวจสิทธิ์ (RBAC), Audit Log, อีเมล | `src/lib/services/*.ts` |
| Data Access | transaction, แปลงตาราง ↔ โมเดล, ตัดข้อมูลตามสิทธิ์, ไฟล์แนบ | `src/lib/server/*.ts` |
| Database | ตาราง + Audit Log | `prisma/schema.prisma`, `prisma/migrations/` |

### การทำงานของคำสั่งที่แก้ข้อมูล

```
หน้าจอ api.submitClaim(input)
  → POST /api/rpc {method, args}          ตรวจ Origin, JSON, session cookie → actorId
  → verifyAttachments()                   ไฟล์แนบต้องเป็นของผู้ใช้ / ใช้ metadata จากฐานข้อมูล
  → runUnitOfWork()                       เข้าคิว (กันยื่นซ้อนเกินวงเงิน)
      loadDatabase()                      อ่านข้อมูลจาก Prisma
      services.submitClaim(actorId, ...)  assertCan → ตรวจกติกา → แก้ข้อมูล → audit() → sendEmail()
      persistChanges()                    เทียบก่อน–หลัง เขียนเฉพาะแถวที่เปลี่ยนใน transaction เดียว
  → หน้าจอโหลด /api/state ใหม่             ได้ข้อมูลที่ตัดตามสิทธิ์แล้ว (scopeDatabase)
```

ข้อดีของรูปแบบนี้: service ทุกตัวเขียนครั้งเดียว ใช้ได้ทั้ง unit test (ในหน่วยความจำ) และฐานข้อมูลจริง และทุกคำสั่งเป็น transaction เดียว — ล้มกลางทางไม่มีข้อมูลค้าง

## 2. ฐานข้อมูล

- ค่าเริ่มต้น SQLite (`prisma/dev.db`) — เปลี่ยนเป็น PostgreSQL ได้ด้วย 1 บรรทัดใน schema + `DATABASE_URL` (โค้ดเลือกไดรเวอร์อัตโนมัติ) ดู [GETTING-STARTED.md ข้อ 10](GETTING-STARTED.md#10-เปลี่ยนไปใช้-postgresql-เมื่อพร้อมขึ้นเซิร์ฟเวอร์จริง)
- ตารางหลัก: `Department`, `Position`, `Employee`, `BenefitType`, `BenefitLimit`, `FundRound`, `Claim`, `Payment`, `ChangeRequest`, `ClaimAttachment`, `ClaimEvent`, `StoredFile`, `Holiday`, `Setting`, `RolePermission`, `AuditLog`, `EmailMessage`, `Counter`
- Foreign key: พนักงาน→แผนก/ตำแหน่ง(ระดับ)/หัวหน้างาน, วงเงิน→สวัสดิการ, คำขอ→พนักงาน/สวัสดิการ/รอบงบ, การจ่าย/ไฟล์แนบ/ประวัติ→คำขอ
- วันที่ปฏิทินเก็บเป็นข้อความ `YYYY-MM-DD` (ไม่เพี้ยนตาม timezone), เวลาเก็บเป็น DateTime, เงินเก็บเป็น Decimal
- ไฟล์แนบอยู่ที่ `storage/uploads/` (แยกจากฐานข้อมูลหลักตาม NFR) — เปลี่ยนเป็น S3/MinIO ได้ที่ `src/lib/server/files.ts`

## 3. API

| Method | Path | หมายเหตุ |
|---|---|---|
| POST | `/api/auth/login` · `/api/auth/logout` | ออก/ลบ session cookie |
| GET | `/api/state` | ข้อมูลทั้งหมดที่ผู้ใช้มีสิทธิ์เห็น (ไม่ล็อกอิน = ชื่อองค์กร; รายชื่อบัญชีทดสอบเมื่อ `SHOW_DEMO_ACCOUNTS=true` — หน้าเข้าสู่ระบบไม่แสดง) |
| POST | `/api/rpc` | `{ method, args }` — รายการคำสั่งทั้งหมดอยู่ใน `src/lib/server/rpc.ts` |
| POST | `/api/files` | อัปโหลดไฟล์แนบ (multipart: `file`, `docType`) |
| GET | `/api/files/:id` | เปิดไฟล์แนบ (ตรวจสิทธิ์) |
| GET | `/api/audit?entity=&entityId=&actor=&from=&to=&q=&limit=&offset=` | ค้นหา Audit Log (บัญชีเห็นเฉพาะด้านการเงิน) |
| GET | `/api/emails` | กล่องอีเมลขาออก (ผู้ดูแลระบบ) |

คำสั่งใน `/api/rpc`: `validateClaim, submitClaim, updateClaim, approveClaim, rejectClaim, returnClaim, recordPayment, requestClaimChange, requestLimitChange, reviewChange, createEmployee, updateEmployee, setEmployeeActive, saveDepartment, deleteDepartment, savePosition, deletePosition, saveBenefit, saveFundRound, updatePayrollSettings, updateSystemSettings, setRolePermission, setUserRole, resetPassword, changeOwnPassword, exportBackup, restoreBackup, resetDemo`

## 4. ความปลอดภัย

ทำแล้ว ✅
- [x] Service layer รันฝั่งเซิร์ฟเวอร์เท่านั้น, ตรวจ RBAC ทุกคำสั่ง
- [x] Row-level: พนักงานเห็นเฉพาะของตนเอง, HR เห็นคำขอทั้งหมด, บัญชีเห็นเฉพาะยอดเงิน/รหัสพนักงาน/เลขใบเสร็จ, Audit Log เฉพาะผู้ดูแลระบบ (`scope.ts`)
- [x] รหัสผ่าน: scrypt + salt, ล็อกอินผิด 5 ครั้งล็อก 15 นาที · ปุ่มที่เกี่ยวกับเงินมีกล่องยืนยันเลขคำขอ + ยอดเงิน · หัวหน้า HR อนุมัติคำขอแก้ไขของตัวเองต้องใส่รหัสผ่านซ้ำ (บันทึก `selfApproved`)
- [x] Session HttpOnly + HMAC, หมดอายุ 8 ชม., ยกเลิกเมื่อเปลี่ยนรหัสผ่าน, Secure อัตโนมัติบน HTTPS
- [x] ไฟล์แนบ: ตรวจ magic bytes, 5 MB, ตรวจสิทธิ์ก่อนเปิด, ส่งพร้อม CSP sandbox + nosniff
- [x] CSRF: SameSite=Lax + ตรวจ Origin + บังคับ JSON
- [x] Audit Log: ระบบมีแต่การเพิ่ม (ไม่มีหน้าจอ/คำสั่งแก้หรือลบ)

ควรทำเพิ่มก่อนใช้งานจริง
- [ ] PostgreSQL: `REVOKE UPDATE, DELETE ON "AuditLog"` จาก user ของแอป
- [ ] ล้าง Audit Log ที่เกิน `auditRetentionDays` ด้วย job ประจำ (ตอนนี้เก็บไว้ทั้งหมด)
- [ ] เข้ารหัสดิสก์ที่เก็บไฟล์แนบ/ฐานข้อมูล, สำรองข้อมูลอัตโนมัติรายวัน + ทดสอบกู้คืน
- [ ] ส่งอีเมลจริงผ่าน SMTP/SES แบบคิว (retry ได้)

## 5. เรื่องที่ต้องยืนยัน

ค่าตั้งต้นในระบบเป็นสมมติฐาน (ตรงกับคำถามในสไลด์ "การทดสอบและเรื่องที่ต้องยืนยัน") — ทั้งหมดปรับได้จากหน้าจอ ไม่ต้องแก้โค้ด ยกเว้นข้อที่ระบุ

| คำถาม | ค่าที่ตั้งไว้ | ปรับที่ |
|---|---|---|
| ลำดับอนุมัติของแต่ละสวัสดิการ | HR อนุมัติขั้นเดียว (HR อนุมัติของตัวเองไม่ได้) · แก้ผลหลังตัดสินต้องผ่านหัวหน้า HR | โค้ด: `TRANSITIONS` ใน `rules.ts` |
| วงเงินตามระดับตำแหน่ง | 4 ระดับ (ตัวอย่าง: ค่ารักษา L1-2 20,000 / L3 40,000 / L4 80,000) · ย้ายตำแหน่งกลางปีใช้วงเงินระดับใหม่ ยอดที่ใช้แล้วนับต่อ | `/hr/limits` (ผ่านหัวหน้า HR) |
| วันตัดรอบและวันจ่าย | อนุมัติภายในวันที่ 5 → จ่ายสิ้นเดือน | `/hr/payroll` |
| ใครแก้ไขคำขอได้ | เจ้าของคำขอเท่านั้น (ไม่มีการยื่นแทน) แก้ได้ก่อน HR ตรวจหรือเมื่อถูกส่งกลับ | โค้ด: `claims.ts` |
| เก็บ Audit Log นานเท่าใด | 1,825 วัน (5 ปี) | `/admin/settings` |
| วันหยุดบริษัท | วันหยุดราชการไทยปี 2569 (ตัวอย่าง — วันทางจันทรคติควรตรวจกับประกาศจริง) | `/hr/payroll` |

## 6. การทดสอบ

- `npm test` — 54 tests (รวม 7 tests กับฐานข้อมูล SQLite จริงที่ใช้ migration ทุกตัว): วันจ่ายเงิน, วงเงินตามระดับ (`resolveLimit`), ตัดยอด `computeApproved` (1,500 → 1,000), ครบ 30 ครั้ง, คืนสิทธิ์, ใบเสร็จซ้ำ, ข้อมูลการจ่ายตามวิธี, ลำดับสถานะ, เมนูตามบทบาท, HR อนุมัติของตัวเองไม่ได้, audit ก่อน–หลัง/ไม่มีข้อมูลสุขภาพ, Maker–Checker (ไม่อนุมัติ → ขอแก้ → หัวหน้า HR อนุมัติ), ติดตามใบเสร็จ 1 ใบตั้งแต่ยื่นจนจ่าย
- ทดสอบ E2E ด้วยเบราว์เซอร์กับฐานข้อมูลจริง: พนักงานยื่น + อัปโหลดไฟล์ → HR อนุมัติ (กล่องยืนยันยอด) → บัญชีบันทึกการจ่าย (บังคับเลขเช็ค/เลขอ้างอิง) → ผู้ดูแลระบบเห็น Audit Log ครบ → รีสตาร์ทเซิร์ฟเวอร์แล้วข้อมูลยังอยู่
- ทดสอบความปลอดภัย API 26 กรณี (ข้ามสิทธิ์, CSRF, ไฟล์ปลอม, รั่วข้อมูล, session หลังเปลี่ยนรหัสผ่าน)
