"use client";
import { Lock } from "lucide-react";
import { Fragment } from "react";
import { Page } from "@/components/AppShell";
import { Alert, Card, Switch, useAction } from "@/components/ui";
import { ALL_PERMISSIONS, DEFAULT_RBAC, FORBIDDEN_PERMISSIONS, PERMISSION_LABEL, REQUIRED_PERMISSIONS, ROLE_LABEL, ROLE_ORDER } from "@/lib/domain/constants";
import { cx } from "@/lib/format";
import { useDB } from "@/lib/hooks";
import { api } from "@/lib/client/api";

export default function RbacPage() {
  const db = useDB();
  const act = useAction();
  const groups = [...new Set(ALL_PERMISSIONS.map((p) => PERMISSION_LABEL[p].group))];
  return (
    <Page title="สิทธิ์การเข้าถึง (RBAC)" perm="rbac.manage" wide>
      <Alert tone="info" className="mb-4">
        กำหนดสิทธิ์ของแต่ละ Role — สิทธิ์ที่มีไอคอน <Lock className="inline size-3" /> ถูกล็อกตามหลักแยกหน้าที่ (Least Privilege) เช่น ผู้ดูแลระบบไม่สามารถอนุมัติคำขอเบิก และฝ่ายบัญชีไม่เห็นข้อมูลส่วนตัวพนักงาน
      </Alert>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
              <th className="px-4 py-3 font-medium">สิทธิ์</th>
              {ROLE_ORDER.map((r) => (
                <th key={r} className="px-2 py-3 text-center font-medium">
                  {ROLE_LABEL[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g}>
                <tr className="bg-zinc-50">
                  <td colSpan={6} className="px-4 py-1.5 text-xs font-semibold text-zinc-600">
                    {g}
                  </td>
                </tr>
                {ALL_PERMISSIONS.filter((p) => PERMISSION_LABEL[p].group === g).map((p) => (
                  <tr key={p} className="border-t border-zinc-100">
                    <td className="px-4 py-2.5">
                      {PERMISSION_LABEL[p].label}
                      <span className="block font-mono text-[11px] text-zinc-400">{p}</span>
                    </td>
                    {ROLE_ORDER.map((r) => {
                      const forbidden = FORBIDDEN_PERMISSIONS[r]?.includes(p);
                      const required = REQUIRED_PERMISSIONS[r]?.includes(p);
                      const on = db.rbac[r].includes(p) && !forbidden;
                      const changed = on !== DEFAULT_RBAC[r].includes(p);
                      return (
                        <td key={r} className="px-2 py-2.5 text-center">
                          <span className={cx("inline-flex items-center gap-1", changed && "rounded-full ring-2 ring-amber-300")}>
                            {forbidden || required ? (
                              <span title={forbidden ? "ห้ามให้สิทธิ์นี้" : "สิทธิ์จำเป็น"} className={cx("inline-flex items-center gap-1 text-xs", forbidden ? "text-zinc-300" : "text-brand-600")}>
                                <Lock className="size-3.5" />
                                {required && "✓"}
                              </span>
                            ) : (
                              <Switch checked={on} onChange={(v) => act(() => api.setRolePermission(r, p, v), `${v ? "เพิ่ม" : "ถอน"}สิทธิ์แล้ว`)} label={`${p} ${r}`} />
                            )}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="mt-2 text-xs text-zinc-500">กรอบสีเหลือง = ต่างจากค่าเริ่มต้น · ทุกการเปลี่ยนแปลงบันทึกใน Audit Log</p>
    </Page>
  );
}
