"use client";
import { Mail } from "lucide-react";
import { useState } from "react";
import { Page } from "@/components/AppShell";
import { Alert, Badge, Card, Empty, Modal } from "@/components/ui";
import type { EmailMessage } from "@/lib/domain/types";
import { dateTimeFullTH } from "@/lib/format";
import { fetchEmails } from "@/lib/client/api";
import { useAsync, useDB } from "@/lib/hooks";

export default function EmailsPage() {
  const db = useDB();
  const [open, setOpen] = useState<EmailMessage | null>(null);
  const { data, loading, error } = useAsync(() => fetchEmails(), [db]);
  const emails = data ?? [];
  return (
    <Page title="อีเมลแจ้งเตือน" perm="system.manage">
      <Alert tone={db.settings.email.enabled ? "info" : "warn"} className="mb-4">
        Email Service: <b>{db.settings.email.provider === "mock" ? "โหมดจำลอง (บันทึกในกล่องขาออก)" : db.settings.email.provider.toUpperCase()}</b> · {db.settings.email.enabled ? "เปิดใช้งาน" : "ปิดอยู่ — อีเมลจะถูกข้าม"} · ผู้ส่ง {db.settings.email.fromAddress}
      </Alert>
      <Card className="divide-y divide-zinc-100">
        {emails.map((m) => (
          <button key={m.id} onClick={() => setOpen(m)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-zinc-50">
            <Mail className="mt-0.5 size-4 shrink-0 text-zinc-400" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{m.subject}</p>
              <p className="truncate text-xs text-zinc-500">
                ถึง {m.to.join(", ")} · {dateTimeFullTH(m.at)}
              </p>
            </div>
            <Badge tone={m.status === "sent" ? "green" : "gray"}>{m.status === "sent" ? "ส่งแล้ว" : "ข้าม"}</Badge>
          </button>
        ))}
      </Card>
      {loading && <p className="mt-3 text-sm text-zinc-500">กำลังโหลด…</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {!loading && emails.length === 0 && <Empty title="ยังไม่มีอีเมล" />}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.subject ?? ""}>
        {open && (
          <div className="space-y-2 text-sm">
            <p className="text-zinc-500">จาก: {db.settings.email.fromAddress}</p>
            <p className="text-zinc-500">ถึง: {open.to.join(", ")}</p>
            <p className="text-zinc-500">เหตุการณ์: {open.event}</p>
            <div className="whitespace-pre-line rounded-xl bg-zinc-50 p-4">{open.body}</div>
          </div>
        )}
      </Modal>
    </Page>
  );
}
