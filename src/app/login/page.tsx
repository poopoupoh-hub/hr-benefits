"use client";
/**
 * หน้าเข้าสู่ระบบ
 * - เข้าสู่ระบบด้วย "รหัสพนักงาน" หรือ "อีเมล" + รหัสผ่าน (ตรวจกับข้อมูลใน localStorage)
 * - ไม่ให้ผู้ใช้เลือก/เห็นบทบาท — ระบบอ่าน role จากข้อมูลพนักงานแล้วพาไปหน้าแรกของบทบาทนั้นเอง
 * - สลับภาษา TH / EN ได้ (จำค่าที่เลือกไว้ใน localStorage)
 */
import { CalendarClock, Eye, EyeOff, FileText, Info, Loader2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { LogoMark, ORG_NAME } from "@/components/Logo";
import { HOME_BY_ROLE } from "@/components/nav";
import { ROLE_LABEL } from "@/lib/domain/constants";
import { login } from "@/lib/client/api";
import type { Role } from "@/lib/domain/types";
import { cx } from "@/lib/format";
import { useAppState, useMe } from "@/lib/hooks";

type Lang = "th" | "en";
const LANG_KEY = "hr-login-lang";
const ID_KEY = "hr-login-remember";

const T = {
  th: {
    docTitle: "เข้าสู่ระบบ · ระบบสวัสดิการพนักงาน",
    heroTitle: "เข้าสู่ระบบ",
    heroSub: "ระบบจัดการข้อมูลพนักงานและสวัสดิการ",
    heroDesc: "ยื่นคำร้องเบิกสวัสดิการ ตรวจสอบสิทธิ์และวงเงินคงเหลือ และติดตามสถานะการอนุมัติได้ครบในที่เดียว",
    featTitle: "ทำอะไรได้บ้างในระบบ",
    feats: [
      ["ยื่นเบิกออนไลน์", "แนบเอกสารและติดตามสถานะได้ทันที"],
      ["ตรวจสิทธิ์อัตโนมัติ", "เช็กวงเงินคงเหลือก่อนยื่นทุกครั้ง"],
      ["รู้วันจ่ายเงิน", "คำนวณรอบจ่ายและแจ้งเตือนทางอีเมล"],
    ],
    welcome: "ยินดีต้อนรับสู่",
    signIn: "เข้าสู่ระบบ",
    noAcc: "ยังไม่มีบัญชี?",
    contactHr: "ติดต่อฝ่าย HR",
    userLabel: "ชื่อผู้ใช้ (รหัสพนักงาน) หรืออีเมล",
    userPh: "เช่น EMP-0001 หรือ name@company.co.th",
    pwLabel: "กรอกรหัสผ่าน",
    pwPh: "รหัสผ่าน",
    showPw: "แสดงรหัสผ่าน",
    hidePw: "ซ่อนรหัสผ่าน",
    remember: "จดจำรหัสพนักงานของฉัน",
    forgot: "ลืมรหัสผ่าน?",
    signingIn: "กำลังเข้าสู่ระบบ…",
    required: "กรุณากรอกรหัสพนักงาน/อีเมล และรหัสผ่าน",
    helpTitle: "ต้องการความช่วยเหลือ?",
    help: "บัญชีผู้ใช้สร้างโดยฝ่าย HR / ผู้ดูแลระบบ หากยังไม่มีบัญชีหรือลืมรหัสผ่าน กรุณาติดต่อฝ่าย HR เพื่อขอเปิดบัญชีหรือรีเซ็ตรหัสผ่าน",
    secure: "เชื่อมต่อแบบเข้ารหัส · ระบบบันทึกประวัติการเข้าใช้งาน",
    langLabel: "ภาษา",
  },
  en: {
    docTitle: "Sign in · Employee Benefits",
    heroTitle: "Sign in to",
    heroSub: "Employee & Benefits Management",
    heroDesc: "Submit benefit claims, check your eligibility and remaining balance, and track approval status — all in one place.",
    featTitle: "What you can do",
    feats: [
      ["Claim online", "Attach documents and track status instantly"],
      ["Auto eligibility", "Remaining balance checked before every claim"],
      ["Know your payday", "Payment dates calculated and emailed to you"],
    ],
    welcome: "Welcome to",
    signIn: "Sign in",
    noAcc: "No account?",
    contactHr: "Contact HR",
    userLabel: "Enter your employee ID or email",
    userPh: "e.g. EMP-0001 or name@company.co.th",
    pwLabel: "Enter your password",
    pwPh: "Password",
    showPw: "Show password",
    hidePw: "Hide password",
    remember: "Remember my employee ID",
    forgot: "Forgot password?",
    signingIn: "Signing in…",
    required: "Please enter your employee ID/email and password",
    helpTitle: "Need help?",
    help: "Accounts are created by HR / system administrators. If you don't have an account or forgot your password, please contact HR to open an account or reset your password.",
    secure: "Encrypted connection · Sign-in activity is logged",
    langLabel: "Language",
  },
} as const;

function readStored(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** แปลข้อความผิดพลาดจากระบบ (ภาษาไทย) เป็นอังกฤษ */
function translateError(msg: string, lang: Lang) {
  if (lang === "th") return msg;
  if (msg.includes("ไม่ถูกต้อง")) return "Incorrect employee ID/email or password";
  if (msg.includes("เกิน 5 ครั้ง")) return "Too many failed attempts. Please wait 15 minutes or contact the administrator.";
  if (msg.includes("ปิดสถานะ")) return "This account has been deactivated.";
  return msg;
}

export default function LoginPage() {
  const me = useMe();
  const orgName = useAppState().public?.orgName;
  const demoAccounts = useAppState().public?.demoAccounts ?? [];
  const router = useRouter();
  // หน้านี้เรนเดอร์ฝั่ง client เท่านั้น (Providers รอโหลดข้อมูลก่อน) จึงอ่าน localStorage ตอนสร้าง state ได้
  const [lang, setLang] = useState<Lang>(() => (readStored(LANG_KEY) === "en" ? "en" : "th"));
  const [id, setId] = useState(() => readStored(ID_KEY) ?? "");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(() => !!readStored(ID_KEY));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [help, setHelp] = useState(false);
  const submitted = useRef(false);
  const t = T[lang];

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = T[lang].docTitle;
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {}
    return () => {
      document.documentElement.lang = "th";
    };
  }, [lang]);

  // ล็อกอินอยู่แล้ว → ไปหน้าแรกตามบทบาท
  useEffect(() => {
    if (me && !submitted.current) router.replace(HOME_BY_ROLE[me.role]);
  }, [me, router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !pw) return setError(t.required);
    setBusy(true);
    setError("");
    submitted.current = true;
    try {
      const r = await login(id.trim(), pw);
      try {
        if (remember) localStorage.setItem(ID_KEY, id.trim());
        else localStorage.removeItem(ID_KEY);
      } catch {}
      router.replace(HOME_BY_ROLE[r.role as Role] ?? "/");
    } catch (err) {
      submitted.current = false;
      setError(translateError(err instanceof Error ? err.message : String(err), lang));
      setBusy(false);
    }
  };

  const featIcons = [FileText, ShieldCheck, CalendarClock];

  return (
    <div className="bg-warm min-h-dvh p-0 sm:p-4 lg:p-6">
      <div className="relative mx-auto min-h-dvh max-w-[1320px] overflow-hidden bg-canvas shadow-[0_30px_80px_-30px_rgba(120,60,20,.35)] sm:min-h-[calc(100dvh-2rem)] sm:rounded-[32px] sm:ring-1 sm:ring-white/70 lg:min-h-[calc(100dvh-3rem)]">
        {/* แถบสีด้านบน */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-[430px] lg:h-[52%] lg:min-h-[440px]"
          style={{
            background:
              "radial-gradient(700px 400px at 85% 0%, rgba(255,255,255,.18) 0%, transparent 60%), radial-gradient(600px 400px at 0% 100%, rgba(120,40,10,.2) 0%, transparent 60%), linear-gradient(120deg, #c4521e 0%, #e0794a 100%)",
          }}
        />

        {/* แถบบน: โลโก้ + สลับภาษา */}
        <header className="relative z-10 flex items-center justify-between gap-4 px-5 pt-5 sm:px-10 sm:pt-8 lg:px-14">
          <div className="flex items-center gap-3 text-white">
            <span className="grid size-10 place-items-center rounded-xl bg-white/15 ring-1 ring-white/35">
              <LogoMark className="size-5" />
            </span>
            <span className="text-base font-semibold leading-snug sm:text-lg">{orgName ?? ORG_NAME}</span>
          </div>
          <div role="group" aria-label={t.langLabel} className="inline-flex gap-0.5 rounded-full bg-white/15 p-1 ring-1 ring-white/35">
            {(["th", "en"] as const).map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={lang === l}
                onClick={() => setLang(l)}
                className={cx(
                  "h-9 min-w-[52px] rounded-full px-3.5 text-[13px] font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                  lang === l ? "bg-white text-brand-600 shadow-md shadow-black/10" : "text-white/90 hover:bg-white/10",
                )}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </header>

        <main className="relative z-10 grid gap-10 px-4 pb-10 pt-6 sm:px-10 lg:grid-cols-[1fr_minmax(0,500px)] lg:gap-12 lg:px-14 lg:pb-14 lg:pt-8">
          {/* ซ้าย: ข้อความ + ภาพประกอบ + จุดเด่น */}
          <section className="flex flex-col">
            <div className="grid items-center gap-6 text-white md:grid-cols-[1fr_260px] lg:min-h-[320px] xl:grid-cols-[1fr_300px]">
              <div className="px-1 pt-2 lg:pt-8">
                <h1 className="text-[34px] font-semibold leading-tight sm:text-[42px]">{t.heroTitle}</h1>
                <p className="mt-1 text-xl leading-snug text-white/95 sm:text-2xl">{t.heroSub}</p>
                <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/90">{t.heroDesc}</p>
              </div>
              <Illustration className="hidden w-full md:block" />
            </div>

            <div className="mt-12 hidden lg:mt-auto lg:block lg:pt-16">
              <h2 className="mb-4 text-[15px] font-medium text-ink-900">{t.featTitle}</h2>
              <div className="grid max-w-[640px] grid-cols-3 gap-4">
                {t.feats.map(([title, desc], i) => {
                  const Icon = featIcons[i];
                  return (
                    <div key={title} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_8px_24px_-16px_rgba(120,60,20,.3)]">
                      <span className="mb-3.5 grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-400">
                        <Icon className="size-5" />
                      </span>
                      <p className="text-sm font-semibold text-ink-900">{title}</p>
                      <p className="mt-1 text-[12.5px] leading-relaxed text-zinc-500">{desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ขวา: การ์ดฟอร์ม */}
          <section
            aria-labelledby="signin-title"
            className="self-start rounded-[28px] bg-white p-6 shadow-[0_30px_70px_-25px_rgba(120,60,20,.4),0_2px_6px_rgba(31,25,21,.04)] sm:rounded-[36px] sm:p-12"
          >
            <div className="mb-9 flex flex-col-reverse items-start justify-between gap-4 sm:flex-row">
              <div>
                <p className="text-[17px] text-ink-900 sm:text-[19px]">
                  {t.welcome} <span className="font-semibold text-brand-500">{orgName ?? ORG_NAME}</span>
                </p>
                <h2 id="signin-title" className="mt-1 text-[40px] font-semibold leading-tight tracking-tight sm:text-[48px]">
                  {t.signIn}
                </h2>
              </div>
              <p className="shrink-0 text-[12.5px] leading-relaxed text-zinc-500 sm:text-right">
                {t.noAcc}
                <br />
                <button type="button" onClick={() => setHelp(true)} className="font-medium text-brand-500 hover:underline">
                  {t.contactHr}
                </button>
              </p>
            </div>

            <form onSubmit={onSubmit} noValidate>
              <label htmlFor="login-id" className="mb-3 block text-[15px] text-ink-900">
                {t.userLabel}
              </label>
              <input
                id="login-id"
                value={id}
                onChange={(e) => setId(e.target.value)}
                autoComplete="username"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder={t.userPh}
                aria-invalid={!!error}
                aria-describedby={error ? "login-error" : undefined}
                className="h-14 w-full rounded-[10px] border border-zinc-300 bg-white px-5 text-[15px] text-ink-900 outline-none transition placeholder:text-zinc-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-400/15"
              />

              <label htmlFor="login-pw" className="mb-3 mt-6 block text-[15px] text-ink-900">
                {t.pwLabel}
              </label>
              <div className="relative">
                <input
                  id="login-pw"
                  type={showPw ? "text" : "password"}
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  autoComplete="current-password"
                  placeholder={t.pwPh}
                  aria-invalid={!!error}
                  aria-describedby={error ? "login-error" : undefined}
                  className="h-14 w-full rounded-[10px] border border-zinc-300 bg-white pl-5 pr-14 text-[15px] text-ink-900 outline-none transition placeholder:text-zinc-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-400/15"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? t.hidePw : t.showPw}
                  className="absolute right-1.5 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-zinc-500 hover:text-ink-900"
                >
                  {showPw ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4">
                <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[13.5px] text-zinc-700">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-[18px] accent-brand-400" />
                  {t.remember}
                </label>
                <button type="button" onClick={() => setHelp((v) => !v)} className="min-h-11 text-[13.5px] font-medium text-brand-500 hover:underline">
                  {t.forgot}
                </button>
              </div>

              {help && (
                <div className="mt-2 flex gap-2.5 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-[13px] leading-relaxed text-zinc-700">
                  <Info className="mt-0.5 size-4 shrink-0 text-brand-400" />
                  <p>
                    <span className="font-medium text-ink-900">{t.helpTitle}</span> {t.help}
                  </p>
                </div>
              )}

              {error && (
                <p id="login-error" role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-700">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="mt-7 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 text-base font-medium text-white shadow-[0_12px_26px_-10px_rgba(196,82,30,.7)] transition hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand-400 active:translate-y-px disabled:cursor-wait disabled:opacity-80"
              >
                {busy && <Loader2 className="size-5 animate-spin" />}
                {busy ? t.signingIn : t.signIn}
              </button>
            </form>

            {demoAccounts.length > 0 && (
              <div className="mt-6 border-t border-zinc-200 pt-4">
                <p className="mb-2 text-center text-xs text-zinc-500">{lang === "th" ? "เดโม: เลือกผู้ใช้ตัวอย่าง (รหัสผ่าน 1234)" : "Demo: pick a sample user (password 1234)"}</p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {demoAccounts.map((a) => (
                    <button
                      key={a.code}
                      type="button"
                      onClick={() => {
                        setId(a.code);
                        setPw("1234");
                        setError("");
                      }}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs transition hover:border-brand-300 hover:bg-brand-50 ${id === a.code ? "border-brand-400 bg-brand-50" : "border-zinc-200"}`}
                    >
                      <span className="truncate">
                        <span className="font-medium text-ink-900">{a.name}</span> <span className="text-zinc-400">{a.code}</span>
                      </span>
                      <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600">{ROLE_LABEL[a.role]}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-zinc-500">
              <ShieldCheck className="size-3.5" /> {t.secure}
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}

/** ภาพประกอบ: การ์ดสวัสดิการ + เหรียญ + เครื่องหมายอนุมัติ (วาดเอง ไม่ใช้ภาพภายนอก) */
function Illustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 300" fill="none" aria-hidden className={className}>
      <g className="motion-safe:animate-[float_7s_ease-in-out_infinite_reverse]">
        <ellipse cx="60" cy="58" rx="26" ry="16" fill="#FFF4EC" />
        <ellipse cx="78" cy="50" rx="18" ry="14" fill="#FFF4EC" />
        <ellipse cx="248" cy="250" rx="28" ry="17" fill="#FFF4EC" />
        <ellipse cx="266" cy="242" rx="18" ry="13" fill="#FFF4EC" />
      </g>
      <g className="motion-safe:animate-[float_6s_ease-in-out_infinite]">
        <rect x="70" y="118" width="170" height="108" rx="18" fill="#F6B48E" transform="rotate(-8 155 172)" />
        <g transform="rotate(4 150 156)">
          <rect x="62" y="100" width="176" height="112" rx="18" fill="#FFFFFF" />
          <rect x="80" y="118" width="40" height="40" rx="12" fill="#FCEADF" />
          <path d="M100 148c-7-5-11-8.5-11-13a6 6 0 0 1 11-3.3A6 6 0 0 1 111 135c0 4.5-4 8-11 13z" fill="#D9602A" />
          <rect x="132" y="122" width="76" height="9" rx="4.5" fill="#1F1915" opacity=".85" />
          <rect x="132" y="138" width="52" height="7" rx="3.5" fill="#C9B9AC" />
          <rect x="80" y="174" width="140" height="8" rx="4" fill="#F1E7DC" />
          <rect x="80" y="174" width="98" height="8" rx="4" fill="#D9602A" />
          <rect x="80" y="190" width="44" height="6" rx="3" fill="#C9B9AC" />
          <rect x="186" y="190" width="34" height="6" rx="3" fill="#C9B9AC" />
        </g>
      </g>
      <g className="motion-safe:animate-[float_7s_ease-in-out_infinite_reverse]">
        <circle cx="228" cy="92" r="28" fill="#1F1915" />
        <path d="M216 92l8 8 16-16" stroke="#FDE1C9" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g className="motion-safe:animate-[float_6s_ease-in-out_infinite]">
        <ellipse cx="74" cy="236" rx="24" ry="8" fill="#9E3F18" />
        <rect x="50" y="222" width="48" height="14" fill="#E8875A" />
        <ellipse cx="74" cy="222" rx="24" ry="8" fill="#FBD2B5" />
        <rect x="50" y="210" width="48" height="12" fill="#E8875A" />
        <ellipse cx="74" cy="210" rx="24" ry="8" fill="#FFE6D3" />
      </g>
      <circle cx="40" cy="150" r="3" fill="#fff" />
      <circle cx="270" cy="160" r="2.5" fill="#fff" />
      <circle cx="150" cy="40" r="3" fill="#fff" opacity=".8" />
      <path d="M190 30v14M183 37h14" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
