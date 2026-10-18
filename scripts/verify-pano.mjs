/**
 * verify-pano.mjs —— 全景模块纯函数门禁（不碰库、不碰磁盘）
 *
 * 为什么值得钉住：这个模块的判断几乎全在“边界”上——目录名会不会变成越界 URL、
 * 某条导览该不该出现在归纳页、脏状态该显示什么。这些错了都不会报错，只会静默给出
 * 一个坏链接或一个悄悄少掉的卡片。按 AGENTS §8 的纪律，口径变更必须同批改断言。
 *
 * 跑法：node scripts/verify-pano.mjs   （exit 0 = 全过；exit 1 = 有 FAIL）
 *      或 pnpm verify（scripts/run-gates.mjs 按 verify-*.mjs 文件名自动发现）
 * 依赖：无。直接 import 生产 TS（Node 原生跑 .ts，带 .ts 扩展名，勿穿 re-export 链）。
 */
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const T = await import(pathToFileURL(join(ROOT, "src/modules/pano/types.ts")).href);
const {
  PANO_COVER_FILENAMES,
  PANO_DIR_MAX_LEN,
  PANO_ENTRY_FILE,
  PANO_STATUS,
  PANO_STATUS_LABEL,
  PANO_STATUS_ORDER,
  classifyPanoVisibility,
  comparePanoTour,
  isPanoStatus,
  isSafeTourDir,
  panoAssetUrl,
  panoEntryUrl,
  panoHiddenReason,
  panoStatusLabel,
  panoStorageKeyToUrl,
  pickFirstSceneDir,
  showsOnPanoIndex,
} = T;

const results = [];
const chk = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS"  : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const eq = (name, got, want) =>
  chk(name, JSON.stringify(got) === JSON.stringify(want), `实得 ${JSON.stringify(got)} / 期望 ${JSON.stringify(want)}`);
const shows = (input) => showsOnPanoIndex(input);

console.log("\n── 全景模块纯函数门禁 ──\n");

// ── 1. 目录名安全 ────────────────────────────────────────────
const GOOD_DIRS = [
  "gongsheng_庭院住宅_web", // MT-Pano 的真实 slug 形态：品牌_项目名，带中文
  "保利天悦-竣工全景",
  "tour.01_a",
  "A1",
];
GOOD_DIRS.forEach((d) => chk(`目录名放行：${d}`, isSafeTourDir(d) === true));

const BAD_DIRS = [
  ["空串", ""],
  ["当前目录", "."],
  ["上级目录", ".."],
  ["路径穿越", "../etc"],
  ["内含斜杠", "a/b"],
  ["内含反斜杠", "a\\b"],
  ["隐藏目录", ".hidden"],
  ["首空格", " x"],
  ["尾空格", "x "],
  ["含冒号", "a:b"],
  ["含星号", "a*b"],
  ["含问号", "a?b"],
  ["含竖线", "a|b"],
  ["含换行", "a\nb"],
  ["超长", "x".repeat(PANO_DIR_MAX_LEN + 1)],
];
BAD_DIRS.forEach(([label, d]) => chk(`目录名拒绝：${label}`, isSafeTourDir(d) === false));

// ── 2. URL 拼接（越界必须拼不出来，而不是拼一个坏链接）──────
eq("入口 URL 用 index.html", panoEntryUrl("demo"), "/uploads/pano/demo/index.html");
eq(
  "中文目录名逐段 encodeURIComponent",
  panoEntryUrl("庭院 住宅"),
  `/uploads/pano/${encodeURIComponent("庭院 住宅")}/index.html`
);
chk("中文目录名确实被转义", panoEntryUrl("庭院 住宅").includes("%E5%BA%AD"), panoEntryUrl("庭院 住宅"));
eq("非法目录名不拼链接", panoEntryUrl("../etc"), null);
eq("包内路径的前导斜杠被吃掉", panoAssetUrl("demo", "/index.html"), "/uploads/pano/demo/index.html");
eq(
  "多层包内路径逐段转义",
  panoAssetUrl("第 1 期", "tiles/景 1/preview.jpg"),
  `/uploads/pano/${encodeURIComponent("第 1 期")}/tiles/${encodeURIComponent("景 1")}/preview.jpg`
);
eq("包内穿越被拒", panoAssetUrl("demo", "../../etc/passwd"), null);
eq("包内空路径被拒", panoAssetUrl("demo", ""), null);
eq("空目录名被拒", panoAssetUrl("", "index.html"), null);

// ── 3. storageKey → URL（只放行 uploads/pano/ 前缀）──────────
eq("null 键返回 null", panoStorageKeyToUrl(null), null);
eq("封面键转 URL", panoStorageKeyToUrl("uploads/pano/demo/tiles/s1/preview.jpg"), "/uploads/pano/demo/tiles/s1/preview.jpg");
eq("带前导斜杠也接受", panoStorageKeyToUrl("/uploads/pano/demo/cover.jpg"), "/uploads/pano/demo/cover.jpg");
eq("非全景前缀一律拒绝", panoStorageKeyToUrl("uploads/files/delivery/u1/x.pdf"), null);
eq("键内含穿越一律拒绝", panoStorageKeyToUrl("uploads/pano/../../x.jpg"), null);

