/**
 * Thu chi: nhãn, đọc form phiếu/tài khoản. Thuần TypeScript, kiểm thử được.
 * Phiếu = tiền ĐÃ thật sự vào/ra; luật (không thu vượt công nợ, chi đủ tiền thực có, hoàn cọc...) do DATABASE thực thi.
 * Số tiền là VND nguyên, đọc bằng parseVndInput (BigInt), không dùng số thực.
 */
import { parseVndInput } from "@/lib/money";
import type { FormInput, ParseResult } from "@/lib/costs";

export const PURPOSE_LABEL: Record<string, string> = {
  sale_deposit: "Thu tiền cọc", sale_payment: "Thu tiền đơn bán", other_income: "Thu khác",
  deposit_refund: "Hoàn tiền cọc", sale_refund: "Hoàn tiền đơn bán", general_expense: "Chi phí chung", other_expense: "Chi khác",
  tradein_payout: "Chi cho khách (mua xe cũ)", tradein_loan_payoff: "Trả ngân hàng (xe cũ còn vay)",
};
export const PURPOSE_DIRECTION: Record<string, "in" | "out"> = {
  sale_deposit: "in", sale_payment: "in", other_income: "in", deposit_refund: "out", sale_refund: "out", general_expense: "out", other_expense: "out", tradein_payout: "out", tradein_loan_payoff: "out",
};
export const DIRECTION_LABEL: Record<string, string> = { in: "Thu", out: "Chi" };
export const METHOD_LABEL: Record<string, string> = { cash: "Tiền mặt", bank_transfer: "Chuyển khoản" };
export const PAYER_LABEL: Record<string, string> = { customer: "Khách hàng", bank: "Ngân hàng giải ngân", other: "Khác" };
export const ACCOUNT_KIND_LABEL: Record<string, string> = { cash: "Tiền mặt", bank: "Ngân hàng" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (errs: Record<string, string>): ParseResult => ({ ok: false, error: "Kiểm tra lại các ô được đánh dấu.", fieldErrors: errs });
const badSession: ParseResult = { ok: false, error: "Phiên nhập không hợp lệ, tải lại trang.", fieldErrors: {} };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Ngày hôm nay theo giờ Việt Nam (yyyy-MM-dd). */
export function todayVn(now = new Date()): string {
  return new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

export function parseVoucherForm(fd: FormInput, now = new Date()): ParseResult {
  const errs: Record<string, string> = {};
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const requestId = s("request_id");
  if (!UUID.test(requestId)) return badSession;
  const purpose = s("purpose");
  const direction = PURPOSE_DIRECTION[purpose];
  if (!direction) errs.purpose = "Chọn loại phiếu";
  if (!UUID.test(s("account_id"))) errs.account_id = "Chọn tài khoản tiền";
  const method = s("method");
  if (!(method in METHOD_LABEL)) errs.method = "Chọn tiền mặt hoặc chuyển khoản";
  let amount = "";
  try {
    const v = parseVndInput(s("amount"));
    if (v === null || v <= 0n) errs.amount = "Nhập số tiền (lớn hơn 0)"; else amount = v.toString();
  } catch { errs.amount = "Không hiểu số tiền. Ví dụ: 30tr, 650.000.000"; }
  const date = s("occurred_on");
  if (!DATE.test(date)) errs.occurred_on = "Nhập ngày tiền thực sự vào/ra";
  else if (date > todayVn(now)) errs.occurred_on = "Ngày không được ở tương lai. Chưa nhận/chưa chi tiền thì chưa lập phiếu";
  const orderId = s("order_id"), resId = s("reservation_id"), tiId = s("trade_in_id");
  if (purpose === "sale_payment" || purpose === "sale_refund") { if (!UUID.test(orderId)) errs.order_id = "Chọn đơn bán"; }
  if (purpose === "sale_deposit" || purpose === "deposit_refund") { if (!UUID.test(resId)) errs.reservation_id = "Chọn đặt cọc"; }
  if (purpose === "tradein_payout" || purpose === "tradein_loan_payoff") { if (!UUID.test(tiId)) errs.trade_in_id = "Chọn hồ sơ thu cũ đổi mới"; }
  const linked = ["sale_deposit", "deposit_refund", "sale_payment", "sale_refund", "tradein_payout", "tradein_loan_payoff"].includes(purpose);
  const counterparty = s("counterparty");
  if (!linked && direction && !counterparty) errs.counterparty = direction === "in" ? "Ghi người nộp tiền" : "Ghi người nhận tiền";
  let payer = s("payer_kind");
  if (direction === "in") { if (!(payer in PAYER_LABEL)) payer = "customer"; } else payer = "";
  if (Object.keys(errs).length) return fail(errs);
  return { ok: true, payload: {
    request_id: requestId, direction, purpose, account_id: s("account_id"), amount, occurred_on: date, method, payer_kind: payer, counterparty,
    reference: s("reference"), note: s("note"),
    ...(orderId && (purpose === "sale_payment" || purpose === "sale_refund") ? { order_id: orderId } : {}),
    ...(resId && (purpose === "sale_deposit" || purpose === "deposit_refund") ? { reservation_id: resId } : {}),
    ...(tiId && (purpose === "tradein_payout" || purpose === "tradein_loan_payoff") ? { trade_in_id: tiId } : {}),
  } };
}

export function parseAccountForm(fd: FormInput): ParseResult {
  const errs: Record<string, string> = {};
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const requestId = s("request_id");
  if (!UUID.test(requestId)) return badSession;
  if (!s("name")) errs.name = "Nhập tên tài khoản";
  if (!(s("kind") in ACCOUNT_KIND_LABEL)) errs.kind = "Chọn tiền mặt hoặc ngân hàng";
  let opening = "0";
  try {
    const v = parseVndInput(s("opening_balance"));
    if (v !== null) { if (v < 0n) errs.opening_balance = "Số dư đầu kỳ không âm"; else opening = v.toString(); }
  } catch { errs.opening_balance = "Không hiểu số tiền"; }
  if (Object.keys(errs).length) return fail(errs);
  return { ok: true, payload: { request_id: requestId, name: s("name"), kind: s("kind"), opening_balance: opening, note: s("note") } };
}
