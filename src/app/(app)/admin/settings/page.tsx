"use client";
import { DatabaseBackup, RotateCcw, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Page } from "@/components/AppShell";
import { Alert, Button, Card, Field, Input, KV, Modal, SectionTitle, Select, Switch, useAction, useToast } from "@/components/ui";
import type { Settings } from "@/lib/domain/types";
import { DB_VERSION } from "@/lib/domain/constants";
import { dateTimeFullTH, downloadBlob, fileSize } from "@/lib/format";
import { DB_KEY } from "@/lib/data/db";
import { useDB } from "@/lib/hooks";
import { api } from "@/lib/client/api";

export default function SystemSettings() {
  const db = useDB();
  const act = useAction();
  const toast = useToast();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState<Settings["email"]>(db.settings.email);
  const [orgName, setOrgName] = useState(db.settings.orgName);
  const [retention, setRetention] = useState(db.settings.auditRetentionDays);
  const [confirmReset, setConfirmReset] = useState(false);
  const setE = <K extends keyof Settings["email"]>(k: K, v: Settings["email"][K]) => setEmail((x) => ({ ...x, [k]: v }));

  return (
    <Page title="ตั้งค่าระบบ" perm="system.manage">
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle className="mt-0">ทั่วไป และ Email Service</SectionTitle>
          <Card className="space-y-3 p-4">
            <Field label="ชื่อองค์กร">
              <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} />
            </Field>
            <div className="flex items-center justify-between rounded-xl border border-zinc-200 p-3">
              <div>
                <p className="text-sm font-medium">ส่งอีเมลแจ้งเตือน</p>
                <p className="text-xs text-zinc-500">แจ้งผู้ยื่น HR หัวหน้า และบัญชีทุกขั้นตอน</p>
              </div>
              <Switch checked={email.enabled} onChange={(v) => setE("enabled", v)} label="ส่งอีเมล" />
            </div>
            <Field label="ผู้ให้บริการ" hint="โหมดจำลองเก็บอีเมลไว้ในกล่องขาออก — เปลี่ยนเป็น SMTP/API เมื่อเชื่อม Backend">
              <Select value={email.provider} onChange={(e) => setE("provider", e.target.value as Settings["email"]["provider"])}>
                <option value="mock">จำลอง (Mock outbox)</option>
                <option value="smtp">SMTP</option>
                <option value="api">Email API (เช่น SES / SendGrid)</option>
              </Select>
            </Field>
            {email.provider === "smtp" && (
              <Field label="SMTP Host">
                <Input value={email.smtpHost ?? ""} onChange={(e) => setE("smtpHost", e.target.value)} placeholder="smtp.company.example:587" />
              </Field>
            )}
            <Field label="อีเมลผู้ส่ง">
              <Input value={email.fromAddress} onChange={(e) => setE("fromAddress", e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="กล่องอีเมล HR">
                <Input value={email.hrInbox} onChange={(e) => setE("hrInbox", e.target.value)} />
              </Field>
              <Field label="กล่องอีเมลบัญชี">
                <Input value={email.financeInbox} onChange={(e) => setE("financeInbox", e.target.value)} />
              </Field>
            </div>
            <Field label="เก็บ Audit Log (วัน)" hint="ขั้นต่ำ 365 วัน">
              <Input type="number" min={365} value={retention} onChange={(e) => setRetention(Number(e.target.value))} />
            </Field>
            <Button className="w-full" onClick={() => act(() => api.updateSystemSettings({ email, orgName, auditRetentionDays: retention }), "บันทึกการตั้งค่าระบบแล้ว")}>
              บันทึก
            </Button>
          </Card>
        </div>

        <div>
          <SectionTitle className="mt-0">สำรองและกู้คืนข้อมูล</SectionTitle>
          <Card className="space-y-3 p-4">
            <KV k="สำรองล่าสุด" v={db.settings.backup.lastBackupAt ? dateTimeFullTH(db.settings.backup.lastBackupAt) : "ยังไม่เคย"} />
            <KV k="ข้อมูล" v={`${db.employees.length} พนักงาน · ${db.claims.length} คำขอ`} />
            <Button
              variant="dark"
              className="w-full"
              icon={<DatabaseBackup className="size-4" />}
              onClick={async () => {
                const json = await act(() => api.exportBackup());
                if (typeof json === "string") {
                  downloadBlob(`hr-benefits-backup-${new Date().toISOString().slice(0, 10)}.json`, new Blob([json], { type: "application/json" }));
                  toast("ดาวน์โหลดไฟล์สำรองแล้ว");
                }
              }}
            >
              สำรองข้อมูล (ดาวน์โหลด JSON)
            </Button>
            <Button variant="secondary" className="w-full" icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()}>
              กู้คืนจากไฟล์สำรอง
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const text = await f.text();
                e.target.value = "";
                const ok = await act(() => api.restoreBackup(text), "กู้คืนข้อมูลเรียบร้อย — กรุณาเข้าสู่ระบบใหม่หากถูกออกจากระบบ");
                if (ok) router.refresh();
              }}
            />
            <p className="text-xs text-zinc-500">ไฟล์สำรอง (JSON) มีข้อมูลทุกตารางรวม Audit Log · ไฟล์แนบ (IndexedDB) ไม่รวมในไฟล์สำรอง · ข้อมูลอยู่ในเบราว์เซอร์นี้เท่านั้น ล้างข้อมูลเว็บไซต์/เปลี่ยนเครื่อง = ข้อมูลหาย ควรสำรองสม่ำเสมอ</p>
          </Card>

          <SectionTitle>ข้อมูลระบบ</SectionTitle>
          <Card className="p-4">
            <KV k="เวอร์ชัน" v="1.0.0" />
            <KV k="Schema" v={`v${DB_VERSION}`} />
            <KV k="ที่เก็บข้อมูล" v="localStorage ของเบราว์เซอร์ (คีย์ hr-benefits:db)" />
            <KV k="พื้นที่ที่ใช้" v={<StorageUsage />} />
            <KV k="ที่เก็บไฟล์แนบ" v="IndexedDB ของเบราว์เซอร์ (แยกจากข้อมูลหลัก)" />
          </Card>

          <SectionTitle>Danger zone</SectionTitle>
          <Alert tone="error">
            <p>รีเซ็ตกลับเป็นข้อมูลตัวอย่าง (Mock data) — ข้อมูลและไฟล์แนบทั้งหมดในเบราว์เซอร์นี้จะถูกแทนที่</p>
            <Button variant="danger" size="sm" className="mt-2" icon={<RotateCcw className="size-4" />} onClick={() => setConfirmReset(true)}>
              รีเซ็ตข้อมูลเดโม
            </Button>
          </Alert>
        </div>
      </div>
      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        size="sm"
        title="ยืนยันรีเซ็ตข้อมูล"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmReset(false)}>
              ยกเลิก
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                const ok = await act(() => api.resetDemo(), "รีเซ็ตข้อมูลแล้ว");
                setConfirmReset(false);
                if (ok) router.replace("/login");
              }}
            >
              รีเซ็ต
            </Button>
          </>
        }
      >
        <p className="text-sm text-zinc-600">แนะนำให้สำรองข้อมูลก่อน การรีเซ็ตไม่สามารถย้อนกลับได้</p>
      </Modal>
    </Page>
  );
}

/** ขนาดข้อมูลใน localStorage (เบราว์เซอร์ส่วนใหญ่จำกัด ~5 MB ต่อเว็บไซต์) */
function StorageUsage() {
  const [bytes] = useState(() => {
    try {
      return (localStorage.getItem(DB_KEY)?.length ?? 0) * 2;
    } catch {
      return 0;
    }
  });
  const pct = Math.min(100, (bytes / (5 * 1024 * 1024)) * 100);
  return (
    <span className={pct > 80 ? "text-red-600" : undefined}>
      {fileSize(bytes)} / ~5 MB ({pct.toFixed(0)}%)
    </span>
  );
}
