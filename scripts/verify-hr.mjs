/**
 * verify-hr.mjs —— 人员工控首期纯函数门禁（不连库）。
 * 锁住责任角色的稳定键、中文标签和非法值拒绝，避免页面与数据库口径漂移。
 */
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hr = await import(pathToFileURL(join(root, "src/modules/hr/roles.ts")).href);
const { PROJECT_MEMBER_ROLE, PROJECT_MEMBER_ROLE_LABEL, isProjectMemberRole } = hr;
const roles = Object.values(PROJECT_MEMBER_ROLE);
const checks = [
  ["角色键共 5 个", roles.length === 5],
  ["角色键唯一", new Set(roles).size === roles.length],
  ["每个角色都有中文标签", roles.every((r) => PROJECT_MEMBER_ROLE_LABEL[r].length > 0)],
  ["合法角色全部通过", roles.every((r) => isProjectMemberRole(r))],
  ["未知角色被拒绝", !isProjectMemberRole("owner") && !isProjectMemberRole("" )],
];
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "[PASS]" : "[FAIL]"} ${name}`);
  if (!ok) failed++;
}
console.log(`\n${failed === 0 ? "全部通过" : `失败 ${failed} 项`} · 共 ${checks.length} 项检查`);
process.exitCode = failed ? 1 : 0;
