"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { HOME_BY_ROLE } from "@/components/nav";
import { useMe, useSessionUserId } from "@/lib/hooks";

export default function Index() {
  const router = useRouter();
  const sid = useSessionUserId();
  const me = useMe();
  useEffect(() => {
    if (sid === undefined) return;
    router.replace(me ? HOME_BY_ROLE[me.role] : "/login");
  }, [sid, me, router]);
  return <div className="grid min-h-dvh place-items-center text-sm text-zinc-400">กำลังโหลด…</div>;
}
