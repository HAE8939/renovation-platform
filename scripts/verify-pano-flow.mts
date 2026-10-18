/**
 * verify-pano-flow.mts —— 全景模块集成门禁（扫描登记 / 可见性 / 上下架 / 不删文件）
 *
 * 隔离库：_scratch/pano-flow.db（run-gates 会 prisma migrate reset 自动建表 + seed）。
 * 磁盘侧：在 public/uploads/pano/ 下造几个 zz-门岗* 测试目录，跑完 finally 里清掉。
 *   为什么敢让它碰真实 uploads 目录：/public/uploads/ 整段被 gitignore（.gitignore:39），
 *   不会污染工作树；而登记服务必须对着**真实的文件系统**校验，用假 root 就等于没测这一层。
 *
 * 运行配方（在仓库根跑，指向临时库）：
 *   DATABASE_URL="file:../_scratch/pano-flow.db" npx prisma migrate reset --force --skip-generate
 *   DATABASE_URL="file:../_scratch/pano-flow.db" npx tsx --tsconfig tsconfig.json scripts/verify-pano-flow.mts
 * 退出码 0=全过，1=有 FAIL。
 *
 * 只测服务层的理由：动作层（modules/pano/actions.ts）会调 revalidatePath，
 * 离开 Next 请求上下文就抛，非请求进程里 import 它测不到东西。
 * 动作层真正该被钉住的那条（“状态没变就不写流水”）在这里以服务层的 noop 返回值形式断言，
 * 因为那正是动作层用来决定要不要埋点的开关。
 */
import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/core/db";
import {
  formatBytes,
  getTourDirSnapshot,
  panoRootAbs,
  scanPanoRoot,
} from "@/modules/pano/server/scan";
import {
  PanoError,
  getPanoTourById,
  listAllPanoTours,
  listPanoToursForIndex,
  listPanoToursForProject,
  movePanoTour,
  reconcilePanoRoot,
  registerPanoTour,
  setPanoTourStatus,
  unregisterPanoTour,
  updatePanoTourProfile,
} from "@/modules/pano/server/tours";

const results: { name: string; ok: boolean }[] = [];
const chk = (name: string, ok: boolean, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const eq = (name: string, got: unknown, want: unknown) =>
  chk(name, JSON.stringify(got) === JSON.stringify(want), `实得 ${JSON.stringify(got)} / 期望 ${JSON.stringify(want)}`);

async function expectPanoError(fn: () => Promise<unknown>, includes: string): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (e) {
    return e instanceof PanoError && e.message.includes(includes);
  }
}

const DIR_A = "zz-门岗甲";
const DIR_B = "zz-门岗缺入口";
const DIR_C = "zz-门岗丙";
const DIR_D = "zz-门岗丁";
const ALL_DIRS = [DIR_A, DIR_B, DIR_C, DIR_D];

/** 造一个尽量像 MT-Pano 导出物的目录：index.html + app.js + project.json + tiles/<景>/preview.jpg。 */
async function makeFixture(dirName: string, opts: { entry?: boolean; scenes?: string[]; title?: string } = {}) {
  const abs = path.join(panoRootAbs(), dirName);
  await rm(abs, { recursive: true, force: true });
  await mkdir(abs, { recursive: true });
  if (opts.entry !== false) {
    await writeFile(
      path.join(abs, "index.html"),
      "<!doctype html><title>t</title><link rel=stylesheet href=style.css><script src=app.js></script>"
    );
  }
  // 场景故意给成 ["s2","s1"]，好证明封面取的是**包内第一幕**而不是目录名字母序。
  for (const s of opts.scenes ?? ["s2", "s1"]) {
    await mkdir(path.join(abs, "tiles", s), { recursive: true });
    await writeFile(path.join(abs, "tiles", s, "preview.jpg"), "jpeg-bytes");
  }
  if (opts.title) {
    await writeFile(
      path.join(abs, "project.json"),
      JSON.stringify({
        settings: { title: opts.title },
        scenes: (opts.scenes ?? ["s2", "s1"]).map((id) => ({ id, name: `景-${id}` })),
      })
    );
  }
  return abs;
}

