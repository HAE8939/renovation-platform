/** 根级加载态（M8.5）：极简、静音，不引入动效（V0.3 L0）。 */
export default function Loading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <p className="text-[13px] text-secondary">加载中…</p>
    </div>
  );
}