// ── 4. 状态口径 ─────────────────────────────────────────────
chk("published 是合法态", isPanoStatus(PANO_STATUS.published) === true);
chk("hidden 是合法态", isPanoStatus(PANO_STATUS.hidden) === true);
chk("draft 不是导览态", isPanoStatus("draft") === false);
chk("大小写敏感（PUBLISHED 非法）", isPanoStatus("PUBLISHED") === false);
eq("已上架人话", panoStatusLabel("published"), "已上架");
eq("已下架人话", panoStatusLabel("hidden"), "已下架");
eq("脏值原样回显，不塌成已上架", panoStatusLabel("weird"), "weird");
eq(
  "状态清单与文案表键集合双向对齐",
  [...PANO_STATUS_ORDER].sort(),
  Object.keys(PANO_STATUS_LABEL).sort()
);

// ── 5. 可见性（§4.3「事按可见性」的机器口径）─────────────────
eq("已上架 + 已关联 → 进归纳页", classifyPanoVisibility({ status: "published", projectId: "p1", projectStatus: "in_progress" }), "index");
eq("已上架 + 未关联 → unbound", classifyPanoVisibility({ status: "published", projectId: null, projectStatus: null }), "unbound");
chk("未关联的照样进归纳页（不静默隐藏）", shows({ status: "published", projectId: null, projectStatus: null }) === true);
eq("已下架 → 不进归纳页", shows({ status: "hidden", projectId: "p1", projectStatus: "in_progress" }), false);
eq("项目已归档 → 不进归纳页", shows({ status: "published", projectId: "p1", projectStatus: "archived" }), false);
eq(
  "状态与归档同时命中时以状态为先（原因要唯一，别给两条互相抵消的解释）",
  classifyPanoVisibility({ status: "hidden", projectId: "p1", projectStatus: "archived" }),
  "hidden-status"
);
eq(
  "未知状态一律不展示（fail-safe：默认拒绝而非默认放行）",
  shows({ status: "weird", projectId: "p1", projectStatus: "in_progress" }),
  false
);
eq("归档未展示的人话原因", panoHiddenReason({ status: "published", projectId: "p1", projectStatus: "archived" }), "归属项目已归档");
eq("下架未展示的人话原因", panoHiddenReason({ status: "hidden", projectId: "p1", projectStatus: "in_progress" }), "已下架");
eq("可见时不给原因", panoHiddenReason({ status: "published", projectId: "p1", projectStatus: "in_progress" }), null);

// ── 6. 排序 ─────────────────────────────────────────────────
const t = (order, createdAt, title) => ({ order, createdAt: new Date(createdAt), title });
chk("order 小在前", comparePanoTour(t(0, "2026-01-01", "b"), t(1, "2026-01-01", "a")) < 0);
chk("同 order 按登记时间早在前", comparePanoTour(t(1, "2026-01-01", "b"), t(1, "2026-02-01", "a")) < 0);
chk("同 order 同时间按标题中文序", comparePanoTour(t(1, "2026-01-01", "安"), t(1, "2026-01-01", "北")) < 0);
eq(
  "排序是稳定全序（自反为 0）",
  comparePanoTour(t(3, "2026-03-03", "同一份"), t(3, "2026-03-03", "同一份")),
  0
);

// ── 7. 封面选取 ─────────────────────────────────────────────
chk(
  "2:1 展开图 flat.jpg 不许当封面（会被拉成一个地球）",
  PANO_COVER_FILENAMES.includes("flat.jpg") === false
);
eq("优先按包内场景顺序取第一幕", pickFirstSceneDir(["s2", "s1"], ["s1", "s2"]), "s2");
eq("没有包内顺序时退回目录名排序", pickFirstSceneDir(null, ["b", "a"]), "a");
eq("包内顺序对不上磁盘时退回磁盘存在的项（不返回不存在的目录）", pickFirstSceneDir(["zz"], ["a", "b"]), "a");
eq("磁盘上没有 tiles 就是 null", pickFirstSceneDir(["s1"], []), null);

// ── 8. 与 MT-Pano 导出约定的耦合点 ───────────────────────────
eq(
  "入口文件名必须仍是 index.html（改了这边要同步 MT-Pano catalog/README 的收录约定）",
  PANO_ENTRY_FILE,
  "index.html"
);

// ── 9. 文案不含 emoji（V0.3 禁用彩色图标/emoji）──────────────
const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
chk(
  "状态文案与可见性原因不含 emoji",
  [...Object.values(PANO_STATUS_LABEL), "已下架", "归属项目已归档"].every((s) => !emoji.test(s))
);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed === 0 ? "全部通过" : `失败 ${failed} 项`} · 共 ${results.length} 项检查\n`);
process.exit(failed === 0 ? 0 : 1);
