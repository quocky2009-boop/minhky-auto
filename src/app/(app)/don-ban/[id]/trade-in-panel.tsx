"use client";

import Link from "next/link";
import { useActionState } from "react";
import { tradeInAction } from "../trade-in-actions";
import type { ActionState } from "../../nhu-cau/actions";
import { TRADE_IN_STATUS_LABEL } from "@/lib/trade-ins";
import { formatVnd } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import type { OldVehicleOption, TradeInView } from "./trade-in-load";

type Props = { orderId: string; orderStatus: string; manager: boolean; list: TradeInView[]; options: OldVehicleOption[]; requestIds: { create: string; offset: string } };

/** Thu cũ đổi mới: hai giao dịch giữ nguyên giá trị; đối trừ là chứng từ riêng (không phải tiền thật) và chỉ lấy từ phần của khách. */
export function TradeInPanel(p: Props) {
  const [s, action, pending] = useActionState<ActionState, FormData>(tradeInAction, null);
  const fe = s?.fieldErrors ?? {};
  const Err = ({ k }: { k: string }) => (fe[k] ? <span className="mt-1 block text-xs text-sig-red">{fe[k]}</span> : null);
  const confirm = (msg: string) => (e: React.MouseEvent) => { if (!window.confirm(msg)) e.preventDefault(); };
  const Hid = ({ intent, id, version }: { intent: string; id?: string; version?: number }) => (
    <><input type="hidden" name="intent" value={intent} /><input type="hidden" name="order_id" value={p.orderId} />
      {id && <input type="hidden" name="id" value={id} />}{version !== undefined && <input type="hidden" name="version" value={version} />}</>
  );
  return (
    <div className="space-y-3">
      {s?.message && <p role={s.ok ? "status" : "alert"} className={`text-sm ${s.ok ? "text-sig-green" : "text-sig-red"}`}>{s.message}</p>}
      {p.list.length === 0 && <p className="text-sm text-ink-soft">Đơn này chưa có xe cũ đổi lại.</p>}
      {p.list.map((t) => (
        <div key={t.id} className="rounded-md border border-line p-3 text-sm">
          <p><b>{t.code}</b> · {TRADE_IN_STATUS_LABEL[t.status]} · xe cũ <Link href={`/kho-xe/${t.old_vehicle_id}`} className="text-petrol hover:underline">{t.old_vehicle_label}</Link>
            {t.end_reason ? <span className="text-ink-soft"> — {t.end_reason}</span> : null}</p>
          <dl className="mt-2 grid gap-2 md:grid-cols-4">
            <div><dt className="text-ink-soft">Giá mua xe cũ (đầy đủ)</dt><dd className="num font-semibold">{formatVnd(t.purchase_value)}</dd></div>
            <div><dt className="text-ink-soft">Trả ngân hàng{t.loan_bank ? ` (${t.loan_bank})` : ""}</dt><dd className="num font-semibold">{formatVnd(t.loan_payoff_amount)} <span className="text-xs font-normal text-ink-soft">còn {formatVnd(t.bank_remaining)}</span></dd></div>
            <div><dt className="text-ink-soft">Phần của khách</dt><dd className="num font-semibold">{formatVnd(t.customer_portion)} <span className="text-xs font-normal text-ink-soft">còn {formatVnd(t.customer_remaining)}</span></dd></div>
            <div><dt className="text-ink-soft">Tiền còn phải trả cho xe cũ</dt><dd className="num font-semibold">{formatVnd(t.payable_total)}</dd></div>
            <div><dt className="text-ink-soft">Đối trừ đã xác nhận</dt><dd className="num">{formatVnd(t.offsets)}</dd></div>
            <div><dt className="text-ink-soft">Đã chi cho khách</dt><dd className="num">{formatVnd(t.paid_customer)}</dd></div>
            <div><dt className="text-ink-soft">Đã trả ngân hàng</dt><dd className="num">{formatVnd(t.paid_bank)}</dd></div>
          </dl>
          {t.note && <p className="mt-1 text-xs text-ink-soft">Ghi chú: {t.note}</p>}
          {t.offset_rows.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs">
              {t.offset_rows.map((o) => (
                <li key={o.id} className={o.status === "voided" ? "text-ink-soft line-through" : ""}>
                  {o.code} · đối trừ {formatVnd(o.amount)} · {formatDateTime(o.created_at)}{o.note ? ` · ${o.note}` : ""}{o.status === "voided" ? <span className="no-underline"> · ĐÃ HỦY: {o.void_reason}</span> : null}
                  {p.manager && o.status === "posted" && (
                    <details className="ml-2 inline-block"><summary className="cursor-pointer text-sig-red">Hủy</summary>
                      <form action={action} className="mt-1 flex gap-1"><Hid intent="void_offset" id={o.id} version={o.version} />
                        <input name="reason" className="field !py-1 text-xs" placeholder="Lý do hủy *" aria-label="Lý do hủy đối trừ" required />
                        <button className="btn btn-danger !py-1 text-xs" disabled={pending} onClick={confirm("Hủy khoản đối trừ? Công nợ đơn bán và số phải trả cho xe cũ được tính lại.")}>Hủy</button></form></details>
                  )}
                </li>
              ))}
            </ul>
          )}
          {p.manager && t.status === "draft" && (
            <form action={action} className="mt-2 flex flex-wrap gap-2"><Hid intent="confirm" id={t.id} version={t.version} />
              <button className="btn btn-primary !py-1" disabled={pending} onClick={confirm("Xác nhận hồ sơ thu cũ? Sau khi xác nhận không sửa giá trị/khoản vay.")}>Xác nhận hồ sơ</button></form>
          )}
          {p.manager && t.status === "confirmed" && p.orderStatus === "confirmed" && (
            <details className="mt-2"><summary className="btn btn-primary !py-1 cursor-pointer text-sm">+ Đối trừ vào đơn bán</summary>
              <form action={action} className="mt-2 grid gap-2 md:grid-cols-3"><Hid intent="offset" /><input type="hidden" name="request_id" value={p.requestIds.offset} /><input type="hidden" name="trade_in_id" value={t.id} />
                <label><span className="label">Số tiền đối trừ *</span><input name="amount" className="field" placeholder="100tr" /><Err k="amount" /></label>
                <label className="md:col-span-2"><span className="label">Ghi chú</span><input name="note" className="field" /></label>
                <button className="btn btn-primary md:w-fit" disabled={pending} onClick={confirm("Xác nhận đối trừ? Công nợ đơn bán giảm và số phải trả cho xe cũ giảm cùng số tiền (không có tiền thật vào/ra).")}>Xác nhận đối trừ</button>
                <p className="text-xs text-ink-soft md:col-span-3">Đối trừ chỉ lấy từ phần của khách ({formatVnd(t.customer_remaining)} còn lại), không lấy phần trả ngân hàng, và không vượt công nợ đơn bán.</p>
              </form></details>
          )}
          {t.status === "confirmed" && (
            <p className="mt-2 flex flex-wrap gap-3 text-sm">
              <Link href={`/thu-chi?lap=tradein_payout&tc=${t.id}`} className="text-petrol hover:underline">Chi tiền cho khách</Link>
              {Number(t.loan_payoff_amount) > 0 && <Link href={`/thu-chi?lap=tradein_loan_payoff&tc=${t.id}`} className="text-petrol hover:underline">Trả ngân hàng</Link>}
            </p>
          )}
          {p.manager && t.status !== "cancelled" && (
            <details className="mt-1"><summary className="cursor-pointer text-xs text-sig-red">Hủy hồ sơ thu cũ</summary>
              <form action={action} className="mt-1 flex gap-1"><Hid intent="cancel" id={t.id} version={t.version} />
                <input name="reason" className="field !py-1 text-xs" placeholder="Lý do hủy *" aria-label="Lý do hủy hồ sơ" required />
                <button className="btn btn-danger !py-1 text-xs" disabled={pending} onClick={confirm("Hủy hồ sơ thu cũ? Cần hủy hết đối trừ và phiếu chi liên quan trước.")}>Hủy hồ sơ</button></form></details>
          )}
        </div>
      ))}
      {p.manager && p.orderStatus !== "cancelled" && (
        <details className="rounded-md border border-line p-3">
          <summary className="cursor-pointer text-sm font-semibold text-petrol">+ Lập hồ sơ thu cũ đổi mới</summary>
          {p.options.length === 0 ? <p className="mt-2 text-xs text-ink-soft">Chưa có xe cũ nào để liên kết. Nhập kho xe cũ của khách (nguồn “thu cũ đổi mới”, đã có giá mua) trước.</p> : (
            <form action={action} className="mt-3 grid gap-3 md:grid-cols-3"><Hid intent="create" /><input type="hidden" name="request_id" value={p.requestIds.create} />
              <label className="md:col-span-3"><span className="label">Xe cũ của khách (đã nhập kho) *</span>
                <select name="old_vehicle_id" defaultValue="" className="field"><option value="">— Chọn xe cũ —</option>
                  {p.options.map((o) => <option key={o.id} value={o.id}>{o.label} · giá mua {o.purchase_price ? formatVnd(o.purchase_price) : "chưa có"}</option>)}</select><Err k="old_vehicle_id" /></label>
              <label><span className="label">Khoản vay còn lại showroom trả ngân hàng</span><input name="loan_payoff_amount" className="field" placeholder="0 nếu không vay" /><Err k="loan_payoff_amount" /></label>
              <label><span className="label">Ngân hàng</span><input name="loan_bank" className="field" /><Err k="loan_bank" /></label>
              <label><span className="label">Ghi chú</span><input name="note" className="field" /></label>
              <button className="btn btn-primary md:w-fit" disabled={pending}>Lập hồ sơ</button>
              <p className="text-xs text-ink-soft md:col-span-3">Giá trị mua xe cũ lấy từ giá mua của xe (không nhập lại ở đây). Giá bán xe mới và giá mua xe cũ giữ nguyên để tính hiệu quả từng xe.</p>
            </form>
          )}
        </details>
      )}
    </div>
  );
}
