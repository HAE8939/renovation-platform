/**
 * 质量档案时间轴纯函数（M7-d，TASK_M7 §4-M7-d）。
 * 不依赖 prisma，客户端可安全 import；服务与 UI 共用同一份组装逻辑。
 *
 * 与 status.ts 的分工：status.ts 管状态机 / 标签 / 色 tone；本文件只管档案事件
 * 组装（label / sub / tone / href），不改计数口径，不重定义 tone 语义。
 *
 * 限制注明（TASK_M7 §0 / §4-M7-d）：
 *  复验退回（recheck fail，rectified → open）不单独成条 —— Issue 无独立的
 *  退回时间字段（recheckNote 只记最近一次意见，无 recheckedAt）。时间轴以问题
 *  当前状态 + recheckNote 呈现复验退回意见，不在退回那一刻单独建事件。
 */

/** 时间轴事件（label / sub / href / tone 均由本函数生成）。 */
export interface TimelineEvent {
  key: string;
  date: Date;
  label: string;
  sub?: string;
  tone: "neutral" | "accent" | "success" | "warning" | "danger";
  href?: string;
}

/** 节点投影（调用方传 DB 行子集；只取时间轴所需字段）。 */
export interface TimelineNode {
  id: string;
  name: string;
  status: string;
  createdAt: Date;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  returnReason: string | null;
}

/** 问题投影（调用方传 DB 行子集；只取时间轴所需字段）。 */
export interface TimelineIssue {
  id: string;
  nodeId: string | null;
  title: string;
  createdAt: Date;
  rectifyNote: string | null;
  rectifiedAt: Date | null;
  recheckNote: string | null;
  closedAt: Date | null;
}

/** 节点详情页路由（taskId 逻辑引用不反查；统一按 nodeId 链）。 */
function nodeHref(id: string): string {
  return `/quality/nodes/${id}`;
}

/**
 * 组装时间轴事件（TASK_M7 §4-M7-d）：
 *  - 节点 createdAt → `生成验收节点 · ${name}`（neutral，href=节点详情）
 *  - 节点 submittedAt 非空 → `${name} · 提交验收`（accent，href 同上）
 *  - 节点 reviewedAt 非空：
 *      status=passed   → `${name} · 验收通过`（success）
 *      status=returned → `${name} · 验收退回` + sub=returnReason（danger）
 *      其余状态不生成（防御性，reviewedAt 仅在 passed/returned 落库）
 *  - 问题 createdAt → `质量问题 · ${title}`（danger；nodeId 非空时 href=节点详情）
 *  - 问题 rectifiedAt 非空 → `整改完成 · ${title}` + sub=rectifyNote（warning，同 href）
 *  - 问题 closedAt 非空 → `问题关闭 · ${title}` + sub=recheckNote（无则省略）（success，同 href）
 *
 * 排序：date 升序；**同刻（getTime 相等）节点事件排问题事件之前**；
 * 再同以 key 字符串升序排（保证确定性）。
 */
export function buildTimeline(
  nodes: TimelineNode[],
  issues: TimelineIssue[]
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const n of nodes) {
    const href = nodeHref(n.id);
    events.push({
      key: `node-${n.id}-created`,
      date: n.createdAt,
      label: `生成验收节点 · ${n.name}`,
      tone: "neutral",
      href,
    });

    if (n.submittedAt) {
      events.push({
        key: `node-${n.id}-submitted`,
        date: n.submittedAt,
        label: `${n.name} · 提交验收`,
        tone: "accent",
        href,
      });
    }

    if (n.reviewedAt) {
      if (n.status === "passed") {
        events.push({
          key: `node-${n.id}-reviewed`,
          date: n.reviewedAt,
          label: `${n.name} · 验收通过`,
          tone: "success",
          href,
        });
      } else if (n.status === "returned") {
        events.push({
          key: `node-${n.id}-reviewed`,
          date: n.reviewedAt,
          label: `${n.name} · 验收退回`,
          tone: "danger",
          sub: n.returnReason || undefined,
          href,
        });
      }
      // 其余状态（pending/submitted）理论不与 reviewedAt 同现，防御性不生成。
    }
  }

  for (const i of issues) {
    const href = i.nodeId ? nodeHref(i.nodeId) : undefined;

    events.push({
      key: `issue-${i.id}-created`,
      date: i.createdAt,
      label: `质量问题 · ${i.title}`,
      tone: "danger",
      href,
    });

    if (i.rectifiedAt) {
      events.push({
        key: `issue-${i.id}-rectified`,
        date: i.rectifiedAt,
        label: `整改完成 · ${i.title}`,
        tone: "warning",
        sub: i.rectifyNote || undefined,
        href,
      });
    }

    if (i.closedAt) {
      events.push({
        key: `issue-${i.id}-closed`,
        date: i.closedAt,
        label: `问题关闭 · ${i.title}`,
        tone: "success",
        sub: i.recheckNote || undefined,
        href,
      });
    }
  }

  events.sort((a, b) => {
    const ta = a.date.getTime();
    const tb = b.date.getTime();
    if (ta !== tb) return ta - tb;
    // 同刻：节点事件（key 以 "node-" 开头）排问题事件之前
    const aIsNode = a.key.startsWith("node-");
    const bIsNode = b.key.startsWith("node-");
    if (aIsNode !== bIsNode) return aIsNode ? -1 : 1;
    // 同类：按 key 字符串升序（稳定）
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });

  return events;
}
