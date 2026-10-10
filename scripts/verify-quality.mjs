/**
 * verify-quality.mjs —— 质量管控纯函数回归校验（只读，纯函数，不碰库）
 *
 * 为什么存在：M7-a 把质量的状态机 / 派生文案 / 转移谓词 / 重提门控 /
 * 严重度语义色抽成纯函数 src/modules/quality/status.ts（不碰 DB、可被脚本
 * import 测）。本脚本把 TASK_M7 §3 / §6 的用例变成可重跑门禁：直接 import
 * 生产 TS（Node 24 原生跑 .ts，带 .ts 扩展名），再用独立预言机复算对照，
 * 并断言所有输出与函数返回值不含任何 emoji。
 *
 * 跑法：node scripts/verify-quality.mjs   （exit 0 = 全过；exit 1 = 有 FAIL）
 * 依赖：无。不连库、不连 prisma，只测纯函数。
 */

import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// 带 .ts 扩展名直 import 生产纯函数（勿穿无扩展名 re-export 链——踩过坑）。
const status = await import(
  pathToFileURL(join(ROOT, "src/modules/quality/status.ts")).href
);
const {
  NODE_STATUS_ORDER,
  NODE_STATUS_LABEL,
  nodeStatusTone,
  nodeDisplayLabel,
  canSubmitNode,
  canResubmitAfterReturn,
  nextNodeStatusAfterReview,
  assertNodeTransition,
  ISSUE_STATUS_ORDER,
  ISSUE_STATUS_LABEL,
  issueStatusTone,
  ISSUE_SEVERITY_ORDER,
  ISSUE_SEVERITY_LABEL,
  issueSeverityTone,
  canRectify,
  canClose,
  canReopen,
  assertIssueTransition,
} = status;

// M7-d：buildTimeline 纯函数（不碰 prisma，客户端可安全 import，脚本直接测）
const { buildTimeline } = await import(
  pathToFileURL(join(ROOT, "src/modules/quality/timeline.ts")).href
);

const results = [];
let failed = 0;
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (!ok) failed++;
}

// ── 节点状态常量完整 ─────────────────────────────────────────
{
  check(
    "NODE_STATUS_ORDER: 4 态顺序完整",
    NODE_STATUS_ORDER.length === 4 &&
      NODE_STATUS_ORDER[0] === "pending" &&
      NODE_STATUS_ORDER[1] === "submitted" &&
      NODE_STATUS_ORDER[2] === "returned" &&
      NODE_STATUS_ORDER[3] === "passed",
    `顺序 ${NODE_STATUS_ORDER.join("|")}`
  );
  check(
    "NODE_STATUS_LABEL: 4 态标签齐全且非空",
    Object.keys(NODE_STATUS_LABEL).length === 4 &&
      Object.values(NODE_STATUS_LABEL).every(
        (v) => typeof v === "string" && v.length > 0
      ),
    `标签 ${JSON.stringify(NODE_STATUS_LABEL)}`
  );
}

// ── nodeStatusTone 全覆盖（4 态 + 未知）──────────────────────
{
  check("nodeStatusTone: pending → neutral", nodeStatusTone("pending") === "neutral");
  check("nodeStatusTone: submitted → accent", nodeStatusTone("submitted") === "accent");
  check("nodeStatusTone: returned → danger", nodeStatusTone("returned") === "danger");
  check("nodeStatusTone: passed → success", nodeStatusTone("passed") === "success");
  check("nodeStatusTone: 未知 → neutral", nodeStatusTone("xx") === "neutral");
}

// ── nodeDisplayLabel：整改中/待重提/常规 ≥5 例 ──────────────────
{
  // 1. returned + 有 open → 整改中
  check(
    "nodeDisplayLabel: returned+open → 整改中",
    nodeDisplayLabel("returned", true) === "整改中",
    `返回 ${nodeDisplayLabel("returned", true)}`
  );
  // 2. returned + 无 open → 待重新提交
  check(
    "nodeDisplayLabel: returned+无open → 待重新提交",
    nodeDisplayLabel("returned", false) === "待重新提交",
    `返回 ${nodeDisplayLabel("returned", false)}`
  );
  // 3. pending → 待提交
  check(
    "nodeDisplayLabel: pending → 待提交",
    nodeDisplayLabel("pending", false) === "待提交",
    `返回 ${nodeDisplayLabel("pending", false)}`
  );
  // 4. submitted → 待审核（hasOpenIssues 参数无影响）
  check(
    "nodeDisplayLabel: submitted → 待审核",
    nodeDisplayLabel("submitted", false) === "待审核",
    `返回 ${nodeDisplayLabel("submitted", false)}`
  );
  // 5. passed → 已通过（hasOpenIssues 参数无影响）
  check(
    "nodeDisplayLabel: passed → 已通过",
    nodeDisplayLabel("passed", false) === "已通过",
    `返回 ${nodeDisplayLabel("passed", false)}`
  );
  // 6. pending + hasOpenIssues=true → 仍待提交（只有 returned 走派生分支）
  check(
    "nodeDisplayLabel: pending+open → 待提交（派生仅 returned）",
    nodeDisplayLabel("pending", true) === "待提交",
    `返回 ${nodeDisplayLabel("pending", true)}`
  );
}

