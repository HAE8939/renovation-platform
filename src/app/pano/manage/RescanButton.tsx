"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/core/ui";

/**
 * 重新扫描 = 让服务端组件再跑一遍磁盘对账。
 * 全景文件是人在服务器外侧放进来的，平台感知不到文件系统变化，
 * 所以显式给一个刷新入口，比让人猜“这页是不是缓存了”要好。
 */
export function RescanButton() {
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      onClick={() => router.refresh()}
      className="whitespace-nowrap"
    >
      重新扫描
    </Button>
  );
}
