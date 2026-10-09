/**
 * 设计任务类型常量（M5-a）。纯常量、无 prisma。
 * 取值与 prisma/schema.prisma 的 DesignTask.type 注释对齐（string + 常量，可移植）。
 */

/** 类型有序序列：卡片/筛选展示次序。 */
export const DESIGN_TASK_TYPE_ORDER = [
  "scheme",
  "floorplan",
  "rendering",
  "construction_drawing",
  "measurement",
] as const;
export type DesignTaskType = (typeof DESIGN_TASK_TYPE_ORDER)[number];

export const DESIGN_TASK_TYPE_LABEL: Record<DesignTaskType, string> = {
  scheme: "方案",
  floorplan: "平面",
  rendering: "效果图",
  construction_drawing: "施工图",
  measurement: "量房",
};
