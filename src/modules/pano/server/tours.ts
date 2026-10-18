/**
 * 全景模块 · 登记与视图服务（M15-a）
 *
 * 分工：磁盘侧只读扫描在 ./scan.ts，本文件管库里的「一条登记」。两边谁都不许猜对方——
 * 登记前一定实到磁盘现场（目录在不在、有没有可打开的入口），避免库里出现一条点开就 404 的记录。
 *
 * 三条口径：
 * ① **dirName 登记后不可改**。它是库记录与磁盘目录之间唯一的锚，改了就和文件失联；
 *    要换目录，走「解除登记 → 移文件 → 重新登记」，全程文件不动。
 * ② **解除登记只删登记，不删文件**（§4.3 不硬删业务数据）。误登记、或临时下线一条，
 *    都留得回；真要清磁盘由人工在服务器上删目录。
 * ③ 状态未变化时**不写流水**（§4.3 M13 实见：无变化的 archive 记录会污染恢复目标；
 *    这里同理，恢复/审计都读流水，一条“从已上架到已上架”的记录就是脏数据）。
 */
import type { Prisma } from "@prisma/client";
import prisma from "@/core/db";
import {
  PANO_STATUS,
  classifyPanoVisibility,
  comparePanoTour,
  isPanoStatus,
  isSafeTourDir,
  panoEntryUrl,
  panoHiddenReason,
  panoStatusLabel,
  panoStorageKeyToUrl,
  showsOnPanoIndex,
  type PanoVisibility,
} from "../types";
import { PANO_STORAGE_PREFIX, getTourDirSnapshot, scanPanoRoot, type TourDirSnapshot } from "./scan";

export class PanoError extends Error {}

const tourInclude = {
  project: {
    select: { id: true, code: true, name: true, status: true, client: { select: { name: true } } },
  },
} as const satisfies Prisma.PanoTourInclude;

type TourRow = Prisma.PanoTourGetPayload<{ include: typeof tourInclude }>;

