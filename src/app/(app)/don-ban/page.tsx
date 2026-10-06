import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatVnd } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { ORDER_STATUS_LABEL } from "@/lib/sales-orders";
import { Empty, ErrorBox, PageHeader, Pager } from "@/components/ui";
import { listOrders } from "./load";

export const metadata = { title: "Đơn bán" };
const PAGE = 25;
const TABS: [string, string][] = [["", "Tất cả"], ["draft", "Đang soạn"], ["confirmed", "Đã ký hợp đồng"], ["cancelled", "Đã hủy"]];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireModule("sales");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const status = sp.trang_thai ?? "";
  const supabase = await createClient();
  const { orders, total, error } = await listOrders(supabase, page, PAGE, status);
  const canSell = user.roles.some((r) => r === "admin" || r === "manager" || r === "sales");
  const href = (p: number) => `/don-ban?${new URLSearchParams({ ...(status ? { trang_thai: status } : {}), page: String(p) })}`;

  return (
    <>
      <PageHeader title="Đơn bán" sub={`${total} đơn · giá bán là giá ghi trên hợp đồng, chưa phải tiền đã thu`}>
        {canSell && <Link href="/don-ban/moi" className="btn btn-primary">+ Lập đơn bán</Link>}
      </PageHeader>
      <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {TABS.map(([k, l]) => <Link key={k} href={k ? `/don-ban?trang_thai=${k}` : "/don-ban"} className={`btn ${status === k ? "btn-primary" : "btn-ghost"} whitespace-nowrap`}>{l}</Link>)}
      </div>
      {error ? <ErrorBox message="Không tải được danh sách đơn bán. Thử tải lại trang." /> : orders.length === 0 ? (
        <Empty title="Chưa có đơn bán nào." action={canSell ? { href: "/don-ban/moi", label: "Lập đơn bán đầu tiên" } : undefined} />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-ink-soft"><th className="p-2">Mã</th><th className="p-2">Khách</th><th className="p-2">Xe</th><th className="p-2 text-right">Tổng giá bán</th><th className="p-2">Trạng thái</th><th className="p-2">Hợp đồng</th><th className="p-2">Tạo</th></tr></thead>
            <tbody>
              {orders.map((o) => {
                const active = o.lines.filter((l) => l.line_status === "active");
                return (
                  <tr key={o.id} className="border-b border-line/60">
                    <td className="p-2"><Link href={`/don-ban/${o.id}`} className="font-semibold text-petrol hover:underline">{o.code}</Link></td>
                    <td className="p-2">{o.customer?.full_name ?? "—"}</td>
                    <td className="p-2">{active.length} xe{active[0] ? ` · ${active[0].vehicle_label}` : ""}{active.length > 1 ? "…" : ""}</td>
                    <td className="num p-2 text-right">{o.total === null ? "—" : formatVnd(o.total.toString())}</td>
                    <td className="p-2">{ORDER_STATUS_LABEL[o.status]}{active.some((l) => l.needs_approval) && o.status === "draft" ? <span className="text-[#8a6100]"> · cần quản lý duyệt</span> : null}</td>
                    <td className="p-2">{o.contract_ref ?? "—"}</td>
                    <td className="p-2">{formatDate(o.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pager total={total} page={page} pageSize={PAGE} makeHref={href} />
    </>
  );
}
