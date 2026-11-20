/**
 * File storage — เก็บไฟล์แนบใน IndexedDB ของเบราว์เซอร์ แยกจากข้อมูลหลัก (localStorage)
 * ข้อมูลหลักเก็บเฉพาะ metadata (AttachmentMeta) ในคำขอ
 * IndexedDB รองรับไฟล์ขนาดใหญ่กว่า localStorage มาก (localStorage จำกัด ~5 MB ต่อเว็บไซต์)
 */
import { ACCEPTED_FILE_TYPES, MAX_FILE_SIZE } from "../domain/constants";
import type { AttachmentMeta } from "../domain/types";
import { uid } from "./uid";

const DB_NAME = "hr-benefits-files";
const STORE = "files";

export interface StoredFile {
  id: string;
  uploaderId: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
  blob: Blob;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("เบราว์เซอร์นี้ไม่รองรับการเก็บไฟล์ (IndexedDB)"));
  if (!dbPromise)
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error ?? new Error("เปิดที่เก็บไฟล์ไม่สำเร็จ"));
      };
    });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(req.result);
        t.onerror = () => reject(t.error ?? new Error("บันทึกไฟล์ไม่สำเร็จ"));
        t.onabort = () => reject(t.error ?? new Error("บันทึกไฟล์ไม่สำเร็จ (พื้นที่อาจเต็ม)"));
      }),
  );
}

/** ตรวจชนิดไฟล์จากเนื้อไฟล์จริง (magic bytes) ไม่เชื่อนามสกุลหรือชนิดที่เบราว์เซอร์บอก */
export function sniff(b: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return "image/png";
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (b.length >= 5 && ascii(0, 5) === "%PDF-") return "application/pdf";
  return null;
}

const cleanName = (n: string) => n.replace(/[\\/\0<>:"|?*\x00-\x1f]/g, "_").slice(0, 150) || "file";

export async function saveUpload(file: File, uploaderId: string, docType: string): Promise<AttachmentMeta> {
  if (file.size > MAX_FILE_SIZE) throw new Error("ไฟล์มีขนาดเกิน 5 MB");
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const type = sniff(head);
  if (!type || !ACCEPTED_FILE_TYPES.includes(type)) throw new Error("รองรับเฉพาะไฟล์ JPG, PNG, WEBP และ PDF");
  const rec: StoredFile = {
    id: uid("file"),
    uploaderId,
    name: cleanName(file.name),
    type,
    size: file.size,
    createdAt: new Date().toISOString(),
    blob: new Blob([await file.arrayBuffer()], { type }),
  };
  await tx("readwrite", (s) => s.put(rec));
  return { id: rec.id, name: rec.name, size: rec.size, type: rec.type, docType: docType.slice(0, 100), uploadedAt: rec.createdAt };
}

export function readStoredFile(id: string): Promise<StoredFile | null> {
  return tx<StoredFile | undefined>("readonly", (s) => s.get(id) as IDBRequest<StoredFile | undefined>).then((r) => r ?? null);
}

export function clearFiles(): Promise<void> {
  return tx("readwrite", (s) => s.clear()).then(() => undefined);
}

/**
 * ตรวจไฟล์แนบที่หน้าจอส่งมา: ต้องเป็นไฟล์ที่ผู้ใช้อัปโหลดเอง หรือแนบอยู่ในคำขอนี้แล้ว
 * และใช้ชื่อ/ขนาด/ชนิดจากที่เก็บไฟล์ (ไม่เชื่อค่าจากฟอร์ม)
 */
export async function verifyAttachments(actorId: string, items: AttachmentMeta[], existing: AttachmentMeta[] = []): Promise<AttachmentMeta[]> {
  if (!Array.isArray(items)) throw new Error("ข้อมูลไฟล์แนบไม่ถูกต้อง");
  if (items.length > 20) throw new Error("แนบไฟล์ได้ไม่เกิน 20 ไฟล์");
  const out: AttachmentMeta[] = [];
  for (const a of items) {
    const docType = String(a.docType ?? "อื่น ๆ").slice(0, 100);
    const ex = existing.find((x) => x.id === a.id);
    if (ex) {
      out.push({ ...ex, docType });
      continue;
    }
    const s = await readStoredFile(String(a.id));
    if (!s || s.uploaderId !== actorId) throw new Error("พบไฟล์แนบที่ไม่ได้อัปโหลดโดยคุณ กรุณาแนบไฟล์ใหม่");
    out.push({ id: s.id, name: s.name, size: s.size, type: s.type, docType, uploadedAt: s.createdAt });
  }
  return out;
}
