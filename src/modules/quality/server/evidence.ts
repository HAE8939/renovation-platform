import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import prisma from "@/core/db";
import { getPlaceholderUser } from "../currentUser";

export const EVIDENCE_PUBLIC_DIR = "/uploads/evidence";
export const EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;
export const EVIDENCE_MAX_COUNT = 9;

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
};

export class EvidenceError extends Error {}

export interface EvidenceItem {
  id: string;
  nodeId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  uploaderName: string | null;
  createdAt: Date;
  url: string;
}

function evidenceDir(nodeId: string): string {
  return join(process.cwd(), "public", "uploads", "evidence", nodeId);
}

function safeOriginalName(name: string): string {
  const base = name.split(/[\\/]/).pop() || "证据图片";
  return base.replace(/[\u0000-\u001f]/g, "").slice(0, 180) || "证据图片";
}

function isRealImage(buf: Buffer, mimeType: string): boolean {
  if (mimeType === "image/png") {
    return buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  return mimeType === "image/jpeg" && buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

export function evidenceUrl(nodeId: string, filename: string): string | null {
  if (!nodeId || nodeId.includes("/") || nodeId.includes("\\") || nodeId.includes("..")) return null;
  if (!filename || filename.includes("/") || filename.includes("\\") || filename.includes("..")) return null;
  return `${EVIDENCE_PUBLIC_DIR}/${nodeId}/${filename}`;
}

export async function listEvidence(nodeId: string): Promise<EvidenceItem[]> {
  const rows = await prisma.evidence.findMany({
    where: { nodeId },
    orderBy: { createdAt: "desc" },
  });
  return rows.flatMap((row) => {
    const url = evidenceUrl(row.nodeId, row.filename);
    return url ? [{ ...row, url }] : [];
  });
}

export async function uploadEvidence(nodeId: string, file: File): Promise<EvidenceItem> {
  const me = await getPlaceholderUser("submit");
  if (!me) throw new EvidenceError("未找到演示用户，无法记录上传人");
  const node = await prisma.acceptanceNode.findUnique({ where: { id: nodeId }, select: { id: true } });
  if (!node) throw new EvidenceError("验收节点不存在");
  if (!file || typeof file.size !== "number" || file.size === 0) throw new EvidenceError("请选择要上传的证据图片");
  const ext = MIME_EXT[file.type];
  if (!ext) throw new EvidenceError("仅支持 JPG / PNG 图片");
  if (file.size > EVIDENCE_MAX_BYTES) throw new EvidenceError("图片过大，请控制在 5 MB 以内");

  const count = await prisma.evidence.count({ where: { nodeId } });
  if (count >= EVIDENCE_MAX_COUNT) throw new EvidenceError("每个验收节点最多上传 9 张证据图片");

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length === 0 || buf.length > EVIDENCE_MAX_BYTES || !isRealImage(buf, file.type)) {
    throw new EvidenceError("图片内容无效，请重新选择 JPG 或 PNG 文件");
  }

  const filename = `evidence-${Date.now()}-${randomBytes(5).toString("hex")}.${ext}`;
  const url = evidenceUrl(nodeId, filename);
  if (!url) throw new EvidenceError("证据文件名无效");
  await mkdir(evidenceDir(nodeId), { recursive: true });
  await writeFile(join(evidenceDir(nodeId), filename), buf);

  try {
    const row = await prisma.evidence.create({
      data: {
        nodeId,
        filename,
        originalName: safeOriginalName(file.name),
        mimeType: file.type,
        size: buf.length,
        uploadedBy: me.id,
        uploaderName: me.name,
      },
    });
    return { ...row, url };
  } catch (error) {
    await unlink(join(evidenceDir(nodeId), filename)).catch(() => undefined);
    throw error;
  }
}

export async function deleteEvidence(id: string): Promise<{ nodeId: string; originalName: string }> {
  const me = await getPlaceholderUser("submit");
  if (!me) throw new EvidenceError("未找到演示用户，无法确认上传人");
  const row = await prisma.evidence.findUnique({ where: { id } });
  if (!row) throw new EvidenceError("证据图片不存在");
  if (row.uploadedBy !== me.id) throw new EvidenceError("只能删除自己上传的证据图片");
  await prisma.evidence.delete({ where: { id } });
  await unlink(join(evidenceDir(row.nodeId), row.filename)).catch(() => undefined);
  return { nodeId: row.nodeId, originalName: row.originalName };
}
