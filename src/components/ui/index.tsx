"use client";
import { X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { cx } from "@/lib/format";

/* ------------------------------ Button ------------------------------ */
type Variant = "primary" | "secondary" | "ghost" | "danger" | "success" | "dark" | "outline-brand" | "outline-danger";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-500 text-white hover:bg-brand-600 shadow-sm shadow-brand-500/25",
  secondary: "bg-white text-ink-900 border border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50",
  ghost: "text-ink-700 hover:bg-zinc-100",
  danger: "bg-red-600 text-white hover:bg-red-700",
  success: "bg-emerald-600 text-white hover:bg-emerald-700",
  dark: "bg-ink-900 text-white hover:bg-ink-800",
  "outline-brand": "bg-white text-brand-600 border border-brand-200 hover:bg-brand-50",
  "outline-danger": "bg-white text-red-600 border border-red-200 hover:bg-red-50",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  icon,
  loading,
  children,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; icon?: ReactNode; loading?: boolean }) {
  return (
    <button
      {...p}
      disabled={p.disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-[10px] font-medium transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400",
        size === "sm" && "h-9 px-3.5 text-[13px]",
        size === "md" && "h-11 px-4 text-sm",
        size === "lg" && "h-12 px-5 text-[15px]",
        VARIANTS[variant],
        className,
      )}
    >
      {loading ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : icon}
      {children}
    </button>
  );
}

/* ------------------------------ Card ------------------------------ */
export function Card({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...p} className={cx("rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(80,40,10,.04),0_8px_24px_-18px_rgba(80,40,10,.18)]", className)}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("mb-3 mt-7 flex items-center justify-between gap-3 first:mt-0", className)}>
      <h2 className="text-[17px] font-medium text-ink-900">{children}</h2>
      {action}
    </div>
  );
}

/* ------------------------------ Badge ------------------------------ */
type Tone = "gray" | "orange" | "blue" | "green" | "red" | "amber" | "dark" | "violet";
const TONES: Record<Tone, string> = {
  gray: "bg-zinc-100 text-zinc-700",
  orange: "bg-brand-50 text-brand-700",
  blue: "bg-[#eef3fc] text-[#2f5fb3]",
  green: "bg-emerald-50 text-emerald-700",
  red: "bg-red-50 text-red-700",
  amber: "bg-amber-50 text-amber-700",
  dark: "bg-ink-900 text-white",
  violet: "bg-violet-50 text-violet-700",
};
/** ป้ายสถานะแบบเม็ดยา มีจุดสีนำหน้า (ปิดได้ด้วย dot={false}) */
export function Badge({ tone = "gray", children, className, dot = true }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-medium leading-none", TONES[tone], className)}>
      {dot && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/* ------------------------------ Form ------------------------------ */
export function Field({ label, hint, error, children, className, required }: { label?: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; className?: string; required?: boolean }) {
  return (
    <label className={cx("block", className)}>
      {label && (
        <span className="mb-1.5 block text-[13px] font-medium text-ink-800">
          {label}
          {required && <span className="text-brand-600"> *</span>}
        </span>
      )}
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-zinc-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-[10px] border border-zinc-300 bg-white px-3.5 text-sm text-ink-900 placeholder:text-zinc-400 transition focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-400/15 disabled:bg-zinc-50 disabled:text-zinc-500";

export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cx(inputCls, "h-11", className)} />;
}
export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...p} className={cx(inputCls, "h-11 pr-8", className)}>
      {children}
    </select>
  );
}
export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cx(inputCls, "min-h-[88px] py-2.5", className)} />;
}

export function Checkbox({ checked, onChange, label, disabled, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean; hint?: ReactNode }) {
  return (
    <label className={cx("flex cursor-pointer items-start gap-2.5 text-sm", disabled && "cursor-not-allowed opacity-50")}>
      <input type="checkbox" className="mt-0.5 size-4 rounded accent-brand-400" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="block text-xs text-zinc-500">{hint}</span>}
      </span>
    </label>
  );
}

export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx("relative h-6 w-10 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-40", checked ? "bg-brand-400" : "bg-zinc-300")}
    >
      <span className={cx("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", checked ? "left-[18px]" : "left-0.5")} />
    </button>
  );
}

