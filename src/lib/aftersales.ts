/**
 * Hậu mãi: nhãn, đọc form, trạng thái hạn. Thuần TypeScript, kiểm thử được.
 * Quyền, chuyển trạng thái, gợi ý trong/ngoài bảo hành và liên kết chi phí sau bán do DATABASE thực thi; ở đây chỉ báo lỗi sớm và hiển thị.
 */
import type { FormInput, ParseResult } from "@/lib/costs";

export const CASE_KIND_LABEL: Record<string, string> = { complaint: "Phản ánh", warranty_claim: "Yêu cầu bảo hành", service_request: "Yêu cầu dịch vụ", care_call: "Nhắc chăm sóc" };
export const CASE_STATUS_LABEL: Record<string, string> = { open: "Mới tiếp nhận", in_progress: "Đang xử lý", resolved: "Đã xử lý xong", cancelled: "Đã hủy" };
export const COMMITMENT_KIND_LABEL: Record<string, string> = { warranty: "Bảo hành", commitment: "Cam kết khác" };
export const COVERAGE_LABEL: Record<string, string> = {
  within: "Gợi ý: trong bảo hành/cam kết", outside: "Gợi ý: ngoài bảo hành/cam kết", unknown: "Chưa rõ: thiếu số km, cần xác minh",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const fail = (errs: Record<string, string>): ParseResult => ({ ok: false, error: "Kiểm tra lại các ô được đánh dấu.", fieldErrors: errs });
const todayVn = (now: Date) => new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
const reader = (fd: FormInput) => (k: string) => String(fd.get(k) ?? "").trim();

export type DueState = "overdue" | "today" | "upcoming" | "none";
/** Hạn xử lý so với hôm nay (giờ Việt Nam). Phiếu đã đóng hoặc không có hạn → none. */
export function dueState(status: string, nextDue: string | null, now = new Date()): DueState {
  if (!nextDue || (status !== "open" && status !== "in_progress")) return "none";
  const t = todayVn(now);
  return nextDue < t ? "overdue" : nextDue === t ? "today" : "upcoming";
}

export function parseCommitmentForm(fd: FormInput): ParseResult {
  const s = reader(fd), errs: Record<string, string> = {};
  const requestId = s("request_id"), line = s("order_line_id");
  if (!UUID.test(requestId) || !UUID.test(line)) return { ok: false, error: "Phiên nhập không hợp lệ, tải lại trang.", fieldErrors: {} };
  const kind = s("kind");
  if (!(kind in COMMITMENT_KIND_LABEL)) errs.kind = "Chọn bảo hành hoặc cam kết khác";
  if (!s("title")) errs.title = "Ghi tên cam kết/bảo hành";
  const starts = s("starts_on"), ends = s("ends_on"), odo = s("odo_limit");
  if (!DATE.test(starts)) errs.starts_on = "Nhập ngày bắt đầu";
  if (ends && !DATE.test(ends)) errs.ends_on = "Ngày không hợp lệ";
  if (DATE.test(starts) && DATE.test(ends) && ends < starts) errs.ends_on = "Ngày hết hạn không được trước ngày bắt đầu";
  if (odo && !/^[1-9]\d{0,6}$/.test(odo)) errs.odo_limit = "Giới hạn km là số nguyên dương";
  if (kind === "warranty" && !ends && !odo) errs.ends_on = "Bảo hành phải có ngày hết hạn và/hoặc giới hạn km";
  if (Object.keys(errs).length) return fail(errs);
  return { ok: true, payload: { request_id: requestId, order_line_id: line, kind, title: s("title"), details: s("details"), starts_on: starts, ends_on: ends, odo_limit: odo } };
}

export function parseCaseForm(fd: FormInput, now = new Date()): ParseResult {
  const s = reader(fd), errs: Record<string, string> = {};
  const requestId = s("request_id"), line = s("order_line_id");
  if (!UUID.test(requestId) || !UUID.test(line)) return { ok: false, error: "Phiên nhập không hợp lệ, tải lại trang.", fieldErrors: {} };
  const kind = s("kind");
  if (!(kind in CASE_KIND_LABEL)) errs.kind = "Chọn loại phiếu";
  if (!s("title")) errs.title = "Ghi nội dung chính của phiếu";
  const received = s("received_on"), odo = s("odo_at_case"), due = s("next_due");
  if (received && !DATE.test(received)) errs.received_on = "Ngày không hợp lệ";
  else if (received && received > todayVn(now)) errs.received_on = "Ngày tiếp nhận không ở tương lai";
  if (odo && !/^\d{1,7}$/.test(odo)) errs.odo_at_case = "Số km là số nguyên";
  if (!s("next_action")) errs.next_action = "Ghi việc tiếp theo";
  if (!DATE.test(due)) errs.next_due = "Nhập hạn thực hiện";
  else if (due < todayVn(now)) errs.next_due = "Hạn không được trong quá khứ";
  const commitment = s("commitment_id"), assignee = s("assigned_to");
  if (commitment && !UUID.test(commitment)) errs.commitment_id = "Cam kết không hợp lệ";
  if (assignee && !UUID.test(assignee)) errs.assigned_to = "Người phụ trách không hợp lệ";
  if (Object.keys(errs).length) return fail(errs);
  return { ok: true, payload: { request_id: requestId, order_line_id: line, kind, title: s("title"), description: s("description"), received_on: received, odo_at_case: odo, commitment_id: commitment, assigned_to: assignee, next_action: s("next_action"), next_due: due } };
}

export function parseNextForm(fd: FormInput, now = new Date()): ParseResult {
  const s = reader(fd), errs: Record<string, string> = {};
  const due = s("next_due"), assignee = s("assigned_to");
  if (!s("next_action")) errs.next_action = "Ghi việc tiếp theo";
  if (!DATE.test(due)) errs.next_due = "Nhập hạn thực hiện";
  else if (due < todayVn(now)) errs.next_due = "Hạn không được trong quá khứ";
  if (assignee && !UUID.test(assignee)) errs.assigned_to = "Người phụ trách không hợp lệ";
  if (Object.keys(errs).length) return fail(errs);
  return { ok: true, payload: { next_action: s("next_action"), next_due: due, assigned_to: assignee } };
}

export function parseEventForm(fd: FormInput): ParseResult {
  const s = reader(fd), errs: Record<string, string> = {};
  const kind = s("event_kind"), caseId = s("case_id");
  if (!UUID.test(caseId)) return { ok: false, error: "Thiếu thông tin phiếu.", fieldErrors: {} };
  if (kind !== "note" && kind !== "contact") errs.event_kind = "Chọn ghi chú hoặc liên hệ khách";
  if (!s("content")) errs.content = "Nhập nội dung";
  if (Object.keys(errs).length) return fail(errs);
  return { ok: true, payload: { case_id: caseId, kind, content: s("content") } };
}
