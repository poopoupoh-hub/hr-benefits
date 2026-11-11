let seq = 0;
/** สร้างรหัสไม่ซ้ำ (prefix-เวลา-สุ่ม) */
export function uid(prefix: string) {
  seq = (seq + 1) % 1000;
  return `${prefix}-${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