async function main() {
  const root = panoRootAbs();
  console.log(`\n── 全景集成门禁 · 库=_scratch/pano-flow.db · 磁盘=${root} ──\n`);

  await mkdir(root, { recursive: true });
  for (const d of ALL_DIRS) await rm(path.join(root, d), { recursive: true, force: true });
  await prisma.panoTour.deleteMany({});

  const project = await prisma.project.findFirst({ where: { status: { not: "archived" } } });
  if (!project) throw new Error("库里无非归档项目（seed 没跑？）");
  const archived =
    (await prisma.project.findFirst({ where: { status: "archived" } })) ??
    (await prisma.project.create({
      data: {
        code: `RP-GATE-PANO-${Date.now()}`,
        name: "门岗：已归档项目",
        clientId: project.clientId,
        status: "archived",
      },
    }));

  await makeFixture(DIR_A, { title: "门岗甲导览" });
  await makeFixture(DIR_B, { entry: false });
  await makeFixture(DIR_C, { title: "门岗丙导览" });
  await makeFixture(DIR_D, { title: "门岗丁导览" });

  // ── 1. 扫描 ────────────────────────────────────────────
  const scan = await scanPanoRoot();
  chk("根目录存在", scan.rootExists === true);
  const a = scan.dirs.find((d) => d.dirName === DIR_A);
  const b = scan.dirs.find((d) => d.dirName === DIR_B);
  chk("中文目录名能被扫到", !!a && !!b, scan.dirs.map((d) => d.dirName).join(", "));
  eq("正常目录没有障碍", a?.problem, null);
  eq("能读出包内场景数", a?.meta.sceneCount, 2);
  eq("能读出包内标题", a?.meta.titleFromPack, "门岗甲导览");
  eq(
    "封面取包内第一幕（s2）而不是目录名字母序（s1）",
    a?.coverKey,
    `uploads/pano/${DIR_A}/tiles/s2/preview.jpg`
  );
  chk(
    "缺入口的目录被点名",
    !!b?.problem && b.problem.includes("index.html"),
    b?.problem ?? ""
  );
  eq("单目录现场与整盘扫描一致", (await getTourDirSnapshot(DIR_A))?.hasEntry, true);
  eq("不存在的目录现场为 null", await getTourDirSnapshot("zz-不存在"), null);
  eq("越界目录名不给现场", await getTourDirSnapshot("../etc"), null);
  eq("0 字节体积读数", formatBytes(0), "0 B");
  eq("1024 字节读数", formatBytes(1024), "1 KB");

  // ── 2. 登记的边界 ──────────────────────────────────────
  chk(
    "登记缺入口目录被拒",
    await expectPanoError(() => registerPanoTour({ dirName: DIR_B, projectId: null }), "缺 index.html")
  );
  chk(
    "登记磁盘上没有的目录被拒",
    await expectPanoError(() => registerPanoTour({ dirName: "zz-不存在", projectId: null }), "找不到目录")
  );
  chk(
    "登记越界目录名被拒",
    await expectPanoError(() => registerPanoTour({ dirName: "a/b", projectId: null }), "目录名不受支持")
  );

  const tourA = await registerPanoTour({ dirName: DIR_A, projectId: null });
  eq("登记未选项目 → 归入 unbound 而非消失", tourA.visibility, "unbound");
  chk("标题缺省取包内标题", tourA.title === "门岗甲导览", tourA.title);
  eq("场景数随登记落库", tourA.sceneCount, 2);
  chk("入口 URL 已转义中文目录", tourA.entryUrl === `/uploads/pano/${encodeURIComponent(DIR_A)}/index.html`, tourA.entryUrl ?? "");
  chk(
    "重复登记同一目录被拒",
    await expectPanoError(() => registerPanoTour({ dirName: DIR_A, projectId: null }), "已登记")
  );

  const idx0 = await listPanoToursForIndex();
  chk("未关联项目的导览照样进归纳页", idx0.visible.some((t) => t.id === tourA.id));
  chk("未关联计数 ≥ 1", idx0.unboundCount >= 1, String(idx0.unboundCount));

  // ── 3. 编辑 ────────────────────────────────────────────
  chk(
    "绑到不存在的项目被拒",
    await expectPanoError(() => updatePanoTourProfile(tourA.id, { projectId: "no-such" }), "所选项目不存在")
  );
  chk("标题置空被拒", await expectPanoError(() => updatePanoTourProfile(tourA.id, { title: "  " }), "标题不能为空"));
  for (const bad of [-1, 1.5, 1000]) {
    chk(`场景数 ${bad} 被拒`, await expectPanoError(() => updatePanoTourProfile(tourA.id, { sceneCount: bad }), "场景数"));
  }
  await updatePanoTourProfile(tourA.id, { projectId: project.id, sceneCount: 9 });
  const bound = await getPanoTourById(tourA.id);
  eq("绑定后归入 index", bound?.visibility, "index");
  eq("带上了项目编号", bound?.projectCode, project.code);
  eq("手工场景数落库", bound?.sceneCount, 9);
  eq("编辑不动目录名（登记与磁盘之间唯一的锚）", bound?.dirName, DIR_A);

  // ── 4. 上下架 ──────────────────────────────────────────
  const off = await setPanoTourStatus(tourA.id, "hidden");
  eq("下架是一次真变化", off.noop, false);
  eq("下架后人话状态", off.view.statusLabel, "已下架");
  const idx1 = await listPanoToursForIndex();
  chk("下架后不进归纳页", !idx1.visible.some((t) => t.id === tourA.id));
  chk("下架计数 ≥ 1（页面要如实说明少了什么）", idx1.hiddenCount >= 1, String(idx1.hiddenCount));
  const offAgain = await setPanoTourStatus(tourA.id, "hidden");
  eq("重复下架必须 noop（动作层据此不写流水，§4.3）", offAgain.noop, true);
  const on = await setPanoTourStatus(tourA.id, "published");
  eq("再上架是真变化", on.noop, false);
  chk(
    "未知状态被拒",
    await expectPanoError(() => setPanoTourStatus(tourA.id, "archived"), "未知的导览状态")
  );

  // ── 5. 归档项目的可见性（§4.3）──────────────────────────
  const tourC = await registerPanoTour({ dirName: DIR_C, projectId: archived.id });
  eq("绑到已归档项目 → hidden-archived", tourC.visibility, "hidden-archived");
  const idx2 = await listPanoToursForIndex();
  chk("已归档项目的导览不进归纳页", !idx2.visible.some((t) => t.id === tourC.id));
  chk("归档计数 ≥ 1", idx2.archivedCount >= 1, String(idx2.archivedCount));
  chk("但管理视角仍看得见它（不是数据消失）", (await listAllPanoTours()).some((t) => t.id === tourC.id));
  chk(
    "项目详情的全景页签仍列出（管理视角要能解释为什么少一条）",
    (await listPanoToursForProject(archived.id)).some((t) => t.id === tourC.id)
  );

  // ── 6. 次序 ────────────────────────────────────────────
  const tourD = await registerPanoTour({ dirName: DIR_D, projectId: project.id });
  eq("同组自动落到末尾", tourD.order, (await getPanoTourById(tourA.id))!.order + 1);
  const movedDown = await movePanoTour(tourA.id, "down");
  eq("下移不是 noop", movedDown.noop, false);
  eq("两条次序交换了", (await getPanoTourById(tourA.id))!.order, tourD.order);
  eq("被换的那条拿到原次序", (await getPanoTourById(tourD.id))!.order, tourA.order);
  const edgeA = await getPanoTourById(tourA.id);
  const edge = await movePanoTour(edgeA!.id, edgeA!.order === 0 ? "up" : "down");
  eq("顶/尾越界移动是 noop（不给假成功）", edge.noop, true);

  // ── 7. 解除登记不删文件 ─────────────────────────────────
  const gone = await unregisterPanoTour(tourA.id);
  eq("解除登记返回被摘掉的那条", gone.view.dirName, DIR_A);
  eq("库里确实没有", await getPanoTourById(tourA.id), null);
  await access(path.join(panoRootAbs(), DIR_A, "index.html"));
  chk("磁盘目录与入口文件仍在（只摘登记，不动文件）", true);
  const reScan = await scanPanoRoot();
  chk("重新扫描后它又变成未登记", reScan.dirs.some((d) => d.dirName === DIR_A));
  chk(
    "解除不存在的登记被拒",
    await expectPanoError(() => unregisterPanoTour(tourA.id), "不存在")
  );

  // ── 8. 对账：库里有、磁盘没了 ───────────────────────────
  const dAbs = path.join(panoRootAbs(), DIR_D);
  await rename(dAbs, path.join(panoRootAbs(), DIR_D + "-搬走了"));
  const rec = await reconcilePanoRoot();
  chk("登记还在但文件不在 → 进 missingOnDisk", rec.missingOnDisk.some((t) => t.id === tourD.id));
  chk("这条同时不在归纳页也不在 matched 里", !rec.matched.some((m) => m.view.id === tourD.id));
  await rename(path.join(panoRootAbs(), DIR_D + "-搬走了"), dAbs);
  const rec2 = await reconcilePanoRoot();
  chk("文件放回原位后报警消失", !rec2.missingOnDisk.some((t) => t.id === tourD.id));
  chk("已登记且磁盘在 → matched", rec2.matched.some((m) => m.view.id === tourD.id));
  chk("对账统计里未登记目录仍被列出", rec2.unregistered.some((d) => d.dirName === DIR_A));

  // ── 9. 埋点位置的不变量（§4.4 ③）─────────────────────────
  const panoLogs = await prisma.operationLog.count({ where: { action: { startsWith: "pano." } } });
  eq("服务层一条流水都不写（埋点只在动作层，防把业务写入拖进事务）", panoLogs, 0);

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${failed === 0 ? "全部通过" : `失败 ${failed} 项`} · 共 ${results.length} 项检查\n`);
  return failed === 0 ? 0 : 1;
}

try {
  process.exitCode = await main();
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await prisma.panoTour.deleteMany({}).catch(() => undefined);
  for (const d of ALL_DIRS) {
    await rm(path.join(panoRootAbs(), d), { recursive: true, force: true }).catch(() => undefined);
    await rm(path.join(panoRootAbs(), `${d}-搬走了`), { recursive: true, force: true }).catch(() => undefined);
  }
  await prisma.$disconnect().catch(() => undefined);
}
