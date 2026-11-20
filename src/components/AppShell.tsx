"use client";
import { ChevronLeft, ChevronRight, CornerDownLeft, LogOut, Menu, Search, Settings, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ROLE_LABEL } from "@/lib/domain/constants";
import type { Permission } from "@/lib/domain/types";
import { cx } from "@/lib/format";
import { useAppState, useCan, useMe, useSessionUserId } from "@/lib/hooks";
import { logout } from "@/lib/client/api";
import { LogoMark, ORG_NAME } from "./Logo";
import { HOME_BY_ROLE, NAV, type NavItem } from "./nav";
import { Avatar, Badge, Button, Empty, Modal } from "./ui";

const ROOTS = new Set(["/me", "/hr", "/admin", "/finance"]);
function isActive(pathname: string, href: string) {
  if (ROOTS.has(href)) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

/** เมนูที่ตรงกับหน้าปัจจุบัน (ใช้ทำ breadcrumb) */
function currentNav(pathname: string): NavItem | undefined {
  return NAV.filter((n) => isActive(pathname, n.href)).sort((a, b) => b.href.length - a.href.length)[0];
}

function useSignOut() {
  const router = useRouter();
  return async () => {
    await logout();
    router.replace("/login");
  };
}

function useVisibleNav() {
  const can = useCan();
  const items = useMemo(() => NAV.filter((n) => can(n.perm)), [can]);
  const groups = useMemo(() => {
    const m = new Map<string, NavItem[]>();
    for (const i of items) m.set(i.group, [...(m.get(i.group) ?? []), i]);
    return [...m.entries()];
  }, [items]);
  return { items, groups };
}

export function AppShell({ children }: { children: ReactNode }) {
  const sessionId = useSessionUserId();
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const orgName = useAppState().db?.settings.orgName;
  const [menu, setMenu] = useState(false);
  const signOut = useSignOut();
  const { items, groups } = useVisibleNav();

  useEffect(() => {
    if (sessionId === null || (sessionId && !me) || (me && !me.active)) router.replace("/login");
  }, [sessionId, me, router]);

  if (!me) return <div className="grid min-h-dvh place-items-center text-sm text-zinc-500">กำลังโหลด…</div>;
  const primary = items.filter((i) => i.primaryFor?.includes(me.role)).slice(0, 3);

  return (
    <div className="bg-warm min-h-dvh lg:p-3">
      <div className="app-frame min-h-dvh bg-canvas lg:flex lg:h-[calc(100dvh-1.5rem)] lg:min-h-0 lg:overflow-hidden lg:rounded-[28px] lg:shadow-[0_30px_80px_-30px_rgba(120,60,20,.35)] lg:ring-1 lg:ring-white/80">
        {/* Sidebar (desktop) */}
        <aside className="no-print hidden w-[264px] shrink-0 flex-col border-r border-zinc-200 bg-sidebar lg:flex">
          <Link href={HOME_BY_ROLE[me.role]} className="flex h-[76px] shrink-0 items-center gap-3 border-b border-zinc-200 px-6">
            <LogoMark className="size-8 text-brand-400" />
            <span className="line-clamp-2 min-w-0 text-[15px] font-semibold leading-snug text-ink-900">{orgName ?? ORG_NAME}</span>
          </Link>

          <nav className="scrollbar-none flex-1 overflow-y-auto px-4 pb-4" aria-label="เมนูหลัก">
            {groups.map(([g, list]) => (
              <div key={g} className="border-b border-zinc-200 py-4 last:border-0">
                <p className="px-3 pb-2 text-[13.5px] text-zinc-500">{g}</p>
                {list.map((i) => {
                  const active = isActive(pathname, i.href);
                  return (
                    <Link
                      key={i.href}
                      href={i.href}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "mb-0.5 flex min-h-11 items-center gap-3 rounded-xl px-3 text-[14.5px] transition",
                        active ? "bg-brand-100/80 font-medium text-brand-600" : "text-ink-800 hover:bg-white/70",
                      )}
                    >
                      <i.icon className={cx("size-[19px] shrink-0", active ? "text-brand-500" : "text-zinc-600")} strokeWidth={1.7} />
                      <span className="truncate">{i.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="shrink-0 p-4 pt-0">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_1px_2px_rgba(80,40,10,.04)]">
              <Link href="/profile" className="flex items-center gap-3 rounded-lg">
                <Avatar name={me.firstName} className="size-10" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-ink-900">
                    {me.firstName} {me.lastName}
                  </span>
                  <span className="block truncate text-xs text-zinc-500">
                    {me.code} · {ROLE_LABEL[me.role]}
                  </span>
                </span>
              </Link>
              <Button variant="secondary" className="mt-3 w-full" icon={<LogOut className="size-4" />} onClick={signOut}>
                ออกจากระบบ
              </Button>
            </div>
          </div>
        </aside>

        <div className="app-scroll min-w-0 flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:overflow-y-auto lg:pb-0">{children}</div>
      </div>

      {/* Bottom nav (mobile) */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="เมนูด่วน">
        <div className="mx-auto flex max-w-xl">
          {primary.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={cx("flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]", isActive(pathname, i.href) ? "font-medium text-brand-500" : "text-zinc-500")}
            >
              <i.icon className="size-5" />
              {i.short ?? i.label}
            </Link>
          ))}
          <button onClick={() => setMenu(true)} className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] text-zinc-500">
            <Menu className="size-5" />
            เมนู
          </button>
        </div>
      </nav>

      <Modal open={menu} onClose={() => setMenu(false)} title="เมนูทั้งหมด">
        <Link href="/profile" onClick={() => setMenu(false)} className="mb-3 flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
          <Avatar name={me.firstName} />
          <span className="text-sm">
            <span className="block font-medium">
              {me.firstName} {me.lastName}
            </span>
            <span className="text-xs text-zinc-500">
              {me.code} · {ROLE_LABEL[me.role]}
            </span>
          </span>
        </Link>
        {groups.map(([g, list]) => (
          <div key={g} className="mb-3">
            <p className="mb-1.5 text-xs font-medium text-zinc-500">{g}</p>
            <div className="grid grid-cols-2 gap-2">
              {list.map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  onClick={() => setMenu(false)}
                  className={cx(
                    "flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm",
                    isActive(pathname, i.href) ? "border-brand-200 bg-brand-50 text-brand-600" : "border-zinc-200",
                  )}
                >
                  <i.icon className="size-4 shrink-0" />
                  <span className="truncate">{i.label}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
        <Button variant="secondary" className="mt-2 w-full" icon={<LogOut className="size-4" />} onClick={signOut}>
          ออกจากระบบ
        </Button>
      </Modal>
    </div>
  );
}

/** ค้นหาเมนู/หน้าในระบบ แล้วกระโดดไปทันที (Enter = ผลลัพธ์แรก) */
function NavSearch() {
  const { items } = useVisibleNav();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const listId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const s = q.trim().toLowerCase();
  const results = s ? items.filter((i) => `${i.label} ${i.short ?? ""} ${i.group} ${i.href}`.toLowerCase().includes(s)).slice(0, 7) : [];

  useEffect(() => {
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const go = (href: string) => {
    setQ("");
    setOpen(false);
    router.push(href);
  };

  return (
    <div ref={ref} className="relative hidden w-[280px] md:block">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-zinc-400" />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setIdx(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIdx((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setIdx((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && results[idx]) {
            go(results[idx].href);
          } else if (e.key === "Escape") {
            setQ("");
            setOpen(false);
          }
        }}
        placeholder="ค้นหาเมนู"
        aria-label="ค้นหาเมนู"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        className="h-11 w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-3 text-sm text-ink-900 placeholder:text-zinc-400 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-400/15"
      />
      {open && s && (
        <div id={listId} role="listbox" className="absolute right-0 top-[calc(100%+6px)] z-40 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white p-1 shadow-xl shadow-ink-900/10">
          {results.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-zinc-500">ไม่พบเมนูที่ค้นหา</p>
          ) : (
            results.map((r, i) => (
              <button
                key={r.href}
                role="option"
                aria-selected={i === idx}
                onMouseEnter={() => setIdx(i)}
                onClick={() => go(r.href)}
                className={cx("flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm", i === idx ? "bg-brand-50 text-brand-600" : "text-ink-800")}
              >
                <r.icon className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{r.label}</span>
                <span className="truncate text-[11px] text-zinc-500">{r.group}</span>
                {i === idx && <CornerDownLeft className="size-3.5 shrink-0 text-zinc-400" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** หัวเพจ + ตรวจสิทธิ์ (RBAC guard ฝั่ง UI — service layer ตรวจซ้ำอีกชั้น) */
export function Page({
  title,
  perm,
  back,
  actions,
  children,
  wide,
}: {
  title: ReactNode;
  perm?: Permission;
  back?: string | true;
  actions?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  const me = useMe();
  const can = useCan();
  const router = useRouter();
  const pathname = usePathname();
  if (!me) return null;
  const allowed = !perm || can(perm);
  const nav = currentNav(pathname);
  const home = NAV.find((n) => n.href === HOME_BY_ROLE[me.role]);
  const width = wide ? "max-w-[1400px]" : "max-w-6xl";
  const pageLabel = typeof title === "string" ? title : (nav?.label ?? "");
  const onHome = nav?.href === home?.href;
  const crumbs: { label: string; href?: string }[] = onHome
    ? [{ label: home?.group ?? "หน้าแรก" }, { label: home?.label ?? pageLabel }]
    : [{ label: home?.label ?? "หน้าแรก", href: HOME_BY_ROLE[me.role] }, ...(nav ? [{ label: nav.group }] : []), { label: pageLabel }];

  return (
    <>
      {/* Top bar */}
      <header className="no-print sticky top-0 z-30 border-b border-zinc-200 bg-canvas/90 backdrop-blur">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:h-[76px] lg:px-8">
          {back && (
            <button
              onClick={() => (back === true ? router.back() : router.push(back))}
              className="-ml-1.5 grid size-10 shrink-0 place-items-center rounded-full text-zinc-600 hover:bg-zinc-100"
              aria-label="ย้อนกลับ"
            >
              <ChevronLeft className="size-5" />
            </button>
          )}
          <LogoMark className={cx("size-7 shrink-0 text-brand-400 lg:hidden", back && "hidden")} />
          <nav aria-label="breadcrumb" className="min-w-0 flex-1">
            <ol className="flex min-w-0 items-center gap-2 text-[15px]">
              {crumbs.map((c, i) => {
                const last = i === crumbs.length - 1;
                return (
                  <li key={i} className={cx("flex min-w-0 items-center gap-2", !last && "hidden sm:flex")}>
                    {i > 0 && <ChevronRight aria-hidden className="hidden size-4 shrink-0 text-zinc-400 sm:block" />}
                    {c.href && !last ? (
                      <Link href={c.href} className="shrink-0 text-ink-800 hover:text-brand-500">
                        {c.label}
                      </Link>
                    ) : (
                      <span aria-current={last ? "page" : undefined} className={cx("truncate", last ? "text-zinc-500" : "shrink-0 text-ink-800")}>
                        {c.label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
          <NavSearch />
          <span aria-hidden className="mx-1 hidden h-8 w-px bg-zinc-200 md:block" />
          {can("system.manage") && (
            <Link href="/admin/settings" className="hidden size-10 place-items-center rounded-full text-ink-800 hover:bg-zinc-100 sm:grid" aria-label="ตั้งค่าระบบ">
              <Settings className="size-5" strokeWidth={1.7} />
            </Link>
          )}
          <Link href="/profile" className="flex shrink-0 items-center gap-3 rounded-full p-1 hover:bg-zinc-100 lg:pr-3" aria-label="โปรไฟล์ของฉัน">
            <Avatar name={me.firstName} className="size-9 lg:size-10" />
            <span className="hidden leading-tight lg:block">
              <span className="block text-[15px] font-medium text-ink-900">
                {me.firstName} {me.lastName}
              </span>
              <span className="block text-xs text-zinc-500">{ROLE_LABEL[me.role]}</span>
            </span>
          </Link>
        </div>
      </header>

      <main className={cx("mx-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8", width)}>
        {/* Page title */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-ink-900 sm:text-[34px]">{title}</h1>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Badge tone="orange">{nav?.group ?? ROLE_LABEL[me.role]}</Badge>
            </div>
          </div>
          {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
        </div>

        {allowed ? (
          children
        ) : (
          <Empty icon={<ShieldAlert className="size-8" />} title="ไม่มีสิทธิ์เข้าถึงหน้านี้">
            บทบาท {ROLE_LABEL[me.role]} ไม่ได้รับสิทธิ์นี้ (RBAC) —{" "}
            <Link className="text-brand-500 underline" href={HOME_BY_ROLE[me.role]}>
              กลับหน้าหลัก
            </Link>
          </Empty>
        )}
      </main>
    </>
  );
}
