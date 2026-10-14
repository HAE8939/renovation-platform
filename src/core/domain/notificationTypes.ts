/**
 * notificationTypes.ts —— 顶栏通知的**数据形状**（M13 体检收口）
 *
 * 为什么从 dashboard 模块提到 core：`core/ui/NotificationBell.tsx` 为了拿这三个接口，
 * 反向 import 了 `@/modules/dashboard/server/notifications` —— core 是全平台共享层，
 * 不该依赖任何单一模块（§2）。当时只是 type-only import，运行时零耦合，所以没出事；
 * 但方向错了就是错了：哪天有人在组件里顺手 import 了那个模块的运行时函数，
 * core 就会拖进整个 dashboard 的取数依赖，而那正是 §2 要防的"各存一套"的前置形态。
 *
 * 这里只放形状，不放取数——取数仍在 modules/dashboard/server/notifications.ts。
 */

export interface NotificationRow {
  /** 展示文案（中文，含主体名） */
  label: string;
  /** 点进去的页（项目级深链用 id，见 AGENTS §4.1） */
  href: string;
}

export interface NotificationGroup {
  id:
    | "node-review"
    | "issue-open"
    | "schedule-overdue"
    | "change-watch"
    | "lead-followup";
  title: string;
  count: number;
  rows: NotificationRow[];
  /** 该组的"全部"入口（例如问题台账页） */
  allHref: string;
}

export interface NotificationSummary {
  /** 未读总数（各组计数之和，用于铃铛角标） */
  total: number;
  groups: NotificationGroup[];
  /** 生成时刻，界面显示"更新于 …"用 */
  at: string;
}
