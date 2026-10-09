"use client";

import { Button } from "@/core/ui";

/**
 * 触发浏览器打印。复用 core/ui 的 Button，不写裸 <button>。
 * 外层 .no-print 在打印时被 print.css 隐藏。
 */
export function PrintButton() {
  return (
    <div className="no-print mb-6">
      <Button onClick={() => window.print()}>打印</Button>
    </div>
  );
}
