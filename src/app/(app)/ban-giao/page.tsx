import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
import { HANDOVER_STATUS_LABEL } from "@/lib/handover";
import { Empty, ErrorBox, PageHeader, Pager } from "@/components/ui";
import { listHandovers } from "./load";

export const metadata = { title: "Bàn giao & hồ sơ" };
const PAGE = 25;
const TABS: [string, string][] = [["", "Tất cả"], ["preparing", "Đang chuẩn bị"], ["delivered", "Đã giao"], ["cancelled", "Đã hủy"]];

export default async function HandoversPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireModule("docs");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const status = sp.trang_thai ?? "";
  const supabase = await createClient();
  const { rows, total, error } = await listHandovers(supabase, page, PAGE, status);
  const href = (p: number) => `/ban-giao?${new URLSearchParams({ ...(status ? { trang_thai: status } : {}), page: String(p) })}`;
  return (
    <>
      <PageHeader title="Bàn giao & hồ sơ" sub={`${total} bàn giao · mỗi xe trong đơn bán đã ký có một bàn giao riêng; lập từ chi tiết đơn bán`} />
      <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {TABS.map(([k, l]) => <Link key={k} href={k ? `/ban-giao?trang_thai=${k}` : "/ban-giao"} className={`btn ${status === k ? "btn-primary" : "btn-ghost"} whitespace-nowrap`}>{l}</Link>)}
      </div>
      {error ? <ErrorBox message="Không tải được danh sách bàn giao. Thử tải lại trang." /> : rows.length === 0 ? <Empty title="Chưa có bàn giao nào." action={{ href: "/don-ban", label: "Mở danh sách đơn bán" }} /> : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-ink-soft"><th className="p-2">Mã</th><th className="p-2">Xe</th><th className="p-2">Khách</th><th className="p-2">Đơn bán</th><th className="p-2">Hẹn giao</th><th className="p-2">Trạng thái</th></tr></thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.id} className="border-b border-line/60">
                  <td className="p-2"><Link href={`/ban-giao/${h.id}`} className="font-semibold text-petrol hover:underline">{h.code}</Link></td>
                  <td className="p-2">{[h.vehicle?.code, h.vehicle?.make, h.vehicle?.model, h.vehicle?.year_made].filter(Boolean).join(" ")}</td>
                  <td className="p-2">{h.customer?.full_name ?? "—"}</td>
                  <td className="p-2">{h.order ? <Link href={`/don-ban/${h.order_id}`} className="text-petrol hover:underline">{h.order.code}</Link> : "—"}</td>
                  <td className="p-2">{h.planned_on ? formatDate(h.planned_on) : "—"}</td>
                  <td className="p-2">{HANDOVER_STATUS_LABEL[h.status]}{h.status === "delivered" && h.delivered_on ? ` · ${formatDate(h.delivered_on)}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager total={total} page={page} pageSize={PAGE} makeHref={href} />
    </>
  );
}
