import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatVnd } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { SETTLEMENT_KIND_LABEL, SETTLEMENT_STATUS_LABEL } from "@/lib/settlements";
import { Empty, ErrorBox, PageHeader, Pager } from "@/components/ui";
import { listSettlements } from "./load";

export const metadata = { title: "Quyết toán" };
const PAGE = 25;
const TABS: [string, string][] = [["", "Tất cả"], ["provisional", "Tạm tính"], ["checked", "Đã kiểm tra"], ["approved", "Đã phê duyệt"], ["cancelled", "Đã hủy"]];

export default async function SettlementsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireModule("settlement");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const status = sp.trang_thai ?? "";
  const { rows, total, error } = await listSettlements(await createClient(), page, PAGE, status);
  const href = (p: number) => `/quyet-toan?${new URLSearchParams({ ...(status ? { trang_thai: status } : {}), page: String(p) })}`;
  return (
    <>
      <PageHeader title="Quyết toán" sub={`${total} quyết toán · tạm tính → kiểm tra → phê duyệt → thanh toán · tạm tính từ chi tiết đơn bán`} />
      <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {TABS.map(([k, l]) => <Link key={k} href={k ? `/quyet-toan?trang_thai=${k}` : "/quyet-toan"} className={`btn ${status === k ? "btn-primary" : "btn-ghost"} whitespace-nowrap`}>{l}</Link>)}
      </div>
      {error ? <ErrorBox message="Không tải được danh sách quyết toán. Thử tải lại trang." /> : rows.length === 0 ? <Empty title="Chưa có quyết toán nào." action={{ href: "/don-ban", label: "Mở danh sách đơn bán" }} /> : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-ink-soft"><th className="p-2">Mã</th><th className="p-2">Xe</th><th className="p-2">Loại</th><th className="p-2 text-right">Giá bán</th><th className="p-2">Trạng thái</th><th className="p-2">Tạo</th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-b border-line/60">
                  <td className="p-2"><Link href={`/quyet-toan/${s.id}`} className="font-semibold text-petrol hover:underline">{s.code}</Link>{s.version_no > 1 ? ` · bản ${s.version_no}` : ""}</td>
                  <td className="p-2">{[s.vehicle?.code, s.vehicle?.make, s.vehicle?.model, s.vehicle?.year_made].filter(Boolean).join(" ")}</td>
                  <td className="p-2">{SETTLEMENT_KIND_LABEL[s.kind]}</td>
                  <td className="num p-2 text-right">{formatVnd(s.sale_price)}</td>
                  <td className="p-2">{SETTLEMENT_STATUS_LABEL[s.status]}</td>
                  <td className="p-2">{formatDate(s.created_at)}</td>
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
