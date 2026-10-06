/** Đổi lỗi database thành câu tiếng Việt dễ hiểu cho nhân viên (không lộ chi tiết kỹ thuật). */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  demands_next_action_required: "Nhu cầu đang xử lý phải có việc tiếp theo và hạn thực hiện.",
  demands_owner_required: "Nhu cầu đang hoạt động phải có người phụ trách.",
  demands_close_reason: "Đóng nhu cầu phải ghi lý do.",
  demands_pause_reason: "Tạm dừng nhu cầu phải ghi lý do.",
  demands_budget_range: "Ngân sách tối thiểu không được lớn hơn tối đa.",
  demands_year_range: "Năm bắt đầu không được lớn hơn năm kết thúc.",
  demands_status_valid: "Trạng thái không hợp lệ với loại nhu cầu.",
  vehicles_vin_key: "Số VIN này đã có trong hệ thống.",
  consignment_dates_order: "Ngày kết thúc ký gửi không được trước ngày bắt đầu.",
  consignment_proxy_note: "Khai là người được ủy quyền thì phải ghi thông tin ủy quyền.",
  consignment_terms_fee_shape: "Phí ký gửi: chọn số tiền cố định HOẶC phần trăm trên giá bán, và nhập đúng một loại.",
  consignment_terms_discount_shape: "Quyền giảm giá: nhập đúng giá trị của loại đã chọn.",
  consignment_terms_fee_percent_check: "Tỷ lệ phí ký gửi phải từ 0 đến 100%.",
  vehicle_capital_terms_company_rate_check: "Tỷ lệ công ty phải từ 0 đến 100%.",
  vehicle_capital_shares_ratio_percent_check: "Tỷ lệ của mỗi bên góp vốn phải lớn hơn 0% và tối đa 100%.",
  vehicle_capital_shares_pkey: "Một bên góp vốn bị chọn trùng trong điều khoản.",
  vehicle_loan_payments_amount_check: "Số tiền thanh toán phải lớn hơn 0.",
  vehicle_reservations_one_active: "Xe vừa được người khác giữ hoặc đặt cọc. Không thể giữ/cọc thêm.",
  reservations_hold_shape: "Giữ xe phải có hạn giữ; đặt cọc phải có số tiền cọc (và không có cả hai kiểu cùng lúc).",
  vehicle_reservations_deposit_amount_check: "Số tiền cọc phải lớn hơn 0.",
  quotes_one_open: "Đã có báo giá đang mở cho khách và xe này. Lập phiên bản mới thay vì báo giá mới.",
  quote_versions_reject_reason: "Từ chối phiên bản báo giá phải ghi lý do.",
  quote_versions_approved_complete: "Giá báo thấp hơn mức cho phép phải có người duyệt và lý do duyệt.",
  quote_versions_offered_price_check: "Giá báo phải lớn hơn 0.",
  consignment_one_open_per_vehicle: "Xe này đã có hợp đồng ký gửi đang soạn hoặc đang hiệu lực.",
};

export function friendlyError(err: unknown): string {
  const e = err as { message?: string; code?: string; details?: string } | null;
  const msg = e?.message ?? "";
  for (const [k, v] of Object.entries(CONSTRAINT_MESSAGES)) if (msg.includes(k)) return v;
  if (e?.code === "42501" || /row-level security|permission denied/i.test(msg)) {
    return /Chỉ |quyền/.test(msg) && !/row-level|permission denied/i.test(msg) ? msg : "Anh/chị không có quyền thực hiện thao tác này.";
  }
  if (e?.code === "40001") return msg || "Dữ liệu vừa được người khác cập nhật. Tải lại trang để xem bản mới nhất.";
  if (e?.code === "22023" || e?.code === "P0001") return msg;
  if (/Không |Thiếu |phải /.test(msg)) return msg;
  return "Không lưu được. Vui lòng thử lại; nếu vẫn lỗi hãy báo quản trị.";
}