export interface PanoTourView {
  id: string;
  dirName: string;
  title: string;
  sceneCount: number;
  /** 封面 URL（无封面或键越界则 null）。 */
  coverUrl: string | null;
  /** 导览入口 URL；目录名非法时 null（界面据此显示“路径异常”，不拼坏链接）。 */
  entryUrl: string | null;
  status: string;
  statusLabel: string;
  order: number;
  note: string | null;
  projectId: string | null;
  projectCode: string | null;
  projectName: string | null;
  clientName: string | null;
  projectStatus: string | null;
  /** 归纳页可见性分类（§4.3）。 */
  visibility: PanoVisibility;
  /** 不可见的人话原因；可见时 null。 */
  hiddenReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toView(row: TourRow): PanoTourView {
  const visibilityInput = {
    status: row.status,
    projectId: row.projectId,
    projectStatus: row.project?.status ?? null,
  };
  return {
    id: row.id,
    dirName: row.dirName,
    title: row.title,
    sceneCount: row.sceneCount,
    coverUrl: panoStorageKeyToUrl(row.coverKey),
    entryUrl: panoEntryUrl(row.dirName),
    status: row.status,
    statusLabel: panoStatusLabel(row.status),
    order: row.order,
    note: row.note,
    projectId: row.projectId,
    projectCode: row.project?.code ?? null,
    projectName: row.project?.name ?? null,
    clientName: row.project?.client?.name ?? null,
    projectStatus: row.project?.status ?? null,
    visibility: classifyPanoVisibility(visibilityInput),
    hiddenReason: panoHiddenReason(visibilityInput),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function sortViews(rows: PanoTourView[]): PanoTourView[] {
  return [...rows].sort(comparePanoTour);
}

/** 管理页：全部登记，含已下架与归属已归档的。 */
export async function listAllPanoTours(): Promise<PanoTourView[]> {
  const rows = await prisma.panoTour.findMany({ include: tourInclude });
  return sortViews(rows.map(toView));
}

export interface PanoIndexResult {
  visible: PanoTourView[];
  /** 已下架而未列出的条数——归纳页要如实说出来，别让人以为文件丢了（§4.3）。 */
  hiddenCount: number;
  /** 归属项目已归档而未列出的条数。 */
  archivedCount: number;
  /** 已上架但还没挂上项目的条数（这些**会**出现在页面上，只是另组）。 */
  unboundCount: number;
}

/** 归纳页：只出「已上架 且 归属项目未归档」的；未关联项目的照出，另组提醒。 */
export async function listPanoToursForIndex(): Promise<PanoIndexResult> {
  const all = await listAllPanoTours();
  const visible: PanoTourView[] = [];
  let hiddenCount = 0;
  let archivedCount = 0;
  let unboundCount = 0;
  for (const t of all) {
    if (showsOnPanoIndex({ status: t.status, projectId: t.projectId, projectStatus: t.projectStatus })) {
      visible.push(t);
      if (!t.projectId) unboundCount += 1;
    } else if (t.visibility === "hidden-archived") {
      archivedCount += 1;
    } else {
      hiddenCount += 1;
    }
  }
  return { visible, hiddenCount, archivedCount, unboundCount };
}

/** 项目详情“全景”页签：该项目下的全部导览（含已下架，页签里要看得见才知道为什么没上架）。 */
export async function listPanoToursForProject(projectId: string): Promise<PanoTourView[]> {
  const rows = await prisma.panoTour.findMany({ where: { projectId }, include: tourInclude });
  return sortViews(rows.map(toView));
}

export async function getPanoTourById(id: string): Promise<PanoTourView | null> {
  const row = await prisma.panoTour.findUnique({ where: { id }, include: tourInclude });
  return row ? toView(row) : null;
}

/**
 * 登记前必须先过的现场校验：目录在不在、能不能打开、有没有已登记过。
 * 返回 snapshot 供上层取 title/sceneCount/cover，避免二次扫盘。
 */
async function requireRegistrableDir(dirName: string): Promise<TourDirSnapshot> {
  if (!isSafeTourDir(dirName)) {
    throw new PanoError("目录名不受支持（不能含路径分隔符、以点开头或过长）");
  }
  const existing = await prisma.panoTour.findUnique({ where: { dirName } });
  if (existing) {
    throw new PanoError(`目录「${dirName}」已登记为「${existing.title}」，请直接编辑那条记录`);
  }
  const snapshot = await getTourDirSnapshot(dirName);
  if (!snapshot) {
    throw new PanoError(
      `磁盘上找不到目录「${dirName}」。请确认它已放进 public/uploads/pano/ 下（只放 zip 不算，需要解压后的目录）`
    );
  }
  if (snapshot.problem) {
    throw new PanoError(`目录「${dirName}」${snapshot.problem}`);
  }
  return snapshot;
}

async function requireProject(projectId: string): Promise<{ id: string; name: string }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (!project) throw new PanoError("所选项目不存在，请刷新后重选");
  return project;
}

async function nextOrderInGroup(projectId: string | null): Promise<number> {
  const agg = await prisma.panoTour.aggregate({
    where: projectId ? { projectId } : { projectId: null },
    _max: { order: true },
  });
  return (agg._max.order ?? -1) + 1;
}

export interface RegisterPanoTourInput {
  dirName: string;
  /** null / 空串 = 先登记后关联（管理页会列在“未关联项目”里催办）。 */
  projectId: string | null;
  /** 留空则依次退回包内标题、目录名。 */
  title?: string | null;
  note?: string | null;
}

export async function registerPanoTour(input: RegisterPanoTourInput): Promise<PanoTourView> {
  const dirName = input.dirName.trim();
  const snapshot = await requireRegistrableDir(dirName);
  const projectId = input.projectId?.trim() ? input.projectId.trim() : null;
  if (projectId) await requireProject(projectId);

  const title = (input.title?.trim() || snapshot.meta.titleFromPack || dirName).slice(0, 80);
  const created = await prisma.panoTour.create({
    data: {
      dirName,
      projectId,
      title,
      // 托管版导出没有 project.json → 读不到场景数，落 0；管理页会显示“未记录”而不是编一个数。
      sceneCount: snapshot.meta.sceneCount,
      coverKey: snapshot.coverKey,
      status: PANO_STATUS.published,
      note: input.note?.trim() || null,
      order: await nextOrderInGroup(projectId),
    },
    include: tourInclude,
  });
  return toView(created);
}

export interface UpdatePanoTourInput {
  title?: string;
  note?: string | null;
  /** 传 null 或空串＝解除项目关联（导览仍在归纳页的“未关联项目”组里，不会消失）。 */
  projectId?: string | null;
  /** 人工补场景数（托管版包内没有 project.json 时唯一的路）；不传则不动。 */
  sceneCount?: number;
}

export async function updatePanoTourProfile(
  id: string,
  input: UpdatePanoTourInput
): Promise<{ view: PanoTourView; beforeTitle: string }> {
  const row = await prisma.panoTour.findUnique({ where: { id } });
  if (!row) throw new PanoError("这条导览登记不存在，可能已被解除登记");

  const data: Prisma.PanoTourUpdateInput = {};
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) throw new PanoError("标题不能为空");
    data.title = title.slice(0, 80);
  }
  if (input.note !== undefined) data.note = input.note?.trim() || null;
  if (input.sceneCount !== undefined) {
    const n = Number(input.sceneCount);
    if (!Number.isInteger(n) || n < 0 || n > 999) throw new PanoError("场景数得是 0 到 999 之间的整数");
    data.sceneCount = n;
  }
  if (input.projectId !== undefined) {
    const pid = input.projectId?.trim() || null;
    if (pid) {
      await requireProject(pid);
      data.project = { connect: { id: pid } };
    } else {
      data.project = { disconnect: true };
    }
    // 换组要把 order 重新落到新组末尾，否则和项目里原有记录撞序号、顺序变得不可预期。
    data.order = await nextOrderInGroup(pid);
  }
  if (Object.keys(data).length === 0) {
    const unchanged = await prisma.panoTour.findUnique({ where: { id }, include: tourInclude });
    return { view: toView(unchanged as TourRow), beforeTitle: row.title };
  }
  const updated = await prisma.panoTour.update({ where: { id }, data, include: tourInclude });
  return { view: toView(updated), beforeTitle: row.title };
}

