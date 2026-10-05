/**
 * Chi phí chuẩn bị xe: nhãn hiển thị + đọc form. Thuần TypeScript, kiểm thử được.
 * Ba thông tin tách biệt: dự toán (kế hoạch) / số thực tế đã xác nhận / tiền đã thanh toán.
 */
import { parseVndInput } from "@/lib/money";

export type FormInput = { get(name: string): unknown; getAll(name: string): unknown[] };
export type ParseResult<T = Record<string, unknown>> =
  | { ok: true; payload: T }
  | { ok: false; error: string; fieldErrors: Record<string, string> };

export const COST_CATEGORY_LABEL: Record<string, string> = {
  repair: "Sửa chữa", detailing: "Spa / làm đẹp", accessories: "Phụ kiện", paperwork: "Giấy tờ / sang tên",
  transport: "Vận chuyển", inspection: "Kiểm định / thẩm định", other: "Khác",
};
export const COST_STATUS_LABEL: Record<string, string> = { estimated: "Dự kiến", confirmed: "Đã xác nhận", void: "Đã hủy" };
export const PAYMENT_METHOD_LABEL: Record<string, string> = { cash: "Tiền mặt", transfer: "Chuyển khoản", other: "Khác" };
export const BORNE_BY_LABEL: Record<string, string> = { showroom: "Showroom chịu", owner: "Chủ xe chịu" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function reader(fd: FormInput, errs: Record<string, string>) {
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  return {
    s,
    /** Ô trống -> "" (chưa rõ). Số sai -> báo lỗi. */
    money: (k: string) => {
      try {
        const v = parseVndInput(s(k));
        return v === null ? "" : v.toString();
      } catch {
        errs[k] = "Không hiểu số tiền. Ví dụ: 650tr, 1,2 tỷ, 650.000";
        return "";
      }
    },
  };
}

export function parseCostCreate(fd: FormInput, businessType: string): ParseResult {
  const errs: Record<string, string> = {};
  const r = reader(fd, errs);
  const category = r.s("category");
  if (!(category in COST_CATEGORY_LABEL)) errs.category = "Chọn loại chi phí";
  if (!r.s("description")) errs.description = "Mô tả công việc/khoản chi";
  const borne = r.s("borne_by");
  if (businessType === "consignment" && !["showroom", "owner"].includes(borne)) errs.borne_by = "Xe ký gửi: chọn bên chịu chi phí";
  if (businessType !== "consignment" && borne === "owner") errs.borne_by = "Xe showroom sở hữu: showroom chịu chi phí";
  const requestId = r.s("request_id"), vehicleId = r.s("vehicle_id");
  if (!UUID.test(requestId) || !UUID.test(vehicleId)) return { ok: false, error: "Phiên nhập không hợp lệ, tải lại trang.", fieldErrors: {} };
  const payload: Record<string, unknown> = {
    request_id: requestId, vehicle_id: vehicleId, category, description: r.s("description"), vendor: r.s("vendor"),
    estimated_amount: r.money("estimated_amount"),
  };
  if (businessType === "consignment") payload.borne_by = borne;
  if (UUID.test(r.s("replaces_cost_id"))) payload.replaces_cost_id = r.s("replaces_cost_id");
  if (Object.keys(errs).length) return { ok: false, error: "Kiểm tra lại các ô được đánh dấu.", fieldErrors: errs };
  return { ok: true, payload };
}

export function parseCostUpdate(fd: FormInput, businessType: string): ParseResult {
  const errs: Record<string, string> = {};
  const r = reader(fd, errs);
  if (!r.s("description")) errs.description = "Mô tả công việc/khoản chi";
  const category = r.s("category");
  if (category && !(category in COST_CATEGORY_LABEL)) errs.category = "Loại chi phí không hợp lệ";
  const payload: Record<string, unknown> = { category, description: r.s("description"), vendor: r.s("vendor"), estimated_amount: r.money("estimated_amount") };
  if (businessType === "consignment") {
    const borne = r.s("borne_by");
    if (!["showroom", "owner"].includes(borne)) errs.borne_by = "Chọn bên chịu chi phí";
    payload.borne_by = borne;
  }
  if (Object.keys(errs).length) return { ok: false, error: "Kiểm tra lại các ô được đánh dấu.", fieldErrors: errs };
  return { ok: true, payload };
}

/** Xác nhận số thực tế: bắt buộc nhập số (0 hợp lệ = không phát sinh), để trống bị chặn vì "chưa rõ" không phải 0. */
export function parseConfirm(fd: FormInput): ParseResult {
  const errs: Record<string, string> = {};
  const r = reader(fd, errs);
  const amount = r.money("confirmed_amount");
  if (!errs.confirmed_amount && amount === "") errs.confirmed_amount = "Nhập số tiền thực tế (nhập 0 nếu không phát sinh)";
  if (Object.keys(errs).length) return { ok: false, error: "Kiểm tra lại các ô được đánh dấu.", fieldErrors: errs };
  return { ok: true, payload: { confirmed_amount: amount, accepted_note: r.s("accepted_note") } };
}

export function parsePayment(fd: FormInput): ParseResult {
  const errs: Record<string, string> = {};
  const r = reader(fd, errs);
  const amount = r.money("amount");
  if (!errs.amount && (amount === "" || BigInt(amount) <= BigInt(0))) errs.amount = "Số tiền thanh toán phải lớn hơn 0";
  const method = r.s("method");
  if (!(method in PAYMENT_METHOD_LABEL)) errs.method = "Chọn hình thức thanh toán";
  const paidAt = r.s("paid_at");
  if (paidAt && !/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) errs.paid_at = "Ngày không hợp lệ";
  const requestId = r.s("request_id"), costId = r.s("cost_id");
  if (!UUID.test(requestId) || !UUID.test(costId)) return { ok: false, error: "Phiên nhập không hợp lệ, tải lại trang.", fieldErrors: {} };
  if (Object.keys(errs).length) return { ok: false, error: "Kiểm tra lại các ô được đánh dấu.", fieldErrors: errs };
  return { ok: true, payload: { request_id: requestId, cost_id: costId, amount, method, paid_at: paidAt, reference: r.s("reference"), note: r.s("note") } };
}

/** Còn phải trả = đã xác nhận − đã thanh toán (chỉ khi có số xác nhận; không có thì "chưa rõ", không phải 0). */
export function outstanding(confirmed: bigint | null, paid: bigint | null): bigint | null {
  return confirmed === null ? null : confirmed - (paid ?? BigInt(0));
}
