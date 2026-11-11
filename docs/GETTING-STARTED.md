# คู่มือเปิดโปรเจกต์และใช้งานฐานข้อมูล

คู่มือนี้พาตั้งแต่เครื่องเปล่าจนเปิดระบบได้ ใช้ได้ทั้ง Windows และ macOS (ใช้เวลาประมาณ 10–15 นาทีในครั้งแรก)

---

## 0. สิ่งที่ต้องติดตั้งก่อน (ครั้งเดียว)

| โปรแกรม | ใช้ทำอะไร | ดาวน์โหลด |
|---|---|---|
| **Node.js รุ่น LTS (20, 22 หรือ 24)** | รันโปรเจกต์ (มี `npm` มาด้วย) | https://nodejs.org → ปุ่ม LTS |
| **Visual Studio Code** | เปิด/แก้ไขโค้ด | https://code.visualstudio.com |
| Git (ไม่บังคับ) | ทำงานร่วมกันเป็นทีม | https://git-scm.com |

ตรวจว่าติดตั้ง Node.js แล้ว: เปิด Terminal / Command Prompt แล้วพิมพ์

```bash
node -v    # ควรได้ v20.x / v22.x / v24.x
npm -v
```

> ไม่ต้องติดตั้งโปรแกรมฐานข้อมูล — ค่าเริ่มต้นใช้ **SQLite** ซึ่งเป็นไฟล์เดียว (`prisma/dev.db`) สร้างให้อัตโนมัติ

---

## 1. แตกไฟล์โปรเจกต์

1. แตกไฟล์ `hr-benefits-system.zip` จะได้โฟลเดอร์ `hr-benefits`
2. แนะนำให้วางไว้ที่ path สั้น ๆ ไม่มีช่องว่าง เช่น `C:\projects\hr-benefits` หรือ `~/projects/hr-benefits`
   - หลีกเลี่ยงโฟลเดอร์ที่ซิงก์ OneDrive / iCloud (ทำให้ติดตั้งช้าและไฟล์ล็อก)

## 2. เปิดโฟลเดอร์ใน VS Code

