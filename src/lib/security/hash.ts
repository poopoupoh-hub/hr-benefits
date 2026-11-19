/**
 * Password hashing — PBKDF2-SHA256 พร้อม salt สุ่มต่อรายการ (ทำงานได้ทั้งในเบราว์เซอร์และ Node / unit test)
 * รูปแบบที่เก็บ: pbkdf2$<iterations>$<salt hex>$<hash hex>
 *
 * หมายเหตุ: ระบบเวอร์ชันนี้เก็บข้อมูลใน localStorage ของเบราว์เซอร์ การ hash ช่วยไม่ให้เห็นรหัสผ่านตรง ๆ
 * แต่ไม่ใช่การป้องกันระดับเซิร์ฟเวอร์ — ดูหัวข้อ "ข้อจำกัด" ใน README
 */
import { pbkdf2 } from "@noble/hashes/pbkdf2";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, hexToBytes, randomBytes, utf8ToBytes } from "@noble/hashes/utils";

const ITERATIONS = 20_000;
const KEYLEN = 32;

export function hashSecret(secret: string, iterations = ITERATIONS): string {
  const salt = randomBytes(16);
  const hash = pbkdf2(sha256, utf8ToBytes(secret), salt, { c: iterations, dkLen: KEYLEN });
  return `pbkdf2$${iterations}$${bytesToHex(salt)}$${bytesToHex(hash)}`;
}

/** เปรียบเทียบแบบใช้เวลาคงที่ */
function equal(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
  return r === 0;
}

export function verifySecret(secret: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [algo, iter, saltHex, hashHex] = stored.split("$");
  if (algo !== "pbkdf2" || !iter || !saltHex || !hashHex) return false;
  try {
    const expected = hexToBytes(hashHex);
    const actual = pbkdf2(sha256, utf8ToBytes(secret), hexToBytes(saltHex), { c: Number(iter), dkLen: expected.length });
    return equal(actual, expected);
  } catch {
    return false;
  }
}
