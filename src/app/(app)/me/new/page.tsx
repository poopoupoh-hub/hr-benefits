"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Page } from "@/components/AppShell";
import { ClaimForm } from "@/components/ClaimForm";
import { useMe } from "@/lib/hooks";

function NewClaim() {
  const me = useMe()!;
  const router = useRouter();
  const params = useSearchParams();
  return <ClaimForm key={params.get("b") ?? ""} initialBenefitId={params.get("b") ?? undefined} employeeId={me.id} onDone={(c) => router.push(`/claim?id=${c.id}`)} />;
}

export default function NewClaimPage() {
  return (
    <Page title="ยื่นเบิกสวัสดิการ" perm="self.claim" back="/me">
      <div className="mx-auto max-w-xl">
        <Suspense>
          <NewClaim />
        </Suspense>
      </div>
    </Page>
  );
}
