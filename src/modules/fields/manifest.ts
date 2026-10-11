import type { ModuleManifest } from "../types";

/**
 * 自定义字段（M9-c）：EAV 平台原语的定义管理面。
 *
 * - order 9 排最后：现有最大为 finance 的 8；字段定义属平台配置，不抢业务模块的位置。
 * - 不给 nav：本模块只有一个定义管理页，无二级页。
 * - 读写服务落 `core/domain/customFieldRepo.ts`（值录入在项目中心、筛选在项目列表，
 *   三处共用；模块之间不互 import 内部，AGENTS §2/§3），本目录只留 manifest。
 */
export const fieldsManifest: ModuleManifest = {
  id: "fields",
  name: "自定义字段",
  description: "全司共享的自定义字段定义与校验（项目属性扩展，不改主脊表结构）",
  icon: "定", // 单字符汉字，非 emoji
  order: 9,
  entryPath: "/fields",
  requiresAuth: false,
};