// ── canSubmitNode：4 态 ──────────────────────────────────────
{
  check("canSubmitNode: pending → true", canSubmitNode("pending") === true);
  check("canSubmitNode: returned → true", canSubmitNode("returned") === true);
  check("canSubmitNode: submitted → false", canSubmitNode("submitted") === false);
  check("canSubmitNode: passed → false", canSubmitNode("passed") === false);
}

// ── canResubmitAfterReturn：重提门控 ≥4 例 ─────────────────────
{
  // 1. 空数组 → true（无关联问题的退回节点可直接重提）
  check(
    "canResubmitAfterReturn: 空数组 → true",
    canResubmitAfterReturn([]) === true,
    `返回 ${canResubmitAfterReturn([])}`
  );
  // 2. 全 closed → true
  check(
    "canResubmitAfterReturn: 全 closed → true",
    canResubmitAfterReturn([{ status: "closed" }, { status: "closed" }]) === true,
    `返回 ${canResubmitAfterReturn([{ status: "closed" }, { status: "closed" }])}`
  );
  // 3. 含 rectified（无 open）→ true
  check(
    "canResubmitAfterReturn: 含 rectified 无 open → true",
    canResubmitAfterReturn([{ status: "rectified" }, { status: "closed" }]) === true,
    `返回 ${canResubmitAfterReturn([{ status: "rectified" }, { status: "closed" }])}`
  );
  // 4. 含 open → false
  check(
    "canResubmitAfterReturn: 含 open → false",
    canResubmitAfterReturn([{ status: "open" }, { status: "closed" }]) === false,
    `返回 ${canResubmitAfterReturn([{ status: "open" }, { status: "closed" }])}`
  );
  // 5. 全 open → false
  check(
    "canResubmitAfterReturn: 全 open → false",
    canResubmitAfterReturn([{ status: "open" }]) === false,
    `返回 ${canResubmitAfterReturn([{ status: "open" }])}`
  );
  // 6. rectified + open 混合 → false（只要有 open 就不能重提）
  check(
    "canResubmitAfterReturn: rectified+open 混合 → false",
    canResubmitAfterReturn([{ status: "rectified" }, { status: "open" }]) === false,
    `返回 ${canResubmitAfterReturn([{ status: "rectified" }, { status: "open" }])}`
  );
}

// ── nextNodeStatusAfterReview ─────────────────────────────────
{
  check(
    "nextNodeStatusAfterReview: approve=true → passed",
    nextNodeStatusAfterReview(true) === "passed",
    `返回 ${nextNodeStatusAfterReview(true)}`
  );
  check(
    "nextNodeStatusAfterReview: approve=false → returned",
    nextNodeStatusAfterReview(false) === "returned",
    `返回 ${nextNodeStatusAfterReview(false)}`
  );
}

// ── assertNodeTransition：合法 4 + 非法 ≥4 ────────────────────
{
  const legal = [
    ["pending", "submitted"],
    ["returned", "submitted"],
    ["submitted", "passed"],
    ["submitted", "returned"],
  ];
  for (const [from, to] of legal) {
    let threw = false;
    try {
      assertNodeTransition(from, to);
    } catch {
      threw = true;
    }
    check(
      `assertNodeTransition 合法: ${from}→${to} 不抛`,
      !threw,
      threw ? "意外抛错" : "通过"
    );
  }

  const illegal = [
    ["pending", "passed"], // 跳过提交
    ["pending", "returned"], // 未提交先退回
    ["returned", "passed"], // 退回后跳过重提直接通过
    ["passed", "submitted"], // 已通过再提交
    ["passed", "returned"], // 已通过再退回
    ["submitted", "submitted"], // 重复提交
    ["pending", "pending"], // 自环
  ];
  for (const [from, to] of illegal) {
    let threw = false;
    try {
      assertNodeTransition(from, to);
    } catch {
      threw = true;
    }
    check(
      `assertNodeTransition 非法: ${from}→${to} 抛错`,
      threw,
      threw ? "抛错" : "未抛错（应抛）"
    );
  }
}

