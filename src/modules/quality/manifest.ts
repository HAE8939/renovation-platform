import type { ModuleManifest } from "../types";

/** 质量管控模块清单（M7-a 注册）。 */
export const qualityManifest: ModuleManifest = {
  id: "quality",
  name: "质量管控",
  description: "验收节点、SOP 检查项、质量问题台账与整改闭环",
  icon: "质", // 单字符非 emoji（V0.3：禁用彩色 icon 库 / emoji）
  order: 6, // 排在 schedule(5) 之后（生命周期：…设计→报价→排程→质量…）
  entryPath: "/quality",
  requiresAuth: false,
  // 二级导航指向两条占位页（本单元同时建好防死链）。
  // 节点详情 / 项目级入口不放 nav（拿不到 id 会成死链）。
  nav: [
    { label: "问题台账", href: "/quality/issues" },
    { label: "质量档案", href: "/quality/archive" },
  ],
};