1. เปิด VS Code → เมนู **File → Open Folder…** → เลือกโฟลเดอร์ `hr-benefits` (โฟลเดอร์ที่มีไฟล์ `package.json`)
2. ถ้าขึ้นถาม *Do you trust the authors?* → กด **Yes, I trust the authors**
3. เปิด Terminal ใน VS Code: เมนู **Terminal → New Terminal** (หรือกด `` Ctrl + ` ``)

## 3. ติดตั้งแพ็กเกจ

```bash
npm install
```

ครั้งแรกใช้เวลา 1–3 นาที (ดาวน์โหลด Next.js, Prisma และไดรเวอร์ฐานข้อมูล) — มีคำเตือน `npm warn` / `vulnerabilities` ขึ้นได้ ไม่เป็นไร

## 4. ตั้งค่าฐานข้อมูล (ครั้งเดียว)

```bash
npm run setup
```

คำสั่งนี้ทำ 4 อย่างให้อัตโนมัติ:
1. สร้างไฟล์ `.env` (ตั้งค่าระบบ) และสุ่มกุญแจ `SESSION_SECRET`
2. สร้าง Prisma Client
3. สร้างตารางทั้งหมดในฐานข้อมูล (`prisma migrate deploy`)
4. ใส่ข้อมูลตัวอย่าง: พนักงาน 10 คน สวัสดิการ 5 ประเภท คำขอ 8 รายการ

เห็นข้อความ **✔ พร้อมใช้งาน!** แปลว่าสำเร็จ

## 5. เปิดระบบ

```bash
npm run dev
```

รอจนขึ้น `Ready` แล้วเปิดเบราว์เซอร์ไปที่ **http://localhost:3000**

เข้าสู่ระบบด้วยรหัสพนักงานหรืออีเมลของบัญชีทดสอบ (รหัสผ่าน `1234`, PIN อนุมัติ `1234`): `EMP-0001` พนักงาน · `EMP-0003` สัญญาจ้าง · `EMP-0010` HR · `EMP-0020` หัวหน้า · `EMP-0030` บัญชี · `EMP-0050` ผู้ดูแลระบบ — หน้าเข้าสู่ระบบไม่แสดงรายชื่อ/บทบาท ระบบพาไปหน้าของบทบาทให้อัตโนมัติ

| รหัส | บทบาท |
|---|---|
| EMP-0001 | พนักงาน |
| EMP-0010 | HR |
| EMP-0020 | หัวหน้า |
| EMP-0030 | บัญชี / การเงิน |
| EMP-0050 | ผู้ดูแลระบบ |

**ลองทั้ง workflow:** EMP-0001 ยื่นเบิก → EMP-0010 ตรวจผ่าน → EMP-0020 อนุมัติ (PIN 1234) → EMP-0030 บันทึกจ่ายแล้ว → กลับไปดูที่ EMP-0001 จะเห็นสถานะ "จ่ายแล้ว"

> เปิดหลายเบราว์เซอร์/หลายเครื่องพร้อมกันได้ ข้อมูลอยู่ในฐานข้อมูลเดียวกัน
> ทดสอบจากมือถือในวง Wi-Fi เดียวกัน: `npm run build` แล้ว `npm start -- -H 0.0.0.0` จากนั้นเปิด `http://<IP ของคอมพิวเตอร์>:3000` บนมือถือ

**หยุดระบบ:** กด `Ctrl + C` ใน Terminal · **ครั้งต่อไป** รันแค่ `npm run dev`

---

## 6. ดูข้อมูลในฐานข้อมูล (Prisma Studio)

```bash
npm run db:studio
```

เปิด http://localhost:5555 จะเห็นทุกตาราง (Employee, Claim, AuditLog, …) ดู/ค้นหา/แก้ได้แบบตาราง Excel
> แก้ข้อมูลผ่าน Studio จะ **ไม่ถูกบันทึกใน Audit Log** — ใช้เพื่อดูหรือแก้ปัญหาเท่านั้น

## 7. คำสั่งที่ใช้บ่อย

| คำสั่ง | ใช้ทำอะไร |
|---|---|
| `npm run dev` | เปิดระบบโหมดพัฒนา (แก้โค้ดแล้วหน้าเว็บอัปเดตเอง) |
| `npm run db:studio` | ดูข้อมูลในฐานข้อมูล |
| `npm run db:reset` | **ล้างข้อมูลทั้งหมด** แล้วใส่ข้อมูลตัวอย่างใหม่ |
| `npm test` | รันชุดทดสอบ (กติกา, workflow, ฐานข้อมูลจริง) |
| `npm run build` แล้ว `npm start` | รันแบบ production |

## 8. โครงสร้างโฟลเดอร์ — แก้อะไรที่ไหน

```
hr-benefits/
├─ prisma/
│  ├─ schema.prisma        ← โครงสร้างตารางฐานข้อมูล
│  ├─ migrations/          ← ประวัติการสร้าง/แก้ตาราง (SQL)
│  ├─ seed.ts              ← ข้อมูลตัวอย่าง
│  └─ dev.db               ← ไฟล์ฐานข้อมูล SQLite (สร้างอัตโนมัติ)
├─ storage/uploads/        ← ไฟล์แนบที่ผู้ใช้อัปโหลด (แยกจากฐานข้อมูล)
├─ src/
│  ├─ app/                 ← หน้าเว็บแต่ละหน้า (โฟลเดอร์ = URL)
│  │  ├─ (app)/me/         ← หน้าพนักงาน   (/me, /me/new, …)
│  │  ├─ (app)/hr/         ← หน้า HR
│  │  ├─ (app)/manager/    ← หน้าหัวหน้า
│  │  ├─ (app)/finance/    ← หน้าบัญชี
│  │  ├─ (app)/admin/      ← หน้าผู้ดูแลระบบ
│  │  └─ api/              ← Backend API (login, rpc, files, audit)
│  ├─ components/          ← ชิ้นส่วนหน้าจอที่ใช้ซ้ำ (ฟอร์มยื่นเบิก, รายละเอียดคำขอ)
│  │  └─ ui/               ← คอมโพเนนต์พื้นฐานแบบ shadcn (ปุ่ม, การ์ด, ป้ายสถานะ, Modal)
│  └─ lib/
│     ├─ domain/rules.ts   ← กติกาธุรกิจ: วงเงิน, สิทธิ์, วันจ่ายเงิน
│     ├─ services/         ← ขั้นตอนการทำงาน + ตรวจสิทธิ์ + Audit Log
│     └─ server/           ← เชื่อมฐานข้อมูล, session, ไฟล์แนบ, ตัดข้อมูลตามสิทธิ์
├─ .env                    ← ตั้งค่าระบบ (ห้าม commit ขึ้น Git)
└─ docs/                   ← เอกสาร
```

**เพิ่มคอมโพเนนต์ shadcn/ui:** โปรเจกต์ตั้งค่า `components.json` ไว้แล้ว รัน `npx shadcn@latest add button` ไฟล์จะไปอยู่ที่ `src/components/ui/` อัตโนมัติ (เก็บคอมโพเนนต์ไว้ที่โฟลเดอร์นี้ที่เดียว เพื่อให้ import `@/components/ui/...` ตรงกับที่ shadcn CLI และคอมโพเนนต์จากเว็บต่าง ๆ คาดไว้)

**ตัวอย่าง:** อยากเปลี่ยนข้อความหน้าแรกของพนักงาน → `src/app/(app)/me/page.tsx` · อยากแก้กติกาวันจ่ายเงิน → `computePayDate` ใน `src/lib/domain/rules.ts`

## 9. แก้โครงสร้างฐานข้อมูล (เพิ่มคอลัมน์/ตาราง)

1. แก้ `prisma/schema.prisma` เช่น เพิ่ม `nickname String?` ใน `model Employee`
2. รัน `npx prisma migrate dev --name add-nickname` → Prisma สร้างไฟล์ SQL ใน `prisma/migrations/` และแก้ตารางให้
3. เพิ่มฟิลด์ใน `src/lib/domain/types.ts` และการแปลงข้อมูลใน `src/lib/server/persist.ts`

## 10. เปลี่ยนไปใช้ PostgreSQL (เมื่อพร้อมขึ้นเซิร์ฟเวอร์จริง)

โค้ดเลือกไดรเวอร์ให้อัตโนมัติจาก `DATABASE_URL` — ทำตามนี้:

1. เตรียม PostgreSQL: ติดตั้งเอง, ใช้ Docker (`docker compose -f docker-compose.postgres.yml up -d`) หรือบริการฟรีอย่าง Supabase / Neon
2. แก้ `prisma/schema.prisma` บรรทัด `provider = "sqlite"` → `provider = "postgresql"`
3. แก้ `.env`: `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/hr_benefits"`
4. ลบโฟลเดอร์ `prisma/migrations` (เป็น SQL ของ SQLite)
5. รัน
   ```bash
   npx prisma migrate dev --name init
   npm run db:seed
   npm run dev
   ```

## 11. แก้ปัญหาที่พบบ่อย

| อาการ | วิธีแก้ |
|---|---|
| `'npm' is not recognized` / `command not found: npm` | ยังไม่ได้ติดตั้ง Node.js หรือยังไม่ได้ปิด-เปิด VS Code ใหม่หลังติดตั้ง |
| Windows: `running scripts is disabled on this system` | ใน Terminal เปลี่ยนเป็น Command Prompt (ลูกศร ˅ ข้างปุ่ม + → Command Prompt) หรือรัน `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` ใน PowerShell |
| `npm install` ล้มเหลวที่ `better-sqlite3` | ใช้ Node.js รุ่น LTS (20/22/24) → ลบโฟลเดอร์ `node_modules` และไฟล์ `package-lock.json` แล้ว `npm install` ใหม่ |
| `Failed to fetch ... binaries.prisma.sh` | เครือข่ายบล็อกการดาวน์โหลดของ Prisma — ลองเน็ตบ้าน/มือถือ หรือติดต่อผู้ดูแลเครือข่าย |
| `Port 3000 is in use` | ปิดโปรแกรมที่ใช้อยู่ หรือรัน `npm run dev -- -p 3001` |
| หน้าเว็บขึ้น "เชื่อมต่อเซิร์ฟเวอร์/ฐานข้อมูลไม่สำเร็จ" | ยังไม่ได้รัน `npm run setup` หรือไฟล์ `.env` หาย |
| เข้าสู่ระบบผิด 5 ครั้งแล้วโดนล็อก | รอ 15 นาที หรือหยุดแล้วรัน `npm run dev` ใหม่ |
| อยากเริ่มข้อมูลใหม่ทั้งหมด | `npm run db:reset` |

## 12. ก่อนใช้งานจริง (Production checklist)

- [ ] ตั้ง `SHOW_DEMO_ACCOUNTS="false"` (ไม่ส่งรายชื่อบัญชีทดสอบออกจาก API) และเปลี่ยนรหัสผ่าน/PIN ของทุกบัญชีตัวอย่าง (หรือลบข้อมูลตัวอย่าง)
- [ ] `SESSION_SECRET` เป็นค่าสุ่มยาว ≥ 32 ตัวอักษร และไม่ commit ไฟล์ `.env`
- [ ] ใช้ HTTPS (cookie จะเปิด `Secure` อัตโนมัติเมื่อเข้าผ่าน https)
- [ ] สำรองข้อมูลประจำวัน: ไฟล์ฐานข้อมูล (หรือ `pg_dump`) **และ** โฟลเดอร์ `storage/uploads`
- [ ] รัน `npm run build` แล้ว `npm start` (หรือใช้ PM2 / Docker) — รัน instance เดียว หรือเปลี่ยนเป็น PostgreSQL + advisory lock ก่อนขยายหลาย instance
- [ ] ต่ออีเมลจริง: แก้ฟังก์ชัน `sendEmail()` ใน `src/lib/services/core.ts` ให้ส่งผ่าน SMTP/SES (ตอนนี้บันทึกลงตาราง EmailMessage เป็นกล่องขาออก)
