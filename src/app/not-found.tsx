import Link from "next/link";

/** 根级 404（M8.5）：V0.3 纸感卡片、无阴影；accent 只落在链接上。 */
export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-card border border-line bg-surface px-8 py-12 text-center">
        <p className="num text-[13px] text-muted">404</p>
        <h1 className="mt-2 text-[17px] font-semibold text-primary">页面不存在</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-secondary">
          你访问的页面可能已被移动或删除。
        </p>
        <div className="mt-6">
          <Link href="/" className="text-[13px] font-medium text-accent-ink hover:underline">
            返回平台首页
          </Link>
        </div>
      </div>
    </div>
  );
}
