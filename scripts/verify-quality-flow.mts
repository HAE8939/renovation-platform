/**
 * verify-quality-flow.mts —— 质量节点流的【端到端集成门禁】（隔离库，不碰 dev.db）。
 *
 * 为什么存在：verify-quality.mjs 只断言纯函数；syncAcceptanceNodes / submitNode /
 * reviewNode 的事务、守卫、联动路径必须真跑生产服务层才能覆盖——承 M3-d2 教训
 * （跨函数事务不共享连接，只有端到端集成能抓）。本脚本覆盖 M7-b 节点流 + M7-c 问题流：
 * 同步建/删/幂等 + 进度联动同事务 + 非 pending 永不自动删 + 提交守卫 + 重提门控
 * + 审核通过/退回建问题 + 重复审核拒绝 + 整改/复验通过/复验退回（再锁）全链
 * + 手工新建问题校验（拒绝用例 + 成功字段逐一断言）。
 *
 * 运行配方（三步，指向一个临时库；在仓库根跑）：
 *   DATABASE_URL="file:../_scratch/quality-flow.db" npx prisma migrate deploy
 *   DATABASE_URL="file:../_scratch/quality-flow.db" npx prisma db seed
 *   DATABASE_URL="file:../_scratch/quality-flow.db" npx tsx --tsconfig tsconfig.json scripts/verify-quality-flow.mts
 * ⚠ 本脚本会**改库状态**：同一库不可直接重跑（会依据上次残留状态误报失败）。
 *   每次运行前须先重置：把第 1 步换成 `npx prisma migrate reset --force --skip-generate`
 *   （reset 自动重跑 seed），或删除该临时库文件后重走三步。
 * 退出码 0=全过，1=有 FAIL。临时库在 _scratch 下，不入库。
 */
import { prisma } from "@/core/db";
import { syncAcceptanceNodes } from "@/core/domain/acceptance";
import { updateTaskProgress } from "@/modules/schedule/server/updates";
import { submitNode, QualityNodeError } from "@/modules/quality/server/nodes";
import { reviewNode, QualityReviewError } from "@/modules/quality/server/review";
import {
  rectifyIssue,
  recheckIssue,
  createIssue,
  QualityIssueError,
} from "@/modules/quality/server/issues";
import { getPlaceholderUser } from "@/modules/quality/currentUser";

