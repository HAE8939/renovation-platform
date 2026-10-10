/**
 * verify-quality-flow.mts —— 质量节点流的【端到端集成门禁】（隔离库，不碰 dev.db）。
 *
 * 为什么存在：verify-quality.mjs 只断言纯函数；syncAcceptanceNodes / submitNode /
 * reviewNode 的事务、守卫、联动路径必须真跑生产服务层才能覆盖——承 M3-d2 教训
 * （跨函数事务不共享连接，只有端到端集成能抓）。本脚本覆盖 M7-b 节点流部分：
 * 同步建/删/幂等 + 进度联动同事务 + 非 pending 永不自动删 + 提交守卫 + 重提门控
 * + 审核通过/退回建问题 + 重复审核拒绝。
 *
 * 运行配方（三步，指向一个临时库；在仓库根跑）：
 *   DATABASE_URL="file:../_scratch/quality-flow.db" npx prisma migrate deploy
 *   DATABASE_URL="file:../_scratch/quality-flow.db" npx prisma db seed
 *   DATABASE_URL="file:../_scratch/quality-flow.db" npx tsx --tsconfig tsconfig.json scripts/verify-quality-flow.mts
 * 退出码 0=全过，1=有 FAIL。临时库在 _scratch 下，不入库。
 */
import { prisma } from "@/core/db";
import { syncAcceptanceNodes } from "@/core/domain/acceptance";
import { updateTaskProgress } from "@/modules/schedule/server/updates";
import { submitNode, QualityNodeError } from "@/modules/quality/server/nodes";
import { reviewNode, QualityReviewError } from "@/modules/quality/server/review";
import { getPlaceholderUser } from "@/modules/quality/currentUser";

const results: { name: string; ok: boolean }[] = [];
const chk = (name: string, ok: boolean, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

async function main() {
  // 占位审核人（用于断言 Issue.reportedBy）
  const reviewer = await getPlaceholderUser("review");
  chk("前置：占位审核用户存在（pm/inspector）", !!reviewer, reviewer?.name ?? "无");

  // ── 1) 同步建/删/幂等（002「金域蓝湾」天花工程任务）──────────────
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

  // ── 2) 非 pending 永不自动删（003「老街」泥工工程 returned）────────
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

  // 3b：对 pending 缺检查项提交 → 拒绝「还有 N 项未检」（002 天花工程 = pending，3 检查项）
  const tianhuaPending = await prisma.acceptanceNode.findUnique({ where: { taskId: tianhua!.id } });
  chk("前置：002 天花工程节点 = pending", tianhuaPending?.status === "pending", tianhuaPending?.status ?? "无");

  let errMissing: string = "";
  try {
    await submitNode(tianhuaPending!.id, { checks: [], submitNote: "缺检查项" });
  } catch (e) {
    errMissing = e instanceof Error ? e.message : String(e);
  }
  chk("缺检查项提交 → 拒绝「还有 N 项未检」", errMissing.includes("未检"), errMissing);
  chk("缺检查项报错含数字 3", errMissing.includes("3"), errMissing);

  // 多余 id 报「检查项不匹配」（先真 id 全覆盖，再附 1 个多余 id；否则会先命中「未检」分支）
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
  chk("多余检查项 id → 拒绝「检查项不匹配」", errExtra.includes("不匹配"), errExtra);

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

  // 直接改库：问题 open → rectified（M7-c 服务未上线）
  await prisma.issue.updateMany({
    where: { nodeId: niniForResub!.id, status: "open" },
    data: { status: "rectified" },
  });
  const niniNoOpen = await prisma.issue.count({ where: { nodeId: niniForResub!.id, status: "open" } });
  chk("改库 rectified → open 问题 = 0", niniNoOpen === 0, `实际 ${niniNoOpen}`);

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
  chk("对非 submitted 审核 → 拒绝「仅待审核」", errReviewNonSub.includes("仅待审核"), errReviewNonSub);

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
  chk("reviewNode(return, 空原因) → 拒绝「退回原因不能为空」", errEmptyReason.includes("不能为空"), errEmptyReason);

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
  chk("对 passed 再审 → 拒绝「仅待审核」", errReReview.includes("仅待审核"), errReReview);

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${failed === 0 ? "全部通过" : `失败 ${failed} 项`} · 共 ${results.length} 项检查\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
