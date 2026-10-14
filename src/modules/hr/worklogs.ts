export const WORKLOG_CATEGORY = {
  visit: "visit",
  design: "design",
  site: "site",
  meeting: "meeting",
  followup: "followup",
  other: "other",
} as const;

export const WORKLOG_CATEGORY_LABEL: Record<string, string> = {
  visit: "客户到访",
  design: "设计工作",
  site: "现场工作",
  meeting: "内部会议",
  followup: "跟进沟通",
  other: "其他",
};

export function isWorkLogCategory(value: string): value is keyof typeof WORKLOG_CATEGORY {
  return Object.prototype.hasOwnProperty.call(WORKLOG_CATEGORY, value);
}