/* ------------------------------ Segmented tabs ------------------------------ */
export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cx("flex gap-1 rounded-xl bg-zinc-100 p-1", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx("h-9 flex-1 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition", value === o.value ? "bg-white text-brand-600 shadow-sm ring-1 ring-zinc-200" : "text-zinc-600 hover:text-ink-900")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Progress({ value, tone = "brand", className }: { value: number; tone?: "brand" | "green" | "amber" | "red" | "blue" | "gray"; className?: string }) {
  const c = { brand: "bg-brand-400", green: "bg-emerald-500", amber: "bg-amber-400", red: "bg-red-500", blue: "bg-sky-500", gray: "bg-zinc-400" }[tone];
  return (
    <div className={cx("h-1.5 overflow-hidden rounded-full bg-zinc-200/70", className)}>
      <div className={cx("h-full rounded-full transition-all", c)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-300 bg-white/60 px-6 py-10 text-center">
      {icon && <div className="mb-3 text-zinc-400">{icon}</div>}
      <p className="font-medium text-ink-800">{title}</p>
      {children && <div className="mt-1 text-sm text-zinc-500">{children}</div>}
    </div>
  );
}

export function KV({ k, v, className }: { k: ReactNode; v: ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-start justify-between gap-4 py-1.5 text-sm", className)}>
      <span className="shrink-0 text-zinc-500">{k}</span>
      <span className="text-right font-medium text-ink-900">{v}</span>
    </div>
  );
}

export function Alert({ tone = "info", children, icon, className }: { tone?: "info" | "success" | "error" | "warn" | "dark"; children: ReactNode; icon?: ReactNode; className?: string }) {
  const c = {
    info: "bg-[#fff8f1] text-ink-800 border-zinc-200",
    success: "bg-emerald-50 text-emerald-800 border-emerald-100",
    error: "bg-red-50 text-red-700 border-red-100",
    warn: "bg-brand-50 text-brand-700 border-brand-200",
    dark: "bg-ink-900 text-white border-ink-900",
  }[tone];
  return (
    <div className={cx("flex gap-2.5 rounded-xl border px-3.5 py-3 text-sm", c, className)}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/* ------------------------------ Modal / Bottom sheet ------------------------------ */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby={id}>
      <div className="absolute inset-0 animate-fade bg-ink-950/45 backdrop-blur-[1px]" onClick={onClose} />
      <div
        ref={ref}
        tabIndex={-1}
        className={cx(
          "relative flex max-h-[92dvh] w-full animate-sheet flex-col rounded-t-3xl bg-white shadow-2xl outline-none sm:rounded-3xl",
          size === "sm" && "sm:max-w-sm",
          size === "md" && "sm:max-w-lg",
          size === "lg" && "sm:max-w-3xl",
        )}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-zinc-200 sm:hidden" />
        <div className="flex items-center justify-between px-5 pb-2 pt-3 sm:pt-5">
          <h3 id={id} className="text-base font-semibold">
            {title}
          </h3>
          <button onClick={onClose} className="-mr-2 rounded-full p-2 text-zinc-500 hover:bg-zinc-100" aria-label="ปิด">
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="flex gap-2.5 border-t border-zinc-100 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] [&>*]:flex-1">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------ Toast ------------------------------ */
interface ToastItem {
  id: number;
  tone: "success" | "error" | "info";
  text: string;
}
const ToastCtx = createContext<(text: string, tone?: ToastItem["tone"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, tone: ToastItem["tone"] = "success") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), tone === "error" ? 6000 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={cx(
              "pointer-events-auto max-w-md animate-sheet whitespace-pre-line rounded-xl px-4 py-3 text-sm font-medium shadow-lg",
              t.tone === "success" && "bg-ink-900 text-white",
              t.tone === "error" && "bg-red-600 text-white",
              t.tone === "info" && "bg-white text-ink-900 ring-1 ring-zinc-200",
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** เรียก API แล้วแสดง toast สำเร็จ/ผิดพลาด — คืน undefined เมื่อผิดพลาด */
export function useAction() {
  const toast = useToast();
  return useCallback(
    async <T,>(fn: () => Promise<T> | T, success?: string): Promise<NonNullable<T> | true | undefined> => {
      try {
        const r = await fn();
        if (success) toast(success, "success");
        return (r ?? true) as NonNullable<T> | true;
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), "error");
        return undefined;
      }
    },
    [toast],
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cx("inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-300 to-brand-500 text-sm font-semibold text-white", className)}>
      {name.slice(0, 1)}
    </span>
  );
}
