import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { canSeeFinance, isManager } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { formatVnd, toVnd } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { ENTRY_STATUS_LABEL } from "@/lib/commissions";
import { Empty, ErrorBox, PageHeader, Pager } from "@/components/ui";
import { listEntries } from "./load";

export const metadata = { title: "Hoa hồng" };
const PAGE = 25;
const TABS: [string, string][] = [["", "Tất cả"], ["accrued", "Chờ duyệt"], ["no_rule", "Chưa có quy tắc"], ["approved", "Đã duyệt"], ["cancelled", "Đã hủy"]];

export default async function CommissionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireModule("commission");
  const sp = await searchParams;
  const tab = sp.trang_thai ?? "";
  const page = Math.max(1, Number(sp.page) || 1);
  const all = canSeeFinance(user.roles);
  const { rows, total, error } = await listEntries(await createClient(), tab, page, PAGE);
  const href = (p: number, t = tab) => `/hoa-hong?${new URLSearchParams({ ...(t ? { trang_thai: t } : {}), page: String(p) })}`;
  return (
    <>
      <PageHeader title="Hoa hồng" sub={all ? `${total} khoản · tính theo từng đầu xe khi đơn bán được ký: xe mới theo hãng/model, xe cũ theo số VIN` : `${total} khoản của tôi`}>
        {(isManager(user.roles) || all) && <Link href="/hoa-hong/quy-tac" className="btn btn-ghost">Quy tắc hoa hồng</Link>}
      </PageHeader>
      <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {TABS.map(([k, l]) => <Link key={k} href={href(1, k)} className={`btn ${tab === k ? "btn-primary" : "btn-ghost"} whitespace-nowrap`}>{l}</Link>)}
      </div>
      {error ? <ErrorBox message="Không tải được danh sách hoa hồng. Thử tải lại trang." /> : rows.length === 0 ? <Empty title="Chưa có khoản hoa hồng nào." /> : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-ink-soft"><th className="p-2">Mã</th><th className="p-2">Ngày ký</th><th className="p-2">Xe</th>{all && <th className="p-2">Nhân viên</th>}<th className="p-2 text-right">Số tiền</th><th className="p-2 text-right">Đã chi</th><th className="p-2">Trạng thái</th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-b border-line/60">
                  <td className="p-2"><Link href={`/hoa-hong/${e.id}`} className="font-semibold text-petrol hover:underline">{e.code}</Link></td>
                  <td className="p-2">{formatDate(e.sold_on)}</td>
                  <td className="p-2">{[e.vehicle?.code, e.vehicle?.make, e.vehicle?.model, e.vehicle?.year_made].filter(Boolean).join(" ")}<span className="text-xs text-ink-soft"> · {e.vehicle?.condition === "new" ? "xe mới" : "xe cũ"}</span></td>
                  {all && <td className="p-2">{e.employee?.full_name ?? "—"}</td>}
                  <td className="num p-2 text-right">{toVnd(e.amount) === null ? <span className="text-ink-soft">Chưa có quy tắc</span> : formatVnd(e.amount)}</td>
                  <td className="num p-2 text-right">{e.status === "approved" ? formatVnd(e.paid) : "—"}</td>
                  <td className="p-2">{ENTRY_STATUS_LABEL[e.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager total={total} page={page} pageSize={PAGE} makeHref={(p) => href(p)} />
    </>
  );
}
