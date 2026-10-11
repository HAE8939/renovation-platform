"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/core/ui";

/** 根级错误边界（M8.5）：给恢复路径（重试）与可诊断编号（digest）。 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

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
