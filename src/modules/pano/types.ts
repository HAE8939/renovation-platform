/**
 * 全景管理模块 · 纯口径（M15-a）
 *
 * 本文件不碰 DB、不碰磁盘，只做可被门禁直接 import 的判断（同 design/status.ts 的分工）。
 * 三件事必须收在这里单点，因为它们都是“判错就会静默出错”的口径：
 *   ① 目录名安全 —— 全景成品是**磁盘目录**，目录名会进 URL，也必须进文件系统。
 *      注意不能只允许 ASCII：MT-Pano 的导出目录名是 `品牌_项目名`（build_tour.py 的 slug），
 *      中文是常态，一律走 encodeURIComponent。
 *   ② 可见性 —— 按 AGENTS §4.3「事按可见性」：下架与归属项目归档都不进归纳页；
 *      但**未关联项目**的导览仍然显示（另组），因为静默隐藏会让人以为文件丢了。
 *   ③ 排序 —— 同一项目内 order 小在前，同 order 按登记时间，保证刷新后不乱跳。
 */

export const PANO_ENTRY_FILE = "index.html";

/** 目录名长度上限：留足 encodeURIComponent 后的余量，也挡住误把整条路径当目录名传进来。 */
export const PANO_DIR_MAX_LEN = 120;

/** 分隔符 / Windows 非法字符 / 控制字符。中文与常见标点都允许。 */
const UNSAFE_DIR_CHARS = /[/\\:*?"<>|\u0000-\u001f]/;

/**
 * 磁盘目录名的安全判据（防穿越、防隐藏目录、防首尾空白导致的 URL 漂移）。
 * 返回 false 的目录：扫描时跳过并说明原因，登记与更新时一律拒绝写入。
 */
export function isSafeTourDir(name: unknown): name is string {
  if (typeof name !== "string") return false;
  if (!name || name !== name.trim()) return false;
  if (name.length > PANO_DIR_MAX_LEN) return false;
  if (name.startsWith(".") || name.includes("..")) return false;
  if (UNSAFE_DIR_CHARS.test(name)) return false;
  return true;
}

/** 路径片段级校验（coverKey / 包内相对路径都逐段过一遍，不接受 ..）。 */
function isSafePathSegment(seg: string): boolean {
  return !!seg && seg !== "." && seg !== ".." && !seg.includes("\u0000");
}

/**
 * 拼一个**可公开访问**的包内资源 URL：/uploads/pano/<目录>/<包内相对路径>。
 * 该前缀已在 core/domain/accessGate.ts 的白名单里（/uploads/ 整段放行）。
 * 任何一段不安全即返回 null —— 由调用方决定显示“文件不在”，而不是拼出半个坏链接。
 */
export function panoAssetUrl(dirName: string, relPath: string): string | null {
  if (!isSafeTourDir(dirName)) return null;
  const rel = relPath.replace(/^[/\\]+/, "");
  const segs = rel.split("/");
  if (!rel || segs.some((s) => !isSafePathSegment(s))) return null;
  return `/uploads/pano/${encodeURIComponent(dirName)}/${segs.map(encodeURIComponent).join("/")}`;
}

/** 导览入口 URL（iframe 的 src 就用它）。 */
export function panoEntryUrl(dirName: string): string | null {
  return panoAssetUrl(dirName, PANO_ENTRY_FILE);
}

/**
 * 把不带前导斜杠的 storageKey（与 FileAsset.storageKey 同口径）转成 URL。
 * 只接受 uploads/ 前缀下的键，避免把任意磁盘路径变成可访问链接。
 */
export function panoStorageKeyToUrl(storageKey: string | null): string | null {
  if (!storageKey) return null;
  const key = storageKey.replace(/^\/+/, "");
  if (!key.startsWith("uploads/pano/")) return null;
  const segs = key.split("/");
  if (segs.some((s) => !isSafePathSegment(s))) return null;
  return `/${segs.map(encodeURIComponent).join("/")}`;
}

// ── 上下架 ────────────────────────────────────────────────────

export const PANO_STATUS = {
  published: "published",
  hidden: "hidden",
} as const;

export type PanoStatus = (typeof PANO_STATUS)[keyof typeof PANO_STATUS];

export const PANO_STATUS_ORDER: PanoStatus[] = [PANO_STATUS.published, PANO_STATUS.hidden];

export const PANO_STATUS_LABEL: Record<PanoStatus, string> = {
  published: "已上架",
  hidden: "已下架",
};

export function isPanoStatus(value: unknown): value is PanoStatus {
  return typeof value === "string" && (PANO_STATUS_ORDER as string[]).includes(value);
}

/** 脏值原样回显，不塌成“已上架”——一格两用会让校验和展示双双落空（§4.3 的教训）。 */
export function panoStatusLabel(value: string): string {
  return isPanoStatus(value) ? PANO_STATUS_LABEL[value] : value;
}

// ── 可见性（§4.3）────────────────────────────────────────────

export interface PanoVisibilityInput {
  status: string;
  projectId: string | null;
  /** 归属项目的 status；未关联项目时为 null。 */
  projectStatus: string | null;
}

export type PanoVisibility =
  | "index" // 进归纳页
  | "unbound" // 进归纳页，但落在“未关联项目”组里提醒
  | "hidden-status" // 已下架，不进归纳页
  | "hidden-archived"; // 归属项目已归档，不进归纳页

export function classifyPanoVisibility(input: PanoVisibilityInput): PanoVisibility {
  if (input.status !== PANO_STATUS.published) return "hidden-status";
  if (input.projectStatus === "archived") return "hidden-archived";
  if (!input.projectId) return "unbound";
  return "index";
}

export function showsOnPanoIndex(input: PanoVisibilityInput): boolean {
  const kind = classifyPanoVisibility(input);
  return kind === "index" || kind === "unbound";
}

// ── 排序 ─────────────────────────────────────────────────────

export interface PanoOrderable {
  order: number;
  createdAt: Date | string;
  title: string;
}

export function comparePanoTour(a: PanoOrderable, b: PanoOrderable): number {
  if (a.order !== b.order) return a.order - b.order;
  const byTime = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  if (byTime !== 0) return byTime;
  return a.title.localeCompare(b.title, "zh-CN");
}

// ── 封面取哪一张 ─────────────────────────────────────────────

/**
 * 导览包内可选作封面的图片，按“更像一张成品照”的程度排。
 * 注意托管版导出会删掉每景 source.jpg（近一半体积），但保留 preview.jpg，
 * 所以 preview 是两条导出路径都能拿到的那一档；flat.jpg 是 2:1 原样展开，
 * 放进卡片会被拉成地球仪，故不选它。
 */
export const PANO_COVER_FILENAMES = ["cover.jpg", "cover.jpeg", "cover.png", "cover.webp", "preview.jpg"] as const;

/**
 * 选第一个有封面的场景目录：优先按包内 project.json 的场景顺序（那才是导览的第一幕），
 * 拿不到顺序时退回目录名排序。两者都给 null 表示包里找不到 tiles 结构。
 */
export function pickFirstSceneDir(
  sceneIdsFromPack: string[] | null,
  tileDirsOnDisk: string[]
): string | null {
  const present = new Set(tileDirsOnDisk);
  const firstFromPack = sceneIdsFromPack?.find((id) => present.has(id));
  if (firstFromPack) return firstFromPack;
  return [...tileDirsOnDisk].sort()[0] ?? null;
}

/** 一句人话：给管理页解释“为什么这条不在归纳页上”。不可见时返回 null。 */
export function panoHiddenReason(input: PanoVisibilityInput): string | null {
  switch (classifyPanoVisibility(input)) {
    case "hidden-status":
      return "已下架";
    case "hidden-archived":
      return "归属项目已归档";
    default:
      return null;
  }
}
