"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Page } from "@/components/AppShell";
import { ClaimDetail, canViewClaim } from "@/components/ClaimDetail";
import { Empty } from "@/components/ui";
import { useCan, useDB, useMe } from "@/lib/hooks";

function Detail() {
  const db = useDB();
  const me = useMe()!;
  const can = useCan();
  const router = useRouter();
  const id = useSearchParams().get("id");
  const c = db.claims.find((x) => x.id === id);
  if (!c) return <Empty title="ไม่พบคำขอ" />;
  if (!canViewClaim(db, me, c, can)) return <Empty title="ไม่มีสิทธิ์ดูคำขอนี้">ข้อมูลคำขอเป็นข้อมูลส่วนบุคคล</Empty>;
  return <ClaimDetail c={c} onDone={() => router.refresh()} />;
}

function Title() {
  const db = useDB();
  const id = useSearchParams().get("id");
  return <>{db.claims.find((x) => x.id === id)?.no ?? "รายละเอียดคำขอ"}</>;
}

export default function ClaimPage() {
  return (
    <Page
      back={true}
      title={
        <Suspense>
          <Title />
        </Suspense>
      }
    >
      <div className="mx-auto max-w-xl">
        <Suspense>
          <Detail />
        </Suspense>
      </div>
    </Page>
  );
}
