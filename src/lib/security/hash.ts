/**
 * Password / PIN hashing — scrypt (node:crypto) พร้อม salt สุ่มต่อรายการ
 * รูปแบบที่เก็บ: scrypt$<salt hex>$<hash hex>
 * ใช้ได้เฉพาะฝั่งเซิร์ฟเวอร์ (และ unit test)
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEYLEN = 32;
const COST = { N: 16384, r: 8, p: 1 };

export function hashSecret(secret: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(secret, salt, KEYLEN, COST);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifySecret(secret: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [algo, saltHex, hashHex] = stored.split("$");
  if (algo !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(secret, Buffer.from(saltHex, "hex"), expected.length, COST);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
