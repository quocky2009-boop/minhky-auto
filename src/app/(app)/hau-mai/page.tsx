import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
import { CASE_KIND_LABEL, CASE_STATUS_LABEL, dueState } from "@/lib/aftersales";
import { todayVn } from "@/lib/cashbook";
import { Empty, ErrorBox, PageHeader, Pager } from "@/components/ui";
import { listCases } from "./load";

export const metadata = { title: "Hậu mãi" };
const PAGE = 25;
const TABS: [string, string][] = [["open", "Đang xử lý"], ["overdue", "Quá hạn"], ["today", "Đến hạn hôm nay"], ["resolved", "Đã xử lý xong"], ["cancelled", "Đã hủy"], ["all", "Tất cả"]];
const DUE_STYLE: Record<string, string> = { overdue: "text-sig-red font-semibold", today: "text-[#8a6100] font-semibold", upcoming: "", none: "text-ink-soft" };

export default async function AftersalesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireModule("aftersales");
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as string) : "open";
  const mine = sp.cua_toi === "1";
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, total, error } = await listCases(await createClient(), { tab, mine, userId: user.id, today: todayVn() }, page, PAGE);
  const href = (p: number, t = tab, m = mine) => `/hau-mai?${new URLSearchParams({ tab: t, ...(m ? { cua_toi: "1" } : {}), page: String(p) })}`;
  return (
    <>
      <PageHeader title="Hậu mãi" sub={`${total} phiếu · phản ánh, bảo hành, nhắc chăm sóc · mở phiếu từ chi tiết đơn bán`}>
        <Link href={href(1, tab, !mine)} className={`btn ${mine ? "btn-primary" : "btn-ghost"}`}>Của tôi</Link>
      </PageHeader>
      <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {TABS.map(([k, l]) => <Link key={k} href={href(1, k)} className={`btn ${tab === k ? "btn-primary" : "btn-ghost"} whitespace-nowrap`}>{l}</Link>)}
      </div>
      {error ? <ErrorBox message="Không tải được danh sách phiếu hậu mãi. Thử tải lại trang." /> : rows.length === 0 ? <Empty title="Không có phiếu nào ở mục này." action={{ href: "/don-ban", label: "Mở danh sách đơn bán" }} /> : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-ink-soft"><th className="p-2">Phiếu</th><th className="p-2">Nội dung</th><th className="p-2">Xe</th><th className="p-2">Khách</th><th className="p-2">Phụ trách</th><th className="p-2">Việc tiếp theo</th><th className="p-2">Hạn</th></tr></thead>
            <tbody>
              {rows.map((c) => {
                const ds = dueState(c.status, c.next_due);
                return (
                  <tr key={c.id} className="border-b border-line/60">
                    <td className="p-2"><Link href={`/hau-mai/${c.id}`} className="font-semibold text-petrol hover:underline">{c.code}</Link><br /><span className="text-xs text-ink-soft">{CASE_KIND_LABEL[c.kind]} · {CASE_STATUS_LABEL[c.status]}</span></td>
                    <td className="p-2">{c.title}</td>
                    <td className="p-2">{[c.vehicle?.code, c.vehicle?.make, c.vehicle?.model, c.vehicle?.year_made].filter(Boolean).join(" ")}</td>
                    <td className="p-2">{c.customer?.full_name ?? "—"}</td>
                    <td className="p-2">{c.assignee?.full_name ?? "—"}</td>
                    <td className="p-2">{c.next_action ?? "—"}</td>
                    <td className={`p-2 ${DUE_STYLE[ds]}`}>{c.next_due ? formatDate(c.next_due) : "—"}{ds === "overdue" ? " · quá hạn" : ds === "today" ? " · hôm nay" : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pager total={total} page={page} pageSize={PAGE} makeHref={(p) => href(p)} />
    </>
  );
}
