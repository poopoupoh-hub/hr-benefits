"use client";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { ROLE_LABEL } from "@/lib/domain/constants";
import type { AuditLog, Database } from "@/lib/domain/types";
import { dateTimeFullTH } from "@/lib/format";
import { fullName } from "@/lib/services/core";
import { Badge } from "./ui";

const fmtVal = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

export function AuditRow({ log, db }: { log: AuditLog; db: Database }) {
  const [open, setOpen] = useState(false);
  const actor = db.employees.find((e) => e.id === log.actorId);
  const b = (log.before ?? {}) as Record<string, unknown>;
  const a = (log.after ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  const hasDiff = keys.length > 0 && typeof log.before !== "string";
  return (
    <div className="px-4 py-3">
      <button className="flex w-full items-start gap-3 text-left" onClick={() => hasDiff && setOpen(!open)} aria-expanded={open}>
        <div className="min-w-0 flex-1">
          <p className="text-sm">{log.summary}</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {dateTimeFullTH(log.at)} · {actor ? `${fullName(actor)}${log.actorRole ? ` (${ROLE_LABEL[log.actorRole]})` : ""}` : "ระบบ / ไม่ระบุตัวตน"}
          </p>
        </div>
        <Badge tone={log.action.includes("fail") ? "red" : log.action === "approve" || log.action === "record_payment" || log.action === "change_approve" ? "green" : "gray"}>{log.action}</Badge>
        {hasDiff && <ChevronDown className={`mt-0.5 size-4 shrink-0 text-zinc-400 transition ${open ? "rotate-180" : ""}`} />}
      </button>
      {open && (
        <div className="mt-2 overflow-x-auto rounded-xl border border-zinc-100">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">ฟิลด์</th>
                <th className="px-3 py-1.5 text-left font-medium">ก่อน</th>
                <th className="px-3 py-1.5 text-left font-medium">หลัง</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k} className="border-t border-zinc-100 align-top">
                  <td className="px-3 py-1.5 font-mono text-zinc-500">{k}</td>
                  <td className="max-w-[220px] break-all px-3 py-1.5 text-red-700">{fmtVal(b[k])}</td>
                  <td className="max-w-[220px] break-all px-3 py-1.5 text-emerald-700">{fmtVal(a[k])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
