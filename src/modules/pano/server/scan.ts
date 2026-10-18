/**
 * 全景模块 · 磁盘侧扫描（M15-a）
 *
 * 为什么要有这一层：全景成品是 MT-Pano 导出的**整个目录**（index.html + app.js + style.css
 * + marzipano.js + tiles/…），动辄几百个文件，走浏览器上传既慢又要引入解包依赖。
 * 定的路子是“本地导出 → 把目录放进 uploads/pano → 平台扫描登记”，所以平台必须先能
 * 客观回答三件事：这个目录**能不能打开**（有没有 index.html）、**包自己报了什么**
 * （project.json 里的标题与场景顺序）、**能不能当封面**（preview.jpg 在不在）。
 *
 * 三条硬纪律：
 * ① 只信文件名与存在性，不解析 app.js —— 那是导览引擎的产物，改一次版本就换写法，
 *    解析它等于把本模块绑在别人的内部实现上。
 * ② 越界即拒：目录名不安全（../ 、含斜杠、以点开头）直接跳过并说明原因，绝不拼进 URL。
 * ③ 只读。扫描不写库、不改文件、不建目录（目录不存在就照实说“还不存在”）。
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { logAppError } from "@/core/domain/telemetry";
import {
  PANO_COVER_FILENAMES,
  PANO_ENTRY_FILE,
  isSafeTourDir,
  pickFirstSceneDir,
} from "../types";

/** 相对 public 的存储前缀（与 FileAsset.storageKey 一样**不带**前导斜杠）。 */
export const PANO_STORAGE_PREFIX = "uploads/pano";

/** 一次统计的文件数上限：防御误放的超大目录把请求拖死。 */
const MAX_WALK_FILES = 20000;

export function panoRootAbs(): string {
  return path.join(process.cwd(), "public", "uploads", "pano");
}

export interface TourPackMeta {
  /** 包内 project.json 的 settings.title；托管版导出没有 project.json → null。 */
  titleFromPack: string | null;
  /** 包内场景顺序（project.json 的 scenes[].id）；没有则空数组。 */
  sceneIds: string[];
  sceneCount: number;
  hasProjectJson: boolean;
}

export interface TourDirSnapshot {
  dirName: string;
  /** 有没有可打开的入口（index.html 存在且非 0 字节）。 */
  hasEntry: boolean;
  entryBytes: number;
  fileCount: number;
  totalBytes: number;
  /** 封面相对 public 的键（不带前导斜杠）；找不到为 null。 */
  coverKey: string | null;
  /** 入口文件的修改时间，当作“这份成品是什么时候做出来的”。 */
  packedAt: Date | null;
  meta: TourPackMeta;
  /** 不可登记的原因；null 表示可以登记。 */
  problem: string | null;
}

export interface PanoScanResult {
  root: string;
  rootExists: boolean;
  /** 根目录不可用时的说明（不存在 / 无权限）。 */
  rootError: string | null;
  dirs: TourDirSnapshot[];
}

const EMPTY_META: TourPackMeta = {
  titleFromPack: null,
  sceneIds: [],
  sceneCount: 0,
  hasProjectJson: false,
};

async function fileStat(abs: string): Promise<{ size: number; mtime: Date } | null> {
  try {
    const st = await fs.stat(abs);
    return st.isFile() ? { size: st.size, mtime: st.mtime } : null;
  } catch {
    return null;
  }
}

/** 读包自带的 project.json；读不到或格式怪都不报错，只退回空 meta。 */
async function readPackMeta(dirAbs: string): Promise<TourPackMeta> {
  const raw = await fs.readFile(path.join(dirAbs, "project.json"), "utf8").catch(() => null);
  if (raw === null) return { ...EMPTY_META };
  try {
    const proj = JSON.parse(raw) as {
      settings?: { title?: unknown };
      scenes?: unknown;
    };
    const title = typeof proj.settings?.title === "string" ? proj.settings.title.trim() : "";
    const list = Array.isArray(proj.scenes) ? proj.scenes : [];
    const ids = list
      .map((s) => (s && typeof s === "object" ? (s as { id?: unknown }).id : null))
      .filter((v): v is string => typeof v === "string" && v.length > 0);
    return {
      titleFromPack: title || null,
      sceneIds: ids,
      sceneCount: list.length,
      hasProjectJson: true,
    };
  } catch {
    return { ...EMPTY_META, hasProjectJson: true };
  }
}

