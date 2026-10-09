/**
 * 兼容层（M3-a 上收后保留）。
 * 核心域项目服务已迁移至 src/core/domain/projects.ts（AGENTS §4：Project 是跨模块主数据）。
 * 此处仅做再导出，避免破坏尚未改写的旧引用；新代码请直接从 "@/core/domain/projects" 导入。
 */
export {
  suggestProjectCode,
  listProjects,
  getProjectDetail,
  createProject,
  updateProject,
  ValidationError,
  type ProjectListItem,
  type ProjectDetail,
  type CreateProjectInput,
  type CreateProjectResult,
  type UpdateProjectInput,
  type QuoteItemRow,
} from "@/core/domain/projects";
