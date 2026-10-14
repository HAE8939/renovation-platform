import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export const FILE_LIMITS = {
  delivery: 20 * 1024 * 1024,
  change_attachment: 20 * 1024 * 1024,
  work_log: 10 * 1024 * 1024,
} as const;

const MIME_BY_CATEGORY: Record<string, Set<string>> = {
  delivery: new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/zip"]),
  change_attachment: new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "application/zip"]),
  work_log: new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]),
};

function safeExtension(name: string, mimeType: string) {
  const ext = path.extname(name).toLowerCase().replace(/[^a-z0-9.]/g, "");
  if (ext.length <= 8) return ext;
  const fallback: Record<string, string> = { "application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "application/zip": ".zip" };
  return fallback[mimeType] ?? "";
}

export class StorageError extends Error {}

export async function saveUploadedFile(file: File, category: keyof typeof FILE_LIMITS, ownerId: string) {
  if (!file || file.size === 0) throw new StorageError("请选择要上传的文件");
  if (file.size > FILE_LIMITS[category]) throw new StorageError(`文件不能超过 ${FILE_LIMITS[category] / 1024 / 1024} MB`);
  if (!MIME_BY_CATEGORY[category]?.has(file.type)) throw new StorageError("文件类型不受支持");
  const safeOwner = ownerId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const key = `uploads/files/${category}/${safeOwner}/${crypto.randomUUID()}${safeExtension(file.name, file.type)}`;
  const absolute = path.join(process.cwd(), "public", key);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, Buffer.from(await file.arrayBuffer()));
  return { storageKey: key, originalName: file.name.replace(/[\\/]/g, "_").slice(0, 180), mimeType: file.type, size: file.size };
}

export async function removeStoredFile(storageKey: string) {
  const normalized = storageKey.replace(/\\/g, "/");
  if (!normalized.startsWith("uploads/files/") || normalized.includes("..")) return;
  await unlink(path.join(process.cwd(), "public", normalized)).catch(() => undefined);
}