async function listSubDirNames(dirAbs: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirAbs, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/** 递归统计文件数与体积；不跟随符号链接（防环），超上限即停。 */
async function walkSize(
  dirAbs: string,
  acc: { files: number; bytes: number; capped: boolean }
): Promise<void> {
  if (acc.files >= MAX_WALK_FILES) {
    acc.capped = true;
    return;
  }
  let entries;
  try {
    entries = await fs.readdir(dirAbs, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isSymbolicLink()) continue;
    const abs = path.join(dirAbs, e.name);
    if (e.isDirectory()) {
      await walkSize(abs, acc);
    } else if (e.isFile()) {
      const st = await fileStat(abs);
      if (st) {
        acc.files += 1;
        acc.bytes += st.size;
      }
    }
  }
}

/**
 * 找一张能当封面的图。顺序：包内第一幕的 tiles/<scene>/preview.jpg →
 * 磁盘上第一个场景目录的 preview.jpg → 包根部的 cover.* / preview.*。
 * 刻意不用 flat.jpg：那是 2:1 等距柱状原样展开，塞进卡片会渲染成一个地球。
 */
async function detectCoverKey(dirAbs: string, meta: TourPackMeta): Promise<string | null> {
  const tileDirs = await listSubDirNames(path.join(dirAbs, "tiles"));
  const first = pickFirstSceneDir(meta.sceneIds.length ? meta.sceneIds : null, tileDirs);
  if (first) {
    const abs = path.join(dirAbs, "tiles", first, "preview.jpg");
    const st = await fileStat(abs);
    if (st && st.size > 0) return `${PANO_STORAGE_PREFIX}/${path.basename(dirAbs)}/tiles/${first}/preview.jpg`;
  }
  for (const name of PANO_COVER_FILENAMES) {
    const st = await fileStat(path.join(dirAbs, name));
    if (st && st.size > 0) return `${PANO_STORAGE_PREFIX}/${path.basename(dirAbs)}/${name}`;
  }
  return null;
}

async function snapshotDir(dirAbs: string, dirName: string): Promise<TourDirSnapshot> {
  const entry = await fileStat(path.join(dirAbs, PANO_ENTRY_FILE));
  const meta = await readPackMeta(dirAbs);
  const acc = { files: 0, bytes: 0, capped: false };
  await walkSize(dirAbs, acc);

  let problem: string | null = null;
  if (!isSafeTourDir(dirName)) {
    problem = "目录名不受支持（含路径分隔符、以点开头或过长），已跳过";
  } else if (!entry) {
    problem = `缺 ${PANO_ENTRY_FILE}（多半是只放了 zip、没解压）`;
  } else if (entry.size === 0) {
    problem = `${PANO_ENTRY_FILE} 是空文件，打不开`;
  }

  return {
    dirName,
    hasEntry: !!entry && entry.size > 0,
    entryBytes: entry?.size ?? 0,
    fileCount: acc.files,
    totalBytes: acc.bytes,
    coverKey: await detectCoverKey(dirAbs, meta),
    packedAt: entry?.mtime ?? null,
    meta,
    problem,
  };
}

/** 扫全根目录。根不存在不算错——内测机上第一个导览放进来之前本来就没有。 */
export async function scanPanoRoot(): Promise<PanoScanResult> {
  const root = panoRootAbs();
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      return { root, rootExists: false, rootError: null, dirs: [] };
    }
    logAppError("[pano.scanPanoRoot]", e, { root });
    return { root, rootExists: false, rootError: "根目录读不出来（多半是无权限）", dirs: [] };
  }
  const dirs = entries.filter((e) => e.isDirectory() && !e.isSymbolicLink()).map((e) => e.name);
  const snapshots: TourDirSnapshot[] = [];
  for (const name of dirs.sort()) {
    snapshots.push(await snapshotDir(path.join(root, name), name));
  }
  return { root, rootExists: true, rootError: null, dirs: snapshots };
}

/** 单个目录的现场（登记前校验用）。目录不存在或名字不安全 → null。 */
export async function getTourDirSnapshot(dirName: string): Promise<TourDirSnapshot | null> {
  if (!isSafeTourDir(dirName)) return null;
  const root = panoRootAbs();
  const abs = path.join(root, dirName);
  // 只允许根目录的直接子项，别把 path.join 当保险——显式判一次前缀更可靠。
  if (!abs.startsWith(root + path.sep)) return null;
  try {
    const st = await fs.stat(abs);
    if (!st.isDirectory()) return null;
  } catch {
    return null;
  }
  return snapshotDir(abs, dirName);
}

/** 字节数转人话（管理页显示占用）。整数值就别写成 “1.0 KB” 那种假精度。 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  if (i === 0) return `${Math.round(n)} B`;
  return `${n >= 100 ? Math.round(n) : n.toFixed(1).replace(/\.0$/, "")} ${units[i]}`;
}
