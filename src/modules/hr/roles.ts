export const PROJECT_MEMBER_ROLE = {
  project_manager: "project_manager",
  designer: "designer",
  inspector: "inspector",
  construction_lead: "construction_lead",
  coordinator: "coordinator",
} as const;

export type ProjectMemberRole = (typeof PROJECT_MEMBER_ROLE)[keyof typeof PROJECT_MEMBER_ROLE];

export const PROJECT_MEMBER_ROLE_LABEL: Record<ProjectMemberRole, string> = {
  project_manager: "项目经理",
  designer: "设计师",
  inspector: "工程巡检",
  construction_lead: "施工负责人",
  coordinator: "项目协调",
};

export function isProjectMemberRole(value: string): value is ProjectMemberRole {
  return Object.values(PROJECT_MEMBER_ROLE).includes(value as ProjectMemberRole);
}
