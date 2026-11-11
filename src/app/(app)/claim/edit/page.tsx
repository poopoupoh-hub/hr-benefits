"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Page } from "@/components/AppShell";
import { ClaimForm } from "@/components/ClaimForm";
import { Empty } from "@/components/ui";
import { useDB, useMe } from "@/lib/hooks";

function Edit() {
  const db = useDB();
  const me = useMe()!;
  const router = useRouter();
  const id = useSearchParams().get("id");
  const c = db.claims.find((x) => x.id === id);
  if (!c) return <Empty title="ไม่พบคำขอ" />;
  if (c.employeeId !== me.id && c.filedById !== me.id) return <Empty title="แก้ไขได้เฉพาะผู้ยื่นคำขอ" />;
  if (!["pending_hr", "returned"].includes(c.status)) return <Empty title="คำขอนี้แก้ไขไม่ได้แล้ว">แก้ไขได้ก่อน HR ตรวจ หรือเมื่อถูกส่งกลับแก้ไข</Empty>;
  const b = db.benefitTypes.find((x) => x.id === c.benefitTypeId);
  return (
    <>
      <p className="mb-4 text-sm text-zinc-500">
        {c.no} · {b?.name}
      </p>
      <ClaimForm employeeId={c.employeeId} editing={c} onDone={() => router.push(`/claim?id=${c.id}`)} />
    </>
  );
}

export default function EditClaimPage() {
  return (
    <Page title="แก้ไขคำขอ" back={true}>
      <div className="mx-auto max-w-xl">
        <Suspense>
          <Edit />
        </Suspense>
      </div>
    </Page>
  );
}
