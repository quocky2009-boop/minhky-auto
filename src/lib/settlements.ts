/**
 * Quyết toán xe: nhãn, đọc form, tóm tắt. Thuần TypeScript, kiểm thử được.
 * Mọi số tiền do DATABASE tính (một nguồn); ở đây chỉ hiển thị, kiểm tra đầu vào và tính tổng bằng BigInt.
 * Quy trình: tạm tính → kiểm tra → phê duyệt → thanh toán; điều chỉnh khi có chi phí muộn (không sửa bản đã duyệt).
 */
import { parseVndInput } from "@/lib/money";
import type { FormInput, ParseResult } from "@/lib/costs";

export const SETTLEMENT_STATUS_LABEL: Record<string, string> = {
  provisional: "Tạm tính", checked: "Đã kiểm tra", approved: "Đã phê duyệt", cancelled: "Đã hủy", superseded: "Đã được điều chỉnh thay thế",
};
export const SETTLEMENT_KIND_LABEL: Record<string, string> = { owned: "Xe showroom sở hữu (chia lợi nhuận)", consignment: "Xe ký gửi (trả chủ xe)" };
export const LINE_KIND_LABEL: Record<string, string> = {
  capital_return: "Hoàn vốn", profit_share: "Chia lợi nhuận", company_operating: "Phần công ty cho vận hành", sale_collected: "Giá bán (thu hộ)",
  fee: "Phí ký gửi showroom hưởng", owner_cost: "Chi phí chủ xe chịu (khấu trừ)", owner_payout: "Trả chủ xe", owner_receivable: "Chủ xe nộp showroom",
};
/** Loại phiếu thu/chi tương ứng từng dòng nghĩa vụ. */
export const LINE_PURPOSE: Record<string, string> = {
  capital_return: "settle_capital_return", profit_share: "settle_profit_payout", owner_payout: "settle_owner_payout", owner_receivable: "settle_owner_receipt",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (errs: Record<string, string>): ParseResult => ({ ok: false, error: "Kiểm tra lại các ô được đánh dấu.", fieldErrors: errs });
const badSession: ParseResult = { ok: false, error: "Phiên nhập không hợp lệ, tải lại trang.", fieldErrors: {} };

export function parseCreateForm(fd: FormInput): ParseResult {
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  if (!UUID.test(s("request_id")) || !UUID.test(s("order_line_id"))) return badSession;
  return { ok: true, payload: { request_id: s("request_id"), order_line_id: s("order_line_id"), note: s("note") } };
}

export function parseReviseForm(fd: FormInput): ParseResult {
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  if (!UUID.test(s("request_id")) || !UUID.test(s("id"))) return badSession;
  if (!s("reason")) return fail({ reason: "Ghi lý do điều chỉnh (ví dụ chi phí phát sinh muộn)" });
  return { ok: true, payload: { request_id: s("request_id"), settlement_id: s("id"), reason: s("reason"), note: s("note") } };
}

/** Xe hòa vốn/lỗ: cách xử lý + số hoàn vốn từng bên (ô returns_<partyId>). Không có giá trị mặc định. */
export function parseLossForm(fd: FormInput, partyIds: string[]): ParseResult {
  const errs: Record<string, string> = {};
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  if (!s("decision")) errs.decision = "Ghi cách xử lý hòa vốn/lỗ đã thống nhất";
  const returns: { party_id: string; amount: string }[] = [];
  for (const id of partyIds) {
    const raw = s(`returns_${id}`);
    try {
      const v = parseVndInput(raw);
      if (v === null) errs[`returns_${id}`] = "Nhập số hoàn vốn (0 nếu không hoàn)";
      else if (v < 0n) errs[`returns_${id}`] = "Số tiền không âm";
      else returns.push({ party_id: id, amount: v.toString() });
    } catch { errs[`returns_${id}`] = "Không hiểu số tiền. Ví dụ: 91tr"; }
  }
  if (Object.keys(errs).length) return fail(errs);
  return { ok: true, payload: { decision: s("decision"), returns } };
}

export type LineLike = { amount: string | number | bigint; direction: "out" | "in" | "none"; kind: string };

/** Tổng tiền thật phải chi / phải thu của quyết toán (BigInt), không gồm dòng nội bộ. */
export function settlementCash(lines: LineLike[]) {
  let out = 0n, inn = 0n;
  for (const l of lines) {
    const a = BigInt(String(l.amount).split(".")[0]);
    if (l.direction === "out") out += a; else if (l.direction === "in") inn += a;
  }
  return { out, in: inn, net: inn - out };
}
