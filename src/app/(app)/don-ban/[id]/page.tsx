import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { canSeeFinance, isManager } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { formatVnd } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { LINE_STATUS_LABEL, ORDER_STATUS_LABEL } from "@/lib/sales-orders";
import { PageHeader } from "@/components/ui";
import { getOrder, loadOrderOptions } from "../load";
import { OrderForm } from "../order-form";
import { OrderActionsPanel } from "./order-actions-panel";
import { loadTradeIns } from "./trade-in-load";
import { loadOrderHandovers } from "../../ban-giao/load";
import { HandoverCreate } from "./handover-create";
import { loadOrderSettlements } from "../../quyet-toan/load";
import { SettlementCreate } from "./settlement-create";
import { TradeInPanel } from "./trade-in-panel";
import { AftersalesPanel } from "./aftersales-panel";
import { loadOrderAftersales } from "../../hau-mai/load";
import { todayVn } from "@/lib/cashbook";
import { randomUUID } from "node:crypto";

export const metadata = { title: "Chi tiết đơn bán" };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireModule("sales");
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const o = await getOrder(supabase, id);
  if (!o) notFound();
  const manager = isManager(user.roles);
  const mine = manager || o.owner_id === user.id;
  const active = o.lines.filter((l) => l.line_status === "active");
  const needsApproval = active.some((l) => l.needs_approval);
  const options = o.status === "draft" && mine ? await loadOrderOptions(supabase, o.id) : null;
  const history = o.lines.filter((l) => l.line_status !== "active");
  const finance = canSeeFinance(user.roles);
  const handovers = o.status === "confirmed" ? await loadOrderHandovers(supabase, o.id) : [];
  const settlements = finance && o.status === "confirmed" ? await loadOrderSettlements(supabase, o.id) : [];
  const after = o.status === "confirmed" && active.length > 0 ? await loadOrderAftersales(supabase, active.map((l) => l.id)) : null;
  const trade = finance ? await loadTradeIns(supabase, o.id, manager) : null;
  const money = finance
    ? ((await supabase.from("sales_order_balances").select("total, paid_direct, applied_deposit, outstanding, trade_in_offset").eq("order_id", o.id).maybeSingle()).data as
        { total: unknown; paid_direct: unknown; applied_deposit: unknown; outstanding: unknown; trade_in_offset: unknown } | null)
    : null;

  return (
    <>
      <PageHeader title={`Đơn bán ${o.code}`} sub={<>{ORDER_STATUS_LABEL[o.status]} · tạo {formatDateTime(o.created_at)}</>}>
        <Link href="/don-ban" className="btn btn-ghost">← Danh sách</Link>
      </PageHeader>
      {sp["da-tao"] && <p role="status" className="mb-3 text-sm text-sig-green">Đã lập đơn bán nháp. Xác nhận khi đã ký hợp đồng bán.</p>}
      <div className="space-y-4">
        <section className="panel p-4">
          <dl className="grid gap-2 text-sm md:grid-cols-2">
            <div><dt className="inline text-ink-soft">Khách: </dt><dd className="inline">{o.customer?.full_name ?? "—"}{o.customer?.phone ? ` · ${o.customer.phone}` : ""}</dd></div>
            <div><dt className="inline text-ink-soft">Nhu cầu: </dt><dd className="inline">{o.demand ? <Link href={`/nhu-cau/${o.demand.id}`} className="text-petrol hover:underline">{o.demand.code}</Link> : "—"}</dd></div>
            <div><dt className="inline text-ink-soft">Người phụ trách: </dt><dd className="inline">{o.owner?.full_name ?? "—"}</dd></div>
            <div><dt className="inline text-ink-soft">Hợp đồng bán: </dt><dd className="inline">{o.contract_ref ? `${o.contract_ref}${o.contract_date ? ` · ký ${formatDate(o.contract_date)}` : ""}` : "Chưa có"}</dd></div>
            {o.confirmed_at && <div><dt className="inline text-ink-soft">Xác nhận lúc: </dt><dd className="inline">{formatDateTime(o.confirmed_at)}</dd></div>}
            {o.approval_reason && <div className="md:col-span-2"><dt className="inline text-ink-soft">Lý do quản lý duyệt giá thấp: </dt><dd className="inline">{o.approval_reason}</dd></div>}
            {o.end_reason && <div className="md:col-span-2"><dt className="inline text-ink-soft">Lý do hủy: </dt><dd className="inline">{o.end_reason}</dd></div>}
            {o.note && <div className="md:col-span-2"><dt className="inline text-ink-soft">Ghi chú: </dt><dd className="inline">{o.note}</dd></div>}
          </dl>
        </section>

        <section className="panel p-4">
          <h2 className="mb-2 font-semibold">Xe trong đơn</h2>
          <ul className="divide-y divide-line/60 text-sm">
            {active.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><Link href={`/kho-xe/${l.vehicle_id}`} className="text-petrol hover:underline">{l.vehicle_label}</Link>
                  {l.needs_approval && <span className="text-[#8a6100]"> · giá thấp hơn mức cho phép</span>}
                  {l.quote_version_id && <span className="text-ink-soft"> · theo báo giá khách đã chấp nhận</span>}</span>
                <b className="num">{formatVnd(l.sale_price)}</b>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-right text-sm">Tổng giá bán: <b className="num">{o.total === null ? "—" : formatVnd(o.total.toString())}</b> <span className="text-xs text-ink-soft">(giá ghi trên hợp đồng, chưa phải tiền đã thu)</span></p>
          {history.length > 0 && (
            <details className="mt-2"><summary className="cursor-pointer text-xs text-petrol">Dòng đã bỏ/hủy ({history.length})</summary>
              <ul className="mt-1 text-xs text-ink-soft">{history.map((l) => <li key={l.id}>{l.vehicle_label} · {formatVnd(l.sale_price)} · {LINE_STATUS_LABEL[l.line_status]}</li>)}</ul></details>
          )}
        </section>

        <section className="panel p-4">
          <h2 className="mb-2 font-semibold">Xác nhận / hủy</h2>
          <OrderActionsPanel id={o.id} version={o.version} status={o.status} manager={manager} mine={mine} needsApproval={needsApproval}
            contractRef={o.contract_ref ?? ""} contractDate={o.contract_date ?? ""} />
          {o.status === "confirmed" && <p className="mt-2 text-xs text-ink-soft">Đơn đã ký hợp đồng không sửa được; nếu sai, quản lý hủy rồi lập đơn mới. Thu tiền, công nợ, bàn giao và quyết toán làm ở các phần sau.</p>}
        </section>

        {money && (
          <section className="panel p-4">
            <h2 className="mb-2 font-semibold">Thu tiền và công nợ</h2>
            <dl className="grid gap-2 text-sm md:grid-cols-4">
              <div><dt className="text-ink-soft">Tổng giá bán</dt><dd className="num font-semibold">{formatVnd(money.total)}</dd></div>
              <div><dt className="text-ink-soft">Thanh toán đã thu (ròng hoàn)</dt><dd className="num font-semibold">{formatVnd(money.paid_direct)}</dd></div>
              <div><dt className="text-ink-soft">Tiền cọc đã áp vào đơn</dt><dd className="num font-semibold">{formatVnd(money.applied_deposit)}</dd></div>
              {Number(money.trade_in_offset) > 0 && <div><dt className="text-ink-soft">Đã đối trừ thu cũ đổi mới</dt><dd className="num font-semibold">{formatVnd(money.trade_in_offset)}</dd></div>}
              <div><dt className="text-ink-soft">Còn phải thu</dt><dd className="num font-semibold">{money.outstanding === null ? "— (đơn chưa ký)" : formatVnd(money.outstanding)}</dd></div>
            </dl>
            {o.status === "confirmed" && (
              <p className="mt-2 flex flex-wrap gap-3 text-sm">
                <Link href={`/thu-chi?lap=sale_payment&don=${o.id}`} className="text-petrol hover:underline">+ Thu tiền đơn này</Link>
                <Link href={`/thu-chi?lap=sale_refund&don=${o.id}`} className="text-petrol hover:underline">Hoàn tiền khách</Link>
              </p>
            )}
            <p className="mt-1 text-xs text-ink-soft">Chỉ tính tiền đã thật sự nhận (phiếu thu). Tiền cọc không phải lợi nhuận; cọc chỉ tính vào đơn khi cọc đã chốt thành đơn bán.</p>
          </section>
        )}

        {handovers.length > 0 && (
          <section className="panel p-4">
            <h2 className="mb-2 font-semibold">Bàn giao xe</h2>
            <ul className="space-y-2 text-sm">
              {handovers.map((x) => (
                <li key={x.line_id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{x.label}</span>
                  {x.handover ? <Link href={`/ban-giao/${x.handover.id}`} className="text-petrol hover:underline">{x.handover.code} · {x.handover.status === "preparing" ? "đang chuẩn bị" : x.handover.status === "delivered" ? "đã giao" : "đã hủy"}</Link>
                    : mine ? <HandoverCreate lineId={x.line_id} requestId={randomUUID()} /> : <span className="text-ink-soft">Chưa lập bàn giao</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {settlements.length > 0 && (
          <section className="panel p-4">
            <h2 className="mb-2 font-semibold">Quyết toán xe</h2>
            <ul className="space-y-2 text-sm">
              {settlements.map((x) => (
                <li key={x.line_id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{x.label}</span>
                  {x.settlement ? <Link href={`/quyet-toan/${x.settlement.id}`} className="text-petrol hover:underline">{x.settlement.code} · {x.settlement.status === "provisional" ? "tạm tính" : x.settlement.status === "checked" ? "đã kiểm tra" : "đã phê duyệt"}</Link>
                    : <SettlementCreate lineId={x.line_id} requestId={randomUUID()} />}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-soft">Quyết toán chia lợi nhuận (xe góp vốn) hoặc trả chủ xe (xe ký gửi). Chỉ phê duyệt được khi đơn đã thu đủ tiền.</p>
          </section>
        )}

        {after && (
          <section className="panel p-4">
            <h2 className="mb-2 font-semibold">Hậu mãi: cam kết, bảo hành, phản ánh</h2>
            <AftersalesPanel lines={active.map((l) => ({ id: l.id, label: l.vehicle_label || l.vehicle_id }))} commitments={after.commitments} cases={after.cases}
              manager={manager} canOpen={mine} today={todayVn()}
              requestIds={Object.fromEntries(active.map((l) => [l.id, { commitment: randomUUID(), case: randomUUID() }]))} />
          </section>
        )}

        {trade && (
          <section className="panel p-4">
            <h2 className="mb-2 font-semibold">Thu cũ đổi mới</h2>
            <TradeInPanel orderId={o.id} orderStatus={o.status} manager={manager} list={trade.list} options={trade.options}
              requestIds={{ create: randomUUID(), offset: randomUUID() }} />
          </section>
        )}

        {options && (
          <section className="panel p-4">
            <h2 className="mb-2 font-semibold">Sửa đơn nháp</h2>
            <OrderForm mode="update" orderId={o.id} version={o.version} vehicles={options.vehicles} quotes={options.quotes}
              initial={{ contract_ref: o.contract_ref ?? "", contract_date: o.contract_date ?? "", note: o.note ?? "",
                rows: active.map((l) => ({ vehicle: l.vehicle_id, price: String(l.sale_price).split(".")[0], quote: l.quote_version_id ?? "" })) }} />
          </section>
        )}
      </div>
    </>
  );
}
