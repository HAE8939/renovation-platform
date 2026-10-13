"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/core/ui";

/**
 * 根级错误边界（M8.5）：给恢复路径（重试）与可诊断编号（digest）。
 *
 * M10-a 备料一补的一刀：生产构建把 RSC 渲染错误详情只留在服务端 stdout，页面上只剩一个编号——
 * 员工报「页面打不开，编号 xxx」时我们无从对照。这里把 digest + 出错路径 POST 回
 * /api/client-errors，让它与服务端错误落进同一份 logs/app-errors.jsonl，编号即可查。
 * 上报失败静默（错误边界里再抛错会把页面彻底搞死）。
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname() ?? "/";

  useEffect(() => {
    console.error(error);
    try {
      void fetch("/api/client-errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          digest: error.digest,
          message: error.message,
          path: pathname,
          stack: error.stack?.slice(0, 2000),
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* 上报本身出错不影响兜底页 */
    }
  }, [error, pathname]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-card border border-line bg-surface px-8 py-12 text-center">
        <h1 className="text-[17px] font-semibold text-primary">页面出错了</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-secondary">
          加载过程中出现异常，可尝试重试。
        </p>
        {error.digest && (
          <p className="num mt-2 text-[12px] text-muted">错误编号 {error.digest}</p>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button onClick={reset}>重试</Button>
          <Link href="/" className="text-[13px] font-medium text-accent-ink hover:underline">
            返回平台首页
          </Link>
        </div>
      </div>
    </div>
  );
}