// ── 问题状态常量完整 ─────────────────────────────────────────
{
  check(
    "ISSUE_STATUS_ORDER: 3 态顺序完整",
    ISSUE_STATUS_ORDER.length === 3 &&
      ISSUE_STATUS_ORDER[0] === "open" &&
      ISSUE_STATUS_ORDER[1] === "rectified" &&
      ISSUE_STATUS_ORDER[2] === "closed",
    `顺序 ${ISSUE_STATUS_ORDER.join("|")}`
  );
  check(
    "ISSUE_STATUS_LABEL: 3 态标签齐全且非空",
    Object.keys(ISSUE_STATUS_LABEL).length === 3 &&
      Object.values(ISSUE_STATUS_LABEL).every(
        (v) => typeof v === "string" && v.length > 0
      ),
    `标签 ${JSON.stringify(ISSUE_STATUS_LABEL)}`
  );
}

// ── issueStatusTone 全覆盖 ────────────────────────────────────
{
  check("issueStatusTone: open → danger", issueStatusTone("open") === "danger");
  check("issueStatusTone: rectified → warning", issueStatusTone("rectified") === "warning");
  check("issueStatusTone: closed → neutral", issueStatusTone("closed") === "neutral");
  check("issueStatusTone: 未知 → neutral", issueStatusTone("xx") === "neutral");
}

// ── 问题谓词：canRectify / canClose / canReopen ────────────────
{
  check("canRectify: open → true", canRectify("open") === true);
  check("canRectify: rectified → false", canRectify("rectified") === false);
  check("canRectify: closed → false", canRectify("closed") === false);

  check("canClose: rectified → true", canClose("rectified") === true);
  check("canClose: open → false", canClose("open") === false);
  check("canClose: closed → false", canClose("closed") === false);

  check("canReopen: rectified → true", canReopen("rectified") === true);
  check("canReopen: open → false", canReopen("open") === false);
  check("canReopen: closed → false", canReopen("closed") === false);
}

// ── assertIssueTransition：合法 3 + 非法 ≥3 ──────────────────
{
  const legal = [
    ["open", "rectified"],
    ["rectified", "closed"],
    ["rectified", "open"],
  ];
  for (const [from, to] of legal) {
    let threw = false;
    try {
      assertIssueTransition(from, to);
    } catch {
      threw = true;
    }
    check(
      `assertIssueTransition 合法: ${from}→${to} 不抛`,
      !threw,
      threw ? "意外抛错" : "通过"
    );
  }

  const illegal = [
    ["open", "closed"], // 跳过整改直接关闭
    ["open", "open"], // 自环
    ["closed", "open"], // 已关闭再打开
    ["closed", "rectified"], // 已关闭再整改
    ["rectified", "rectified"], // 自环
  ];
  for (const [from, to] of illegal) {
    let threw = false;
    try {
      assertIssueTransition(from, to);
    } catch {
      threw = true;
    }
    check(
      `assertIssueTransition 非法: ${from}→${to} 抛错`,
      threw,
      threw ? "抛错" : "未抛错（应抛）"
    );
  }
}

// ── 严重度常量与 tone 全覆盖 ─────────────────────────────────
{
  check(
    "ISSUE_SEVERITY_ORDER: 3 级顺序完整",
    ISSUE_SEVERITY_ORDER.length === 3 &&
      ISSUE_SEVERITY_ORDER[0] === "minor" &&
      ISSUE_SEVERITY_ORDER[1] === "normal" &&
      ISSUE_SEVERITY_ORDER[2] === "major",
    `顺序 ${ISSUE_SEVERITY_ORDER.join("|")}`
  );
  check(
    "ISSUE_SEVERITY_LABEL: 3 级标签齐全且非空",
    Object.keys(ISSUE_SEVERITY_LABEL).length === 3 &&
      Object.values(ISSUE_SEVERITY_LABEL).every(
        (v) => typeof v === "string" && v.length > 0
      ),
    `标签 ${JSON.stringify(ISSUE_SEVERITY_LABEL)}`
  );
  check("issueSeverityTone: minor → neutral", issueSeverityTone("minor") === "neutral");
  check("issueSeverityTone: normal → warning", issueSeverityTone("normal") === "warning");
  check("issueSeverityTone: major → danger", issueSeverityTone("major") === "danger");
  check("issueSeverityTone: 未知 → neutral", issueSeverityTone("xx") === "neutral");
}

