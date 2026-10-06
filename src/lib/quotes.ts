/**
 * Báo giá có phiên bản: nhãn, đọc form. Thuần TypeScript, kiểm thử được.
 * Việc có CẦN DUYỆT hay không do DATABASE quyết định (so với giá sàn / quyền giảm giá) — màn hình không tự tính và không biết giá sàn.
 * Hạn hiệu lực do người lập nhập — KHÔNG có hạn mặc định.
 */
import { parseVndInput } from "@/lib/money";
import { fromLocalInput } from "@/lib/dates";
import type { FormInput, ParseResult } from "@/lib/costs";

export const QUOTE_STATUS_LABEL: Record<string, string> = { open: "Đang mở", accepted: "Khách đã chấp nhận", cancelled: "Đã hủy" };
export const QUOTE_VERSION_STATUS_LABEL: Record<string, string> = {
  pending_approval: "Chờ quản lý duyệt", issued: "Đã phát hành", rejected: "Bị từ chối", superseded: "Đã thay bằng bản mới", accepted: "Khách đã chấp nhận", cancelled: "Đã hủy",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (errs: Record<string, string>): ParseResult => ({ ok: false, error: "Kiểm tra lại các ô được đánh dấu.", fieldErrors: errs });
const badSession: ParseResult = { ok: false, error: "Phiên nhập không hợp lệ, tải lại trang.", fieldErrors: {} };

/** Dùng chung cho lập báo giá mới (create) và phiên bản mới (revise). */
export function parseQuoteForm(fd: FormInput, mode: "create" | "revise", now = new Date()): ParseResult {
  const errs: Record<string, string> = {};
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const requestId = s("request_id");
  if (!UUID.test(requestId)) return badSession;
  const payload: Record<string, unknown> = { request_id: requestId, benefits: s("benefits"), note: s("note") };
  if (mode === "create") {
    const versionRequestId = s("version_request_id"), vehicleId = s("vehicle_id"), demandId = s("demand_id");
    if (!UUID.test(versionRequestId) || !UUID.test(vehicleId)) return badSession;
    if (!UUID.test(demandId)) errs.demand_id = "Chọn nhu cầu mua của khách";
    Object.assign(payload, { version_request_id: versionRequestId, vehicle_id: vehicleId, demand_id: demandId });
  }
  try {
    const price = parseVndInput(s("offered_price"));
    if (price === null || price <= 0n) errs.offered_price = "Nhập giá báo cho khách (lớn hơn 0)";
    else payload.offered_price = price.toString();
  } catch { errs.offered_price = "Không hiểu số tiền. Ví dụ: 650tr, 650.000.000"; }
  const until = s("valid_until");
  if (!until) errs.valid_until = "Nhập hạn hiệu lực báo giá (không có hạn mặc định)";
  else {
    try {
      const iso = fromLocalInput(until);
      if (!iso) errs.valid_until = "Thời gian không hợp lệ";
      else if (new Date(iso).getTime() <= now.getTime()) errs.valid_until = "Hạn phải ở tương lai";
      else payload.valid_until = iso;
    } catch { errs.valid_until = "Thời gian không hợp lệ"; }
  }
  if (Object.keys(errs).length) return fail(errs);
  return { ok: true, payload };
}

/** Phiên bản còn hạn và ở trạng thái đã phát hành (chấp nhận được). */
export function isAcceptable(v: { status: string; valid_until: string }, now = new Date()): boolean {
  return v.status === "issued" && new Date(v.valid_until).getTime() > now.getTime();
}
export function isExpiredVersion(v: { status: string; valid_until: string }, now = new Date()): boolean {
  return (v.status === "issued" || v.status === "pending_approval") && new Date(v.valid_until).getTime() <= now.getTime();
}
