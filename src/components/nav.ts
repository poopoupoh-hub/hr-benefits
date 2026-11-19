import {
  BarChart3,
  Building2,
  CalendarClock,
  ClipboardCheck,
  FileClock,
  FilePlus2,
  FilePen,
  FileText,
  Gift,
  Home,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Mail,
  Network,
  Scale,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Permission, Role } from "@/lib/domain/types";

export interface NavItem {
  href: string;
  label: string;
  short?: string;
  icon: LucideIcon;
  perm: Permission;
  group: string;
  /** แสดงในแถบล่าง (มือถือ) ของ role เหล่านี้ */
  primaryFor?: Role[];
}

export const NAV: NavItem[] = [
  { href: "/me", label: "หน้าแรก", icon: Home, perm: "self.claim", group: "สวัสดิการของฉัน", primaryFor: ["employee", "finance"] },
  { href: "/me/new", label: "ยื่นเบิกสวัสดิการ", short: "ยื่นเบิก", icon: FilePlus2, perm: "self.claim", group: "สวัสดิการของฉัน", primaryFor: ["employee"] },
  { href: "/me/claims", label: "รายการของฉัน", icon: ListChecks, perm: "self.claim", group: "สวัสดิการของฉัน", primaryFor: ["employee"] },
  { href: "/me/org", label: "โครงสร้างองค์กร", short: "องค์กร", icon: Network, perm: "self.claim", group: "สวัสดิการของฉัน" },

  { href: "/hr", label: "คำขอรอตรวจ", short: "รอตรวจ", icon: ClipboardCheck, perm: "claim.review", group: "ฝ่ายบุคคล (HR)", primaryFor: ["hr", "hr_head"] },
  { href: "/hr/claims", label: "คำขอทั้งหมด", icon: FileText, perm: "claim.review", group: "ฝ่ายบุคคล (HR)" },
  { href: "/hr/changes", label: "คำขอแก้ไข", short: "คำขอแก้", icon: FilePen, perm: "change.request", group: "ฝ่ายบุคคล (HR)", primaryFor: ["hr_head"] },
  { href: "/hr/employees", label: "ข้อมูลพนักงาน", short: "พนักงาน", icon: Users, perm: "employee.view", group: "ฝ่ายบุคคล (HR)", primaryFor: ["hr"] },
  { href: "/hr/org", label: "โครงสร้างองค์กร / ตำแหน่ง", short: "องค์กร", icon: Building2, perm: "org.manage", group: "ฝ่ายบุคคล (HR)" },
  { href: "/hr/benefits", label: "ประเภทสวัสดิการ", short: "สวัสดิการ", icon: Gift, perm: "benefit.manage", group: "ฝ่ายบุคคล (HR)", primaryFor: ["hr"] },
  { href: "/hr/limits", label: "วงเงินตามระดับ", icon: Scale, perm: "benefit.manage", group: "ฝ่ายบุคคล (HR)" },
  { href: "/hr/payroll", label: "วันตัดรอบ / วันหยุด", icon: CalendarClock, perm: "payroll.settings", group: "ฝ่ายบุคคล (HR)" },

  { href: "/finance", label: "รายการรอจ่าย", short: "รอจ่าย", icon: Wallet, perm: "payment.view", group: "บัญชี / การเงิน", primaryFor: ["finance"] },
  { href: "/reports", label: "รายงานยอดเบิก", short: "รายงาน", icon: BarChart3, perm: "report.view", group: "รายงาน", primaryFor: ["finance", "hr_head"] },

  { href: "/admin", label: "ภาพรวมระบบ", short: "ภาพรวม", icon: LayoutDashboard, perm: "system.manage", group: "ผู้ดูแลระบบ", primaryFor: ["admin"] },
  { href: "/admin/users", label: "ผู้ใช้", icon: KeyRound, perm: "user.manage", group: "ผู้ดูแลระบบ", primaryFor: ["admin"] },
  { href: "/admin/rbac", label: "สิทธิ์การเข้าถึง (RBAC)", icon: ShieldCheck, perm: "rbac.manage", group: "ผู้ดูแลระบบ" },
  { href: "/audit", label: "Audit Log", icon: FileClock, perm: "audit.view", group: "ผู้ดูแลระบบ", primaryFor: ["admin"] },
  { href: "/admin/emails", label: "อีเมลแจ้งเตือน", icon: Mail, perm: "system.manage", group: "ผู้ดูแลระบบ" },
  { href: "/admin/settings", label: "ตั้งค่าระบบ", short: "ตั้งค่า", icon: Settings, perm: "system.manage", group: "ผู้ดูแลระบบ" },
];

export const HOME_BY_ROLE: Record<Role, string> = {
  employee: "/me",
  hr: "/hr",
  hr_head: "/hr",
  finance: "/finance",
  admin: "/admin",
};
