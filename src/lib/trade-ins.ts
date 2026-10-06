/**
 * Thu cũ đổi mới: nhãn, đọc form. Thuần TypeScript, kiểm thử được.
 * Hai giao dịch (bán xe mới, mua xe cũ) giữ GIÁ TRỊ ĐẦY ĐỦ; đối trừ là chứng từ riêng (không phải tiền thật) và chỉ lấy từ PHẦN CỦA KHÁCH
 * (giá mua − khoản trả ngân hàng). Mọi luật tiền do database thực thi; ở đây chỉ báo lỗi sớm và tính số xem trước bằng BigInt.
 */
import { parseVndInput } from "@/lib/money";
import type { FormInput, ParseResult } from "@/lib/costs";

export const TRADE_IN_STATUS_LABEL: Record<string, string> = { draft: "Đang soạn", confirmed: "Đã xác nhận", cancelled: "Đã hủy" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (errs: Record<string, string>): ParseResult => ({ ok: false, error: "Kiểm tra lại các ô được đánh dấu.", fieldErrors: errs });
const badSession: ParseResult = { ok: false, error: "Phiên nhập không hợp lệ, tải lại trang.", fieldErrors: {} };

function money(s: string, key: string, errs: Record<string, string>, opts: { required?: boolean; allowZero?: boolean } = {}): string {
  try {
    const v = parseVndInput(s);
    if (v === null) { if (opts.required) errs[key] = "Nhập số tiền"; return opts.allowZero ? "0" : ""; }
    if (v < 0n || (v === 0n && !opts.allowZero)) { errs[key] = opts.allowZero ? "Số tiền không âm" : "Số tiền phải lớn hơn 0"; return ""; }
    return v.toString();
  } catch { errs[key] = "Không hiểu số tiền. Ví dụ: 150tr, 150.000.000"; return ""; }
}

/** Lập/sửa hồ sơ thu cũ. Giá trị mua xe cũ KHÔNG nhập ở đây: lấy từ giá mua của xe (database). */
export function parseTradeInForm(fd: FormInput, mode: "create" | "update"): ParseResult {
  const errs: Record<string, string> = {};
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const payload: Record<string, unknown> = { note: s("note") };
  if (mode === "create") {
    const requestId = s("request_id");
    if (!UUID.test(requestId)) return badSession;
    if (!UUID.test(s("order_id"))) return badSession;
    if (!UUID.test(s("old_vehicle_id"))) errs.old_vehicle_id = "Chọn xe cũ của khách";
    Object.assign(payload, { request_id: requestId, order_id: s("order_id"), old_vehicle_id: s("old_vehicle_id") });
  }
  const loan = money(s("loan_payoff_amount"), "loan_payoff_amount", errs, { allowZero: true });
  const bank = s("loan_bank");
  if (!errs.loan_payoff_amount && loan !== "0" && !bank) errs.loan_bank = "Ghi ngân hàng đang cho vay khi xe còn vay";
  payload.loan_payoff_amount = loan === "" ? "0" : loan;
  payload.loan_bank = loan !== "0" ? bank : "";
  if (Object.keys(errs).length) return fail(errs);
  return { ok: true, payload };
}

export function parseOffsetForm(fd: FormInput): ParseResult {
  const errs: Record<string, string> = {};
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const requestId = s("request_id");
  if (!UUID.test(requestId) || !UUID.test(s("trade_in_id"))) return badSession;
  const amount = money(s("amount"), "amount", errs, { required: true });
  if (Object.keys(errs).length) return fail(errs);
  return { ok: true, payload: { request_id: requestId, trade_in_id: s("trade_in_id"), amount, note: s("note") } };
}

export type TradeInFigures = { purchaseValue: bigint; loanPayoff: bigint; offsets: bigint; paidCustomer: bigint; paidBank: bigint };

/** Số xem trước cho một hồ sơ (database vẫn là nơi quyết định). Phần khách C = giá mua − khoản trả ngân hàng; không khấu trừ hai lần. */
export function tradeInFigures(f: TradeInFigures) {
  const customerPortion = f.purchaseValue - f.loanPayoff;
  return {
    customerPortion,
    payableTotal: f.purchaseValue - f.offsets - f.paidCustomer - f.paidBank,
    customerRemaining: customerPortion - f.offsets - f.paidCustomer,
    bankRemaining: f.loanPayoff - f.paidBank,
  };
}
