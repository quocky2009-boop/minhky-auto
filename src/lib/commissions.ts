/**
 * Hoa hồng nhân viên bán hàng: nhãn, đọc form. Thuần TypeScript, kiểm thử được.
 * Chính sách (Chủ tịch chốt 08/10/2026): số tiền theo từng đầu xe — xe mới theo hãng/model, xe cũ theo đúng số VIN.
 * Quyền, quy tắc áp dụng, chuyển trạng thái và chi trả do DATABASE thực thi; ở đây chỉ báo lỗi sớm và hiển thị.
 */
import { parseVndInput } from "@/lib/money";
import type { FormInput, ParseResult } from "@/lib/costs";

export const ENTRY_STATUS_LABEL: Record<string, string> = { no_rule: "Chưa có quy tắc", accrued: "Đã tính — chờ duyệt", approved: "Đã duyệt", cancelled: "Đã hủy" };
export const SCOPE_LABEL: Record<string, string> = { model: "Xe mới — theo hãng/model", vin: "Xe cũ — theo số VIN" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const fail = (errs: Record<string, string>): ParseResult => ({ ok: false, error: "Kiểm tra lại các ô được đánh dấu.", fieldErrors: errs });
const todayVn = (now: Date) => new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

function money(fd: FormInput, k: string, errs: Record<string, string>, allowZero: boolean): string {
  const raw = String(fd.get(k) ?? "").trim();
  if (!raw) { errs[k] = "Nhập số tiền"; return ""; }
  try {
    const v = parseVndInput(raw);
    if (v === null || v < 0n || (!allowZero && v === 0n)) { errs[k] = allowZero ? "Số tiền không âm" : "Số tiền phải lớn hơn 0"; return ""; }
    return v.toString();
  } catch {
    errs[k] = "Không hiểu số tiền. Ví dụ: 5tr, 1,5 triệu, 5.000.000";
    return "";
  }
}

export function normalizeVin(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

export function parseRuleForm(fd: FormInput): ParseResult {
  const errs: Record<string, string> = {};
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const requestId = s("request_id");
  if (!UUID.test(requestId)) return { ok: false, error: "Phiên nhập không hợp lệ, tải lại trang.", fieldErrors: {} };
  const scope = s("scope");
  if (!(scope in SCOPE_LABEL)) errs.scope = "Chọn xe mới hoặc xe cũ";
  const make = s("make_id"), model = s("model_id"), vin = normalizeVin(s("vin"));
  if (scope === "model") {
    if (!UUID.test(make)) errs.make_id = "Chọn hãng xe";
    if (model && !UUID.test(model)) errs.model_id = "Model không hợp lệ";
  }
  if (scope === "vin" && !/^[A-Z0-9]{5,20}$/.test(vin)) errs.vin = "Nhập đúng số VIN (chữ và số, 5–20 ký tự)";
  const amount = money(fd, "amount", errs, true);
  const from = s("effective_from");
  if (!DATE.test(from)) errs.effective_from = "Nhập ngày bắt đầu áp dụng";
  if (Object.keys(errs).length) return fail(errs);
  return { ok: true, payload: { request_id: requestId, scope, make_id: scope === "model" ? make : "", model_id: scope === "model" ? model : "", vin: scope === "vin" ? vin : "", amount, effective_from: from, note: s("note") } };
}

export function parseCommissionPaymentForm(fd: FormInput, now = new Date()): ParseResult {
  const errs: Record<string, string> = {};
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const requestId = s("request_id"), entry = s("entry_id");
  if (!UUID.test(requestId) || !UUID.test(entry)) return { ok: false, error: "Phiên nhập không hợp lệ, tải lại trang.", fieldErrors: {} };
  const amount = money(fd, "amount", errs, false);
  if (!UUID.test(s("account_id"))) errs.account_id = "Chọn tài khoản tiền";
  const date = s("paid_on");
  if (date && !DATE.test(date)) errs.paid_on = "Ngày không hợp lệ";
  else if (date && date > todayVn(now)) errs.paid_on = "Ngày chi không ở tương lai";
  if (Object.keys(errs).length) return fail(errs);
  return { ok: true, payload: { request_id: requestId, entry_id: entry, amount, paid_on: date, account_id: s("account_id"), reference: s("reference"), note: s("note") } };
}
