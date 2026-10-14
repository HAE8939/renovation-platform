/** @type {import('next').NextConfig} */

/**
 * standalone 只在容器构建时启用（M13-c）。
 *
 * 为什么不一律开着：standalone 产物靠 symlink 组装 node_modules，Windows 下非特权进程
 * 不允许建符号链接 → `pnpm build` 在编译与页面生成全绿之后、最后一步 EPERM 失败。
 * 而 AGENTS.md §8 把「pnpm build 通过」写成质量门槛，本机是唯一的手工验收环境——
 * 门槛不可复现，等于门槛消失（本次体检就是靠 build 抓到别的问题的）。
 *
 * 容器（Linux）里由 Dockerfile 显式置 BUILD_STANDALONE=1，两条路各得其所。
 */
const nextConfig = {
  ...(process.env.BUILD_STANDALONE === "1" ? { output: "standalone" } : {}),
};

export default nextConfig;
