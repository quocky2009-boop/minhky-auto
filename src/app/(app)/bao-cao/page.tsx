import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatVnd } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { BUSINESS_LABEL, money, parsePeriod, totalsWarnings } from "@/lib/reports";
import { SETTLEMENT_STATUS_LABEL } from "@/lib/settlements";
import { Empty, ErrorBox, PageHeader, Pager } from "@/components/ui";
import { listInventory, listResults, loadTotals } from "./load";

export const metadata = { title: "Báo cáo" };
const PAGE = 25;

function Line({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-2 last:border-0">
      <div><p className={strong ? "font-semibold" : ""}>{label}</p>{hint && <p className="text-xs text-ink-soft">{hint}</p>}</div>
      <p className={`num whitespace-nowrap ${strong ? "text-lg font-bold" : ""}`}>{value}</p>
    </div>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireModule("reports");
  const sp = await searchParams;
  const tab = sp.muc === "ton-kho" ? "ton-kho" : "ket-qua";
  const page = Math.max(1, Number(sp.page) || 1);
  const period = parsePeriod(sp.tu, sp.den);
  const supabase = await createClient();
  const q = (extra: Record<string, string>) => `/bao-cao?${new URLSearchParams({ muc: tab, tu: period.from, den: period.to, ...extra })}`;

  return (
    <>
      <PageHeader title="Báo cáo" sub="Số liệu truy ngược về đơn bán, quyết toán và phiếu thu/chi · tạm tính theo sổ của phần mềm, không thay kế toán hay hóa đơn" />
      <div className="mb-3 flex gap-1.5">
        <Link href={`/bao-cao?muc=ket-qua&tu=${period.from}&den=${period.to}`} className={`btn ${tab === "ket-qua" ? "btn-primary" : "btn-ghost"}`}>Kết quả xe đã bán</Link>
        <Link href="/bao-cao?muc=ton-kho" className={`btn ${tab === "ton-kho" ? "btn-primary" : "btn-ghost"}`}>Tồn kho và vốn</Link>
      </div>
      {tab === "ket-qua" ? <Results supabase={supabase} period={period} adjusted={period.adjusted} page={page} href={(p) => q({ page: String(p) })} /> : <Inventory supabase={supabase} page={page} href={(p) => `/bao-cao?muc=ton-kho&page=${p}`} />}
    </>
  );
}

async function Results({ supabase, period, adjusted, page, href }: { supabase: Awaited<ReturnType<typeof createClient>>; period: { from: string; to: string }; adjusted: boolean; page: number; href: (p: number) => string }) {
  const [totals, list] = await Promise.all([loadTotals(supabase, period), listResults(supabase, period, page, PAGE)]);
  const warns = totals ? totalsWarnings(totals) : [];
  return (
    <>
      <form className="panel mb-4 flex flex-wrap items-end gap-3 p-3" action="/bao-cao">
        <input type="hidden" name="muc" value="ket-qua" />
        <label><span className="label">Từ ngày ký hợp đồng</span><input type="date" name="tu" defaultValue={period.from} className="field" /></label>
        <label><span className="label">Đến ngày</span><input type="date" name="den" defaultValue={period.to} className="field" /></label>
        <button className="btn btn-primary">Xem</button>
        <a className="btn btn-ghost" href={`/bao-cao/xuat?loai=ket-qua&tu=${period.from}&den=${period.to}`}>Xuất CSV</a>
      </form>
      {adjusted && <div className="mb-3"><ErrorBox message="Khoảng ngày không hợp lệ nên đang hiển thị tháng hiện tại." /></div>}
      {!totals ? <ErrorBox message="Không tải được tổng hợp kết quả. Thử tải lại trang." /> : (
        <>
          <section className="panel mb-4 p-4">
            <h2 className="mb-1 font-semibold">Kết quả kỳ {formatDate(period.from)} – {formatDate(period.to)}</h2>
            <p className="mb-2 text-xs text-ink-soft">{totals.lines} dòng xe bán ({totals.owned_lines} sở hữu, {totals.consignment_lines} ký gửi). Các chỉ tiêu dưới đây là khác nhau, không cộng chồng.</p>
            <Line label="Lãi gộp xe sở hữu" hint="Giá bán − giá mua; chỉ xe đã có giá mua" value={money(totals.gross_profit)} />
            <Line label="Kết quả sau chi phí trực tiếp" hint="Lãi gộp − chi phí đã xác nhận do showroom chịu" value={money(totals.result_after_costs)} />
            <Line label="Lợi nhuận phân chia (P)" hint="Theo quyết toán đã duyệt; chia nội bộ giữa công ty và bên góp vốn, không phải doanh thu mới" value={money(totals.distributable)} />
            <Line label="Trong đó phần công ty vận hành (C)" hint="Phần showroom hưởng cho vận hành theo điều khoản từng xe" value={money(totals.company_operating)} />
            <Line label="Phí ký gửi showroom hưởng" hint="Theo quyết toán xe ký gửi đã duyệt; giá bán là tiền thu hộ chủ xe" value={money(totals.consignment_fee)} />
            <Line label="Chi phí chung / chi khác (phiếu chi)" hint="Chi phí chung thực tế của showroom, không phân bổ vào từng xe" value={money(BigInt(totals.general_expense) + BigInt(totals.other_expense))} />
            <Line label="Chi phí sau bán (hậu mãi, chi phí chung)" hint="Chi phí bảo hành/hậu mãi đã xác nhận trong kỳ; không trừ vào kết quả từng xe" value={money(totals.aftersales_cost)} />
            <Line label="Hoa hồng nhân viên đã duyệt" hint="Theo ngày ký hợp đồng của xe trong kỳ; không trừ trước khi chia lợi nhuận góp vốn" value={money(totals.commission_approved)} />
            <Line label="Thu khác (phiếu thu)" value={money(totals.other_income)} />
            <Line strong label="Kết quả toàn showroom (tạm tính)" hint="Sau chi phí trực tiếp + phí ký gửi − chi phí chung/chi khác − chi phí sau bán − hoa hồng đã duyệt + thu khác. Chưa tính lãi vay, thuế" value={money(totals.showroom_result)} />
          </section>
          {warns.length > 0 && <ul className="mb-4 list-disc space-y-1 rounded border border-[#e8d9a8] bg-[#fdf7e6] p-3 pl-7 text-sm text-[#8a6100]">{warns.map((w) => <li key={w}>{w}</li>)}</ul>}
        </>
      )}
      {list.error ? <ErrorBox message="Không tải được danh sách xe đã bán." /> : list.rows.length === 0 ? <Empty title="Không có xe bán trong kỳ này." /> : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-ink-soft">
              <th className="p-2">Ngày ký</th><th className="p-2">Đơn</th><th className="p-2">Xe</th><th className="p-2">Loại</th><th className="p-2 text-right">Giá bán</th>
              <th className="p-2 text-right">Giá mua</th><th className="p-2 text-right">Lãi gộp</th><th className="p-2 text-right">Sau chi phí</th><th className="p-2">Quyết toán</th>
              <th className="p-2 text-right">Phân chia (P)</th><th className="p-2 text-right">Công ty (C)</th><th className="p-2 text-right">Phí ký gửi</th>
            </tr></thead>
            <tbody>
              {list.rows.map((r) => (
                <tr key={r.line_id} className="border-b border-line/60">
                  <td className="p-2">{formatDate(r.sold_on)}</td>
                  <td className="p-2"><Link href={`/don-ban/${r.order_id}`} className="text-petrol hover:underline">{r.order_code}</Link></td>
                  <td className="p-2"><Link href={`/kho-xe/${r.vehicle_id}`} className="text-petrol hover:underline">{r.vehicle_code}</Link> {r.vehicle_label}</td>
                  <td className="p-2">{BUSINESS_LABEL[r.business_type]}</td>
                  <td className="num p-2 text-right">{formatVnd(r.sale_price)}</td>
                  <td className="num p-2 text-right">{r.business_type === "owned" ? money(r.purchase_price) : "—"}</td>
                  <td className="num p-2 text-right">{r.business_type === "owned" ? money(r.gross_profit) : "—"}</td>
                  <td className="num p-2 text-right">{r.business_type === "owned" ? money(r.result_after_costs) : "—"}</td>
                  <td className="p-2">{r.settlement_id ? <Link href={`/quyet-toan/${r.settlement_id}`} className="text-petrol hover:underline">{r.settlement_code}</Link> : <span className="text-ink-soft">Chưa quyết toán</span>}{r.settlement_status ? ` · ${SETTLEMENT_STATUS_LABEL[r.settlement_status] ?? r.settlement_status}` : ""}</td>
                  <td className="num p-2 text-right">{money(r.distributable)}</td>
                  <td className="num p-2 text-right">{money(r.company_operating)}</td>
                  <td className="num p-2 text-right">{money(r.fee_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager total={list.total} page={page} pageSize={PAGE} makeHref={href} />
    </>
  );
}

async function Inventory({ supabase, page, href }: { supabase: Awaited<ReturnType<typeof createClient>>; page: number; href: (p: number) => string }) {
  const list = await listInventory(supabase, page, PAGE);
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">Xe đã nhập kho, chưa bán xong · sắp theo tuổi tồn giảm dần · xe ký gửi không tính vào vốn hàng tồn sở hữu</p>
        <a className="btn btn-ghost" href="/bao-cao/xuat?loai=ton-kho">Xuất CSV</a>
      </div>
      {list.error ? <ErrorBox message="Không tải được tồn kho." /> : list.rows.length === 0 ? <Empty title="Chưa có xe nào trong kho (đã nhập kho, chưa bán)." /> : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-ink-soft">
              <th className="p-2">Xe</th><th className="p-2">Loại</th><th className="p-2 text-right">Tuổi tồn</th><th className="p-2 text-right">Giá mua</th>
              <th className="p-2 text-right">Chi phí xác nhận</th><th className="p-2 text-right">Vốn tồn</th><th className="p-2 text-right">Vốn góp ngoài</th><th className="p-2 text-right">Dư nợ vay</th>
            </tr></thead>
            <tbody>
              {list.rows.map((r) => (
                <tr key={r.vehicle_id} className="border-b border-line/60">
                  <td className="p-2"><Link href={`/kho-xe/${r.vehicle_id}`} className="text-petrol hover:underline">{r.code}</Link> {r.label}{r.open_cost_lines > 0 ? <span className="ml-1 text-xs text-[#8a6100]">· {r.open_cost_lines} chi phí chưa xác nhận</span> : null}</td>
                  <td className="p-2">{BUSINESS_LABEL[r.business_type]}</td>
                  <td className="num p-2 text-right">{r.age_days ?? "—"} ngày</td>
                  <td className="num p-2 text-right">{r.business_type === "owned" ? money(r.purchase_price) : "—"}</td>
                  <td className="num p-2 text-right">{r.business_type === "owned" ? money(r.costs_confirmed_showroom) : "—"}</td>
                  <td className="num p-2 text-right">{r.business_type === "owned" ? money(r.capital_tied) : "—"}</td>
                  <td className="num p-2 text-right">{r.business_type === "owned" ? money(r.external_capital) : "—"}</td>
                  <td className="num p-2 text-right">{r.business_type === "owned" ? money(r.loan_outstanding) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager total={list.total} page={page} pageSize={PAGE} makeHref={href} />
    </>
  );
}