const results: { name: string; ok: boolean }[] = [];
const chk = (name: string, ok: boolean, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

async function main() {
  // 库初态守卫：本脚本会改库、不可重跑（见头注 ⚠）。检测演示基线
  // （fresh seed = 22 节点 / 1 问题；基线随 seed 演化同步更新此两数），
  // 不符即视为上次运行残留 → 明确提示先重置，避免一串误导性级联失败。
  const [baselineNodes, baselineIssues] = await Promise.all([
    prisma.acceptanceNode.count(),
    prisma.issue.count(),
  ]);
  if (baselineNodes !== 22 || baselineIssues !== 1) {
    console.error(
      `✗ 库非初始态（节点 ${baselineNodes}/22 · 问题 ${baselineIssues}/1，疑为上次运行残留）。\n` +
        `  请先重置临时库再跑：\n` +
        `  DATABASE_URL="file:../_scratch/quality-flow.db" npx prisma migrate reset --force --skip-generate`
    );
    process.exit(1);
  }

  // 占位审核人（用于断言 Issue.reportedBy）
  const reviewer = await getPlaceholderUser("review");
  chk("前置：占位审核用户存在（pm/inspector）", !!reviewer, reviewer?.name ?? "无");

  // ── 1) 同步建/删/幂等（002“金域蓝湾”天花工程任务）──────────────
  const p2 = await prisma.project.findUnique({ where: { code: "RP-2026-002" } });
  if (!p2) throw new Error("RP-2026-002 不存在（先跑 prisma db seed）");

  const beforeCount = await prisma.acceptanceNode.count({ where: { projectId: p2.id } });
  await syncAcceptanceNodes(p2.id);
  const afterSyncCount = await prisma.acceptanceNode.count({ where: { projectId: p2.id } });
  chk("同步幂等：重跑 syncAcceptanceNodes 节点数不变", beforeCount === afterSyncCount, `前 ${beforeCount} 后 ${afterSyncCount}`);

  const tianhua = await prisma.scheduleTask.findFirst({
    where: { projectId: p2.id, name: "天花工程" },
  });
  chk("前置：002 天花工程任务存在", !!tianhua, tianhua?.id ?? "无");

  // 同步前：天花工程未完工（in_progress 40%），无节点
  let tianhuaNode = tianhua
    ? await prisma.acceptanceNode.findUnique({ where: { taskId: tianhua.id } })
    : null;
  chk("前置：002 天花工程未完工 → 无节点", !tianhuaNode, tianhuaNode?.id ?? "无");

  // 置 100 → 同事务建节点（name 快照 / 检查项快照）
  await updateTaskProgress(tianhua!.id, 100);
  tianhuaNode = await prisma.acceptanceNode.findUnique({ where: { taskId: tianhua.id } });
  chk("进度 100 → 节点生成", !!tianhuaNode, tianhuaNode?.id ?? "无");
  chk("节点 name 快照 = 天花工程", tianhuaNode?.name === "天花工程", tianhuaNode?.name ?? "无");

  const tianhuaChecks = await prisma.nodeCheck.findMany({
    where: { nodeId: tianhuaNode!.id },
    orderBy: { order: "asc" },
  });
  const tianhuaTplCount = await prisma.checkItem.count({ where: { stage: "天花工程" } });
  chk(
    "检查项快照数 = CheckItem(stage=天花工程) 数",
    tianhuaChecks.length === tianhuaTplCount,
    `快照 ${tianhuaChecks.length} / 模板 ${tianhuaTplCount}`
  );
  chk("检查项快照全未检（result=null）", tianhuaChecks.every((c) => c.result === null));

  // 回落 50 → pending 节点被删
  await updateTaskProgress(tianhua!.id, 50);
  const afterDrop = await prisma.acceptanceNode.findUnique({ where: { taskId: tianhua.id } });
  chk("进度回落 50 → pending 节点被删", !afterDrop, afterDrop?.id ?? "无");

  // 再置 100 → 重新生成
  await updateTaskProgress(tianhua!.id, 100);
  const regenerated = await prisma.acceptanceNode.findUnique({ where: { taskId: tianhua.id } });
  chk("进度再置 100 → 节点重新生成", !!regenerated, regenerated?.id ?? "无");
  chk("重新生成节点状态 = pending", regenerated?.status === "pending", regenerated?.status ?? "无");

  // ── 2) 非 pending 永不自动删（003“老街”泥工工程 returned）────────
  const p3 = await prisma.project.findUnique({ where: { code: "RP-2026-003" } });
  if (!p3) throw new Error("RP-2026-003 不存在（先跑 prisma db seed）");

  const nini = await prisma.scheduleTask.findFirst({
    where: { projectId: p3.id, name: "泥工工程" },
  });
  chk("前置：003 泥工工程任务存在", !!nini, nini?.id ?? "无");

  let niniNode = nini
    ? await prisma.acceptanceNode.findUnique({ where: { taskId: nini.id } })
    : null;
  chk("前置：003 泥工节点存在且 = returned", niniNode?.status === "returned", niniNode?.status ?? "无");

  // 回落 60 → 非 pending 节点不删
  await updateTaskProgress(nini!.id, 60);
  const niniAfter60 = await prisma.acceptanceNode.findUnique({ where: { taskId: nini.id } });
  chk("进度回落 60 → 非 pending 节点仍在（不删）", !!niniAfter60 && niniAfter60.status === "returned", niniAfter60?.status ?? "无");

  // 恢复 100
  await updateTaskProgress(nini!.id, 100);
  const niniRestored = await prisma.acceptanceNode.findUnique({ where: { taskId: nini.id } });
  chk("恢复 100 → 泥工节点仍在（returned 保留）", !!niniRestored && niniRestored.status === "returned", niniRestored?.status ?? "无");

  // ── 3) 提交守卫 ────────────────────────────────────────────────
  // 3a：对 submitted 节点提交 → 拒绝（002 水电工程 = submitted）
  const p2ShuiDian = await prisma.acceptanceNode.findFirst({
    where: { projectId: p2.id, name: "水电工程" },
  });
  chk("前置：002 水电节点 = submitted", p2ShuiDian?.status === "submitted", p2ShuiDian?.status ?? "无");

  let errSubmitted: string = "";
  let submittedClassOk = false;
  try {
    await submitNode(p2ShuiDian!.id, { checks: [], submitNote: "不应通过" });
  } catch (e) {
    errSubmitted = e instanceof Error ? e.message : String(e);
    submittedClassOk = e instanceof QualityNodeError;
  }
  chk("对 submitted 节点提交 → 拒绝", errSubmitted.includes("不可提交"), errSubmitted);
  chk("拒绝类 = QualityNodeError", submittedClassOk);

  // 3b：对 pending 缺检查项提交 → 拒绝“还有 N 项未检”（002 天花工程 = pending，3 检查项）
  const tianhuaPending = await prisma.acceptanceNode.findUnique({ where: { taskId: tianhua!.id } });
  chk("前置：002 天花工程节点 = pending", tianhuaPending?.status === "pending", tianhuaPending?.status ?? "无");

  let errMissing: string = "";
  try {
    await submitNode(tianhuaPending!.id, { checks: [], submitNote: "缺检查项" });
  } catch (e) {
    errMissing = e instanceof Error ? e.message : String(e);
  }
  chk("缺检查项提交 → 拒绝“还有 N 项未检”", errMissing.includes("未检"), errMissing);
  chk("缺检查项报错含数字 3", errMissing.includes("3"), errMissing);

  // 多余 id 报“检查项不匹配”（先真 id 全覆盖，再附 1 个多余 id；否则会先命中“未检”分支）
  let errExtra: string = "";
  try {
    const realIds = await prisma.nodeCheck.findMany({
      where: { nodeId: tianhuaPending!.id },
      select: { id: true },
      orderBy: { order: "asc" },
    });
    await submitNode(tianhuaPending!.id, {
      checks: [
        ...realIds.map((c) => ({ id: c.id, result: "pass" as const, note: "" })),
        { id: "no-such-check", result: "pass" as const, note: "" },
      ],
      submitNote: "多余",
    });
  } catch (e) {
    errExtra = e instanceof Error ? e.message : String(e);
  }
  chk("多余检查项 id → 拒绝“检查项不匹配”", errExtra.includes("不匹配"), errExtra);

  // 3c：全填提交 → status=submitted + submittedBy/submittedAt + 检查项结果写入
  const tianhuaChecksForSubmit = await prisma.nodeCheck.findMany({
    where: { nodeId: tianhuaPending!.id },
    select: { id: true },
    orderBy: { order: "asc" },
  });
  await submitNode(tianhuaPending!.id, {
    checks: tianhuaChecksForSubmit.map((c, i) => ({
      id: c.id,
      result: i === 0 ? "fail" as const : "pass" as const,
      note: i === 0 ? "首项不通过" : "",
    })),
    submitNote: "全填提交",
  });
  const tianhuaSubmitted = await prisma.acceptanceNode.findUnique({ where: { id: tianhuaPending!.id } });
  chk("全填提交 → status=submitted", tianhuaSubmitted?.status === "submitted", tianhuaSubmitted?.status ?? "无");
  chk("全填提交 → submittedBy 落库", !!tianhuaSubmitted?.submittedBy, tianhuaSubmitted?.submittedBy ?? "空");
  chk("全填提交 → submittedAt 落库", !!tianhuaSubmitted?.submittedAt, tianhuaSubmitted?.submittedAt?.toISOString() ?? "空");

  const tianhuaChecksAfter = await prisma.nodeCheck.findMany({
    where: { nodeId: tianhuaPending!.id },
    orderBy: { order: "asc" },
  });
  chk("检查项结果写入（首项 fail，其余 pass）", tianhuaChecksAfter.length === tianhuaChecksForSubmit.length && tianhuaChecksAfter[0]?.result === "fail" && tianhuaChecksAfter.slice(1).every((c) => c.result === "pass"));
  chk("检查项备注写入", tianhuaChecksAfter[0]?.note === "首项不通过", tianhuaChecksAfter[0]?.note ?? "空");

  // 3d：重复提交（已 submitted）→ 拒绝
  let errRepeat: string = "";
  try {
    await submitNode(tianhuaPending!.id, {
      checks: tianhuaChecksForSubmit.map((c) => ({ id: c.id, result: "pass" as const, note: "" })),
      submitNote: "重复",
    });
  } catch (e) {
    errRepeat = e instanceof Error ? e.message : String(e);
  }
  chk("重复提交 → 拒绝", errRepeat.includes("不可提交"), errRepeat);

  // ── 4) 重提门控（003 泥工 returned + 1 open 问题）───────────────
  const niniForResub = await prisma.acceptanceNode.findUnique({ where: { taskId: nini!.id } });
  chk("前置：003 泥工节点 = returned", niniForResub?.status === "returned", niniForResub?.status ?? "无");
  const niniOpenIssues = await prisma.issue.count({ where: { nodeId: niniForResub!.id, status: "open" } });
  chk("前置：003 泥工节点关联 open 问题 ≥ 1", niniOpenIssues >= 1, `实际 ${niniOpenIssues}`);

  let errResub: string = "";
  try {
    const niniChecks = await prisma.nodeCheck.findMany({
      where: { nodeId: niniForResub!.id },
      select: { id: true },
    });
    await submitNode(niniForResub!.id, {
      checks: niniChecks.map((c) => ({ id: c.id, result: "pass" as const, note: "" })),
      submitNote: "重提",
    });
  } catch (e) {
    errResub = e instanceof Error ? e.message : String(e);
  }
  chk("returned + open 问题 → 重提被拒", errResub.includes("未整改"), errResub);

  // 直接改库已替换为生产 rectifyIssue（M7-c 已上线）：断言 status/rectifyNote/rectifiedAt 落库
  const niniOpenIssue = await prisma.issue.findFirst({
    where: { nodeId: niniForResub!.id, status: "open" },
    select: { id: true },
  });
  chk("前置：003 泥工节点关联 open 问题可取", !!niniOpenIssue, niniOpenIssue?.id ?? "无");
  await rectifyIssue(niniOpenIssue!.id, "已拆除空鼓部位重新抹灰");
  const niniRectifiedIssue = await prisma.issue.findUnique({
    where: { id: niniOpenIssue!.id },
    select: { status: true, rectifyNote: true, rectifiedAt: true },
  });
  chk("rectifyIssue → status=rectified", niniRectifiedIssue?.status === "rectified", niniRectifiedIssue?.status ?? "无");
  chk("rectifyIssue → rectifyNote 落库", niniRectifiedIssue?.rectifyNote === "已拆除空鼓部位重新抹灰", niniRectifiedIssue?.rectifyNote ?? "空");
  chk("rectifyIssue → rectifiedAt 落库", !!niniRectifiedIssue?.rectifiedAt, niniRectifiedIssue?.rectifiedAt?.toISOString() ?? "空");
  const niniNoOpen = await prisma.issue.count({ where: { nodeId: niniForResub!.id, status: "open" } });
  chk("rectifyIssue → open 问题 = 0", niniNoOpen === 0, `实际 ${niniNoOpen}`);

  // 重提通过 → status=submitted
  const niniChecksForResub = await prisma.nodeCheck.findMany({
    where: { nodeId: niniForResub!.id },
    select: { id: true },
  });
  await submitNode(niniForResub!.id, {
    checks: niniChecksForResub.map((c) => ({ id: c.id, result: "pass" as const, note: "" })),
    submitNote: "整改后重提",
  });
  const niniSubmitted = await prisma.acceptanceNode.findUnique({ where: { id: niniForResub!.id } });
  chk("整改后重提 → status=submitted", niniSubmitted?.status === "submitted", niniSubmitted?.status ?? "无");

  // ── 5) 审核守卫与流转 ──────────────────────────────────────────
  // 5a：对非 submitted 审核 → 拒绝（002 拆除 = passed）
  const p2ChaiChu = await prisma.acceptanceNode.findFirst({
    where: { projectId: p2.id, name: "拆除工程" },
  });
  chk("前置：002 拆除节点 = passed", p2ChaiChu?.status === "passed", p2ChaiChu?.status ?? "无");
  let errReviewNonSub: string = "";
  try {
    await reviewNode(p2ChaiChu!.id, { approve: true });
  } catch (e) {
    errReviewNonSub = e instanceof Error ? e.message : String(e);
  }
  chk("对非 submitted 审核 → 拒绝“仅待审核”", errReviewNonSub.includes("仅待审核"), errReviewNonSub);

  // 5b：reviewNode(pass) → passed + reviewedBy/At（003 泥工 = submitted）
  await reviewNode(niniForResub!.id, { approve: true });
  const niniPassed = await prisma.acceptanceNode.findUnique({ where: { id: niniForResub!.id } });
  chk("reviewNode(pass) → status=passed", niniPassed?.status === "passed", niniPassed?.status ?? "无");
  chk("reviewNode(pass) → reviewedBy 落库", !!niniPassed?.reviewedBy, niniPassed?.reviewedBy ?? "空");
  chk("reviewNode(pass) → reviewedAt 落库", !!niniPassed?.reviewedAt, niniPassed?.reviewedAt?.toISOString() ?? "空");
  chk("reviewNode(pass) → reviewedBy = 占位审核人", niniPassed?.reviewedBy === reviewer?.id, `${niniPassed?.reviewedBy} vs ${reviewer?.id}`);

  // 5c：reviewNode(return, 空原因) → 拒绝（002 天花工程 = submitted）
  let errEmptyReason: string = "";
  try {
    await reviewNode(tianhuaPending!.id, { approve: false, reason: "   ", severity: "normal" });
  } catch (e) {
    errEmptyReason = e instanceof Error ? e.message : String(e);
  }
  chk("reviewNode(return, 空原因) → 拒绝“退回原因不能为空”", errEmptyReason.includes("不能为空"), errEmptyReason);

  // 5d：reviewNode(return, reason+severity) → returned + Issue 断言
  const issueBeforeReturn = await prisma.issue.count();
  const reasonText = "天花龙骨间距不合格需返工";
  await reviewNode(tianhuaPending!.id, {
    approve: false,
    reason: reasonText,
    severity: "major",
  });
  const tianhuaReturned = await prisma.acceptanceNode.findUnique({ where: { id: tianhuaPending!.id } });
  chk("reviewNode(return) → status=returned", tianhuaReturned?.status === "returned", tianhuaReturned?.status ?? "无");
  chk("reviewNode(return) → returnReason 落库", tianhuaReturned?.returnReason === reasonText, tianhuaReturned?.returnReason ?? "空");
  chk("reviewNode(return) → reviewedBy 落库", !!tianhuaReturned?.reviewedBy, tianhuaReturned?.reviewedBy ?? "空");

  const newIssue = await prisma.issue.findFirst({
    where: { nodeId: tianhuaPending!.id },
    orderBy: { createdAt: "desc" },
  });
  const issueCountAfterReturn = await prisma.issue.count();
  chk("退回同事务建 Issue（数量 +1）", issueCountAfterReturn === issueBeforeReturn + 1, `前 ${issueBeforeReturn} 后 ${issueCountAfterReturn}`);
  chk("Issue.title = `${名}验收退回`", newIssue?.title === "天花工程验收退回", newIssue?.title ?? "空");
  chk("Issue.desc = 退回原因", newIssue?.desc === reasonText, newIssue?.desc ?? "空");
  chk("Issue.severity = major", newIssue?.severity === "major", newIssue?.severity ?? "空");
  chk("Issue.status = open", newIssue?.status === "open", newIssue?.status ?? "空");
  chk("Issue.reportedBy = 审核人", newIssue?.reportedBy === reviewer?.id, `${newIssue?.reportedBy} vs ${reviewer?.id}`);
  chk("Issue.nodeId = 当前节点", newIssue?.nodeId === tianhuaPending!.id, newIssue?.nodeId ?? "空");
  chk("Issue.projectId = 002", newIssue?.projectId === p2.id, newIssue?.projectId ?? "空");

  // 5e：对 passed 再审 → 拒绝（003 泥工 = passed）
  let errReReview: string = "";
  try {
    await reviewNode(niniForResub!.id, { approve: true });
  } catch (e) {
    errReReview = e instanceof Error ? e.message : String(e);
  }
  chk("对 passed 再审 → 拒绝“仅待审核”", errReReview.includes("仅待审核"), errReReview);

  // ── 6) 问题流全链（003 防水工程节点，pending → 复验退回再锁 → 全链 open→rectified→closed）──
  // 6a：定位 003 防水工程节点（seed 物化为 pending）
  const fangshuiNode = await prisma.acceptanceNode.findFirst({
    where: { project: { code: "RP-2026-003" }, name: "防水工程" },
  });
  chk("前置：003 防水工程节点存在", !!fangshuiNode, fangshuiNode?.id ?? "无");
  chk("前置：003 防水工程节点 = pending", fangshuiNode?.status === "pending", fangshuiNode?.status ?? "无");

  // 6b：submitNode（全填 pass）→ submitted
  const fangshuiChecks0 = await prisma.nodeCheck.findMany({
    where: { nodeId: fangshuiNode!.id },
    select: { id: true },
    orderBy: { order: "asc" },
  });
  await submitNode(fangshuiNode!.id, {
    checks: fangshuiChecks0.map((c) => ({ id: c.id, result: "pass" as const, note: "" })),
    submitNote: "防水工程自检通过",
  });
  const fangshuiSubmitted = await prisma.acceptanceNode.findUnique({ where: { id: fangshuiNode!.id } });
  chk("6b 防水 submitNode → submitted", fangshuiSubmitted?.status === "submitted", fangshuiSubmitted?.status ?? "无");

  // 6c：reviewNode(return, reason, normal) → returned + 新问题 A（open）
  const issueBeforeFangshuiReturn = await prisma.issue.count();
  await reviewNode(fangshuiNode!.id, {
    approve: false,
    reason: "防水上翻高度不足",
    severity: "normal",
  });
  const fangshuiReturned = await prisma.acceptanceNode.findUnique({ where: { id: fangshuiNode!.id } });
  chk("6c 防水 reviewNode(return) → returned", fangshuiReturned?.status === "returned", fangshuiReturned?.status ?? "无");
  const issueCountAfterFangshuiReturn = await prisma.issue.count();
  chk("6c 退回建问题 A（数量 +1）", issueCountAfterFangshuiReturn === issueBeforeFangshuiReturn + 1, `前 ${issueBeforeFangshuiReturn} 后 ${issueCountAfterFangshuiReturn}`);
  const issueA = await prisma.issue.findFirst({
    where: { nodeId: fangshuiNode!.id },
    orderBy: { createdAt: "desc" },
  });
  chk("6c 问题 A.title = 防水工程验收退回", issueA?.title === "防水工程验收退回", issueA?.title ?? "空");
  chk("6c 问题 A.severity = normal", issueA?.severity === "normal", issueA?.severity ?? "空");
  chk("6c 问题 A.status = open", issueA?.status === "open", issueA?.status ?? "空");
  chk("6c 问题 A.nodeId = 防水节点", issueA?.nodeId === fangshuiNode!.id, issueA?.nodeId ?? "空");
  chk("6c 问题 A.projectId = 003", issueA?.projectId === p3.id, issueA?.projectId ?? "空");
  const issueAId = issueA!.id;

  // 6d：returned + open 问题 → 重提被拒（尚未整改）
  let errFangshuiResub1: string = "";
  try {
    const fc = await prisma.nodeCheck.findMany({ where: { nodeId: fangshuiNode!.id }, select: { id: true } });
    await submitNode(fangshuiNode!.id, {
      checks: fc.map((c) => ({ id: c.id, result: "pass" as const, note: "" })),
      submitNote: "未整改不应重提",
    });
  } catch (e) {
    errFangshuiResub1 = e instanceof Error ? e.message : String(e);
  }
  chk("6d 未整改重提 → 拒“存在未整改问题”", errFangshuiResub1.includes("未整改"), errFangshuiResub1);

  // 6e：rectifyIssue(A) → rectified
  await rectifyIssue(issueAId, "已整改上翻高度至 30cm");
  const issueARectified = await prisma.issue.findUnique({ where: { id: issueAId } });
  chk("6e rectifyIssue → status=rectified", issueARectified?.status === "rectified", issueARectified?.status ?? "无");
  chk("6e rectifyIssue → rectifyNote 落库", issueARectified?.rectifyNote === "已整改上翻高度至 30cm", issueARectified?.rectifyNote ?? "空");
  chk("6e rectifyIssue → rectifiedAt 落库", !!issueARectified?.rectifiedAt, issueARectified?.rectifiedAt?.toISOString() ?? "空");

  // 6f：recheckIssue(A, pass=false) → A 回 open + recheckNote 落库（复验退回，历史保留）
  await recheckIssue(issueAId, { pass: false, note: "仍未处理到位" });
  const issueAReopened = await prisma.issue.findUnique({ where: { id: issueAId } });
  chk("6f 复验退回 → status=open", issueAReopened?.status === "open", issueAReopened?.status ?? "无");
  chk("6f 复验退回 → recheckNote 落库", issueAReopened?.recheckNote === "仍未处理到位", issueAReopened?.recheckNote ?? "空");
  chk("6f 复验退回 → rectifyNote 历史保留", issueAReopened?.rectifyNote === "已整改上翻高度至 30cm", issueAReopened?.rectifyNote ?? "空");
  chk("6f 复验退回 → rectifiedAt 历史保留", !!issueAReopened?.rectifiedAt, issueAReopened?.rectifiedAt?.toISOString() ?? "空");

  // 6g：复验退回再锁——A 回 open 后重提仍被拒（关键断言）
  let errFangshuiResub2: string = "";
  try {
    const fc = await prisma.nodeCheck.findMany({ where: { nodeId: fangshuiNode!.id }, select: { id: true } });
    await submitNode(fangshuiNode!.id, {
      checks: fc.map((c) => ({ id: c.id, result: "pass" as const, note: "" })),
      submitNote: "复验退回后不应重提",
    });
  } catch (e) {
    errFangshuiResub2 = e instanceof Error ? e.message : String(e);
  }
  chk("6g 复验退回再锁 → 重提被拒“存在未整改问题”", errFangshuiResub2.includes("未整改"), errFangshuiResub2);

  // 6h：rectifyIssue(A) 二次整改 → rectified（rectifyNote 更新为最新）
  await rectifyIssue(issueAId, "二次整改完成");
  const issueARectified2 = await prisma.issue.findUnique({ where: { id: issueAId } });
  chk("6h 二次 rectifyIssue → status=rectified", issueARectified2?.status === "rectified", issueARectified2?.status ?? "无");
  chk("6h 二次 rectifyIssue → rectifyNote 更新", issueARectified2?.rectifyNote === "二次整改完成", issueARectified2?.rectifyNote ?? "空");

  // 6i：重提通过（A=rectified，canResubmitAfterReturn 通过）→ submitted
  const fcResub = await prisma.nodeCheck.findMany({ where: { nodeId: fangshuiNode!.id }, select: { id: true } });
  await submitNode(fangshuiNode!.id, {
    checks: fcResub.map((c) => ({ id: c.id, result: "pass" as const, note: "" })),
    submitNote: "二次整改后重提",
  });
  const fangshuiResubmitted = await prisma.acceptanceNode.findUnique({ where: { id: fangshuiNode!.id } });
  chk("6i 整改后重提 → status=submitted", fangshuiResubmitted?.status === "submitted", fangshuiResubmitted?.status ?? "无");

  // 6j：recheckIssue(A, pass=true) → closed + closedAt 落库（全链 open→rectified→closed）
  await recheckIssue(issueAId, { pass: true, note: "复验合格" });
  const issueAClosed = await prisma.issue.findUnique({ where: { id: issueAId } });
  chk("6j 复验通过 → status=closed", issueAClosed?.status === "closed", issueAClosed?.status ?? "无");
  chk("6j 复验通过 → closedAt 落库", !!issueAClosed?.closedAt, issueAClosed?.closedAt?.toISOString() ?? "空");
  chk("6j 复验通过 → recheckNote = 复验合格", issueAClosed?.recheckNote === "复验合格", issueAClosed?.recheckNote ?? "空");

  // 6k：对 closed 的 A 再 rectifyIssue → 拒“当前状态不可整改”
  let errRectifyClosed: string = "";
  let errRectifyClosedClass = false;
  try {
    await rectifyIssue(issueAId, "不应通过");
  } catch (e) {
    errRectifyClosed = e instanceof Error ? e.message : String(e);
    errRectifyClosedClass = e instanceof QualityIssueError;
  }
  chk("6k 对 closed rectifyIssue → 拒“当前状态不可整改”", errRectifyClosed.includes("不可整改"), errRectifyClosed);
  chk("6k 拒绝类 = QualityIssueError", errRectifyClosedClass);

  // ── 7) 手工新建 createIssue 校验 ──────────────────────────────
  // 7a：项目不存在 → 拒
  let errNoProject: string = "";
  try {
    await createIssue({
      projectId: "no-such-project",
      title: "标题合法但项目不存在",
      desc: "",
      severity: "normal",
      assigneeId: null,
      dueDateIso: null,
    });
  } catch (e) {
    errNoProject = e instanceof Error ? e.message : String(e);
  }
  chk("7a createIssue 项目不存在 → 拒“项目不存在”", errNoProject.includes("项目不存在"), errNoProject);

  // 7b：标题空 → 拒
  let errEmptyTitle: string = "";
  try {
    await createIssue({
      projectId: p3.id,
      title: "   ",
      desc: "",
      severity: "normal",
      assigneeId: null,
      dueDateIso: null,
    });
  } catch (e) {
    errEmptyTitle = e instanceof Error ? e.message : String(e);
  }
  chk("7b createIssue 标题空 → 拒“问题标题不能为空”", errEmptyTitle.includes("不能为空"), errEmptyTitle);

  // 7c：严重度非法 → 拒
  let errBadSeverity: string = "";
  try {
    await createIssue({
      projectId: p3.id,
      title: "严重度非法用例",
      desc: "",
      severity: "critical",
      assigneeId: null,
      dueDateIso: null,
    });
  } catch (e) {
    errBadSeverity = e instanceof Error ? e.message : String(e);
  }
  chk("7c createIssue 严重度非法 → 拒“严重度取值非法”", errBadSeverity.includes("严重度"), errBadSeverity);

  // 7d：成功新建 → 字段逐一断言（status=open / reportedBy=占位提交人 / nodeId=null / dueDate 可空）
  const submitUser = await getPlaceholderUser("submit");
  chk("前置：占位提交用户存在（inspector/pm）", !!submitUser, submitUser?.name ?? "无");
  const created = await createIssue({
    projectId: p3.id,
    title: "手工新建测试问题",
    desc: "  描述前后空白  ",
    severity: "major",
    assigneeId: null,
    dueDateIso: null,
  });
  const createdIssue = await prisma.issue.findUnique({ where: { id: created.id } });
  chk("7d createIssue 成功 → status=open", createdIssue?.status === "open", createdIssue?.status ?? "无");
  chk("7d createIssue 成功 → reportedBy=占位提交人", createdIssue?.reportedBy === submitUser?.id, `${createdIssue?.reportedBy} vs ${submitUser?.id}`);
  chk("7d createIssue 成功 → nodeId=null（手工建无来源节点）", createdIssue?.nodeId === null, createdIssue?.nodeId ?? "非空");
  chk("7d createIssue 成功 → dueDate=null（可空）", createdIssue?.dueDate === null, createdIssue?.dueDate?.toISOString() ?? "非空");
  chk("7d createIssue 成功 → desc 去空白", createdIssue?.desc === "描述前后空白", createdIssue?.desc ?? "空");
  chk("7d createIssue 成功 → severity=major", createdIssue?.severity === "major", createdIssue?.severity ?? "无");
  chk("7d createIssue 成功 → projectId=003", createdIssue?.projectId === p3.id, createdIssue?.projectId ?? "空");

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${failed === 0 ? "全部通过" : `失败 ${failed} 项`} · 共 ${results.length} 项检查\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
