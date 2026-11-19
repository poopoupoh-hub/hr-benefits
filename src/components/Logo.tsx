/** ชื่อบริษัทเริ่มต้น (ค่าจริงอยู่ใน ตั้งค่าระบบ → ชื่อองค์กร) */
export const ORG_NAME = "บริษัท จัดการข้อมูลพนักงานและสวัสดิการ จำกัด";

/** โลโก้ของระบบ (ใช้ currentColor — กำหนดสีด้วย text-*) */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path d="M3 19 L9 6 L13 14 L16 9 L21 19 Z" fill="currentColor" opacity=".35" />
      <path d="M3 19 L9 6 L15 19" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.5 13.5 L16 8 L21 19" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
