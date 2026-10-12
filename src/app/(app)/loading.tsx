/** Hiện ngay khi chuyển mục, trong lúc dữ liệu trang đang tải (không phải dữ liệu thật). */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="animate-pulse space-y-4">
      <span className="sr-only">Đang tải…</span>
      <div className="h-7 w-56 rounded bg-line" />
      <div className="h-4 w-72 max-w-full rounded bg-line" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 rounded-lg bg-line" />)}
      </div>
      <div className="h-64 rounded-lg bg-line" />
    </div>
  );
}
