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
  sales_order_lines_one_active_vehicle: "Xe này đã nằm trong một đơn bán khác đang hiệu lực.",
  sales_order_lines_one_active_quote: "Báo giá này đã được dùng cho một đơn bán khác.",
  sales_orders_confirmed_complete: "Xác nhận đơn bán cần số hợp đồng bán và ngày ký.",
  sales_orders_cancel_complete: "Hủy đơn bán phải ghi lý do.",
  sales_order_lines_sale_price_check: "Giá bán phải lớn hơn 0.",
  voucher_links: "Phiếu phải gắn đúng đối tượng theo loại (cọc ↔ đặt cọc, thanh toán ↔ đơn bán, thu/chi khác không gắn).",
  voucher_direction_purpose: "Loại phiếu không khớp hướng thu/chi.",
  cash_vouchers_amount_check: "Số tiền phiếu phải lớn hơn 0.",
  money_accounts_name_key: "Đã có tài khoản tiền trùng tên.",
  trade_ins_loan_within_value: "Khoản vay trả ngân hàng không được lớn hơn giá mua xe cũ.",
  trade_ins_loan_bank_required: "Xe còn vay thì phải ghi ngân hàng.",
  trade_ins_one_active_vehicle: "Xe cũ này đã nằm trong một hồ sơ thu cũ đổi mới khác chưa hủy.",
  trade_in_offsets_amount_check: "Số tiền đối trừ phải lớn hơn 0.",
  handovers_delivered_complete: "Giao xe cần ngày giao, người nhận, quan hệ, ODO và số chìa khóa.",
  handovers_cancel_complete: "Hủy bàn giao phải ghi lý do.",
  handovers_order_line_id_key: "Dòng xe này đã có bàn giao.",
  handover_items_holder_required: "Có bản gốc thì phải ghi người giữ.",
  handover_exceptions_one_active: "Đã có phê duyệt ngoại lệ hiệu lực cùng loại cho bàn giao này.",
  settlements_one_open: "Dòng xe này đang có một quyết toán tạm tính/đã kiểm tra. Hủy bản đó nếu muốn tính lại.",
  settlements_revision_shape: "Điều chỉnh quyết toán phải ghi lý do.",
  settlement_lines_amount_check: "Số tiền của dòng quyết toán không được âm.",
  quotes_one_open: "Đã có báo giá đang mở cho khách và xe này. Lập phiên bản mới thay vì báo giá mới.",
  quote_versions_reject_reason: "Từ chối phiên bản báo giá phải ghi lý do.",
  quote_versions_approved_complete: "Giá báo thấp hơn mức cho phép phải có người duyệt và lý do duyệt.",
  quote_versions_offered_price_check: "Giá báo phải lớn hơn 0.",
  aftersales_commitments_limit: "Bảo hành phải có ngày hết hạn và/hoặc giới hạn km.",
  aftersales_commitments_range: "Ngày hết hạn không được trước ngày bắt đầu.",
  aftersales_commitments_void_complete: "Hủy cam kết/bảo hành phải ghi lý do.",
  aftersales_cases_next_required: "Phiếu đang xử lý phải có việc tiếp theo và hạn thực hiện.",
  aftersales_cases_resolved_complete: "Đóng phiếu phải ghi kết quả xử lý.",
  aftersales_cases_cancel_complete: "Hủy phiếu hậu mãi phải ghi lý do.",
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
