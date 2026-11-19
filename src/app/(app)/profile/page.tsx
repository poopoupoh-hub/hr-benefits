"use client";
import { useState } from "react";
import { Page } from "@/components/AppShell";
import { Button, Card, Field, Input, KV, SectionTitle, useAction } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/domain/constants";
import { useDB, useMe } from "@/lib/hooks";
import { fullName } from "@/lib/services/core";
import { api } from "@/lib/client/api";

export default function Profile() {
  const db = useDB();
  const me = useMe()!;
  const act = useAction();
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const perms = db.rbac[me.role];
  return (
    <Page title="โปรไฟล์และความปลอดภัย" back={true}>
      <div className="mx-auto max-w-xl">
        <Card className="p-4">
          <KV k="ชื่อ" v={fullName(me)} />
          <KV k="รหัสพนักงาน" v={me.code} />
          <KV k="อีเมล" v={me.email} />
          <KV k="บทบาท" v={ROLE_LABEL[me.role]} />
          <KV k="สิทธิ์ที่ได้รับ" v={<span className="font-normal text-zinc-600">{perms.length} รายการ</span>} />
        </Card>

        <SectionTitle className="mt-6">เปลี่ยนรหัสผ่าน</SectionTitle>
        <Card className="space-y-3 p-4">
          <Field label="รหัสผ่านปัจจุบัน">
            <Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="รหัสผ่านใหม่">
              <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
            </Field>
            <Field label="ยืนยันรหัสผ่านใหม่" error={pw2 && pw !== pw2 ? "ไม่ตรงกัน" : undefined}>
              <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
            </Field>
          </div>
          <Button
            disabled={!cur || !pw || pw !== pw2}
            onClick={() =>
              act(() => api.changeOwnPassword(cur, pw), "เปลี่ยนรหัสผ่านแล้ว").then((ok) => {
                if (!ok) return;
                setCur("");
                setPw("");
                setPw2("");
              })
            }
          >
            บันทึกรหัสผ่าน
          </Button>
        </Card>

      </div>
    </Page>
  );
}
