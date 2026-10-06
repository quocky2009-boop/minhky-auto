/**
 * Bàn giao xe và hồ sơ: nhãn, đọc form, tóm tắt điều kiện giao xe. Thuần TypeScript, kiểm thử được.
 * Điều kiện giao xe và phê duyệt ngoại lệ do DATABASE thực thi; ở đây chỉ báo lỗi sớm và hiển thị.
 * Không tải giấy tờ lên (D37): "bản scan" chỉ ghi có/không.
 */
import type { FormInput, ParseResult } from "@/lib/costs";

export const HANDOVER_STATUS_LABEL: Record<string, string> = { preparing: "Đang chuẩn bị", delivered: "Đã giao xe", cancelled: "Đã hủy" };
export const ITEM_STATE_LABEL: Record<string, string> = { pending: "Chưa kiểm", ok: "Đạt / đã có", na: "Không áp dụng", missing: "Thiếu" };
export const HOLDER_LABEL: Record<string, string> = { showroom: "Showroom giữ", customer: "Khách giữ", bank: "Ngân hàng giữ", owner: "Chủ xe giữ", other: "Bên khác" };
export const EXCEPTION_LABEL: Record<string, string> = { payment: "Chưa thanh toán đủ", prep: "Xe chưa chuẩn bị xong", paperwork: "Hồ sơ xe chưa đủ", checklist: "Checklist chưa đạt" };
export const RELATION_LABEL: Record<string, string> = { customer: "Chính khách", proxy: "Người nhận thay" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const fail = (errs: Record<string, string>): ParseResult => ({ ok: false, error: "Kiểm tra lại các ô được đánh dấu.", fieldErrors: errs });
const todayVn = (now: Date) => new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

export function parseItemForm(fd: FormInput): ParseResult {
  const errs: Record<string, string> = {};
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const state = s("state");
  if (!(state in ITEM_STATE_LABEL)) errs.state = "Chọn trạng thái";
  const original = fd.get("has_original") === "on" || fd.get("has_original") === "true";
  const scan = fd.get("has_scan") === "on" || fd.get("has_scan") === "true";
  const holder = s("holder");
  if (state === "pending" && (original || scan || holder)) errs.state = "Mục chưa kiểm không có bản gốc/bản scan/người giữ";
  if (state === "na" && original) errs.has_original = "Mục không áp dụng không có bản gốc";
  if (original && !(holder in HOLDER_LABEL)) errs.holder = "Chọn người giữ bản gốc";
  if (holder && !(holder in HOLDER_LABEL)) errs.holder = "Người giữ không hợp lệ";
  if (state === "missing" && !s("note")) errs.note = "Mục thiếu phải ghi chú lý do/hướng xử lý";
  if (Object.keys(errs).length) return fail(errs);
  return { ok: true, payload: { state, has_original: original, has_scan: scan, holder: state === "pending" ? "" : holder, note: s("note") } };
}

export function parseDeliverForm(fd: FormInput, now = new Date()): ParseResult {
  const errs: Record<string, string> = {};
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const date = s("delivered_on");
  if (!DATE.test(date)) errs.delivered_on = "Nhập ngày giao xe";
  else if (date > todayVn(now)) errs.delivered_on = "Ngày giao xe không ở tương lai";
  if (!s("received_by_name")) errs.received_by_name = "Ghi người nhận xe";
  if (!(s("received_relation") in RELATION_LABEL)) errs.received_relation = "Chọn chính khách hay người nhận thay";
  const odo = s("odo"), keys = s("keys_given");
  if (!/^\d{1,7}$/.test(odo)) errs.odo = "Nhập số ODO (số nguyên, km)";
  if (!/^\d{1,3}$/.test(keys)) errs.keys_given = "Nhập số chìa khóa giao";
  if (Object.keys(errs).length) return fail(errs);
  return { ok: true, payload: { delivered_on: date, received_by_name: s("received_by_name"), received_relation: s("received_relation"), odo, keys_given: keys, note: s("note") } };
}

export type Readiness = { contract_ok: boolean; payment_ok: boolean; prep_ok: boolean; paperwork_ok: boolean; checklist_ok: boolean; pending_required: number; waived: string[] };

/** Điều kiện giao xe còn thiếu và đã được ngoại lệ miễn hay chưa. Hợp đồng chưa ký không miễn được. */
export function readinessSummary(r: Readiness) {
  const items = [
    { kind: "payment", ok: r.payment_ok, label: "Thanh toán đủ" },
    { kind: "prep", ok: r.prep_ok, label: "Xe đã chuẩn bị xong" },
    { kind: "paperwork", ok: r.paperwork_ok, label: "Hồ sơ xe đủ" },
    { kind: "checklist", ok: r.checklist_ok, label: r.checklist_ok ? "Checklist bắt buộc đã đạt" : `Còn ${r.pending_required} mục bắt buộc chưa đạt` },
  ].map((x) => ({ ...x, waived: !x.ok && r.waived.includes(x.kind) }));
  const blocking = items.filter((x) => !x.ok && !x.waived);
  return { items, canDeliver: r.contract_ok && blocking.length === 0, contractOk: r.contract_ok, blocking };
}

export function parseExceptionForm(fd: FormInput): ParseResult {
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const errs: Record<string, string> = {};
  if (!(s("kind") in EXCEPTION_LABEL)) errs.kind = "Chọn loại điều kiện được miễn";
  if (!s("reason")) errs.reason = "Ghi lý do phê duyệt ngoại lệ";
  if (!UUID.test(s("request_id")) || !UUID.test(s("handover_id"))) return { ok: false, error: "Phiên nhập không hợp lệ, tải lại trang.", fieldErrors: {} };
  if (Object.keys(errs).length) return fail(errs);
  return { ok: true, payload: { request_id: s("request_id"), handover_id: s("handover_id"), kind: s("kind"), reason: s("reason") } };
}
