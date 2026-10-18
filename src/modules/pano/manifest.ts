import type { ModuleManifest } from "../types";

/**
 * 全景管理模块清单（M15-a 注册）。
 *
 * 这个模块**只展示、不编辑**：全景成品的制作留在本地 MT-Pano 编辑器（Marzipano 引擎 +
 * build_tour.py 的品牌化导出），平台负责把导出的静态导览目录按项目归集起来，
 * 给出一个可搜索、可点开浏览的归纳页。理由：编辑器是重资产（Python 切片 + Node 引擎 +
 * 原始 2:1 全景图几百 MB），塞进这个 2G 内存的内网容器里既跑不动也没必要。
 *
 * nav 两项都是静态可达路径（不依赖 id），不会渲染成死链——这正是 design 模块刻意不挂
 * nav 的原因，这里没有那个问题。
 */
export const panoManifest: ModuleManifest = {
  id: "pano",
  name: "全景管理",
  description: "已交付空间的 720° 全景导览：按项目归集、检索与浏览",
  icon: "◎", // 单字符非 emoji（V0.3：禁用彩色 icon 库 / emoji）
  order: 10, // 现有最高为 hr(9)；全景是交付之后的展示物，排在经营主线之后
  entryPath: "/pano",
  requiresAuth: false,
  nav: [
    { label: "项目归纳", href: "/pano" },
    { label: "登记管理", href: "/pano/manage" },
  ],
};