export interface SetStatusResult {
  view: PanoTourView;
  /** 状态本来就一样 → true，动作层据此跳过流水（见文件头第 ③ 条）。 */
  noop: boolean;
}

export async function setPanoTourStatus(id: string, status: string): Promise<SetStatusResult> {
  if (!isPanoStatus(status)) throw new PanoError(`未知的导览状态「${status}」`);
  const row = await prisma.panoTour.findUnique({ where: { id } });
  if (!row) throw new PanoError("这条导览登记不存在，可能已被解除登记");
  if (row.status === status) {
    const same = await prisma.panoTour.findUnique({ where: { id }, include: tourInclude });
    return { view: toView(same as TourRow), noop: true };
  }
  const updated = await prisma.panoTour.update({
    where: { id },
    data: { status },
    include: tourInclude,
  });
  return { view: toView(updated), noop: false };
}

/**
 * 解除登记：**只删库里这一行，磁盘目录与文件一个字节都不动**。
 * 于是下一次扫描又会把它列成「未登记」，随时可再登记回来——这是本模块唯一的“可撤销删除”。
 */
export async function unregisterPanoTour(id: string): Promise<{ view: PanoTourView }> {
  const row = await prisma.panoTour.findUnique({ where: { id }, include: tourInclude });
  if (!row) throw new PanoError("这条导览登记不存在，可能已被解除登记");
  await prisma.panoTour.delete({ where: { id } });
  return { view: toView(row) };
}

export interface MoveResult {
  view: PanoTourView;
  noop: boolean;
}

/** 同组内上移/下移一位：与相邻记录交换 order，不做重排（重排在并发下会把人绕晕）。 */
export async function movePanoTour(id: string, direction: "up" | "down"): Promise<MoveResult> {
  const row = await prisma.panoTour.findUnique({ where: { id } });
  if (!row) throw new PanoError("这条导览登记不存在，可能已被解除登记");
  const siblings = await prisma.panoTour.findMany({
    where: { projectId: row.projectId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  const idx = siblings.findIndex((s) => s.id === row.id);
  const target = direction === "up" ? idx - 1 : idx + 1;
  if (target < 0 || target >= siblings.length) {
    const edge = await prisma.panoTour.findUnique({ where: { id }, include: tourInclude });
    return { view: toView(edge as TourRow), noop: true };
  }
  const swap = siblings[target];
  await prisma.$transaction([
    prisma.panoTour.update({ where: { id: row.id }, data: { order: swap.order } }),
    prisma.panoTour.update({ where: { id: swap.id }, data: { order: row.order } }),
  ]);
  const updated = await prisma.panoTour.findUnique({ where: { id }, include: tourInclude });
  return { view: toView(updated as TourRow), noop: false };
}

/**
 * 管理页的“现场对账”：磁盘扫一遍、库里比一遍，分成三堆给人看。
 * 三堆都必须有——只有「未登记」会让放错目录看起来像成功，只有「已登记」会让人以为磁盘是准的。
 */
export interface PanoReconcile {
  root: string;
  rootExists: boolean;
  rootError: string | null;
  /** 磁盘有、库里没有。 */
  unregistered: TourDirSnapshot[];
  /** 磁盘有且库里也有。 */
  matched: Array<{ view: PanoTourView; snapshot: TourDirSnapshot }>;
  /** 库里有、磁盘找不到 —— 归纳页会把它排除，管理页必须显式报警。 */
  missingOnDisk: PanoTourView[];
  /** 磁盘有问题（缺入口等）不能登记的目录。 */
  broken: TourDirSnapshot[];
  diskBytes: number;
}

export async function reconcilePanoRoot(): Promise<PanoReconcile> {
  const scan = await scanPanoRoot();
  const tours = await listAllPanoTours();
  const byDir = new Map(tours.map((t) => [t.dirName, t]));
  const seen = new Set<string>();
  const unregistered: TourDirSnapshot[] = [];
  const matched: Array<{ view: PanoTourView; snapshot: TourDirSnapshot }> = [];
  const broken: TourDirSnapshot[] = [];
  let diskBytes = 0;

  for (const dir of scan.dirs) {
    diskBytes += dir.totalBytes;
    if (dir.problem) {
      broken.push(dir);
      continue;
    }
    const view = byDir.get(dir.dirName);
    if (view) {
      seen.add(dir.dirName);
      matched.push({ view, snapshot: dir });
    } else {
      unregistered.push(dir);
    }
  }
  const missingOnDisk = tours.filter((t) => !seen.has(t.dirName) && !scan.dirs.some((d) => d.dirName === t.dirName));
  return {
    root: scan.root,
    rootExists: scan.rootExists,
    rootError: scan.rootError,
    unregistered,
    matched,
    missingOnDisk,
    broken,
    diskBytes,
  };
}

/** 供提示文案用：登记用的存储前缀（不带前导斜杠，与 storageKey 同口径）。 */
export const PANO_KEY_PREFIX = PANO_STORAGE_PREFIX;
