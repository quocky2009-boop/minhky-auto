/**
 * Hợp đồng ký gửi: nhãn hiển thị, đọc form, tính phí xem trước. Thuần TypeScript, kiểm thử được.
 * Phí showroom hưởng (đã chốt 05/10/2026): SỐ TIỀN CỐ ĐỊNH hoặc PHẦN TRĂM TRÊN GIÁ BÁN, chọn riêng cho từng xe, không có mặc định.
 * Chi phí phát sinh của xe ký gửi không cần chủ xe duyệt (chỉ ghi bên chịu chi phí ở phần chi phí xe).
 * Database là nơi có thẩm quyền (hàm private.consignment_fee); phần tính ở đây chỉ để xem trước và phải khớp (có test).
 */
import { parseVndInput, toVnd, type Vnd } from "@/lib/money";
import type { FormInput, ParseResult } from "@/lib/costs";

export const CONTRACT_STATUS_LABEL: Record<string, string> = { draft: "Đang soạn", active: "Đang hiệu lực", returned: "Đã trả xe", cancelled: "Đã hủy" };
export const FEE_TYPE_LABEL: Record<string, string> = { fixed: "Số tiền cố định", percent_of_sale_price: "Phần trăm trên giá bán" };
export const DISCOUNT_TYPE_LABEL: Record<string, string> = { none: "Không được giảm (phải hỏi chủ xe)", amount: "Giảm tối đa một số tiền", percent: "Giảm tối đa một tỷ lệ % giá chào" };
export const PARTY_LABEL: Record<string, string> = { showroom: "Showroom", owner: "Chủ xe" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PCT_SCALE = 10_000n; // phần trăm lưu tối đa 4 chữ số thập phân (numeric(7,4))

/** "3", "3%", "2,5 %" -> "3", "2.5". Rỗng -> "". Ngoài 0–100 hoặc quá 4 số lẻ -> lỗi (ném). */
export function parsePercent(raw: string | null | undefined): string {
  const s = (raw ?? "").trim().replace(/%/g, "").trim().replace(",", ".");
  if (!s) return "";
  if (!/^\d{1,3}(\.\d{1,4})?$/.test(s)) throw new Error(`Không hiểu tỷ lệ "${raw}"`);
  const [i, f = ""] = s.split(".");
  const scaled = BigInt(i) * PCT_SCALE + BigInt(f.padEnd(4, "0"));
  if (scaled > 100n * PCT_SCALE) throw new Error("Tỷ lệ tối đa 100%");
  return f ? `${BigInt(i)}.${f}` : BigInt(i).toString();
}

function pctToScaled(pct: string): bigint {
  const [i, f = ""] = pct.split(".");
  return BigInt(i) * PCT_SCALE + BigInt(f.padEnd(4, "0"));
}

export type FeeTerms = { fee_type: string; fee_fixed_amount: unknown; fee_percent: unknown };

/**
 * Phí ký gửi showroom hưởng khi bán với giá `salePrice`. Phần trăm làm tròn nửa lên đến 1 VND (khớp private.consignment_fee).
 * Trả null nếu thiếu số liệu để tính (không bao giờ coi thiếu là 0).
 */
export function computeConsignmentFee(t: FeeTerms, salePrice: Vnd): Vnd | null {
  if (t.fee_type === "fixed") return toVnd(t.fee_fixed_amount);
  if (t.fee_type === "percent_of_sale_price") {
    if (t.fee_percent === null || t.fee_percent === undefined || t.fee_percent === "") return null;
    const scaled = pctToScaled(String(t.fee_percent));
    const den = 100n * PCT_SCALE;
    return (salePrice * scaled + den / 2n) / den;
  }
  return null;
}

export type TermsRow = {
  id: string; version_no: number; owner_expected_amount: unknown; list_price: unknown;
  discount_limit_type: string; discount_limit_amount: unknown; discount_limit_percent: unknown;
  fee_type: string; fee_fixed_amount: unknown; fee_percent: unknown;
  buyer_contract_party: string; payment_collector: string; other_terms: string | null;
  signed_on: string | null; agreement_ref: string | null; created_at: string;
};

/** Thỏa thuận đang có hiệu lực = phiên bản ĐÃ KÝ mới nhất. Bản chưa ký chỉ là đề xuất. */
export function effectiveTerms<T extends { version_no: number; signed_on: string | null }>(all: T[]): T | null {
  const signed = all.filter((t) => t.signed_on).sort((a, b) => b.version_no - a.version_no);
  return signed[0] ?? null;
}

export type ContractDraft = {
  owner_phone: string | null; start_date: string | null; end_date: string | null; received_at: string | null; keys_count: number | null;
  documents_received: string | null; condition_at_receipt: string | null;
};

/** Những gì còn thiếu trước khi kích hoạt hợp đồng (khớp điều kiện ở database). Rỗng = có thể kích hoạt. */
export function activationGaps(c: ContractDraft, terms: { signed_on: string | null }[]): string[] {
  const gaps: string[] = [];
  const blank = (v: string | null) => v === null || v.trim() === "";
  if (!terms.some((t) => t.signed_on)) gaps.push("Thỏa thuận (giá, phí, quyền giảm giá) được chủ xe ký xác nhận");
  if (blank(c.owner_phone)) gaps.push("Số điện thoại chủ xe");
  if (blank(c.start_date) || blank(c.end_date)) gaps.push("Thời hạn ký gửi (từ ngày – đến ngày)");
  if (blank(c.received_at)) gaps.push("Ngày nhận xe");
  if (c.keys_count === null || c.keys_count === undefined) gaps.push("Số chìa khóa nhận (nhập 0 nếu không có)");
  if (blank(c.documents_received)) gaps.push("Giấy tờ đã nhận");
  if (blank(c.condition_at_receipt)) gaps.push("Tình trạng xe khi nhận");
  return gaps;
}

function reader(fd: FormInput, errs: Record<string, string>) {
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  return {
    s,
    money: (k: string) => {
      try { const v = parseVndInput(s(k)); return v === null ? "" : v.toString(); }
      catch { errs[k] = "Không hiểu số tiền. Ví dụ: 650tr, 1,2 tỷ, 650.000"; return ""; }
    },
    pct: (k: string) => {
      try { return parsePercent(s(k)); }
      catch (e) { errs[k] = e instanceof Error ? e.message : "Tỷ lệ không hợp lệ"; return ""; }
    },
    date: (k: string) => { const v = s(k); if (v && !DATE.test(v)) errs[k] = "Ngày không hợp lệ"; return v; },
    count: (k: string) => {
      const v = s(k);
      if (!v) return "";
      if (!/^\d{1,2}$/.test(v)) { errs[k] = "Nhập số nguyên từ 0 đến 99"; return ""; }
      return v;
    },
  };
}
const fail = (errs: Record<string, string>): ParseResult => ({ ok: false, error: "Kiểm tra lại các ô được đánh dấu.", fieldErrors: errs });

/** Hợp đồng: chỉ bắt buộc tên chủ xe khi lập nháp; phần còn lại có thể bổ sung dần nhưng phải đủ trước khi kích hoạt. */
export function parseContractForm(fd: FormInput, mode: "create" | "update"): ParseResult {
  const errs: Record<string, string> = {};
  const r = reader(fd, errs);
  if (!r.s("owner_name")) errs.owner_name = "Nhập họ tên chủ xe";
  const proxy = r.s("acts_by_proxy") === "on" || r.s("acts_by_proxy") === "true";
  if (proxy && !r.s("proxy_note")) errs.proxy_note = "Ghi thông tin giấy ủy quyền (số, người ủy quyền)";
  const start = r.date("start_date"), end = r.date("end_date");
  if (start && end && !errs.start_date && !errs.end_date && end < start) errs.end_date = "Ngày kết thúc không được trước ngày bắt đầu";
  const payload: Record<string, unknown> = {
    owner_name: r.s("owner_name"), owner_phone: r.s("owner_phone"), owner_id_number: r.s("owner_id_number"),
    acts_by_proxy: proxy, proxy_note: proxy ? r.s("proxy_note") : "",
    start_date: start, end_date: end, received_at: r.date("received_at"), keys_count: r.count("keys_count"),
    documents_received: r.s("documents_received"), condition_at_receipt: r.s("condition_at_receipt"), receipt_note: r.s("receipt_note"),
  };
  if (mode === "create") {
    const requestId = r.s("request_id"), vehicleId = r.s("vehicle_id");
    if (!UUID.test(requestId) || !UUID.test(vehicleId)) return { ok: false, error: "Phiên nhập không hợp lệ, tải lại trang.", fieldErrors: {} };
    payload.request_id = requestId; payload.vehicle_id = vehicleId;
  } else {
    // Sửa: ô không có trong form (ví dụ biên bản nhận xe đã chốt nên bị khóa) thì KHÔNG gửi, để database giữ nguyên.
    // Ô có mặt mà để trống nghĩa là xóa về "chưa ghi". Ô tích "ủy quyền" luôn có mặt trong form.
    for (const k of Object.keys(payload)) if (k !== "acts_by_proxy" && k !== "proxy_note" && fd.get(k) === null) delete payload[k];
  }
  if (Object.keys(errs).length) return fail(errs);
  return { ok: true, payload };
}

/** Thỏa thuận có phiên bản: đủ giá chủ muốn nhận, giá chào, quyền giảm giá, cách tính phí, bên ký/thu tiền. Không có mặc định cho phí. */
export function parseTermsForm(fd: FormInput): ParseResult {
  const errs: Record<string, string> = {};
  const r = reader(fd, errs);
  const requestId = r.s("request_id");
  if (!UUID.test(requestId)) return { ok: false, error: "Phiên nhập không hợp lệ, tải lại trang.", fieldErrors: {} };

  const expected = r.money("owner_expected_amount");
  if (!errs.owner_expected_amount && expected === "") errs.owner_expected_amount = "Nhập giá chủ xe muốn nhận";
  const list = r.money("list_price");
  if (!errs.list_price && (list === "" || BigInt(list) <= 0n)) errs.list_price = "Nhập giá chào lớn hơn 0";

  const discountType = r.s("discount_limit_type");
  const payload: Record<string, unknown> = { request_id: requestId, owner_expected_amount: expected, list_price: list };
  if (!(discountType in DISCOUNT_TYPE_LABEL)) errs.discount_limit_type = "Chọn quyền giảm giá";
  payload.discount_limit_type = discountType;
  if (discountType === "amount") {
    const v = r.money("discount_limit_amount");
    if (!errs.discount_limit_amount && v === "") errs.discount_limit_amount = "Nhập số tiền được giảm tối đa";
    payload.discount_limit_amount = v;
  } else if (discountType === "percent") {
    const v = r.pct("discount_limit_percent");
    if (!errs.discount_limit_percent && v === "") errs.discount_limit_percent = "Nhập tỷ lệ được giảm tối đa (%)";
    payload.discount_limit_percent = v;
  }

  const feeType = r.s("fee_type");
  if (!(feeType in FEE_TYPE_LABEL)) errs.fee_type = "Chọn cách tính phí ký gửi";
  payload.fee_type = feeType;
  if (feeType === "fixed") {
    const v = r.money("fee_fixed_amount");
    if (!errs.fee_fixed_amount && v === "") errs.fee_fixed_amount = "Nhập số tiền phí ký gửi";
    payload.fee_fixed_amount = v;
  } else if (feeType === "percent_of_sale_price") {
    const v = r.pct("fee_percent");
    if (!errs.fee_percent && v === "") errs.fee_percent = "Nhập tỷ lệ phí (% giá bán)";
    payload.fee_percent = v;
  }

  const buyer = r.s("buyer_contract_party"), collector = r.s("payment_collector");
  if (!(buyer in PARTY_LABEL)) errs.buyer_contract_party = "Chọn bên ký hợp đồng mua bán với người mua";
  if (!(collector in PARTY_LABEL)) errs.payment_collector = "Chọn bên thu tiền từ người mua";
  payload.buyer_contract_party = buyer; payload.payment_collector = collector;
  payload.other_terms = r.s("other_terms");
  payload.signed_on = r.date("signed_on");
  payload.agreement_ref = r.s("agreement_ref");
  if (Object.keys(errs).length) return fail(errs);
  return { ok: true, payload };
}

export function parseSignForm(fd: FormInput): ParseResult {
  const errs: Record<string, string> = {};
  const r = reader(fd, errs);
  const signed = r.date("signed_on");
  if (!signed) errs.signed_on = "Nhập ngày chủ xe ký";
  if (Object.keys(errs).length) return fail(errs);
  return { ok: true, payload: { signed_on: signed, agreement_ref: r.s("agreement_ref") } };
}

/** Biên bản trả xe: bắt buộc ngày, lý do, tình trạng, chìa khóa, giấy tờ trả lại. Ghi chú xử lý chi phí được database bắt buộc khi còn phần chủ xe chưa trả. */
export function parseReturnForm(fd: FormInput): ParseResult {
  const errs: Record<string, string> = {};
  const r = reader(fd, errs);
  const date = r.date("return_date");
  if (!date) errs.return_date = "Nhập ngày trả xe";
  if (!r.s("return_reason")) errs.return_reason = "Ghi lý do trả/rút xe";
  if (!r.s("return_condition")) errs.return_condition = "Ghi tình trạng xe khi trả";
  const keys = r.count("return_keys_count");
  if (!errs.return_keys_count && keys === "") errs.return_keys_count = "Nhập số chìa khóa trả lại (0 nếu không có)";
  if (!r.s("return_documents")) errs.return_documents = "Ghi giấy tờ trả lại (hoặc “không có”)";
  if (Object.keys(errs).length) return fail(errs);
  return { ok: true, payload: {
    return_date: date, return_reason: r.s("return_reason"), return_condition: r.s("return_condition"),
    return_keys_count: keys, return_documents: r.s("return_documents"), return_cost_note: r.s("return_cost_note") } };
}
