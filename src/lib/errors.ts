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
