/**
 * docsToc.ts —— 文档站目录的单一真源。
 * 侧栏导航与外壳判定共用这一张表；新增一节 = 加一行 + 建同名 page.tsx。
 * 与模块 registry 一样，导航条目不写死在组件里。
 */
export interface DocEntry {
  /** 路由段："" = /docs 本身，其余为 /docs/<href> */
  href: string;
  /** 两位序号，按展示顺序 */
  num: string;
  label: string;
  /** 一句话说明，用于侧栏 title 悬浮与将来搜索 */
  desc: string;
}

export const DOCS_TOC: DocEntry[] = [
  { href: "", num: "01", label: "平台总览", desc: "一句话定位、主脊链路与六条核心设计取向" },
  { href: "quickstart", num: "02", label: "快速上手", desc: "按一单生意的时间顺序走完全流程的十步教程" },
  { href: "manual", num: "03", label: "模块操作手册", desc: "九个功能区与平台设置的逐个操作对照与边界" },
  { href: "background", num: "04", label: "建设背景", desc: "要解决的五处管理损耗与从表格到系统的由来" },
  { href: "architecture", num: "05", label: "整体架构", desc: "分层、技术选型、数据模型、视觉与质量工程" },
  { href: "modules", num: "06", label: "功能模块", desc: "九个功能区各自解决什么、完成到哪一步" },
  { href: "flow", num: "07", label: "业务闭环", desc: "主脊链路、数据流转矩阵与一条数据的旅程" },
  { href: "capabilities", num: "08", label: "横向能力", desc: "口径一致、跨模块联动、可逆归档等系统性格" },
  { href: "roles", num: "09", label: "角色价值", desc: "每个岗位进场后能从系统拿到什么" },
  { href: "roadmap", num: "10", label: "发展路线", desc: "进行中、近期、中期与明确排在后面的" },
  { href: "notes", num: "11", label: "事实与边界", desc: "平台事实数据与被问到应直接照答的已知边界" },
];

/** 判定一个路径是否属于文档站（外壳据此切换侧栏与容器）。 */
export function isDocsPath(pathname: string): boolean {
  return pathname === "/docs" || pathname.startsWith("/docs/");
}
