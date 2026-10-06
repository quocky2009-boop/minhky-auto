import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireModule } from "@/lib/auth";
import { isManager } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { formatVnd } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { DIRECTION_LABEL, METHOD_LABEL, PURPOSE_LABEL, todayVn } from "@/lib/cashbook";
import { Empty, ErrorBox, PageHeader, Pager } from "@/components/ui";
import { listVouchers, loadAccounts, loadVoucherTargets } from "./load";
import { VoucherForm } from "./voucher-form";
import { AccountsPanel } from "./accounts-panel";
import { VoidButton } from "./void-button";

export const metadata = { title: "Thu chi" };
const PAGE = 25;

export default async function CashbookPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireModule("cashbook");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const manager = isManager(user.roles);
  const supabase = await createClient();
  const [accounts, targets, list] = await Promise.all([
    loadAccounts(supabase), loadVoucherTargets(supabase),
    listVouchers(supabase, page, PAGE, { direction: sp.huong, account: sp.tk, from: sp.tu, to: sp.den, status: sp.trang_thai }),
  ]);
  const qs = (p: number) => `/thu-chi?${new URLSearchParams(Object.entries({ huong: sp.huong, tk: sp.tk, tu: sp.tu, den: sp.den, trang_thai: sp.trang_thai, page: String(p) }).filter(([, v]) => !!v) as [string, string][])}`;

  return (
    <>
      <PageHeader title="Thu chi" sub="Phiếu = tiền đã thật sự vào/ra tài khoản · cọc không phải lợi nhuận · chưa nhận tiền thì chưa có phiếu" />
      <div className="space-y-4">
        <section className="panel p-4"><h2 className="mb-2 font-semibold">Tài khoản tiền</h2>
          <AccountsPanel accounts={accounts} manager={manager} requestId={randomUUID()} /></section>

        <section className="panel p-4"><h2 className="mb-2 font-semibold">Lập phiếu thu/chi</h2>
          {accounts.some((a) => a.is_active) ? (
            <details open={!!sp.lap}><summary className="cursor-pointer text-sm font-semibold text-petrol">+ Lập phiếu</summary>
              <div className="mt-3"><VoucherForm requestId={randomUUID()} today={todayVn()} accounts={accounts} orders={targets.orderOptions} deposits={targets.depositOptions}
                initial={{ purpose: sp.lap, order: sp.don, reservation: sp.coc }} /></div></details>
          ) : <p className="text-sm text-ink-soft">Cần ít nhất một tài khoản tiền đang dùng để lập phiếu.</p>}
        </section>

        <section className="panel p-4">
          <h2 className="mb-2 font-semibold">Sổ phiếu</h2>
          <form className="mb-3 flex flex-wrap items-end gap-2" action="/thu-chi">
            <label><span className="label">Hướng</span><select name="huong" defaultValue={sp.huong ?? ""} className="field"><option value="">Tất cả</option><option value="in">Thu</option><option value="out">Chi</option></select></label>
            <label><span className="label">Tài khoản</span><select name="tk" defaultValue={sp.tk ?? ""} className="field"><option value="">Tất cả</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label>
            <label><span className="label">Từ ngày</span><input type="date" name="tu" defaultValue={sp.tu ?? ""} className="field" /></label>
            <label><span className="label">Đến ngày</span><input type="date" name="den" defaultValue={sp.den ?? ""} className="field" /></label>
            <label><span className="label">Trạng thái</span><select name="trang_thai" defaultValue={sp.trang_thai ?? ""} className="field"><option value="">Tất cả</option><option value="posted">Đã ghi</option><option value="voided">Đã hủy</option></select></label>
            <button className="btn btn-ghost">Lọc</button>
          </form>
          {list.error ? <ErrorBox message="Không tải được sổ phiếu. Thử tải lại trang." /> : list.rows.length === 0 ? <Empty title="Chưa có phiếu nào khớp." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-line text-left text-ink-soft"><th className="p-2">Mã</th><th className="p-2">Ngày</th><th className="p-2">Loại</th><th className="p-2">Đối tượng</th><th className="p-2">Tài khoản</th><th className="p-2 text-right">Số tiền</th><th className="p-2">Ghi chú</th><th className="p-2" /></tr></thead>
                <tbody>
                  {list.rows.map((v) => (
                    <tr key={v.id} className={`border-b border-line/60 align-top ${v.status === "voided" ? "text-ink-soft line-through" : ""}`}>
                      <td className="p-2 font-semibold">{v.code}</td>
                      <td className="p-2">{formatDate(v.occurred_on)}</td>
                      <td className="p-2">{DIRECTION_LABEL[v.direction]} · {PURPOSE_LABEL[v.purpose]}</td>
                      <td className="p-2">{v.counterparty || "—"}{v.order ? <> · <Link href={`/don-ban/${v.order.id}`} className="text-petrol hover:underline">{v.order.code}</Link></> : null}{v.reservation ? ` · cọc ${v.reservation.code}` : ""}</td>
                      <td className="p-2">{v.account?.name ?? "—"} · {METHOD_LABEL[v.method]}</td>
                      <td className={`num p-2 text-right font-semibold ${v.direction === "in" ? "text-sig-green" : "text-sig-red"}`}>{v.direction === "in" ? "+" : "−"}{formatVnd(v.amount)}</td>
                      <td className="p-2 text-xs">{v.reference ? `Mã GD ${v.reference}. ` : ""}{v.note ?? ""}{v.status === "voided" ? <span className="no-underline"> · ĐÃ HỦY: {v.void_reason}</span> : null}</td>
                      <td className="p-2">{manager && v.status === "posted" ? <VoidButton id={v.id} version={v.version} /> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager total={list.total} page={page} pageSize={PAGE} makeHref={qs} />
        </section>
      </div>
    </>
  );
}
