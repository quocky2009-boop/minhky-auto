"use client";

import { useActionState, useState } from "react";
import { cashAction } from "./actions";
import type { ActionState } from "../nhu-cau/actions";
import type { AccountBalance, DepositOption, OrderOption, SettlementLineOption, TradeInOption } from "./load";
import { LINE_KIND_LABEL, LINE_PURPOSE } from "@/lib/settlements";
import { PURPOSE_DIRECTION, PURPOSE_LABEL, PAYER_LABEL, METHOD_LABEL } from "@/lib/cashbook";
import { formatVnd } from "@/lib/money";

type Props = { requestId: string; today: string; accounts: AccountBalance[]; orders: OrderOption[]; deposits: DepositOption[]; tradeIns: TradeInOption[]; settlementLines: SettlementLineOption[]; initial?: { purpose?: string; order?: string; reservation?: string; tradeIn?: string; settlementLine?: string } };

/** Lập phiếu thu/chi. Phiếu = tiền ĐÃ vào/ra tài khoản; luật tiền do database kiểm tra lại. */
export function VoucherForm(p: Props) {
  const [s, action, pending] = useActionState<ActionState, FormData>(cashAction, null);
  const [purpose, setPurpose] = useState(p.initial?.purpose && p.initial.purpose in PURPOSE_LABEL ? p.initial.purpose : "sale_payment");
  const fe = s?.fieldErrors ?? {};
  const Err = ({ k }: { k: string }) => (fe[k] ? <span className="mt-1 block text-xs text-sig-red">{fe[k]}</span> : null);
  const dir = PURPOSE_DIRECTION[purpose];
  const needOrder = purpose === "sale_payment" || purpose === "sale_refund";
  const needDep = purpose === "sale_deposit" || purpose === "deposit_refund";
  const needTi = purpose === "tradein_payout" || purpose === "tradein_loan_payoff";
  const needSl = Object.values(LINE_PURPOSE).includes(purpose);
  const free = !needOrder && !needDep && !needTi && !needSl;
  const accounts = p.accounts.filter((a) => a.is_active);
  return (
    <form action={action} className="grid gap-3 md:grid-cols-3">
      <input type="hidden" name="intent" value="post" /><input type="hidden" name="request_id" value={p.requestId} />
      {s?.message && <p role={s.ok ? "status" : "alert"} className={`text-sm md:col-span-3 ${s.ok ? "text-sig-green" : "text-sig-red"}`}>{s.message}</p>}
      <label><span className="label">Loại phiếu *</span>
        <select name="purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} className="field">
          <optgroup label="Thu">{Object.keys(PURPOSE_LABEL).filter((k) => PURPOSE_DIRECTION[k] === "in").map((k) => <option key={k} value={k}>{PURPOSE_LABEL[k]}</option>)}</optgroup>
          <optgroup label="Chi">{Object.keys(PURPOSE_LABEL).filter((k) => PURPOSE_DIRECTION[k] === "out").map((k) => <option key={k} value={k}>{PURPOSE_LABEL[k]}</option>)}</optgroup>
        </select><Err k="purpose" /></label>
      {needOrder && (
        <label className="md:col-span-2"><span className="label">Đơn bán đã ký *</span>
          <select name="order_id" defaultValue={p.initial?.order ?? ""} className="field"><option value="">— Chọn đơn —</option>
            {p.orders.map((o) => <option key={o.id} value={o.id}>{o.code} · {o.customer} · tổng {formatVnd(o.total)} · đã thu {formatVnd(o.paid)} · còn nợ {o.outstanding === null ? "—" : formatVnd(o.outstanding)}</option>)}</select><Err k="order_id" /></label>
      )}
      {needDep && (
        <label className="md:col-span-2"><span className="label">Đặt cọc *</span>
          <select name="reservation_id" defaultValue={p.initial?.reservation ?? ""} className="field"><option value="">— Chọn đặt cọc —</option>
            {p.deposits.map((r) => <option key={r.id} value={r.id}>{r.code} · cọc thỏa thuận {formatVnd(r.deposit_amount)} · đã thu (ròng) {formatVnd(r.net_deposit)} · {r.status === "active" ? "đang hiệu lực" : r.status === "fulfilled" ? "đã thành đơn bán" : r.status === "cancelled" ? "đã hủy" : r.status}</option>)}</select><Err k="reservation_id" /></label>
      )}
      {needSl && (
        <label className="md:col-span-2"><span className="label">Nghĩa vụ của quyết toán đã duyệt *</span>
          <select name="settlement_line_id" defaultValue={p.initial?.settlementLine ?? ""} className="field"><option value="">— Chọn khoản —</option>
            {p.settlementLines.filter((l) => LINE_PURPOSE[l.line_kind] === purpose).map((l) => <option key={l.id} value={l.id}>{l.code} · {LINE_KIND_LABEL[l.line_kind]} · {l.label} · còn {formatVnd(l.remaining)}</option>)}</select><Err k="settlement_line_id" /></label>
      )}
      {needTi && (
        <label className="md:col-span-2"><span className="label">Hồ sơ thu cũ đổi mới *</span>
          <select name="trade_in_id" defaultValue={p.initial?.tradeIn ?? ""} className="field"><option value="">— Chọn hồ sơ —</option>
            {p.tradeIns.map((t) => <option key={t.id} value={t.id}>{t.code} · {purpose === "tradein_payout" ? `còn chi được cho khách ${formatVnd(t.customer_remaining)}` : `còn trả ngân hàng ${formatVnd(t.bank_remaining)}`}</option>)}</select><Err k="trade_in_id" /></label>
      )}
      <label><span className="label">Tài khoản tiền *</span>
        <select name="account_id" defaultValue="" className="field"><option value="">— Chọn tài khoản —</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name} · còn {formatVnd(a.balance)}</option>)}</select><Err k="account_id" /></label>
      <label><span className="label">Số tiền *</span><input name="amount" className="field" placeholder="30tr" /><Err k="amount" /></label>
      <label><span className="label">Ngày tiền thực sự {dir === "in" ? "vào" : "ra"} *</span><input type="date" name="occurred_on" defaultValue={p.today} max={p.today} className="field" /><Err k="occurred_on" /></label>
      <label><span className="label">Hình thức *</span>
        <select name="method" defaultValue="cash" className="field">{Object.entries(METHOD_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><Err k="method" /></label>
      {dir === "in" && (
        <label><span className="label">Ai trả</span>
          <select name="payer_kind" defaultValue="customer" className="field">{Object.entries(PAYER_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      )}
      <label><span className="label">{dir === "in" ? "Người nộp" : "Người nhận"}{free ? " *" : " (để trống = tên khách)"}</span><input name="counterparty" className="field" /><Err k="counterparty" /></label>
      <label><span className="label">Mã giao dịch / số chứng từ</span><input name="reference" className="field" /></label>
      <label className="md:col-span-2"><span className="label">Ghi chú</span><input name="note" className="field" /></label>
      <button className="btn btn-primary md:w-fit" disabled={pending}>Ghi phiếu</button>
      <p className="text-xs text-ink-soft md:col-span-3">Chỉ lập phiếu khi tiền ĐÃ thật sự vào/ra tài khoản — hẹn trả hay ngân hàng chưa giải ngân thì chưa có phiếu. Phiếu không sửa/xóa được; sai thì quản lý hủy rồi ghi lại. Hệ thống chặn thu vượt công nợ, hoàn vượt đã thu, và chi khi tài khoản không đủ tiền.</p>
    </form>
  );
}
