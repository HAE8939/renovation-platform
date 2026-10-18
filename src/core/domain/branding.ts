import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * 品牌 Logo 落盘（M9-d 最简版）。单点收口“文件放哪 / 怎么命名 / 收哪些类型 / 多大 / 旧的怎么清”。
 *
 * 安全边界（三条，都是为把“上传链路复杂化”的风险摁住）：
 * 1. **绝不用客户端文件名**：目标名一律服务端生成（`logo-<时间>-<随机>.<ext>`），扩展名只从
 *    校验过的 MIME 映射而来 → 路径穿越（`../`）、任意扩展名、超长名都无从谈起。
 * 2. **类型白名单**：png / jpeg / webp。不收 svg（内联矢量可携带脚本，是 XSS 面）、不收 gif。
 * 3. **目录固定**：public/uploads/branding（gitignore，不进版本库），渲染时拼固定前缀。
 *
 * 替换语义：上传成功后先落新文件、再删旧文件（best-effort，删盘失败不阻断——旧文件成孤儿不影响
 * 正确性，只占一点空间；本模块不做全局清扫，守“最简版、不为清理过度设计”）。
 */

/** public 下的固定目录与对外可访问前缀（渲染侧与写盘侧共用，避免两处漂移）。 */
export const BRANDING_PUBLIC_DIR = "/uploads/branding";

/** 大小上限：512 KB。Logo 是矢量位图级别的小图，超这个基本是误传照片。 */
export const LOGO_MAX_BYTES = 512 * 1024;

/** MIME → 扩展名白名单。 */
const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export interface BrandingError {
  error: string;
}
export interface BrandingOk {
  filename: string;
  /** 替换时应被清理的旧文件名（若有）；调用方在写库成功后 unlinkFile 它。 */
  replaced: string | null;
}

function brandingAbsDir(): string {
  // next start / build 的 cwd 为仓库根；public 相对根解析。
  return join(process.cwd(), "public", "uploads", "branding");
}

/** 从文件名安全解析出对外 URL（拒绝任何含路径分隔符的值，双保险）。 */
export function brandingUrl(filename: string | null): string | null {
  if (!filename) return null;
  if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
    return null;
  }
  return `${BRANDING_PUBLIC_DIR}/${filename}`;
}

/**
 * 校验并写入一张 Logo，返回新文件名 + 待清理的旧文件名（不写库；库由调用方 setLogoFile）。
 * 通过返回 { filename, replaced }；不通过返回 { error }（中文，直达 UI）。
 */
export async function saveLogoFile(
  file: File | null | undefined,
  currentFilename: string | null,
): Promise<BrandingOk | BrandingError> {
  if (!file || typeof file.size !== "number" || file.size === 0) {
    return { error: "请选择要上传的 Logo 文件" };
  }
  const ext = MIME_EXT[file.type];
  if (!ext) {
    return { error: "仅支持 PNG / JPG / WebP 格式" };
  }
  if (file.size > LOGO_MAX_BYTES) {
    const kb = Math.round(LOGO_MAX_BYTES / 1024);
    return { error: `图片过大，请控制在 ${kb} KB 以内` };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  // 再按真实字节数判一次（防个别浏览器 type 与实际内容不符时 size 虚报）。
  if (buf.byteLength === 0 || buf.byteLength > LOGO_MAX_BYTES) {
    return { error: "图片内容为空或过大" };
  }

  const name = `logo-${Date.now()}-${randomBytes(4).toString("hex")}.${ext}`;
  const dir = brandingAbsDir();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), buf);

  // 旧文件与新的不同名才需清理（同名理论上不可能，服务端时间戳命名）。
  const replaced =
    currentFilename && currentFilename !== name && !currentFilename.includes("..")
      ? currentFilename
      : null;
  return { filename: name, replaced };
}

/** best-effort 删盘上文件；失败静默（孤儿文件不影响正确性，见文件头）。 */
export async function removeLogoFile(filename: string | null): Promise<void> {
  if (!filename || filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
    return;
  }
  try {
    await unlink(join(brandingAbsDir(), filename));
  } catch {
    /* 已不存在或删除失败：忽略 */
  }
}