// ── buildTimeline（M7-d）──────────────────────────────────────
// 纯函数：合并节点 + 问题事件 → 时间轴。不碰 prisma，脚本直接 import 测。
// 限制注明（函数头注释）：复验退回不单独成条（Issue 无独立退回时间字段）。
const TL_EMOJI_RE =
  /[\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F000}-\u{1FAFF}\u{FE00}-\u{FE0F}]/u;
{
  // 1. 空数组 → []
  check(
    "buildTimeline: 空数组 → []",
    buildTimeline([], []).length === 0,
    `返回长度 ${buildTimeline([], []).length}`
  );

  // 2. 混合样例：4 节点（pending/submitted/passed/returned）+ 4 问题（open/rectified/closed/closed-无复验意见）
  const t0 = new Date("2026-01-01T08:00:00Z");
  const t1 = new Date("2026-01-02T08:00:00Z");
  const t2 = new Date("2026-01-03T08:00:00Z");
  const t3 = new Date("2026-01-04T08:00:00Z");

  const nodes = [
    { id: "n1", name: "拆除工程", status: "pending", createdAt: t0, submittedAt: null, reviewedAt: null, returnReason: null },
    { id: "n2", name: "水电工程", status: "submitted", createdAt: t0, submittedAt: t1, reviewedAt: null, returnReason: null },
    { id: "n3", name: "泥工工程", status: "passed", createdAt: t0, submittedAt: t1, reviewedAt: t2, returnReason: null },
    { id: "n4", name: "防水工程", status: "returned", createdAt: t0, submittedAt: t1, reviewedAt: t2, returnReason: "闭水试验不合格" },
  ];
  const issues = [
    { id: "i1", nodeId: "n4", title: "防水工程验收退回", createdAt: t1, rectifyNote: null, rectifiedAt: null, recheckNote: null, closedAt: null },
    { id: "i2", nodeId: "n4", title: "墙面空鼓", createdAt: t1, rectifyNote: "已重新铺贴", rectifiedAt: t2, recheckNote: null, closedAt: null },
    { id: "i3", nodeId: "n4", title: "阴阳角方正", createdAt: t1, rectifyNote: "已修整", rectifiedAt: t2, recheckNote: "复验通过", closedAt: t3 },
    { id: "i4", nodeId: null, title: "手工问题", createdAt: t1, rectifyNote: "已整改", rectifiedAt: t2, recheckNote: null, closedAt: t3 },
  ];

  const events = buildTimeline(nodes, issues);

  // 事件条数逐一核对：节点 1+2+3+3=9，问题 1+2+3+3=9，合计 18
  check(
    "buildTimeline: 混合样例事件条数 = 18",
    events.length === 18,
    `实际 ${events.length}`
  );

  // 3. 升序排序（date.getTime 非递减）
  {
    let ascending = true;
    for (let i = 1; i < events.length; i++) {
      if (events[i].date.getTime() < events[i - 1].date.getTime()) {
        ascending = false;
        break;
      }
    }
    check(
      "buildTimeline: 按 date 升序排列",
      ascending,
      ascending ? "升序" : "非升序"
    );
  }

  // 4. 同刻节点先于问题：t1 时刻同时有 node-submitted 与 issue-created
  {
    const t1Events = events.filter(
      (e) => e.date.getTime() === t1.getTime()
    );
    const nodeIdx = [];
    const issueIdx = [];
    t1Events.forEach((e, i) => {
      if (e.key.startsWith("node-")) nodeIdx.push(i);
      else if (e.key.startsWith("issue-")) issueIdx.push(i);
    });
    const nodeBeforeIssue =
      nodeIdx.length > 0 &&
      issueIdx.length > 0 &&
      Math.max(...nodeIdx) < Math.min(...issueIdx);
    check(
      "buildTimeline: 同刻节点事件排问题事件之前",
      nodeBeforeIssue,
      `t1 节点 idx ${JSON.stringify(nodeIdx)} 问题 idx ${JSON.stringify(issueIdx)}`
    );
  }

  // 5. 全 tone 映射逐一断言（neutral/accent/success/warning/danger 各出现）
  {
    const tones = new Set(events.map((e) => e.tone));
    check("buildTimeline: tone neutral 出现", tones.has("neutral"), `[${[...tones].join(",")}]`);
    check("buildTimeline: tone accent 出现", tones.has("accent"), `[${[...tones].join(",")}]`);
    check("buildTimeline: tone success 出现", tones.has("success"), `[${[...tones].join(",")}]`);
    check("buildTimeline: tone warning 出现", tones.has("warning"), `[${[...tones].join(",")}]`);
    check("buildTimeline: tone danger 出现", tones.has("danger"), `[${[...tones].join(",")}]`);
    check(
      "buildTimeline: tone 取值仅限 5 种",
      [...tones].every((t) =>
        ["neutral", "accent", "success", "warning", "danger"].includes(t)
      ),
      `[${[...tones].join(",")}]`
    );
  }

  // 6. 节点 created 事件
  {
    const ev = events.find((e) => e.key === "node-n1-created");
    check("buildTimeline: 节点 created label = 生成验收节点 · <name>", ev?.label === "生成验收节点 · 拆除工程", ev?.label);
    check("buildTimeline: 节点 created tone = neutral", ev?.tone === "neutral");
    check("buildTimeline: 节点 created href = /quality/nodes/<id>", ev?.href === "/quality/nodes/n1", ev?.href);
    check("buildTimeline: 节点 created 无 sub", ev?.sub === undefined, `sub=${JSON.stringify(ev?.sub)}`);
  }

  // 7. 节点 submitted 事件
  {
    const ev = events.find((e) => e.key === "node-n2-submitted");
    check("buildTimeline: 节点 submitted label = <name> · 提交验收", ev?.label === "水电工程 · 提交验收", ev?.label);
    check("buildTimeline: 节点 submitted tone = accent", ev?.tone === "accent");
    check("buildTimeline: 节点 submitted href = /quality/nodes/<id>", ev?.href === "/quality/nodes/n2", ev?.href);
  }

  // 8. 节点 reviewed (passed) 事件
  {
    const ev = events.find((e) => e.key === "node-n3-reviewed");
    check("buildTimeline: 节点 reviewed (passed) label = <name> · 验收通过", ev?.label === "泥工工程 · 验收通过", ev?.label);
    check("buildTimeline: 节点 reviewed (passed) tone = success", ev?.tone === "success");
    check("buildTimeline: 节点 reviewed (passed) 无 sub", ev?.sub === undefined, `sub=${JSON.stringify(ev?.sub)}`);
  }

  // 9. 节点 reviewed (returned) 事件 + sub=退回原因
  {
    const ev = events.find((e) => e.key === "node-n4-reviewed");
    check("buildTimeline: 节点 reviewed (returned) label = <name> · 验收退回", ev?.label === "防水工程 · 验收退回", ev?.label);
    check("buildTimeline: 节点 reviewed (returned) tone = danger", ev?.tone === "danger");
    check("buildTimeline: 节点 reviewed (returned) sub = 退回原因", ev?.sub === "闭水试验不合格", `sub=${JSON.stringify(ev?.sub)}`);
  }

  // 10. pending 节点只生成 created 一条事件（无 submitted/reviewed）
  {
    const n1Events = events.filter((e) => e.key.startsWith("node-n1-"));
    check(
      "buildTimeline: pending 节点仅 created 一条事件",
      n1Events.length === 1,
      `实际 ${n1Events.length}`
    );
  }

  // 11. 问题 created 事件
  {
    const ev = events.find((e) => e.key === "issue-i1-created");
    check("buildTimeline: 问题 created label = 质量问题 · <title>", ev?.label === "质量问题 · 防水工程验收退回", ev?.label);
    check("buildTimeline: 问题 created tone = danger", ev?.tone === "danger");
    check("buildTimeline: 节点关联问题 created href = /quality/nodes/<nodeId>", ev?.href === "/quality/nodes/n4", ev?.href);
  }

  // 12. 手工问题（nodeId=null）无 href
  {
    const ev = events.find((e) => e.key === "issue-i4-created");
    check(
      "buildTimeline: 手工问题（nodeId null）created 无 href",
      ev?.href === undefined,
      `href=${JSON.stringify(ev?.href)}`
    );
  }

  // 13. 问题 rectified 事件 + sub=rectifyNote
  {
    const ev = events.find((e) => e.key === "issue-i2-rectified");
    check("buildTimeline: rectified label = 整改完成 · <title>", ev?.label === "整改完成 · 墙面空鼓", ev?.label);
    check("buildTimeline: rectified tone = warning", ev?.tone === "warning");
    check("buildTimeline: rectified sub = rectifyNote", ev?.sub === "已重新铺贴", `sub=${JSON.stringify(ev?.sub)}`);
    check("buildTimeline: rectified href = 节点详情", ev?.href === "/quality/nodes/n4", ev?.href);
  }

  // 14. 问题 closed 事件 + sub=复验意见（有）
  {
    const ev = events.find((e) => e.key === "issue-i3-closed");
    check("buildTimeline: closed label = 问题关闭 · <title>", ev?.label === "问题关闭 · 阴阳角方正", ev?.label);
    check("buildTimeline: closed tone = success", ev?.tone === "success");
    check("buildTimeline: closed sub = 复验意见", ev?.sub === "复验通过", `sub=${JSON.stringify(ev?.sub)}`);
    check("buildTimeline: closed href = 节点详情", ev?.href === "/quality/nodes/n4", ev?.href);
  }

  // 15. 问题 closed 事件 + sub 省略（recheckNote=null）
  {
    const ev = events.find((e) => e.key === "issue-i4-closed");
    check(
      "buildTimeline: closed sub 省略（recheckNote 为 null）",
      ev?.sub === undefined,
      `sub=${JSON.stringify(ev?.sub)}`
    );
    check(
      "buildTimeline: 手工问题 closed 无 href",
      ev?.href === undefined,
      `href=${JSON.stringify(ev?.href)}`
    );
  }

  // 16. open 问题只生成 created 一条事件（无 rectified/closed）
  {
    const i1Events = events.filter((e) => e.key.startsWith("issue-i1-"));
    check(
      "buildTimeline: open 问题仅 created 一条事件",
      i1Events.length === 1,
      `实际 ${i1Events.length}`
    );
  }

  // 17. 每条事件 key 唯一（稳定性）
  {
    const keys = events.map((e) => e.key);
    const unique = new Set(keys);
    check(
      "buildTimeline: 每条事件 key 唯一",
      keys.length === unique.size,
      `${keys.length} 条 / ${unique.size} 唯一`
    );
  }

  // 18. label 文案无 emoji
  {
    const labelsJoined = events.map((e) => e.label).join("");
    const hasEmoji = TL_EMOJI_RE.test(labelsJoined);
    check(
      "buildTimeline: label 文案无 emoji",
      !hasEmoji,
      hasEmoji ? "检测到 emoji" : "纯文本"
    );
  }

  // 19. 同刻同类按 key 升序（确定性）：t1 的三个 node-submitted 应按 n2/n3/n4 排
  {
    const t1NodeSubmitted = events
      .filter((e) => e.date.getTime() === t1.getTime() && e.key.startsWith("node-") && e.key.endsWith("-submitted"))
      .map((e) => e.key);
    const sorted = [...t1NodeSubmitted].sort();
    check(
      "buildTimeline: 同刻同类按 key 字符串稳定排序",
      JSON.stringify(t1NodeSubmitted) === JSON.stringify(sorted),
      `${JSON.stringify(t1NodeSubmitted)}`
    );
  }
}

// ── 输出禁 emoji 自检（与 verify-design / verify-crm / verify-schedule 同一纪律）──
const EMOJI_RE =
  /[\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F000}-\u{1FAFF}\u{FE00}-\u{FE0F}]/u;

const out = [];
for (const r of results) {
  out.push(`  [${r.ok ? "PASS" : "FAIL"}] ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
}
const hasEmoji = EMOJI_RE.test(out.join("\n"));
check("输出契约：不含任何 emoji / 符号", !hasEmoji, hasEmoji ? "检测到符号字符" : "纯文本输出");

console.log("\n质量管控纯函数回归校验 —— renovation-platform\n");
for (const r of results) {
  console.log(`  [${r.ok ? "PASS" : "FAIL"}] ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
}
console.log(
  `\n  ${failed === 0 ? "全部通过" : `失败 ${failed} 项`} · 共 ${results.length} 项检查\n`
);
process.exit(failed === 0 ? 0 : 1);
