/**
 * File storage — เก็บไฟล์แนบบนดิสก์ (UPLOAD_DIR) แยกจากฐานข้อมูลหลัก
 * ฐานข้อมูลเก็บเฉพาะ metadata (StoredFile / ClaimAttachment)
 * Production: เปลี่ยนเป็น S3 / MinIO ได้โดยแก้เฉพาะ writeBlob / readBlob
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ACCEPTED_FILE_TYPES, MAX_FILE_SIZE } from "../domain/constants";
import type { AttachmentMeta } from "../domain/types";
import { uid } from "../data/uid";
import { ServiceError } from "../services/core";
import { prisma } from "./prisma";

const dir = () => path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.UPLOAD_DIR || "./storage/uploads");

/** ตรวจชนิดไฟล์จากเนื้อไฟล์จริง (magic bytes) ไม่เชื่อนามสกุลหรือ header จากเบราว์เซอร์ */
function sniff(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 12 && buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (buf.length >= 5 && buf.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  return null;
}

const cleanName = (n: string) => n.replace(/[\\/\0<>:"|?*\x00-\x1f]/g, "_").slice(0, 150) || "file";

export async function saveUpload(file: File, uploaderId: string, docType: string): Promise<AttachmentMeta> {
  if (file.size > MAX_FILE_SIZE) throw new ServiceError("ไฟล์มีขนาดเกิน 5 MB");
  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniff(buf);
  if (!type || !ACCEPTED_FILE_TYPES.includes(type)) throw new ServiceError("รองรับเฉพาะไฟล์ JPG, PNG, WEBP และ PDF");
  const id = uid("file");
  await mkdir(dir(), { recursive: true });
  await writeFile(path.join(dir(), id), buf);
  const row = await prisma.storedFile.create({
    data: { id, uploaderId, name: cleanName(file.name), mimeType: type, size: buf.length, storagePath: id },
  });
  return { id, name: row.name, size: row.size, type: row.mimeType, docType: docType.slice(0, 100), uploadedAt: row.createdAt.toISOString() };
}

export async function readStoredFile(id: string) {
  const row = await prisma.storedFile.findUnique({ where: { id } });
  if (!row) return null;
  try {
    const data = await readFile(path.join(dir(), path.basename(row.storagePath)));
    return { row, data };
  } catch {
    return null;
  }
}

/**
 * ตรวจไฟล์แนบที่หน้าจอส่งมา: ต้องเป็นไฟล์ที่ผู้ใช้อัปโหลดเอง หรือแนบอยู่ในคำขอนี้แล้ว
 * และใช้ชื่อ/ขนาด/ชนิดจากฐานข้อมูล (ไม่เชื่อค่าจากหน้าจอ)
 */
export async function verifyAttachments(actorId: string, items: AttachmentMeta[], claimId?: string): Promise<AttachmentMeta[]> {
  if (!Array.isArray(items)) throw new ServiceError("ข้อมูลไฟล์แนบไม่ถูกต้อง");
  if (items.length > 20) throw new ServiceError("แนบไฟล์ได้ไม่เกิน 20 ไฟล์");
  const ids = items.map((a) => String(a.id));
  const [stored, existing] = await Promise.all([
    prisma.storedFile.findMany({ where: { id: { in: ids } } }),
    claimId ? prisma.claimAttachment.findMany({ where: { claimId, id: { in: ids } } }) : Promise.resolve([]),
  ]);
  return items.map((a) => {
    const docType = String(a.docType ?? "อื่น ๆ").slice(0, 100);
    const ex = existing.find((x) => x.id === a.id);
    if (ex) return { id: ex.id, name: ex.name, size: ex.size, type: ex.type, docType, uploadedAt: ex.uploadedAt.toISOString() };
    const s = stored.find((x) => x.id === a.id);
    if (!s || s.uploaderId !== actorId) throw new ServiceError("พบไฟล์แนบที่ไม่ได้อัปโหลดโดยคุณ กรุณาแนบไฟล์ใหม่");
    return { id: s.id, name: s.name, size: s.size, type: s.mimeType, docType, uploadedAt: s.createdAt.toISOString() };
  });
}
